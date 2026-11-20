/* ============================================================
   Rahma Academy — views-rafiq-teacher.js
   F67 — 🧑‍🏫 رفيق المعلم : espace de travail de l'enseignant
   Inspiré de l'application compagnon « رفيق المعلم » (turquoise) :
   accueil + statistiques, التحضير, التثبيت, أدوات المعلم,
   الشرح التفاعلي, ألعاب الدرس, منشئ الملازم (wizard ٣ خطوات).
   Ne duplique rien : chaque tuile ouvre une fonction existante
   (IA, examens, cours interactifs, bibliothèque, devoirs…).
   Dépend de app.js (api, esc, toast, render, pageHeader, App).
   ============================================================ */

const RAFIQ = { screen: 'home', stats: null, loading: false, booklet: null, studio: { step: 1, source: '', title: '', objective: '', kind: 'summary', lang: 'ar', busy: false } };

// Types de supports (identiques à la capture « منشئ الملازم »)
const RAFIQ_BOOKLETS = {
  explain:   { ar: 'ملزمة شرح',        fr: 'Fiche d\'explication', icon: 'fa-align-right',   ai: 'summary',   ask: 'ملزمة شرح منظّمة بأسلوب تعليمي مبسّط.' },
  revision:  { ar: 'ملزمة مراجعة',      fr: 'Fiche de révision',    icon: 'fa-clipboard-list', ai: 'summary',   ask: 'ملزمة مراجعة سريعة قبل الفرض: أهم ما يُنسى.' },
  keyinfo:   { ar: 'ملزمة أهم المعلومات', fr: 'L\'essentiel',         icon: 'fa-star',          ai: 'summary',   ask: 'ملزمة «أهم المعلومات»: الحقائق والأرقام التي تُسأل عنها دائماً.' },
  compare:   { ar: 'ملزمة مقارنات',      fr: 'Comparaisons',         icon: 'fa-table-columns', ai: 'summary',   ask: 'ملزمة مقارنات: جدول يوضّح الفروق بين المفاهيم المتشابهة.' },
  defs:      { ar: 'ملزمة تعريفات',      fr: 'Définitions',          icon: 'fa-bookmark',      ai: 'summary',   ask: 'ملزمة تعريفات: كل المصطلحات بتعريف دقيق وجملة مثال.' },
  qonly:     { ar: 'ملزمة أسئلة فقط',    fr: 'Questions seules',     icon: 'fa-circle-question', ai: 'quiz',    ask: 'ملزمة أسئلة فقط، دون أجوبة، متدرّجة الصعوبة.' },
  qa:        { ar: 'ملزمة أسئلة وأجوبة', fr: 'Q/R corrigées',        icon: 'fa-list-check',    ai: 'quiz',      ask: 'ملزمة أسئلة وأجوبة: سؤال ثم الجواب النموذجي.' },
  examnight: { ar: 'ملزمة ليلة الامتحان', fr: 'La veille de l\'examen', icon: 'fa-moon',      ai: 'summary',   ask: 'ملزمة ليلة الامتحان: لا يُقرأ في أكثر من ١٠ دقائق، نقاط فقط.' },
  words:     { ar: 'ملزمة الكلمات',      fr: 'Vocabulaire',          icon: 'fa-language',      ai: 'flashcards', ask: 'ملزمة كلمات: المصطلح في الوجه ومعناه في الظهر.' },
  points:    { ar: 'ملزمة أهم النقاط',   fr: 'Points clés',          icon: 'fa-signal',        ai: 'summary',   ask: 'ملزمة أهم النقاط على شكل قائمة مرقّمة قصيرة.' }
};

// ---------- style tokens (suivent la palette de l'établissement) ----------
const RF_CARD = 'bg-white rounded-2xl shadow-sm border border-slate-100 transition hover:-translate-y-0.5 hover:shadow-md';
const RF_CHIP = 'w-14 h-14 rounded-2xl flex items-center justify-center text-xl flex-shrink-0';
const RF_TXT = 'text-[13px] font-bold text-slate-800 leading-tight';
const RF_SUB = 'text-[11px] text-slate-500 mt-0.5 leading-snug';

function rfChip(icon, tone) {
  const tones = {
    teal:  'bg-teal-50 text-teal-600',
    blue:  'bg-blue-50 text-blue-600',
    violet:'bg-violet-50 text-violet-600',
    amber: 'bg-amber-50 text-amber-600',
    rose:  'bg-rose-50 text-rose-600',
    green: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-600'
  };
  return `<span class="${RF_CHIP} ${tones[tone] || tones.teal}"><i class="fas ${icon}"></i></span>`;
}

// Tuile : icône + libellé arabe + précision française + action JS
function rfTile(icon, ar, fr, action, tone) {
  return `<button type="button" onclick="${esc(action)}" class="${RF_CARD} flex items-center gap-3 p-3 text-right w-full">
    ${rfChip(icon, tone)}
    <span class="min-w-0 flex-1"><span class="block ${RF_TXT}">${esc(ar)}</span><span class="block ${RF_SUB}">${esc(fr)}</span></span>
    <i class="fas fa-chevron-left text-[10px] text-slate-300 flex-shrink-0"></i>
  </button>`;
}
function rfWide(icon, ar, fr, action, tone) {
  return `<button type="button" onclick="${esc(action)}" class="${RF_CARD} flex items-center gap-3 p-4 text-right w-full">
    ${rfChip(icon, tone)}
    <span class="min-w-0 flex-1"><span class="block text-sm font-bold text-slate-800">${esc(ar)}</span><span class="block ${RF_SUB}">${esc(fr)}</span></span>
    <i class="fas fa-chevron-left text-xs text-slate-300 flex-shrink-0"></i>
  </button>`;
}
function rfSection(title, sub, body) {
  return `<section class="mb-5"><div class="flex items-baseline gap-2 mb-2 px-1"><h3 class="text-sm font-bold text-slate-700">${esc(title)}</h3><span class="text-[11px] text-slate-400">${esc(sub)}</span></div>${body}</section>`;
}
function rfGrid(cells, cols) { return `<div class="grid grid-cols-2 ${cols === 3 ? 'sm:grid-cols-3' : ''} gap-2.5" dir="rtl">${cells.join('')}</div>`; }

