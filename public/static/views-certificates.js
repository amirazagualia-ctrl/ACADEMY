// ---- Feature 45 : Certificats & attestations (PDF A4 filigrané + QR de vérification) ----
const CERT_TYPE_LABELS = { scolarite: 'Attestation de scolarité', presence: 'Attestation de présence', reussite: 'Attestation de réussite', inscription: "Attestation d'inscription", conduite: 'Certificat de bonne conduite', autre: 'Attestation libre' };
const CERT_TYPE_AR = { scolarite: 'شهادة تمدرس', presence: 'شهادة حضور', reussite: 'شهادة نجاح', inscription: 'شهادة ترسيم', conduite: 'شهادة حسن سيرة', autre: 'شهادة' };

VIEWS.certificates = async function(el) {
  const r = (await api.get('/certificates')).data;
  if (!r.supported) { el.innerHTML = pageHeader('Certificats & attestations', 'fa-certificate') + `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Exécutez <code>migrations/0012_certificates.sql</code> dans Supabase SQL Editor pour activer ce module.</div>`; return; }
  App.cache.certs = r.items;
  const q = (App.cache.certQ || '').toLowerCase();
  const list = r.items.filter(c => !q || `${c.number} ${c.title} ${c.students?.first_name} ${c.students?.last_name}`.toLowerCase().includes(q));
  const family = isParentOrStudent();
  el.innerHTML = pageHeader(`Certificats & attestations <span class="text-gray-400 text-base font-normal">· الشهادات</span>`, 'fa-certificate',
    App.user.role === 'admin' ? `<button onclick="showCertForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau document</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <input class="${inputCls} max-w-xs" placeholder="Rechercher (n°, élève, type)…" value="${esc(App.cache.certQ || '')}" oninput="App.cache.certQ=this.value; render()">
    <span class="text-xs text-gray-500 ml-auto">${list.length} document(s)</span>
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>N°</th><th>Document</th><th>Élève</th><th>Année</th><th>Délivré le</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${list.map(c => `<tr class="${c.revoked_at ? 'opacity-60' : ''}">
        <td class="font-mono text-xs font-bold">${esc(c.number)}</td>
        <td><b>${esc(c.title)}</b><br><span class="text-xs text-gray-400">${esc(CERT_TYPE_LABELS[c.type] || c.type)}</span></td>
        <td>${esc(c.students?.first_name || '')} ${esc(c.students?.last_name || '')}<br><span class="text-xs text-gray-400">${esc(c.students?.level || '')}</span></td>
        <td class="text-xs">${esc(c.school_year)}</td>
        <td class="text-xs">${fmtDT(c.issued_at)}<br><span class="text-gray-400">${esc(c.issued_by_name || '')}</span></td>
        <td>${c.revoked_at ? `<span class="badge badge-red" title="${esc(c.revoked_reason || '')}">Révoqué</span>` : '<span class="badge badge-green">Valide</span>'}</td>
        <td class="text-right whitespace-nowrap">
          <button onclick="downloadCertPDF(${c.id})" class="text-blue-600 px-1" title="Télécharger le PDF"><i class="fas fa-file-pdf"></i></button>
          <button onclick="showCertQR(${c.id})" class="text-gray-600 px-1" title="QR / lien de vérification"><i class="fas fa-qrcode"></i></button>
          ${App.user.role === 'admin' && !c.revoked_at ? `<button onclick="revokeCert(${c.id})" class="text-red-600 px-1" title="Révoquer"><i class="fas fa-ban"></i></button>` : ''}
        </td>
      </tr>`).join('') || `<tr><td colspan="7" class="text-center py-10 text-gray-400">${family ? 'Aucun document délivré pour vos enfants.' : 'Aucun document. Cliquez sur « Nouveau document ».'}</td></tr>`}</tbody>
    </table>
  </div>`;
};

async function showCertForm(studentId) {
  const students = await db.list('students', 'select=id,first_name,last_name,level,class_name,gender&status=eq.actif&order=last_name.asc');
  const yr = App.currentYear || App.year || '';
  openModal('<i class="fas fa-certificate text-blue-600 mr-2"></i>Délivrer un certificat / une attestation', `
    <form onsubmit="saveCert(event)">
      <label class="${lblCls}">Élève *</label>
      <select id="ct-student" class="${inputCls} mb-3" required>${students.map(s => `<option value="${s.id}" ${s.id == studentId ? 'selected' : ''}>${esc(fullName(s))} — ${esc(s.level)}${s.class_name ? ' ' + esc(s.class_name) : ''}</option>`).join('')}</select>
      <label class="${lblCls}">Type de document *</label>
      <select id="ct-type" class="${inputCls} mb-3" onchange="certTypeChanged()">${Object.entries(CERT_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v} · ${CERT_TYPE_AR[k]}</option>`).join('')}</select>
      <div id="ct-presence" class="hidden grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Du</label><input type="date" id="ct-from" class="${inputCls}"></div>
        <div><label class="${lblCls}">Au</label><input type="date" id="ct-to" class="${inputCls}"></div>
        <p class="col-span-2 text-xs text-gray-500 -mt-1">Le taux de présence est calculé automatiquement à partir des pointages de la période.</p>
      </div>
      <div id="ct-reussite" class="hidden grid grid-cols-3 gap-3 mb-3">
        <div><label class="${lblCls}">Moyenne /20</label><input type="number" step="0.01" min="0" max="20" id="ct-average" class="${inputCls}"></div>
        <div><label class="${lblCls}">Mention</label><input id="ct-mention" class="${inputCls}" placeholder="Bien"></div>
        <div><label class="${lblCls}">Admis en</label><select id="ct-next" class="${inputCls}"><option value="">—</option>${Object.entries(LEVEL_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div>
      <div id="ct-autre" class="hidden mb-3">
        <label class="${lblCls}">Titre</label><input id="ct-title" class="${inputCls} mb-2" placeholder="ATTESTATION">
        <label class="${lblCls}">Texte *</label><textarea id="ct-body" class="${inputCls}" rows="5" placeholder="Je soussigné(e)… certifie que…"></textarea>
      </div>
      <label class="${lblCls}">Signataire</label>
      <input id="ct-signer" class="${inputCls} mb-3" value="${esc(App.cache.certSigner || 'le Directeur')}" placeholder="le Directeur / la Directrice">
      <label class="${lblCls}">Année scolaire</label>
      <input id="ct-year" class="${inputCls} mb-4" value="${esc(yr)}">
      <p class="text-xs text-gray-500 mb-3"><i class="fas fa-lock mr-1"></i>Le document est numéroté, figé et vérifiable en ligne via QR code. Il ne pourra plus être modifié, seulement révoqué.</p>
      <div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}" id="ct-save"><i class="fas fa-stamp mr-1"></i> Délivrer & télécharger</button></div>
    </form>`);
  certTypeChanged();
}
function certTypeChanged() {
  const t = document.getElementById('ct-type').value;
  document.getElementById('ct-presence').classList.toggle('hidden', t !== 'presence');
  document.getElementById('ct-reussite').classList.toggle('hidden', t !== 'reussite');
  document.getElementById('ct-autre').classList.toggle('hidden', t !== 'autre');
}
async function saveCert(e) {
  e.preventDefault();
  const t = document.getElementById('ct-type').value;
  const extra = { signer: document.getElementById('ct-signer').value.trim() || 'le Directeur' };
  if (t === 'presence') { extra.from = document.getElementById('ct-from').value || undefined; extra.to = document.getElementById('ct-to').value || undefined; }
  if (t === 'reussite') { const a = document.getElementById('ct-average').value; if (a) extra.average = Number(a); extra.mention = document.getElementById('ct-mention').value || undefined; extra.next_level = document.getElementById('ct-next').value || undefined; }
  const payload = { student_id: Number(document.getElementById('ct-student').value), type: t, school_year: document.getElementById('ct-year').value.trim() || undefined, extra };
  if (t === 'autre') { payload.title = document.getElementById('ct-title').value.trim() || undefined; payload.body = document.getElementById('ct-body').value.trim(); if (!payload.body) return toast('Le texte est obligatoire', 'error'); }
  App.cache.certSigner = extra.signer;
  const btn = document.getElementById('ct-save'); btn.disabled = true;
  try {
    const r = (await api.post('/certificates', payload)).data;
    closeModal(); toast(`Document ${r.certificate.number} délivré`);
    await renderCertPDF(r.certificate);
    if (App.route === 'certificates') render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); btn.disabled = false; }
}
async function revokeCert(id) {
  const reason = prompt('Motif de la révocation (visible sur la page de vérification) :'); if (reason === null) return;
  try { await api.post(`/certificates/${id}/revoke`, { reason }); toast('Document révoqué'); render(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
async function showCertQR(id) {
  const c = (App.cache.certs || []).find(x => x.id === id); if (!c) return;
  openModal('<i class="fas fa-qrcode mr-2 text-blue-600"></i>Vérification du document', `
    <p class="text-sm text-gray-600 mb-3"><b>${esc(c.number)}</b> — ${esc(c.title)}</p>
    <div id="cert-qr" class="flex justify-center mb-3"></div>
    <input class="${inputCls} text-xs mb-2" readonly value="${esc(c.verify_url)}" onclick="this.select()">
    <div class="flex gap-2 justify-end"><button onclick="navigator.clipboard.writeText('${esc(c.verify_url)}').then(()=>toast('Lien copié 📋'))" class="${btnSecondary} text-sm"><i class="fas fa-copy mr-1"></i> Copier</button><a href="${esc(c.verify_url)}" target="_blank" class="${btnPrimary} text-sm"><i class="fas fa-up-right-from-square mr-1"></i> Ouvrir</a></div>`);
  if (window.QRCode) new QRCode(document.getElementById('cert-qr'), { text: c.verify_url, width: 200, height: 200, colorDark: '#1e3a8a', correctLevel: QRCode.CorrectLevel.M });
}
async function downloadCertPDF(id) {
  const c = (App.cache.certs || []).find(x => x.id === id); if (!c) return;
  const [st, school] = await Promise.all([db.list('students', `select=*&id=eq.${c.student_id}`).then(r => r[0]), db.list('settings', 'select=*&key=eq.school').then(r => r[0]?.value || {})]);
  await renderCertPDF({ ...c, students: st, school });
}
// QR en dataURL via qrcodejs (rendu dans un conteneur caché)
function certQRDataURL(text) {
  return new Promise(res => {
    if (!window.QRCode) return res(null);
    const box = document.createElement('div'); box.style.position = 'fixed'; box.style.left = '-9999px'; document.body.appendChild(box);
    new QRCode(box, { text, width: 256, height: 256, colorDark: '#1e3a8a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    setTimeout(() => { const img = box.querySelector('img'); const cv = box.querySelector('canvas'); const url = (img && img.src && img.src.startsWith('data:')) ? img.src : (cv ? cv.toDataURL('image/png') : null); box.remove(); res(url); }, 150);
  });
}
async function renderCertPDF(c) {
  const st = c.students || {}, school = c.school || {};
  const doc = await pdfDoc(); // A4 portrait 210 x 297
  // Logo / filigrane / cachet
  let logoImg = null, watermark = null, stamp = null, header = null;
  try {
    logoImg = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.crossOrigin = 'anonymous'; im.src = brandLogo(); });
    const mk = (alpha, size) => { const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d'); ctx.globalAlpha = alpha; ctx.drawImage(logoImg, 0, 0, size, size); return cv.toDataURL('image/png'); };
    watermark = mk(0.06, 700); stamp = mk(0.7, 400); header = mk(1, 200);
  } catch (e) {}
  if (watermark) doc.addImage(watermark, 'PNG', 40, 85, 130, 130);
  // Cadre décoratif
  doc.setDrawColor(30, 64, 175); doc.setLineWidth(1.2); doc.rect(8, 8, 194, 281);
  doc.setLineWidth(0.3); doc.rect(11, 11, 188, 275);
  // En-tête
  if (header) doc.addImage(header, 'PNG', 16, 14, 26, 26);
  doc.setTextColor(30, 64, 175); doc.setFontSize(20); doc.setFont(undefined, 'bold');
  doc.text(school.name || brandName(), 105, 22, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(90);
  doc.text([school.address, school.phone, school.email].filter(Boolean).join('  •  '), 105, 29, { align: 'center' });
  doc.setDrawColor(30, 64, 175); doc.setLineWidth(0.6); doc.line(16, 42, 194, 42);
  // Référence
  doc.setFontSize(9); doc.setTextColor(60); doc.setFont(undefined, 'bold');
  doc.text(`N° ${c.number}`, 16, 50);
  doc.setFont(undefined, 'normal');
  doc.text(`Année scolaire ${c.school_year}`, 194, 50, { align: 'right' });
  // Titre
  doc.setFontSize(22); doc.setFont(undefined, 'bold'); doc.setTextColor(30, 64, 175);
  doc.text(c.title, 105, 78, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'normal'); doc.setTextColor(120);
  doc.text(CERT_TYPE_AR[c.type] || 'شهادة', 105, 87, { align: 'center' });
  // Corps
  doc.setTextColor(30); doc.setFontSize(12.5);
  const lines = doc.splitTextToSize(c.body, 160);
  let y = 108; const lh = 8.5;
  for (const ln of lines) { doc.text(ln, 105, y, { align: 'center' }); y += lh; }
  y += 6;
  doc.setFontSize(11);
  doc.text('La présente attestation est délivrée à l\u2019intéressé(e) pour servir et valoir ce que de droit.', 105, y, { align: 'center' }); y += 16;
  // Lieu / date
  const city = (school.address || '').split(',').pop()?.replace(/\d+/g, '').trim() || 'Messadine';
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text(`Fait à ${city}, le ${dayjs(c.issued_at).format('DD/MM/YYYY')}`, 194, Math.max(y, 200), { align: 'right' });
  // Signature + cachet
  const sy = Math.max(y, 200) + 10;
  doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(30);
  doc.text((c.extra?.signer || 'Le Directeur').replace(/^le |^la /i, m => m.charAt(0).toUpperCase() + m.slice(1)), 160, sy, { align: 'center' });
  if (stamp) doc.addImage(stamp, 'PNG', 140, sy + 3, 40, 40);
  doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(120);
  doc.text('Signature et cachet', 160, sy + 47, { align: 'center' });
  // QR de vérification
  const qr = await certQRDataURL(c.verify_url);
  if (qr) doc.addImage(qr, 'PNG', 18, sy - 2, 38, 38);
  doc.setFontSize(7.5); doc.setTextColor(100);
  doc.text('Vérifier l\u2019authenticité :', 37, sy + 40, { align: 'center' });
  doc.text('scannez le QR code', 37, sy + 44, { align: 'center' });
  // Pied
  doc.setFontSize(6.5); doc.setTextColor(150);
  doc.text(`Document ${c.number} • empreinte ${String(c.fingerprint || '').slice(0, 24)}… • ${c.verify_url}`, 105, 283, { align: 'center' });
  if (c.revoked_at) { doc.setTextColor(220, 38, 38); doc.setFontSize(40); doc.setFont(undefined, 'bold'); doc.text('RÉVOQUÉ', 105, 160, { align: 'center', angle: 25 }); }
  doc.save(`${c.number}_${(st.last_name || '').replace(/\s+/g, '_')}_${(st.first_name || '').replace(/\s+/g, '_')}.pdf`);
}
