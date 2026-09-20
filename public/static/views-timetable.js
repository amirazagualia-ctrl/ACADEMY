/* ============================================================
   EMPLOI DU TEMPS (جدول الأوقات) — tous niveaux + par enseignant
   Stockage : settings.timetable_<LEVEL> = { slots: [...] }
   slot = { id, day(1-6), start('08:00'), end('10:00'), subject, teacher_id, room }
   ============================================================ */

const TT_DAYS = [
  { k: 1, label: 'Lundi', ar: 'الإثنين' },
  { k: 2, label: 'Mardi', ar: 'الثلاثاء' },
  { k: 3, label: 'Mercredi', ar: 'الأربعاء' },
  { k: 4, label: 'Jeudi', ar: 'الخميس' },
  { k: 5, label: 'Vendredi', ar: 'الجمعة' },
  { k: 6, label: 'Samedi', ar: 'السبت' }
];
const TT_COLORS = [
  ['bg-blue-100', 'border-blue-400', 'text-blue-800'],
  ['bg-emerald-100', 'border-emerald-400', 'text-emerald-800'],
  ['bg-amber-100', 'border-amber-400', 'text-amber-800'],
  ['bg-purple-100', 'border-purple-400', 'text-purple-800'],
  ['bg-rose-100', 'border-rose-400', 'text-rose-800'],
  ['bg-cyan-100', 'border-cyan-400', 'text-cyan-800'],
  ['bg-lime-100', 'border-lime-400', 'text-lime-800'],
  ['bg-orange-100', 'border-orange-400', 'text-orange-800'],
  ['bg-indigo-100', 'border-indigo-400', 'text-indigo-800'],
  ['bg-teal-100', 'border-teal-400', 'text-teal-800']
];
function ttColor(subject) {
  let h = 0; const s = String(subject || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TT_COLORS[h % TT_COLORS.length];
}
function ttMin(t) { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); }
function ttTeacherName(t) { return t ? `${t.first_name} ${t.last_name}` : ''; }

