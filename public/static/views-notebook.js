// ================= CARNET DE CLASSE (دفتر التنقيط) =================
// Plan de salle interactif + évaluation continue par élève, inspiré du
// modèle « دفتر التنقيط — التقويم المستمر والمعدلات ».
// Données stockées dans settings clé `notebook_<niveau>` :
// { rows, cols, seats: { "r-c-p": studentId }, evals: { [studentId]: {participation, discipline, behavior, homework} }, raised: [ids] }

const NB_CRITERIA = [
  { key: 'participation', label: 'Participation & interaction', ar: 'المشاركة والتفاعل', icon: 'fa-hand-sparkles', color: 'emerald' },
  { key: 'discipline',    label: 'Discipline & assiduité',      ar: 'الانضباط والحضور',  icon: 'fa-user-check',   color: 'blue' },
  { key: 'behavior',      label: 'Comportement & moralité',     ar: 'السلوك والأخلاق',   icon: 'fa-heart',        color: 'purple' },
  { key: 'homework',      label: 'Cahier & devoirs',            ar: 'الكراس والواجبات',  icon: 'fa-book-open',    color: 'amber' }
];
const NB_SHIRT_COLORS = ['#3B82F6','#F4A261','#2E7D5B','#B07CC6','#E76F51','#0EA5E9','#D97706','#DB2777'];

// Avatar 3D réaliste (style Pixar) : image déterministe selon le genre et l'id de
// l'élève — 4 variantes garçons (boy1-4) et 4 variantes filles (girl1-4) dans
// /static/avatars/. La photo réelle (photo_url) reste toujours prioritaire.
function nbAvatar(s, px) {
  const girl = String(s.gender || '').toUpperCase().startsWith('F');
  const variant = 1 + (s.id % 4);
  const src = `/static/avatars/${girl ? 'girl' : 'boy'}${variant}.jpg`;
  return `<img src="${src}" alt="${esc(fullName(s))}" loading="lazy" class="w-full h-full object-cover mx-auto block" style="min-width:100%;min-height:100%">`;
}


function nbState() {
  if (!App.cache.nb) App.cache.nb = { level: '', data: null, selected: null, picked: null, students: [], att: {} };
  return App.cache.nb;
}
function nbDefault() { return { rows: 3, cols: 3, seats: {}, evals: {}, raised: [] }; }
function nbEval(st, id) {
  const e = (st.data.evals || {})[id] || {};
  return { participation: e.participation ?? 2.5, discipline: e.discipline ?? 2.5, behavior: e.behavior ?? 2.5, homework: e.homework ?? 2.5 };
}
function nbAvg(st, id) {
  const e = nbEval(st, id);
  return (NB_CRITERIA.reduce((s, c) => s + e[c.key], 0) / NB_CRITERIA.length).toFixed(2).replace(/\.?0+$/, '');
}
async function nbSave() {
  const st = nbState();
  try { await db.create('settings', { key: `notebook_${st.level}`, value: st.data }); }
  catch (e) { toast('Erreur de sauvegarde', 'error'); }
}

VIEWS.notebook = async function(el) {
  if (!isStaff()) { el.innerHTML = '<div class="text-center py-16 text-gray-400">Réservé aux enseignants.</div>'; return; }
  const st = nbState();
  if (!st.level) {
    // Premier accès : choisir un niveau
    el.innerHTML = pageHeader('Carnet de classe', 'fa-chalkboard') + `
      <div class="bg-white rounded-xl shadow p-8 max-w-xl mx-auto text-center">
        <div class="text-5xl mb-4">🪑</div>
        <h3 class="font-bold text-lg mb-1 text-gray-800">Plan de classe & évaluation continue</h3>
        <p class="text-sm text-gray-500 mb-1" dir="rtl">دفتر التنقيط — التقويم المستمر والمعدلات</p>
        <p class="text-sm text-gray-500 mb-5">Choisissez un niveau pour ouvrir son plan de salle : placez les élèves, notez la participation, la discipline, le comportement et les devoirs en un clic, tirez au sort un élève pour participer.</p>
        <select id="nb-level" class="${inputCls} max-w-xs mx-auto mb-4"><option value="">— Choisir un niveau —</option>${levelOptions('')}</select>
        <button onclick="nbOpenLevel()" class="${btnPrimary}"><i class="fas fa-door-open mr-1"></i> Ouvrir le carnet</button>
      </div>`;
    return;
  }

  // Charger élèves + présence du jour + plan sauvegardé
  const today = dayjs().format('YYYY-MM-DD');
  const [students, attendance, saved] = await Promise.all([
    db.list('students', `select=id,first_name,last_name,photo_url,gender,level&status=eq.actif&level=eq.${st.level}&order=last_name.asc`),
    db.list('attendance', `select=student_id,status&date=eq.${today}`),
    db.list('settings', `select=value&key=eq.notebook_${st.level}`)
  ]);
  st.students = students;
  st.att = {}; attendance.forEach(a => st.att[a.student_id] = a.status);
  st.data = (saved[0]?.value && saved[0].value.seats) ? saved[0].value : (st.data && st.dataLevel === st.level ? st.data : nbDefault());
  st.dataLevel = st.level;
  // Purger les sièges d'élèves qui n'existent plus dans ce niveau
  const validIds = new Set(students.map(s => s.id));
  for (const k of Object.keys(st.data.seats)) if (!validIds.has(st.data.seats[k])) delete st.data.seats[k];

  const seated = new Set(Object.values(st.data.seats));
  const unseated = students.filter(s => !seated.has(s.id));
  const capacity = st.data.rows * st.data.cols * 2;

  el.innerHTML = pageHeader('Carnet de classe — ' + (LEVEL_LABELS[st.level] || st.level), 'fa-chalkboard', `
    <select onchange="App.cache.nb.level=this.value; App.cache.nb.selected=null; App.cache.nb.picked=null; render()" class="${inputCls} max-w-[220px]">${levelOptions(st.level)}</select>
    <button onclick="nbAutoArrange()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white" style="background:#2E7D5B"><i class="fas fa-wand-magic-sparkles mr-1"></i> Placement auto</button>
    <button onclick="nbClearSeats()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600"><i class="fas fa-broom mr-1"></i> Vider les places</button>`) + scopeBanner() + `

  <div class="bg-white rounded-xl shadow mb-4 p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
    <span><i class="fas fa-chair mr-1 text-amber-600"></i><b>Capacité :</b> ${capacity} places (${st.data.rows * st.data.cols} tables doubles)</span>
    <span><i class="fas fa-user-graduate mr-1 text-blue-600"></i><b>Placés :</b> ${seated.size} / ${students.length}</span>
    <span class="flex items-center gap-1"><b>Rangées :</b>
      <button onclick="nbGrid('rows',-1)" class="w-6 h-6 rounded border hover:bg-gray-50">−</button><b>${st.data.rows}</b><button onclick="nbGrid('rows',1)" class="w-6 h-6 rounded border hover:bg-gray-50">+</button></span>
    <span class="flex items-center gap-1"><b>Tables / rangée :</b>
      <button onclick="nbGrid('cols',-1)" class="w-6 h-6 rounded border hover:bg-gray-50">−</button><b>${st.data.cols}</b><button onclick="nbGrid('cols',1)" class="w-6 h-6 rounded border hover:bg-gray-50">+</button></span>
    ${st.data.raised?.length ? `<span class="badge badge-yellow"><i class="fas fa-hand mr-1"></i>${st.data.raised.length} main(s) levée(s)</span>` : ''}
  </div>

  <div class="flex flex-col lg:flex-row gap-4 items-start">
    <div class="flex-1 min-w-0 w-full rounded-2xl p-4 md:p-6" style="background:#F0F4F8">
      <!-- Tableau noir -->
      <div class="rounded-2xl text-white text-center px-4 py-5 mb-3 shadow-lg relative" style="background:linear-gradient(135deg,#1E3A4C,#16303f)">
        <div class="text-[10px] uppercase tracking-widest text-emerald-200 mb-1">Plateforme & vision de l'enseignant · منصة ورؤية الأستاذ</div>
        <div class="font-bold text-lg">📚 La classe : ${esc(LEVEL_LABELS[st.level] || st.level)}</div>
        <button onclick="nbRandomPick()" class="mt-3 px-4 py-2 rounded-lg text-sm font-bold shadow hover:scale-105 transition-transform" style="background:#C9F26B;color:#1E3A4C">
          <i class="fas fa-shuffle mr-1"></i> Tirage au sort d'un élève · قرعة تلميذ للمشاركة
        </button>
      </div>
      <!-- Bureau du professeur -->
      <div class="mx-auto mb-5 rounded-xl text-center py-2.5 px-4 shadow max-w-xs font-semibold text-sm" style="background:#C99A6E;color:#5b3a1e">
        <i class="fas fa-chalkboard-user mr-1"></i> Bureau de l'enseignant(e) · مكتب الأستاذ
      </div>
      <!-- Grille des tables -->
      <div class="space-y-4">
        ${Array.from({ length: st.data.rows }, (_, r) => `
          <div class="flex items-stretch gap-3">
            <div class="hidden md:flex items-center justify-center w-7 rounded-lg bg-white/70 text-[11px] font-bold text-gray-500" style="writing-mode:vertical-rl">Rang ${r + 1}</div>
            <div class="flex-1 grid gap-3" style="grid-template-columns:repeat(${st.data.cols},minmax(0,1fr))">
              ${Array.from({ length: st.data.cols }, (_, c) => nbTableHtml(st, r, c)).join('')}
            </div>
          </div>`).join('')}
      </div>
      ${unseated.length ? `
      <div class="mt-5 bg-white rounded-xl p-3 shadow-sm">
        <div class="text-xs font-bold text-gray-500 mb-2"><i class="fas fa-users mr-1"></i>Élèves sans place (${unseated.length}) — cliquez sur un siège vide pour les placer :</div>
        <div class="flex flex-wrap gap-1.5">${unseated.map(s => `<span class="badge badge-blue">${esc(fullName(s))}</span>`).join('')}</div>
      </div>` : ''}
    </div>

    <!-- Panneau latéral : fiche d'évaluation -->
    <aside class="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-4">${nbSidebarHtml(st)}</aside>
  </div>`;
};

