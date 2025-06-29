// app.js

// 1) Referencias en el DOM
const video        = document.getElementById('preview');
const canvas       = document.getElementById('canvas');
const btnCapture   = document.getElementById('btn-capture');
const btnIMG       = document.getElementById('btn-export-img');
const btnPDF       = document.getElementById('btn-export-pdf');
const btnBW        = document.getElementById('btn-bw');
const btnContrast  = document.getElementById('btn-contrast');
const btnOCR       = document.getElementById('btn-ocr');
const btnMerge     = document.getElementById('btn-merge');
const carousel     = document.getElementById('page-carousel');
const ocrResult    = document.getElementById('ocr-result');

let pages  = [];    // Array de canvases escaneados
let stream = null;  // MediaStream de la cámara

// 2) Al cargar OpenCV, arrancamos la vista previa y habilitamos “Capturar”
window.onOpenCvReady = async function() {
  btnCapture.disabled = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = stream;
    video.style.display = 'block';
    await video.play();
  } catch (err) {
    alert('No se pudo acceder a la cámara:\n' + err.message);
  }
};

// 3) Recorte con OpenCV
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) return inputCanvas;
  const src      = cv.imread(inputCanvas);
  const gray     = new cv.Mat();
  const edges    = new cv.Mat();
  const contours = new cv.MatVector();
  const hier     = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);
  const Mkernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, Mkernel);

  cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let maxArea = 0, bestCnt = null;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) { maxArea = area; bestCnt = cnt; }
  }
  if (!bestCnt) {
    src.delete(); gray.delete(); edges.delete(); contours.delete(); hier.delete(); Mkernel.delete();
    return inputCanvas;
  }

  const rotRect = cv.minAreaRect(bestCnt);
  const boxPts  = cv.RotatedRect.points(rotRect);
  const srcPts  = cv.matFromArray(4,1,cv.CV_32FC2, [
    boxPts[0].x, boxPts[0].y,
    boxPts[1].x, boxPts[1].y,
    boxPts[2].x, boxPts[2].y,
    boxPts[3].x, boxPts[3].y
  ]);

  const w = Math.hypot(boxPts[1].x - boxPts[0].x, boxPts[1].y - boxPts[0].y);
  const h = Math.hypot(boxPts[2].x - boxPts[1].x, boxPts[2].y - boxPts[1].y);
  const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [0,0, w-1,0, w-1,h-1, 0,h-1]);

  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(w, h));

  const out = document.createElement('canvas');
  out.width  = w;
  out.height = h;
  cv.imshow(out, dst);

  // limpiar
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete();
  bestCnt.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

  return out;
}

// 4) Quitar márgenes blancos sobrantes
function autoTrimCanvas(c) {
  const w = c.width, h = c.height, ctx = c.getContext('2d');
  const data = ctx.getImageData(0,0,w,h).data;
  let xMin = w, xMax = 0, yMin = h, yMax = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y*w + x)*4;
      if (data[i] + data[i+1] + data[i+2] < 765 - 10) {
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
    }
  }
  if (xMax <= xMin || yMax <= yMin) return c;
  const cw = xMax - xMin + 1, ch = yMax - yMin + 1;
  const oc = document.createElement('canvas');
  oc.width = cw; oc.height = ch;
  oc.getContext('2d').drawImage(c, xMin, yMin, cw, ch, 0, 0, cw, ch);
  return oc;
}

// 5) Carrusel de miniaturas
function renderCarousel() {
  carousel.innerHTML = '';
  pages.forEach(c => {
    const thumb = document.createElement('canvas');
    thumb.width  = 80;
    thumb.height = 80 * (c.height / c.width);
    thumb.getContext('2d').drawImage(c, 0, 0, thumb.width, thumb.height);
    carousel.appendChild(thumb);
  });
}

// 6) Capturar documento y detener cámara
btnCapture.addEventListener('click', async () => {
  // freeze-frame en canvas
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // detener todas las pistas de la cámara
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  // ocultar el elemento de video
  video.pause();
  video.srcObject = null;
  video.style.display = 'none';

  // recortar + trim
  let cropped = await cropDocument(canvas);
  cropped = autoTrimCanvas(cropped);

  // mostrar el recorte
  canvas.hidden = false;
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);

  // guardar página y actualizar carrusel
  pages.push(cropped);
  renderCarousel();

  // habilitar export y filtros
  [btnIMG, btnPDF, btnBW, btnContrast, btnOCR, btnMerge]
    .forEach(b => b.disabled = false);
});

// 7) Blanco y Negro
btnBW.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const avg = (img.data[i] + img.data[i+1] + img.data[i+2]) / 3;
    img.data[i] = img.data[i+1] = img.data[i+2] = avg;
  }
  ctx.putImageData(img, 0, 0);
});

// 8) Contraste
btnContrast.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const factor = (259 * (30 + 255)) / (255 * (259 - 30));
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i]   = factor * (img.data[i]   - 128) + 128;
    img.data[i+1] = factor * (img.data[i+1] - 128) + 128;
    img.data[i+2] = factor * (img.data[i+2] - 128) + 128;
  }
  ctx.putImageData(img, 0, 0);
});

// 9) OCR
btnOCR.addEventListener('click', async () => {
  btnOCR.textContent = '⏳ Procesando...';
  const { data:{ text } } = await Tesseract.recognize(canvas.toDataURL(), 'spa+eng');
  ocrResult.textContent = text;
  btnOCR.textContent = '🔎 OCR';
});

// 10) Exportar JPG
btnIMG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href      = canvas.toDataURL('image/jpeg', 0.9);
  link.download = 'scan.jpg';
  link.click();
});

// 11) Exportar PDF con tamaño ajustado
btnPDF.addEventListener('click', () => {
  const pxToMm = px => px * 0.264583;
  const dataURL = canvas.toDataURL('image/jpeg', 1.0);
  const wMm = pxToMm(canvas.width), hMm = pxToMm(canvas.height);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: wMm > hMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [wMm, hMm]
  });
  pdf.addImage(dataURL, 'JPEG', 0, 0, wMm, hMm);
  pdf.save('scan.pdf');
});

// 12) Merge PDF de todas las páginas
btnMerge.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf       = new jsPDF();
  pages.forEach((c,i) => {
    if (i > 0) pdf.addPage();
    pdf.addImage(c, 'JPEG',
                 0, 0,
                 pdf.internal.pageSize.getWidth(),
                 pdf.internal.pageSize.getHeight());
  });
  pdf.save('multi-page.pdf');
});