VIEWS.timetable = async function(el) {
  const tt = App.cache.tt = App.cache.tt || { mode: 'level', level: null, teacherId: null };

  // Chargement : tous les emplois du temps + enseignants + matières (+ enfants pour parent/élève)
  const [rows, teachers, subjects, kids] = await Promise.all([
    db.list('settings', 'select=key,value&key=like.timetable_*').catch(() => []),
    db.list('teachers', 'select=id,first_name,last_name,subject,email&status=eq.actif&order=last_name.asc').catch(() => []),
    db.list('subjects', 'select=name,cycle&order=name.asc').catch(() => []),
    isParentOrStudent() ? db.list('students', 'select=id,level').catch(() => []) : Promise.resolve([])
  ]);
  const all = {}; // level -> slots[]
  rows.forEach(r => {
    const lvl = r.key.replace('timetable_', '');
    all[lvl] = Array.isArray(r.value?.slots) ? r.value.slots : [];
  });
  tt.all = all; tt.teachers = teachers; tt.subjects = subjects;

  // Niveau par défaut : enfant du parent/élève, sinon premier niveau ayant un emploi du temps, sinon 1AP
  if (!tt.level) {
    if (kids.length) tt.level = kids[0].level;
    else tt.level = ALL_LEVELS.find(l => (all[l] || []).length) || '1AP';
  }
  // Enseignant connecté : onglet "Par enseignant" par défaut, sa fiche présélectionnée
  if (App.user.role === 'teacher' && tt.teacherId === null) {
    const me = teachers.find(t => (t.email || '').toLowerCase() === (App.user.email || '').toLowerCase());
    // email non chargé → tentative par nom
    const me2 = me || teachers.find(t => ttTeacherName(t).toLowerCase() === (App.user.name || '').toLowerCase());
    if (me2) { tt.teacherId = me2.id; tt.mode = tt.modeSet ? tt.mode : 'teacher'; tt.modeSet = true; }
  }
  if (!tt.teacherId && teachers.length) tt.teacherId = teachers[0].id;

  el.innerHTML = pageHeader('Emploi du temps <span class="text-base font-normal text-gray-500">جدول الأوقات</span>', 'fa-calendar-week',
    `<button onclick="ttPrint()" class="${btnSecondary}"><i class="fas fa-print mr-1"></i> Imprimer</button>` +
    (isAdmin() && tt.mode === 'level' ? `<button onclick="ttCopyForm()" class="${btnSecondary}"><i class="fas fa-copy mr-1"></i> Dupliquer</button>
      <button onclick="ttSlotForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Ajouter une séance</button>` : '')) + `

  <div class="flex flex-wrap items-center gap-3 mb-5">
    <div class="inline-flex rounded-lg border overflow-hidden">
      <button onclick="ttSetMode('level')" class="px-4 py-2 text-sm font-medium ${tt.mode === 'level' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}"><i class="fas fa-school mr-1"></i> Par niveau</button>
      <button onclick="ttSetMode('teacher')" class="px-4 py-2 text-sm font-medium ${tt.mode === 'teacher' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}"><i class="fas fa-chalkboard-user mr-1"></i> Par enseignant</button>
    </div>
    ${tt.mode === 'level' ? `
      <select id="tt-level" onchange="App.cache.tt.level=this.value;render()" class="border rounded-lg px-3 py-2 text-sm">
        ${levelOptions(tt.level)}
      </select>
      <span class="text-xs text-gray-400">${(all[tt.level] || []).length} séance(s)</span>` : `
      <select id="tt-teacher" onchange="App.cache.tt.teacherId=Number(this.value);render()" class="border rounded-lg px-3 py-2 text-sm">
        ${teachers.map(t => `<option value="${t.id}" ${t.id === tt.teacherId ? 'selected' : ''}>${esc(ttTeacherName(t))}${t.subject ? ' — ' + esc(t.subject) : ''}</option>`).join('') || '<option value="">Aucun enseignant</option>'}
      </select>`}
  </div>

  <div id="tt-grid">${tt.mode === 'level' ? ttLevelGrid(tt.level) : ttTeacherGrid(tt.teacherId)}</div>`;
};

function ttSetMode(m) { App.cache.tt.mode = m; App.cache.tt.modeSet = true; render(); }

// ---------- Rendus des grilles ----------
function ttSlotCard(s, opts = {}) {
  const [bg, border, txt] = ttColor(s.subject);
  const t = (App.cache.tt.teachers || []).find(x => x.id === Number(s.teacher_id));
  return `
  <div class="${bg} ${txt} border-l-4 ${border} rounded-lg px-2.5 py-2 text-xs shadow-sm relative group">
    <div class="font-bold text-[13px] leading-tight">${esc(s.subject)}</div>
    <div class="mt-0.5 opacity-80"><i class="far fa-clock mr-1"></i>${esc(s.start)} – ${esc(s.end)}</div>
    ${opts.showLevel ? `<div class="opacity-80"><i class="fas fa-school mr-1"></i>${esc(LEVEL_LABELS[opts.level] || opts.level)}</div>` : ''}
    ${t && !opts.hideTeacher ? `<div class="opacity-80 truncate"><i class="fas fa-user-tie mr-1"></i>${esc(ttTeacherName(t))}</div>` : ''}
    ${s.room ? `<div class="opacity-80"><i class="fas fa-door-open mr-1"></i>${esc(s.room)}</div>` : ''}
    ${isAdmin() && !opts.readonly ? `
    <div class="absolute top-1 right-1 hidden group-hover:flex gap-1 bg-white/80 rounded px-1">
      <button onclick="ttSlotForm('${s.id}')" class="text-amber-600 hover:text-amber-800 px-0.5"><i class="fas fa-pen text-[11px]"></i></button>
      <button onclick="ttSlotDelete('${s.id}')" class="text-red-600 hover:text-red-800 px-0.5"><i class="fas fa-trash text-[11px]"></i></button>
    </div>` : ''}
  </div>`;
}

