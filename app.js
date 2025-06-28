async function cropDocument(inputCanvas) {
  if (!window.cv || !cv.imread) {
    console.warn('OpenCV.js no disponible');
    return inputCanvas;
  }

  // 1) Leer imagen
  let src = cv.imread(inputCanvas);
  let gray = new cv.Mat(), edges = new cv.Mat();
  let contours = new cv.MatVector(), hier = new cv.Mat();

  // 2) Pre-procesado: gris, blur y Canny
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
  cv.Canny(gray, edges, 75, 200);

  // 3) Encontrar contornos
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  // Variables de uso
  let maxArea = 0, bestContour = null, approx4 = null;

  // 4) Intentar encontrar un contorno con 4 vértices
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < 1000) { cnt.delete(); continue; }          // descartar muy pequeños
    const peri = cv.arcLength(cnt, true);
    const tmp = new cv.Mat();
    cv.approxPolyDP(cnt, tmp, 0.02 * peri, true);

    if (tmp.rows === 4 && area > maxArea) {
      maxArea = area;
      bestContour = cnt;
      approx4     = tmp;
    } else {
      tmp.delete();
      cnt.delete();
    }
  }

  let srcPts;

  // 5) Si no hay cuadrilátero, fallback a boundingRect del contorno más grande
  if (!bestContour) {
    // volver a buscar contorno más grande
    maxArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
      if (area > maxArea) {
        maxArea = area;
        bestContour = cnt;
      }
    }
    const rect = cv.boundingRect(bestContour);
    srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      rect.x,                rect.y,
      rect.x + rect.width,   rect.y,
      rect.x + rect.width,   rect.y + rect.height,
      rect.x,                rect.y + rect.height
    ]);
  } else {
    // ordenar approx4 en clockwise: tl, tr, br, bl
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: approx4.intPtr(i,0)[0], y: approx4.intPtr(i,0)[1] });
    }
    pts.sort((a,b) => a.y - b.y);
    const top = pts.slice(0,2).sort((a,b)=>a.x - b.x);
    const bot = pts.slice(2,4).sort((a,b)=>a.x - b.x);
    srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      top[0].x, top[0].y,
      top[1].x, top[1].y,
      bot[1].x, bot[1].y,
      bot[0].x, bot[0].y
    ]);
  }

  // 6) Calcular tamaño destino
  const widthA = Math.hypot(srcPts.data32F[2] - srcPts.data32F[0],
                            srcPts.data32F[3] - srcPts.data32F[1]);
  const widthB = Math.hypot(srcPts.data32F[6] - srcPts.data32F[4],
                            srcPts.data32F[7] - srcPts.data32F[5]);
  const maxW = Math.max(widthA, widthB);

  const heightA = Math.hypot(srcPts.data32F[4] - srcPts.data32F[0],
                             srcPts.data32F[5] - srcPts.data32F[1]);
  const heightB = Math.hypot(srcPts.data32F[6] - srcPts.data32F[2],
                             srcPts.data32F[7] - srcPts.data32F[3]);
  const maxH = Math.max(heightA, heightB);

  const dstPts = cv.matFromArray(4,1,cv.CV_32FC2, [
    0,      0,
    maxW-1, 0,
    maxW-1, maxH-1,
    0,      maxH-1
  ]);

  // 7) Warp perspective
  const M   = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

  // 8) Volcar en canvas de salida
  const out = document.createElement('canvas');
  out.width  = maxW;
  out.height = maxH;
  cv.imshow(out, dst);

  // 9) Limpiar memoria
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete();
  if (approx4) approx4.delete();
  if (bestContour) bestContour.delete();
  srcPts.delete(); dstPts.delete(); M.delete(); dst.delete();

  return out;
}
