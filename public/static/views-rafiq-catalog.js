/* ============================================================
   Rahma Academy — views-rafiq-catalog.js
   F68 — رفيق المعلم, 2ᵉ partie : catalogue complet des supports,
   assistant générique (n étapes), réglages, compte, منصتي, المجتمع,
   examens électroniques / papier, شرح وموشن, صور وحوّل, نسق تلقائي.
   Réutilise les helpers de views-rafiq-teacher.js (rfTile, RF_CARD…)
   et la génération IA existante (RAFIQ.studio + rafiqGenerate).
   ============================================================ */

// ---------- catalogue des types de supports ----------
// steps : nombre d'étapes affichées ; kind : moteur IA ; ask : intention envoyée à l'IA
const RAFIQ_CATS = {
  basic:    { ar: 'الأساسي',        fr: 'Essentiels',            icon: 'fa-layer-group',      tone: 'teal' },
  before:   { ar: 'قبل الحصة',      fr: 'Avant la séance',       icon: 'fa-clock',            tone: 'blue' },
  during:   { ar: 'جوّه الحصة',     fr: 'Pendant la séance',     icon: 'fa-users',            tone: 'violet' },
  after:    { ar: 'بعد الحصة',      fr: 'Après la séance',       icon: 'fa-note-sticky',      tone: 'amber' },
  revision: { ar: 'مراجعة وامتحانات', fr: 'Révision & examens',  icon: 'fa-trophy',           tone: 'green' },
  science:  { ar: 'علوم ورياضيات',  fr: 'Sciences & maths',      icon: 'fa-flask',            tone: 'rose' },
  lang:     { ar: 'لغات',           fr: 'Langues',               icon: 'fa-language',         tone: 'blue' },
  admin:    { ar: 'للأهل والإدارة', fr: 'Familles & direction',  icon: 'fa-user-group',       tone: 'slate' },
  motion:   { ar: 'شرح وموشن',      fr: 'Vidéo & motion',        icon: 'fa-circle-play',      tone: 'violet' }
};

const RAFIQ_TYPES = {
  // ---- الأساسي
  full:      { cat: 'basic', ar: 'درس كامل',            fr: 'Leçon complète',            icon: 'fa-book-open-reader', steps: 2, kind: 'summary', ask: 'درس كامل: نص الدرس + المصطلحات + أسئلة مع إجاباتها وأشهر الأخطاء الشائعة.' },
  exit:      { cat: 'basic', ar: 'بطاقة خروج',          fr: 'Ticket de sortie',          icon: 'fa-door-open',        steps: 2, kind: 'quiz',    ask: 'بطاقة خروج وتدريب نهاية الحصة: 3 أسئلة قصيرة تقيس فهم الدرس.' },
  hw3:       { cat: 'basic', ar: 'واجب بـ3 مستويات',    fr: 'Devoir 3 niveaux',          icon: 'fa-layer-group',      steps: 2, kind: 'quiz',    ask: 'واجب بثلاثة مستويات: دعم إضافي، متوسط، متفوق.' },
  organizer: { cat: 'basic', ar: 'منظّم بياني',         fr: 'Organisateur graphique',    icon: 'fa-sitemap',          steps: 2, kind: 'summary', ask: 'منظّم بياني: مقارنة أو سبب ونتيجة أو خط زمني أو دورة.' },
  anytext:   { cat: 'basic', ar: 'كيف أي نص',           fr: 'Traiter n\u2019importe quel texte', icon: 'fa-magnifying-glass', steps: 2, kind: 'summary', ask: 'حلّل النص: اسأل أو أعمق أو اقرأ نسخة مبسّطة بلغة أخرى.' },
  // ---- قبل الحصة
  scenario:  { cat: 'before', ar: 'سيناريو حصة',        fr: 'Scénario de séance',        icon: 'fa-clock',            steps: 2, kind: 'summary', ask: 'سيناريو حصة بالدقيقة: تمهيد، شرح، نشاط، تقويم.' },
  weekplan:  { cat: 'before', ar: 'خطة أسبوع',          fr: 'Plan de la semaine',        icon: 'fa-calendar-week',    steps: 2, kind: 'summary', ask: 'خطة أسبوع: جدول بالهدف والنشاط والواجب لكل حصة.' },
  // ---- جوّه الحصة
  classq:    { cat: 'during', ar: 'أسئلة للفصل',        fr: 'Questions pour la classe',  icon: 'fa-comments',         steps: 2, kind: 'quiz',    ask: 'أسئلة شفهية للفصل مع إجابات نموذجية للمدرس.' },
  stations:  { cat: 'during', ar: 'محطات تعلّم',        fr: 'Ateliers rotatifs',         icon: 'fa-map-location-dot', steps: 2, kind: 'summary', ask: 'محطات تعلّم للمجموعات: مهمة لكل محطة ومدة ومواد.' },
  group:     { cat: 'during', ar: 'نشاط جماعي',         fr: 'Activité de groupe',        icon: 'fa-users',            steps: 2, kind: 'summary', ask: 'نشاط جماعي: مهمة وأدوار وخطوات وتقويم.' },
  board9:    { cat: 'during', ar: 'لوحة 9 اختيارات',    fr: 'Tableau à 9 choix',         icon: 'fa-table-cells-large', steps: 2, kind: 'quiz',   ask: 'لوحة تسعة اختيارات: الطالب يختار 3 أنشطة من 9.' },
  // ---- بعد الحصة
  taskcards: { cat: 'after', ar: 'بطاقات مهام',         fr: 'Cartes de tâches',          icon: 'fa-note-sticky',      steps: 2, kind: 'quiz',    ask: 'بطاقات مهام تُقصّ، مع نموذج إجابة.' },
  // ---- مراجعة وامتحانات
  classquiz: { cat: 'revision', ar: 'مسابقة الفصل',     fr: 'Concours de classe',        icon: 'fa-trophy',           steps: 2, kind: 'quiz',    ask: 'مسابقة فصل: جولات أسئلة للفرق مع إجابات ونقاط.' },
  rubric:    { cat: 'revision', ar: 'تعبير بمعيار تصحيح', fr: 'Grille d\u2019évaluation', icon: 'fa-clipboard-check',  steps: 2, kind: 'summary', ask: 'موضوع تعبير مع سلّم تنقيط: عناصر ونقاط لكل معيار.' },
  // ---- علوم ورياضيات
  experiment:{ cat: 'science', ar: 'تجربة عملية',       fr: 'Expérience pratique',       icon: 'fa-flask',            steps: 2, kind: 'summary', ask: 'تجربة عملية: فرضية وأدوات وخطوات وملاحظات واستنتاج.' },
  graded:    { cat: 'science', ar: 'تمارين متدرجة',     fr: 'Exercices progressifs',     icon: 'fa-arrow-trend-up',   steps: 2, kind: 'quiz',    ask: 'تمارين متدرجة على 3 مستويات من السهل للصعب مع الحلول.' },
  reallife:  { cat: 'science', ar: 'مسائل من الحياة',   fr: 'Problèmes de la vie',       icon: 'fa-globe',            steps: 2, kind: 'quiz',    ask: 'مسائل من الحياة اليومية: مواقف حقيقية وحسابات.' },
  project:   { cat: 'science', ar: 'مشروع',             fr: 'Projet',                    icon: 'fa-screwdriver-wrench', steps: 2, kind: 'summary', ask: 'مشروع: فكرة ومطلوب وخطوات ومعيار تقييم.' },
  // ---- لغات
  reading:   { cat: 'lang', ar: 'قطعة قراءة',           fr: 'Texte de lecture',          icon: 'fa-book-open',        steps: 2, kind: 'summary', ask: 'قطعة قراءة بمستوى الصف ومفردات وأسئلة فهم.' },
  grammar:   { cat: 'lang', ar: 'قواعد بأمثلة',         fr: 'Grammaire par l\u2019exemple', icon: 'fa-spell-check',   steps: 2, kind: 'summary', ask: 'قاعدة بأمثلة: القاعدة وأمثلة وتدريب قصير.' },
  dictation: { cat: 'lang', ar: 'إملاء وتصحيح',         fr: 'Dictée & correction',       icon: 'fa-pen-nib',          steps: 2, kind: 'fillblank', ask: 'قطعة إملاء وطريقة اكتشاف الخطأ وتصحيحه.' },
  // ---- للأهل والإدارة
  parentsum: { cat: 'admin', ar: 'ملخص لولي الأمر',     fr: 'Note aux parents',          icon: 'fa-paper-plane',      steps: 2, kind: 'summary', ask: 'ملخص قصير لولي الأمر: ما تعلّمناه اليوم وكيف يساعد في البيت.' },
  subplan:   { cat: 'admin', ar: 'خطة للمدرس البديل',   fr: 'Plan de suppléance',        icon: 'fa-user-clock',       steps: 2, kind: 'summary', ask: 'خطة جاهزة لمدرّس بديل: الحصة والخطوات والواجب.' },
  // ---- شرح وموشن
  story:     { cat: 'motion', ar: 'حكاية بالشخصيات',    fr: 'Récit à personnages',       icon: 'fa-masks-theater',    steps: 2, kind: 'summary', ask: 'حكاية بالشخصيات: شخصيات ومشهد وحوار قصير يشرح الدرس.' },
  dialogue:  { cat: 'motion', ar: 'حوار الشخصيات',      fr: 'Dialogue',                  icon: 'fa-comments',         steps: 2, kind: 'summary', ask: 'حوار بين شخصيتين يبسّط المفهوم ويصحّح الخطأ الشائع.' },
  slides:    { cat: 'motion', ar: 'شرح بالشرائح',       fr: 'Support en diapositives',   icon: 'fa-images',           steps: 2, kind: 'summary', ask: 'شرح بالشرائح: عنوان وثلاث نقاط لكل شريحة، 8 شرائح.' },
  whiteboard:{ cat: 'motion', ar: 'فيديو السبورة البيضاء', fr: 'Tableau blanc animé',    icon: 'fa-pen-nib',          steps: 2, kind: 'summary', ask: 'سكريبت فيديو سبورة بيضاء: ما يُرسم ومتى، مع التعليق الصوتي.' },
  timeline:  { cat: 'motion', ar: 'الخط الزمني',        fr: 'Frise chronologique',       icon: 'fa-timeline',         steps: 2, kind: 'summary', ask: 'خط زمني: تواريخ وأحداث وعلاقة السبب بالنتيجة.' },
  stepsolve: { cat: 'motion', ar: 'حل مسألة خطوة بخطوة', fr: 'Résolution pas à pas',     icon: 'fa-shoe-prints',      steps: 2, kind: 'summary', ask: 'حل مسألة خطوة بخطوة: كل خطوة وما يُكتب على السبورة.' },
  onemin:    { cat: 'motion', ar: 'ملخص الدرس في دقيقة', fr: 'Résumé en 1 minute',       icon: 'fa-bolt',             steps: 2, kind: 'summary', ask: 'ملخص مدته دقيقة: الفكرة الأساسية و3 نقاط لا تُنسى.' },
  qvideo:    { cat: 'motion', ar: 'فيديو أسئلة للمراجعة', fr: 'Vidéo de révision',       icon: 'fa-circle-play',      steps: 2, kind: 'quiz',    ask: 'سكريبت فيديو مراجعة: أسئلة متتابعة وإجاباتها.' },
  eteacher:  { cat: 'motion', ar: 'المعلم الإلكتروني',  fr: 'Professeur virtuel',        icon: 'fa-chalkboard-user',  steps: 2, kind: 'summary', ask: 'سكريبت معلم إلكتروني يشرح الدرس بالصوت والصورة.' },
  cartoon:   { cat: 'motion', ar: 'قصة كرتونية',        fr: 'Dessin animé',              icon: 'fa-child-reaching',   steps: 2, kind: 'summary', ask: 'قصة كرتونية للأطفال: مشهد وشخصيات وحوار قصير جداً.' }
};