function ttLevelGrid(level) {
  const slots = (App.cache.tt.all[level] || []).slice().sort((a, b) => ttMin(a.start) - ttMin(b.start));
  const empty = !slots.length;
  return `
  <div class="bg-white rounded-xl shadow p-4 overflow-x-auto">
    <div class="mb-3 flex items-center gap-2">
      <span class="text-sm font-bold text-gray-700">${esc(LEVEL_LABELS[level] || level)}</span>
      <span class="text-xs text-gray-400" dir="rtl">جدول أوقات ${esc(level)}</span>
    </div>
    ${empty ? `<p class="text-center text-gray-400 py-10"><i class="fas fa-calendar-xmark text-3xl mb-2 block"></i>Aucune séance pour ce niveau${isAdmin() ? ' — cliquez sur « Ajouter une séance »' : ''}</p>` : `
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 min-w-[640px]">
      ${TT_DAYS.map(d => `
      <section class="rounded-lg bg-gray-50 border p-2">
        <h4 class="text-center text-xs font-bold text-gray-600 mb-2">${d.label}<span class="block text-[10px] text-gray-400">${d.ar}</span></h4>
        <div class="space-y-2">
          ${slots.filter(s => Number(s.day) === d.k).map(s => ttSlotCard(s)).join('') || '<p class="text-center text-[10px] text-gray-300 py-3">—</p>'}
        </div>
      </section>`).join('')}
    </div>`}
  </div>`;
}

function ttTeacherGrid(teacherId) {
  const tt = App.cache.tt;
  const t = (tt.teachers || []).find(x => x.id === Number(teacherId));
  // Rassembler les séances de cet enseignant sur TOUS les niveaux
  const slots = [];
  Object.entries(tt.all).forEach(([lvl, arr]) => (arr || []).forEach(s => {
    if (Number(s.teacher_id) === Number(teacherId)) slots.push({ ...s, _level: lvl });
  }));
  slots.sort((a, b) => ttMin(a.start) - ttMin(b.start));
  const total = slots.reduce((acc, s) => acc + Math.max(0, ttMin(s.end) - ttMin(s.start)), 0);
  return `
  <div class="bg-white rounded-xl shadow p-4 overflow-x-auto">
    <div class="mb-3 flex flex-wrap items-center gap-3">
      <span class="text-sm font-bold text-gray-700"><i class="fas fa-chalkboard-user text-blue-600 mr-1"></i>${t ? esc(ttTeacherName(t)) : '—'}</span>
      ${t?.subject ? `<span class="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5">${esc(t.subject)}</span>` : ''}
      <span class="text-xs text-gray-400">${slots.length} séance(s) · ${(total / 60).toFixed(1).replace('.0', '')} h / semaine</span>
    </div>
    ${!slots.length ? `<p class="text-center text-gray-400 py-10"><i class="fas fa-calendar-xmark text-3xl mb-2 block"></i>Aucune séance pour cet enseignant</p>` : `
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 min-w-[640px]">
      ${TT_DAYS.map(d => `
      <section class="rounded-lg bg-gray-50 border p-2">
        <h4 class="text-center text-xs font-bold text-gray-600 mb-2">${d.label}<span class="block text-[10px] text-gray-400">${d.ar}</span></h4>
        <div class="space-y-2">
          ${slots.filter(s => Number(s.day) === d.k).map(s => ttSlotCard(s, { showLevel: true, level: s._level, hideTeacher: true, readonly: true })).join('') || '<p class="text-center text-[10px] text-gray-300 py-3">—</p>'}
        </div>
      </section>`).join('')}
    </div>`}
  </div>`;
}

