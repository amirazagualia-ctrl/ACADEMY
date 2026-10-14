/* ============================================================
   Rahma Academy - Feature 57 : Éditeur final « Édition / Aperçu » + Thème du devoir
   - Thème « officiel » : en-tête tunisien 3 cadres (دائرة التفقد / اسم المدرسة / الأستاذ / التوقيت · عنوان الامتحان / المادة
     · السنة الدراسية / الثلاثي / الاسم و اللقب / القسم) + جدول إسناد الأعداد (réservé à l'enseignant)
   - Thème « coloré » : fiche illustrée (bandeau tricolore)
   - Alerte barème ≠ 20, Aperçu plein écran (page A4, zoom, sauts de page, cases d'évaluation, PDF, بصمة الفرض)
   Chargé après views-eva-i18n.js et avant views-evaluations.js.
   ============================================================ */

const EVA_THEMES = {
  officiel: { label: { fr: 'Officiel (ministère)', ar: 'رسمي (وزارة)', en: 'Official (ministry)' }, desc: { fr: 'En-tête à 3 cadres, grille d\'attribution des points, noir & blanc — impression économique.', ar: 'ترويسة بثلاثة إطارات، جدول إسناد الأعداد، أبيض وأسود — طباعة اقتصادية.', en: '3-box header, marks grid, black & white — cheap to print.' }, icon: 'fa-stamp' },
  colore:   { label: { fr: 'Coloré (fiche illustrée)', ar: 'ملوّن (بطاقة مصوّرة)', en: 'Colourful (illustrated sheet)' }, desc: { fr: 'Bandeau tricolore, numéros rouges, cadres bleus — style fiche d\'évaluation primaire.', ar: 'شريط ثلاثي الألوان، أرقام حمراء، إطارات زرقاء — نمط بطاقة التقييم الابتدائي.', en: 'Tricolour band, red numbers, blue frames — primary worksheet style.' }, icon: 'fa-palette' }
};
const EVA_HEAD_I18N = {
  fr: { inspection: 'Circonscription', school: 'École', teacher: 'Enseignant(e)', duration: 'Durée', title: 'Titre de l\'examen', subject: 'Matière', year: 'Année scolaire', term: 'Trimestre', name: 'Nom et prénom', class: 'Classe', grid: 'Tableau d\'attribution des points (réservé à l\'enseignant)', noEx: 'Aucun exercice pour le moment', exN: 'Ex.', total: 'Total', obs: 'Observation', fingerprint: 'Empreinte du devoir', min: 'min', termN: t => `${t}${t === 1 ? 'er' : 'ème'} trimestre` },
  ar: { inspection: 'دائرة التفقد', school: 'اسم المدرسة', teacher: 'الأستاذ', duration: 'التوقيت', title: 'عنوان الامتحان', subject: 'المادة', year: 'السنة الدراسية', term: 'الثلاثي', name: 'الاسم و اللقب', class: 'القسم', grid: 'جدول إسناد الأعداد (خاص بالمعلم)', noEx: 'لا توجد تمارين بعد', exN: 'تمرين', total: 'المجموع', obs: 'ملاحظة', fingerprint: 'بصمة الفرض', min: 'دقيقة', termN: t => `الثلاثي ${['الأول', 'الثاني', 'الثالث'][t - 1]}` },
  en: { inspection: 'District', school: 'School', teacher: 'Teacher', duration: 'Duration', title: 'Exam title', subject: 'Subject', year: 'School year', term: 'Term', name: 'Full name', class: 'Class', grid: 'Marks allocation table (teacher only)', noEx: 'No exercise yet', exN: 'Ex.', total: 'Total', obs: 'Remark', fingerprint: 'Exam fingerprint', min: 'min', termN: t => `Term ${t}` }
};
const evaH = (k, doc) => { const l = (doc || EVA.doc || {}).lang; const L = EVA_HEAD_I18N[l] || EVA_HEAD_I18N.fr; return L[k] ?? EVA_HEAD_I18N.fr[k]; };
const evaTheme = (doc) => (doc || EVA.doc || {}).header?.theme || 'officiel';
const evaSubjectName = (doc) => { const d = doc || EVA.doc; return d.subjects?.name || (App.cache.subjects || []).find(s => String(s.id) === String(d.subject_id))?.name || d.source?.wizard?.subject_label || ''; };
const evaYearLabel = () => App.year || App.years?.find(y => y.is_current)?.label || '';
const EVA_DOTS = '<span class="inline-block border-b border-dotted border-gray-700 flex-1 min-w-[60px] mx-1"></span>';

