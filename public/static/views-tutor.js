/* ============================================================
   Rahma Academy — views-tutor.js
   F64 — Agent tuteur IA « Rafik » (conversation + voix « ado »)
   F61 P2/P3 — Centre de notifications (panneau latéral),
   thème sombre, bascule RTL, piège de focus des modales.
   Dépend de app.js (api, esc, toast, App, BRAND…).
   ============================================================ */

// ---------------- Préférences d'interface (thème / direction) ----------------
const UIPREF = {
  get theme() { return localStorage.getItem('ui_theme') || 'auto'; },      // light | dark | auto
  set theme(v) { localStorage.setItem('ui_theme', v); applyTheme(); },
  get dir() { return localStorage.getItem('ui_dir') || 'ltr'; },           // ltr | rtl
  set dir(v) { localStorage.setItem('ui_dir', v); applyDir(); },
  get voice() { return JSON.parse(localStorage.getItem('ui_voice') || '{"on":true,"persona":"teen"}'); },
  set voice(v) { localStorage.setItem('ui_voice', JSON.stringify(v)); }
};
function applyTheme() {
  const t = UIPREF.theme;
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0b1220' : (getComputedStyle(document.documentElement).getPropertyValue('--brand-primary').trim() || '#1d4ed8'));
}
function applyDir() {
  const rtl = UIPREF.dir === 'rtl';
  document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', rtl ? 'ar' : 'fr');
}
function cycleTheme() { const order = ['light', 'dark', 'auto']; UIPREF.theme = order[(order.indexOf(UIPREF.theme) + 1) % 3]; toast({ light: '☀️ Thème clair', dark: '🌙 Thème sombre', auto: '🖥️ Thème automatique (système)' }[UIPREF.theme], 'info'); if (typeof render === 'function' && App.user) render(); }
function toggleDir() { UIPREF.dir = UIPREF.dir === 'rtl' ? 'ltr' : 'rtl'; toast(UIPREF.dir === 'rtl' ? 'الاتجاه : من اليمين إلى اليسار' : 'Sens de lecture : gauche → droite', 'info'); if (typeof render === 'function' && App.user) render(); }
function themeIcon() { return { light: 'fa-sun', dark: 'fa-moon', auto: 'fa-circle-half-stroke' }[UIPREF.theme] || 'fa-sun'; }
try { applyTheme(); applyDir(); if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (UIPREF.theme === 'auto') applyTheme(); }); } catch {}

// ---------------- Piège de focus + Échap pour les modales et panneaux (accessibilité) ----------------
// Gestion au niveau document : fonctionne même si le contenu du panneau est re-rendu (focus perdu).
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
function topLayer() { return document.getElementById('tutor-panel') || document.getElementById('notif-panel') || document.getElementById('modal') || null; }
function focusFirstIn(container, preferInput) {
  if (!container) return;
  const items = [...container.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  const target = (preferInput && items.find(el => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) || items[0];
  if (target) { try { target.focus({ preventScroll: true }); } catch {} }
}
function trapFocus(container) {
  if (!container || container.__trapped) return;
  container.__trapped = true;
  container.__prevFocus = document.activeElement;
  setTimeout(() => focusFirstIn(container, true), 40);
}
function restoreFocus(container) { const prev = container && container.__prevFocus; if (prev && document.contains(prev)) { try { prev.focus(); } catch {} } }
document.addEventListener('keydown', e => {
  const layer = topLayer(); if (!layer) return;
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    if (layer.id === 'tutor-panel') closeTutor(); else if (layer.id === 'notif-panel') closeNotifPanel(); else closeModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...layer.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if (!items.length) { e.preventDefault(); return; }
  const a = items[0], z = items[items.length - 1], cur = document.activeElement;
  if (!layer.contains(cur)) { e.preventDefault(); (e.shiftKey ? z : a).focus(); return; }
  if (e.shiftKey && cur === a) { e.preventDefault(); z.focus(); }
  else if (!e.shiftKey && cur === z) { e.preventDefault(); a.focus(); }
}, true);
// Observation des modales ouvertes par openModal() (sans modifier app.js) : rôle ARIA, focus initial, restitution du focus
try {
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && n.id === 'modal') { n.setAttribute('role', 'dialog'); n.setAttribute('aria-modal', 'true'); trapFocus(n); }
    for (const m of muts) for (const n of m.removedNodes) if (n.nodeType === 1 && (n.id === 'modal' || n.id === 'notif-panel' || n.id === 'tutor-panel')) restoreFocus(n);
  }).observe(document.body, { childList: true });
} catch {}

