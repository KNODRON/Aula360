const video = document.getElementById('preview');
const canvas = document.getElementById('canvas');
const btnCapture = document.getElementById('btn-capture');
const btnPDF = document.getElementById('btn-export-pdf');
const btnIMG = document.getElementById('btn-export-img');

// 1) Iniciar cámara
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  .then(stream => video.srcObject = stream)
  .catch(err => alert('No se pudo acceder a la cámara: ' + err));

// 2) Función de recorte con OpenCV.js
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) {
    console.warn('OpenCV.js no disponible');
    return inputCanvas;
  }

  let src = cv.imread(inputCanvas);
  let gray = new cv.Mat(), edges = new cv.Mat(), contours = new cv.MatVector(), hier = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0, pageCnt = null;
  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let peri = cv.arcLength(cnt, true);
    let approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4) {
      let area = cv.contourArea(approx);
      if (area > maxArea) {
        maxArea = area;
        pageCnt = approx;
      }
    }
    cnt.delete();
  }

  if (pageCnt) {
    // Extraer puntos y ordenarlos
    let pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: pageCnt.intPtr(i,0)[0], y: pageCnt.intPtr(i,0)[1] });
    }
    pts.sort((a,b)=>a.y - b.y);
    let top = pts.slice(0,2).sort((a,b)=>a.x - b.x);
    let bot = pts.slice(2,4).sort((a,b)=>a.x - b.x);
    let srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      top[0].x, top[0].y,
      top[1].x, top[1].y,
      bot[1].x, bot[1].y,
      bot[0].x, bot[0].y
    ]);
    let widthA = Math.hypot(bot[1].x - bot[0].x, bot[1].y - bot[0].y);
    let widthB = Math.hypot(top[1].x - top[0].x, top[1].y - top[0].y);
    let maxW = Math.max(widthA, widthB);
    let heightA = Math.hypot(top[1].x - bot[1].x, top[1].y - bot[1].y);
    let heightB = Math.hypot(top[0].x - bot[0].x, top[0].y - bot[0].y);
    let maxH = Math.max(heightA, heightB);
    let dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      0, 0,
      maxW-1, 0,
      maxW-1, maxH-1,
      0, maxH-1
    ]);
    let M = cv.getPerspectiveTransform(srcPts, dstPts);
    let dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

    // Poner resultado en canvas nuevo
    let out = document.createElement('canvas');
    out.width = maxW; out.height = maxH;
    cv.imshow(out, dst);

    // Liberar memoria
    src.delete(); gray.delete(); edges.delete();
    contours.delete(); hier.delete(); pageCnt.delete();
    srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

    return out;
  }

  // Si no detectó, devuelve original
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete();
  return inputCanvas;
}

// 3) Capturar, recortar y habilitar export
btnCapture.addEventListener('click', async () => {
  // dibuja frame
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // recorta con OpenCV
  const cropped = await cropDocument(canvas);

  // muestra recorte
  canvas.width = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);
  canvas.hidden = false;

  btnPDF.disabled = false;
  btnIMG.disabled = false;
});

// 4) Exportar JPG
btnIMG.addEventListener('click', () => {
  const dataURL = canvas.toDataURL('image/jpeg', 0.9);
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'scan.jpg';
  link.click();
});

// 5) Exportar PDF
btnPDF.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] });
  pdf.addImage(canvas, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save('scan.pdf');
});