// En-tête officiel (HTML) — 3 cadres
function evaOfficialHeaderHtml(doc, mode, att) {
  const rtl = typeof evaIsRtl === 'function' ? evaIsRtl(doc) : doc.lang === 'ar'; const H = doc.header || {}; const T = k => evaH(k, doc);
  const row = (lbl, val) => `<div class="flex items-baseline text-[13px] leading-6"><span class="whitespace-nowrap">${lbl}</span>${val ? `<span class="mx-1 font-semibold">${esc(val)}</span>` : EVA_DOTS}</div>`;
  const student = att?.students ? `${att.students.first_name} ${att.students.last_name}` : '';
  return `<header class="mb-3 ${rtl ? 'text-right' : ''}" ${rtl ? 'dir="rtl"' : ''}>
    <div class="grid grid-cols-3 border border-gray-800 divide-x divide-gray-800 ${rtl ? 'divide-x-reverse' : ''}">
      <div class="p-2">${row(T('inspection') + ' :', H.inspection)}${row(T('school') + ' :', H.school || App.settings?.school_name)}${row(T('teacher') + ' :', H.teacher_name)}${row(T('duration') + ' :', doc.duration_min ? doc.duration_min + ' ' + T('min') : '')}</div>
      <div class="p-2 flex flex-col justify-center gap-1">${row(T('title') + ' :', doc.title)}${row(T('subject') + ' :', evaSubjectName(doc) || (typeof evaT === 'function' ? evaT('kinds', doc.kind, doc) : doc.kind))}</div>
      <div class="p-2">${row(T('year') + ' :', evaYearLabel())}${row(T('term') + ' :', doc.trimester ? T('termN')(doc.trimester) : '')}${row(T('name') + ' :', student)}${row(T('class') + ' :', typeof evaT === 'function' ? evaT('levels', doc.level, doc) : doc.level)}</div>
    </div>
    ${H.instructions ? `<div class="border border-t-0 border-gray-800 px-2 py-1 text-[12px] italic">${esc(H.instructions)}</div>` : ''}
    ${mode !== 'answer' && H.show_grid !== false ? evaMarksGridHtml(doc, att) : ''}
  </header>`;
}
// جدول إسناد الأعداد : une colonne par exercice + total ; rempli en mode correction
function evaMarksGridHtml(doc, att) {
  const T = k => evaH(k, doc); const items = []; (doc.sections || []).forEach((s, si) => (s.items || []).forEach((it, ii) => items.push({ key: `s${si}i${it._ii ?? ii}`, pts: Number(it.points) || 0 })));
  const total = items.reduce((a, b) => a + b.pts, 0); const cell = 'border border-gray-800 px-1 py-0.5 text-center';
  if (!items.length) return `<div class="border border-gray-800 mt-2 text-center text-[12px]"><div class="font-bold py-1 border-b border-gray-800">${T('grid')}</div><div class="py-2 italic text-gray-500">${T('noEx')}</div></div>`;
  const sc = att?.item_scores || {};
  return `<div class="border border-gray-800 mt-2 text-[12px]"><div class="font-bold py-1 text-center border-b border-gray-800">${T('grid')}</div>
    <table class="w-full border-collapse"><tr>${items.map((_, i) => `<td class="${cell} bg-gray-50 font-semibold">${T('exN')} ${i + 1}</td>`).join('')}<td class="${cell} bg-gray-100 font-bold">${T('total')}</td><td class="${cell} bg-gray-100 font-bold w-28">${T('obs')}</td></tr>
    <tr>${items.map(x => `<td class="${cell} h-7">${att ? `<b>${sc[x.key] ?? ''}</b><span class="text-gray-400">/${x.pts}</span>` : `<span class="text-gray-400">… /${x.pts}</span>`}</td>`).join('')}<td class="${cell} font-bold">${att?.score != null ? att.score : '…'} /${total}</td><td class="${cell}"></td></tr></table></div>`;
}
// Alerte barème : total ≠ 20
function evaScoreAlertHtml(doc) {
  const total = evaTotal(doc); const n = (doc.sections || []).reduce((a, s) => a + (s.items || []).length, 0);
  if (total === 20) return `<div class="rounded-lg border border-green-300 bg-green-50 text-green-800 text-xs p-2 flex items-center gap-2"><i class="fas fa-circle-check"></i>Total du barème : <b>20 / 20</b> · ${n} exercice(s)</div>`;
  const diff = Math.round((20 - total) * 100) / 100;
  return `<div class="rounded-lg border border-red-300 bg-red-50 text-red-800 text-xs p-2"><p class="font-bold"><i class="fas fa-triangle-exclamation mr-1"></i>Total des points incorrect</p><p>Le total actuel est <b>${total} / 20</b> — il ${diff > 0 ? 'manque ' + diff : 'y a ' + (-diff) + ' en trop'} point(s).</p><p class="text-[11px] text-red-700/80 mt-1">Ajustez les points ou le nombre d'exercices, ou <button onclick="evaAutoBalance()" class="underline font-semibold">répartir automatiquement sur 20</button>.</p></div>`;
}
function evaAutoBalance() {
  const items = EVA.doc.sections.flatMap(s => s.items); if (!items.length) return;
  const w = items.map(it => it.type === 'open' ? 3 : (it.type === 'fill' || it.type === 'conjug') ? 2 : 1); const W = w.reduce((a, b) => a + b, 0);
  let acc = 0; items.forEach((it, i) => { if (i === items.length - 1) it.points = Math.round((20 - acc) * 2) / 2; else { it.points = Math.max(0.5, Math.round(20 * w[i] / W * 2) / 2); acc += it.points; } });
  evaRefreshSections(); toast('Barème réparti sur 20');
}
// Empreinte du devoir (hash court du contenu) — identifie une version imprimée
async function evaFingerprint(doc) {
  const src = JSON.stringify({ t: doc.title, l: doc.level, s: (doc.sections || []).map(s => ({ t: s.title, x: s.text, i: (s.items || []).map(it => ({ ...it, _ii: undefined })) })) });
  try { const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src)); return [...new Uint8Array(buf)].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(); } catch { return String(src.length); }
}

