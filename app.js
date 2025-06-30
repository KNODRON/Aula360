/**
 * Recorta la página mediante detección de un cuadrilátero con approxPolyDP.
 * Si no se hallan 4 esquinas o el área es muy pequeña, usa fallback de boundingRect o devuelve todo.
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

  // 2) Encontrar contornos
  cv.findContours(edges, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const frameArea = src.rows * src.cols;
  let bestQuad = null;
  let maxArea  = 0;

  // 3) Buscar cuadriláteros grandes (>10% área)
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
    // 4) Ordenar puntos TL, TR, BR, BL
    const pts = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: bestQuad.intPtr(i,0)[0], y: bestQuad.intPtr(i,0)[1] });
    }
    pts.sort((a,b)=>a.y - b.y);
    const topPts    = pts.slice(0,2).sort((a,b)=>a.x - b.x);
    const bottomPts = pts.slice(2,4).sort((a,b)=>a.x - b.x);
    const srcPts    = cv.matFromArray(4,1,cv.CV_32FC2, [
      topPts[0].x,    topPts[0].y,
      topPts[1].x,    topPts[1].y,
      bottomPts[1].x, bottomPts[1].y,
      bottomPts[0].x, bottomPts[0].y
    ]);

    // 5) Calcular tamaño destino
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

    // 6) Transformación de perspectiva
    const M   = cv.getPerspectiveTransform(srcPts, dstPts);
    const dst = new cv.Mat();
    cv.warpPerspective(src, dst, M, new cv.Size(maxW, maxH));

    outCanvas       = document.createElement('canvas');
    outCanvas.width = maxW;
    outCanvas.height= maxH;
    cv.imshow(outCanvas, dst);

    // limpiar mats
    M.delete(); dst.delete(); srcPts.delete(); dstPts.delete();
    bestQuad.delete();

  } else {
    // Fallback: boundingRect del contorno más grande válido
    let fallbackCnt  = null;
    let fallbackArea = 0;
    for (let i = 0; i < contours.size(); i++) {
      const cnt  = contours.get(i);
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
      // Si todo falla, devolvemos la imagen completa
      outCanvas = inputCanvas;
    }
  }

  // 7) Liberar memoria
  src.delete(); gray.delete(); edges.delete();
  contours.delete(); hier.delete(); kernel.delete();

  return outCanvas;
}

  return outCanvas;
}