function rfBack(label) {
  return `<button type="button" onclick="rafiqGo('home')" class="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-800 mb-3"><i class="fas fa-arrow-right rtl:rotate-180"></i> ${esc(label || 'الرئيسية')}</button>`;
}
function rafiqGo(screen) { RAFIQ.screen = screen; if (screen !== 'studio') RAFIQ.studio.busy = false; render(); }

// ---------- bandeau d'accueil + statistiques ----------
function rfHero() {
  const u = App.user || {};
  const h = new Date().getHours();
  const greet = h < 12 ? 'صباح الخير' : h < 18 ? 'مساء الخير' : 'مساء الخير';
  const dateAr = typeof dayjs === 'function' ? dayjs().format('dddd D MMMM') : '';
  const st = RAFIQ.stats;
  const att = (st && st.attendanceToday) || {};
  const again = (st && st.period && st.period.new_students) || 0;
  const tiles = [
    ['الطلاب', st ? st.students?.total ?? 0 : '—'],
    ['حصص اليوم', st ? (att.present || 0) + (att.absent || 0) + (att.retard || 0) : '—'],
    ['حضور اليوم', st ? att.present || 0 : '—'],
    ['متأخرون', st ? att.retard || 0 : '—'],
    ['إيراد اليوم', st ? fmtMoney((st.period?.fees?.paid) || 0) : '—']
  ];
  return `<div class="rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden mb-4" style="background:linear-gradient(135deg,var(--brand-dark),color-mix(in srgb,var(--brand-primary) 82%,#000) 55%,var(--brand-accent))">
    <div class="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/10"></div>
    <div class="relative flex items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-[11px] opacity-80">${esc(greet)}</p>
        <p class="text-lg font-black truncate">${esc(u.name || '')}</p>
        <p class="text-[11px] opacity-80 mt-0.5"><i class="fas fa-calendar-day mr-1"></i>${esc(dateAr)}</p>
      </div>
      <span class="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center font-black text-sm flex-shrink-0">${esc((u.name || '?').trim()[0] || '?')}</span>
    </div>
    <div class="relative mt-4 grid grid-cols-5 gap-1.5 text-center" dir="rtl">
      ${tiles.map(([l, v]) => `<div class="rounded-xl bg-white/90 text-slate-800 py-2 px-1 min-w-0"><div class="text-sm font-black truncate">${typeof v === 'number' ? v : esc(String(v))}</div><div class="text-[9px] text-slate-500 truncate">${esc(l)}</div></div>`).join('')}
    </div>
    ${again ? `<p class="relative text-[10px] opacity-75 mt-2"><i class="fas fa-user-plus mr-1"></i>${again} nouveau(x) élève(s) sur la période</p>` : ''}
  </div>`;
}