// Modale « Thème du devoir »
function evaThemeModal() {
  const cur = evaTheme(); const l = EVA.doc.lang || 'fr'; const H = EVA.doc.header || (EVA.doc.header = {});
  openModal('<i class="fas fa-palette mr-2 text-blue-600"></i>Thème du devoir', `
    <div class="grid md:grid-cols-2 gap-3 mb-4">${Object.entries(EVA_THEMES).map(([k, t]) => `<button onclick="EVA.doc.header.theme='${k}'; closeModal(); evaBuilder()" class="text-left border-2 rounded-xl p-4 ${cur === k ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}"><div class="flex items-center gap-2 mb-1"><i class="fas ${t.icon} text-blue-700"></i><b>${esc(t.label[l] || t.label.fr)}</b>${cur === k ? '<i class="fas fa-check text-blue-600 ml-auto"></i>' : ''}</div><p class="text-xs text-gray-500">${esc(t.desc[l] || t.desc.fr)}</p></button>`).join('')}</div>
    <h4 class="font-bold text-sm text-gray-700 mb-2">En-tête officiel</h4>
    <div class="grid md:grid-cols-2 gap-2 text-sm">
      <div><label class="${lblCls}">${evaH('inspection')}</label><input class="${inputCls}" value="${esc(H.inspection || '')}" oninput="EVA.doc.header.inspection=this.value"></div>
      <div><label class="${lblCls}">${evaH('school')}</label><input class="${inputCls}" value="${esc(H.school ?? (App.settings?.school_name || ''))}" oninput="EVA.doc.header.school=this.value"></div>
      <div><label class="${lblCls}">${evaH('teacher')}</label><input class="${inputCls}" value="${esc(H.teacher_name || '')}" oninput="EVA.doc.header.teacher_name=this.value"></div>
      <div><label class="${lblCls}">Consignes générales</label><input class="${inputCls}" value="${esc(H.instructions || '')}" oninput="EVA.doc.header.instructions=this.value"></div>
    </div>
    <div class="flex flex-wrap gap-4 mt-3 text-sm"><label class="flex items-center gap-2"><input type="checkbox" ${H.show_grid !== false ? 'checked' : ''} onchange="EVA.doc.header.show_grid=this.checked" class="w-4 h-4"> ${evaH('grid').split(' (')[0]}</label><label class="flex items-center gap-2"><input type="checkbox" ${H.show_logo !== false ? 'checked' : ''} onchange="EVA.doc.header.show_logo=this.checked" class="w-4 h-4"> Logo (thème coloré)</label><label class="flex items-center gap-2"><input type="checkbox" ${H.page_breaks ? 'checked' : ''} onchange="EVA.doc.header.page_breaks=this.checked" class="w-4 h-4"> Saut de page entre sections (PDF)</label></div>
    <div class="flex justify-end gap-2 mt-4"><button onclick="closeModal(); evaBuilder()" class="${btnPrimary}">Appliquer</button></div>`, { wide: true });
}

