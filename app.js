let stream = null;

btnCapture.addEventListener('click', async () => {
  // Sólo pedir permiso la primera vez, dentro del click
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      alert('No se pudo acceder a la cámara:\n' + err.message);
      return;
    }
  }

  // ...resto de la captura y recorte
});// app.js

// Referencias en el DOM
const video      = document.getElementById('preview');
const canvas     = document.getElementById('canvas');
const btnCapture = document.getElementById('btn-capture');
const btnPDF     = document.getElementById('btn-export-pdf');
const btnIMG     = document.getElementById('btn-export-img');

// Stream de la cámara (inicializado al primer click)
let stream = null;

/**
 * Recorta el documento del canvas usando OpenCV.js (o devuelve el original si falla).
 */
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) {
    console.warn('OpenCV.js no disponible');
    return inputCanvas;
  }

  // 1) Leer imagen y preparar mats
  const src      = cv.imread(inputCanvas);
  const gray     = new cv.Mat();
  const edges    = new cv.Mat();
  const contours = new cv.MatVector();
  const hier     = new cv.Mat();

  // 2) Preprocesamiento: gris, blur y Canny
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);

  // Opcional: cerrar pequeños huecos en los bordes
  const Mkernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, Mkernel);

  // 3) Encontrar contornos
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const frameArea = src.rows * src.cols;
  let bestCnt     = null;
  let bestArea    = 0;
  let approx4     = null;

  // 4) Primer pase: buscar cuadrilátero grande y de proporción razonable
  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < frameArea * 0.05) { cnt.delete(); continue; } // descartar muy pequeños

    const peri = cv.arcLength(cnt, true);
    const tmp  = new cv.Mat();
    cv.approxPolyDP(cnt, tmp, 0.02 * peri, true);

    if (tmp.rows === 4 && area > bestArea) {
      const r     = cv.boundingRect(tmp);
      const ratio = r.width / r.height;
      if (ratio > 0.5 && ratio < 2) {
        bestArea = area;
        bestCnt  = cnt;
        if (approx4) approx4.delete();
        approx4  = tmp;
        continue;
      }
    }
    tmp.delete();
    cnt.delete();
  }

  // 5) Fallback: si no encontramos cuadrilátero, tomar el contorno más grande válido
  if (!bestCnt) {
    bestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt  = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > bestArea) {
        const r     = cv.boundingRect(cnt);
        const ratio = r.width / r.height;
        if (area > frameArea * 0.05 && ratio > 0.3 && ratio < 3) {
          bestArea = area;
          bestCnt  = cnt;
        }
      }
    }
  }

  // 6) Construir srcPts (4 puntos de origen)
  let srcPts;
  if (approx4) {
    // Ordena los 4 puntos en tl, tr, br, bl
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: approx4.intPtr(i,0)[0], y: approx4.intPtr(i,0)[1] });
    }
    pts.sort((a,b)=>a.y - b.y);
    const top = pts.slice(0,2).sort((a,b)=>a.x - b.x);
    const bot = pts.slice(2,4).sort((a,b)=>a.x - b.x);
    srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      top[0].x, top[0].y,
      top[1].x, top[1].y,
      bot[1].x, bot[1].y,
      bot[0].x, bot[0].y
    ]);
  } else {
    const r = cv.boundingRect(bestCnt);
    srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      r.x,           r.y,
      r.x + r.width, r.y,
      r.x + r.width, r.y + r.height,
      r.x,           r.y + r.height
    ]);
  }

  // 7) Calcular dimensiones destino
  const [x0,y0,x1,y1,x2,y2,x3,y3] = srcPts.data32F;
  const widthA  = Math.hypot(x1-x0, y1-y0);
  const widthB  = Math.hypot(x2-x3, y2-y3);
  const maxW    = Math.max(widthA, widthB);
  const heightA = Math.hypot(x3-x0, y3-y0);
  const heightB = Math.hypot(x2-x1, y2-y1);
  const maxH    = Math.max(heightA, heightB);

  const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [
    0,      0,
    maxW-1, 0,
    maxW-1, maxH-1,
    0,      maxH-1
  ]);

  // 8) Transformación de perspectiva
  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

  // 9) Volcar en un nuevo canvas
  const out = document.createElement('canvas');
  out.width  = maxW;
  out.height = maxH;
  cv.imshow(out, dst);

  // 10) Liberar memoria
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete();
  if (approx4) approx4.delete();
  if (bestCnt)  bestCnt.delete();
  srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

  return out;
}

// 11) Handler de “Capturar”
btnCapture.addEventListener('click', async () => {
  // Si es el primer click, pide permiso y arranca la cámara
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      await video.play();
    } catch (err) {
      alert('No se pudo acceder a la cámara:\n' + err.message);
      return;
    }
  }

  // Dibuja el frame en el canvas
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Recorta el documento
  const cropped = await cropDocument(canvas);

  // Muestra solo el recorte
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);
  canvas.hidden = false;

  // Habilita los botones de exportación
  btnPDF.disabled = false;
  btnIMG.disabled = false;
});

// 12) Exportar JPG
btnIMG.addEventListener('click', () => {
  const dataURL = canvas.toDataURL('image/jpeg', 0.9);
  const link    = document.createElement('a');
  link.href     = dataURL;
  link.download = 'scan.jpg';
  link.click();
});

// 13) Exportar PDF
btnPDF.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf       = new jsPDF({
    unit: 'px',
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(canvas, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save('scan.pdf');
});