// ---------- écran : accueil (F68 — 6 tuiles comme لقطات التطبيق) ----------
async function rafiqHome(el) {
  el.innerHTML = `<div id="rf-root"><div class="py-10 text-center text-slate-400 text-sm"><i class="fas fa-spinner fa-spin mr-2"></i>…</div></div>`;
  if (!RAFIQ.stats) {
    try { RAFIQ.stats = (await api.get('/stats')).data; } catch { RAFIQ.stats = null; }
  }
  const root = document.getElementById('rf-root');
  if (!root) return;
  const u = App.user || {};
  const st = RAFIQ.stats || {};
  const att = st.attendanceToday || {};
  const bigTile = (icon, ar, fr, action) => `<button type="button" onclick="${esc(action)}" class="bg-white rounded-2xl shadow-sm border border-slate-100 py-4 flex flex-col items-center gap-2 hover:-translate-y-0.5 transition">
    <span class="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center text-lg"><i class="fas ${icon}"></i></span>
    <span class="text-[12px] font-bold text-slate-800" dir="rtl">${esc(ar)}</span></button>`;
  root.innerHTML = `
  <div class="rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden mb-3" style="background:linear-gradient(140deg,var(--brand-dark),color-mix(in srgb,var(--brand-primary) 80%,#000) 60%,var(--brand-accent))">
    <div class="absolute -top-12 -left-12 w-40 h-40 rounded-full bg-white/10"></div>
    <div class="relative flex items-center gap-3">
      <span class="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center font-black text-sm flex-shrink-0">${esc((u.name || '?').trim()[0] || '?')}</span>
      <div class="min-w-0 flex-1"><p class="text-[11px] opacity-80">${esc(new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير')}</p>
        <p class="text-base font-black truncate">${esc(u.name || '')}</p></div>
      <span class="text-[10px] px-2 py-1 rounded-full bg-white/15 whitespace-nowrap"><i class="fas fa-clock mr-1"></i>${esc(typeof dayjs === 'function' ? dayjs().format('D MMMM') : '')}</span>
    </div>
    <p class="relative text-lg font-black mt-3 leading-snug" dir="rtl">مفيش حصص النهارده${att.present ? ' — ' + att.present + ' حاضر' : ''}</p>
  </div>

  <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 mb-4">
    <div class="flex items-center gap-2 mb-2" dir="rtl">
      <span class="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs"><i class="fas fa-arrow-left"></i></span>
      <div class="min-w-0 flex-1"><p class="text-[13px] font-black text-slate-800">الطلاب والمجموعات</p>
        <p class="text-[10px] text-slate-500" dir="rtl">${st.students?.total ?? 0} طالب · 0 مجموعات</p></div>
    </div>
    <div class="grid grid-cols-5 gap-1 text-center" dir="rtl">
      ${[['الطلاب', st.students?.total ?? 0], ['حضور اليوم', att.present ?? 0], ['حصص اليوم', (att.present || 0) + (att.absent || 0) + (att.retard || 0)], ['متأخرون', att.retard ?? 0], ['إيراد اليوم', st.period?.fees?.paid ?? 0]].map(([l, v]) => `<div class="min-w-0"><div class="text-sm font-black text-slate-800 truncate">${esc(String(v))}</div><div class="text-[9px] text-slate-400 truncate">${esc(l)}</div></div>`).join('')}
    </div>
  </div>

  <div class="grid grid-cols-3 gap-2.5 mb-4" dir="rtl">
    ${bigTile('fa-file-lines', 'التحضير', 'Préparer', "rafiqGo('prep')")}
    ${bigTile('fa-toolbox', 'أدوات المعلم', 'Outils', "rafiqGo('tools')")}
    ${bigTile('fa-brain', 'التثبيت', 'Ancrer', "rafiqGo('fix')")}
    ${bigTile('fa-shapes', 'الشرح التفاعلي', 'Expliquer', "rafiqGo('interactive')")}
    ${bigTile('fa-table-columns', 'منصتي', 'Ma plateforme', "rafiqGo('myplatform')")}
    ${bigTile('fa-users', 'المجتمع', 'Communauté', "rafiqGo('community')")}
  </div>

  ${rfSection('استوديو الدرس', 'créer n\'importe quel support', `
    ${rfWide('fa-wand-magic-sparkles', 'استوديو الدرس', '23 نوع من الدعامات من نص الدرس', "rafiqOpenStudio()", 'teal')}
    <div class="h-2"></div>
    ${rfWide('fa-layer-group', 'كل الأنواع', 'Catalogue complet — recherche incluse', "rafiqGo('types')", 'violet')}`)}

  ${rfSection('إعداد', 'préparer & évaluer', rfGrid([
    rfTile('fa-file-lines', 'إعداد الملازم', 'Fiches & livrets', "rafiqGo('booklets')", 'teal'),
    rfTile('fa-clipboard-question', 'إعداد الامتحانات', 'Examens papier / en ligne', "rafiqGo('exams')", 'rose'),
    rfTile('fa-photo-film', 'إعداد الفيديوهات', 'Vidéos & motion', "rafiqGo('motion')", 'blue'),
    rfTile('fa-microphone-lines', 'تحويل الشرح لملزمة', 'Enregistrement → fiche', "rafiqGo('recorder')", 'amber'),
    rfTile('fa-image', 'صور وحوّل', 'Photos → Word / PDF', "rafiqGo('ocr')", 'violet'),
    rfTile('fa-wand-sparkles', 'نسق تلقائي', 'Texte collé → document', "rafiqGo('autoformat')", 'green')
  ]))}

  ${rfSection('أنت', 'compte & réglages', rfGrid([
    rfTile('fa-user', 'حسابي', 'Mon compte', "rafiqGo('account')", 'teal'),
    rfTile('fa-gear', 'الإعدادات', 'Réglages', "rafiqGo('settings')", 'slate')
  ]))}
  <p class="text-center text-[11px] text-slate-400 mt-4 mb-2"><i class="fas fa-circle-info mr-1"></i>Chaque tuile ouvre une fonction déjà installée : rien n\'est dupliqué, vos données restent les mêmes.</p>`;
}

// ---------- écran : التحضير ----------
function rafiqPrep(el) {
  const boxes = [
    ['fa-file-lines', 'إعداد الملازم', '10 أنواع جاهزة', "rafiqGo('booklets')", 'teal'],
    ['fa-book-open-reader', 'منهجي', 'Programme & unités', "navigate('curriculum')", 'violet'],
    ['fa-clipboard-question', 'إعداد الامتحانات', 'Électronique ou papier', "rafiqGo('exams')", 'amber'],
    ['fa-photo-film', 'إعداد الفيديوهات', 'Cours & supports', "rafiqGo('media')", 'blue'],
    ['fa-layer-group', 'منسق الملازم', 'Fusionner des fiches', "rafiqGo('booklets')", 'slate'],
    ['fa-wand-magic-sparkles', 'استوديو الدرس', 'IA : source → support', "rafiqGo('studio')", 'teal'],
    ['fa-microphone-lines', 'تحويل الشرح لملزمة', 'Enregistrement → fiche', "rafiqGo('recorder')", 'rose']
  ];
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">التحضير</h2><p class="text-xs text-slate-500 mb-4">جهّز درسك قبل الحصة — préparez votre séance</p>${rfGrid(boxes.map(b => rfTile(b[0], b[1], b[2], b[3], b[4])))}`;
}

// ---------- écran : التثبيت ----------
function rafiqFix(el) {
  const boxes = [
    ['fa-diagram-project', 'الخرائط الذهنية', 'Carte mentale du cours', "rafiqAi('summary','خريطة ذهنية')", 'teal'],
    ['fa-images', 'العروض التقديمية', 'Diapositives', "rafiqGo('media')", 'blue'],
    ['fa-list-check', 'شيت المراجعة', 'Fiche mémo', "rafiqAi('summary','شيت مراجعة')", 'green'],
    ['fa-gamepad', 'ألعاب الدرس', 'Quiz, mémoire, tri', "rafiqGo('games')", 'violet'],
    ['fa-chart-simple', 'إنفوجرافيك الدرس', 'Visuel récapitulatif', "rafiqAi('summary','إنفوجرافيك')", 'amber'],
    ['fa-object-group', 'المنظمات البصرية', 'Tableau, schéma, frise', "rafiqAi('summary','منظّم بصري')", 'rose'],
    ['fa-note-sticky', 'بوستر مراجعة', 'Affiche de classe', "rafiqAi('summary','بوستر مراجعة')", 'slate'],
    ['fa-book-open', 'قصة الدرس', 'Récit pédagogique', "rafiqAi('summary','قصة الدرس')", 'teal']
  ];
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">التثبيت</h2><p class="text-xs text-slate-500 mb-4">ثبّت الدرس عند طلابك — consolider les acquis</p>${rfGrid(boxes.map(b => rfTile(b[0], b[1], b[2], b[3], b[4])))}`;
}

