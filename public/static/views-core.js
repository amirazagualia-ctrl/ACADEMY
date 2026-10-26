/* ============================================================
   Rahma Academy - Vues : Dashboard, Élèves, Présence, Calendrier
   ============================================================ */

// ================= DASHBOARD =================
// F61 : tableau de bord opérationnel — actions à traiter, agenda du jour, raccourcis, période, sélecteur d'enfant (parent)
const DASH_PERIODS = [['today', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois'], ['term', 'Trimestre']];
function dashActionsHtml(t, scoped) {
  const a = t.actions || {}; const items = [];
  if (!scoped && isAdmin()) items.push(['fa-file-signature', 'amber', a.registrations_pending, 'inscription(s) en attente', "navigate('registrations')"]);
  items.push(['fa-user-xmark', 'rose', a.absences_unjustified, scoped ? 'absence(s) non justifiée(s) (30 j)' : 'absence(s) non justifiée(s) (30 j)', "navigate('attendance')"]);
  if (App.user.role !== 'student') items.push(['fa-money-bill-wave', 'red', a.fees_overdue, `frais en retard${a.fees_overdue_amount ? ' · ' + a.fees_overdue_amount + ' DT' : ''}`, "navigate('fees')"]);
  items.push(['fa-comments', 'blue', a.messages_unread, 'message(s) non lu(s)', "navigate('chat')"]);
  const colors = { amber: 'bg-amber-50 text-amber-700 border-amber-200', rose: 'bg-rose-50 text-rose-700 border-rose-200', red: 'bg-red-50 text-red-700 border-red-200', blue: 'bg-blue-50 text-blue-700 border-blue-200' };
  const total = items.reduce((n, x) => n + (x[2] || 0), 0);
  return `<section class="card p-4" id="dash-actions"><h3 class="font-bold text-slate-700 mb-3 flex items-center justify-between"><span><i class="fas fa-list-check text-blue-600 mr-2"></i>Actions à traiter</span>${total ? `<span class="badge badge-red">${total}</span>` : '<span class="badge badge-green"><i class="fas fa-check mr-1"></i>À jour</span>'}</h3>
    <div class="grid grid-cols-2 gap-2">${items.map(([i, c, n, l, go]) => `<button onclick="${go}" class="text-left border rounded-xl p-3 ${n ? colors[c] : 'bg-slate-50 text-slate-400 border-slate-100'} hover:shadow-sm"><div class="text-2xl font-black leading-none">${n || 0}</div><div class="text-xs mt-1"><i class="fas ${i} mr-1"></i>${l}</div></button>`).join('')}</div>
    ${a.next_due ? `<p class="text-xs text-slate-500 mt-3"><i class="fas fa-calendar-day mr-1 text-amber-500"></i>Prochaine échéance : <b>${esc(String(a.next_due.due_date || '').split('-').reverse().join('/'))}</b> · ${a.next_due.amount} DT</p>` : ''}</section>`;
}
function dashTodayHtml(t) {
  const d = t.today || {}; const rows = [];
  (d.courses || []).forEach(c => rows.push(['fa-chalkboard', 'text-blue-600', `${esc(c.start)}–${esc(c.end)}`, `${esc(c.subject || 'Cours')} · ${esc(LEVEL_LABELS[c.level] || c.level)}${c.room ? ' · salle ' + esc(c.room) : ''}`, "navigate('timetable')"]));
  (d.evaluations || []).forEach(e => rows.push(['fa-file-signature', 'text-purple-600', 'Examen', `${esc(e.title)} · ${esc(LEVEL_LABELS[e.level] || e.level || '')}`, "navigate('evaluations')"]));
  (d.homeworks || []).forEach(h => rows.push(['fa-book-open', 'text-amber-600', 'Devoir à rendre', `${esc(h.title)} · ${esc(LEVEL_LABELS[h.level] || h.level || '')}`, "navigate('homeworks')"]));
  (d.events || []).forEach(e => rows.push(['fa-calendar-check', 'text-emerald-600', esc(e.type || 'Événement'), `${esc(e.title)}${e.level ? ' · ' + esc(LEVEL_LABELS[e.level] || e.level) : ''}`, "navigate('calendar')"]));
  return `<section class="card p-4" id="dash-today"><h3 class="font-bold text-slate-700 mb-3"><i class="fas fa-sun text-amber-500 mr-2"></i>Aujourd'hui <span class="text-xs font-normal text-slate-400">· ${dayjs().format('dddd D MMMM')}</span></h3>
    ${rows.length ? `<ul class="divide-y">${rows.slice(0, 10).map(([i, c, when, what, go]) => `<li class="py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded" onclick="${go}"><i class="fas ${i} ${c} w-5 text-center"></i><span class="text-xs font-bold text-slate-500 w-24 flex-shrink-0">${when}</span><span class="text-sm text-slate-700 truncate">${what}</span></li>`).join('')}</ul>` : emptyState('fa-mug-hot', 'Rien de prévu aujourd\'hui', 'Aucun cours, examen, devoir ou événement planifié pour ce jour.')}</section>`;
}
function dashShortcutsHtml() {
  const r = App.user.role; const sc = [];
  if (isStaff()) { sc.push(['fa-star', 'Ajouter une note', "navigate('grades'); setTimeout(()=>typeof showGradeForm==='function'&&showGradeForm(App.cache.gradeStudent||''), 600)"], ['fa-clipboard-check', "Faire l'appel", "navigate('attendance')"], ['fa-book-open', 'Créer un cours', "navigate('courses'); setTimeout(()=>typeof showCourseForm==='function'&&showCourseForm(), 600)"]); }
  if (r === 'admin') sc.push(['fa-bullhorn', 'Envoyer une annonce', "typeof showAnnounceForm==='function' ? showAnnounceForm() : navigate('notifications')"]);
  if (r === 'teacher') sc.push(['fa-wand-sparkles', 'Créer un examen', "navigate('examwizard')"]);
  if (r === 'parent') sc.push(['fa-star', 'Voir les notes', "navigate('grades')"], ['fa-money-bill-wave', 'Payer / quittances', "navigate('fees')"], ['fa-comments', 'Écrire à l\'école', "navigate('chat')"], ['fa-book-open', 'Devoirs', "navigate('homeworks')"]);
  if (r === 'student') sc.push(['fa-book-open', 'Mes devoirs', "navigate('homeworks')"], ['fa-file-signature', 'Mes évaluations', "navigate('evaluations')"], ['fa-gamepad', 'Cours interactifs', "navigate('interactive')"], ['fa-star', 'Mes notes', "navigate('grades')"]);
  return `<div class="flex flex-wrap gap-2 mb-5" id="dash-shortcuts">${sc.map(([i, l, go]) => `<button onclick="${go}" class="btn btn-secondary"><i class="fas ${i} text-blue-600"></i>${l}</button>`).join('')}</div>`;
}
function dashPeriodHtml() { const cur = App.cache.dashPeriod || 'week'; return `<div class="flex gap-1 bg-white border rounded-lg p-1" id="dash-period">${DASH_PERIODS.map(([k, l]) => `<button onclick="App.cache.dashPeriod='${k}'; render()" class="px-2.5 py-1 rounded-md text-xs font-semibold ${cur === k ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}">${l}</button>`).join('')}</div>`; }
function dashChildSelector(children) {
  if (!children || children.length < 2) return '';
  const cur = App.cache.dashChild || children[0].id;
  return `<div class="flex flex-wrap gap-2 mb-5" id="dash-children">${children.map(ch => `<button onclick="App.cache.dashChild=${ch.id}; App.cache.gradeStudent=${ch.id}; render()" class="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border-2 ${Number(cur) === ch.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}">${ch.photo_url ? `<img src="${esc(ch.photo_url)}" class="w-8 h-8 rounded-full object-cover">` : `<span class="w-8 h-8 rounded-full bg-amber-400 text-blue-950 flex items-center justify-center text-xs font-black">${esc((ch.first_name || '?')[0])}</span>`}<span class="text-sm font-semibold text-slate-800">${esc(ch.first_name)}</span><span class="text-xs text-slate-500">${esc(LEVEL_LABELS[ch.level] || ch.level || '')}</span></button>`).join('')}</div>`;
}
VIEWS.dashboard = async function(el) {
  const [statsR, feedR, todoR] = await Promise.all([api.get('/stats'), api.get('/notifications/feed?limit=8').catch(() => ({ data: null })), api.get('/dashboard/todo').catch(() => ({ data: null }))]);
  const stats = statsR.data; const todo = todoR.data || { actions: {}, today: {}, children: [] };
  if (feedR.data?.items) stats.notifications = feedR.data.items;
  const scoped = isParentOrStudent();
  el.innerHTML = pageHeader(scoped ? 'Tableau de bord' : 'Tableau de bord administratif', 'fa-chart-pie',
    (isStaff() ? `<button onclick="checkOverdueFees()" class="${btnSecondary}"><i class="fas fa-bell mr-1"></i> Vérifier impayés</button>` : '') + dashPeriodHtml()) +
    dashChildSelector(todo.children) + dashShortcutsHtml() + `
  <div class="grid lg:grid-cols-2 gap-6 mb-6">${dashActionsHtml(todo, scoped)}${dashTodayHtml(todo)}</div>
  <section class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" id="stats-cards">
    ${statCard('fa-user-graduate','blue', scoped ? 'Mes enfants / Moi' : 'Élèves', stats.students.total)}
    ${scoped ? statCard('fa-clipboard-check','green','Présences ce mois', stats.attendanceMonth.present||0) : statCard('fa-chalkboard-user','purple','Enseignants', stats.teachers)}
    ${statCard('fa-money-bill-wave','green','Frais payés', stats.fees.paid + ' DT')}
    ${statCard('fa-triangle-exclamation','red','Frais en attente', (stats.fees.pending + stats.fees.overdue) + ' DT')}
  </section>
  <div class="grid lg:grid-cols-2 gap-6">
    <section class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-4"><i class="fas fa-clipboard-check text-green-600 mr-2"></i>Présence aujourd'hui</h3>
      <div class="grid grid-cols-4 gap-3 text-center">
        ${['present','absent','retard','excuse'].map(s => `
          <div class="rounded-lg p-3 ${ {present:'bg-green-50 text-green-700',absent:'bg-red-50 text-red-700',retard:'bg-yellow-50 text-yellow-700',excuse:'bg-blue-50 text-blue-700'}[s] }">
            <div class="text-2xl font-bold">${stats.attendanceToday[s]||0}</div>
            <div class="text-xs capitalize">${ {present:'Présents',absent:'Absents',retard:'Retards',excuse:'Excusés'}[s] }</div>
          </div>`).join('')}
      </div>
      ${!scoped ? `<h3 class="font-bold text-gray-700 mt-6 mb-3"><i class="fas fa-layer-group text-blue-600 mr-2"></i>Élèves par cycle</h3>
      <canvas id="cycle-chart" height="120"></canvas>` : ''}
    </section>
    ${!scoped ? `<section class="bg-white rounded-xl shadow p-5 lg:col-span-2" id="alerts-section">
      <h3 class="font-bold text-gray-700 mb-1 flex items-center justify-between"><span><i class="fas fa-user-shield text-red-500 mr-2"></i>Détection précoce — élèves à suivre <span class="text-gray-400 text-sm font-normal">· تلاميذ يحتاجون متابعة</span></span><button onclick="showAlertsDetail()" class="text-xs text-blue-600 font-semibold">Voir le détail</button></h3>
      <p class="text-xs text-gray-500 mb-3">Moyenne &lt; 10, matières &lt; 10, ≥ 3 absences sur 30 jours, retards répétés, devoirs non rendus${App.user.role === 'admin' ? ', frais en retard' : ''}.</p>
      <div id="alerts-list" class="text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Analyse en cours…</div>
    </section>` : ''}
    <section class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-4 flex items-center justify-between"><span><i class="fas fa-bell text-amber-500 mr-2"></i>Dernières notifications</span><a href="#" onclick="navigate('notifications');return false;" class="text-xs text-blue-600 font-normal hover:underline">Tout voir <i class="fas fa-arrow-right"></i></a></h3>
      <div class="space-y-2 max-h-96 overflow-y-auto">
        ${stats.notifications.length ? stats.notifications.map(n => `
          <div class="flex gap-3 items-start border-b pb-2 ${n.read === false ? 'bg-blue-50/60 -mx-2 px-2 rounded' : ''} ${n.link ? 'cursor-pointer hover:bg-blue-50' : ''}" ${n.link ? `onclick="openNotif(${n.id}, '${esc(n.link)}')"` : ''}>
            <i class="fas ${notifIcon(n.type)} mt-1"></i>
            <div class="min-w-0"><div class="text-sm font-semibold text-gray-700">${esc(n.title||n.type)}${n.read === false ? ' <span class="inline-block w-2 h-2 rounded-full bg-red-500 ml-1"></span>' : ''}</div>
            <div class="text-xs text-gray-500">${esc(n.message)}</div>
            <div class="text-[10px] text-gray-400">${fmtDT(n.created_at)}</div></div>
          </div>`).join('') : '<p class="text-gray-400 text-sm">Aucune notification</p>'}
      </div>
    </section>
  </div>`;
  if (!scoped) loadAlerts();
  if (!scoped) {
    const bc = stats.students.byCycle;
    new Chart(document.getElementById('cycle-chart'), {
      type: 'bar',
      data: { labels: ['Primaire','Base','Secondaire'], datasets: [{ label:'Élèves', data:[bc.primaire||0, bc.base||0, bc.secondaire||0], backgroundColor:['#3b82f6','#8b5cf6','#f59e0b'] }] },
      options: { plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{stepSize:1}}} }
    });
  }
};

