const video = document.getElementById('preview');
const canvas = document.getElementById('canvas');
const btnCapture = document.getElementById('btn-capture');
const btnPDF = document.getElementById('btn-export-pdf');
const btnIMG = document.getElementById('btn-export-img');

// Cámara trasera
navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
  .then(stream => video.srcObject = stream)
  .catch(err => console.error('Error cámara:', err));

// Captura frame
btnCapture.addEventListener('click', () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.hidden = false;
  btnPDF.disabled = false;
  btnIMG.disabled = false;
});

// Exportar imagen
btnIMG.addEventListener('click', () => {
  const dataURL = canvas.toDataURL('image/jpeg', 0.9);
  const link = document.createElement('a');
  link.href = dataURL;
  link.download = 'scan.jpg';
  link.click();
});

// Exportar PDF
btnPDF.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'px', format: [canvas.width, canvas.height] });
  pdf.addImage(canvas, 'JPEG', 0, 0, canvas.width, canvas.height);
  pdf.save('scan.pdf');
});

// TODO: agregar detección de bordes y traducción de UI
