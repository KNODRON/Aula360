// app.js

// 1) Referencias en el DOM
const video       = document.getElementById('preview');
const canvas      = document.getElementById('canvas');
const btnCapture  = document.getElementById('btn-capture');
const btnIMG      = document.getElementById('btn-export-img');
const btnPDF      = document.getElementById('btn-export-pdf');
const btnBW       = document.getElementById('btn-bw');
const btnContrast = document.getElementById('btn-contrast');
const btnOCR      = document.getElementById('btn-ocr');
const btnMerge    = document.getElementById('btn-merge');
const carousel    = document.getElementById('page-carousel');
const ocrResult   = document.getElementById('ocr-result');

let stream = null;  // MediaStream de la cámara
let pages  = [];    // Páginas escaneadas

// 2) Cuando OpenCV.js esté listo (invocado por onload en el <script>)
window.onOpenCvReady = async function() {
  btnCapture.disabled = false;  // habilita botón
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    alert('No se pudo acceder a la cámara:\n' + err.message);
  }
};

/**
 * 3) Recorta el documento con approxPolyDP o boundingRect
 */
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
  const kernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const frameArea = src.rows * src.cols;

  let bestQuad = null, maxArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < frameArea * 0.05) { cnt.delete(); continue; }
    const peri   = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4 && area > maxArea) {
      maxArea  = area;
      bestQuad = approx;
    } else {
      approx.delete();
    }
    cnt.delete();
  }

  let outCanvas;
  if (bestQuad && maxArea > frameArea * 0.1) {
    // ordenar vértices TL,TR,BR,BL
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: bestQuad.intPtr(i,0)[0], y: bestQuad.intPtr(i,0)[1] });
    }
    pts.sort((a,b)=>a.y-b.y);
    const top    = pts.slice(0,2).sort((a,b)=>a.x-b.x);
    const bottom = pts.slice(2,4).sort((a,b)=>a.x-b.x);
    const srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      top[0].x,     top[0].y,
      top[1].x,     top[1].y,
      bottom[1].x,  bottom[1].y,
      bottom[0].x,  bottom[0].y
    ]);

    // dimensiones destino
    const [x0,y0,x1,y1,x2,y2,x3,y3] = srcPts.data32F;
    const wA = Math.hypot(x1-x0, y1-y0),
          wB = Math.hypot(x2-x3, y2-y3),
          hA = Math.hypot(x3-x0, y3-y0),
          hB = Math.hypot(x2-x1, y2-y1);
    const maxW = Math.max(wA,wB), maxH = Math.max(hA,hB);
    const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      0,0, maxW-1,0, maxW-1,maxH-1, 0,maxH-1
    ]);

    const M   = cv.getPerspectiveTransform(srcPts, dstPts);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

    outCanvas       = document.createElement('canvas');
    outCanvas.width = maxW;
    outCanvas.height= maxH;
    cv.imshow(outCanvas, dst);

    M.delete(); dst.delete(); srcPts.delete(); dstPts.delete(); bestQuad.delete();
  } else {
    // fallback boundingRect
    let fallbackCnt = null, fallbackArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i), area = cv.contourArea(cnt);
      if (area > fallbackArea) {
        fallbackArea = area;
        fallbackCnt  = cnt;
      }
    }
    if (fallbackCnt && fallbackArea > frameArea * 0.05) {
      const r = cv.boundingRect(fallbackCnt);
      outCanvas = document.createElement('canvas');
      outCanvas.width  = r.width;
      outCanvas.height = r.height;
      outCanvas.getContext('2d')
        .drawImage(inputCanvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
      fallbackCnt.delete();
    } else {
      outCanvas = inputCanvas;
    }
  }

  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); kernel.delete();
  return outCanvas;
}

/**
 * 4) Elimina márgenes blancos sobrantes
 */