function nbTableHtml(st, r, c) {
  const names = ['Table droite · طاولة اليمين', 'Table du milieu · طاولة الوسط', 'Table gauche · طاولة اليسار'];
  const tName = st.data.cols === 3 ? names[c] : `Table ${c + 1}`;
  return `<div class="rounded-2xl p-2 shadow-sm" style="background:#e8caa8;border:2px solid #C99A6E">
    <div class="text-center text-[10px] font-bold mb-1.5" style="color:#8a5a2b">${tName}</div>
    <div class="grid grid-cols-2 gap-2">${[0, 1].map(p => nbSeatHtml(st, `${r}-${c}-${p}`)).join('')}</div>
  </div>`;
}

function nbSeatHtml(st, key) {
  const sid = st.data.seats[key];
  if (!sid) {
    return `<button onclick="nbAssignSeat('${key}')" class="rounded-xl border-2 border-dashed bg-white/60 hover:bg-white text-center py-3 px-1 transition-colors" style="border-color:#C99A6E">
      <div class="text-[10px] text-gray-400 leading-tight">Siège libre<br>مقعد شاغر</div>
      <div class="text-emerald-700 text-xs font-bold mt-1">+ Placer</div>
    </button>`;
  }
  const s = st.students.find(x => x.id === sid);
  if (!s) return '';
  const color = NB_SHIRT_COLORS[sid % NB_SHIRT_COLORS.length];
  const avg = nbAvg(st, sid);
  const attSt = st.att[sid];
  const raised = (st.data.raised || []).includes(sid);
  const isSel = st.selected === sid, isPicked = st.picked === sid;
  return `<button onclick="nbSelect(${sid})" class="relative rounded-xl text-center pt-2 pb-1.5 px-1 transition-all ${isSel ? 'ring-4' : ''} ${isPicked ? 'nb-picked' : ''}"
    style="background:#fff ${isSel ? ';--tw-ring-color:#C9F26B' : ''}">
    <span class="absolute -top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-px rounded shadow" style="background:#BDE0FE;color:#1E3A4C">${avg}/5</span>
    ${raised ? '<span class="absolute -top-2 right-0 text-sm">✋</span>' : ''}
    ${attSt ? `<span class="absolute top-0.5 left-0.5 w-2.5 h-2.5 rounded-full ${ { present: 'bg-green-500', retard: 'bg-orange-400', absent: 'bg-rose-500', excuse: 'bg-blue-400' }[attSt] || 'bg-gray-300' }" title="${attSt}"></span>` : ''}
    ${s.photo_url
      ? `<img src="${esc(s.photo_url)}" class="w-9 h-9 rounded-full object-cover mx-auto border-2" style="border-color:${color}">`
      : `<div class="w-9 h-9 rounded-full mx-auto overflow-hidden border-2" style="background:#EAF3F0;border-color:${color}">${nbAvatar(s, 34)}</div>`}
    <div class="text-[10px] font-semibold text-gray-700 truncate mt-1 leading-tight">${esc(s.first_name)}<br>${esc(s.last_name)}</div>
  </button>`;
}

