/**
 * Recorta la página mediante detección de un cuadrilátero con approxPolyDP.
 * Si no se hallan 4 esquinas, usa boundingRect. Y si es muy pequeño, devuelve todo.
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
  cv.Canny(gray, edges, 75, 200);
  const kernel = cv.Mat.ones(5,5,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);

  // 2) Encuentra contornos
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const frameArea = src.rows * src.cols;
  let bestQuad = null;
  let maxArea  = 0;

  // 3) Busca cuadriláteros grandes y razonables
  for (let i = 0; i < contours.size(); i++) {
    const cnt  = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < frameArea * 0.05) { cnt.delete(); continue; }
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4 && area > maxArea) {
      maxArea  = area;
      bestQuad = approx;         // guardamos la Mat con 4 puntos
    } else {
      approx.delete();
    }
    cnt.delete();
  }

  let outCanvas;
  if (bestQuad && maxArea > frameArea * 0.1) {
    // 4) Ordenar puntos: tl, tr, br, bl
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: bestQuad.intPtr(i,0)[0], y: bestQuad.intPtr(i,0)[1] });
    }
    pts.sort((a,b)=>a.y - b.y);
    const top    = pts.slice(0,2).sort((a,b)=>a.x - b.x);
    const bottom = pts.slice(2,4).sort((a,b)=>a.x - b.x);
    const srcPts = cv.matFromArray(4,1,cv.CV_32FC2, [
      top[0].x,    top[0].y,
      top[1].x,    top[1].y,
      bottom[1].x, bottom[1].y,
      bottom[0].x, bottom[0].y
    ]);

    // 5) calcular dimensiones destino
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

    // 6) Warp
    const M   = cv.getPerspectiveTransform(srcPts, dstPts);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

    // 7) Crear canvas de salida
    outCanvas       = document.createElement('canvas');
    outCanvas.width = maxW;
    outCanvas.height= maxH;
    cv.imshow(outCanvas, dst);

    // limpiar mats
    M.delete(); dst.delete(); srcPts.delete(); dstPts.delete();
    bestQuad.delete();
  } else {
    // Fallback: boundingRect del contorno más grande
    let fallbackCnt = null;
    let fallbackArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);
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
      outCanvas = inputCanvas;  // nada confiable → devolvemos todo
    }
  }

  // limpiar mats restantes
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); kernel.delete();

  return outCanvas;
}