function autoTrimCanvas(c) {
  const w=c.width, h=c.height, ctx=c.getContext('2d'),
        data=ctx.getImageData(0,0,w,h).data;
  let xMin=w,xMax=0,yMin=h,yMax=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const i=(y*w+x)*4, sum=data[i]+data[i+1]+data[i+2];
    if (sum < 765-10) {
      xMin=Math.min(xMin,x); xMax=Math.max(xMax,x);
      yMin=Math.min(yMin,y); yMax=Math.max(yMax,y);
    }
  }
  if (xMax<=xMin || yMax<=yMin) return c;
  const cw=xMax-xMin+1, ch=yMax-yMin+1,
        oc=document.createElement('canvas');
  oc.width=cw; oc.height=ch;
  oc.getContext('2d').drawImage(c, xMin,yMin,cw,ch, 0,0,cw,ch);
  return oc;
}

/**
 * 5) Carrusel de miniaturas
 */
function renderCarousel() {
  carousel.innerHTML = '';
  pages.forEach(c => {
    const thumb = document.createElement('canvas');
    thumb.width  = 80;
    thumb.height = 80 * (c.height / c.width);
    thumb.getContext('2d').drawImage(c,0,0,thumb.width,thumb.height);
    carousel.appendChild(thumb);
  });
}

/**
 * 6) Capturar snapshot
 */
btnCapture.addEventListener('click', async () => {
  // congelar frame
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);

  // recorte + trim
  let cropped = await cropDocument(canvas);
  cropped     = autoTrimCanvas(cropped);

  // mostrar canvas
  canvas.hidden = false;
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped,0,0);

  // guardar y actualizar UI
  pages.push(cropped);
  renderCarousel();
  [btnIMG,btnPDF,btnBW,btnContrast,btnOCR,btnMerge].forEach(b=>b.disabled=false);
});

/* 7) Filtros, OCR y export (idénticos a tu lógica previa) */
btnBW.addEventListener('click', () => {
  const ctx=canvas.getContext('2d'), img=ctx.getImageData(0,0,canvas.width,canvas.height);
  for (let i=0;i<img.data.length;i+=4) {
    const avg=(img.data[i]+img.data[i+1]+img.data[i+2])/3;
    img.data[i]=img.data[i+1]=img.data[i+2]=avg;
  }
  ctx.putImageData(img,0,0);
});

btnContrast.addEventListener('click', () => {
  const ctx=canvas.getContext('2d'), img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const f=(259*(30+255))/(255*(259-30));
  for (let i=0;i<img.data.length;i+=4) {
    img.data[i]   = f*(img.data[i]-128)+128;
    img.data[i+1] = f*(img.data[i+1]-128)+128;
    img.data[i+2] = f*(img.data[i+2]-128)+128;
  }
  ctx.putImageData(img,0,0);
});

btnOCR.addEventListener('click', async () => {
  btnOCR.textContent = '⏳ Procesando...';
  const { data:{ text } } = await Tesseract.recognize(canvas.toDataURL(),'spa+eng');
  ocrResult.textContent = text;
  btnOCR.textContent = '🔎 OCR';
});

btnIMG.addEventListener('click', () => {
  const a=document.createElement('a');
  a.href   = canvas.toDataURL('image/jpeg',0.9);
  a.download = 'scan.jpg';
  a.click();
});

btnPDF.addEventListener('click', () => {
  const pxToMm = px => px * 0.264583;
  const wMm    = pxToMm(canvas.width), hMm = pxToMm(canvas.height);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: wMm>hMm?'landscape':'portrait',
    unit: 'mm',
    format: [wMm,hMm]
  });
  pdf.addImage(canvas.toDataURL('image/jpeg'), 'JPEG', 0, 0, wMm, hMm);
  pdf.save('scan.pdf');
});

btnMerge.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  pages.forEach((c,i) => {
    if (i>0) pdf.addPage();
    pdf.addImage(c, 'JPEG', 0, 0,
                 pdf.internal.pageSize.getWidth(),
                 pdf.internal.pageSize.getHeight());
  });
  pdf.save('multi-page.pdf');
});