// Mode Aperçu plein écran (page A4, zoom, options)
let _evaPrevZoom = 100, _evaPrevOpts = { grid: true, breaks: true };
async function evaPreviewMode() {
  const d = { ...EVA.doc, total_points: evaTotal(EVA.doc) }; const fp = await evaFingerprint(d); const rtl = typeof evaIsRtl === 'function' ? evaIsRtl(d) : d.lang === 'ar';
  document.getElementById('eva-preview-mode')?.remove();
  const wrap = document.createElement('div'); wrap.id = 'eva-preview-mode'; wrap.className = 'fixed inset-0 z-[58] bg-gray-200 flex flex-col';
  const mi = (onclick, icon, label) => `<button onclick="${onclick}" class="w-full text-left px-4 py-2 hover:bg-gray-50"><i class="fas ${icon} w-5"></i>${label}</button>`;
  wrap.innerHTML = `<div class="bg-white border-b px-4 py-2 flex items-center gap-2 flex-wrap">
      <div class="inline-flex rounded-lg overflow-hidden border"><button onclick="evaClosePreview()" class="px-3 py-1.5 text-sm hover:bg-gray-50"><i class="fas fa-pen mr-1"></i>Édition</button><button class="px-3 py-1.5 text-sm bg-blue-900 text-white"><i class="fas fa-eye mr-1"></i>Aperçu</button></div>
      <span class="text-sm font-bold text-gray-700 ml-2">${esc(d.title || 'Sans titre')}</span><span class="text-xs text-gray-400">· ${(d.sections || []).reduce((a, s) => a + s.items.length, 0)} exercices · ${evaTotal(d)}/20</span>
      <div class="ml-auto flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1"><button onclick="evaZoom(-10)" class="px-2 text-gray-600"><i class="fas fa-magnifying-glass-minus"></i></button><span class="text-xs font-semibold w-12 text-center" id="eva-zoom-lbl">${_evaPrevZoom}%</span><button onclick="evaZoom(10)" class="px-2 text-gray-600"><i class="fas fa-magnifying-glass-plus"></i></button><button onclick="evaZoom(0)" class="px-2 text-gray-600" title="Ajuster"><i class="fas fa-expand"></i></button></div>
      <div class="relative"><button onclick="document.getElementById('eva-prev-menu').classList.toggle('hidden')" class="${btnSecondary} py-1.5"><i class="fas fa-ellipsis-vertical"></i></button>
        <div id="eva-prev-menu" class="hidden absolute right-0 mt-1 w-64 bg-white border rounded-xl shadow-xl z-10 text-sm py-1">
          ${mi('evaPdf(EVA.doc,false)', 'fa-file-pdf text-red-600', 'Télécharger PDF')}${mi('evaPdf(EVA.doc,true)', 'fa-key text-amber-600', 'Télécharger le corrigé')}
          ${mi('_evaPrevOpts.grid=!_evaPrevOpts.grid; evaPreviewMode()', _evaPrevOpts.grid ? 'fa-eye-slash' : 'fa-eye', (_evaPrevOpts.grid ? 'Masquer' : 'Afficher') + " les cases d'évaluation")}
          ${mi('_evaPrevOpts.breaks=!_evaPrevOpts.breaks; evaPreviewMode()', 'fa-grip-lines', (_evaPrevOpts.breaks ? 'Masquer' : 'Afficher') + ' les sauts de page')}
          ${mi('evaClosePreview(); evaThemeModal()', 'fa-palette', 'Thème du devoir')}
          <div class="border-t my-1"></div><div class="px-4 py-2 text-xs text-gray-500"><i class="fas fa-fingerprint w-5"></i>${evaH('fingerprint', d)} : <b class="font-mono">${fp}</b></div>
        </div></div>
      <button onclick="evaClosePreview()" class="text-gray-400 hover:text-gray-700 text-xl ml-1">&times;</button>
    </div>
    <div class="flex-1 overflow-auto p-6" id="eva-prev-scroll"><div id="eva-prev-page" style="width:210mm;min-height:297mm;transform-origin:top center;transform:scale(${_evaPrevZoom / 100})" class="mx-auto bg-white shadow-2xl p-[14mm] text-[13px] relative ${rtl ? 'font-[Amiri,serif]' : ''}">${evaFicheHtml({ ...d, header: { ...(d.header || {}), show_grid: _evaPrevOpts.grid } }, 'preview')}<p class="text-[10px] text-gray-400 text-center mt-6 border-t pt-1">${esc(App.settings?.school_name || 'Rahma Academy')} · ${evaH('fingerprint', d)} ${fp} · ${evaYearLabel()}</p></div></div>`;
  document.body.appendChild(wrap);
  if (_evaPrevOpts.breaks) evaMarkPageBreaks();
}
function evaClosePreview() { document.getElementById('eva-preview-mode')?.remove(); }
function evaZoom(d) { if (d === 0) { const w = document.getElementById('eva-prev-scroll').clientWidth - 48; _evaPrevZoom = Math.min(100, Math.floor(w / (210 * 3.78) * 100)); } else _evaPrevZoom = Math.min(200, Math.max(30, _evaPrevZoom + d)); const pg = document.getElementById('eva-prev-page'); if (pg) pg.style.transform = `scale(${_evaPrevZoom / 100})`; const l = document.getElementById('eva-zoom-lbl'); if (l) l.textContent = _evaPrevZoom + '%'; }
// Lignes de saut de page approximatives (A4 = 297 mm)
function evaMarkPageBreaks() {
  const pg = document.getElementById('eva-prev-page'); if (!pg) return; const h = pg.scrollHeight; const pageH = 297 * 3.7795; let n = 1;
  for (let y = pageH; y < h; y += pageH) { const line = document.createElement('div'); line.className = 'absolute left-0 right-0 border-t-2 border-dashed border-red-300 text-[9px] text-red-400 text-right pr-1 pointer-events-none'; line.style.top = y + 'px'; line.textContent = `— page ${++n} —`; pg.appendChild(line); }
}

