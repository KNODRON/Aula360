// Referencias en el DOM
const video        = document.getElementById('preview');
const canvas       = document.getElementById('canvas');
const btnCapture   = document.getElementById('btn-capture');
const btnPDF       = document.getElementById('btn-export-pdf');
const btnIMG       = document.getElementById('btn-export-img');
const btnBW        = document.getElementById('btn-bw');
const btnContrast  = document.getElementById('btn-contrast');
const btnOCR       = document.getElementById('btn-ocr');
const btnMerge     = document.getElementById('btn-merge');
const carousel     = document.getElementById('page-carousel');
const ocrResult    = document.getElementById('ocr-result');

let stream = null;
let pages  = []; // Array de canvases escaneados

// Función para recortar TODO el ticket con OpenCV
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) return inputCanvas;

  const src      = cv.imread(inputCanvas);
  const gray     = new cv.Mat();
  const edges    = new cv.Mat();
  const contours = new cv.MatVector();
  const hier     = new cv.Mat();

  // Preprocesado
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);
  const Mkernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, Mkernel);

  // Contornos
  cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let maxArea = 0, bestCnt = null;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      bestCnt = cnt;
    }
  }
  if (!bestCnt) {
    src.delete(); gray.delete(); edges.delete();
    contours.delete(); hier.delete(); Mkernel.delete();
    return inputCanvas;
  }

  // Caja mínima rotada
  const rotRect = cv.minAreaRect(bestCnt);
  const boxPts  = cv.RotatedRect.points(rotRect);
  const srcPts  = cv.matFromArray(4,1,cv.CV_32FC2, [
    boxPts[0].x, boxPts[0].y,
    boxPts[1].x, boxPts[1].y,
    boxPts[2].x, boxPts[2].y,
    boxPts[3].x, boxPts[3].y
  ]);

  const width  = Math.hypot(boxPts[1].x - boxPts[0].x, boxPts[1].y - boxPts[0].y);
  const height = Math.hypot(boxPts[2].x - boxPts[1].x, boxPts[2].y - boxPts[1].y);

  const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [
    0,       0,
    width-1, 0,
    width-1, height-1,
    0,       height-1
  ]);

  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(width, height));

  const out = document.createElement('canvas');
  out.width  = width;
  out.height = height;
  cv.imshow(out, dst);

  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete();
  bestCnt.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

  return out;
}

// Renderiza miniaturas de todos los escaneos
function renderCarousel() {
  carousel.innerHTML = '';
  pages.forEach((c, i) => {
    const thumb = document.createElement('canvas');
    thumb.width  = 80;
    thumb.height = 80 * (c.height / c.width);
    thumb.getContext('2d').drawImage(c, 0, 0, thumb.width, thumb.height);
    carousel.appendChild(thumb);
  });
}

// Capturar y procesar
btnCapture.addEventListener('click', async () => {
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      alert('No se pudo acceder a la cámara:\n' + err.message);
      return;
    }
  }

  // Captura
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Recorte
  const cropped = await cropDocument(canvas);
  canvas.hidden = false;
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);

  // Guardar página
  pages.push(cropped);
  renderCarousel();

  // Habilitar controles
  btnPDF.disabled    = false;
  btnIMG.disabled    = false;
  btnBW.disabled     = false;
  btnContrast.disabled = false;
  btnOCR.disabled    = false;
  btnMerge.disabled  = false;
});

// Blanco y Negro
btnBW.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  for (let i = 0; i < img.data.length; i+=4) {
    const avg = (img.data[i]+img.data[i+1]+img.data[i+2])/3;
    img.data[i]=img.data[i+1]=img.data[i+2]=avg;
  }
  ctx.putImageData(img,0,0);
});

// Contraste
btnContrast.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0,0,canvas.width,canvas.height);
  const factor = (259*(30+255))/(255*(259-30));
  for (let i=0;i<img.data.length;i+=4){
    img.data[i]   = factor*(img.data[i]-128)+128;
    img.data[i+1] = factor*(img.data[i+1]-128)+128;
    img.data[i+2] = factor*(img.data[i+2]-128)+128;
  }
  ctx.putImageData(img,0,0);
});

// OCR
btnOCR.addEventListener('click', async () => {
  btnOCR.textContent = '⏳ Procesando...';
  const { data:{ text } } = await Tesseract.recognize(
    canvas.toDataURL(), 'spa+eng'
  );
  ocrResult.textContent = text;
  btnOCR.textContent = '🔎 OCR';
});

// Exportar JPG
btnIMG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href   = canvas.toDataURL('image/jpeg',0.9);
  link.download= 'scan.jpg';
  link.click();
});

// Exportar PDF de una sola página
btnPDF.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit:'px', format:[canvas.width,canvas.height] });
  pdf.addImage(canvas,'JPEG',0,0,canvas.width,canvas.height);
  pdf.save('scan.pdf');
});

// Merge PDF de todas las páginas
btnMerge.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pages.forEach((c,i) => {
    if (i>0) pdf.addPage();
    pdf.addImage(c,'JPEG',0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight());
  });
  pdf.save('multi-page.pdf');
});