// ---------- écran : أدوات المعلم ----------
function rafiqTools(el) {
  const boxes = [
    ['fa-folder-open', 'أدوات الملفات', 'Bibliothèque de documents', "navigate('bank')", 'slate'],
    ['fa-briefcase', 'حقيبة المعلم', 'Mes cours & fichiers', "navigate('courses')", 'blue'],
    ['fa-pen-to-square', 'تعديل المستندات', 'Créer un document', "typeof showCourseForm==='function' && showCourseForm()", 'violet'],
    ['fa-square-poll-vertical', 'حدّد واشتغل', 'Sondage / vote de classe', "rafiqAi('quiz','استطلاع')", 'amber'],
    ['fa-id-badge', 'بوستراتي', 'Affiches personnalisées', "rafiqAi('summary','بوستر')", 'rose'],
    ['fa-square-root-variable', 'كاتب الرياضيات', 'Exercices de maths', "navigate('interactive')", 'green'],
    ['fa-chalkboard', 'إطارات السبورة', 'Fonds de tableau', "navigate('interactive')", 'teal'],
    ['fa-comments', 'الرسائل', 'Contacter les familles', "navigate('chat')", 'blue']
  ];
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">أدوات المعلم</h2><p class="text-xs text-slate-500 mb-4">ملفاتك وأوراقك في مكان واحد — vos outils au même endroit</p>${rfGrid(boxes.map(b => rfTile(b[0], b[1], b[2], b[3], b[4])))}`;
}

// ---------- écran : الشرح التفاعلي ----------
function rafiqInteractive(el) {
  const boxes = [
    ['fa-chalkboard-user', 'السبورة الذكية', 'Tableau & applications', "navigate('interactive')", 'teal'],
    ['fa-comments', 'الشرح المباشر', 'Tuteur IA « Rafik »', "typeof openTutor==='function' && openTutor()", 'violet'],
    ['fa-book-quran', 'المصحف الشريف', 'Textes & lectures', "navigate('courses')", 'green'],
    ['fa-window-restore', 'صانع التطبيقات', 'Cours interactifs', "navigate('interactive')", 'blue'],
    ['fa-file-lines', 'ورشة التمارين', 'Exercices arabes', "App.cache.icTab='exercices'; navigate('interactive')", 'amber'],
    ['fa-calculator', 'رياضيات السادسة', 'Application maths', "App.cache.icTab='math6'; navigate('interactive')", 'rose']
  ];
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">الشرح التفاعلي</h2><p class="text-xs text-slate-500 mb-4">وأنت تشرح في الحصة — expliquer en séance</p>${rfGrid(boxes.map(b => rfTile(b[0], b[1], b[2], b[3], b[4])))}`;
}

// ---------- écran : ألعاب الدرس ----------
function rafiqGames(el) {
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">ألعاب الدرس</h2><p class="text-xs text-slate-500 mb-4">حوّل أي درس لألعاب يلعبها طلابك — transformer la leçon en jeu</p>
  <div class="${RF_CARD} p-6 text-center mb-4">
    <div class="text-5xl mb-3 text-teal-600"><i class="fas fa-gamepad"></i></div>
    <p class="font-bold text-slate-800" dir="rtl">حوّل أي درس لألعاب يلعبها طلابك</p>
    <p class="text-xs text-slate-500 mt-1">سباق الأسئلة · وصل صح · الذاكرة · صح والا غلط</p>
    <div class="flex flex-wrap justify-center gap-2 mt-4">
      <button type="button" onclick="rafiqAi('quiz','سباق الأسئلة')" class="${btnPrimary}"><i class="fas fa-wand-magic-sparkles mr-1"></i> لعبة جديدة من درس</button>
      <button type="button" onclick="navigate('interactive')" class="${btnSecondary}"><i class="fas fa-gamepad mr-1"></i> Cours interactifs</button>
    </div>
  </div>
  ${rfSection('ألعاب جاهزة', 'à partir de vos évaluations', rfGrid([
    rfTile('fa-bolt', 'سباق الأسئلة', 'QCM chronométré', "rafiqAi('quiz','سباق أسئلة')", 'amber'),
    rfTile('fa-brain', 'الذاكرة', 'Cartes mémoire', "rafiqAi('flashcards','لعبة الذاكرة')", 'violet'),
    rfTile('fa-arrows-left-right-to-line', 'وصل صح', 'Associer', "rafiqAi('fillblank','وصل صح')", 'teal'),
    rfTile('fa-circle-check', 'صح والا غلط', 'Vrai / faux', "rafiqAi('quiz','صح أم غلط')", 'green')
  ]))}`;
}

// ---------- écran : منشئ الملازم ----------
function rafiqBooklets(el) {
  const tabs = `<div class="flex gap-1.5 mb-3 overflow-x-auto pb-1" dir="rtl">
    ${[['from-lesson', 'من درس', 'fa-wand-magic-sparkles'], ['from-photo', 'صور وحوّل', 'fa-images'], ['my-bank', 'قالبي', 'fa-box-archive']]
      .map(([k, l, i], idx) => `<span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${idx === 0 ? 'bg-teal-600 text-white' : 'bg-white border text-slate-500'}"><i class="fas ${i}"></i>${l}</span>`).join('')}
  </div>`;
  const rows = Object.entries(RAFIQ_BOOKLETS).map(([k, b]) => `<button type="button" onclick="rafiqPickBooklet('${k}')" class="${RF_CARD} flex items-center gap-3 p-3 text-right w-full">
      ${rfChip(b.icon, 'teal')}
      <span class="min-w-0 flex-1"><span class="block ${RF_TXT}">${esc(b.ar)}</span><span class="block ${RF_SUB}">${esc(b.fr)}</span></span>
      <i class="fas fa-chevron-left text-[10px] text-slate-300"></i>
    </button>`).join('');
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">منشئ الملازم</h2><p class="text-xs text-slate-500 mb-3">اختر نوع ملزمتك — choisissez le type de livret</p>
  ${tabs}<div class="space-y-2" dir="rtl">${rows}</div>
  <div class="mt-4">${rfWide('fa-microphone-lines', 'أو اعمل الملزمة من فيديو يوتيوب', "Coller le texte d'une vidéo, puis générer", "rafiqGo('studio')", 'rose')}</div>`;
}
function rafiqPickBooklet(key) {
  const b = RAFIQ_BOOKLETS[key];
  if (!b) return;
  RAFIQ.studio = Object.assign(RAFIQ.studio, { step: 1, source: '', title: '', objective: '', kind: b.ai, lang: 'ar', busy: false, booklet: key, text: '', result: null });
  RAFIQ.screen = 'studio';
  render();
}