function statCard(icon, color, label, value) {
  const colors = { blue:'bg-blue-100 text-blue-600', green:'bg-green-100 text-green-600', purple:'bg-purple-100 text-purple-600', red:'bg-red-100 text-red-600' };
  return `<div class="bg-white rounded-xl shadow p-4 flex items-center gap-4">
    <div class="w-12 h-12 rounded-lg ${colors[color]} flex items-center justify-center"><i class="fas ${icon} text-xl"></i></div>
    <div><div class="text-2xl font-bold text-gray-800">${value}</div><div class="text-xs text-gray-500">${label}</div></div>
  </div>`;
}
function notifIcon(t) {
  return { absence:'fa-user-xmark text-red-500', retard:'fa-clock text-yellow-500', frais:'fa-money-bill text-orange-500', note:'fa-star text-blue-500', info:'fa-circle-info text-gray-400', engagement:'fa-handshake text-green-500', cours:'fa-book-open text-blue-600', evenement:'fa-calendar-days text-purple-500', examen:'fa-file-pen text-red-600' }[t] || 'fa-bell text-gray-400';
}
async function checkOverdueFees() {
  try { const r = await api.post('/fees/check-overdue'); toast(`Vérification terminée : ${r.data.overdue} relance(s) envoyée(s)`, 'info'); render(); }
  catch (e) { toast('Erreur', 'error'); }
}

