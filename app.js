// app.js

// 1) Referencias en el DOM
const video      = document.getElementById('preview');
const canvas     = document.getElementById('canvas');
const btnCapture = document.getElementById('btn-capture');
const btnPDF     = document.getElementById('btn-export-pdf');
const btnIMG     = document.getElementById('btn-export-img');

// 2) Stream de la cámara (se inicializa al primer click)
let stream = null;

/**
 * Recorta TODO el ticket usando el contorno más grande y minAreaRect + perspectiva.
 * Si OpenCV falla, devuelve el canvas original.
 */
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) {
    console.warn('OpenCV.js no disponible, devolviendo imagen original');
    return inputCanvas;
  }

  // Leer imagen
  const src      = cv.imread(inputCanvas);
  const gray     = new cv.Mat();
  const edges    = new cv.Mat();
  const contours = new cv.MatVector();
  const hier     = new cv.Mat();

  // Preprocesado
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);
  // Unir bordes cortados
  const Mkernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, Mkernel);

  // Encontrar todos los contornos externos
  cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // Elegir contorno de mayor área
  let maxArea = 0;
  let bestCnt = null;
  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      maxArea = area;
      bestCnt = cnt;
    }
  }
  if (!bestCnt) {
    // Si no encuentra contornos, devuelve original
    src.delete(); gray.delete(); edges.delete();
    contours.delete(); hier.delete(); Mkernel.delete();
    return inputCanvas;
  }

  // Obtener caja mínima rotada que encierra el contorno
  const rotRect = cv.minAreaRect(bestCnt);
  const boxPts  = cv.RotatedRect.points(rotRect); // Devuelve un array de 4 {x,y}

  // Crear matriz de puntos de origen
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    boxPts[0].x, boxPts[0].y,
    boxPts[1].x, boxPts[1].y,
    boxPts[2].x, boxPts[2].y,
    boxPts[3].x, boxPts[3].y
  ]);

  // Calcular ancho y alto destino
  const width  = Math.hypot(boxPts[1].x - boxPts[0].x, boxPts[1].y - boxPts[0].y);
  const height = Math.hypot(boxPts[2].x - boxPts[1].x, boxPts[2].y - boxPts[1].y);

  // Crear matriz de puntos destino
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,       0,
    width-1, 0,
    width-1, height-1,
    0,       height-1
  ]);

  // Transformación de perspectiva
  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(width, height));

  // Volcar resultado en un nuevo canvas
  const out = document.createElement('canvas');
  out.width  = width;
  out.height = height;
  cv.imshow(out, dst);

  // Liberar memoria
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete();
  bestCnt.delete(); srcPts.delete(); dstPts.delete();
  M.delete(); dst.delete();

  return out;
}

// 3) Handler del botón “Capturar”
btnCapture.addEventListener('click', async () => {
  // Primero: pedir permiso y arrancar cámara
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

  // Capturar frame
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Recortar ticket completo
  const cropped = await cropDocument(canvas);

  // Mostrar recorte
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);
  canvas.hidden = false;

  // Habilitar exportación
  btnPDF.disabled = false;
  btnIMG.disabled = false;
});

// 4) Exportar JPG
btnIMG.addEventListener('click', () => {
  const dataURL = canvas.toDataURL('image/jpeg', 0.9);
  const link    = document.createElement('a');
  link.href     = dataURL;
  link.download = 'scan.jpg';
  link.click();
});

// 5) Exportar PDF
btnPDF.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf       = new jsPDF({
    unit: 'px',
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(canvas, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save('scan.pdf');
});