// ---------------- Centre de notifications (panneau latéral) ----------------
const NOTIF_TYPES = { cours: 'Cours', evenement: 'Événement', examen: 'Examen', absence: 'Absence', retard: 'Retard', frais: 'Frais', note: 'Note', engagement: 'Engagement', info: 'Info', devoir: 'Devoir', chat: 'Message' };
const NC = { open: false, filter: 'all', type: '', items: [], unread: 0, loading: false };
async function openNotifPanel() {
  if (!App.user) return;
  NC.open = true;
  let p = document.getElementById('notif-panel');
  if (!p) {
    p = document.createElement('div'); p.id = 'notif-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Centre de notifications');
    p.className = 'fixed inset-0 z-[60]';
    document.body.appendChild(p);
  }
  renderNotifPanel();
  trapFocus(p);
  await loadNotifPanel();
}
function closeNotifPanel() { NC.open = false; document.getElementById('notif-panel')?.remove(); }
async function loadNotifPanel() {
  NC.loading = true; renderNotifPanel();
  try { const r = (await api.get(`/notifications/feed?limit=120${NC.type ? '&type=' + NC.type : ''}`)).data; NC.items = r.items || []; NC.unread = r.unread || 0; NC.supported = r.supported !== false; }
  catch (e) { NC.items = []; NC.unread = 0; }
  NC.loading = false; renderNotifPanel();
}
function notifGroupLabel(d) {
  const day = dayjs(d), now = dayjs();
  if (day.isSame(now, 'day')) return "Aujourd'hui";
  if (day.isSame(now.subtract(1, 'day'), 'day')) return 'Hier';
  if (day.isAfter(now.subtract(7, 'day'))) return 'Cette semaine';
  return 'Plus ancien';
}
function renderNotifPanel() {
  const p = document.getElementById('notif-panel'); if (!p || !NC.open) return;
  const rtl = UIPREF.dir === 'rtl';
  let items = NC.items;
  if (NC.filter === 'unread') items = items.filter(n => !n.read);
  const groups = {}; items.forEach(n => { const g = notifGroupLabel(n.created_at); (groups[g] = groups[g] || []).push(n); });
  const order = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien'];
  const typeIcon = t => (typeof notifIcon === 'function' ? notifIcon(t) : 'fa-bell text-blue-500');
  p.innerHTML = `
    <div class="absolute inset-0 bg-black/40" onclick="closeNotifPanel()"></div>
    <aside class="absolute top-0 bottom-0 ${rtl ? 'left-0' : 'right-0'} w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col notif-slide" id="notif-panel-body">
      <header class="px-4 py-3 border-b dark:border-slate-700 flex items-center gap-2">
        <i class="fas fa-bell text-amber-500"></i><h2 class="font-bold text-slate-800 dark:text-slate-100 flex-1">Notifications ${NC.unread ? `<span class="ml-1 text-xs bg-red-500 text-white rounded-full px-2 py-0.5">${NC.unread}</span>` : ''}</h2>
        <button onclick="navigate('notifications'); closeNotifPanel()" class="icon-btn" title="Page complète" aria-label="Ouvrir la page des notifications"><i class="fas fa-up-right-from-square"></i></button>
        <button onclick="closeNotifPanel()" class="icon-btn" aria-label="Fermer"><i class="fas fa-times text-lg"></i></button>
      </header>
      <div class="px-4 py-2 border-b dark:border-slate-700 flex items-center gap-2 flex-wrap text-xs">
        <button onclick="NC.filter='all'; renderNotifPanel()" class="px-3 py-1 rounded-full ${NC.filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">Toutes</button>
        <button onclick="NC.filter='unread'; renderNotifPanel()" class="px-3 py-1 rounded-full ${NC.filter === 'unread' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">Non lues</button>
        <select onchange="NC.type=this.value; loadNotifPanel()" class="ml-auto border rounded-lg px-2 py-1 text-xs bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200" aria-label="Filtrer par type"><option value="">Tous les types</option>${Object.entries(NOTIF_TYPES).map(([k, v]) => `<option value="${k}" ${NC.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        ${NC.unread && NC.supported ? `<button onclick="markAllNotifsReadPanel()" class="text-blue-600 dark:text-blue-300 font-semibold"><i class="fas fa-check-double mr-1"></i>Tout lire</button>` : ''}
      </div>
      <div class="flex-1 overflow-y-auto" id="notif-panel-list">
        ${NC.loading ? '<p class="text-center text-slate-400 py-10"><i class="fas fa-spinner fa-spin text-2xl"></i></p>' :
          !items.length ? '<p class="text-center text-slate-400 py-12"><i class="fas fa-bell-slash text-3xl block mb-2"></i>Aucune notification</p>' :
          order.filter(g => groups[g]).map(g => `
            <h3 class="sticky top-0 bg-slate-50 dark:bg-slate-800 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 px-4 py-1.5 border-b dark:border-slate-700">${g}</h3>
            ${groups[g].map(n => `
              <article class="px-4 py-3 border-b dark:border-slate-800 flex gap-3 ${n.read ? '' : 'bg-blue-50/70 dark:bg-blue-900/20'} ${n.link ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800' : ''}" ${n.link ? `onclick="closeNotifPanel(); openNotif(${n.id}, '${esc(n.link)}')"` : ''} tabindex="0" role="${n.link ? 'link' : 'article'}">
                <span class="relative mt-0.5"><i class="fas ${typeIcon(n.type)} text-lg"></i>${n.read ? '' : '<span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500"></span>'}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm ${n.read ? 'text-slate-700 dark:text-slate-300' : 'font-bold text-slate-900 dark:text-white'} truncate">${esc(n.title || NOTIF_TYPES[n.type] || n.type)}</p>
                  <p class="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">${esc(n.message)}</p>
                  <p class="text-[11px] text-slate-400 mt-1">${n.students ? esc(n.students.first_name + ' ' + n.students.last_name) + ' • ' : ''}${dayjs(n.created_at).format('DD/MM HH:mm')}</p>
                </div>
                ${!n.read && NC.supported ? `<button onclick="event.stopPropagation(); markNotifReadPanel(${n.id})" class="text-slate-400 hover:text-green-600 self-start" title="Marquer comme lu" aria-label="Marquer comme lu"><i class="fas fa-check"></i></button>` : ''}
              </article>`).join('')}`).join('')}
      </div>
    </aside>`;
  if (!p.contains(document.activeElement) || document.activeElement === document.body) focusFirstIn(p);
}
async function markNotifReadPanel(id) { try { await api.post('/notifications/read', { ids: [id] }); } catch {} const n = NC.items.find(x => x.id === id); if (n) { n.read = true; NC.unread = Math.max(0, NC.unread - 1); } renderNotifPanel(); if (typeof refreshNotifBadge === 'function') refreshNotifBadge(); }
async function markAllNotifsReadPanel() { try { await api.post('/notifications/read', { all: true }); } catch {} NC.items.forEach(n => n.read = true); NC.unread = 0; renderNotifPanel(); if (typeof refreshNotifBadge === 'function') refreshNotifBadge(); toast('Toutes les notifications sont lues'); }

// ---------------- Agent tuteur IA « Rafik » ----------------
const TUTOR = { open: false, msgs: [], busy: false, lang: localStorage.getItem('tutor_lang') || 'fr', persona: null, suggestions: [], speaking: false, status: null, engine: 'auto', listening: false };
const TUTOR_HELLO = {
  fr: { teen: "Salut ! Moi c'est Rafik 😎 Ton coach pour les devoirs. Pose-moi une question (maths, français, sciences…) et on avance ensemble, étape par étape. C'est quoi ton blocage du jour ?", kid: "Coucou ! Je suis Rafik 🌟 Je t'aide à comprendre tes leçons. Dis-moi ce que tu veux apprendre !", adult: "Bonjour, je suis Rafik, l'assistant pédagogique de la plateforme. Je peux expliquer une notion, proposer des exercices ou aider à préparer une séance. Comment puis-je vous aider ?" },
  ar: { teen: "أهلا ! أنا رفيق 😎 مدرّبك في الدروس. اسألني في الرياضيات أو العربية أو العلوم ونتقدّم معًا خطوة خطوة. ما هي الصعوبة اليوم ؟", kid: "مرحبا ! أنا رفيق 🌟 أساعدك على فهم دروسك. ماذا تريد أن تتعلّم ؟", adult: "مرحبًا، أنا رفيق المساعد البيداغوجي للمنصّة. يمكنني شرح مفهوم أو اقتراح تمارين أو المساعدة في إعداد حصّة. كيف أساعدك ؟" }
};
function tutorPersona() { return TUTOR.persona || (UIPREF.voice.persona) || (App.user?.role === 'student' ? 'teen' : 'adult'); }
function tutorLevel() { const u = App.user || {}; if (u.role === 'student' && u.linked_student_id) { const s = (App.cache.studentsList || []).find(x => x.id === u.linked_student_id); if (s) return s.level; } return App.cache.tutorLevel || ''; }
async function openTutor(opts = {}) {
  if (!App.user) return;
  TUTOR.open = true;
  if (opts.subject) TUTOR.subject = opts.subject;
  if (opts.lang) TUTOR.lang = opts.lang;
  let p = document.getElementById('tutor-panel');
  if (!p) { p = document.createElement('div'); p.id = 'tutor-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Tuteur IA Rafik'); p.className = 'fixed inset-0 z-[60]'; document.body.appendChild(p); }
  if (!TUTOR.msgs.length) { TUTOR.msgs = [{ role: 'assistant', content: TUTOR_HELLO[TUTOR.lang][tutorPersona()], emoji: '👋' }]; TUTOR.suggestions = TUTOR.lang === 'ar' ? ['اشرح لي الكسور', 'كيف أحلّ معادلة ؟', 'ساعدني في الإنشاء'] : ['Explique-moi les fractions', 'Comment résoudre une équation ?', 'Aide-moi pour ma rédaction']; }
  if (!TUTOR.status) { try { TUTOR.status = (await api.get('/ai/status')).data; } catch { TUTOR.status = { enabled: true }; } }
  renderTutor(); trapFocus(p);
  if (opts.question) { const inp = document.getElementById('tutor-input'); if (inp) { inp.value = opts.question; } sendTutor(); }
}
function closeTutor() { TUTOR.open = false; stopSpeak(); stopListen(); document.getElementById('tutor-panel')?.remove(); }
function resetTutor() { TUTOR.msgs = []; TUTOR.suggestions = []; stopSpeak(); openTutor(); }
function setTutorLang(l) { TUTOR.lang = l; localStorage.setItem('tutor_lang', l); TUTOR.msgs = []; openTutor(); }
function setTutorPersona(pp) { TUTOR.persona = pp; UIPREF.voice = { ...UIPREF.voice, persona: pp }; TUTOR.msgs = []; openTutor(); }
function toggleTutorVoice() { const v = UIPREF.voice; UIPREF.voice = { ...v, on: !v.on }; if (v.on) stopSpeak(); renderTutor(); }
function renderTutor() {
  const p = document.getElementById('tutor-panel'); if (!p || !TUTOR.open) return;
  const rtl = UIPREF.dir === 'rtl', ar = TUTOR.lang === 'ar', voice = UIPREF.voice, persona = tutorPersona();
  const engines = TUTOR.status?.engines || [];
  p.innerHTML = `
    <div class="absolute inset-0 bg-black/40" onclick="closeTutor()"></div>
    <aside class="absolute top-0 bottom-0 ${rtl ? 'left-0' : 'right-0'} w-full max-w-lg bg-white dark:bg-slate-900 shadow-2xl flex flex-col notif-slide" id="tutor-body">
      <header class="px-4 py-3 border-b dark:border-slate-700 flex items-center gap-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white">
        <span class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl ${TUTOR.speaking ? 'tutor-pulse' : ''}" aria-hidden="true">🤖</span>
        <div class="flex-1 min-w-0"><h2 class="font-bold leading-tight">Rafik <span class="text-white/70 font-normal text-xs">· ${ar ? 'المرافق الذكي' : 'tuteur IA'}</span></h2><p class="text-[11px] text-white/80 truncate">${TUTOR.status?.enabled === false ? '⚠️ IA non configurée' : (TUTOR.speaking ? '🔊 ' + (ar ? 'يتكلّم…' : 'en train de parler…') : TUTOR.busy ? (ar ? 'يفكّر…' : 'réfléchit…') : (ar ? 'متّصل' : 'en ligne'))}${TUTOR.lastEngine ? ` · ${TUTOR.lastEngine}` : ''}</p></div>
        <button onclick="toggleTutorVoice()" class="icon-btn text-white hover:bg-white/20 ${voice.on ? '' : 'opacity-60'}" title="${voice.on ? 'Couper la voix' : 'Activer la voix'}" aria-pressed="${voice.on}" aria-label="Voix"><i class="fas ${voice.on ? 'fa-volume-high' : 'fa-volume-xmark'}"></i></button>
        <button onclick="resetTutor()" class="icon-btn text-white hover:bg-white/20" title="Nouvelle conversation" aria-label="Nouvelle conversation"><i class="fas fa-rotate"></i></button>
        <button onclick="closeTutor()" class="icon-btn text-white hover:bg-white/20" aria-label="Fermer"><i class="fas fa-times text-lg"></i></button>
      </header>
      <div class="px-3 py-2 border-b dark:border-slate-700 flex items-center gap-2 flex-wrap text-[11px]">
        <div class="inline-flex rounded-lg overflow-hidden border dark:border-slate-600"><button onclick="setTutorLang('fr')" class="px-2 py-1 ${!ar ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 dark:text-slate-200'}">FR</button><button onclick="setTutorLang('ar')" class="px-2 py-1 ${ar ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 dark:text-slate-200'}">عربي</button></div>
        <div class="inline-flex rounded-lg overflow-hidden border dark:border-slate-600" role="group" aria-label="Style de réponse">${[['kid', '🧒 ' + (ar ? 'طفل' : 'Enfant')], ['teen', '🧑‍🎓 ' + (ar ? 'مراهق' : 'Ado')], ['adult', '👩‍🏫 ' + (ar ? 'بالغ' : 'Adulte')]].map(([k, l]) => `<button onclick="setTutorPersona('${k}')" class="px-2 py-1 ${persona === k ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-800 dark:text-slate-200'}">${l}</button>`).join('')}</div>
        ${engines.length > 1 ? `<select onchange="TUTOR.engine=this.value" class="border rounded-lg px-1 py-1 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-200" title="Moteur IA" aria-label="Moteur IA"><option value="auto" ${TUTOR.engine === 'auto' ? 'selected' : ''}>Auto</option>${engines.map(e => `<option value="${e.id}" ${TUTOR.engine === e.id ? 'selected' : ''}>${e.id === 'primary' ? 'Principal' : 'Alternatif'} · ${esc(e.model)}</option>`).join('')}</select>` : ''}
        <span class="ml-auto text-slate-400">${voice.on ? (ar ? 'صوت ' : 'voix ') + ({ kid: '🧒', teen: '🎧 ado', adult: '🎙️' }[persona]) : ''}</span>
      </div>
      <div class="flex-1 overflow-y-auto px-4 py-3 space-y-3 ${ar ? 'ar' : ''}" id="tutor-msgs" dir="${ar ? 'rtl' : 'ltr'}" aria-live="polite">
        ${TUTOR.msgs.map((m, i) => m.role === 'user'
          ? `<div class="flex ${ar ? 'justify-start' : 'justify-end'}"><div class="max-w-[85%] bg-blue-600 text-white rounded-2xl ${ar ? 'rounded-tl-sm' : 'rounded-tr-sm'} px-4 py-2 text-sm whitespace-pre-wrap">${esc(m.content)}</div></div>`
          : `<div class="flex ${ar ? 'justify-end' : 'justify-start'} gap-2"><span class="text-xl mt-1" aria-hidden="true">${m.emoji || '🤖'}</span><div class="max-w-[85%] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-2xl ${ar ? 'rounded-tr-sm' : 'rounded-tl-sm'} px-4 py-2 text-sm whitespace-pre-wrap leading-relaxed">${esc(m.content)}<div class="mt-1 flex gap-2 ${ar ? 'justify-start' : 'justify-end'} text-[11px] text-slate-400"><button onclick="speakText(TUTOR.msgs[${i}].content)" title="Écouter" aria-label="Écouter"><i class="fas fa-volume-high"></i></button><button onclick="navigator.clipboard.writeText(TUTOR.msgs[${i}].content).then(()=>toast('Copié 📋'))" title="Copier" aria-label="Copier"><i class="fas fa-copy"></i></button></div></div></div>`).join('')}
        ${TUTOR.busy ? `<div class="flex ${ar ? 'justify-end' : 'justify-start'} gap-2"><span class="text-xl" aria-hidden="true">🤖</span><div class="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 text-slate-400"><span class="tutor-dots"><i></i><i></i><i></i></span></div></div>` : ''}
        ${TUTOR.error ? `<p class="text-xs text-red-600 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2"><i class="fas fa-triangle-exclamation mr-1"></i>${esc(TUTOR.error)}</p>` : ''}
      </div>
      ${TUTOR.suggestions.length && !TUTOR.busy ? `<div class="px-3 pb-1 flex gap-2 overflow-x-auto" dir="${ar ? 'rtl' : 'ltr'}">${TUTOR.suggestions.map(s => `<button onclick="sendTutor(${JSON.stringify(s).replace(/"/g, '&quot;')})" class="flex-shrink-0 text-xs bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200 border border-violet-200 dark:border-violet-700 rounded-full px-3 py-1 hover:bg-violet-100">${esc(s)}</button>`).join('')}</div>` : ''}
      <form class="p-3 border-t dark:border-slate-700 flex items-end gap-2" onsubmit="event.preventDefault(); sendTutor()" dir="${ar ? 'rtl' : 'ltr'}">
        <button type="button" onclick="toggleListen()" class="icon-btn ${TUTOR.listening ? 'bg-red-100 text-red-600 tutor-pulse' : 'text-slate-500'}" title="${ar ? 'تكلّم' : 'Parler'}" aria-label="Dicter" aria-pressed="${TUTOR.listening}"><i class="fas fa-microphone"></i></button>
        <textarea id="tutor-input" rows="1" class="flex-1 border rounded-xl px-3 py-2 text-sm resize-none max-h-32 bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100 ${ar ? 'ar' : ''}" placeholder="${ar ? 'اكتب سؤالك…' : 'Pose ta question…'}" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendTutor()}" oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,128)+'px'" ${TUTOR.busy ? 'disabled' : ''}></textarea>
        <button type="submit" class="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 text-white flex items-center justify-center disabled:opacity-50" ${TUTOR.busy ? 'disabled' : ''} aria-label="Envoyer"><i class="fas fa-paper-plane"></i></button>
      </form>
    </aside>`;
  const list = document.getElementById('tutor-msgs'); if (list) list.scrollTop = list.scrollHeight;
  if (!p.contains(document.activeElement) || document.activeElement === document.body) { const inp = document.getElementById('tutor-input'); if (inp && !inp.disabled) { try { inp.focus({ preventScroll: true }); } catch {} } else focusFirstIn(p); }
}
async function sendTutor(text) {
  const inp = document.getElementById('tutor-input');
  const q = String(text || (inp ? inp.value : '')).trim();
  if (!q || TUTOR.busy) return;
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  stopSpeak();
  TUTOR.msgs.push({ role: 'user', content: q }); TUTOR.busy = true; TUTOR.error = null; TUTOR.suggestions = []; renderTutor();
  try {
    const payload = { messages: TUTOR.msgs.slice(-12).map(m => ({ role: m.role, content: m.content })), lang: TUTOR.lang, persona: tutorPersona(), level: tutorLevel(), subject: TUTOR.subject || '', engine: TUTOR.engine };
    const r = (await api.post('/ai/tutor', payload, { timeout: 60000 })).data;
    TUTOR.msgs.push({ role: 'assistant', content: r.reply, emoji: r.emoji }); TUTOR.suggestions = r.suggestions || []; TUTOR.lastEngine = r.engine === 'alt' ? 'moteur alternatif' : '';
    TUTOR.busy = false; renderTutor();
    if (UIPREF.voice.on) speakText(r.reply);
  } catch (e) {
    TUTOR.busy = false; TUTOR.error = e.response?.data?.error || e.message; renderTutor();
  }
}

// ---- Voix : Web Speech API (synthèse) — profil « ado » = débit vif + tonalité plus haute ; choix de la meilleure voix fr/ar disponible ----
let _voices = [];
function loadVoices() { try { _voices = speechSynthesis.getVoices() || []; } catch { _voices = []; } }
try { loadVoices(); if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = loadVoices; } catch {}
function pickVoice(lang, persona) {
  if (!_voices.length) loadVoices();
  const pref = lang === 'ar' ? ['ar-TN', 'ar-SA', 'ar-EG', 'ar'] : ['fr-FR', 'fr-CA', 'fr-BE', 'fr'];
  const cands = _voices.filter(v => pref.some(p => (v.lang || '').replace('_', '-').toLowerCase().startsWith(p.toLowerCase())));
  if (!cands.length) return null;
  // Ado / enfant : préférer les voix « jeunes » ou féminines (plus aiguës) ; adulte : voix masculine/neutre si dispo
  const young = /amélie|amelie|audrey|aurélie|aurelie|chantal|julie|léa|lea|marie|céline|celine|denise|eloise|female|femme|google français|zeina|hoda|laila|salma|mariam|female/i;
  const male = /thomas|nicolas|paul|henri|claude|male|homme|naayf|tarik|hamed|majed|male/i;
  const scored = cands.map(v => ({ v, s: (v.localService ? 0 : 1) + ((persona === 'adult' ? male : young).test(v.name) ? 3 : 0) + (/google|natural|neural|premium|enhanced/i.test(v.name) ? 2 : 0) + (v.default ? .5 : 0) }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].v;
}
function speakText(text) {
  if (!('speechSynthesis' in window) || !text) return;
  stopSpeak();
  const persona = tutorPersona(), lang = TUTOR.lang;
  const clean = String(text).replace(/[*_#`>]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  // Découpage en phrases (évite les coupures des moteurs sur les longs textes)
  const parts = clean.match(/[^.!?؟…\n]+[.!?؟…]*/g) || [clean];
  const voice = pickVoice(lang, persona);
  const profile = { kid: { rate: 0.95, pitch: 1.35 }, teen: { rate: 1.12, pitch: 1.18 }, adult: { rate: 1.0, pitch: 1.0 } }[persona];
  TUTOR.speaking = true; renderTutor();
  parts.forEach((ph, i) => {
    const u = new SpeechSynthesisUtterance(ph.trim());
    u.lang = lang === 'ar' ? (voice?.lang || 'ar-SA') : (voice?.lang || 'fr-FR');
    if (voice) u.voice = voice;
    u.rate = profile.rate; u.pitch = profile.pitch; u.volume = 1;
    if (i === parts.length - 1) u.onend = () => { TUTOR.speaking = false; renderTutor(); };
    u.onerror = () => { TUTOR.speaking = false; renderTutor(); };
    speechSynthesis.speak(u);
  });
}
function stopSpeak() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {} if (TUTOR.speaking) { TUTOR.speaking = false; renderTutor(); } }