// En-tête officiel pour jsPDF (3 cadres + grille des points). Retourne la nouvelle ordonnée y.
function evaPdfOfficialHeader(pdf, doc, opts) {
  const { W, M, rtl, corrige, att } = opts; const T = k => evaH(k, doc); const H = doc.header || {}; let y = 12;
  const colW = (W - 2 * M) / 3; const boxH = 30; pdf.setDrawColor(0); pdf.setLineWidth(0.4); pdf.rect(M, y, W - 2 * M, boxH); pdf.line(M + colW, y, M + colW, y + boxH); pdf.line(M + 2 * colW, y, M + 2 * colW, y + boxH);
  pdf.setFontSize(10); pdf.setTextColor(0);
  const dotted = (x1, x2, yy) => { pdf.setLineDashPattern([0.5, 0.8], 0); pdf.line(x1, yy + 0.8, x2, yy + 0.8); pdf.setLineDashPattern([], 0); };
  // ligne « libellé : valeur » ; sens RTL : libellé à droite, pointillés vers la gauche
  const row = (col, i, lbl, val) => {
    const x0 = M + col * colW + 2, x1 = M + (col + 1) * colW - 2; const yy = y + 6 + i * 6.2;
    if (rtl) { pdf.setFont(undefined, 'normal'); pdf.text(lbl, x1, yy, { align: 'right' }); const lw = pdf.getTextWidth(lbl) + 2; if (val) { pdf.setFont(undefined, 'bold'); pdf.text(String(val), x1 - lw, yy, { align: 'right' }); } else dotted(x0, x1 - lw, yy); }
    else { pdf.setFont(undefined, 'normal'); pdf.text(lbl, x0, yy); const lw = pdf.getTextWidth(lbl) + 2; if (val) { pdf.setFont(undefined, 'bold'); pdf.text(String(val), x0 + lw, yy); } else dotted(x0 + lw, x1, yy); }
  };
  const student = att?.students ? `${att.students.first_name} ${att.students.last_name}` : '';
  const c = rtl ? [2, 1, 0] : [0, 1, 2]; // colonne gauche (visuel) = infos école en LTR ; en RTL elles passent à droite
  row(c[0], 0, T('inspection') + ' :', H.inspection); row(c[0], 1, T('school') + ' :', H.school || App.settings?.school_name); row(c[0], 2, T('teacher') + ' :', H.teacher_name); row(c[0], 3, T('duration') + ' :', doc.duration_min ? doc.duration_min + ' ' + T('min') : '');
  row(c[1], 1, T('title') + ' :', doc.title); row(c[1], 2, T('subject') + ' :', evaSubjectName(doc) || (typeof evaT === 'function' ? evaT('kinds', doc.kind, doc) : doc.kind));
  row(c[2], 0, T('year') + ' :', evaYearLabel()); row(c[2], 1, T('term') + ' :', doc.trimester ? T('termN')(doc.trimester) : ''); row(c[2], 2, T('name') + ' :', student); row(c[2], 3, T('class') + ' :', typeof evaT === 'function' ? evaT('levels', doc.level, doc) : doc.level);
  y += boxH;
  if (H.instructions) { pdf.rect(M, y, W - 2 * M, 7); pdf.setFontSize(9); pdf.setFont(undefined, 'italic'); if (rtl) pdf.text(String(H.instructions), W - M - 2, y + 4.8, { align: 'right' }); else pdf.text(String(H.instructions), M + 2, y + 4.8); y += 7; }
  // Grille des points
  if (H.show_grid !== false) {
    const items = []; (doc.sections || []).forEach((s, si) => (s.items || []).forEach((it, ii) => items.push({ key: `s${si}i${it._ii ?? ii}`, pts: Number(it.points) || 0 }))); const total = items.reduce((a, b) => a + b.pts, 0);
    y += 3; pdf.rect(M, y, W - 2 * M, 7); pdf.setFontSize(9.5); pdf.setFont(undefined, 'bold'); pdf.text(T('grid'), W / 2, y + 4.8, { align: 'center' }); y += 7;
    if (!items.length) { pdf.rect(M, y, W - 2 * M, 8); pdf.setFont(undefined, 'italic'); pdf.setTextColor(120); pdf.text(T('noEx'), W / 2, y + 5.2, { align: 'center' }); pdf.setTextColor(0); y += 8; }
    else {
      const obsW = 36, totW = 22; const cw = (W - 2 * M - obsW - totW) / items.length; const cols = items.map((it, i) => ({ x: M + (rtl ? W - 2 * M - obsW - totW - (i + 1) * cw : i * cw), w: cw, lbl: `${T('exN')} ${i + 1}`, val: att ? `${att.item_scores?.[it.key] ?? ''} /${it.pts}` : `/${it.pts}` }));
      cols.push({ x: rtl ? M + obsW : M + items.length * cw, w: totW, lbl: T('total'), val: att?.score != null ? `${att.score} /${total}` : `/${total}`, bold: true });
      cols.push({ x: rtl ? M : W - M - obsW, w: obsW, lbl: T('obs'), val: '' });
      pdf.setFontSize(8.5);
      for (const col of cols) { pdf.setFillColor(243, 244, 246); pdf.rect(col.x, y, col.w, 6, 'FD'); pdf.setFont(undefined, 'bold'); pdf.text(col.lbl, col.x + col.w / 2, y + 4.2, { align: 'center' }); pdf.rect(col.x, y + 6, col.w, 8); pdf.setFont(undefined, col.bold ? 'bold' : 'normal'); pdf.setTextColor(att ? 0 : 120); pdf.text(col.val, col.x + col.w / 2, y + 11.5, { align: 'center' }); pdf.setTextColor(0); }
      y += 14;
    }
  }
  if (corrige) { pdf.setFontSize(9); pdf.setTextColor(185, 28, 28); pdf.setFont(undefined, 'bold'); pdf.text(T('key') || (typeof evaT === 'function' ? evaT('ui', 'key', doc) : 'CORRIGÉ'), rtl ? M : W - M, y + 4, { align: rtl ? 'left' : 'right' }); pdf.setTextColor(0); }
  return y + 6;
}
