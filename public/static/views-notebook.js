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
    db.list('students', `select=id,first_name,last_name,photo_url,level&status=eq.actif&level=eq.${st.level}&order=last_name.asc`),
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
    <button onclick="nbClearSeats()" class="px-3 py-2 rounded-lg text-sm font-semibold text-white bg-rose-500 hover:bg-rose-600"><i class="fas fa-broom mr-1"></i> Vider les places</button>`) + `

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
      : `<div class="w-9 h-9 rounded-full mx-auto flex items-center justify-center text-white font-bold text-sm" style="background:${color}">${esc(s.first_name[0] || '')}</div>`}
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
        : `<div class="w-16 h-16 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold border-4 border-sky-200" style="background:${NB_SHIRT_COLORS[s.id % NB_SHIRT_COLORS.length]}">${esc(s.first_name[0] || '')}</div>`}
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