function nbSidebarHtml(st) {
  if (!st.selected) {
    return `<div class="bg-white rounded-2xl shadow p-6 text-center text-gray-400 text-sm">
      <div class="text-4xl mb-3">👆</div>Cliquez sur un élève du plan pour ouvrir sa fiche d'évaluation instantanée.
      <p class="mt-2 text-xs" dir="rtl">لحظات التقييم والرصد — تقييم فوري مباشر من مخطط المقاعد</p>
    </div>`;
  }
  const s = st.students.find(x => x.id === st.selected);
  if (!s) { st.selected = null; return ''; }
  const e = nbEval(st, s.id);
  const seatKey = Object.keys(st.data.seats).find(k => st.data.seats[k] === s.id);
  const [r, , p] = (seatKey || '').split('-');
  const attSt = st.att[s.id];
  const raised = (st.data.raised || []).includes(s.id);
  const colorMap = { emerald: 'bg-emerald-600', blue: 'bg-blue-600', purple: 'bg-purple-600', amber: 'bg-amber-500' };
  return `<div class="bg-white rounded-2xl shadow overflow-hidden">
    <div class="p-4 text-center border-b" style="background:linear-gradient(180deg,#f6fbf8,#fff)">
      <button onclick="App.cache.nb.selected=null; render()" class="float-left text-gray-300 hover:text-gray-500"><i class="fas fa-times"></i></button>
      ${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-16 h-16 rounded-full object-cover mx-auto border-4 border-sky-200">`
        : `<div class="w-16 h-16 rounded-full mx-auto overflow-hidden border-4 border-sky-200" style="background:#EAF3F0">${nbAvatar(s, 56)}</div>`}
      <h3 class="font-bold text-lg mt-2 text-gray-800">${esc(fullName(s))}</h3>
      <p class="text-xs text-gray-500">${esc(LEVEL_LABELS[st.level] || st.level)}${seatKey ? ` — Rang ${Number(r) + 1} (siège ${Number(p) + 1})` : ' — sans place'}</p>
    </div>
    <div class="p-4 space-y-2">
      <div class="text-[11px] font-bold text-gray-400 uppercase">Critères d'évaluation · معايير التقييم</div>
      ${NB_CRITERIA.map(cr => `
        <div class="flex items-center gap-2">
          <button onclick="nbAdjust(${s.id},'${cr.key}',-0.5)" class="w-7 h-7 rounded-lg border text-rose-500 font-bold hover:bg-rose-50">−</button>
          <div class="flex-1">
            <div class="flex justify-between text-[11px] font-semibold text-gray-600"><span><i class="fas ${cr.icon} mr-1"></i>${cr.label}</span><b>${e[cr.key]}/5</b></div>
            <div class="h-1.5 bg-gray-100 rounded-full mt-0.5"><div class="h-1.5 rounded-full ${colorMap[cr.color]}" style="width:${e[cr.key] / 5 * 100}%"></div></div>
            <div class="text-[9px] text-gray-400" dir="rtl">${cr.ar}</div>
          </div>
          <button onclick="nbAdjust(${s.id},'${cr.key}',0.5)" class="w-7 h-7 rounded-lg border text-emerald-600 font-bold hover:bg-emerald-50">+</button>
        </div>`).join('')}
      <div class="rounded-xl p-3 text-center" style="background:#f0faf4">
        <div class="text-[11px] text-gray-500">Moyenne actuelle · العلامة الحالية</div>
        <div class="text-3xl font-extrabold" style="color:#2E7D5B">${nbAvg(st, s.id)} <span class="text-sm text-gray-400">/ 5</span></div>
      </div>
      <button onclick="nbAdjust(${s.id},'participation',0.5)" class="w-full py-2.5 rounded-xl text-white font-bold text-sm shadow hover:opacity-90" style="background:#2E7D5B">
        <i class="fas fa-plus mr-1"></i> Récompense participation (+0.5) · مكافأة المشاركة
      </button>
      <button onclick="nbRaiseHand(${s.id})" class="w-full py-2 rounded-xl font-semibold text-sm border ${raised ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : 'bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100'}">
        ✋ ${raised ? 'Baisser la main' : 'Main levée'} · رفع اليد
      </button>
      <div class="text-[11px] font-bold text-gray-400 uppercase pt-1">Assiduité du jour · حالة المواظبة اليوم</div>
      <div class="grid grid-cols-3 gap-1.5">
        ${[['present', 'Présent · حاضر', 'bg-green-600'], ['retard', 'Retard · متأخر', 'bg-orange-500'], ['absent', 'Absent · غائب', 'bg-rose-500']].map(([k, lbl, cls]) => `
          <button onclick="nbSetAttendance(${s.id},'${k}')" class="py-1.5 rounded-lg text-[11px] font-bold ${attSt === k ? cls + ' text-white' : 'border text-gray-500 hover:bg-gray-50'}">${lbl}</button>`).join('')}
      </div>
      <div class="flex gap-2 pt-1">
        <button onclick="showStudentDetail(${s.id})" class="flex-1 py-2 rounded-xl text-white text-xs font-bold" style="background:#66BB8A"><i class="fas fa-id-card mr-1"></i> Fiche élève</button>
        <button onclick="nbUnseat(${s.id})" class="flex-1 py-2 rounded-xl border text-xs font-bold text-gray-600 hover:bg-gray-50"><i class="fas fa-right-left mr-1"></i> Libérer la place</button>
      </div>
    </div>
  </div>`;
}

// ---------- Actions ----------
function nbOpenLevel() {
  const lv = formVal('nb-level');
  if (!lv) { toast('Choisissez un niveau', 'warning'); return; }
  nbState().level = lv; render();
}
function nbSelect(id) { const st = nbState(); st.selected = st.selected === id ? null : id; render(); }

async function nbAdjust(id, key, delta) {
  const st = nbState();
  const e = nbEval(st, id);
  e[key] = Math.min(5, Math.max(0, Math.round((e[key] + delta) * 2) / 2));
  st.data.evals = st.data.evals || {}; st.data.evals[id] = e;
  await nbSave(); render();
}
async function nbRaiseHand(id) {
  const st = nbState();
  st.data.raised = st.data.raised || [];
  const i = st.data.raised.indexOf(id);
  if (i >= 0) st.data.raised.splice(i, 1); else st.data.raised.push(id);
  await nbSave(); render();
}
async function nbSetAttendance(id, status) {
  const st = nbState();
  try {
    await db.create('attendance', { student_id: id, date: dayjs().format('YYYY-MM-DD'), status, notes: null });
    st.att[id] = status;
    toast(status === 'present' ? 'Présence enregistrée' : 'Enregistré + notification envoyée au tuteur');
    render();
  } catch (e) { toast('Erreur', 'error'); }
}
function nbAssignSeat(key) {
  const st = nbState();
  const seated = new Set(Object.values(st.data.seats));
  const free = st.students.filter(s => !seated.has(s.id));
  if (!free.length) { toast('Tous les élèves sont déjà placés', 'info'); return; }
  openModal('<i class="fas fa-chair mr-2 text-amber-600"></i>Placer un élève', `
    <div class="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
      ${free.map(s => `<button onclick="nbDoAssign('${key}',${s.id})" class="border rounded-lg px-3 py-2 text-sm text-left hover:bg-emerald-50 hover:border-emerald-300">
        <b>${esc(fullName(s))}</b></button>`).join('')}
    </div>`);
}
async function nbDoAssign(key, id) {
  const st = nbState();
  st.data.seats[key] = id;
  closeModal(); await nbSave(); st.selected = id; render();
}
async function nbUnseat(id) {
  const st = nbState();
  for (const k of Object.keys(st.data.seats)) if (st.data.seats[k] === id) delete st.data.seats[k];
  await nbSave(); render();
}
async function nbAutoArrange() {
  const st = nbState();
  st.data.seats = {};
  let i = 0;
  outer: for (let r = 0; r < st.data.rows; r++) for (let c = 0; c < st.data.cols; c++) for (let p = 0; p < 2; p++) {
    if (i >= st.students.length) break outer;
    st.data.seats[`${r}-${c}-${p}`] = st.students[i++].id;
  }
  await nbSave(); toast('Placement automatique effectué ✨'); render();
}
function nbClearSeats() {
  confirmDelete('Vider toutes les places du plan de classe ? (les évaluations sont conservées)', async () => {
    const st = nbState(); st.data.seats = {}; st.selected = null;
    await nbSave(); render();
  });
}
async function nbGrid(dim, delta) {
  const st = nbState();
  const v = Math.min(dim === 'rows' ? 8 : 5, Math.max(1, st.data[dim] + delta));
  if (v === st.data[dim]) return;
  st.data[dim] = v;
  // Retirer les sièges hors grille
  for (const k of Object.keys(st.data.seats)) {
    const [r, c] = k.split('-').map(Number);
    if (r >= st.data.rows || c >= st.data.cols) delete st.data.seats[k];
  }
  await nbSave(); render();
}
function nbRandomPick() {
  const st = nbState();
  const candidates = Object.values(st.data.seats).filter(id => st.att[id] !== 'absent');
  if (!candidates.length) { toast('Aucun élève placé (et présent) à tirer au sort', 'warning'); return; }
  // Petit effet roulette : sélections rapides successives puis choix final
  let n = 0;
  const spin = setInterval(() => {
    st.picked = candidates[Math.floor(Math.random() * candidates.length)];
    render();
    if (++n >= 8) {
      clearInterval(spin);
      st.selected = st.picked;
      const s = st.students.find(x => x.id === st.picked);
      toast(`🎯 Au tour de <b>${esc(fullName(s))}</b> de participer !`, 'info');
      render();
      setTimeout(() => { if (nbState().picked === st.picked) { nbState().picked = null; render(); } }, 6000);
    }
  }, 120);
}

// ================= ANALYSES & RAPPORTS (لوحة التحليلات والتقارير) =================
// Analyse statistique du niveau : moyennes, taux de réussite, distribution par
// appréciation, tableau d'honneur, élèves à soutenir, assiduité, exports.

const AN_GRADES_BANDS = [
  { min: 18, max: 20.01, label: 'Excellent',        ar: 'ممتاز',          range: '18 – 20',      color: '#F59E0B', action: "Tableau d'honneur", actionAr: 'لوحة الشرف' },
  { min: 16, max: 18,    label: 'Très bien',        ar: 'جيد جدا',        range: '16 – 17.99',   color: '#10B981', action: 'Félicitations',     actionAr: 'تهنئة' },
  { min: 14, max: 16,    label: 'Bien',             ar: 'جيد',            range: '14 – 15.99',   color: '#14B8A6', action: 'Encouragements',    actionAr: 'تشجيع' },
  { min: 12, max: 14,    label: 'Assez bien',       ar: 'قريب من الجيد',  range: '12 – 13.99',   color: '#3B82F6', action: '',                  actionAr: '' },
  { min: 10, max: 12,    label: 'Moyen',            ar: 'متوسط',          range: '10 – 11.99',   color: '#8B5CF6', action: 'Acceptable',        actionAr: 'مقبول' },
  { min: 8,  max: 10,    label: 'Sous la moyenne',  ar: 'دون المتوسط',    range: '8 – 9.99',     color: '#F97316', action: '',                  actionAr: '' },
  { min: 0,  max: 8,     label: 'Faible',           ar: 'ضعيف',           range: '< 8',          color: '#EF4444', action: '',                  actionAr: '' }
];
function anBand(avg) { return AN_GRADES_BANDS.find(b => avg >= b.min && avg < b.max) || AN_GRADES_BANDS[6]; }

VIEWS.analytics = async function(el) {
  if (!isStaff()) { el.innerHTML = '<div class="text-center py-16 text-gray-400">Réservé aux enseignants.</div>'; return; }
  const level = App.cache.anLevel || '';
  const trimester = App.cache.anTrim || '1';
  if (!level) {
    el.innerHTML = pageHeader('Analyses & rapports', 'fa-chart-column') + `
      <div class="bg-white rounded-xl shadow p-8 max-w-xl mx-auto text-center">
        <div class="text-5xl mb-4">📊</div>
        <h3 class="font-bold text-lg mb-1 text-gray-800">Tableau d'analyses et rapports du niveau</h3>
        <p class="text-sm text-gray-500 mb-1" dir="rtl">لوحة التحليلات والتقارير — تحليل إحصائي دقيق لمعدلات القسم</p>
        <p class="text-sm text-gray-500 mb-5">Moyennes, taux de réussite, distribution des appréciations, tableau d'honneur, élèves à soutenir et statistiques d'assiduité — avec export Excel et impression PDF.</p>
        <select id="an-level" class="${inputCls} max-w-xs mx-auto mb-4"><option value="">— Choisir un niveau —</option>${levelOptions('')}</select>
        <button onclick="App.cache.anLevel=document.getElementById('an-level').value; if(App.cache.anLevel) render(); else toast('Choisissez un niveau','warning')" class="${btnPrimary}"><i class="fas fa-chart-line mr-1"></i> Ouvrir les analyses</button>
      </div>`;
    return;
  }

  const month = dayjs().format('YYYY-MM');
  const [students, grades, att] = await Promise.all([
    db.list('students', `select=id,first_name,last_name,photo_url,gender&status=eq.actif&level=eq.${level}&order=last_name.asc`),
    db.list('grades', `select=student_id,score,max_score,exam_type,trimester`),
    db.list('attendance', `select=student_id,status,date&date=gte.${month}-01`)
  ]);
  const sIds = new Set(students.map(s => s.id));

  // Moyenne /20 par élève (notes du trimestre choisi, normalisées sur 20) + détail par type
  const per = {};
  grades.filter(g => sIds.has(g.student_id) && String(g.trimester) === String(trimester)).forEach(g => {
    const n20 = Number(g.score) / (Number(g.max_score) || 20) * 20;
    per[g.student_id] = per[g.student_id] || { sum: 0, n: 0, types: {} };
    per[g.student_id].sum += n20; per[g.student_id].n++;
    const t = per[g.student_id].types;
    t[g.exam_type] = t[g.exam_type] || { sum: 0, n: 0 };
    t[g.exam_type].sum += n20; t[g.exam_type].n++;
  });
  const rated = students.filter(s => per[s.id]?.n).map(s => ({
    ...s, avg: per[s.id].sum / per[s.id].n,
    types: Object.fromEntries(Object.entries(per[s.id].types).map(([k, v]) => [k, (v.sum / v.n).toFixed(2).replace(/\.?0+$/, '')]))
  })).sort((a, b) => b.avg - a.avg);

  const classAvg = rated.length ? rated.reduce((s, x) => s + x.avg, 0) / rated.length : 0;
  const passed = rated.filter(x => x.avg >= 10);
  const top = rated[0], low = rated[rated.length - 1];
  const honor = rated.filter(x => x.avg >= 14);
  const support = rated.filter(x => x.avg < 10);
  const dist = AN_GRADES_BANDS.map(b => ({ ...b, students: rated.filter(x => x.avg >= b.min && x.avg < b.max) }));

  // Assiduité du mois en cours
  const attS = att.filter(a => sIds.has(a.student_id));
  const absJ = attS.filter(a => a.status === 'absent').length;
  const absE = attS.filter(a => a.status === 'excuse').length;
  const late = attS.filter(a => a.status === 'retard').length;
  const problem = new Set(attS.filter(a => a.status !== 'present').map(a => a.student_id));
  const perfect = students.filter(s => !problem.has(s.id));

  const typeLbl = { controle: 'C', synthese: 'S', oral: 'O', devoir1: 'F1', devoir2: 'F2', examen: 'Ex' };
  const fmtAvg = v => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  App.cache.anReport = { level, trimester, students, rated, classAvg, passed, honor, support, dist, absJ, absE, late, perfect };

  const kpi = (title, ar, value, sub, color, bg) => `
    <div class="rounded-xl p-4 border" style="background:${bg};border-color:${color}22">
      <div class="text-[11px] font-semibold text-gray-500">${title} · <span dir="rtl">${ar}</span></div>
      <div class="text-2xl font-extrabold mt-0.5" style="color:${color}">${value}</div>
      <div class="text-[11px] text-gray-400 mt-0.5">${sub}</div>
    </div>`;

  el.innerHTML = pageHeader(`Analyses & rapports — ${LEVEL_LABELS[level] || level}`, 'fa-chart-column', `
    <select onchange="App.cache.anLevel=this.value; render()" class="${inputCls} max-w-[200px]">${levelOptions(level)}</select>
    <select onchange="App.cache.anTrim=this.value; render()" class="${inputCls} max-w-[150px]">
      ${[1, 2, 3].map(t => `<option value="${t}" ${String(trimester) === String(t) ? 'selected' : ''}>Trimestre ${t}</option>`).join('')}
    </select>
    <button onclick="anExportExcel()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white" style="background:#2E7D5B"><i class="fas fa-file-excel mr-1"></i> Rapport Excel</button>
    <button onclick="anPrint()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700"><i class="fas fa-print mr-1"></i> Imprimer / PDF</button>`) + `

  <div id="an-report">
  <div class="bg-white rounded-xl shadow p-4 mb-4">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <div>
        <h3 class="font-bold text-gray-800">Analyse statistique du niveau · <span dir="rtl">تحليل إحصائي دقيق لمعدلات القسم</span></h3>
        <p class="text-xs text-gray-400">Distribution des appréciations, assiduité et suivi — Trimestre ${trimester} · calculé sur ${rated.length} élève(s) noté(s) / ${students.length}</p>
      </div>
      <span class="badge badge-green">${LEVEL_LABELS[level] || level}</span>
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${kpi('Moyenne générale', 'معدل القسم العام', rated.length ? fmtAvg(classAvg) + ' <span class="text-sm text-gray-400">/20</span>' : '—', `calculée sur ${rated.length} élève(s)`, '#1E3A4C', '#F8FAFC')}
      ${kpi('Taux de réussite (≥10)', 'نسبة النجاح', rated.length ? Math.round(passed.length / rated.length * 100) + '%' : '—', `${passed.length} élève(s) ≥ 10/20`, '#2E7D5B', '#F0FAF4')}
      ${kpi('Meilleure moyenne', 'أعلى معدل بالقسم', top ? fmtAvg(top.avg) + ' <span class="text-sm text-gray-400">/20</span>' : '—', top ? esc(fullName(top)) : '', '#D97706', '#FFFBEB')}
      ${kpi('Moyenne la plus basse', 'أدنى معدل بالقسم', low ? fmtAvg(low.avg) + ' <span class="text-sm text-gray-400">/20</span>' : '—', low ? esc(fullName(low)) : '', '#E11D48', '#FFF1F2')}
    </div>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
      ${kpi('Absences non justifiées', 'الغيابات غير المبررة', absJ, 'ce mois-ci', '#E11D48', '#FFF1F2')}
      ${kpi('Absences excusées', 'الغيابات المبررة', absE, 'ce mois-ci', '#D97706', '#FFFBEB')}
      ${kpi('Retards', 'حالات التأخر', late, 'ce mois-ci', '#F97316', '#FFF7ED')}
      ${kpi('Assiduité parfaite', 'انضباط تام (0 غياب)', `${perfect.length} <span class="text-sm text-gray-400">(${students.length ? Math.round(perfect.length / students.length * 100) : 0}%)</span>`, 'aucune absence ni retard ce mois', '#2E7D5B', '#F0FAF4')}
    </div>
  </div>

  <div class="bg-white rounded-xl shadow p-4 mb-4">
    <h3 class="font-bold text-gray-800 mb-1"><i class="fas fa-chart-simple mr-2 text-emerald-600"></i>Distribution des moyennes par appréciation · <span dir="rtl">منحنى توزيع المعدلات حسب التقدير</span></h3>
    <p class="text-xs text-gray-400 mb-3">Total : ${rated.length} élève(s) noté(s)</p>
    ${dist.map(b => {
      const pct = rated.length ? Math.round(b.students.length / rated.length * 100) : 0;
      return `<div class="flex items-center gap-3 mb-2">
        <div class="w-44 flex-shrink-0 text-right">
          <div class="text-xs font-bold text-gray-700">${b.label} <span class="text-gray-400 font-normal">(${b.range})</span></div>
          <div class="text-[10px] text-gray-400" dir="rtl">${b.ar}</div>
        </div>
        <div class="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
          <div class="h-4 rounded-full transition-all" style="width:${pct}%;background:${b.color}" title="${b.students.map(s => fullName(s)).join(', ')}"></div>
        </div>
        <div class="w-24 flex-shrink-0 text-xs font-bold" style="color:${b.color}">${b.students.length} élève(s) <span class="text-gray-400 font-normal">(${pct}%)</span></div>
      </div>`;
    }).join('')}
  </div>

  <div class="grid lg:grid-cols-2 gap-4">
    <div class="bg-white rounded-xl shadow p-4">
      <h3 class="font-bold text-gray-800 mb-3">🏅 Tableau d'honneur (moyenne ≥ 14) · <span dir="rtl">لوحة الشرف والمتفوقين</span></h3>
      ${honor.length ? honor.map((s, i) => `
        <div class="flex items-center gap-3 border-b last:border-0 py-2">
          <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-gray-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-gray-100 text-gray-500'}">${i + 1}</span>
          <div class="flex-1 min-w-0">
            <b class="text-sm">${esc(fullName(s))}</b>
            <div class="text-[10px] text-gray-400">${Object.entries(s.types).map(([t, v]) => `${typeLbl[t] || t}: ${v}`).join(' · ')}</div>
          </div>
          <div class="text-right">
            <b class="text-emerald-700">${fmtAvg(s.avg)} <span class="text-[10px] text-gray-400">/20</span></b>
            <div class="text-[10px]" style="color:${anBand(s.avg).color}">${anBand(s.avg).label}</div>
          </div>
        </div>`).join('') : '<p class="text-sm text-gray-400 text-center py-6">Aucun élève ≥ 14 pour ce trimestre.</p>'}
    </div>
    <div class="bg-white rounded-xl shadow p-4">
      <h3 class="font-bold text-gray-800 mb-3">⚠️ Élèves à suivre et soutenir (moyenne &lt; 10) · <span dir="rtl">تلاميذ بحاجة لمتابعة ودعم</span></h3>
      ${support.length ? support.map(s => `
        <div class="flex items-center gap-3 border-b last:border-0 py-2">
          <div class="w-7 h-7 rounded-full overflow-hidden bg-rose-100 flex-shrink-0">${nbAvatar(s, 26)}</div>
          <div class="flex-1 min-w-0">
            <b class="text-sm">${esc(fullName(s))}</b>
            <div class="text-[10px] text-gray-400">${Object.entries(s.types).map(([t, v]) => `${typeLbl[t] || t}: ${v}`).join(' · ')}</div>
          </div>
          <div class="text-right">
            <b class="text-rose-600">${fmtAvg(s.avg)} <span class="text-[10px] text-gray-400">/20</span></b>
            <div class="text-[10px]" style="color:${anBand(s.avg).color}">${anBand(s.avg).label}</div>
          </div>
        </div>`).join('') : '<p class="text-sm text-gray-400 text-center py-6">👏 Aucun élève en difficulté — toutes les moyennes sont ≥ 10.</p>'}
    </div>
  </div>
  ${rated.length === 0 ? `<div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700"><i class="fas fa-circle-info mr-2"></i>Aucune note enregistrée pour le trimestre ${trimester} de ce niveau. Saisissez des notes dans « Notes & Bulletins » pour alimenter les analyses.</div>` : ''}
  </div>`;
};

function anExportExcel() {
  const R = App.cache.anReport;
  if (!R) return;
  const fmt = v => Math.round(v * 100) / 100;
  const wb = XLSX.utils.book_new();
  // Feuille 1 : synthèse
  const synth = [
    { 'Indicateur': 'Niveau', 'Valeur': LEVEL_LABELS[R.level] || R.level },
    { 'Indicateur': 'Trimestre', 'Valeur': R.trimester },
    { 'Indicateur': 'Élèves notés', 'Valeur': `${R.rated.length} / ${R.students.length}` },
    { 'Indicateur': 'Moyenne générale /20', 'Valeur': R.rated.length ? fmt(R.classAvg) : '-' },
    { 'Indicateur': 'Taux de réussite (≥10)', 'Valeur': R.rated.length ? Math.round(R.passed.length / R.rated.length * 100) + '%' : '-' },
    { 'Indicateur': 'Tableau d\'honneur (≥14)', 'Valeur': R.honor.length },
    { 'Indicateur': 'Élèves à soutenir (<10)', 'Valeur': R.support.length },
    { 'Indicateur': 'Absences non justifiées (mois)', 'Valeur': R.absJ },
    { 'Indicateur': 'Absences excusées (mois)', 'Valeur': R.absE },
    { 'Indicateur': 'Retards (mois)', 'Valeur': R.late },
    { 'Indicateur': 'Assiduité parfaite', 'Valeur': R.perfect.length }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synth), 'Synthèse');
  // Feuille 2 : classement complet
  const rank = R.rated.map((s, i) => ({
    'Rang': i + 1, 'Élève': fullName(s), 'Moyenne /20': fmt(s.avg),
    'Appréciation': anBand(s.avg).label, 'التقدير': anBand(s.avg).ar,
    'Contrôle': s.types.controle || '', 'Synthèse': s.types.synthese || '', 'Oral': s.types.oral || '',
    'Devoir 1': s.types.devoir1 || '', 'Devoir 2': s.types.devoir2 || '', 'Examen': s.types.examen || ''
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rank), 'Classement');
  // Feuille 3 : distribution
  const distRows = R.dist.map(b => ({
    'Appréciation': b.label, 'التقدير': b.ar, 'Plage /20': b.range,
    'Élèves': b.students.length,
    '%': R.rated.length ? Math.round(b.students.length / R.rated.length * 100) + '%' : '0%',
    'Noms': b.students.map(s => fullName(s)).join(', ')
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(distRows), 'Distribution');
  XLSX.writeFile(wb, `analyses_${R.level}_T${R.trimester}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  toast('Rapport Excel téléchargé 📊');
}

