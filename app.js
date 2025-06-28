// app.js

// 1) Referencias en el DOM
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

// 2) Función para recortar TODO el ticket con OpenCV
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

  // Encontrar contornos externos
  cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Seleccionar contorno de mayor área
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

  // Puntos de origen
  const srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
    boxPts[0].x, boxPts[0].y,
    boxPts[1].x, boxPts[1].y,
    boxPts[2].x, boxPts[2].y,
    boxPts[3].x, boxPts[3].y
  ]);

  // Tamaño destino
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

  // Limpieza
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete();
  bestCnt.delete(); srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

  return out;
}

// 3) Función para recortar márgenes blancos sobrantes
function autoTrimCanvas(canv) {
  const w   = canv.width, h = canv.height;
  const ctx = canv.getContext('2d');
  const data = ctx.getImageData(0,0,w,h).data;

  let xMin=w, xMax=0, yMin=h, yMax=0;
  for (let y=0; y<h; y++){
    for (let x=0; x<w; x++){
      const i = (y*w + x)*4;
      if (data[i]+data[i+1]+data[i+2] < 765 - 10){
        xMin = Math.min(xMin, x);
        xMax = Math.max(xMax, x);
        yMin = Math.min(yMin, y);
        yMax = Math.max(yMax, y);
      }
    }
  }
  if (xMax<=xMin||yMax<=yMin) return canv;

  const cw = xMax-xMin+1, ch = yMax-yMin+1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(canv, xMin,yMin,cw,ch,0,0,cw,ch);
  return out;
}

// 4) Renderiza miniaturas
function renderCarousel() {
  carousel.innerHTML = '';
  pages.forEach(c => {
    const thumb = document.createElement('canvas');
    thumb.width  = 80;
    thumb.height = 80 * (c.height/c.width);
    thumb.getContext('2d').drawImage(c,0,0,thumb.width,thumb.height);
    carousel.appendChild(thumb);
  });
}

// 5) Handler de “Capturar”
btnCapture.addEventListener('click', async () => {
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
      video.srcObject = stream;
      await video.play();
    } catch(err) {
      alert('No se pudo acceder a la cámara:\n'+err.message);
      return;
    }
  }

  // Captura original
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);

  // Recorte con OpenCV
  let cropped = await cropDocument(canvas);

  // Eliminar blancos sobrantes
  cropped = autoTrimCanvas(cropped);

  // Mostrar
  canvas.hidden = false;
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped,0,0);

  // Guardar página y actualizar carrusel
  pages.push(cropped);
  renderCarousel();

  // Habilitar controles
  [btnPDF,btnIMG,btnBW,btnContrast,btnOCR,btnMerge]
    .forEach(b=>b.disabled=false);
});

// 6) Blanco y Negro
btnBW.addEventListener('click',()=>{
  const ctx = canvas.getContext('2d'), img=ctx.getImageData(0,0,canvas.width,canvas.height);
  for(let i=0;i<img.data.length;i+=4){
    const avg=(img.data[i]+img.data[i+1]+img.data[i+2])/3;
    img.data[i]=img.data[i+1]=img.data[i+2]=avg;
  }
  ctx.putImageData(img,0,0);
});

// 7) Contraste
btnContrast.addEventListener('click',()=>{
  const ctx=canvas.getContext('2d'), img=ctx.getImageData(0,0,canvas.width,canvas.height);
  const factor=(259*(30+255))/(255*(259-30));
  for(let i=0;i<img.data.length;i+=4){
    img.data[i]   = factor*(img.data[i]-128)+128;
    img.data[i+1] = factor*(img.data[i+1]-128)+128;
    img.data[i+2] = factor*(img.data[i+2]-128)+128;
  }
  ctx.putImageData(img,0,0);
});

// 8) OCR
btnOCR.addEventListener('click',async()=>{
  btnOCR.textContent='⏳ Procesando...';
  const { data:{ text } } = await Tesseract.recognize(canvas.toDataURL(),'spa+eng');
  ocrResult.textContent=text;
  btnOCR.textContent='🔎 OCR';
});

// 9) Exportar JPG
btnIMG.addEventListener('click',()=>{
  const link=document.createElement('a');
  link.href=canvas.toDataURL('image/jpeg',0.9);
  link.download='scan.jpg';
  link.click();
});

// 10) Exportar PDF único
btnPDF.addEventListener('click',()=>{
  const { jsPDF }=window.jspdf;
  const pdf=new jsPDF({unit:'px',format:[canvas.width,canvas.height]});
  pdf.addImage(canvas,'JPEG',0,0,canvas.width,canvas.height);
  pdf.save('scan.pdf');
});

// 11) Merge PDF múltiple
btnMerge.addEventListener('click',()=>{
  const { jsPDF }=window.jspdf;
  const pdf=new jsPDF();
  pages.forEach((c,i)=>{
    if(i>0) pdf.addPage();
    pdf.addImage(c,'JPEG',0,0,pdf.internal.pageSize.getWidth(),pdf.internal.pageSize.getHeight());
  });
  pdf.save('multi-page.pdf');
});
