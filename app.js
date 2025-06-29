/**
 * Recorta el documento completo o, si la detección falla/queda pequeña, devuelve
 * la imagen original o el boundingRect completo.
 */
async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) return inputCanvas;

  const src      = cv.imread(inputCanvas);
  const gray     = new cv.Mat();
  const edges    = new cv.Mat();
  const contours = new cv.MatVector();
  const hier     = new cv.Mat();

  // 1) Preprocesado
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 50, 150);
  const Mkernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, Mkernel);

  // 2) Contornos externos
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

  const frameArea = src.rows * src.cols;
  // 3) Si el mejor contorno es muy pequeño, devolvemos original
  if (!bestCnt || maxArea < frameArea * 0.2) {
    src.delete(); gray.delete(); edges.delete();
    contours.delete(); hier.delete(); Mkernel.delete();
    if (bestCnt) bestCnt.delete();
    return inputCanvas;
  }

  // 4) BoundingRect de seguridad (fallback si algo falla luego)
  const r = cv.boundingRect(bestCnt);

  // 5) Intentamos caja rotada
  const rotRect = cv.minAreaRect(bestCnt);
  const boxPts  = cv.RotatedRect.points(rotRect);
  let outCanvas = null;

  try {
    // Coordenadas para perspectiveTransform
    const srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      boxPts[0].x, boxPts[0].y,
      boxPts[1].x, boxPts[1].y,
      boxPts[2].x, boxPts[2].y,
      boxPts[3].x, boxPts[3].y
    ]);
    const w = Math.hypot(boxPts[1].x - boxPts[0].x, boxPts[1].y - boxPts[0].y);
    const h = Math.hypot(boxPts[2].x - boxPts[1].x, boxPts[2].y - boxPts[1].y);
    const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [0,0,w-1,0,w-1,h-1,0,h-1]);

    const Mtx = cv.getPerspectiveTransform(srcPts, dstPts);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, Mtx, new cv.Size(w,h));

    outCanvas = document.createElement('canvas');
    outCanvas.width  = w;
    outCanvas.height = h;
    cv.imshow(outCanvas, dst);

    // limpieza
    Mtx.delete(); dst.delete(); srcPts.delete(); dstPts.delete();
  } catch (e) {
    // si algo falla, usaremos el boundingRect normal
    outCanvas = document.createElement('canvas');
    outCanvas.width  = r.width;
    outCanvas.height = r.height;
    outCanvas.getContext('2d')
      .drawImage(inputCanvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  }

  // 6) Liberar mats
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); Mkernel.delete(); bestCnt.delete();

  return outCanvas;
}