// fusionne les livrets de l'atelier dans le catalogue (même moteur)
function rafiqAllTypes() {
  const out = Object.assign({}, RAFIQ_TYPES);
  try {
    Object.entries(RAFIQ_BOOKLETS || {}).forEach(([k, b]) => {
      out['bk_' + k] = { cat: 'basic', ar: b.ar, fr: b.fr, icon: b.icon, steps: 2, kind: b.ai, ask: b.ask, booklet: k };
    });
  } catch (e) { /* catalogue livrets indisponible */ }
  return out;
}
function rafiqType(key) { return rafiqAllTypes()[key] || null; }

// ---------- écran : كل الأنواع (catalogue avec recherche) ----------
function rafiqTypes(el) {
  const q = (RAFIQ.typeQuery || '').trim().toLowerCase();
  const all = rafiqAllTypes();
  const groups = {};
  for (const [k, t] of Object.entries(all)) {
    if (q && !(t.ar + ' ' + t.fr).toLowerCase().includes(q)) continue;
    (groups[t.cat] = groups[t.cat] || []).push([k, t]);
  }
  const total = Object.keys(all).length;
  const body = Object.keys(RAFIQ_CATS).filter(c => groups[c]).map(c => {
    const cat = RAFIQ_CATS[c];
    return rfSection(cat.ar, cat.fr, rfGrid(groups[c].map(([k, t]) => rfTile(t.icon, t.ar, t.fr, `rafiqTypeStart('${k}')`, cat.tone)), 3));
  }).join('');
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">كل الأنواع</h2>
  <p class="text-xs text-slate-500 mb-3">${total} نوع من الدعامات — ${total} types de supports, générés depuis votre leçon</p>
  <div class="relative mb-4">
    <input id="rf-type-q" class="w-full border rounded-xl pl-3 pr-9 py-2.5 text-sm" dir="rtl" placeholder="دوز: امتحان، نشاط، مسابقة، قراءة…" value="${esc(RAFIQ.typeQuery || '')}"
      oninput="RAFIQ.typeQuery=this.value; rafiqTypesRefresh()">
    <i class="fas fa-magnifying-glass absolute top-1/2 -translate-y-1/2 left-3 text-slate-400 text-sm"></i>
  </div>
  <div id="rf-types-body">${body || `<div class="text-center text-slate-400 text-sm py-8"><i class="fas fa-face-frown text-2xl block mb-2 opacity-40"></i>لا نتيجة — aucune correspondance</div>`}</div>`;
}
function rafiqTypesRefresh() {
  const box = document.getElementById('rf-types-body');
  if (!box) return;
  const q = (RAFIQ.typeQuery || '').trim().toLowerCase();
  const groups = {};
  for (const [k, t] of Object.entries(rafiqAllTypes())) {
    if (q && !(t.ar + ' ' + t.fr).toLowerCase().includes(q)) continue;
    (groups[t.cat] = groups[t.cat] || []).push([k, t]);
  }
  box.innerHTML = Object.keys(RAFIQ_CATS).filter(c => groups[c]).map(c => {
    const cat = RAFIQ_CATS[c];
    return rfSection(cat.ar, cat.fr, rfGrid(groups[c].map(([k, t]) => rfTile(t.icon, t.ar, t.fr, `rafiqTypeStart('${k}')`, cat.tone)), 3));
  }).join('') || `<div class="text-center text-slate-400 text-sm py-8"><i class="fas fa-face-frown text-2xl block mb-2 opacity-40"></i>لا نتيجة</div>`;
}

// ---------- assistant générique (source → options → résultat) ----------
function rafiqTypeStart(key) {
  const t = rafiqType(key);
  if (!t) return;
  RAFIQ.type = key;
  if (t.booklet) RAFIQ.studio.booklet = t.booklet;
  RAFIQ.studio = Object.assign(RAFIQ.studio, {
    step: 1, source: RAFIQ.studio.source || '', title: RAFIQ.studio.title || '',
    objective: RAFIQ.studio.objective || '', kind: t.kind || 'summary', lang: RAFIQ.studio.lang || 'ar',
    busy: false, result: null
  });
  RAFIQ.screen = 'wizard';
  if (typeof App !== 'undefined' && App.cache) App.cache.aiResult = null;
  render();
}

function rfWizardStepsBar(step, total, labels) {
  return `<div class="flex items-center gap-2 mb-4" dir="rtl">${labels.map(([ar, fr], i) => `
    <div class="flex-1 flex items-center gap-2">
      <span class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black ${step >= i + 1 ? 'bg-teal-600 text-white' : 'bg-white border text-slate-400'}">${step > i + 1 ? '<i class="fas fa-check"></i>' : (i + 1)}</span>
      <span class="min-w-0"><span class="block text-[11px] font-bold ${step === i + 1 ? 'text-slate-800' : 'text-slate-400'} truncate">${esc(ar)}</span><span class="block text-[9px] text-slate-400 truncate">${esc(fr)}</span></span>
      ${i < labels.length - 1 ? '<span class="flex-1 h-px bg-slate-200"></span>' : ''}
    </div>`).join('')}</div>`;
}

// bloc « الدرس منين؟ » réutilisé par tous les assistants
function rfSourceBlock(compact) {
  const S = RAFIQ.studio;
  const src = (icon, label, sub, action, tone) => `<button type="button" onclick="${esc(action)}" class="rounded-2xl border bg-white hover:bg-slate-50 p-3 text-center">
    <i class="fas ${icon} block mb-1.5 text-base text-${tone}-600"></i>
    <span class="block text-[11px] font-bold text-slate-700">${esc(label)}</span>
    ${sub ? `<span class="block text-[10px] text-slate-400">${esc(sub)}</span>` : ''}</button>`;
  return `<div class="${RF_CARD} p-4">
    <div class="flex items-center gap-2 mb-2" dir="rtl"><i class="fas fa-book-open-reader text-teal-600"></i><span class="text-sm font-bold text-slate-800">الدرس منين؟</span><span class="text-[11px] text-slate-400">— d'où vient la leçon ?</span></div>
    <div class="grid grid-cols-3 gap-2 mb-3">
      ${src('fa-book', 'من منهجي', 'Programme', "navigate('curriculum')", 'teal')}
      ${src('fa-file-pdf', 'ملف PDF أو وورد', 'Fichier', compact ? '' : '', 'rose')}
      ${src('fa-image', 'صور الدرس', 'Photos', "toast('Décrivez le contenu dans le texte ci-dessous.','info')", 'blue')}
    </div>
    <div id="rf-studio-file" class="mb-2"></div>
    <textarea id="rf-studio-text" rows="${compact ? 6 : 9}" class="w-full border rounded-xl p-3 text-sm leading-relaxed" dir="rtl"
      placeholder="أو الصق نص الدرس هنا…" oninput="rafiqStudioCount()">${esc(S.source || '')}</textarea>
    <div class="flex items-center justify-between mt-1 mb-2">
      <span id="rf-studio-count" class="text-[11px] text-slate-400">0 caractère(s)</span>
      <label class="${btnSecondary} text-[11px] cursor-pointer"><i class="fas fa-file-arrow-up mr-1"></i> Charger PDF / TXT<input type="file" accept=".pdf,.txt,.md" class="hidden" onchange="rafiqLoadFile(this.files[0])"></label>
    </div>
    <input id="rf-studio-title" class="w-full border rounded-xl px-3 py-2 text-sm" dir="rtl" placeholder="عنوان الدرس (اختياري)" value="${esc(S.title || '')}">
    <input id="rf-studio-objective" class="w-full border rounded-xl px-3 py-2 text-sm mt-2" dir="rtl" placeholder="تركيز خاص (اختياري) — ex : «ركّز على المقارنة»" value="${esc(S.objective || '')}">
    <p class="text-[11px] text-slate-400 mt-2"><i class="fas fa-shield-halved mr-1"></i>Le texte part uniquement vers le serveur de l'école.</p>
  </div>`;
}

function rfWizard(el) {
  const t = rafiqType(RAFIQ.type) || { ar: 'دعامة', fr: 'Support', icon: 'fa-file-lines', kind: 'summary' };
  const S = RAFIQ.studio;
  const labels = [['الدرس', 'Source'], ['البيانات', 'Réglage'], ['النتيجة', 'Résultat']];
  const head = `${rfBack('كل الأنواع')}
  <div class="flex items-center gap-3 mb-1">${rfChip(t.icon, 'teal')}<div class="min-w-0"><h2 class="text-lg font-black text-slate-800 truncate" dir="rtl">${esc(t.ar)}</h2><p class="text-[11px] text-slate-500 truncate">${esc(t.fr)}</p></div></div>
  ${rfWizardStepsBar(S.step, 3, labels)}`;

  if (S.step === 1) {
    el.innerHTML = head + rfSourceBlock() + `
      <div class="flex justify-between items-center mt-3">
        <button type="button" onclick="rafiqGo('types')" class="${btnSecondary}">كل الأنواع</button>
        <button type="button" onclick="rafiqWizardNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button>
      </div>`;
    rafiqStudioCount();
    return;
  }

  if (S.step === 2) {
    const engines = { summary: 'ملزمة / شرح', quiz: 'أسئلة (QCM)', flashcards: 'كروت / فلاش كاردز', fillblank: 'نص فيه فراغات' };
    el.innerHTML = head + `
    <div class="${RF_CARD} p-4">
      <div class="grid grid-cols-2 gap-2 mb-3">
        <div><label class="block text-xs font-bold text-slate-600 mb-1" dir="rtl">اللغة</label>
          <select id="rf-studio-lang" class="w-full border rounded-xl px-3 py-2 text-sm">
            <option value="ar" ${S.lang === 'ar' ? 'selected' : ''}>العربية</option>
            <option value="fr" ${S.lang === 'fr' ? 'selected' : ''}>Français</option>
          </select></div>
        <div><label class="block text-xs font-bold text-slate-600 mb-1">Format</label>
          <select id="rf-studio-kind" class="w-full border rounded-xl px-3 py-2 text-sm">
            ${Object.entries(engines).map(([k, l]) => `<option value="${k}" ${S.kind === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>
      <p class="text-[11px] text-slate-500 bg-teal-50 rounded-lg p-2" dir="rtl"><i class="fas fa-circle-info mr-1 text-teal-600"></i>${esc(t.ask || '')}</p>
      <p class="text-[11px] text-slate-400 mt-2" dir="rtl">${S.source.trim().length} حرف من نصّ الدرس.</p>
    </div>
    <div class="flex justify-between mt-3">
      <button type="button" onclick="RAFIQ.studio.step=1; render()" class="${btnSecondary}">السابق</button>
      <button type="button" onclick="rafiqWizardNext()" class="${btnPrimary}"><i class="fas fa-wand-magic-sparkles mr-1"></i> توليد</button>
    </div>`;
    return;
  }

  const r = S.result;
  el.innerHTML = head + `
  <div class="${RF_CARD} p-4 mb-3">
    <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2" dir="rtl">
      <i class="fas ${t.icon} text-teal-600"></i><span class="truncate">${esc(S.title || t.ar)}</span>
      <span class="badge badge-gray">${S.source.length} car.</span>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" onclick="rafiqGenerate()" class="${btnPrimary}" ${S.busy ? 'disabled' : ''}><i class="fas ${S.busy ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1"></i> ${r ? 'توليد جديد' : 'توليد'}</button>
      <button type="button" onclick="RAFIQ.studio.step=2; render()" class="${btnSecondary}"><i class="fas fa-sliders mr-1"></i> Réglages</button>
      <button type="button" onclick="rafiqPrint()" class="${btnSecondary}"><i class="fas fa-print mr-1"></i> PDF</button>
    </div>
  </div>
  <div id="rf-studio-result">${r ? rafiqResultHtml(r) : `<div class="text-center text-slate-400 py-10 text-sm"><i class="fas fa-wand-magic-sparkles text-3xl block mb-2 opacity-40"></i>اضغط « توليد »</div>`}</div>`;
}

function rafiqWizardNext() {
  const ta = document.getElementById('rf-studio-text');
  if (ta) RAFIQ.studio.source = ta.value.trim();
  const ttl = document.getElementById('rf-studio-title'); if (ttl) RAFIQ.studio.title = ttl.value.trim();
  const obj = document.getElementById('rf-studio-objective'); if (obj) RAFIQ.studio.objective = obj.value.trim();
  const kind = document.getElementById('rf-studio-kind'); if (kind) RAFIQ.studio.kind = kind.value;
  const lang = document.getElementById('rf-studio-lang'); if (lang) RAFIQ.studio.lang = lang.value;
  const S = RAFIQ.studio;
  if (S.step === 1) {
    if (S.source.trim().length < 80) return toast('Il faut au moins 80 caractères du cours (ou chargez un fichier).', 'warning');
    S.step = 2;
  } else if (S.step === 2) {
    S.step = 3;
    return rafiqGenerate();
  }
  render();
}

// ---------- préférences locales du module (localStorage) ----------
const RF_PREF = {
  get(k, d) { try { const v = localStorage.getItem('rafiq_' + k); return v === null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem('rafiq_' + k, JSON.stringify(v)) } catch (e) {} }
};

// ligne de réglage : pastille + titre/sous-titre + valeur + chevron
function rfRow(icon, tone, ar, fr, value, action) {
  return `<button type="button" onclick="${esc(action || '')}" class="w-full flex items-center gap-3 p-3 bg-white border-b border-slate-100 last:border-0 hover:bg-slate-50 text-right">
    ${rfChip(icon, tone)}
    <span class="min-w-0 flex-1"><span class="block text-[13px] font-bold text-slate-800 truncate">${esc(ar)}</span>
    <span class="block text-[11px] text-slate-500 truncate">${esc(fr)}</span></span>
    ${value ? `<span class="text-[11px] font-semibold text-teal-600 flex-shrink-0">${esc(value)}</span>` : ''}
    <i class="fas fa-chevron-left text-[10px] text-slate-300 flex-shrink-0"></i>
  </button>`;
}
function rfGroup(title, rows) {
  return `<section class="mb-4"><p class="text-[11px] font-bold text-slate-400 mb-1.5 px-1" dir="rtl">${esc(title)}</p>
    <div class="rounded-2xl overflow-hidden border border-slate-100 shadow-sm" dir="rtl">${rows.join('')}</div></section>`;
}

// ---------- écran : الإعدادات ----------
function rafiqSettings(el) {
  const q = (RAFIQ.setQuery || '').trim().toLowerCase();
  const lang = RF_PREF.get('ai_lang', 'ar');
  const groups = [
    ['الأساسي', [
      ['fa-language', 'teal', 'لغة الذكاء الاصطناعي', 'Langue des générations IA', lang === 'ar' ? 'العربية' : 'Français', "rafiqToggleAiLang()", 'لغة الذكاء الاصطناعي اللغة العربية'],
      ['fa-shield-halved', 'teal', 'الخصوصية والأمان', 'Confidentialité et sécurité', '', "navigate('settings')", 'الخصوصية والأمان قفل التطبيق نسخة احتياطية']
    ]],
    ['الشكل', [
      ['fa-font', 'teal', 'الشكل والخط', 'Apparence et police', '', "rafiqAppearance()", 'الشكل والخط القاهرة الحجم العادي فاتح'],
      ['fa-table-cells-large', 'teal', 'الأيقونة والودجات', 'Icône et widgets', '', "toast('Widgets : ajoutez « رفيق المعلم » à votre écran d accueil depuis le navigateur.','info')", 'الأيقونة والودجات تحديث الشاشة الرئيسية']
    ]],
    ['التواصل', [
      ['fa-bell', 'teal', 'الإشعارات', 'Notifications', '', "navigate('notifications')", 'الإشعارات تليجرام واتساب بريد تنبيهات شكر'],
      ['fa-comment-dots', 'teal', 'واتساب والرسائل', 'WhatsApp et messages', '', "navigate('chat')", 'واتساب والرسائل']
    ]],
    ['الشغل', [
      ['fa-money-bill', 'teal', 'العملة', 'Monnaie', brandCurrency(), "navigate('settings')", 'العملة جنيه مصري'],
      ['fa-receipt', 'teal', 'المصاريف في تطبيق الطلاب', 'Frais côté élèves', '', "navigate('fees')", 'المصاريف في تطبيق الطلاب'],
      ['fa-qrcode', 'teal', 'كود الطلاب', 'Code élève', '', "navigate('students')", 'كود الطلاب للدخول والتحضير والفلوس'],
      ['fa-file-word', 'teal', 'شكل الملفات المفتوحة', 'Format des fichiers', '', "rafiqAutoFormat()", 'شكل الملفات المفتوحة الملازم والكروت وفتحه باسمك'],
      ['fa-sliders', 'teal', 'الإدارة المتقدمة', 'Administration avancée', '', "navigate('settings')", 'الإدارة المتقدمة']
    ]]
  ];
  const body = groups.map(([g, rows]) => {
    const filtered = rows.filter(r => !q || (r[2] + ' ' + r[3] + ' ' + (r[6] || '')).toLowerCase().includes(q));
    return filtered.length ? rfGroup(g, filtered.map(r => rfRow(r[0], r[1], r[2], r[3], r[4], r[5]))) : '';
  }).join('');
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-3" dir="rtl">الإعدادات</h2>
  <div class="relative mb-4">
    <input class="w-full border rounded-2xl pl-3 pr-9 py-3 text-sm bg-white" dir="rtl" placeholder="دوز في الإعدادات…" value="${esc(RAFIQ.setQuery || '')}" oninput="RAFIQ.setQuery=this.value; render()">
    <i class="fas fa-magnifying-glass absolute top-1/2 -translate-y-1/2 left-3.5 text-slate-400 text-sm"></i>
  </div>
  ${body || `<div class="text-center text-slate-400 text-sm py-8">لا نتيجة</div>`}
  <p class="text-center text-[11px] text-slate-400 mt-4">رفيق المعلم — إعداد نخبة من خبراء التعليم</p>`;
}
function rafiqToggleAiLang() {
  const cur = RF_PREF.get('ai_lang', 'ar');
  const next = cur === 'ar' ? 'fr' : 'ar';
  RF_PREF.set('ai_lang', next);
  RAFIQ.studio.lang = next;
  toast(next === 'ar' ? 'لغة الذكاء الاصطناعي : العربية' : 'Langue IA : Français', 'info');
  render();
}
function rafiqAppearance() {
  const cur = RF_PREF.get('font', 'noto');
  const fonts = [['noto', 'Noto Kufi', 'خط كوفي واضح'], ['cairo', 'Cairo', 'القاهرة — العنوان العريض'], ['system', 'Système', 'Police du téléphone']];
  openModal('<i class="fas fa-font text-teal-600 mr-2"></i>الشكل والخط',
    `<div class="grid gap-2 mb-4">${fonts.map(([k, l, d]) => `<button type="button" onclick="RF_PREF.set('font','${k}'); rafiqApplyFont(); closeModal(); render()"
      class="pal-card ${cur === k ? 'pal-on' : ''}"><i class="fas fa-font text-teal-600"></i>
      <span class="min-w-0 text-right"><span class="block text-sm font-bold text-slate-800">${esc(l)}</span><span class="block text-[11px] text-slate-500">${esc(d)}</span></span>
      ${cur === k ? '<i class="fas fa-circle-check text-teal-600 text-xs"></i>' : ''}</button>`).join('')}</div>
    <p class="text-[11px] text-slate-400">Le mode clair / sombre reste dans le bouton ☀️ de la barre du haut.</p>`);
}
function rafiqApplyFont() {
  const f = RF_PREF.get('font', 'noto');
  const map = { noto: "'Noto Kufi Arabic', 'Noto Sans Arabic', Tahoma, sans-serif", cairo: "'Cairo', 'Noto Kufi Arabic', Tahoma, sans-serif", system: 'system-ui, Tahoma, sans-serif' };
  document.documentElement.style.setProperty('--font-arabic', map[f] || map.noto);
}

// ---------- écran : حسابي ----------
function rafiqAccount(el) {
  const u = (typeof App !== 'undefined' && App.user) || {};
  const rows = [
    ['fa-bell', 'teal', 'حسابي', 'Mon compte', () => "navigate('settings')"],
    ['fa-headset', 'teal', 'المساعدين', 'Assistants', () => "toast('Les assistants se gèrent avec les comptes enseignants.','info')"],
    ['fa-crown', 'teal', 'الباقات والاشتراكات', 'Offres et abonnements', () => "navigate('settings')"],
    ['fa-shield-halved', 'teal', 'الخصوصية والأمان', 'Confidentialité et sécurité', () => "navigate('settings')"],
    ['fa-gear', 'teal', 'الإعدادات', 'Réglages', () => "rafiqGo('settings')"],
    ['fa-headset', 'teal', 'الدعم الفني', 'Assistance', () => "window.open('mailto:' + (BRAND.email || ''), '_blank')"],
    ['fa-lightbulb', 'teal', 'الاقتراحات', 'Suggestions', () => "rafiqIdea()"],
    ['fa-file-contract', 'teal', 'السياسات', 'Politiques', () => "window.open('/aide','_blank')"]
  ];
  el.innerHTML = `<div class="text-center py-4 mb-3">
    <span class="inline-flex w-20 h-20 rounded-full bg-teal-600 text-white items-center justify-center text-3xl font-black mb-2">${esc((u.name || '?').trim()[0] || '?')}</span>
    <p class="text-lg font-black text-slate-800">${esc(u.name || '')}</p>
    <p class="text-xs text-teal-600 font-semibold">${esc(u.subject || (u.role === 'admin' ? 'Administration' : (u.email || '')))}</p>
  </div>
  ${rfGroup('', rows.map(r => rfRow(r[0], r[1], r[2], r[3], '', `(${r[4].toString()})()`)))}
  <button type="button" onclick="logout()" class="${RF_CARD} w-full flex items-center gap-3 p-3 text-right border-rose-100 mt-2">
    ${rfChip('fa-arrow-right-from-bracket', 'rose')}
    <span class="min-w-0 flex-1"><span class="block text-[13px] font-bold text-rose-600" dir="rtl">تسجيل الخروج</span><span class="block text-[11px] text-slate-500">Se déconnecter</span></span>
  </button>
  <div class="text-center text-[11px] text-slate-400 mt-5 leading-relaxed" dir="rtl">
    <p class="font-bold text-slate-500"><i class="fas fa-wand-magic-sparkles mr-1"></i>رفيق المعلم</p>
    <p>إعداد نخبة من خبراء التعليم</p>
    <p class="mt-2"><i class="fas fa-lock mr-1"></i>بياناتك ملكك — نسختك الاحتياطية مشفّرة بشكل كامل ومحفوظة، يفتحها غيرك.</p>
  </div>`;
}
function rafiqIdea() {
  openModal('<i class="fas fa-lightbulb text-amber-500 mr-2"></i>الاقتراحات',
    `<textarea id="rf-idea" rows="4" class="w-full border rounded-xl p-3 text-sm" dir="rtl" placeholder="اكتب اقتراحك…"></textarea>
     <div class="flex justify-end gap-2 mt-3"><button onclick="closeModal()" class="${btnSecondary}">إلغاء</button>
     <button onclick="rafiqSendIdea()" class="${btnPrimary}"><i class="fas fa-paper-plane mr-1"></i> إرسال</button></div>`);
}
async function rafiqSendIdea() {
  const v = (document.getElementById('rf-idea') || {}).value || '';
  if (v.trim().length < 5) return toast('اكتب اقتراحك أولاً.', 'warning');
  try { await api.post('/db/notifications', { type: 'suggestion', title: 'اقتراح من رفيق المعلم', message: v.slice(0, 1500), target_role: 'admin' }); } catch (e) {}
  closeModal(); toast('شكراً! وصل اقتراحك للإدارة ✅');
}

// ---------- écran : المجتمع ----------
function rafiqCommunity(el) {
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">المجتمع</h2>
  <p class="text-xs text-slate-500 mb-4">شارك، اسأل، واستفد من تجارب المعلمين — communauté enseignante</p>
  ${rfGrid([
    rfTile('fa-share-nodes', 'شارك ملزمة', 'Publier un support', "rafiqShareBooklet()", 'teal'),
    rfTile('fa-comments', 'أسأل المعلمين', 'Poser une question', "rafiqGo('community')", 'violet'),
    rfTile('fa-download', 'حمّل ملازم', 'Banque publique', "navigate('bank')", 'blue'),
    rfTile('fa-star', 'الأكثر استعمالاً', 'Les plus utilisés', "navigate('bank')", 'amber')
  ])}
  <div class="${RF_CARD} p-5 text-center mt-4">
    <i class="fas fa-users text-3xl text-teal-600 mb-2"></i>
    <p class="font-bold text-slate-800" dir="rtl">شارك خبرتك مع باقي المعلمين</p>
    <p class="text-xs text-slate-500 mt-1">Chaque support partagé aide un collègue à gagner une heure.</p>
    <button type="button" onclick="rafiqShareBooklet()" class="${btnPrimary} mt-3 justify-center"><i class="fas fa-share-nodes mr-1"></i> مشاركة</button>
  </div>`;
}
function rafiqShareBooklet() {
  const r = RAFIQ.studio.result;
  if (!r) return toast('Générez d aborder un support dans l atelier, puis partagez-le.', 'info');
  openModal('<i class="fas fa-share-nodes text-teal-600 mr-2"></i>مشاركة مع المجتمع',
    `<p class="text-sm text-slate-600 mb-3">Votre support sera copié dans la bibliothèque de l'établissement (sans donnée d'élève).</p>
     <input id="rf-share-title" class="w-full border rounded-xl px-3 py-2 text-sm mb-2" dir="rtl" value="${esc(RAFIQ.studio.title || 'ملزمة')}">
     <div class="flex justify-end gap-2 mt-2"><button onclick="closeModal()" class="${btnSecondary}">إلغاء</button>
     <button onclick="rafiqDoShare()" class="${btnPrimary}"><i class="fas fa-share mr-1"></i> مشاركة</button></div>`);
}
async function rafiqDoShare() {
  const title = (document.getElementById('rf-share-title') || {}).value || 'ملزمة';
  const r = RAFIQ.studio.result;
  try {
    const d = (r && r.data) || {};
    await api.post('/db/courses', { title, description: [d.summary, (d.key_points || []).join(' · ')].filter(Boolean).join('\n\n').slice(0, 8000), file_type: 'text', cycle: 'primaire' });
    closeModal(); toast('تمت المشاركة — support ajouté à la bibliothèque ✅');
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

// ---------- écran : منصتي ----------
function rafiqMyPlatform(el) {
  const mods = (typeof MODULES === 'object' && MODULES) || {};
  const enabled = Object.keys(mods).filter(k => typeof moduleEnabled === 'function' ? moduleEnabled(k) : true);
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">منصتي</h2>
  <p class="text-xs text-slate-500 mb-4">أدر منصتك وتطبيقك — gérez votre plateforme</p>
  <div class="rounded-3xl p-4 mb-4 text-white" style="background:linear-gradient(135deg,#0f766e,#0d9488 60%,#14b8a6)">
    <div class="flex items-center gap-3">
      <span class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center"><i class="fas fa-circle-play text-xl"></i></span>
      <div class="min-w-0"><p class="font-black truncate" dir="rtl">ازاي رفيق المعلم بيسهّل عليك</p><p class="text-[11px] opacity-85">شاهد الفيديو · 2 min</p></div>
    </div>
  </div>
  ${rfGrid([
    rfTile('fa-palette', 'التحكم في المنصة', 'Couleurs & palettes', "typeof openPalettePicker==='function' && openPalettePicker()", 'teal'),
    rfTile('fa-list-check', 'الطلبات والاحتراف', 'Demandes & abonnements', "navigate('registrations')", 'amber'),
    rfTile('fa-building', 'بيانات المنصة', 'Identité de l établissement', "navigate('settings')", 'blue'),
    rfTile('fa-qrcode', 'التسويق', 'QR & page publique', "navigate('registrations')", 'violet')
  ])}
  ${rfSection('إدارة المنصة', 'modules actifs (' + enabled.length + ')', `<div class="rounded-2xl border border-slate-100 bg-white divide-y divide-slate-100" dir="rtl">
    ${Object.entries(mods).slice(0, 8).map(([k, m]) => `<div class="flex items-center gap-3 p-3">
      <span class="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center text-sm"><i class="fas ${m.icon || 'fa-cube'}"></i></span>
      <span class="min-w-0 flex-1"><span class="block text-[12px] font-bold text-slate-800 truncate">${esc(m.label)}</span></span>
      <span class="badge ${(typeof moduleEnabled === 'function' && moduleEnabled(k)) ? 'badge-green' : 'badge-gray'}">${(typeof moduleEnabled === 'function' && moduleEnabled(k)) ? 'مفعّل' : 'موقوف'}</span>
    </div>`).join('')}
    <button type="button" onclick="navigate('settings')" class="w-full p-3 text-[12px] font-bold text-teal-700 hover:bg-slate-50"><i class="fas fa-gear mr-1"></i> إدارة كل الوحدات</button>
  </div>`)}`;
}

/* ============================================================
   F68 (suite) — examens papier / électroniques, شرح وموشن,
   صور وحوّل, نسق تلقائي. Même moteur IA que l'atelier.
   ============================================================ */

// ---------- écran : الامتحانات الورقية ----------
function rafiqPaperExams(el) {
  const cards = [
    ['fa-file-lines', 'امتحان حصة', 'ورقة قصيرة على درس الحصة', 'blue', 'class'],
    ['fa-file-circle-check', 'امتحان أسبوعي', 'على دروس الأسبوع', 'violet', 'week'],
    ['fa-calendar-days', 'امتحان شهري', 'امتحان شامل على الشهر', 'green', 'month'],
    ['fa-bolt', 'امتحان مفاجئ', 'كويز سريع من غير ميعاد', 'amber', 'surprise']
  ];
  el.innerHTML = `${rfBack('إعداد الامتحانات')}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">الامتحانات الورقية</h2>
  <p class="text-xs text-slate-500 mb-4">عايز تعمل امتحان إيه؟ — quel type d'épreuve papier ?</p>
  ${rfGrid(cards.map(([i, ar, fr, tone, k]) => rfPaperCard(i, ar, fr, tone, k)))}
  ${rfSection('أدوات', 'plus d options', `
    ${rfWide('fa-file-word', 'اصنع امتحانك', 'Word — أسئلتك مكتوبة، نرفعها ونطلع ورقة منسّقة', "rafiqExamStart('custom')", 'violet')}
    <div class="h-2"></div>
    ${rfWide('fa-clone', 'زي النموذج ده', 'رفع ورقة قديمة ونطلع واحدة جديدة بنفس الشكل والدرجات', "rafiqExamStart('template')", 'teal')}`)}`;
}
function rfPaperCard(icon, ar, fr, tone, kind) {
  return `<button type="button" onclick="rafiqExamStart('${kind}')" class="${RF_CARD} p-3 text-right w-full">
    <div class="rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 p-3 mb-2 flex justify-center"><i class="fas ${icon} text-2xl text-${tone}-600"></i></div>
    <span class="block ${RF_TXT}" dir="rtl">${esc(ar)}</span>
    <span class="block ${RF_SUB}" dir="rtl">${esc(fr)}</span></button>`;
}

// ---------- écran : إدارة الامتحانات الإلكترونية ----------
function rafiqEExam(el) {
  el.innerHTML = `${rfBack('إعداد الامتحانات')}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">إدارة الامتحانات الإلكترونية</h2>
  <p class="text-xs text-slate-500 mb-4">اختبارات وتصحيح تلقائي — évaluations en ligne</p>
  <div class="${RF_CARD} p-6 text-center mb-4">
    <i class="fas fa-clipboard-list text-4xl text-slate-300 mb-2"></i>
    <p class="font-bold text-slate-700" dir="rtl">لا توجد اختبارات بعد</p>
    <p class="text-[11px] text-slate-400" dir="rtl">أنشئ أول اختبار إلكتروني ليطوّر طلابك.</p>
  </div>
  ${rfSection('أنشئ', 'créer', rfGrid([
    rfTile('fa-mobile-screen', 'امتحان إلكتروني', 'بوقت، والطالب يحل في التطبيق', "rafiqExamStart('online')", 'teal'),
    rfTile('fa-house-laptop', 'واجب', 'بآخر ميعاد — يحل في التطبيق أو يصور ورقته', "showCourseForm && showCourseForm()", 'violet'),
    rfTile('fa-wand-magic-sparkles', 'اعمل امتحان بالذكاء', 'من درس في المنهج أو ملف أو موضوع', "rafiqExamStart('ai')", 'amber'),
    rfTile('fa-list-check', 'الامتحانات الحالية', 'Corriger / publier / supprimer', "navigate('interactive')", 'blue')
  ]))}
  ${rfSection('النتائج', 'correction', rfWide('fa-chart-line', 'شارة الفصل ونتائج الطلاب', 'Moyennes, taux de réussite, remédiation', "navigate('analytics')", 'green'))}`;
}

// ---------- assistant examen (4 étapes : الدرس / البيانات / الأسئلة / اللغة) ----------
const RAFIQ_EXAM_KIND = {
  class:    { ar: 'امتحان حصة',     fr: 'Interrogation de séance' },
  week:     { ar: 'امتحان أسبوعي',  fr: 'Devoir de la semaine' },
  month:    { ar: 'امتحان شهري',    fr: 'Bilan du mois' },
  surprise: { ar: 'امتحان مفاجئ',   fr: 'Quiz surprise' },
  custom:   { ar: 'امتحان خاص',     fr: 'Épreuve personnalisée' },
  template: { ar: 'زي النموذج',     fr: 'D après un modèle' },
  online:   { ar: 'امتحان إلكتروني', fr: 'Évaluation en ligne' },
  ai:       { ar: 'امتحان بالذكاء', fr: 'Généré par l IA' }
};
function rafiqExamStart(kind) {
  RAFIQ.exam = { kind: kind, step: 1, source: (RAFIQ.studio && RAFIQ.studio.source) || '', title: '', count: 10, diff: 'moyen', duration: 60, manual: false, mine: '', lang: (RAFIQ.studio && RAFIQ.studio.lang) || 'ar', result: null, busy: false };
  RAFIQ.screen = 'examwiz';
  render();
}
function rfExamLabel(kind) { return RAFIQ_EXAM_KIND[kind] || RAFIQ_EXAM_KIND.class; }

function rafiqExamWizard(el) {
  const E = RAFIQ.exam;
  if (!E) return rafiqPaperExams(el);
  const lb = rfExamLabel(E.kind);
  const labels = [['الدرس', 'Source'], ['البيانات', 'Données'], ['الأسئلة', 'Questions'], ['اللغة', 'Langue']];
  const head = `${rfBack('الامتحانات')}
  <div class="flex items-center gap-3 mb-1">${rfChip('fa-file-signature', 'violet')}<div class="min-w-0"><h2 class="text-lg font-black text-slate-800 truncate" dir="rtl">${esc(lb.ar)}</h2><p class="text-[11px] text-slate-500 truncate">${esc(lb.fr)}</p></div></div>
  ${rfWizardStepsBar(E.step, 4, labels)}`;

  if (E.step === 1) {
    el.innerHTML = head + rfSourceBlock() + `
      <label class="mt-3 flex items-center gap-2 text-xs font-bold text-slate-600 bg-white border rounded-xl p-3 cursor-pointer">
        <input type="checkbox" ${E.manual ? 'checked' : ''} onchange="RAFIQ.exam.manual=this.checked">
        <i class="fas fa-pen text-teal-600"></i><span dir="rtl">هكتب الأسئلة بنفسي</span></label>
      <div class="flex justify-between items-center mt-3">
        <button type="button" onclick="rafiqGo('home')" class="${btnSecondary}">إلغاء</button>
        <button type="button" onclick="rafiqExamNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button>
      </div>`;
    rafiqStudioCount();
    return;
  }

  if (E.step === 2) {
    el.innerHTML = head + `<div class="${RF_CARD} p-4">
      <label class="block text-xs font-bold text-slate-600 mb-1" dir="rtl">عنوان الامتحان</label>
      <input id="rf-ex-title" class="w-full border rounded-xl px-3 py-2 text-sm mb-3" dir="rtl" placeholder="مثال : امتحان رياضيات — الوحدة 3" value="${esc(E.title)}">
      <div class="grid grid-cols-3 gap-2">
        <div><label class="block text-[11px] font-bold text-slate-600 mb-1" dir="rtl">عدد الأسئلة</label>
          <input id="rf-ex-count" type="number" min="3" max="20" class="w-full border rounded-xl px-2 py-2 text-sm" value="${E.count}"></div>
        <div><label class="block text-[11px] font-bold text-slate-600 mb-1" dir="rtl">المدة (دق)</label>
          <input id="rf-ex-duration" type="number" min="5" max="180" class="w-full border rounded-xl px-2 py-2 text-sm" value="${E.duration}"></div>
        <div><label class="block text-[11px] font-bold text-slate-600 mb-1" dir="rtl">الصعوبة</label>
          <select id="rf-ex-diff" class="w-full border rounded-xl px-2 py-2 text-sm">
            <option value="facile" ${E.diff === 'facile' ? 'selected' : ''}>سهل</option>
            <option value="moyen" ${E.diff === 'moyen' ? 'selected' : ''}>متوسط</option>
            <option value="difficile" ${E.diff === 'difficile' ? 'selected' : ''}>صعب</option>
          </select></div>
      </div>
      <p class="text-[11px] text-slate-400 mt-2" dir="rtl"><i class="fas fa-circle-info mr-1"></i>الدرجات تُوزّع بالتساوي على الأسئلة.</p>
    </div>
    <div class="flex justify-between mt-3">
      <button type="button" onclick="RAFIQ.exam.step=1; render()" class="${btnSecondary}">السابق</button>
      <button type="button" onclick="rafiqExamNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button>
    </div>`;
    return;
  }

  if (E.step === 3) {
    el.innerHTML = head + `<div class="${RF_CARD} p-4">
      <div class="grid grid-cols-2 gap-2 mb-3">
        <button type="button" onclick="RAFIQ.exam.manual=false; render()" class="rounded-xl border p-3 text-center ${E.manual ? '' : 'border-teal-500 bg-teal-50'}">
          <i class="fas fa-wand-magic-sparkles text-teal-600 block mb-1"></i><span class="text-[11px] font-bold" dir="rtl">الذكاء يكتب الأسئلة</span></button>
        <button type="button" onclick="RAFIQ.exam.manual=true; render()" class="rounded-xl border p-3 text-center ${E.manual ? 'border-teal-500 bg-teal-50' : ''}">
          <i class="fas fa-pen text-violet-600 block mb-1"></i><span class="text-[11px] font-bold" dir="rtl">هكتب الأسئلة بنفسي</span></button>
      </div>
      ${E.manual ? `<textarea id="rf-ex-mine" rows="9" class="w-full border rounded-xl p-3 text-sm" dir="rtl" placeholder="سؤال ثم اختيارات كل واحدة في سطر يبدأ بـ -&#10;ضع * قبل الاختيار الصحيح&#10;&#10;مثال :&#10;ما هي وحدة قياس القوة ؟&#10;- متر *&#10;- نيوتن">${esc(E.mine)}</textarea>
        <p class="text-[11px] text-slate-400 mt-1" dir="rtl">سطر فاضي بين كل سؤال والتاني.</p>`
      : `<p class="text-[11px] text-slate-500 bg-teal-50 rounded-lg p-2" dir="rtl"><i class="fas fa-circle-info mr-1 text-teal-600"></i>هيتولّد ${E.count} سؤال (${E.diff}) من نص الدرس، مع الإجابات ودرجاتها.</p>`}
    </div>
    <div class="flex justify-between mt-3">
      <button type="button" onclick="rafiqExamNext(true)" class="${btnSecondary}">السابق</button>
      <button type="button" onclick="rafiqExamNext()" class="${btnPrimary}"><i class="fas fa-arrow-left mr-1"></i> التالي</button>
    </div>`;
    return;
  }

  el.innerHTML = head + `<div class="${RF_CARD} p-4 mb-3">
      <label class="block text-xs font-bold text-slate-600 mb-1" dir="rtl">لغة الامتحان</label>
      <div class="grid grid-cols-2 gap-2">
        <button type="button" onclick="RAFIQ.exam.lang='ar'; render()" class="rounded-xl border p-3 text-center ${E.lang === 'ar' ? 'border-teal-500 bg-teal-50' : ''}"><span class="text-sm font-bold">العربية</span></button>
        <button type="button" onclick="RAFIQ.exam.lang='fr'; render()" class="rounded-xl border p-3 text-center ${E.lang === 'fr' ? 'border-teal-500 bg-teal-50' : ''}"><span class="text-sm font-bold">Français</span></button>
      </div>
    </div>
    <div class="flex justify-between mt-3">
      <button type="button" onclick="RAFIQ.exam.step=3; render()" class="${btnSecondary}">السابق</button>
      <button type="button" onclick="rafiqExamGenerate()" class="${btnPrimary}"><i class="fas fa-file-signature mr-1"></i> اصنع الامتحان</button>
    </div>
    <div id="rf-ex-result" class="mt-4">${E.result ? rafiqResultHtml(E.result) : ''}</div>`;
}

function rafiqExamNext(back) {
  const E = RAFIQ.exam; if (!E) return;
  const ta = document.getElementById('rf-studio-text'); if (ta) E.source = ta.value.trim();
  const ti = document.getElementById('rf-studio-title'); if (ti) E.title = ti.value.trim() || E.title;
  const t1 = document.getElementById('rf-ex-title'); if (t1) E.title = t1.value.trim();
  const c1 = document.getElementById('rf-ex-count'); if (c1) E.count = Math.max(3, Math.min(20, Number(c1.value) || 10));
  const d1 = document.getElementById('rf-ex-duration'); if (d1) E.duration = Number(d1.value) || 60;
  const df = document.getElementById('rf-ex-diff'); if (df) E.diff = df.value;
  const mn = document.getElementById('rf-ex-mine'); if (mn) E.mine = mn.value;
  if (back) E.step = Math.max(1, E.step - 1);
  else {
    if (E.step === 1 && !E.manual && E.source.trim().length < 80) return toast("Il faut au moins 80 caractères du cours (ou chargez un fichier).", 'warning');
    if (E.step === 3 && E.manual && E.mine.trim().length < 20) return toast('Écrivez vos questions (au moins une question).', 'warning');
    E.step = Math.min(4, E.step + 1);
  }
  render();
}

// questions saisies à la main : blocs séparés par une ligne vide
function rfParseManualQuiz(text) {
  const blocks = String(text || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const out = [];
  blocks.forEach(b => {
    const lines = b.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const question = lines[0].replace(/^[-*]\s*/, '');
    const opts = [];
    let good = -1;
    for (let i = 1; i < lines.length; i++) {
      const raw = lines[i];
      if (!/^[-*\u2022]/.test(raw)) continue;
      const body = raw.replace(/^[-*\u2022]\s*/, '');
      const isRight = /^\*/.test(body) || /\*$/.test(body);
      const label = body.replace(/^\*\s*/, '').replace(/\s*\*$/, '').trim();
      if (!label) continue;
      if (isRight && good < 0) good = opts.length;
      opts.push(label);
    }
    out.push({ question: question, options: opts, correct: good < 0 ? 0 : good, points: 1 });
  });
  return out;
}

// ---------- génération de l'examen (IA ou questions saisies à la main) ----------
async function rafiqExamGenerate() {
  const E = RAFIQ.exam; if (!E) return;
  const lb = rfExamLabel(E.kind);
  const box = document.getElementById('rf-ex-result');

  if (E.manual) {
    const qs = rfParseManualQuiz(E.mine);
    if (!qs.length) return toast('سطر فاضي بين كل سؤال والتاني مطلوب.', 'warning');
    E.result = { kind: 'quiz', data: { title: E.title || lb.ar, questions: qs }, used: 0, limit: 0 };
    if (box) box.innerHTML = rafiqResultHtml(E.result);
    return toast(`${qs.length} سؤال جاهز — relisez puis imprimez.`);
  }

  if (E.source.trim().length < 80) return toast('Texte source trop court (80 caractères minimum).', 'warning');
  E.busy = true;
  if (box) box.innerHTML = `<div class="text-sm text-teal-800 bg-teal-50 rounded-xl p-4"><i class="fas fa-spinner fa-spin mr-2"></i>Génération de l'examen (10 à 40 secondes)…</div>`;
  try {
    const r = (await api.post('/ai/generate', {
      kind: 'quiz', count: E.count, difficulty: E.diff, lang: E.lang,
      level: '', subject: [lb.ar, E.title].filter(Boolean).join(' · ').slice(0, 200),
      text: E.source.slice(0, 24000)
    }, { timeout: 90000 })).data;
    E.result = r;
    if (typeof App !== 'undefined' && App.cache) App.cache.aiResult = r;
    RAFIQ.studio.result = r;
    if (box) box.innerHTML = rafiqResultHtml(r);
  } catch (e) {
    if (box) box.innerHTML = `<div class="text-sm text-red-700 bg-red-50 rounded-xl p-4"><i class="fas fa-circle-xmark mr-1"></i>${esc(e.response?.data?.error || e.message)}</div>`;
  }
  E.busy = false;
}

// ---------- écran : شرح وموشن (galerie) ----------
const RAFIQ_MOTION = [
  { k: 'cartoon',   ar: 'قصة كرتونية',              fr: 'Dessin animé',            icon: 'fa-child-reaching',   tone: 'amber',  sec: 2 },
  { k: 'eteacher',  ar: 'المعلم الإلكتروني',        fr: 'Professeur virtuel',      icon: 'fa-chalkboard-user',  tone: 'blue',   sec: 2 },
  { k: 'onemin',    ar: 'ملخص الدرس في دقيقة',      fr: 'Résumé en 1 minute',      icon: 'fa-bolt',             tone: 'teal',   sec: 3 },
  { k: 'qvideo',    ar: 'فيديو أسئلة للمراجعة',     fr: 'Vidéo de révision',       icon: 'fa-circle-play',      tone: 'teal',   sec: 3 },
  { k: 'timeline',  ar: 'الخط الزمني',              fr: 'Frise chronologique',     icon: 'fa-timeline',         tone: 'slate',  sec: 5 },
  { k: 'stepsolve', ar: 'حل مسألة خطوة بخطوة',      fr: 'Résolution pas à pas',    icon: 'fa-shoe-prints',      tone: 'slate',  sec: 6 },
  { k: 'whiteboard', ar: 'فيديو السبورة البيضاء',   fr: 'Tableau blanc animé',     icon: 'fa-pen-nib',          tone: 'slate',  sec: 5 },
  { k: 'slides',    ar: 'شرح بالشرائح',             fr: 'Diapositives',            icon: 'fa-images',           tone: 'rose',   sec: 5 },
  { k: 'story',     ar: 'حكاية بالشخصيات',          fr: 'Récit à personnages',     icon: 'fa-masks-theater',    tone: 'amber',  sec: 1 },
  { k: 'dialogue',  ar: 'حوار الشخصيات',            fr: 'Dialogue',                icon: 'fa-comments',         tone: 'amber',  sec: 1 }
];
function rafiqMotion(el) {
  const secs = [[5, 'شرح وموشن', 'vidéo & motion'], [6, 'مواد معيّنة', 'supports ciblés'], [3, 'مراجعة وتواصل', 'révision'], [2, 'للأطفال', 'jeunes élèves'], [1, 'شخصيات', 'personnages']];
  const body = secs.map(([n, ar, fr]) => {
    const list = RAFIQ_MOTION.filter(m => m.sec === n);
    if (!list.length) return '';
    return rfSection(ar, fr, rfGrid(list.map(m => rfTile(m.icon, m.ar, m.fr, `rafiqTypeStart('${m.k}')`, m.tone)), 2));
  }).join('');
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">شرح وموشن</h2>
  <p class="text-xs text-slate-500 mb-4">حوّل درسك لفيديو وموشن — transformez la leçon en vidéo</p>
  ${body}
  <p class="text-[11px] text-slate-400 text-center mt-2" dir="rtl"><i class="fas fa-circle-info mr-1"></i>كل عنصر يولّد سكريبت فيديو جاهز بالتعليق الصوتي والمشاهد.</p>`;
}

// ---------- écran : صور وحوّل (photos → Word/PDF propre) ----------
function rafiqOcr(el) {
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">صور وحوّل</h2>
  <p class="text-xs text-slate-500 mb-4">حوّل صور صفحات الكتاب لنص منسّق ونظيف</p>
  <div class="${RF_CARD} p-4 mb-3 text-center">
    <div class="rounded-2xl bg-slate-50 py-6 mb-3 flex items-center justify-center gap-4">
      <i class="fas fa-file-lines text-4xl text-slate-800"></i>
      <i class="fas fa-arrow-left text-slate-300"></i>
      <i class="fas fa-file-word text-4xl text-teal-600"></i>
    </div>
    <p class="font-bold text-slate-800 text-sm" dir="rtl">نفس الكلام… بشكل احترافي</p>
    <p class="text-[11px] text-slate-500 mt-1" dir="rtl">عناوين ملوّنة، قوائم مرقّمة، وورقة الدرس مقصوصة ومرتّبة — Word أو PDF.</p>
  </div>
  ${rfGrid([
    rfTile('fa-images', 'من المعرض', 'Images de la galerie', "document.getElementById('rf-ocr-file').click()", 'teal'),
    rfTile('fa-camera', 'صور بالمسح', 'Appareil photo', "document.getElementById('rf-ocr-file').click()", 'violet')
  ])}
  <input id="rf-ocr-file" type="file" accept="image/*,.pdf" multiple class="hidden" onchange="rafiqOcrPick(this.files)">
  <div id="rf-ocr-list" class="mt-3"></div>
  <input id="rf-ocr-name" class="w-full border rounded-xl px-3 py-2.5 text-sm mt-3" dir="rtl"
    placeholder="اسم الكتاب / المادة والصفحة (مثلاً : العلوم — ص 24)" value="${esc((RF_PREF.get('ocr_name', '')) || '')}">
  <button type="button" onclick="rafiqOcrRead()" class="${btnPrimary} w-full justify-center mt-3"><i class="fas fa-wand-magic-sparkles mr-1"></i> نسخ الصفحات</button>
  <p class="text-[11px] text-slate-400 text-center mt-2" dir="rtl">الكلام بيتحول زي الكتاب بالظبط — من غير تلخيص ولا إعادة صياغة.</p>`;
}
function rafiqOcrPick(files) {
  const box = document.getElementById('rf-ocr-list');
  if (!box) return;
  RAFIQ.ocrFiles = Array.from(files || []).slice(0, 12);
  if (!RAFIQ.ocrFiles.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="${RF_CARD} p-3"><p class="text-[11px] font-bold text-slate-500 mb-1" dir="rtl">${RAFIQ.ocrFiles.length} ملف جاهز</p>
    <div class="grid grid-cols-3 gap-2">${RAFIQ.ocrFiles.map(f => `<div class="rounded-lg bg-slate-50 p-2 text-center min-w-0">
      <i class="fas ${/\.pdf$/i.test(f.name) ? 'fa-file-pdf text-red-500' : 'fa-image text-teal-600'} text-lg block"></i>
      <span class="block text-[9px] text-slate-500 truncate">${esc(f.name)}</span></div>`).join('')}</div></div>`;
}
// L'OCR se fait côté serveur/navigateur : ici on prépare le passage à l'IA à partir du texte joint.
function rafiqOcrRead() {
  const name = (document.getElementById('rf-ocr-name') || {}).value || '';
  RF_PREF.set('ocr_name', name);
  if (!(RAFIQ.ocrFiles || []).length) return toast('اختار صور الصفحات الأول.', 'warning');
  RAFIQ.studio = Object.assign(RAFIQ.studio || {}, {
    step: 1, source: '', title: name || 'ملزمة من صور', objective: 'نسخ النص كما هو في الكتاب، مع العناوين والقوائم، دون تلخيص أو إعادة صياغة.',
    kind: 'summary', lang: 'ar', busy: false, result: null
  });
  RAFIQ.screen = 'studio';
  render();
  toast('حوّل الصور لنص : استعمل كاميرا الهاتف (نسخ النص) ثم الصقه في الحقل.', 'info');
}

// ---------- écran : نسق تلقائي (texte collé → document propre) ----------
function rafiqAutoFormat(force) {
  if (!force && RAFIQ.screen !== 'autoformat') { RAFIQ.screen = 'autoformat'; }
  RAFIQ.autoFormat = RAFIQ.autoFormat || { mode: 'paste', text: '', target: 'booklet' };
  render();
}
function rafiqAutoFormatView(el) {
  const A = RAFIQ.autoFormat || { mode: 'paste', text: '', target: 'booklet' };
  const targets = [['booklet', 'ملزمة', 'Fiche'], ['revision', 'مراجعة', 'Révision'], ['exam', 'امتحان', 'Examen']];
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">نسق تلقائي</h2>
  <p class="text-xs text-slate-500 mb-3" dir="rtl">اكتب أو الصق درسك أو امتحانك زي ما هو… ويطلع ملزمة أو امتحان منسّق بأشكال احترافية</p>
  <div class="grid grid-cols-2 gap-2 mb-3">
    <button type="button" onclick="RAFIQ.autoFormat.mode='paste'; render()" class="rounded-xl border p-2.5 text-center ${A.mode === 'paste' ? 'border-teal-500 bg-teal-50' : 'bg-white'}">
      <i class="fas fa-pencil text-teal-600 mr-1"></i><span class="text-[12px] font-bold" dir="rtl">اكتب / الصق</span></button>
    <button type="button" onclick="RAFIQ.autoFormat.mode='word'; render()" class="rounded-xl border p-2.5 text-center ${A.mode === 'word' ? 'border-teal-500 bg-teal-50' : 'bg-white'}">
      <i class="fas fa-file-word text-blue-600 mr-1"></i><span class="text-[12px] font-bold">Word</span></button>
  </div>
  ${A.mode === 'word' ? `<div class="${RF_CARD} p-4 mb-3 text-center">
      <label class="cursor-pointer inline-flex items-center gap-2 ${btnSecondary}"><i class="fas fa-file-arrow-up"></i> Charger un Word / TXT
        <input type="file" accept=".doc,.docx,.txt,.md" class="hidden" onchange="rafiqAutoFormatFile(this.files[0])"></label>
      <div id="rf-af-file" class="mt-2 text-[11px] text-slate-500">${esc(A.fileName || '')}</div></div>`
    : `<div class="${RF_CARD} p-3 mb-3">
      <textarea id="rf-af-text" rows="10" class="w-full border-0 outline-none text-sm leading-relaxed" dir="rtl"
        placeholder="مثال :&#10;الدرس الأول: تركيب الخلية&#10;تعريف الخلية: هي وحدة البناء…&#10;١- الغشاء البلازمي: يحيط بالخلية&#10;انتبه: لا تخلط بين النواة والنوية"
        oninput="RAFIQ.autoFormat.text=this.value; var n=document.getElementById('rf-af-count'); if(n) n.textContent=this.value.length+' حرف'">${esc(A.text || '')}</textarea>
      <div class="flex items-center justify-between border-t pt-2 mt-1"><span id="rf-af-count" class="text-[11px] text-slate-400">${(A.text || '').length} حرف</span>
      <button type="button" onclick="rafiqAutoFormatPaste()" class="text-[11px] font-bold text-teal-700"><i class="fas fa-paste mr-1"></i> الصق</button></div></div>`}
  <p class="text-[11px] font-bold text-slate-500 mb-1.5" dir="rtl">يطلع إيه؟</p>
  <div class="grid grid-cols-3 gap-2 mb-3">
    ${targets.map(([k, ar, fr]) => `<button type="button" onclick="RAFIQ.autoFormat.target='${k}'; render()" class="rounded-xl border p-3 text-center ${A.target === k ? 'border-teal-500 bg-teal-50' : 'bg-white'}">
      <span class="block text-[12px] font-bold text-slate-800" dir="rtl">${ar}</span><span class="block text-[10px] text-slate-400">${fr}</span></button>`).join('')}
  </div>
  <p class="text-[11px] text-slate-400 mb-3" dir="rtl">يفهم لوحدة العناوين والتعريفات والقوانين والخطوات والمقارنات والأسئلة.</p>
  <button type="button" onclick="rafiqAutoFormatGo()" class="${btnPrimary} w-full justify-center"><i class="fas fa-wand-magic-sparkles mr-1"></i> نسّق تلقائي</button>`;
}
function rafiqAutoFormatFile(file) {
  if (!file) return;
  RAFIQ.autoFormat = RAFIQ.autoFormat || {};
  RAFIQ.autoFormat.fileName = file.name;
  const self = RAFIQ.autoFormat;
  file.text().then(t => {
    self.text = t.slice(0, 24000);
    self.mode = 'paste';
    toast('تم تحميل الملف — relisez puis lancez « نسّق تلقائي ».');
    render();
  }).catch(() => toast('Impossible de lire ce fichier (essayez .txt).', 'error'));
}
async function rafiqAutoFormatPaste() {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) return toast('الحافظة فاضية.', 'warning');
    RAFIQ.autoFormat.text = t.slice(0, 24000);
    render();
  } catch (e) { toast('اسمح بالوصول للحافظة أو الصق يدوياً (Ctrl+V).', 'info'); }
}
function rafiqAutoFormatGo() {
  const A = RAFIQ.autoFormat || {};
  const text = (A.text || '').trim();
  if (text.length < 80) return toast('اللصق قصير جداً (80 حرف على الأقل).', 'warning');
  const map = { booklet: 'ملزمة منسّقة', revision: 'ملزمة مراجعة', exam: 'امتحان ورقي' };
  RAFIQ.studio = Object.assign(RAFIQ.studio || {}, {
    step: 1, source: text, title: A.fileName ? A.fileName.replace(/\.[a-z0-9]+$/i, '') : '',
    objective: 'نسّق النص كما هو: عناوين، تعريفات، قوانين، خطوات، مقارنات — ' + (map[A.target] || 'ملزمة'),
    kind: A.target === 'exam' ? 'quiz' : 'summary', lang: (RAFIQ.studio && RAFIQ.studio.lang) || 'ar',
    busy: false, result: null, booklet: null
  });
  RAFIQ.screen = 'studio';
  RAFIQ.studio.step = 3;
  render();
  rafiqGenerate();
}

// ---------- écran : تحويل الشرح لملزمة (3 étapes) ----------
const RAFIQ_REC = { step: 1, title: '', text: '', output: 'booklet' };
function rafiqRecorder(el) {
  const R = RAFIQ_REC;
  const outputs = [
    ['booklet',  'ملزمة من شرحى', 'شرحك بالتفصيل + معلومات مهمة + أسئلة', 'fa-align-right', 'teal'],
    ['full',     'شرح تفصيلي كامل', 'كل حاجة من أ إلى ي',                    'fa-list-ol',     'slate'],
    ['revision', 'نص ملخّص ومقصوص', 'أقصر مساحة للمراجعة السريعة',            'fa-scissors',    'slate'],
    ['points',   'شرح مبسّط',       'نقاط قصيرة سهلة الحفظ',                 'fa-signal',      'slate']
  ];
  el.innerHTML = `${rfBack()}
  <h2 class="text-xl font-black text-slate-800 mb-1" dir="rtl">تحويل الشرح لملزمة</h2>
  <p class="text-xs text-slate-500 mb-4" dir="rtl">حوّل شرحك لملزمة</p>
  <p class="text-[11px] text-slate-500 mb-4" dir="rtl">ارسم تسجيل الحصة، وقد ملف مفتوح أو نص، ودع الذكاء يكتب الملزمة.</p>
  ${rfWizardStepsBar(R.step, 3, [['تسجيل الحصة', 'Enregistrement'], ['مساحة التفريغ', 'Transcription'], ['الناتج', 'Résultat']])}

  <div class="${RF_CARD} p-4 mb-3 ${R.step === 1 ? '' : 'opacity-60'}">
    <div class="flex items-center gap-2 mb-3" dir="rtl"><span class="badge badge-teal" style="background:#ccfbf1;color:#0f766e">1</span><span class="text-sm font-bold text-slate-800">تسجيل الحصة</span></div>
    <button type="button" onclick="rafiqRecStart()" class="w-full rounded-2xl border-2 border-dashed p-5 text-center hover:bg-teal-50">
      <i class="fas fa-microphone-lines text-2xl text-teal-600 block mb-1"></i>
      <span class="block text-[13px] font-bold text-slate-800" dir="rtl">اختار تسجيل الحصة</span>
      <span class="block text-[11px] text-slate-500" dir="rtl">أو استعمل ملف — أي طول</span></button>
    <p id="rf-rec-status" class="text-[11px] text-slate-500 mt-2" dir="rtl"><i class="fas fa-circle-info mr-1"></i>التفريغ شغّال في متصفحك مباشرة (ميكروفون الجهاز أو ملف صوتي).</p>
    <div class="mt-2 flex items-center gap-2">
      <i class="fas fa-video text-teal-600 text-sm"></i><span class="text-[11px] text-slate-500" dir="rtl">أو اختار فيديو الحصة</span>
      <button type="button" onclick="navigate('courses')" class="ml-auto text-[11px] font-bold text-teal-700">من الملفات</button>
    </div>
    <input id="rf-rec-title" class="w-full border rounded-xl px-3 py-2 text-sm mt-3" dir="rtl" placeholder="اسم المسار على الغلاف (اختياري)" value="${esc(R.title)}">
  </div>

  <div class="${RF_CARD} p-4 mb-3 ${R.step === 2 ? '' : 'opacity-60'}">
    <div class="flex items-center gap-2 mb-3" dir="rtl"><span class="badge" style="background:#ccfbf1;color:#0f766e">2</span><span class="text-sm font-bold text-slate-800">مساحة التفريغ</span></div>
    <div class="rounded-2xl bg-slate-50 p-4 text-center mb-2">
      <span class="inline-flex w-16 h-16 rounded-full bg-white border items-center justify-center mb-2"><i class="fas fa-waveform-lines text-2xl text-teal-600"></i></span>
      <p class="text-[13px] font-bold text-slate-800" dir="rtl">تجوّز مساحة التفريغ</p>
    </div>
    <button type="button" onclick="RAFIQ_REC.step=2; render()" class="${btnPrimary} w-full justify-center"><i class="fas fa-microphone mr-1"></i> جاهز</button>
    <textarea id="rf-rec-text" rows="5" class="w-full border rounded-xl p-3 text-sm mt-2" dir="rtl"
      placeholder="النص المفرّغ يظهر هنا — يمكنك تعديله قبل التوليد…" oninput="RAFIQ_REC.text=this.value">${esc(R.text || '')}</textarea>
  </div>

  <div class="${RF_CARD} p-4 mb-3 ${R.step === 3 ? '' : 'opacity-60'}">
    <div class="flex items-center gap-2 mb-3" dir="rtl"><span class="badge" style="background:#ccfbf1;color:#0f766e">3</span><span class="text-sm font-bold text-slate-800">عايز الناتج إيه؟</span></div>
    <div class="grid gap-2">
      ${outputs.map(([k, ar, fr, icon, tone]) => `<button type="button" onclick="RAFIQ_REC.output='${k}'; render()"
        class="w-full flex items-center gap-3 p-3 rounded-xl border text-right ${R.output === k ? 'border-teal-500 bg-teal-50' : 'bg-white'}">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center text-sm ${R.output === k ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}"><i class="fas ${icon}"></i></span>
        <span class="min-w-0 flex-1"><span class="block text-[12px] font-bold text-slate-800" dir="rtl">${esc(ar)}</span>
        <span class="block text-[10px] text-slate-500" dir="rtl">${esc(fr)}</span></span>
        ${R.output === k ? '<i class="fas fa-circle-check text-teal-600 text-sm"></i>' : ''}</button>`).join('')}
    </div>
  </div>
  <button type="button" onclick="rafiqRecGo()" class="${btnPrimary} w-full justify-center"><i class="fas fa-wand-magic-sparkles mr-1"></i> حوّل لملزمة</button>
  <div id="rf-studio-result" class="mt-4"></div>`;
}
function rafiqRecStart() {
  RAFIQ_REC.step = 2;
  const t = document.getElementById('rf-rec-title'); if (t) RAFIQ_REC.title = t.value.trim();
  render();
  const ta = document.getElementById('rf-rec-text');
  if (ta) ta.focus();
  toast('استعمل ميكروفون الجهاز 🎤 داخل المساحة، أو الصق التفريغ.', 'info');
}
function rafiqRecGo() {
  const t = document.getElementById('rf-rec-title'); if (t) RAFIQ_REC.title = t.value.trim();
  const ta = document.getElementById('rf-rec-text'); if (ta) RAFIQ_REC.text = ta.value.trim();
  const booklets = { booklet: 'explain', full: 'keyinfo', revision: 'revision', points: 'points' };
  const src = (RAFIQ_REC.text || RAFIQ.studio.source || '').trim();
  if (src.length < 80) { RAFIQ_REC.step = 2; render(); return toast('التفريغ قصير — سجّل الحصة أو الصق النص.', 'warning'); }
  RAFIQ.studio = Object.assign(RAFIQ.studio || {}, {
    step: 3, source: src, title: RAFIQ_REC.title, objective: 'ملزمة من شرح المعلم — حافظ على ترتيب الشرح.',
    kind: 'summary', lang: (RAFIQ.studio && RAFIQ.studio.lang) || 'ar', busy: false, result: null,
    booklet: booklets[RAFIQ_REC.output] || 'explain'
  });
  RAFIQ.screen = 'studio';
  render();
  rafiqGenerate();
}
