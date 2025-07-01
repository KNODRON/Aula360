// app.js

// 1) Referencias en el DOM
const video       = document.getElementById('preview');
const canvas      = document.getElementById('canvas');
const btnCapture  = document.getElementById('btn-capture');
const btnIMG      = document.getElementById('btn-export-img');
const btnPDF      = document.getElementById('btn-export-pdf');
const btnBW       = document.getElementById('btn-bw');
const carousel    = document.getElementById('page-carousel');

let stream = null;
let pages  = [];

// 2) Arrancar cámara en cuanto OpenCV esté listo
window.onOpenCvReady = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    alert('No se pudo acceder a la cámara:\n' + e.message);
  }
};

// 3) Capturar y preparar el canvas
btnCapture.addEventListener('click', () => {
  // Congelar frame
  canvas.hidden = true;
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);

  // Mostrar la imagen congelada
  canvas.hidden = false;

  // Guardar página para el carrusel
  const snapshot = document.createElement('canvas');
  snapshot.width  = canvas.width;
  snapshot.height = canvas.height;
  snapshot.getContext('2d').drawImage(canvas, 0, 0);
  pages.push(snapshot);
  renderCarousel();

  // Habilitar export y B/N
  btnIMG.disabled = false;
  btnPDF.disabled = false;
  btnBW.disabled  = false;
});

// 4) Renderizar miniaturas
function renderCarousel() {
  carousel.innerHTML = '';
  pages.forEach(c => {
    const thumb = document.createElement('canvas');
    thumb.width  = 80;
    thumb.height = 80 * (c.height / c.width);
    thumb.getContext('2d').drawImage(c, 0, 0, thumb.width, thumb.height);
    carousel.appendChild(thumb);
  });
}

// 5) Blanco y Negro (opcional)
btnBW.addEventListener('click', () => {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const m = (img.data[i] + img.data[i+1] + img.data[i+2]) / 3;
    img.data[i] = img.data[i+1] = img.data[i+2] = m;
  }
  ctx.putImageData(img, 0, 0);
});

// 6) Exportar JPG
btnIMG.addEventListener('click', () => {
  const link = document.createElement('a');
  link.href     = canvas.toDataURL('image/jpeg', 0.9);
  link.download = 'scan.jpg';
  link.click();
});

// 7) Exportar PDF
btnPDF.addEventListener('click', () => {
  const pxToMm = px => px * 0.264583;
  const wMm = pxToMm(canvas.width);
  const hMm = pxToMm(canvas.height);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({
    orientation: wMm > hMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [wMm, hMm]
  });
  pdf.addImage(canvas.toDataURL('image/jpeg'), 'JPEG', 0, 0, wMm, hMm);
  pdf.save('scan.pdf');
});