// ---------- écran : إعداد الامتحانات ----------
function rafiqExams(el) {
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">إعداد الامتحانات</h2><p class="text-xs text-slate-500 mb-4">ورقي أو إلكتروني — papier ou en ligne</p>
  ${rfGrid([
    rfTile('fa-mobile-screen', 'امتحان إلكتروني', 'إدارة الاختبارات في التطبيق', "rafiqGo('eexam')", 'teal'),
    rfTile('fa-file-signature', 'امتحان ورقي', 'أسبوعي · حصة · شهري · مفاجئ', "rafiqGo('paperexams')", 'violet')
  ])}
  ${rfSection('امتحان سريع', 'quiz express', rfGrid([
    rfTile('fa-clipboard-list', 'امتحان حصة', 'على درس واحد', "rafiqExamStart('class')", 'blue'),
    rfTile('fa-calendar-week', 'امتحان أسبوعي', 'على دروس الأسبوع', "rafiqExamStart('week')", 'amber'),
    rfTile('fa-calendar-days', 'امتحان شهري', 'شامل على الشهر', "rafiqExamStart('month')", 'green'),
    rfTile('fa-bolt', 'امتحان مفاجئ', 'كويز في دقيقة', "rafiqExamStart('surprise')", 'rose')
  ]))}
  ${rfSection('من نتائج طلابك', 'remédiation', rfWide('fa-crosshairs', 'ورقة علاج من نتيجة امتحان', 'Analyser les erreurs, proposer des exercices', "rafiqExamStart('custom')", 'teal'))}`;
}

// ---------- écran : إعداد الفيديوهات ----------
function rafiqMedia(el) {
  el.innerHTML = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">إعداد الفيديوهات</h2><p class="text-xs text-slate-500 mb-4">شرح بالفيديو وموشن — vidéos et motions</p>
  ${rfGrid([
    rfTile('fa-video', 'شرح بالشرائح', 'Diapositives → vidéo', "rafiqAi('summary','سكريبت شرح')", 'teal'),
    rfTile('fa-pen-nib', 'فيديو السبورة البيضاء', 'Tableau blanc', "navigate('interactive')", 'slate'),
    rfTile('fa-wand-sparkles', 'موشن احترافي', 'Scénario & storyboard', "rafiqAi('summary','سكريبت موشن')", 'violet'),
    rfTile('fa-diagram-successor', 'حل مسألة خطوة بخطوة', 'Pas à pas', "rafiqAi('summary','حل مسألة خطوة بخطوة')", 'amber'),
    rfTile('fa-bullhorn', 'ملخص الدرس في دقيقة', 'Résumé express', "rafiqAi('summary','ملخص في دقيقة')", 'green'),
    rfTile('fa-clapperboard', 'قصة كرتونية للأطفال', 'Récit animé', "rafiqAi('summary','قصة كرتونية')", 'rose')
  ])}`;
}

// ---------- pont vers l'IA : prépare l'atelier avec l'intention choisie ----------
function rafiqAi(kind, focus) {
  RAFIQ.studio = Object.assign({}, RAFIQ.studio, { screen: 'studio', step: 1, source: '', title: '', objective: focus || '', kind: kind || 'summary', lang: 'ar', busy: false, booklet: null, text: '', result: null, focus: focus || '' });
  RAFIQ.screen = 'studio';
  if (typeof App !== 'undefined' && App.cache) App.cache.aiResult = null;
  render();
}