function anPrint() {
  const zone = document.getElementById('an-report');
  if (!zone) return;
  const R = App.cache.anReport;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <title>Analyses ${esc(R.level)} — Trimestre ${R.trimester}</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>body{font-family:system-ui,sans-serif;padding:24px;background:#fff} .shadow{box-shadow:none!important;border:1px solid #e5e7eb} @media print {button{display:none}}</style>
    </head><body>
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <img src="${brandLogoAbs()}" style="width:52px;height:52px;object-fit:contain">
      <div><h1 style="font-size:20px;font-weight:800;margin:0">${esc(brandName())} — Analyses & rapports</h1>
      <p style="font-size:12px;color:#6b7280;margin:0">لوحة التحليلات والتقارير · ${esc(LEVEL_LABELS[R.level] || R.level)} · Trimestre ${R.trimester} · ${dayjs().format('DD/MM/YYYY')}</p></div>
    </div>
    ${zone.outerHTML}
    <script>setTimeout(()=>window.print(), 800)<\/script>
    </body></html>`);
  w.document.close();
}

// ================= CARNET DE NOTATION (دفتر تقويم قسم) =================
// Vue table par élève : 4 critères /5 (synchronisés avec le plan de classe),
// ت. مستمر /20 = somme des critères, فرض 1 / فرض 2 / الاختبار (table grades),
// معدل المادة = (ت.مستمر + moyenne(فرض1,فرض2) + اختبار×2) / 4, badge appréciation + action.

const GB_EXAMS = [
  { key: 'devoir1', label: 'Devoir 1', ar: 'فرض 1' },
  { key: 'devoir2', label: 'Devoir 2', ar: 'فرض 2' },
  { key: 'examen',  label: 'Examen',   ar: 'الاختبار' }
];

function gbState() {
  if (!App.cache.gb) App.cache.gb = { level: '', trim: '1', subject: '', search: '', sort: 'alpha', mode: 'table', bulk: false, notify: false, pending: {}, gradeIndex: {}, nbData: null, students: [], subjects: [] };
  return App.cache.gb;
}
function gbSchoolYear() {
  const d = dayjs();
  return d.month() + 1 >= 9 ? `${d.year()}/${d.year() + 1}` : `${d.year() - 1}/${d.year()}`;
}
function gbEvalOf(gb, id) {
  const e = (gb.nbData?.evals || {})[id] || {};
  return { participation: e.participation ?? 2.5, discipline: e.discipline ?? 2.5, behavior: e.behavior ?? 2.5, homework: e.homework ?? 2.5 };
}
function gbCC(gb, id) { const e = gbEvalOf(gb, id); return NB_CRITERIA.reduce((s, c) => s + e[c.key], 0); }
function gbScores(gb, id) {
  const g = gb.gradeIndex[id] || {};
  const p = gb.pending[id] || {};
  const out = {};
  for (const ex of GB_EXAMS) out[ex.key] = ex.key in p ? p[ex.key] : (g[ex.key] ? g[ex.key].score20 : null);
  return out;
}
// معدل المادة = (ت.مستمر + moyenne(فرض1,فرض2) + الاختبار×2) / 4
function gbSubjectAvg(gb, id) {
  const cc = gbCC(gb, id);
  const s = gbScores(gb, id);
  const devs = [s.devoir1, s.devoir2].filter(v => v != null);
  if (!devs.length || s.examen == null) return null;
  return (cc + devs.reduce((a, b) => a + b, 0) / devs.length + s.examen * 2) / 4;
}
const gbFmt = v => v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');

VIEWS.gradebook = async function(el) {
  if (!isStaff()) { el.innerHTML = '<div class="text-center py-16 text-gray-400">Réservé aux enseignants.</div>'; return; }
  const gb = gbState();
  if (!gb.level) {
    el.innerHTML = pageHeader('Carnet de notation', 'fa-table-list') + `
      <div class="bg-white rounded-xl shadow p-8 max-w-xl mx-auto text-center">
        <div class="text-5xl mb-4">📖</div>
        <h3 class="font-bold text-lg mb-1 text-gray-800">Carnet de notation et d'évaluation du niveau</h3>
        <p class="text-sm text-gray-500 mb-1" dir="rtl">دفتر التنقيط والتقويم — دفتر تقويم قسم</p>
        <p class="text-sm text-gray-500 mb-5">Tableau de notation par élève : évaluation continue (4 critères /5 partagés avec le plan de classe), Devoir 1, Devoir 2, Examen, moyenne de la matière calculée automatiquement et appréciation avec action pédagogique.</p>
        <select id="gb-level" class="${inputCls} max-w-xs mx-auto mb-4"><option value="">— Choisir un niveau —</option>${levelOptions('')}</select>
        <button onclick="gbOpenLevel()" class="${btnPrimary}"><i class="fas fa-book-open mr-1"></i> Ouvrir le carnet de notation</button>
      </div>`;
    return;
  }

  let [students, subjects, savedNb] = await Promise.all([
    db.list('students', `select=id,first_name,last_name,photo_url,gender&status=eq.actif&level=eq.${gb.level}&order=last_name.asc`),
    db.list('subjects', 'select=id,name,cycle,coefficient&order=name.asc'),
    db.list('settings', `select=value&key=eq.notebook_${gb.level}`)
  ]);
  gb.students = students;
  gb.subjects = scopedSubjects(subjects);
  subjects = gb.subjects;
  if (!subjects.length) { el.innerHTML = pageHeader('Carnet de notation', 'fa-table-list') + scopeBanner() + `<div class="bg-white rounded-xl shadow p-8 text-center text-gray-500"><i class="fas fa-lock text-3xl text-gray-300 mb-2 block"></i>Aucune matière ne vous est affectée : le carnet de notation est indisponible.</div>`; return; }
  gb.nbData = savedNb[0]?.value || nbDefault();
  if (!gb.subject || !subjects.find(s => s.id == gb.subject)) gb.subject = subjects[0]?.id || '';

  // Notes du trimestre pour la matière choisie (dernière note par type)
  gb.gradeIndex = {};
  if (gb.subject) {
    const grades = await db.list('grades', `select=id,student_id,score,max_score,exam_type&trimester=eq.${gb.trim}&subject_id=eq.${gb.subject}&exam_type=in.(devoir1,devoir2,examen)&order=id.asc`);
    const sIds = new Set(students.map(s => s.id));
    grades.filter(g => sIds.has(g.student_id)).forEach(g => {
      gb.gradeIndex[g.student_id] = gb.gradeIndex[g.student_id] || {};
      gb.gradeIndex[g.student_id][g.exam_type] = { id: g.id, score20: Number(g.score) / (Number(g.max_score) || 20) * 20 };
    });
  }

  // Classement + KPIs
  const withAvg = students.map(s => ({ ...s, cc: gbCC(gb, s.id), avg: gbSubjectAvg(gb, s.id) }));
  const rated = withAvg.filter(s => s.avg != null);
  const classAvg = rated.length ? rated.reduce((a, s) => a + s.avg, 0) / rated.length : null;
  const passPct = rated.length ? Math.round(rated.filter(s => s.avg >= 10).length / rated.length * 100) : null;
  const ranking = [...withAvg].sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1));
  const rankOf = {}; ranking.forEach((s, i) => rankOf[s.id] = i + 1);
  const list = gb.sort === 'rank' ? ranking : withAvg;
  const subjName = subjects.find(s => s.id == gb.subject)?.name || '—';
  App.cache.gbReport = { level: gb.level, trim: gb.trim, subjName, list: ranking, classAvg, passPct };
  const pendingCount = Object.values(gb.pending).reduce((n, o) => n + Object.keys(o).length, 0);

  el.innerHTML = pageHeader(`Carnet de notation — ${LEVEL_LABELS[gb.level] || gb.level}`, 'fa-table-list', `
    <select onchange="App.cache.gb.level=this.value; App.cache.gb.pending={}; render()" class="${inputCls} max-w-[180px]">${levelOptions(gb.level)}</select>
    <select onchange="App.cache.gb.subject=this.value; App.cache.gb.pending={}; render()" class="${inputCls} max-w-[170px]">
      ${subjects.map(s => `<option value="${s.id}" ${s.id == gb.subject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
    </select>
    <select onchange="App.cache.gb.trim=this.value; App.cache.gb.pending={}; render()" class="${inputCls} max-w-[130px]">
      ${[1, 2, 3].map(t => `<option value="${t}" ${String(gb.trim) === String(t) ? 'selected' : ''}>Trimestre ${t}</option>`).join('')}
    </select>
    <button onclick="gbExportExcel()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white" style="background:#2E7D5B"><i class="fas fa-file-excel mr-1"></i> Excel</button>`) + scopeBanner() + `

  <!-- En-tête : matière / année / effectif / KPIs -->
  <div class="rounded-2xl text-white p-4 mb-4 shadow-lg" style="background:linear-gradient(135deg,#1E3A4C,#16303f)">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="font-bold text-lg">📖 دفتر التنقيط والتقويم · Carnet de notation</div>
        <div class="text-xs text-emerald-200 mt-0.5">
          <i class="fas fa-book mr-1"></i>Matière · المادة : <b>${esc(subjName)}</b>
          <span class="mx-2">·</span><i class="fas fa-calendar mr-1"></i>Année scolaire · السنة الدراسية : <b>${gbSchoolYear()}</b>
          <span class="mx-2">·</span><i class="fas fa-users mr-1"></i>Effectif · عدد التلاميذ : <b>${students.length}</b>
          <span class="mx-2">·</span>Trimestre ${gb.trim}
        </div>
      </div>
      <div class="flex gap-3">
        <div class="rounded-xl px-4 py-2 text-center" style="background:rgba(201,242,107,.15)">
          <div class="text-[10px] text-emerald-200">معدل القسم · Moyenne classe</div>
          <div class="text-xl font-extrabold" style="color:#C9F26B">${classAvg != null ? gbFmt(classAvg) : '—'} <span class="text-xs font-normal text-emerald-200">/20</span></div>
        </div>
        <div class="rounded-xl px-4 py-2 text-center" style="background:rgba(189,224,254,.15)">
          <div class="text-[10px] text-sky-200">نسبة النجاح · Taux de réussite</div>
          <div class="text-xl font-extrabold" style="color:#BDE0FE">${passPct != null ? passPct + '%' : '—'}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Barre d'outils : recherche / tri / vue / édition groupée -->
  <div class="bg-white rounded-xl shadow mb-4 p-3 flex flex-wrap items-center gap-2">
    <div class="relative flex-1 min-w-[200px] max-w-xs">
      <i class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs"></i>
      <input oninput="gbSearch(this.value)" value="${esc(gb.search)}" placeholder="بحث عن اسم تلميذ بالقسم…" class="${inputCls} pl-8">
    </div>
    <div class="flex rounded-lg border overflow-hidden text-xs font-semibold">
      <button onclick="App.cache.gb.sort='alpha'; render()" class="px-3 py-2 ${gb.sort === 'alpha' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}"><i class="fas fa-arrow-down-a-z mr-1"></i>أبجديا بالاسم</button>
      <button onclick="App.cache.gb.sort='rank'; render()" class="px-3 py-2 ${gb.sort === 'rank' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}"><i class="fas fa-ranking-star mr-1"></i>الترتيب</button>
    </div>
    <div class="flex rounded-lg border overflow-hidden text-xs font-semibold">
      <button onclick="App.cache.gb.mode='table'; render()" class="px-3 py-2 ${gb.mode === 'table' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}" ${gb.mode === 'table' ? 'style="background:#2E7D5B"' : ''}><i class="fas fa-table mr-1"></i>جدول</button>
      <button onclick="App.cache.gb.mode='cards'; render()" class="px-3 py-2 ${gb.mode === 'cards' ? 'text-white' : 'text-gray-500 hover:bg-gray-50'}" ${gb.mode === 'cards' ? 'style="background:#2E7D5B"' : ''}><i class="fas fa-id-card mr-1"></i>بطاقات</button>
    </div>
    <button onclick="gbToggleBulk()" class="px-3 py-2 rounded-lg text-xs font-semibold ${gb.bulk ? 'bg-amber-500 text-white' : 'border text-gray-600 hover:bg-gray-50'}">
      <i class="fas fa-pen-to-square mr-1"></i>تعديل جماعي ${gb.bulk ? '(activé)' : ''}
    </button>
    ${gb.bulk ? `<button id="gb-saveall" onclick="gbSaveAll()" class="px-4 py-2 rounded-lg text-xs font-bold text-white shadow ${pendingCount ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-300'}">
      <i class="fas fa-floppy-disk mr-1"></i>Enregistrer tout (<span id="gb-pending-count">${pendingCount}</span>)</button>` : ''}
    <label class="flex items-center gap-1.5 text-[11px] text-gray-500 ml-auto cursor-pointer">
      <input type="checkbox" ${gb.notify ? 'checked' : ''} onchange="App.cache.gb.notify=this.checked">
      <i class="fas fa-bell text-amber-400"></i>Notifier les parents (nouvelles notes)
    </label>
  </div>

  ${gb.mode === 'table' ? gbTableHtml(gb, list, rankOf) : gbCardsHtml(gb, list, rankOf)}

  <div class="mt-4 bg-white rounded-xl shadow p-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
    <span class="font-bold text-gray-600"><i class="fas fa-circle-info mr-1"></i>Formule · المعادلة :</span>
    <span>ت. مستمر /20 = somme des 4 critères /5</span>
    <span>·</span>
    <span>معدل المادة = (ت. مستمر + moyenne(فرض1، فرض2) + الاختبار × 2) ÷ 4</span>
    <span>·</span>
    <span>Les critères sont partagés avec le Carnet de classe (plan de salle).</span>
  </div>`;
  if (gb.search) gbSearch(gb.search);
};

// ---------- Rendu table ----------
function gbTableHtml(gb, list, rankOf) {
  return `<div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full" style="min-width:1080px">
      <thead>
        <tr class="text-[11px]">
          <th class="text-center">رت</th>
          <th>اللقب والاسم · Élève</th>
          ${NB_CRITERIA.map(c => `<th class="text-center" title="${c.label}"><i class="fas ${c.icon} mr-1"></i><span dir="rtl">${c.ar}</span><div class="text-[9px] text-gray-400 font-normal">/5</div></th>`).join('')}
          <th class="text-center" style="background:#f0faf4">ت. مستمر<div class="text-[9px] text-gray-400 font-normal">/20</div></th>
          ${GB_EXAMS.map(e => `<th class="text-center"><span dir="rtl">${e.ar}</span><div class="text-[9px] text-gray-400 font-normal">${e.label} /20</div></th>`).join('')}
          <th class="text-center" style="background:#fffbeb">معدل المادة<div class="text-[9px] text-gray-400 font-normal">/20</div></th>
          <th class="text-center">التقدير والإجراء</th>
        </tr>
      </thead>
      <tbody>
        ${list.map((s, i) => gbRowHtml(gb, s, i + 1, rankOf)).join('') || '<tr><td colspan="11" class="text-center py-10 text-gray-400">Aucun élève actif dans ce niveau.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

function gbRowHtml(gb, s, num, rankOf) {
  const e = gbEvalOf(gb, s.id);
  const cc = gbCC(gb, s.id);
  const sc = gbScores(gb, s.id);
  const avg = gbSubjectAvg(gb, s.id);
  const b = avg != null ? anBand(avg) : null;
  const color = NB_SHIRT_COLORS[s.id % NB_SHIRT_COLORS.length];
  return `<tr data-gb-name="${esc(fullName(s).toLowerCase())}">
    <td class="text-center text-xs font-bold text-gray-400">${gb.sort === 'rank' && avg != null ? rankOf[s.id] : num}</td>
    <td>
      <div class="flex items-center gap-2">
        ${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-7 h-7 rounded-full object-cover border" style="border-color:${color}">`
          : `<div class="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 border" style="background:#EAF3F0;border-color:${color}">${nbAvatar(s, 26)}</div>`}
        <b class="text-sm whitespace-nowrap">${esc(fullName(s))}</b>
      </div>
    </td>
    ${NB_CRITERIA.map(c => `<td class="text-center">
      <div class="inline-flex items-center gap-0.5">
        <button onclick="gbAdjust(${s.id},'${c.key}',-0.5)" class="w-5 h-5 rounded border text-rose-500 text-xs font-bold hover:bg-rose-50 leading-none">−</button>
        <b class="text-xs w-7">${e[c.key]}</b>
        <button onclick="gbAdjust(${s.id},'${c.key}',0.5)" class="w-5 h-5 rounded border text-emerald-600 text-xs font-bold hover:bg-emerald-50 leading-none">+</button>
      </div>
    </td>`).join('')}
    <td class="text-center font-extrabold text-sm" style="background:#f0faf4;color:#2E7D5B">${gbFmt(cc)}</td>
    ${GB_EXAMS.map(ex => `<td class="text-center">
      <input type="number" min="0" max="20" step="0.25" value="${sc[ex.key] != null ? gbFmt(sc[ex.key]) : ''}" placeholder="—"
        onchange="gbSetScore(${s.id},'${ex.key}',this.value)"
        class="w-16 border rounded-lg px-1 py-1 text-center text-sm font-semibold ${gb.pending[s.id]?.[ex.key] !== undefined ? 'border-amber-400 bg-amber-50' : ''}">
    </td>`).join('')}
    <td class="text-center font-extrabold" style="background:#fffbeb;color:${b ? b.color : '#9ca3af'}">${gbFmt(avg)}</td>
    <td class="text-center">${b ? `<span class="inline-block px-2 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap" style="background:${b.color}" dir="rtl">${b.ar}${b.actionAr ? ` (${b.actionAr})` : ''}</span>
      <div class="text-[9px] text-gray-400 mt-0.5">${b.label}${b.action ? ' — ' + b.action : ''}</div>` : '<span class="text-[10px] text-gray-300">فرض + اختبار مطلوبان</span>'}</td>
  </tr>`;
}

// ---------- Rendu cartes ----------
function gbCardsHtml(gb, list, rankOf) {
  return `<div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    ${list.map((s, i) => {
      const e = gbEvalOf(gb, s.id);
      const cc = gbCC(gb, s.id);
      const sc = gbScores(gb, s.id);
      const avg = gbSubjectAvg(gb, s.id);
      const b = avg != null ? anBand(avg) : null;
      const color = NB_SHIRT_COLORS[s.id % NB_SHIRT_COLORS.length];
      return `<div class="bg-white rounded-2xl shadow p-4" data-gb-name="${esc(fullName(s).toLowerCase())}">
        <div class="flex items-center gap-3 mb-3">
          ${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-10 h-10 rounded-full object-cover border-2" style="border-color:${color}">`
            : `<div class="w-10 h-10 rounded-full overflow-hidden border-2 flex-shrink-0" style="background:#EAF3F0;border-color:${color}">${nbAvatar(s, 36)}</div>`}
          <div class="flex-1 min-w-0"><b class="text-sm">${esc(fullName(s))}</b>
            <div class="text-[10px] text-gray-400">رت ${gb.sort === 'rank' && avg != null ? rankOf[s.id] : i + 1} · ت. مستمر <b style="color:#2E7D5B">${gbFmt(cc)}/20</b></div>
          </div>
          ${b ? `<span class="px-2 py-1 rounded-full text-[10px] font-bold text-white" style="background:${b.color}" dir="rtl">${b.ar}${b.actionAr ? ` (${b.actionAr})` : ''}</span>` : ''}
        </div>
        <div class="space-y-1 mb-3">
          ${NB_CRITERIA.map(c => `<div class="flex items-center gap-1.5 text-[11px]">
            <button onclick="gbAdjust(${s.id},'${c.key}',-0.5)" class="w-5 h-5 rounded border text-rose-500 font-bold leading-none">−</button>
            <span class="flex-1 text-gray-500" dir="rtl">${c.ar}</span>
            <div class="w-16 h-1.5 bg-gray-100 rounded-full"><div class="h-1.5 rounded-full" style="width:${e[c.key] / 5 * 100}%;background:#2E7D5B"></div></div>
            <b class="w-7 text-center">${e[c.key]}</b>
            <button onclick="gbAdjust(${s.id},'${c.key}',0.5)" class="w-5 h-5 rounded border text-emerald-600 font-bold leading-none">+</button>
          </div>`).join('')}
        </div>
        <div class="grid grid-cols-4 gap-1.5 items-end">
          ${GB_EXAMS.map(ex => `<div>
            <div class="text-[9px] text-gray-400 text-center mb-0.5" dir="rtl">${ex.ar}</div>
            <input type="number" min="0" max="20" step="0.25" value="${sc[ex.key] != null ? gbFmt(sc[ex.key]) : ''}" placeholder="—"
              onchange="gbSetScore(${s.id},'${ex.key}',this.value)"
              class="w-full border rounded-lg px-1 py-1 text-center text-xs font-semibold ${gb.pending[s.id]?.[ex.key] !== undefined ? 'border-amber-400 bg-amber-50' : ''}">
          </div>`).join('')}
          <div class="rounded-lg text-center py-1" style="background:#fffbeb">
            <div class="text-[9px] text-gray-400" dir="rtl">المعدل</div>
            <b class="text-sm" style="color:${b ? b.color : '#9ca3af'}">${gbFmt(avg)}</b>
          </div>
        </div>
      </div>`;
    }).join('') || '<div class="col-span-full text-center py-10 text-gray-400 bg-white rounded-xl shadow">Aucun élève actif dans ce niveau.</div>'}
  </div>`;
}

// ---------- Actions ----------
function gbOpenLevel() {
  const lv = formVal('gb-level');
  if (!lv) { toast('Choisissez un niveau', 'warning'); return; }
  gbState().level = lv; render();
}
function gbSearch(q) {
  const gb = gbState(); gb.search = q;
  const needle = q.trim().toLowerCase();
  document.querySelectorAll('[data-gb-name]').forEach(el => {
    el.style.display = !needle || el.dataset.gbName.includes(needle) ? '' : 'none';
  });
}
// Ajuster un critère : synchronisé avec le Carnet de classe (settings notebook_<niveau>)
async function gbAdjust(id, key, delta) {
  const gb = gbState();
  const e = gbEvalOf(gb, id);
  e[key] = Math.min(5, Math.max(0, Math.round((e[key] + delta) * 2) / 2));
  gb.nbData.evals = gb.nbData.evals || {}; gb.nbData.evals[id] = e;
  try { await db.create('settings', { key: `notebook_${gb.level}`, value: gb.nbData }); }
  catch (err) { toast('Erreur de sauvegarde', 'error'); }
  render();
}
function gbToggleBulk() {
  const gb = gbState();
  if (gb.bulk && Object.keys(gb.pending).length) {
    confirmDelete('Des modifications non enregistrées seront perdues. Quitter le mode édition groupée ?', () => { gb.bulk = false; gb.pending = {}; render(); });
    return;
  }
  gb.bulk = !gb.bulk; gb.pending = {}; render();
}
async function gbSetScore(sid, type, value) {
  const gb = gbState();
  const v = value === '' ? null : Math.min(20, Math.max(0, Number(value)));
  if (gb.bulk) {
    gb.pending[sid] = gb.pending[sid] || {};
    gb.pending[sid][type] = v;
    const cnt = Object.values(gb.pending).reduce((n, o) => n + Object.keys(o).length, 0);
    const cEl = document.getElementById('gb-pending-count'); if (cEl) cEl.textContent = cnt;
    const btn = document.getElementById('gb-saveall'); if (btn) { btn.classList.remove('bg-gray-300'); btn.classList.add('bg-emerald-600', 'hover:bg-emerald-700'); }
    return;
  }
  try {
    await gbPersist(sid, type, v);
    toast('Note enregistrée' + (gb.notify && v != null && !(gb.gradeIndex[sid]?.[type]) ? ' + notification envoyée' : ''));
  } catch (err) { toast(err.response?.data?.error || 'Erreur d\'enregistrement', 'error'); }
  render();
}
async function gbPersist(sid, type, v) {
  const gb = gbState();
  const ex = gb.gradeIndex[sid]?.[type];
  if (v == null) { if (ex) await db.remove('grades', ex.id); return; }
  if (ex) {
    await db.update('grades', ex.id, { score: v, max_score: 20 });
  } else {
    const headers = gb.notify ? {} : { 'X-Skip-Notify': '1' };
    await api.post('/db/grades', {
      student_id: sid, subject_id: Number(gb.subject), trimester: Number(gb.trim),
      score: v, max_score: 20, exam_type: type, comment: null
    }, { headers });
  }
}
async function gbSaveAll() {
  const gb = gbState();
  const entries = [];
  for (const [sid, obj] of Object.entries(gb.pending))
    for (const [type, v] of Object.entries(obj)) entries.push([Number(sid), type, v]);
  if (!entries.length) { toast('Aucune modification à enregistrer', 'info'); return; }
  let ok = 0, ko = 0;
  for (const [sid, type, v] of entries) {
    try { await gbPersist(sid, type, v); ok++; } catch (e) { ko++; }
  }
  gb.pending = {};
  toast(ko ? `${ok} note(s) enregistrée(s), ${ko} erreur(s)` : `✅ ${ok} note(s) enregistrée(s)`, ko ? 'warning' : 'success');
  render();
}
function gbExportExcel() {
  const R = App.cache.gbReport;
  if (!R) return;
  const gb = gbState();
  const wb = XLSX.utils.book_new();
  const rows = R.list.map((s, i) => {
    const e = gbEvalOf(gb, s.id);
    const sc = gbScores(gb, s.id);
    const b = s.avg != null ? anBand(s.avg) : null;
    return {
      'رت': i + 1, 'Élève · اللقب والاسم': fullName(s),
      'المشاركة والتفاعل /5': e.participation, 'الانضباط والحضور /5': e.discipline,
      'السلوك والأخلاق /5': e.behavior, 'الكراس والواجبات /5': e.homework,
      'ت. مستمر /20': Math.round(s.cc * 100) / 100,
      'فرض 1 /20': sc.devoir1 ?? '', 'فرض 2 /20': sc.devoir2 ?? '', 'الاختبار /20': sc.examen ?? '',
      'معدل المادة /20': s.avg != null ? Math.round(s.avg * 100) / 100 : '',
      'التقدير': b ? b.ar : '', 'الإجراء': b ? b.actionAr : '', 'Appréciation': b ? b.label : ''
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Carnet de notation');
  const synth = [
    { 'Indicateur': 'Niveau', 'Valeur': LEVEL_LABELS[R.level] || R.level },
    { 'Indicateur': 'Matière · المادة', 'Valeur': R.subjName },
    { 'Indicateur': 'Année scolaire', 'Valeur': gbSchoolYear() },
    { 'Indicateur': 'Trimestre', 'Valeur': R.trim },
    { 'Indicateur': 'Effectif', 'Valeur': R.list.length },
    { 'Indicateur': 'معدل القسم /20', 'Valeur': R.classAvg != null ? Math.round(R.classAvg * 100) / 100 : '-' },
    { 'Indicateur': 'نسبة النجاح', 'Valeur': R.passPct != null ? R.passPct + '%' : '-' }
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synth), 'Synthèse');
  XLSX.writeFile(wb, `carnet_notation_${R.level}_T${R.trim}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  toast('Carnet de notation exporté 📖');
}
