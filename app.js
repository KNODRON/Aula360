// Reemplaza tu handler actual por este:

btnCapture.addEventListener('click', async () => {
  // 1) Si aún no tenemos cámara, la arrancamos (solo al primer click)
  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = stream;
      video.style.display = 'block';
      await video.play();
      // ¡ya arrancó la cámara, salimos para que el usuario vuelva a pulsar "Capturar"!
      return;
    } catch (err) {
      alert('No se pudo acceder a la cámara:\n' + err.message);
      return;
    }
  }

  // 2) Congelamos el frame en el canvas
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // 3) Recortamos + trim
  let cropped = await cropDocument(canvas);
  cropped     = autoTrimCanvas(cropped);

  // 4) Lo mostramos
  canvas.hidden = false;
  canvas.width  = cropped.width;
  canvas.height = cropped.height;
  canvas.getContext('2d').drawImage(cropped, 0, 0);

  // 5) (Opcional) detener cámara si ya no la necesitas
  // stream.getTracks().forEach(t => t.stop());
  // video.pause();
  // video.srcObject = null;

  // 6) Guardamos la página y habilitamos botones
  pages.push(cropped);
  renderCarousel();
  [btnIMG, btnPDF, btnBW, btnContrast, btnOCR, btnMerge]
    .forEach(b => b.disabled = false);
});