// ---------- atelier : lecture d'un fichier (txt / md / pdf) ----------
async function rafiqLoadFile(file) {
  if (!file) return;
  const ta = document.getElementById('rf-studio-text');
  const info = document.getElementById('rf-studio-file');
  if (info) info.textContent = 'Lecture…';
  try {
    let text = '';
    if (/\.pdf$/i.test(file.name)) {
      if (!window.pdfjsLib) throw new Error('Lecteur PDF indisponible — collez le texte manuellement.');
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = Math.min(pdf.numPages, 25);
      for (let i = 1; i <= pages; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(it => it.str).join(' ') + '\n\n'; }
    } else text = await file.text();
    if (ta) { ta.value = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 24000); rafiqStudioCount(); }
    if (info) info.innerHTML = `<span class="badge badge-green">${esc(file.name)}</span>`;
  } catch (e) { if (info) info.innerHTML = `<span class="text-red-600 text-xs">${esc(e.message)}</span>`; }
}
function rafiqStudioCount() {
  const ta = document.getElementById('rf-studio-text'); const n = document.getElementById('rf-studio-count');
  if (ta && n) n.textContent = `${ta.value.trim().length} caractère(s) · ${ta.value.split('\n').length} ligne(s)`;
}
function rafiqStudioNext() {
  const ta = document.getElementById('rf-studio-text');
  const title = document.getElementById('rf-studio-title');
  const objective = document.getElementById('rf-studio-objective');
  const kind = document.getElementById('rf-studio-kind');
  const lang = document.getElementById('rf-studio-lang');
  if (ta) RAFIQ.studio.source = ta.value.trim();
  if (title) RAFIQ.studio.title = title.value.trim();
  if (objective) RAFIQ.studio.objective = objective.value.trim();
  if (kind) RAFIQ.studio.kind = kind.value;
  if (lang) RAFIQ.studio.lang = lang.value;
  if (RAFIQ.studio.step === 1) {
    if (RAFIQ.studio.source.length < 80) return toast('Collez au moins 80 caractères du cours (ou chargez un fichier).', 'warning');
    RAFIQ.studio.step = 2;
  } else if (RAFIQ.studio.step === 2) {
    RAFIQ.studio.step = 3;
  }
  render();
}

