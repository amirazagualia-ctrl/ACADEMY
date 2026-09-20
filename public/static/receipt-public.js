/* Quittance publique — téléchargement sans connexion (lien sécurisé par token) */
(function () {
  const LEVEL_LABELS = {
    '1AP': '1ère année primaire', '2AP': '2ème année primaire', '3AP': '3ème année primaire',
    '4AP': '4ème année primaire', '5AP': '5ème année primaire', '6AP': '6ème année primaire',
    '7AB': '7ème année de base', '8AB': '8ème année de base', '9AB': '9ème année de base',
    '1AS': '1ère année secondaire', '2AS': '2ème année secondaire', '3AS': '3ème année secondaire', '4AS': '4ème année secondaire'
  };
  const fmtDate = d => d ? dayjs(d).format('DD/MM/YYYY') : '-';

  function amountToFrenchWords(n) {
    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
    const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
    function under100(x) {
      if (x < 17) return units[x];
      if (x < 20) return 'dix-' + units[x - 10];
      const t = Math.floor(x / 10), u = x % 10;
      if (t === 7 || t === 9) {
        const rest = x - (t === 7 ? 60 : 80);
        return tens[t] + (rest === 1 && t === 7 ? ' et ' : '-') + under100(rest);
      }
      if (u === 0) return tens[t] + (t === 8 ? 's' : '');
      if (u === 1 && t < 8) return tens[t] + ' et un';
      return tens[t] + '-' + units[u];
    }
    function under1000(x) {
      if (x < 100) return under100(x);
      const h = Math.floor(x / 100), r = x % 100;
      let s = h === 1 ? 'cent' : units[h] + ' cent' + (r === 0 && h > 1 ? 's' : '');
      if (r > 0) s += (s ? ' ' : '') + under100(r);
      return s;
    }
    const int = Math.floor(n), mill = Math.round((n - int) * 1000);
    let out = '';
    if (int >= 1000) {
      const th = Math.floor(int / 1000);
      out = (th > 1 ? under1000(th) + ' ' : '') + 'mille';
      if (int % 1000 > 0) out += ' ' + under1000(int % 1000);
    } else out = under1000(int) || 'zéro';
    out += ' dinar' + (int > 1 ? 's' : '');
    if (mill > 0) out += ' et ' + mill + ' millime' + (mill > 1 ? 's' : '');
    return out;
  }

  let DATA = null;
  const statusEl = document.getElementById('status');
  const infoEl = document.getElementById('info');
  const btnEl = document.getElementById('dl-btn');

  async function load() {
    try {
      const id = location.pathname.split('/').pop();
      const t = new URLSearchParams(location.search).get('t') || '';
      const res = await fetch(`/api/public/receipt/${id}?t=${encodeURIComponent(t)}`);
      const j = await res.json();
      if (!res.ok) { statusEl.innerHTML = `<span class="text-red-600 font-semibold">⚠️ ${j.error || 'Lien invalide ou expiré'}</span>`; return; }
      DATA = j;
      const f = j.fee, st = f.students || {};
      const receiptNo = `Q-${dayjs(f.paid_date || undefined).format('YYYY')}-${String(f.id).padStart(5, '0')}`;
      infoEl.innerHTML = `
        <div class="font-bold text-blue-800 mb-2">Quittance N° ${receiptNo}</div>
        <div><span class="text-gray-500">Élève :</span> <b>${st.first_name || ''} ${st.last_name || ''}</b> (${LEVEL_LABELS[st.level] || st.level || '-'})</div>
        <div><span class="text-gray-500">Objet :</span> ${f.label}</div>
        <div><span class="text-gray-500">Montant :</span> <b class="text-blue-800">${Number(f.amount).toFixed(3)} DT</b></div>
        <div><span class="text-gray-500">Payé le :</span> ${fmtDate(f.paid_date)}</div>`;
      infoEl.classList.remove('hidden');
      statusEl.textContent = '';
      btnEl.classList.remove('hidden');
    } catch (e) {
      statusEl.innerHTML = '<span class="text-red-600 font-semibold">Erreur de chargement</span>';
    }
  }

  window.genPDF = async function () {
    if (!DATA) return;
    try {
      btnEl.disabled = true; btnEl.textContent = 'Génération…';
      const f = DATA.fee, school = DATA.school || {}, st = f.students || {};
      const receiptNo = `Q-${dayjs(f.paid_date || undefined).format('YYYY')}-${String(f.id).padStart(5, '0')}`;
      const methodLabels = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement' };

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ format: 'a5', orientation: 'landscape' }); // 210 x 148 mm

      // Logo -> filigrane + cachet via canvas
      let logoImg = null, watermarkImg = null, stampImg = null;
      try {
        logoImg = await new Promise((res, rej) => {
          const im = new Image();
          im.onload = () => res(im); im.onerror = rej;
          im.src = '/static/logo-rahma.png';
        });
        const wc = document.createElement('canvas'); wc.width = 600; wc.height = 600;
        const wctx = wc.getContext('2d');
        wctx.globalAlpha = 0.07;
        wctx.drawImage(logoImg, 0, 0, 600, 600);
        watermarkImg = wc.toDataURL('image/png');
        const sc = document.createElement('canvas'); sc.width = 400; sc.height = 400;
        const sctx = sc.getContext('2d');
        sctx.globalAlpha = 0.70;
        sctx.drawImage(logoImg, 0, 0, 400, 400);
        stampImg = sc.toDataURL('image/png');
      } catch (e) { /* logo optionnel */ }

      // Filigrane central (sous le texte)
      if (watermarkImg) doc.addImage(watermarkImg, 'PNG', 55, 24, 100, 100);

      // En-tête
      doc.setFillColor(30, 64, 175);
      doc.rect(0, 0, 210, 26, 'F');
      if (logoImg) {
        try {
          const hc = document.createElement('canvas'); hc.width = 200; hc.height = 200;
          hc.getContext('2d').drawImage(logoImg, 0, 0, 200, 200);
          doc.addImage(hc.toDataURL('image/png'), 'PNG', 6, 3, 20, 20);
        } catch (e) {}
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(15); doc.setFont(undefined, 'bold');
      doc.text(school.name || 'Rahma Academy', 105, 10, { align: 'center' });
      doc.setFontSize(8); doc.setFont(undefined, 'normal');
      doc.text(`${school.address || ''}  •  ${school.phone || ''}`, 105, 16, { align: 'center' });
      doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text('QUITTANCE DE PAIEMENT', 105, 23, { align: 'center' });

      // Numéro + date
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(10); doc.setFont(undefined, 'bold');
      doc.text(`N° ${receiptNo}`, 14, 35);
      doc.setFont(undefined, 'normal');
      doc.text(`Date de paiement : ${fmtDate(f.paid_date)}`, 196, 35, { align: 'right' });
      doc.setDrawColor(30, 64, 175); doc.setLineWidth(0.5);
      doc.line(14, 38, 196, 38);

      // Corps
      let y = 47;
      doc.setFontSize(10);
      doc.text(`Reçu de : ${st.parent_name || 'M./Mme le tuteur de l\u2019élève'}`, 14, y); y += 7;
      doc.text(`Pour l'élève : ${st.first_name || ''} ${st.last_name || ''}   (${LEVEL_LABELS[st.level] || st.level || '-'}${st.class_name ? ' — ' + st.class_name : ''})`, 14, y); y += 7;
      doc.text(`Objet : ${f.label}`, 14, y); y += 7;
      doc.text(`Mode de paiement : ${methodLabels[f.method] || f.method || 'Espèces'}`, 14, y); y += 10;

      // Montant encadré
      doc.setFillColor(240, 246, 255);
      doc.setDrawColor(30, 64, 175);
      doc.roundedRect(14, y - 6, 182, 18, 2, 2, 'FD');
      doc.setFont(undefined, 'bold'); doc.setFontSize(14);
      doc.setTextColor(30, 64, 175);
      doc.text(`${Number(f.amount).toFixed(3)} DT`, 24, y + 5);
      doc.setFontSize(9); doc.setFont(undefined, 'italic');
      doc.setTextColor(70, 70, 70);
      const words = amountToFrenchWords(Number(f.amount));
      doc.text(`Soit : ${words.charAt(0).toUpperCase() + words.slice(1)}`, 70, y + 5, { maxWidth: 122 });
      y += 24;

      // Signatures
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text('Signature du payeur', 30, y + 14);
      doc.text('Cachet et signature de l\u2019administration', 145, y + 14);
      doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
      doc.line(18, y + 10, 78, y + 10);
      doc.line(130, y + 10, 192, y + 10);

      // Cachet officiel
      if (stampImg) doc.addImage(stampImg, 'PNG', 159, y + 14, 25, 25);

      // Pied de page
      doc.setFontSize(7); doc.setTextColor(130, 130, 130);
      doc.text(`Quittance ${receiptNo} générée le ${dayjs().format('DD/MM/YYYY HH:mm')} — ${school.name || 'Rahma Academy'}`, 105, 141, { align: 'center' });

      doc.save(`quittance-${receiptNo}.pdf`);
      btnEl.disabled = false; btnEl.textContent = '📄 Télécharger la quittance (PDF)';
    } catch (e) {
      console.error(e);
      btnEl.disabled = false; btnEl.textContent = '📄 Télécharger la quittance (PDF)';
      statusEl.innerHTML = '<span class="text-red-600">Erreur de génération du PDF</span>';
    }
  };

  load();
})();
