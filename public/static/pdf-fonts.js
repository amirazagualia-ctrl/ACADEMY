// Police Unicode (Amiri : latin + arabe) pour jsPDF — corrige l'affichage des noms en arabe
// Usage : const doc = await pdfDoc({ format:'a5', orientation:'landscape' })
// Ensuite doc.setFont(undefined,'bold') / doc.text(...) fonctionnent avec l'arabe.
const PDF_FONT_FILES = { normal: '/static/fonts/Amiri-Regular.ttf', bold: '/static/fonts/Amiri-Bold.ttf' };
let _pdfFontsB64 = null;

async function _loadPdfFonts() {
  if (_pdfFontsB64) return _pdfFontsB64;
  const toB64 = async (url) => {
    const buf = await (await fetch(url, { cache: 'force-cache' })).arrayBuffer();
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const [normal, bold] = await Promise.all([toB64(PDF_FONT_FILES.normal), toB64(PDF_FONT_FILES.bold)]);
  _pdfFontsB64 = { normal, bold };
  return _pdfFontsB64;
}

// Crée un jsPDF avec Amiri enregistrée et utilisée par défaut.
async function pdfDoc(opts) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF(opts);
  try {
    const f = await _loadPdfFonts();
    doc.addFileToVFS('Amiri-Regular.ttf', f.normal); doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    doc.addFileToVFS('Amiri-Bold.ttf', f.bold); doc.addFont('Amiri-Bold.ttf', 'Amiri', 'bold');
    // setFont(undefined, style) et setFont('helvetica', ...) → Amiri, pour ne pas toucher au code existant
    const origSetFont = doc.setFont.bind(doc);
    doc.setFont = function (name, style, weight) {
      if (!name || /helvetica|times|courier/i.test(name)) name = 'Amiri';
      return origSetFont(name, style || 'normal', weight);
    };
    doc.setFont('Amiri', 'normal');
  } catch (e) { console.warn('Police PDF Unicode indisponible, repli Helvetica', e); }
  return doc;
}

// Écrit "label value (suffix)" en segments séparés : chaque segment est rendu seul,
// donc un nom arabe (RTL) ne perturbe pas le texte latin qui l'entoure.
function pdfLabelValue(doc, label, value, x, y, suffix) {
  const gap = 1.5;
  doc.text(label, x, y);
  let cx = x + doc.getTextWidth(label) + gap;
  const v = String(value || '').trim();
  if (v) { doc.text(v, cx, y); cx += doc.getTextWidth(v) + gap * 2; }
  if (suffix) doc.text(suffix, cx, y);
}