// ---------- écran : استوديو الدرس (3 étapes) ----------
function rafiqStudio(el) {
  const S = RAFIQ.studio;
  const steps = [['1', 'المصدر', 'Source'], ['2', 'النوع', 'Format'], ['3', 'النتيجة', 'Résultat']];
  const bar = `<div class="flex items-center gap-2 mb-4" dir="rtl">${steps.map(([n, ar, fr], i) => `
    <div class="flex-1 flex items-center gap-2">
      <span class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${S.step >= i + 1 ? 'bg-teal-600 text-white' : 'bg-white border text-slate-400'}">${S.step > i + 1 ? '<i class="fas fa-check"></i>' : n}</span>
      <span class="min-w-0"><span class="block text-[11px] font-bold ${S.step === i + 1 ? 'text-slate-800' : 'text-slate-400'} truncate">${ar}</span><span class="block text-[9px] text-slate-400 truncate">${fr}</span></span>
      ${i < 2 ? '<span class="flex-1 h-px bg-slate-200"></span>' : ''}
    </div>`).join('')}</div>`;
  const head = `${rfBack()}<h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">استوديو الدرس</h2>
    <p class="text-xs text-slate-500 mb-3">${S.focus ? esc(S.focus) + ' — ' : ''}من الدرس إلى دعامة جاهزة</p>${bar}`;

  if (S.step === 1) {
    el.innerHTML = head + `
    <div class="${RF_CARD} p-4">
      <label class="block text-xs font-bold text-slate-600 mb-1" dir="rtl"><i class="fas fa-book-open-reader text-teal-600 mr-1"></i>الدرس منين؟ <span class="font-normal text-slate-400">— d'où vient la leçon ?</span></label>
      <div class="grid grid-cols-3 gap-2 mb-3">
        <button type="button" onclick="navigate('curriculum')" class="rounded-xl border p-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"><i class="fas fa-book block mb-1 text-teal-600 text-base"></i>من منهجي</button>
        <label class="rounded-xl border p-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer text-center"><i class="fas fa-file-pdf block mb-1 text-rose-600 text-base"></i>PDF / Word<input type="file" accept=".pdf,.txt,.md" class="hidden" onchange="rafiqLoadFile(this.files[0])"></label>
        <label class="rounded-xl border p-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 cursor-pointer text-center"><i class="fas fa-image block mb-1 text-blue-600 text-base"></i>صور الدرس<input type="file" accept="image/*" class="hidden" onchange="toast('Décrivez le contenu de l image dans le texte ci-dessous.','info')"></label>
      </div>
      <div class="mb-2" id="rf-studio-file"></div>
      <textarea id="rf-studio-text" rows="10" class="w-full border rounded-xl p-3 text-sm leading-relaxed" dir="rtl" placeholder="أو الصق نصّ الدرس هنا…" oninput="rafiqStudioCount()">${esc(S.source || '')}</textarea>
      <div class="flex items-center justify-between mt-1">
        <span id="rf-studio-count" class="text-[11px] text-slate-400">0 caractère(s)</span>
        <span class="text-[11px] text-slate-400"><i class="fas fa-shield-halved mr-1"></i>Envoyé au serveur de l'école uniquement</span>
      </div>
      <input id="rf-studio-title" class="w-full border rounded-xl px-3 py-2 text-sm mt-3" dir="rtl" placeholder="عنوان الدرس (اختياري)" value="${esc(S.title || '')}">
      <input id="rf-studio-objective" class="w-full border rounded-xl px-3 py-2 text-sm mt-2" dir="rtl" placeholder="تركيز خاص (اختياري) — ex : «ركّز على المقارنة»" value="${esc(S.objective || '')}">
    </div>
    <div class="flex justify-end mt-3"><button type="button" onclick="rafiqStudioNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button></div>`;
    rafiqStudioCount();
    return;
  }

  if (S.step === 2) {
    const kinds = Object.entries(RAFIQ_BOOKLETS);
    el.innerHTML = head + `
    <div class="${RF_CARD} p-4">
      <label class="block text-xs font-bold text-slate-600 mb-2" dir="rtl">عايز تعمل إيه؟ <span class="font-normal text-slate-400">— choisissez le format</span></label>
      <div class="space-y-2 mb-3" dir="rtl">
        ${kinds.map(([k, b]) => `<label class="flex items-center gap-3 border rounded-xl p-2.5 cursor-pointer hover:bg-slate-50 ${S.booklet === k ? 'border-teal-500 ring-1 ring-teal-200' : ''}">
          <input type="radio" name="rf-kind" value="${k}" class="mt-0.5" ${S.booklet === k ? 'checked' : ''} onchange="RAFIQ.studio.booklet='${k}'; RAFIQ.studio.kind='${b.ai}'">
          <span class="min-w-0"><span class="block text-sm font-bold text-slate-800">${esc(b.ar)}</span><span class="block text-[11px] text-slate-500">${esc(b.fr)}</span></span>
        </label>`).join('')}
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Langue</label>
          <select id="rf-studio-lang" class="w-full border rounded-xl px-3 py-2 text-sm"><option value="ar" ${S.lang === 'ar' ? 'selected' : ''}>العربية</option><option value="fr" ${S.lang === 'fr' ? 'selected' : ''}>Français</option></select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Moteur</label>
          <select id="rf-studio-kind" class="w-full border rounded-xl px-3 py-2 text-sm">
            ${Object.entries({ summary: 'Fiche / résumé', quiz: 'Questions (QCM)', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous' }).map(([k, l]) => `<option value="${k}" ${S.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <p class="text-[11px] text-slate-500 mt-3 bg-teal-50 rounded-lg p-2" dir="rtl"><i class="fas fa-circle-info mr-1 text-teal-600"></i>توليد بالذكاء الاصطناعي من نصّ درسك فقط — aucun fait inventé hors du texte.</p>
    </div>
    <div class="flex justify-between mt-3"><button type="button" onclick="RAFIQ.studio.step=1; render()" class="${btnSecondary}">السابق</button><button type="button" onclick="rafiqStudioNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button></div>`;
    return;
  }

  // étape 3 — génération / résultat
  const r = S.result;
  el.innerHTML = head + `
  <div class="${RF_CARD} p-4 mb-3">
    <div class="flex items-center gap-2 text-xs text-slate-500 mb-2" dir="rtl"><i class="fas fa-file-lines text-teal-600"></i>
      <span class="truncate">${esc(S.title || 'درس')}</span><span class="badge badge-slate">${S.source.length} car.</span>
      ${S.booklet ? `<span class="badge badge-teal">${esc(RAFIQ_BOOKLETS[S.booklet]?.ar || '')}</span>` : ''}</div>
    <div class="flex flex-wrap gap-2">
      <button type="button" id="rf-gen" onclick="rafiqGenerate()" class="${btnPrimary}" ${S.busy ? 'disabled' : ''}><i class="fas ${S.busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1"></i> ${r ? 'توليد جديد' : 'توليد الملزمة'}</button>
      <button type="button" onclick="RAFIQ.studio.step=2; render()" class="${btnSecondary}"><i class="fas fa-sliders mr-1"></i> Changer le format</button>
    </div>
  </div>
  <div id="rf-studio-result">${r ? rafiqResultHtml(r) : `<div class="text-center text-slate-400 py-10 text-sm"><i class="fas fa-wand-magic-sparkles text-3xl block mb-2 opacity-40"></i>اضغط « توليد الملزمة »</div>`}</div>`;
}

function rafiqResultHtml(r) {
  let body = '';
  try { body = typeof aiPreview === 'function' ? aiPreview(r) : `<pre class="text-xs whitespace-pre-wrap">${esc(JSON.stringify(r.data, null, 2))}</pre>`; } catch { body = ''; }
  return `${body}
  <div class="flex flex-wrap gap-2 mt-3">
    <button type="button" onclick="rafiqPrint()" class="${btnPrimary} text-sm"><i class="fas fa-print mr-1"></i> طباعة / PDF</button>
    ${r.kind === 'summary' ? `<button type="button" onclick="aiSaveSummaryAsCourse()" class="${btnSecondary} text-sm"><i class="fas fa-book mr-1"></i> حفظ في Cours & Documents</button>` : `<button type="button" onclick="rafiqSaveQuizAsEvaluation()" class="${btnSecondary} text-sm"><i class="fas fa-file-signature mr-1"></i> حفظ كتقييم</button>`}
    <button type="button" onclick="rafiqGenerate()" class="${btnSecondary} text-sm"><i class="fas fa-rotate mr-1"></i> Régénérer</button>
    <span class="text-[11px] text-slate-400 self-center ml-auto">${esc(String(r.used || 0))}/${esc(String(r.limit || 0))} aujourd'hui</span>
  </div>`;
}

async function rafiqGenerate() {
  const S = RAFIQ.studio;
  if (S.source.trim().length < 80) return toast('Texte source trop court (80 caractères minimum).', 'warning');
  S.busy = true; render();
  const out = document.getElementById('rf-studio-result');
  if (out) out.innerHTML = `<div class="text-sm text-teal-800 bg-teal-50 rounded-xl p-4"><i class="fas fa-spinner fa-spin mr-2"></i>Génération en cours (10 à 40 secondes)…</div>`;
  try {
    const focus = RAFIQ_BOOKLETS[S.booklet]?.ask || '';
    const payload = {
      kind: S.kind || 'summary',
      count: 10,
      difficulty: 'moyen',
      lang: S.lang || 'ar',
      level: '',
      subject: [focus, S.objective, S.title].filter(Boolean).join(' · ').slice(0, 200),
      text: S.source.slice(0, 24000)
    };
    const r = (await api.post('/ai/generate', payload, { timeout: 90000 })).data;
    S.result = r; S.busy = false;
    if (typeof App !== 'undefined' && App.cache) App.cache.aiResult = r;
    render();
  } catch (e) {
    S.busy = false; render();
    const box = document.getElementById('rf-studio-result');
    if (box) box.innerHTML = `<div class="text-sm text-red-700 bg-red-50 rounded-xl p-4"><i class="fas fa-circle-xmark mr-1"></i>${esc(e.response?.data?.error || e.message)}</div>`;
  }
}

function rafiqPrint() {
  const r = RAFIQ.studio.result; if (!r) return;
  try {
    if (r.kind === 'summary' && typeof aiPrintSummary === 'function') { App.cache.aiResult = r; return aiPrintSummary(); }
  } catch {}
  const w = window.open('', '_blank');
  if (!w) return toast('Autorisez les fenêtres surgissantes pour imprimer.', 'warning');
  const d = r.data || {};
  const lines = [];
  if (d.title) lines.push(`<h1>${esc(d.title)}</h1>`);
  if (d.questions) lines.push('<ol>' + d.questions.map(q => `<li>${esc(q.question)}<ul>${(q.options || []).map((o, i) => `<li>${i === q.correct ? '✔ ' : ''}${esc(o)}</li>`).join('')}</ul></li>`).join('') + '</ol>');
  if (d.cards) lines.push('<table>' + d.cards.map(c => `<tr><td><b>${esc(c.front)}</b></td><td>${esc(c.back)}</td></tr>`).join('') + '</table>');
  if (d.text) lines.push(`<p>${esc(d.text)}</p>`);
  if (d.summary) lines.push(`<p style="white-space:pre-line">${esc(d.summary)}</p>`);
  w.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(d.title || 'ملزمة')}</title>
    <style>@page{size:A4;margin:16mm}body{font-family:'Noto Kufi Arabic',Georgia,serif;color:#111;line-height:1.6}h1{color:#0f766e;border-bottom:2px solid #14b8a6;font-size:21px}header{display:flex;gap:10px;align-items:center;margin-bottom:8px}header img{width:48px;height:48px;object-fit:contain}ul{margin-inline-start:18px}footer{position:fixed;bottom:6mm;left:0;right:0;text-align:center;font-size:10px;color:#888}</style></head>
    <body><header><img src="${brandLogoAbs()}"><div><b>${esc(brandName())}</b><div style="font-size:11px;color:#555">${esc(RAFIQ_BOOKLETS[RAFIQ.studio.booklet]?.ar || 'ملزمة')} · ${typeof dayjs === 'function' ? dayjs().format('DD/MM/YYYY') : ''}</div></div></header>
    ${lines.join('\n')}<footer>${esc(brandName())} — support généré avec l'aide de l'IA, relu par l'enseignant</footer><script>setTimeout(()=>window.print(),400)<\/script></body></html>`);
  w.document.close();
}

async function rafiqSaveQuizAsEvaluation() {
  const r = RAFIQ.studio.result; if (!r) return;
  const d = r.data || {};
  try {
    const items = (d.questions || []).map(q => ({ question: q.question, options: q.options || [], correct: q.correct ?? 0, points: 1 }));
    const row = {
      title: d.title || 'امتحان', course_type: 'quiz', level: '', cycle: 'primaire',
      description: 'Créé depuis رفيق المعلم · استوديو الدرس',
      questions: items, content: { source: 'rafiq', lang: RAFIQ.studio.lang || 'ar' }
    };
    const ex = RAFIQ.exam;
    if (ex && ex.title) row.title = ex.title;
    await api.post('/db/interactive_courses', row, { headers: { 'X-Skip-Notify': '1' } });
    toast('Cours interactif créé — retrouvez-le dans Cours interactifs ✅');
  } catch (e) { toast(e.response?.data?.error || 'Erreur d\'enregistrement', 'error'); }
}

// ---------- routeur interne du module ----------
function rafiqRouter(el) {
  switch (RAFIQ.screen) {
    case 'prep': return rafiqPrep(el);
    case 'fix': return rafiqFix(el);
    case 'tools': return rafiqTools(el);
    case 'interactive': return rafiqInteractive(el);
    case 'games': return rafiqGames(el);
    case 'booklets': return rafiqBooklets(el);
    case 'exams': return rafiqExams(el);
    case 'media': return rafiqMedia(el);
    case 'recorder': return rafiqRecorder(el);
    case 'studio': return rafiqStudio(el);
    /* ---- F68 : écrans du catalogue رفيق المعلم ---- */
    case 'types': return rafiqTypes(el);
    case 'wizard': return rfWizard(el);
    case 'settings': return rafiqSettings(el);
    case 'account': return rafiqAccount(el);
    case 'community': return rafiqCommunity(el);
    case 'myplatform': return rafiqMyPlatform(el);
    case 'paperexams': return rafiqPaperExams(el);
    case 'eexam': return rafiqEExam(el);
    case 'examwiz': return rafiqExamWizard(el);
    case 'motion': return rafiqMotion(el);
    case 'ocr': return rafiqOcr(el);
    case 'autoformat': return rafiqAutoFormatView(el);
    default: return rafiqHome(el);
  }
}

// ---------- entrée VIEWS (clé = route « rafiq ») ----------
VIEWS.rafiq = async function (el) {
  el.innerHTML = pageHeader('رفيق المعلم', 'fa-user-tie', `
    <button type="button" onclick="typeof openPalettePicker==='function' ? openPalettePicker() : null" class="${btnSecondary} text-sm"><i class="fas fa-palette mr-1"></i> Palettes</button>
    <button type="button" onclick="RAFIQ.screen='studio'; render()" class="${btnPrimary} text-sm"><i class="fas fa-wand-magic-sparkles mr-1"></i> استوديو الدرس</button>`) +
    `<div id="rf-page"></div>`;
  return rafiqRouter(document.getElementById('rf-page'));
};

// Ouvre directement l'atelier (bouton « + » de la barre du haut sur la page رفيق المعلم)
function rafiqOpenStudio() {
  RAFIQ.screen = 'studio';
  RAFIQ.studio.step = 1;
  RAFIQ.studio.result = null;
  if (typeof App !== 'undefined' && App.cache) App.cache.aiResult = null;
  if (typeof App !== 'undefined' && App.route !== 'rafiq') return navigate('rafiq');
  render();
}