// ---- Dictée vocale (reconnaissance) ----
let _rec = null;
function toggleListen() {
  if (TUTOR.listening) return stopListen();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Reconnaissance vocale non disponible sur ce navigateur', 'warning'); return; }
  _rec = new SR(); _rec.lang = TUTOR.lang === 'ar' ? 'ar-TN' : 'fr-FR'; _rec.interimResults = true; _rec.continuous = false;
  _rec.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(' '); const inp = document.getElementById('tutor-input'); if (inp) inp.value = t; if (e.results[e.results.length - 1].isFinal) { stopListen(); sendTutor(t); } };
  _rec.onerror = () => stopListen(); _rec.onend = () => { if (TUTOR.listening) stopListen(); };
  TUTOR.listening = true; renderTutor(); try { _rec.start(); } catch { stopListen(); }
}
function stopListen() { try { _rec && _rec.stop(); } catch {} _rec = null; if (TUTOR.listening) { TUTOR.listening = false; renderTutor(); } }

// ---- Bouton flottant (visible pour les utilisateurs connectés) ----
function mountTutorFab() {
  if (!App.user) { document.getElementById('tutor-fab')?.remove(); return; }
  if (document.getElementById('tutor-fab')) return;
  const b = document.createElement('button');
  b.id = 'tutor-fab'; b.type = 'button'; b.setAttribute('aria-label', 'Ouvrir le tuteur IA Rafik'); b.title = 'Rafik — tuteur IA';
  b.className = 'fixed z-40 bottom-20 md:bottom-6 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-xl flex items-center justify-center text-2xl hover:scale-105 transition';
  b.innerHTML = '🤖';
  b.onclick = () => openTutor();
  document.body.appendChild(b);
}
try { document.addEventListener('app:rendered', mountTutorFab); setInterval(mountTutorFab, 2500); } catch {}

// Raccourci clavier : Alt+N (notifications), Alt+T (tuteur), Alt+D (thème)
document.addEventListener('keydown', e => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); NC.open ? closeNotifPanel() : openNotifPanel(); }
  if (e.key === 't' || e.key === 'T') { e.preventDefault(); TUTOR.open ? closeTutor() : openTutor(); }
  if (e.key === 'd' || e.key === 'D') { e.preventDefault(); cycleTheme(); }
});