// ================= ÉLÈVES =================
// F61 : liste des élèves modernisée — filtres pilules persistants, vue tableau/cartes, tri, actions groupées, état vide
const STU_PILLS = [['', 'Tous'], ['actif', 'Actifs'], ['inactif', 'Inactifs'], ['primaire', 'Primaire'], ['base', 'Collège'], ['secondaire', 'Lycée']];
function stuPrefs() {
  if (!App.cache.stuPrefs) { try { App.cache.stuPrefs = JSON.parse(localStorage.getItem('rahma_stu_prefs') || '{}'); } catch { App.cache.stuPrefs = {}; } }
  return App.cache.stuPrefs;
}
function stuSet(k, v, noRender) { const p = stuPrefs(); p[k] = v; localStorage.setItem('rahma_stu_prefs', JSON.stringify(p)); if (!noRender) render(); }
function stuReset() { App.cache.stuPrefs = {}; App.cache.studentSearch = ''; localStorage.removeItem('rahma_stu_prefs'); App.cache.stuSel = new Set(); render(); }
function stuAvatar(s, size = 'w-10 h-10') {
  return s.photo_url ? `<img src="${esc(s.photo_url)}" class="${size} rounded-full object-cover" alt="">` : `<div class="${size} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">${esc((s.first_name || '?')[0])}</div>`;
}
function stuToggleSel(id, on) { const sel = App.cache.stuSel || (App.cache.stuSel = new Set()); on ? sel.add(id) : sel.delete(id); stuBulkBar(); }
function stuSelAll(on, ids) { App.cache.stuSel = new Set(on ? ids : []); document.querySelectorAll('.stu-chk').forEach(c => c.checked = on); stuBulkBar(); }
function stuBulkBar() {
  const sel = App.cache.stuSel || new Set(); const bar = document.getElementById('stu-bulk'); if (!bar) return;
  bar.classList.toggle('hidden', sel.size === 0);
  const n = bar.querySelector('[data-count]'); if (n) n.textContent = `${sel.size} sélectionné(s)`;
}
async function stuBulk(action) {
  const ids = [...(App.cache.stuSel || [])]; if (!ids.length) return;
  const list = (App.cache.studentsList || []).filter(s => ids.includes(s.id));
  if (action === 'export') {
    const rows = list.map(s => ({ 'Identifiant': s.national_id || '', 'Prénom': s.first_name, 'Nom': s.last_name, 'Niveau': LEVEL_LABELS[s.level] || s.level, 'Classe': s.class_name || '', 'Parent': s.parent_name || '', 'Téléphone': s.parent_phone || '', 'Email': s.parent_email || '', 'Statut': s.status }));
    const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Élèves'); XLSX.writeFile(wb, `eleves_selection_${dayjs().format('YYYY-MM-DD')}.xlsx`); return toast(`${ids.length} élève(s) exporté(s)`);
  }
  if (action === 'actif' || action === 'inactif') {
    confirmDelete(`Passer <b>${ids.length}</b> élève(s) au statut <b>${action}</b> ?<br><span class="text-sm text-slate-500">Un élève inactif reste consultable et ses données sont conservées.</span>`, async () => {
      for (const id of ids) await db.update('students', id, { status: action });
      toast(`${ids.length} élève(s) mis à jour`); App.cache.stuSel = new Set(); render();
    }, { label: action === 'actif' ? 'Activer' : 'Désactiver', icon: action === 'actif' ? 'fa-user-check' : 'fa-user-slash', color: action === 'actif' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700', title: 'Changement de statut' });
    return;
  }
  if (action === 'trash') {
    confirmTrash(`<b>${ids.length}</b> élève(s)`, async () => {
      for (const id of ids) await db.remove('students', id);
      toast(`${ids.length} élève(s) placé(s) dans la corbeille (récupérables 30 jours)`); App.cache.stuSel = new Set(); render();
    });
  }
}
VIEWS.students = async function(el) {
  const P = stuPrefs();
  const pill = P.pill || '', view = P.view || (window.innerWidth < 640 ? 'cards' : 'table'), sort = P.sort || 'last_name', cls = P.cls || '', level = P.level || '';
  const search = App.cache.studentSearch || '';
  let qs = 'select=*&order=last_name.asc';
  if (level) qs += `&level=eq.${level}`;
  else if (['primaire', 'base', 'secondaire'].includes(pill)) qs += `&level=in.(${LEVELS[pill].join(',')})`;
  if (pill === 'actif' || pill === 'inactif') qs += `&status=eq.${pill}`;
  el.innerHTML = pageHeader('Élèves', 'fa-user-graduate') + skeletonPage();
  let students;
  try { students = await db.list('students', qs); } catch (e) { el.innerHTML = pageHeader('Élèves', 'fa-user-graduate') + emptyState('fa-triangle-exclamation', 'Impossible de charger les élèves', friendlyError(e), `<button onclick="render()" class="${btnPrimary}">Réessayer</button>`); return; }
  App.cache.studentsList = students;
  const classes = [...new Set(students.map(s => s.class_name).filter(Boolean))].sort();
  let filtered = students;
  if (search) { const q = search.toLowerCase(); filtered = filtered.filter(s => fullName(s).toLowerCase().includes(q) || (s.national_id || '').includes(q) || (s.parent_name || '').toLowerCase().includes(q) || (s.class_name || '').toLowerCase().includes(q)); }
  if (cls) filtered = filtered.filter(s => s.class_name === cls);
  const LV = Object.values(LEVELS).flat();
  const sorters = { last_name: (a, b) => fullName(a).localeCompare(fullName(b), 'fr'), level: (a, b) => LV.indexOf(a.level) - LV.indexOf(b.level) || fullName(a).localeCompare(fullName(b), 'fr'), recent: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''), class: (a, b) => (a.class_name || 'zz').localeCompare(b.class_name || 'zz') || fullName(a).localeCompare(fullName(b), 'fr') };
  filtered = [...filtered].sort(sorters[sort] || sorters.last_name);
  const sel = App.cache.stuSel || (App.cache.stuSel = new Set());
  const hasFilter = pill || level || cls || search;
  const ids = JSON.stringify(filtered.map(s => s.id));
  const canEdit = isStaff();

  const rowActions = s => `
    <button onclick="showStudentDetail(${s.id})" class="icon-btn text-blue-600" title="Voir la fiche" aria-label="Voir ${esc(fullName(s))}"><i class="fas fa-eye"></i></button>
    ${canEdit ? `<button onclick="showStudentForm(${s.id})" class="icon-btn text-amber-600" title="Modifier" aria-label="Modifier"><i class="fas fa-pen"></i></button>
    ${isAdmin() ? `<button onclick="deleteStudent(${s.id}, '${esc(fullName(s)).replace(/'/g, "\\'")}')" class="icon-btn text-slate-400 hover:text-red-600" title="Mettre à la corbeille" aria-label="Mettre à la corbeille"><i class="fas fa-trash-can"></i></button>` : ''}` : ''}`;
  const statusBadge = s => `<span class="badge ${s.status === 'actif' ? 'badge-green' : 'badge-gray'}">${s.status === 'actif' ? 'Actif' : 'Inactif'}</span>`;

  const tableHtml = `<div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table table-cards w-full">
      <thead><tr>${canEdit ? `<th class="w-8"><input type="checkbox" aria-label="Tout sélectionner" onchange="stuSelAll(this.checked, ${esc(ids)})"></th>` : ''}<th>Élève</th><th>Niveau</th><th>Classe</th><th>Parent</th><th>Contact</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
      <tbody>${filtered.map(s => `<tr>
        ${canEdit ? `<td data-label="Sélection"><input type="checkbox" class="stu-chk" ${sel.has(s.id) ? 'checked' : ''} onchange="stuToggleSel(${s.id}, this.checked)" aria-label="Sélectionner ${esc(fullName(s))}"></td>` : ''}
        <td data-label="Élève"><div class="flex items-center gap-3">${stuAvatar(s)}<div><div class="font-semibold text-slate-800">${esc(fullName(s))}</div><div class="text-xs text-gray-400">${fmtDate(s.birth_date)}${canEdit ? ` • <span class="font-mono text-blue-400">ID ${s.id}</span>${s.national_id ? ` • <span class="font-mono text-gray-500">${esc(s.national_id)}</span>` : ''}` : ''}</div></div></div></td>
        <td data-label="Niveau"><span class="badge badge-blue">${esc(LEVEL_LABELS[s.level] || s.level)}</span></td>
        <td data-label="Classe">${esc(s.class_name || '—')}</td>
        <td data-label="Parent">${esc(s.parent_name || '—')}</td>
        <td data-label="Contact" class="text-xs">${s.parent_phone ? `<a href="tel:${esc(s.parent_phone)}" class="text-blue-600">${esc(s.parent_phone)}</a>` : ''}${s.parent_email ? `<br><span class="text-slate-500">${esc(s.parent_email)}</span>` : ''}</td>
        <td data-label="Statut">${statusBadge(s)}</td>
        <td data-label="Actions" class="text-right whitespace-nowrap">${rowActions(s)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;

  const cardsHtml = `<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">${filtered.map(s => `
    <article class="card p-4 flex flex-col gap-3 relative">
      ${canEdit ? `<input type="checkbox" class="stu-chk absolute top-3 right-3" ${sel.has(s.id) ? 'checked' : ''} onchange="stuToggleSel(${s.id}, this.checked)" aria-label="Sélectionner ${esc(fullName(s))}">` : ''}
      <div class="flex items-center gap-3">${stuAvatar(s, 'w-12 h-12')}<div class="min-w-0"><div class="font-bold text-slate-800 truncate">${esc(fullName(s))}</div><div class="text-xs text-slate-500">${esc(LEVEL_LABELS[s.level] || s.level)}${s.class_name ? ` · ${esc(s.class_name)}` : ''}</div></div></div>
      <div class="text-xs text-slate-600 space-y-1">${s.parent_name ? `<div><i class="fas fa-user w-4 text-slate-400"></i> ${esc(s.parent_name)}</div>` : ''}${s.parent_phone ? `<div><i class="fas fa-phone w-4 text-slate-400"></i> <a href="tel:${esc(s.parent_phone)}" class="text-blue-600">${esc(s.parent_phone)}</a></div>` : ''}</div>
      <div class="flex items-center justify-between mt-auto pt-2 border-t border-slate-100">${statusBadge(s)}<div class="flex">${rowActions(s)}</div></div>
    </article>`).join('')}</div>`;

  el.innerHTML = pageHeader('Élèves', 'fa-user-graduate', canEdit ? `
    <button onclick="exportStudentsExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> <span class="hidden sm:inline">Exporter</span></button>
    ${isAdmin() ? `<button onclick="openImport('students')" class="${btnSecondary}"><i class="fas fa-file-import text-blue-600 mr-1"></i> <span class="hidden sm:inline">Importer</span></button>` : ''}
    <button onclick="showStudentForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel élève</button>` : '') + `
  <section class="bg-white rounded-xl shadow mb-4 p-3 sm:p-4 space-y-3" aria-label="Filtres">
    <div class="flex flex-wrap gap-2" role="tablist">
      ${STU_PILLS.map(([v, l]) => `<button role="tab" aria-selected="${pill === v}" onclick="stuSet('level','',true); stuSet('pill','${v}')" class="px-3 py-1.5 rounded-full text-sm font-medium border transition ${pill === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}">${l}</button>`).join('')}
    </div>
    <div class="flex flex-wrap gap-2 items-center">
      <div class="relative flex-1 min-w-[180px] max-w-xs"><i class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
        <input id="student-search" placeholder="Nom, identifiant, parent, classe…" value="${esc(search)}" class="${inputCls} pl-9" aria-label="Rechercher un élève"
          oninput="App.cache.studentSearch=this.value; clearTimeout(App._st); App._st=setTimeout(()=>render(),350)"></div>
      <select onchange="stuSet('level', this.value)" class="${inputCls} w-auto" aria-label="Niveau"><option value="">Tous les niveaux</option>${levelOptions(level)}</select>
      ${classes.length ? `<select onchange="stuSet('cls', this.value)" class="${inputCls} w-auto" aria-label="Classe"><option value="">Toutes les classes</option>${classes.map(c => `<option ${cls === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
      <select onchange="stuSet('sort', this.value)" class="${inputCls} w-auto" aria-label="Trier"><option value="last_name" ${sort === 'last_name' ? 'selected' : ''}>Tri : Nom A→Z</option><option value="level" ${sort === 'level' ? 'selected' : ''}>Tri : Niveau</option><option value="class" ${sort === 'class' ? 'selected' : ''}>Tri : Classe</option><option value="recent" ${sort === 'recent' ? 'selected' : ''}>Tri : Plus récents</option></select>
      <div class="ml-auto flex items-center gap-2 text-sm text-slate-500">
        <span>${filtered.length} / ${students.length}</span>
        ${hasFilter ? `<button onclick="stuReset()" class="text-blue-600 hover:underline text-xs"><i class="fas fa-xmark mr-1"></i>Réinitialiser</button>` : ''}
        <div class="inline-flex rounded-lg border border-slate-200 overflow-hidden" role="group" aria-label="Affichage">
          <button onclick="stuSet('view','table')" class="px-2.5 py-1.5 ${view === 'table' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}" title="Tableau" aria-pressed="${view === 'table'}"><i class="fas fa-table-list"></i></button>
          <button onclick="stuSet('view','cards')" class="px-2.5 py-1.5 ${view === 'cards' ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}" title="Cartes" aria-pressed="${view === 'cards'}"><i class="fas fa-grip"></i></button>
        </div>
      </div>
    </div>
  </section>
  ${canEdit ? `<div id="stu-bulk" class="${sel.size ? '' : 'hidden'} sticky top-16 z-20 mb-3 bg-slate-800 text-white rounded-xl px-4 py-2 flex flex-wrap items-center gap-2 shadow-lg">
    <span data-count class="font-semibold text-sm mr-auto">${sel.size} sélectionné(s)</span>
    <button onclick="stuBulk('export')" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><i class="fas fa-file-excel mr-1"></i>Exporter</button>
    <button onclick="stuBulk('actif')" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><i class="fas fa-user-check mr-1"></i>Activer</button>
    <button onclick="stuBulk('inactif')" class="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-sm"><i class="fas fa-user-slash mr-1"></i>Désactiver</button>
    ${isAdmin() ? `<button onclick="stuBulk('trash')" class="px-3 py-1.5 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-sm"><i class="fas fa-trash-can mr-1"></i>Corbeille</button>` : ''}
    <button onclick="stuSelAll(false, [])" class="icon-btn text-white/70" title="Annuler la sélection" aria-label="Annuler la sélection"><i class="fas fa-xmark"></i></button>
  </div>` : ''}
  ${filtered.length ? (view === 'cards' ? cardsHtml : tableHtml) : (students.length === 0 && !hasFilter
    ? emptyState('fa-user-graduate', 'Aucun élève pour le moment', canEdit ? 'Ajoutez votre premier élève ou importez une liste depuis Excel.' : 'Les élèves apparaîtront ici dès leur inscription.', canEdit ? `<button onclick="showStudentForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel élève</button>${isAdmin() ? ` <button onclick="openImport('students')" class="${btnSecondary}"><i class="fas fa-file-import mr-1"></i> Importer Excel</button>` : ''}` : '')
    : emptyState('fa-filter-circle-xmark', 'Aucun élève ne correspond', 'Essayez un autre mot-clé ou retirez un filtre.', `<button onclick="stuReset()" class="${btnSecondary}"><i class="fas fa-rotate-left mr-1"></i> Réinitialiser les filtres</button>`))}`;
};

async function showStudentForm(id) {
  let s = {};
  if (id) s = (await db.list('students', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-user-graduate text-blue-600 mr-2"></i>${id ? 'Modifier' : 'Nouvel'} élève`, `
    <form onsubmit="saveStudent(event, ${id||'null'})">
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2"><label class="${lblCls}">Identifiant de l'élève * <span class="text-gray-400 font-normal">(12 chiffres — unique)</span></label>
          <input id="st-nid" required inputmode="numeric" pattern="\\d{12}" maxlength="12" value="${esc(s.national_id||'')}" class="${inputCls} font-mono" placeholder="ex : 123456789012"
            oninput="this.value=this.value.replace(/\\D/g,'').slice(0,12)" title="Exactement 12 chiffres">
          <p class="text-xs text-gray-400 mt-0.5"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Un élève déjà enregistré avec cet identifiant sera refusé (anti-doublon)</p>
        </div>
        <div><label class="${lblCls}">Prénom *</label><input id="st-fn" required value="${esc(s.first_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Nom *</label><input id="st-ln" required value="${esc(s.last_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Date de naissance</label><input id="st-bd" type="date" value="${s.birth_date||''}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Genre</label><select id="st-gender" class="${inputCls}"><option value="M" ${s.gender==='M'?'selected':''}>Garçon</option><option value="F" ${s.gender==='F'?'selected':''}>Fille</option></select></div>
        <div><label class="${lblCls}">Niveau *</label><select id="st-level" class="${inputCls}">${levelOptions(s.level)}</select></div>
        <div><label class="${lblCls}">Classe</label><input id="st-class" value="${esc(s.class_name||'')}" class="${inputCls}" placeholder="ex: 1AP-A"></div>
        <div><label class="${lblCls}">Nom du parent</label><input id="st-pname" value="${esc(s.parent_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Téléphone parent</label><input id="st-pphone" value="${esc(s.parent_phone||'')}" class="${inputCls}"></div>
        <div class="col-span-2"><label class="${lblCls}">Email parent</label><input id="st-pemail" type="email" value="${esc(s.parent_email||'')}" class="${inputCls}"></div>
        <div class="col-span-2"><label class="${lblCls}">Adresse</label><input id="st-address" value="${esc(s.address||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Statut</label><select id="st-status" class="${inputCls}"><option value="actif" ${s.status==='actif'?'selected':''}>Actif</option><option value="inactif" ${s.status==='inactif'?'selected':''}>Inactif</option></select></div>
        <div><label class="${lblCls}">Mensualité personnalisée (DT) <span class="text-gray-400 font-normal">(vide = défaut)</span></label><input id="st-mfee" type="number" step="0.5" min="0" value="${s.monthly_fee ?? ''}" class="${inputCls}" placeholder="ex : 70"></div>
        <div><label class="${lblCls}">Photo de l'élève</label><input id="st-photo" type="file" accept="image/*" class="${inputCls} text-xs"></div>
        ${s.photo_url ? `<div class="col-span-2 flex items-center gap-2"><img src="${esc(s.photo_url)}" class="w-14 h-14 rounded-full object-cover"><span class="text-xs text-gray-400">Photo actuelle (remplacée si nouveau fichier)</span></div>` : ''}
      </div>
      <div class="flex justify-end gap-3 mt-5">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`, { wide: true });
}

async function saveStudent(e, id) {
  e.preventDefault();
  const level = formVal('st-level');
  const nid = (formVal('st-nid') || '').replace(/\D/g, '');
  if (nid.length !== 12) return toast("L'identifiant de l'élève doit contenir exactement 12 chiffres", 'error');
  const data = {
    national_id: nid,
    first_name: formVal('st-fn'), last_name: formVal('st-ln'), birth_date: formVal('st-bd') || null,
    gender: formVal('st-gender'), cycle: cycleOfLevel(level), level, class_name: formVal('st-class') || null,
    parent_name: formVal('st-pname') || null, parent_phone: formVal('st-pphone') || null,
    parent_email: formVal('st-pemail') || null, address: formVal('st-address') || null, status: formVal('st-status'),
    monthly_fee: formVal('st-mfee') ? Number(formVal('st-mfee')) : null
  };
  try {
    const photoFile = document.getElementById('st-photo').files[0];
    if (photoFile) {
      toast('Envoi de la photo...', 'info');
      const up = await uploadFile('photos', photoFile, { raw: true, silent: true });
      data.photo_url = up.url;
    }
    if (id) await db.update('students', id, data);
    else await db.create('students', data);
    closeModal(); toast('Élève enregistré'); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}

function deleteStudent(id, name) {
  confirmTrash(`l'élève <b>${name}</b>`, async () => {
    await removeWithUndo('students', id, `L'élève ${name}`); render();
  }, 'Ses notes, présences et frais restent liés et seront restaurés avec lui. Pour un simple départ, préférez le statut <b>Inactif</b>.');
}

async function showStudentDetail(id) {
  const [s, grades, att, fees] = await Promise.all([
    db.list('students', `select=*&id=eq.${id}`).then(r => r[0]),
    db.list('grades', `select=*,subjects(name)&student_id=eq.${id}&order=created_at.desc&limit=5`),
    db.list('attendance', `select=*&student_id=eq.${id}&order=date.desc&limit=10`),
    db.list('fees', `select=*&student_id=eq.${id}`)
  ]);
  if (!s) return;
  let studentCode = null;
  if (isStaff()) { try { studentCode = (await api.get(`/students/${id}/code`)).data.code; } catch {} }
  openModal(`<i class="fas fa-id-card text-blue-600 mr-2"></i>Fiche élève`, `
    <div class="flex items-center gap-4 mb-4">
      ${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-20 h-20 rounded-full object-cover border-4 border-blue-100">` : `<div class="w-20 h-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-3xl font-bold">${esc(s.first_name[0]||'')}</div>`}
      <div>
        <h4 class="text-xl font-bold">${esc(fullName(s))}</h4>
        <span class="badge badge-blue">${esc(LEVEL_LABELS[s.level]||s.level)}</span>
        <span class="badge ${s.status==='actif'?'badge-green':'badge-gray'}">${esc(s.status)}</span>
      </div>
    </div>
    ${studentCode ? `
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap">
      <i class="fas fa-key text-amber-500"></i>
      <div class="flex-1 min-w-0">
        <b class="text-sm text-amber-800">Code élève : <code id="student-code-val" class="bg-white px-2 py-0.5 rounded border font-mono">${esc(studentCode)}</code></b>
        <p class="text-xs text-amber-600">À communiquer au tuteur pour lier son compte parent (confidentiel)</p>
      </div>
      <button onclick="navigator.clipboard.writeText('${esc(studentCode)}').then(()=>toast('Code copié 📋'))" class="text-amber-600 hover:text-amber-800" title="Copier"><i class="fas fa-copy text-lg"></i></button>
    </div>` : ''}
    <div class="grid grid-cols-2 gap-2 text-sm mb-4">
      <div class="col-span-2"><b>Identifiant élève :</b> <code class="font-mono bg-gray-100 px-2 py-0.5 rounded">${esc(s.national_id||'— non renseigné')}</code></div>
      <div><b>Naissance :</b> ${fmtDate(s.birth_date)}</div><div><b>Classe :</b> ${esc(s.class_name||'-')}</div>
      <div><b>Parent :</b> ${esc(s.parent_name||'-')}</div><div><b>Tél :</b> ${esc(s.parent_phone||'-')}</div>
      <div class="col-span-2"><b>Email :</b> ${esc(s.parent_email||'-')}</div>
      <div class="col-span-2"><b>Adresse :</b> ${esc(s.address||'-')}</div>
    </div>
    <div class="grid grid-cols-3 gap-3 text-center text-xs mb-4">
      <div class="bg-blue-50 rounded-lg p-2"><div class="font-bold text-lg text-blue-700">${grades.length}</div>Dernières notes</div>
      <div class="bg-red-50 rounded-lg p-2"><div class="font-bold text-lg text-red-700">${att.filter(a=>a.status==='absent').length}</div>Absences (10 dern.)</div>
      <div class="bg-amber-50 rounded-lg p-2"><div class="font-bold text-lg text-amber-700">${fees.filter(f=>f.status!=='paid').length}</div>Frais impayés</div>
    </div>
    ${grades.length ? `<h5 class="font-bold text-sm mb-2">Dernières notes</h5>
    <div class="text-xs space-y-1 mb-3">${grades.map(g => `<div class="flex justify-between border-b pb-1"><span>${esc(g.subjects?.name||'')} (T${g.trimester})</span><b>${g.score}/${g.max_score}</b></div>`).join('')}</div>` : ''}
    <div class="flex justify-end gap-2 flex-wrap"><button onclick="closeModal(); showProgress(${s.id})" class="${btnSecondary}"><i class="fas fa-chart-line text-blue-600 mr-1"></i> Progression</button>${App.user.role === 'admin' ? `<button onclick="closeModal(); showCertForm(${s.id})" class="${btnSecondary}"><i class="fas fa-certificate text-blue-600 mr-1"></i> Attestation</button>` : ''}<button onclick="closeModal()" class="${btnSecondary}">Fermer</button></div>`, { wide: true });
}

function exportStudentsExcel() {
  const students = App.cache.studentsList || [];
  const rows = students.map(s => ({
    'Identifiant': s.national_id || '', 'Prénom': s.first_name, 'Nom': s.last_name, 'Naissance': s.birth_date || '', 'Genre': s.gender,
    'Cycle': CYCLE_LABELS[s.cycle] || s.cycle, 'Niveau': LEVEL_LABELS[s.level] || s.level, 'Classe': s.class_name || '',
    'Parent': s.parent_name || '', 'Téléphone': s.parent_phone || '', 'Email': s.parent_email || '',
    'Adresse': s.address || '', 'Statut': s.status
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Élèves');
  XLSX.writeFile(wb, `eleves_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  toast('Export Excel téléchargé');
}

// ================= PRÉSENCE =================
VIEWS.attendance = async function(el) {
  const date = App.cache.attDate || dayjs().format('YYYY-MM-DD');
  const level = App.cache.attLevel || '';
  let sq = 'select=id,first_name,last_name,level,photo_url&order=last_name.asc&status=eq.actif';
  if (level) sq += `&level=eq.${level}`;
  const [students, attendance] = await Promise.all([
    db.list('students', sq),
    db.list('attendance', `select=*&date=eq.${date}`)
  ]);
  const attMap = {};
  attendance.forEach(a => attMap[a.student_id] = a);

  el.innerHTML = pageHeader('Présence', 'fa-clipboard-check', `
    <button onclick="exportAttendanceExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Rapport mensuel</button>`) + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <input type="date" value="${date}" onchange="App.cache.attDate=this.value; render()" class="${inputCls} max-w-[180px]">
    ${isStaff() ? `<select onchange="App.cache.attLevel=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les niveaux</option>${levelOptions(level)}
    </select>
    <button onclick="markAllPresent('${date}')" class="${btnSecondary} ml-auto"><i class="fas fa-check-double text-green-600 mr-1"></i> Tous présents</button>` : ''}
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Élève</th><th>Niveau</th><th>Statut du ${fmtDate(date)}</th><th>Remarque</th></tr></thead>
      <tbody>
        ${students.map(s => {
          const a = attMap[s.id];
          return `<tr>
            <td class="font-semibold">${esc(fullName(s))}</td>
            <td><span class="badge badge-blue">${esc(s.level)}</span></td>
            <td>
              ${isStaff() ? `<div class="flex gap-1">
                ${['present','absent','retard','excuse'].map(st => `
                  <button onclick="setAttendance(${s.id}, '${date}', '${st}')"
                    class="px-2 py-1 rounded text-xs font-semibold border ${a?.status===st ? {present:'bg-green-600 text-white border-green-600',absent:'bg-red-600 text-white border-red-600',retard:'bg-yellow-500 text-white border-yellow-500',excuse:'bg-blue-600 text-white border-blue-600'}[st] : 'text-gray-500 hover:bg-gray-50'}">
                    ${ {present:'P',absent:'A',retard:'R',excuse:'E'}[st] }
                  </button>`).join('')}
              </div>` : (a ? `<span class="badge ${ {present:'badge-green',absent:'badge-red',retard:'badge-yellow',excuse:'badge-blue'}[a.status] }">${ {present:'Présent',absent:'Absent',retard:'Retard',excuse:'Excusé'}[a.status] }</span>` : '<span class="text-gray-400 text-xs">Non pointé</span>')}
            </td>
            <td class="text-xs text-gray-500">${esc(a?.notes||'')}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucun élève</td></tr>'}
      </tbody>
    </table>
  </div>
  <p class="text-xs text-gray-400 mt-3"><i class="fas fa-circle-info mr-1"></i>P = Présent, A = Absent (notification automatique au tuteur), R = Retard (notification), E = Excusé</p>`;
  App.cache.attStudents = students;
};

async function setAttendance(studentId, date, status) {
  let notes = null;
  if (status === 'absent' || status === 'retard') {
    notes = prompt('Remarque (optionnelle) :') || null;
  }
  try {
    await db.create('attendance', { student_id: studentId, date, status, notes });
    toast(status === 'absent' || status === 'retard' ? 'Enregistré + notification envoyée au tuteur' : 'Présence enregistrée');
    render();
  } catch (e) { toast('Erreur', 'error'); }
}

async function markAllPresent(date) {
  const students = App.cache.attStudents || [];
  try {
    await db.create('attendance', students.map(s => ({ student_id: s.id, date, status: 'present' })));
    toast('Tous marqués présents'); render();
  } catch (e) { toast('Erreur', 'error'); }
}

async function exportAttendanceExcel() {
  const month = App.cache.attDate ? App.cache.attDate.slice(0,7) : dayjs().format('YYYY-MM');
  const start = month + '-01', end = dayjs(start).endOf('month').format('YYYY-MM-DD');
  const [students, att] = await Promise.all([
    db.list('students', 'select=id,first_name,last_name,level&order=last_name.asc'),
    db.list('attendance', `select=*&date=gte.${start}&date=lte.${end}`)
  ]);
  const counts = {};
  att.forEach(a => {
    counts[a.student_id] = counts[a.student_id] || { present:0, absent:0, retard:0, excuse:0 };
    counts[a.student_id][a.status] = (counts[a.student_id][a.status]||0) + 1;
  });
  const rows = students.map(s => ({
    'Élève': fullName(s), 'Niveau': s.level,
    'Présent': counts[s.id]?.present || 0, 'Absent': counts[s.id]?.absent || 0,
    'Retard': counts[s.id]?.retard || 0, 'Excusé': counts[s.id]?.excuse || 0
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Presence ' + month);
  XLSX.writeFile(wb, `presence_${month}.xlsx`);
  toast('Rapport de présence téléchargé');
}

// ================= CALENDRIER =================
VIEWS.calendar = async function(el) {
  const month = App.cache.calMonth || dayjs().format('YYYY-MM');
  const m = dayjs(month + '-01');
  const start = m.format('YYYY-MM-DD'), end = m.endOf('month').format('YYYY-MM-DD');
  const events = await db.list('events', `select=*&or=(and(date.gte.${start},date.lte.${end}),and(date.lte.${end},end_date.gte.${start}))&order=date.asc`);

  const firstDow = (m.day() + 6) % 7; // lundi = 0
  const daysInMonth = m.daysInMonth();
  const typeColors = { general:'bg-blue-100 text-blue-800', examen:'bg-red-100 text-red-800', vacances:'bg-green-100 text-green-800', reunion:'bg-purple-100 text-purple-800', activite:'bg-amber-100 text-amber-800' };
  const monthNames = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell bg-gray-50"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = m.date(d).format('YYYY-MM-DD');
    const dayEvents = events.filter(e => e.date <= dateStr && (e.end_date || e.date) >= dateStr);
    const isToday = dateStr === dayjs().format('YYYY-MM-DD');
    cells += `<div class="cal-cell border border-gray-100 p-1 ${isToday?'bg-amber-50 ring-2 ring-amber-300':''}">
      <div class="text-xs font-bold ${isToday?'text-amber-600':'text-gray-400'}">${d}</div>
      ${dayEvents.map(e => `<div onclick="${isStaff()?`showEventForm(${e.id})`:''}" class="text-[10px] rounded px-1 py-0.5 mb-0.5 truncate cursor-pointer ${typeColors[e.type]||typeColors.general}" title="${esc(e.title)}">${esc(e.title)}</div>`).join('')}
    </div>`;
  }

  el.innerHTML = pageHeader('Calendrier scolaire', 'fa-calendar-days', isStaff() ? `<button onclick="showEventForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel événement</button>` : '') + `
  <div class="bg-white rounded-xl shadow p-4">
    <div class="flex items-center justify-between mb-4">
      <button onclick="App.cache.calMonth='${m.subtract(1,'month').format('YYYY-MM')}'; render()" class="${btnSecondary}"><i class="fas fa-chevron-left"></i></button>
      <h3 class="text-lg font-bold">${monthNames[m.month()]} ${m.year()}</h3>
      <button onclick="App.cache.calMonth='${m.add(1,'month').format('YYYY-MM')}'; render()" class="${btnSecondary}"><i class="fas fa-chevron-right"></i></button>
    </div>
    <div class="grid grid-cols-7 gap-px text-center text-xs font-bold text-gray-500 mb-1">
      ${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div>${d}</div>`).join('')}
    </div>
    <div class="grid grid-cols-7 gap-px">${cells}</div>
    <div class="flex gap-3 mt-4 flex-wrap text-xs">
      ${Object.entries({general:'Général',examen:'Examen',vacances:'Vacances',reunion:'Réunion',activite:'Activité'}).map(([k,v])=>`<span class="badge ${typeColors[k]}">${v}</span>`).join('')}
    </div>
  </div>
  <div class="bg-white rounded-xl shadow p-4 mt-4">
    <h3 class="font-bold text-gray-700 mb-3">Événements du mois</h3>
    ${events.length ? `<div class="space-y-2">${events.map(e => `
      <div class="flex items-center gap-3 border-b pb-2">
        <span class="badge ${typeColors[e.type]||typeColors.general}">${e.type}</span>
        <div class="flex-1"><b class="text-sm">${esc(e.title)}</b> <span class="text-xs text-gray-400">${fmtDate(e.date)}${e.end_date?' → '+fmtDate(e.end_date):''}</span>
        ${e.description?`<div class="text-xs text-gray-500">${esc(e.description)}</div>`:''}</div>
        ${isStaff() ? `<button onclick="showEventForm(${e.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
        <button onclick="deleteEvent(${e.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>` : ''}
      </div>`).join('')}</div>` : '<p class="text-gray-400 text-sm">Aucun événement ce mois</p>'}
  </div>`;
};

async function showEventForm(id) {
  let e = {};
  if (id) e = (await db.list('events', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-calendar-plus text-blue-600 mr-2"></i>${id?'Modifier':'Nouvel'} événement`, `
    <form onsubmit="saveEvent(event, ${id||'null'})">
      <label class="${lblCls}">Titre *</label><input id="ev-title" required value="${esc(e.title||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Description</label><textarea id="ev-desc" rows="2" class="${inputCls} mb-3">${esc(e.description||'')}</textarea>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Date début *</label><input id="ev-date" type="date" required value="${e.date||''}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Date fin</label><input id="ev-end" type="date" value="${e.end_date||''}" class="${inputCls}"></div>
      </div>
      <label class="${lblCls}">Type</label>
      <select id="ev-type" class="${inputCls} mb-4">
        ${['general','examen','vacances','reunion','activite'].map(t=>`<option value="${t}" ${e.type===t?'selected':''}>${ {general:'Général',examen:'Examen',vacances:'Vacances',reunion:'Réunion',activite:'Activité'}[t] }</option>`).join('')}
      </select>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveEvent(ev, id) {
  ev.preventDefault();
  const data = { title: formVal('ev-title'), description: formVal('ev-desc')||null, date: formVal('ev-date'), end_date: formVal('ev-end')||null, type: formVal('ev-type') };
  try {
    if (id) await db.update('events', id, data); else await db.create('events', data);
    closeModal(); toast('Événement enregistré'); render();
  } catch (e) { toast('Erreur', 'error'); }
}
function deleteEvent(id) {
  confirmTrash('cet événement', async () => { await removeWithUndo('events', id, "L'événement"); render(); });
}

// ---- Détection précoce (admin / enseignant) ----
const ALERT_LABELS = { moyenne: ['badge-red', 'Moyenne < 10'], matieres: ['badge-yellow', 'Matière(s) < 10'], absences: ['badge-red', 'Absences répétées'], retards: ['badge-yellow', 'Retards'], devoirs: ['badge-purple', 'Devoirs non rendus'], frais: ['badge-gray', 'Frais en retard'] };
function alertBadges(a) {
  return a.reasons.map(r => { const [cls, lbl] = ALERT_LABELS[r] || ['badge-gray', r]; let detail = '';
    if (r === 'moyenne') detail = ` ${a.avg}`; if (r === 'matieres') detail = ` ${a.weakSubjects.map(w => `${w.name} ${w.average}`).join(', ')}`;
    if (r === 'absences') detail = ` ${a.absences}`; if (r === 'retards') detail = ` ${a.lates}`; if (r === 'devoirs') detail = ` ${a.missingHomeworks.length}`; if (r === 'frais') detail = ` ${a.overdueAmount} DT`;
    return `<span class="badge ${cls}">${lbl}${esc(detail)}</span>`; }).join(' ');
}
async function loadAlerts() {
  const el = document.getElementById('alerts-list'); if (!el) return;
  try {
    const r = (await api.get('/alerts/students')).data; App.cache.alerts = r;
    if (!r.items.length) { el.innerHTML = `<div class="text-green-700 bg-green-50 rounded-lg p-3 text-sm"><i class="fas fa-circle-check mr-1"></i>Aucun signal d'alerte pour vos ${r.total} élèves (trimestre ${r.trimester}).</div>`; return; }
    el.innerHTML = `<div class="grid md:grid-cols-2 gap-2">${r.items.slice(0, 6).map(a => `
      <div class="border rounded-lg p-2.5 flex items-start gap-3 hover:bg-gray-50 cursor-pointer" onclick="App.cache.gradeStudent=${a.student.id}; navigate('grades')">
        <div class="w-9 h-9 rounded-full ${a.score >= 4 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'} flex items-center justify-center font-bold text-sm shrink-0">${Math.round(a.score)}</div>
        <div class="min-w-0"><div class="font-semibold text-gray-800 text-sm truncate">${esc(a.student.first_name)} ${esc(a.student.last_name)} <span class="text-gray-400 font-normal text-xs">${esc(a.student.level)}</span></div>
        <div class="mt-1 flex flex-wrap gap-1">${alertBadges(a)}</div></div>
      </div>`).join('')}</div>${r.items.length > 6 ? `<p class="text-xs text-gray-500 mt-2">+ ${r.items.length - 6} autre(s) — <a href="#" onclick="event.preventDefault(); showAlertsDetail()" class="text-blue-600 font-semibold">voir tout</a></p>` : ''}`;
  } catch (e) { el.innerHTML = `<p class="text-red-600 text-sm">${esc(e.response?.data?.error || e.message)}</p>`; }
}
async function showAlertsDetail() {
  const r = App.cache.alerts || (await api.get('/alerts/students')).data;
  openModal('<i class="fas fa-user-shield text-red-500 mr-2"></i>Élèves à suivre — détail', `
    <p class="text-xs text-gray-500 mb-3">Trimestre ${r.trimester} · absences depuis le ${fmtDate(r.since)} · ${r.items.length} élève(s) sur ${r.total}. Cliquez sur un élève pour ouvrir ses notes.</p>
    ${r.items.length ? `<div class="overflow-x-auto"><table class="data-table w-full"><thead><tr><th>Élève</th><th>Niveau</th><th>Moyenne</th><th>Matières &lt; 10</th><th>Abs. / Ret.</th><th>Devoirs</th>${App.user.role === 'admin' ? '<th>Frais</th>' : ''}<th>Parent</th></tr></thead><tbody>
      ${r.items.map(a => `<tr class="cursor-pointer hover:bg-blue-50" onclick="closeModal(); App.cache.gradeStudent=${a.student.id}; navigate('grades')">
        <td class="font-semibold">${esc(a.student.first_name)} ${esc(a.student.last_name)}</td><td>${esc(a.student.level)}</td>
        <td><b class="${a.avg !== null && a.avg < 10 ? 'text-red-600' : 'text-gray-700'}">${a.avg ?? '-'}</b></td>
        <td class="text-xs">${a.weakSubjects.map(w => `${esc(w.name)} <b class="text-red-600">${w.average}</b>`).join('<br>') || '-'}</td>
        <td class="${a.absences >= r.absThreshold ? 'text-red-600 font-bold' : ''}">${a.absences} / ${a.lates}</td>
        <td class="text-xs">${a.missingHomeworks.length ? `<b class="text-purple-700">${a.missingHomeworks.length}</b> non rendu(s)<br><span class="text-gray-400">${a.missingHomeworks.slice(0,2).map(h => esc(h.title)).join(', ')}</span>` : '-'}</td>
        ${App.user.role === 'admin' ? `<td class="text-xs">${a.overdueFees ? `<b class="text-red-600">${a.overdueAmount} DT</b> (${a.overdueFees})` : '-'}</td>` : ''}
        <td class="text-xs">${esc(a.student.parent_name || '')}<br><a href="tel:${esc(a.student.parent_phone || '')}" class="text-blue-600" onclick="event.stopPropagation()">${esc(a.student.parent_phone || '')}</a></td>
      </tr>`).join('')}</tbody></table></div>
    <div class="mt-3 text-right"><button onclick="exportAlertsExcel()" class="${btnSecondary} text-sm"><i class="fas fa-file-excel text-green-600 mr-1"></i> Export Excel</button></div>` : '<p class="text-green-700 text-sm">Aucun signal d\'alerte.</p>'}`, { wide: true });
}
function exportAlertsExcel() {
  const r = App.cache.alerts; if (!r) return;
  const rows = r.items.map(a => ({ 'Élève': `${a.student.first_name} ${a.student.last_name}`, 'Niveau': a.student.level, 'Moyenne': a.avg ?? '', 'Matières < 10': a.weakSubjects.map(w => `${w.name} ${w.average}`).join(', '), 'Absences (30 j)': a.absences, 'Retards (30 j)': a.lates, 'Devoirs non rendus': a.missingHomeworks.length, 'Frais en retard (DT)': a.overdueAmount, 'Signaux': a.reasons.join(', '), 'Parent': a.student.parent_name || '', 'Téléphone': a.student.parent_phone || '' }));
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Élèves à suivre');
  XLSX.writeFile(wb, `eleves_a_suivre_T${r.trimester}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
}