// ---------- Édition (admin) ----------
function ttSlotForm(id) {
  const tt = App.cache.tt;
  const slots = tt.all[tt.level] || [];
  const s = id ? slots.find(x => String(x.id) === String(id)) || {} : {};
  const cycle = cycleOfLevel(tt.level);
  const subjNames = [...new Set((tt.subjects || []).filter(x => x.cycle === cycle).map(x => x.name))];
  if (s.subject && !subjNames.includes(s.subject)) subjNames.unshift(s.subject);
  openModal(`<i class="fas fa-calendar-plus text-blue-600 mr-2"></i>${id ? 'Modifier' : 'Nouvelle'} séance — ${esc(LEVEL_LABELS[tt.level] || tt.level)}`, `
    <form onsubmit="ttSlotSave(event, ${id ? `'${id}'` : 'null'})">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Jour *</label>
          <select id="tt-day" class="${inputCls}">${TT_DAYS.map(d => `<option value="${d.k}" ${Number(s.day) === d.k ? 'selected' : ''}>${d.label} · ${d.ar}</option>`).join('')}</select></div>
        <div><label class="${lblCls}">Salle</label><input id="tt-room" value="${esc(s.room || '')}" class="${inputCls}" placeholder="ex: Salle 1"></div>
        <div><label class="${lblCls}">Début *</label><input id="tt-start" type="time" required value="${esc(s.start || '08:00')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Fin *</label><input id="tt-end" type="time" required value="${esc(s.end || '10:00')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Matière *</label>
          <select id="tt-subject" class="${inputCls}" onchange="document.getElementById('tt-subject-free').classList.toggle('hidden', this.value !== '__autre__')">
            ${subjNames.map(n => `<option value="${esc(n)}" ${n === s.subject ? 'selected' : ''}>${esc(n)}</option>`).join('')}
            <option value="__autre__">Autre…</option>
          </select>
          <input id="tt-subject-free" class="${inputCls} mt-1 hidden" placeholder="Nom de la matière"></div>
        <div><label class="${lblCls}">Enseignant</label>
          <select id="tt-teacher-sel" class="${inputCls}"><option value="">—</option>
            ${(tt.teachers || []).map(t => `<option value="${t.id}" ${Number(s.teacher_id) === t.id ? 'selected' : ''}>${esc(ttTeacherName(t))}${t.subject ? ' — ' + esc(t.subject) : ''}</option>`).join('')}
          </select></div>
      </div>
      <div id="tt-conflict" class="hidden mb-3 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-2"></div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

function ttConflicts(slot, selfId) {
  const tt = App.cache.tt;
  const out = [];
  const a1 = ttMin(slot.start), a2 = ttMin(slot.end);
  // Chevauchement dans le même niveau
  (tt.all[tt.level] || []).forEach(x => {
    if (String(x.id) === String(selfId)) return;
    if (Number(x.day) !== Number(slot.day)) return;
    if (ttMin(x.start) < a2 && a1 < ttMin(x.end)) out.push(`Chevauchement avec « ${x.subject} » (${x.start}–${x.end}) dans ce niveau`);
  });
  // Enseignant occupé ailleurs
  if (slot.teacher_id) {
    Object.entries(tt.all).forEach(([lvl, arr]) => (arr || []).forEach(x => {
      if (lvl === tt.level && String(x.id) === String(selfId)) return;
      if (Number(x.teacher_id) !== Number(slot.teacher_id) || Number(x.day) !== Number(slot.day)) return;
      if (ttMin(x.start) < a2 && a1 < ttMin(x.end)) out.push(`Enseignant déjà occupé en ${LEVEL_LABELS[lvl] || lvl} (« ${x.subject} » ${x.start}–${x.end})`);
    }));
  }
  return out;
}

async function ttSlotSave(e, id) {
  e.preventDefault();
  const tt = App.cache.tt;
  let subject = formVal('tt-subject');
  if (subject === '__autre__') subject = formVal('tt-subject-free');
  if (!subject) return toast('Indiquez la matière', 'error');
  const slot = {
    id: id || ('s' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)),
    day: Number(formVal('tt-day')), start: formVal('tt-start'), end: formVal('tt-end'),
    subject, teacher_id: formVal('tt-teacher-sel') ? Number(formVal('tt-teacher-sel')) : null,
    room: formVal('tt-room') || null
  };
  if (ttMin(slot.end) <= ttMin(slot.start)) return toast("L'heure de fin doit être après le début", 'error');
  // Conflits : avertir une fois, ré-appui = forcer
  const conflicts = ttConflicts(slot, id);
  const box = document.getElementById('tt-conflict');
  if (conflicts.length && box && !box.dataset.ack) {
    box.classList.remove('hidden');
    box.dataset.ack = '1';
    box.innerHTML = `<i class="fas fa-triangle-exclamation mr-1"></i><b>Conflit détecté :</b><br>${conflicts.map(esc).join('<br>')}<br><span class="font-semibold">Cliquez à nouveau sur Enregistrer pour forcer.</span>`;
    return;
  }
  const slots = (tt.all[tt.level] || []).filter(x => String(x.id) !== String(id));
  slots.push(slot);
  await ttPersist(tt.level, slots);
  closeModal(); toast('Séance enregistrée 📅'); render();
}

function ttSlotDelete(id) {
  const tt = App.cache.tt;
  confirmDelete('Supprimer cette séance ?', async () => {
    const slots = (tt.all[tt.level] || []).filter(x => String(x.id) !== String(id));
    await ttPersist(tt.level, slots);
    toast('Séance supprimée'); render();
  });
}

async function ttPersist(level, slots) {
  slots.sort((a, b) => (a.day - b.day) || (ttMin(a.start) - ttMin(b.start)));
  App.cache.tt.all[level] = slots;
  await db.create('settings', { key: 'timetable_' + level, value: { slots } });
}

function ttCopyForm() {
  const tt = App.cache.tt;
  const sources = ALL_LEVELS.filter(l => l !== tt.level && (tt.all[l] || []).length);
  if (!sources.length) return toast('Aucun autre niveau ne possède un emploi du temps', 'info');
  openModal('<i class="fas fa-copy text-blue-600 mr-2"></i>Dupliquer un emploi du temps', `
    <p class="text-sm text-gray-600 mb-3">Copier les séances d'un autre niveau vers <b>${esc(LEVEL_LABELS[tt.level] || tt.level)}</b> (remplace l'existant) :</p>
    <select id="tt-copy-src" class="${inputCls} mb-4">${sources.map(l => `<option value="${l}">${esc(LEVEL_LABELS[l] || l)} — ${(tt.all[l] || []).length} séance(s)</option>`).join('')}</select>
    <div class="flex justify-end gap-3">
      <button onclick="closeModal()" class="${btnSecondary}">Annuler</button>
      <button onclick="ttCopyRun()" class="${btnPrimary}"><i class="fas fa-copy mr-1"></i> Copier</button>
    </div>`);
}
async function ttCopyRun() {
  const tt = App.cache.tt;
  const src = formVal('tt-copy-src');
  const slots = (tt.all[src] || []).map(s => ({ ...s, id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4) }));
  await ttPersist(tt.level, slots);
  closeModal(); toast(`Emploi du temps copié depuis ${src} 📋`); render();
}

// ---------- Impression (filigrane logo Rahma) ----------
function ttPrint() {
  const tt = App.cache.tt;
  const isTeacherMode = tt.mode === 'teacher';
  const t = (tt.teachers || []).find(x => x.id === Number(tt.teacherId));
  const title = isTeacherMode ? `Emploi du temps — ${ttTeacherName(t)}` : `Emploi du temps — ${LEVEL_LABELS[tt.level] || tt.level}`;
  const slots = [];
  if (isTeacherMode) {
    Object.entries(tt.all).forEach(([lvl, arr]) => (arr || []).forEach(s => { if (Number(s.teacher_id) === Number(tt.teacherId)) slots.push({ ...s, _level: lvl }); }));
  } else {
    (tt.all[tt.level] || []).forEach(s => slots.push({ ...s }));
  }
  slots.sort((a, b) => ttMin(a.start) - ttMin(b.start));
  const cell = s => {
    const t2 = (tt.teachers || []).find(x => x.id === Number(s.teacher_id));
    return `<div class="slot">
      <div class="subj">${esc(s.subject)}</div>
      <div>${esc(s.start)} – ${esc(s.end)}</div>
      ${isTeacherMode ? `<div>${esc(LEVEL_LABELS[s._level] || s._level)}</div>` : (t2 ? `<div>${esc(ttTeacherName(t2))}</div>` : '')}
      ${s.room ? `<div>${esc(s.room)}</div>` : ''}
    </div>`;
  };
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; }
    body { font-family: system-ui, sans-serif; background: #fff; color: #1f2937; }
    .sheet { position: relative; width: 277mm; min-height: 180mm; margin: 0 auto; padding: 10mm 8mm; }
    .rahma-watermark { position: absolute; top: 50%; left: 50%; width: 110mm; height: 110mm;
      transform: translate(-50%,-50%); object-fit: contain; opacity: 0.07; pointer-events: none; z-index: 0; }
    .sheet > :not(.rahma-watermark) { position: relative; z-index: 1; }
    header.h { display: flex; align-items: center; gap: 10px; margin-bottom: 8mm; }
    header.h img { width: 46px; height: 46px; border-radius: 50%; }
    h1 { font-size: 17px; } .sub { font-size: 11px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    th, td { border: 1px solid #cbd5e1; padding: 4px; vertical-align: top; }
    th { background: #1e3a8a; color: #fff; font-size: 12px; padding: 6px 4px; }
    th .ar { display: block; font-size: 10px; font-weight: normal; opacity: .85; }
    td { height: 30mm; }
    .slot { background: #eff6ff; border-left: 3px solid #3b82f6; border-radius: 4px; padding: 3px 5px; font-size: 10px; margin-bottom: 3px; }
    .slot .subj { font-weight: 700; font-size: 11px; }
    footer.f { margin-top: 6mm; font-size: 10px; color: #6b7280; display: flex; justify-content: space-between; }
    @page { size: A4 landscape; margin: 0; }
    @media print {
      body { width: 297mm; }
      .rahma-watermark { display: block !important; opacity: 0.07 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .slot { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style></head><body>
  <div class="sheet">
    <img class="rahma-watermark" src="${location.origin}/static/logo-rahma.png" alt="" aria-hidden="true">
    <header class="h">
      <img src="${location.origin}/static/logo-rahma.png">
      <div>
        <h1>Rahma Academy — ${esc(title)}</h1>
        <p class="sub">جدول الأوقات · ${isTeacherMode && t?.subject ? esc(t.subject) + ' · ' : ''}Année scolaire ${dayjs().format('YYYY')}/${dayjs().add(1, 'year').format('YYYY')} · Imprimé le ${dayjs().format('DD/MM/YYYY')}</p>
      </div>
    </header>
    <table>
      <thead><tr>${TT_DAYS.map(d => `<th>${d.label}<span class="ar">${d.ar}</span></th>`).join('')}</tr></thead>
      <tbody><tr>
        ${TT_DAYS.map(d => `<td>${slots.filter(s => Number(s.day) === d.k).map(cell).join('') || ''}</td>`).join('')}
      </tr></tbody>
    </table>
    <footer class="f">
      <span>Rahma Academy · 10 Av Imam Malik, Messadine 4013 · +216 52 517 581</span>
      <span>${slots.length} séance(s) / semaine</span>
    </footer>
  </div>
  <script>setTimeout(() => window.print(), 600)<\/script>
  </body></html>`);
  w.document.close();
}
