/* ============================================================
   Rahma Academy - Feature 56 : Évaluations multilingues (FR / AR / EN, RTL)
   + Assistant « Créer un examen » en 8 étapes (inspiré Exam Builder).
   Chargé AVANT views-evaluations.js : fournit EVA_I18N, evaT(), evaLang(), evaDefaultConsigne(), evaWizard().
   ============================================================ */

const EVA_I18N = {
  fr: {
    dir: 'ltr', name: 'Français',
    kinds: { prerequis: 'Évaluation des prérequis', controle: 'Contrôle', synthese: 'Évaluation de synthèse', devoir: 'Devoir de contrôle', examen: 'Examen' },
    types: { mcq: 'QCM / J\'entoure la bonne réponse', truefalse: 'Oui / Non (croix devant la bonne réponse)', match: 'Je relie par une flèche', strike: 'Je barre ce qui est faux', fill: 'Je complète (mots du cadre)', conjug: 'Je conjugue (verbes entre parenthèses)', quote: 'Je relève la phrase du texte', open: 'Production écrite / réponse rédigée' },
    consignes: { mcq: "J'entoure la bonne réponse.", truefalse: 'Je mets une croix devant la bonne réponse.', match: 'Je relie par une flèche.', strike: 'Je barre ce qui est faux.', fill: 'Je complète le paragraphe avec les mots du cadre.', conjug: 'Je complète avec les verbes entre parenthèses au présent.', quote: 'Je relève la phrase du texte qui justifie ma réponse.', open: "J'écris une petite histoire en respectant les images." },
    sections: { reading: 'Lecture - compréhension', lang: 'Langue', writing: 'Production écrite', exercises: 'Exercices', readingSub: 'Je lis le texte puis je réponds aux questions.' },
    ui: { yes: 'Oui', no: 'Non', name: 'Nom', firstname: 'Prénom', class: 'Classe', student: 'Élève', grade: 'Note', pts: 'pt(s)', page: 'page', key: 'CORRIGÉ', criteria: 'Critères', dictation: 'Dictée', teacher: 'Enseignant(e)', min: 'min', listen: 'Écouter', linkTo: '— relier à —', studentAnswer: '(réponse élève)', falseStrike: '(faux → à barrer)', total: 'Total' },
    levels: { '1AP': '1ère année primaire', '2AP': '2ème année primaire', '3AP': '3ème année primaire', '4AP': '4ème année primaire', '5AP': '5ème année primaire', '6AP': '6ème année primaire', '7AB': '7ème année de base', '8AB': '8ème année de base', '9AB': '9ème année de base', '1AS': '1ère année secondaire', '2AS': '2ème année secondaire', '3AS': '3ème année secondaire', '4AS': '4ème année secondaire' }
  },
  ar: {
    dir: 'rtl', name: 'العربية',
    kinds: { prerequis: 'تقييم المكتسبات القبلية', controle: 'فرض مراقبة', synthese: 'فرض تأليفي', devoir: 'واجب مراقبة', examen: 'امتحان' },
    types: { mcq: 'أختار الإجابة الصحيحة', truefalse: 'صواب / خطأ', match: 'أربط بسهم', strike: 'أشطب الخطأ', fill: 'أكمل بالكلمات المناسبة', conjug: 'أصرّف الأفعال بين قوسين', quote: 'أستخرج الجملة من النص', open: 'إنتاج كتابي' },
    consignes: { mcq: 'أحيط الإجابة الصحيحة.', truefalse: 'أضع علامة (×) أمام الإجابة الصحيحة.', match: 'أربط بسهم.', strike: 'أشطب ما هو خطأ.', fill: 'أكمل الفقرة بالكلمات الموجودة في الإطار.', conjug: 'أكمل بالأفعال الموجودة بين قوسين.', quote: 'أستخرج من النص الجملة التي تبرّر إجابتي.', open: 'أكتب قصة قصيرة بالاعتماد على الصور.' },
    sections: { reading: 'فهم المقروء', lang: 'قواعد اللغة', writing: 'الإنتاج الكتابي', exercises: 'تمارين', readingSub: 'أقرأ النص ثم أجيب عن الأسئلة.' },
    ui: { yes: 'نعم', no: 'لا', name: 'اللقب', firstname: 'الاسم', class: 'القسم', student: 'التلميذ', grade: 'العدد', pts: 'ن', page: 'صفحة', key: 'الإصلاح', criteria: 'معايير الإصلاح', dictation: 'إملاء', teacher: 'المعلّم(ة)', min: 'دق', listen: 'استمع', linkTo: '— أربط بـ —', studentAnswer: '(إجابة التلميذ)', falseStrike: '(خطأ ← يُشطب)', total: 'المجموع' },
    levels: { '1AP': 'السنة الأولى ابتدائي', '2AP': 'السنة الثانية ابتدائي', '3AP': 'السنة الثالثة ابتدائي', '4AP': 'السنة الرابعة ابتدائي', '5AP': 'السنة الخامسة ابتدائي', '6AP': 'السنة السادسة ابتدائي', '7AB': 'السنة السابعة أساسي', '8AB': 'السنة الثامنة أساسي', '9AB': 'السنة التاسعة أساسي', '1AS': 'السنة الأولى ثانوي', '2AS': 'السنة الثانية ثانوي', '3AS': 'السنة الثالثة ثانوي', '4AS': 'السنة الرابعة ثانوي' }
  },
  en: {
    dir: 'ltr', name: 'English',
    kinds: { prerequis: 'Prerequisites assessment', controle: 'Test', synthese: 'End-of-term exam', devoir: 'Class test', examen: 'Exam' },
    types: { mcq: 'Multiple choice / Circle the right answer', truefalse: 'Yes / No (tick the right answer)', match: 'Match with an arrow', strike: 'Cross out what is wrong', fill: 'Fill in the blanks (word box)', conjug: 'Conjugate (verbs in brackets)', quote: 'Quote the sentence from the text', open: 'Writing task / open answer' },
    consignes: { mcq: 'I circle the right answer.', truefalse: 'I tick the right answer.', match: 'I match with an arrow.', strike: 'I cross out what is wrong.', fill: 'I complete the paragraph with the words from the box.', conjug: 'I complete with the verbs in brackets in the present tense.', quote: 'I quote the sentence from the text that justifies my answer.', open: 'I write a short story following the pictures.' },
    sections: { reading: 'Reading comprehension', lang: 'Language', writing: 'Writing', exercises: 'Exercises', readingSub: 'I read the text, then I answer the questions.' },
    ui: { yes: 'Yes', no: 'No', name: 'Surname', firstname: 'First name', class: 'Class', student: 'Student', grade: 'Mark', pts: 'pt(s)', page: 'page', key: 'ANSWER KEY', criteria: 'Criteria', dictation: 'Dictation', teacher: 'Teacher', min: 'min', listen: 'Listen', linkTo: '— match with —', studentAnswer: '(student answer)', falseStrike: '(wrong → cross out)', total: 'Total' },
    levels: { '1AP': 'Grade 1 (primary)', '2AP': 'Grade 2 (primary)', '3AP': 'Grade 3 (primary)', '4AP': 'Grade 4 (primary)', '5AP': 'Grade 5 (primary)', '6AP': 'Grade 6 (primary)', '7AB': 'Grade 7 (middle)', '8AB': 'Grade 8 (middle)', '9AB': 'Grade 9 (middle)', '1AS': 'Year 1 (secondary)', '2AS': 'Year 2 (secondary)', '3AS': 'Year 3 (secondary)', '4AS': 'Year 4 (secondary)' }
  }
};
// Langue du document (fr | ar | en) — celle de l'évaluation, pas de l'interface
const evaLang = (doc) => { const l = (doc || (typeof EVA !== 'undefined' && EVA.doc) || {}).lang; return EVA_I18N[l] ? l : 'fr'; };
const evaT = (group, key, doc) => { const L = EVA_I18N[evaLang(doc)]; return (L[group] && L[group][key]) ?? (EVA_I18N.fr[group] && EVA_I18N.fr[group][key]) ?? key; };
const evaDefaultConsigne = (type, doc) => evaT('consignes', type, doc);
const evaIsRtl = (doc) => EVA_I18N[evaLang(doc)].dir === 'rtl';
// Libellé court d'un type (pour boutons)
const evaTypeShort = (k, doc) => String(evaT('types', k, doc)).split(' /')[0].split(' (')[0];

/* ================= Assistant « Créer un examen » (8 étapes) — alimenté par le référentiel programme (/api/curriculum) ================= */
// Référentiel : cache client 10 min, langue d'affichage = langue de l'UI (repli ar côté serveur)
const CUR = { cache: {}, at: {} };
async function curGet(path, lang) {
  const k = `${path}${path.includes('?') ? '&' : '?'}lang=${lang || WIZ.ui || 'fr'}`;
  if (CUR.cache[k] && Date.now() - CUR.at[k] < 600000) return CUR.cache[k];
  const r = (await api.get('/curriculum' + k)).data; CUR.cache[k] = r; CUR.at[k] = Date.now(); return r;
}
const curInvalidate = () => { CUR.cache = {}; CUR.at = {}; };
// Attributs d'affichage d'un libellé trilingue (dir selon la langue de l'UI)
const wizDir = () => (EVA_I18N[WIZ.ui]?.dir === 'rtl' ? 'rtl' : 'ltr');
const WIZ_FAMILY = { langues: { label: { fr: 'Langues', ar: 'اللغات', en: 'Languages' }, icon: 'fa-language', color: 'purple' }, sciences: { label: { fr: 'Sciences', ar: 'العلوم', en: 'Sciences' }, icon: 'fa-flask', color: 'blue' }, humaines: { label: { fr: 'Sciences humaines', ar: 'المواد الاجتماعية', en: 'Humanities' }, icon: 'fa-people-group', color: 'amber' }, arts: { label: { fr: 'Arts', ar: 'الفنون', en: 'Arts' }, icon: 'fa-palette', color: 'pink' }, techno: { label: { fr: 'Technologie', ar: 'التكنولوجيا', en: 'Technology' }, icon: 'fa-microchip', color: 'slate' }, sport: { label: { fr: 'Sport', ar: 'الرياضة', en: 'Sport' }, icon: 'fa-person-running', color: 'green' }, autres: { label: { fr: 'Autres', ar: 'أخرى', en: 'Other' }, icon: 'fa-ellipsis', color: 'gray' } };
const WIZ_SUBJECT_ICON = { arabe: ['fa-language', 'bg-purple-600'], francais: ['fa-book-open', 'bg-cyan-500'], anglais: ['fa-globe', 'bg-pink-600'], maths: ['fa-calculator', 'bg-blue-600'], eveil: ['fa-seedling', 'bg-green-600'], svt: ['fa-dna', 'bg-emerald-600'], physique: ['fa-atom', 'bg-indigo-600'], informatique: ['fa-laptop-code', 'bg-slate-600'], histoire: ['fa-landmark', 'bg-amber-800'], geo: ['fa-earth-africa', 'bg-green-700'], hist_geo: ['fa-landmark', 'bg-amber-700'], islamique: ['fa-mosque', 'bg-teal-700'], civique: ['fa-scale-balanced', 'bg-indigo-600'], philosophie: ['fa-brain', 'bg-rose-700'], economie: ['fa-chart-line', 'bg-orange-600'], gestion: ['fa-briefcase', 'bg-orange-700'], technologie: ['fa-gears', 'bg-slate-500'], arts: ['fa-palette', 'bg-pink-500'], musique: ['fa-music', 'bg-fuchsia-600'], eps: ['fa-person-running', 'bg-green-600'], allemand: ['fa-flag', 'bg-yellow-600'], espagnol: ['fa-flag', 'bg-red-600'], italien: ['fa-flag', 'bg-lime-600'] };
const wizIcon = (code) => WIZ_SUBJECT_ICON[code] || ['fa-book', 'bg-gray-500'];
// Repli hors-ligne (référentiel injoignable) : listes minimales FR/AR/EN
const WIZ_FALLBACK_LEVELS = ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP', '7AB', '8AB', '9AB', '1AS', '2AS', '3AS', '4AS'].map((l, i) => ({ id: -(i + 1), code: l, legacy_code: l, name: EVA_I18N.fr.levels[l] || l, name_fr: EVA_I18N.fr.levels[l] || l, name_ar: EVA_I18N.ar.levels[l] || l, name_en: EVA_I18N.en.levels[l] || l, duration_default: i < 6 ? 60 : i < 9 ? 90 : i < 12 ? 120 : 180, cycle: { code: i < 6 ? 'primaire' : i < 9 ? 'preparatoire' : 'secondaire', name_fr: i < 6 ? 'Primaire' : i < 9 ? 'Collège' : 'Secondaire', name_ar: i < 6 ? 'ابتدائي' : i < 9 ? 'إعدادي' : 'ثانوي', name_en: i < 6 ? 'Primary' : i < 9 ? 'Middle school' : 'Secondary' } }));
const WIZ_FALLBACK_SUBJECTS = [['arabe', 'ar', 'Arabe', 'العربية', 'Arabic', 'langues'], ['francais', 'fr', 'Français', 'الفرنسية', 'French', 'langues'], ['anglais', 'en', 'Anglais', 'الإنجليزية', 'English', 'langues'], ['maths', 'ar', 'Mathématiques', 'الرياضيات', 'Mathematics', 'sciences'], ['eveil', 'ar', 'Éveil scientifique', 'الإيقاظ العلمي', 'Science awareness', 'sciences'], ['histoire', 'ar', 'Histoire', 'التاريخ', 'History', 'humaines'], ['geo', 'ar', 'Géographie', 'الجغرافيا', 'Geography', 'humaines'], ['islamique', 'ar', 'Éducation islamique', 'التربية الإسلامية', 'Islamic education', 'humaines'], ['civique', 'ar', 'Éducation civique', 'التربية المدنية', 'Civic education', 'humaines']].map(([code, lang, fr, ar, en, family], i) => ({ level_subject_id: null, subject_id: -(i + 1), code, default_lang: lang, name_fr: fr, name_ar: ar, name_en: en, family, duration_default: 60, grading_scale: 20 }));
const WIZ_UI = {
  fr: { title: 'Créer un examen', step: 'Étape', of: 'sur', back: 'Retour', next: 'Suivant', cancel: 'Annuler', finish: 'Ouvrir dans l\'éditeur', s1: 'Choisir le niveau', s1d: 'Sélectionnez le cycle puis l\'année de la classe.', s2: 'Choisir la section', s2d: 'Au secondaire, les matières et le programme dépendent de la section.', s3: 'Choisir la matière', s3d: 'Le catalogue d\'exercices, la durée et la langue de l\'épreuve s\'adaptent à votre choix.', s4: 'Type d\'évaluation et trimestre', s4d: 'Le devoir porte sur ce trimestre : l\'IA ne propose que les notions déjà introduites.', s5: 'Chapitres et notions', s5d: 'Cochez les chapitres 📖 ou notions 🔖 à évaluer. Rien à cocher ? Décrivez un thème libre.', s6: 'Nom, durée et langue', s6d: 'Le nom est proposé automatiquement ; la durée et la langue viennent du programme (modifiables).', s7: 'Que voulez-vous mettre dans ce devoir ?', s7d: 'Appuyez sur + pour ajouter un exercice. Les types proposés correspondent à la matière.', s8: 'Récapitulatif', s8d: 'Vérifiez puis ouvrez l\'éditeur : les exercices vides seront créés, prêts à remplir (ou à générer avec l\'IA).', nameLbl: 'Nom du devoir', durLbl: 'Durée', langLbl: 'Langue de l\'épreuve', kindLbl: 'Type d\'évaluation', online: 'Passation en ligne', trimestre: t => `${t}${t === 1 ? 'er' : 'ème'} trimestre`, exercises: 'exercices', points: 'points', aiFill: 'Générer le contenu avec l\'IA (5 jetons)', chars: 'caractères', min: 'min', noSection: 'Tronc commun (sans section)', noChapters: 'Aucun chapitre référencé pour cette matière et ce trimestre.', freeTopic: 'Thème libre (facultatif)', freeTopicPh: 'Ex. : les fractions décimales, la phrase interrogative…', suggest: 'Suggestions', chapters: 'Chapitres', notions: 'Notions', verify: 'à vérifier', fromProgram: 'Programme', section: 'Section', domain: 'Domaine', difficulty: 'Difficulté', diff: ['Facile', 'Moyen', 'Difficile'], loading: 'Chargement du programme…', offline: 'Référentiel indisponible : listes de secours.', allT: 'Toute l\'année' },
  ar: { title: 'إنشاء امتحان', step: 'الخطوة', of: 'من', back: 'رجوع', next: 'التالي', cancel: 'إلغاء', finish: 'فتح في المحرّر', s1: 'اختر المستوى', s1d: 'اختر المرحلة ثم السنة الدراسية.', s2: 'اختر الشعبة', s2d: 'في الثانوي تتبع المواد والبرنامج الشعبة.', s3: 'اختر المادة', s3d: 'يتكيّف كتالوج التمارين والمدة ولغة الاختبار مع اختيارك.', s4: 'نوع التقييم والثلاثي', s4d: 'يخصّ الفرض هذا الثلاثي: لا يقترح الذكاء الاصطناعي إلا المفاهيم المدروسة.', s5: 'الدروس والمفاهيم', s5d: 'حدّد الدروس 📖 أو المفاهيم 🔖 المراد تقييمها. لا شيء؟ صف موضوعا حرّا.', s6: 'الاسم والمدة واللغة', s6d: 'يُقترح الاسم تلقائيا؛ المدة واللغة من البرنامج (قابلة للتعديل).', s7: 'ماذا تريد أن تضع في هذا الفرض؟', s7d: 'اضغط + لإضافة تمرين. الأنواع المقترحة تناسب المادة.', s8: 'ملخّص', s8d: 'تحقّق ثم افتح المحرّر: ستُنشأ التمارين الفارغة جاهزة للتعبئة (أو للتوليد بالذكاء الاصطناعي).', nameLbl: 'اسم الفرض', durLbl: 'المدة', langLbl: 'لغة الاختبار', kindLbl: 'نوع التقييم', online: 'إنجاز عبر الإنترنت', trimestre: t => `الثلاثي ${['الأول', 'الثاني', 'الثالث'][t - 1]}`, exercises: 'تمارين', points: 'نقاط', aiFill: 'توليد المحتوى بالذكاء الاصطناعي (5 رموز)', chars: 'حرفا', min: 'دق', noSection: 'جذع مشترك (بدون شعبة)', noChapters: 'لا توجد دروس مرجعية لهذه المادة وهذا الثلاثي.', freeTopic: 'موضوع حرّ (اختياري)', freeTopicPh: 'مثال: الكسور العشرية، الجملة الاستفهامية…', suggest: 'اقتراحات', chapters: 'الدروس', notions: 'المفاهيم', verify: 'للتحقّق', fromProgram: 'البرنامج', section: 'الشعبة', domain: 'المجال', difficulty: 'الصعوبة', diff: ['سهل', 'متوسط', 'صعب'], loading: 'جارٍ تحميل البرنامج…', offline: 'المرجع غير متاح: قوائم احتياطية.', allT: 'كامل السنة' },
  en: { title: 'Create an exam', step: 'Step', of: 'of', back: 'Back', next: 'Next', cancel: 'Cancel', finish: 'Open in the editor', s1: 'Choose the level', s1d: 'Select the cycle, then the class year.', s2: 'Choose the section', s2d: 'In secondary school, subjects and syllabus depend on the section.', s3: 'Choose the subject', s3d: 'The exercise catalogue, duration and test language adapt to your choice.', s4: 'Assessment type and term', s4d: 'The test covers this term: the AI only suggests notions already taught.', s5: 'Chapters and notions', s5d: 'Tick the chapters 📖 or notions 🔖 to assess. Nothing to tick? Describe a free topic.', s6: 'Name, duration and language', s6d: 'The name is suggested automatically; duration and language come from the syllabus (editable).', s7: 'What do you want in this test?', s7d: 'Press + to add an exercise. The suggested types match the subject.', s8: 'Summary', s8d: 'Check, then open the editor: empty exercises will be created, ready to fill in (or to generate with AI).', nameLbl: 'Test name', durLbl: 'Duration', langLbl: 'Test language', kindLbl: 'Assessment type', online: 'Online sitting', trimestre: t => `Term ${t}`, exercises: 'exercises', points: 'points', aiFill: 'Generate the content with AI (5 tokens)', chars: 'characters', min: 'min', noSection: 'Common core (no section)', noChapters: 'No chapter referenced for this subject and term.', freeTopic: 'Free topic (optional)', freeTopicPh: 'E.g.: decimal fractions, interrogative sentences…', suggest: 'Suggestions', chapters: 'Chapters', notions: 'Notions', verify: 'to verify', fromProgram: 'Syllabus', section: 'Section', domain: 'Domain', difficulty: 'Difficulty', diff: ['Easy', 'Medium', 'Hard'], loading: 'Loading the syllabus…', offline: 'Referential unavailable: fallback lists.', allT: 'Whole year' }
};
const WIZ = { step: 1, ui: 'fr', data: {}, levels: [], sections: [], subjects: [], chapters: [], domains: [], types: [], loading: false, offline: false };
const wizUi = () => WIZ_UI[WIZ.ui] || WIZ_UI.fr;
const wizL = (o) => (o && (o[WIZ.ui] || o.fr)) || '';
const wizN = (r) => r ? (r[`name_${WIZ.ui}`] || r.name || r.name_fr || r.name_ar || '') : '';
const wizLevel = () => WIZ.levels.find(l => l.id === WIZ.data.level_id) || null;
const wizSection = () => WIZ.sections.find(s => s.id === WIZ.data.section_id) || null;
const wizSubject = () => WIZ.subjects.find(s => s.subject_id === WIZ.data.subject_id) || null;
const wizHasSections = () => WIZ.sections.length > 0;
// Titre généré « {matière} – {type} – {trimestre} » dans la langue de l'épreuve
function wizAutoTitle() {
  const d = WIZ.data; const s = wizSubject(); const L = EVA_I18N[d.lang] || EVA_I18N.fr; const U = WIZ_UI[d.lang] || WIZ_UI.fr;
  const subj = s ? (s[`name_${d.lang}`] || s.name_fr) : ''; return [subj, L.kinds[d.kind] || L.kinds.controle, U.trimestre(d.trimester || 1)].filter(Boolean).join(' – ');
}
async function evaWizard(uiLang) {
  WIZ.ui = EVA_I18N[uiLang] ? uiLang : (localStorage.getItem('eva_ui_lang') || 'fr'); WIZ.step = 1;
  WIZ.data = { level_id: null, section_id: null, subject_id: null, level_subject_id: null, trimester: 1, chapter_ids: [], notion_ids: [], topic: '', domain: null, difficulty: 2, name: '', nameTouched: false, duration: 60, lang: 'fr', kind: 'controle', online: true, counts: {}, counts_tpl: {} };
  WIZ.sections = []; WIZ.subjects = []; WIZ.chapters = []; WIZ.domains = []; WIZ.types = [];
  WIZ.loading = true; wizRender();
  try { WIZ.levels = await curGet('/levels'); WIZ.offline = !WIZ.levels.length; } catch { WIZ.levels = []; WIZ.offline = true; }
  if (!WIZ.levels.length) WIZ.levels = WIZ_FALLBACK_LEVELS;
  WIZ.loading = false; wizRender();
}
async function wizPickLevel(id) {
  const d = WIZ.data; d.level_id = id; d.section_id = null; d.subject_id = null; d.level_subject_id = null; WIZ.subjects = []; WIZ.chapters = [];
  WIZ.loading = true; wizRender();
  try { WIZ.sections = id > 0 ? await curGet(`/levels/${id}/sections`) : []; } catch { WIZ.sections = []; }
  WIZ.loading = false; wizRender();
}
async function wizPickSection(id) { WIZ.data.section_id = id; WIZ.data.subject_id = null; WIZ.subjects = []; await wizLoadSubjects(); }
async function wizLoadSubjects() {
  const d = WIZ.data; WIZ.loading = true; wizRender();
  try { WIZ.subjects = d.level_id > 0 ? await curGet(`/subjects?levelId=${d.level_id}${d.section_id ? '&sectionId=' + d.section_id : ''}`) : []; } catch { WIZ.subjects = []; }
  if (!WIZ.subjects.length) { const lv = wizLevel(); WIZ.subjects = WIZ_FALLBACK_SUBJECTS.map(s => ({ ...s, duration_default: lv?.duration_default || 60 })); }
  WIZ.loading = false; wizRender();
}
async function wizPickSubject(subjectId) {
  const d = WIZ.data; d.subject_id = subjectId; const s = wizSubject(); if (!s) return;
  d.level_subject_id = s.level_subject_id || null; d.lang = s.default_lang || 'ar'; d.duration = s.duration_default || wizLevel()?.duration_default || 60; d.chapter_ids = []; d.notion_ids = []; d.domain = null;
  WIZ.loading = true; wizRender();
  try { [WIZ.domains, WIZ.types] = await Promise.all([s.subject_id > 0 ? curGet(`/domains?subjectId=${s.subject_id}`) : [], s.subject_id > 0 ? curGet(`/exercise-types?subjectId=${s.subject_id}`) : []]); } catch { WIZ.domains = []; WIZ.types = []; }
  if (!WIZ.types.length) WIZ.types = Object.keys(EVA_I18N.fr.types).map((k, i) => ({ id: -(i + 1), code: k, base_type: k, name_fr: EVA_I18N.fr.types[k], name_ar: EVA_I18N.ar.types[k], name_en: EVA_I18N.en.types[k], template: {} }));
  d.counts = {}; d.counts_tpl = {}; WIZ.types.forEach(t => { d.counts[t.code] = 0; d.counts_tpl[t.code] = t; });
  WIZ.loading = false; wizRender();
}
async function wizLoadChapters() {
  const d = WIZ.data; WIZ.loading = true; wizRender();
  try { WIZ.chapters = d.level_subject_id ? await curGet(`/chapters?levelSubjectId=${d.level_subject_id}&trimester=${d.trimester}`) : []; } catch { WIZ.chapters = []; }
  WIZ.loading = false; wizRender();
}
function wizToggle(kind, id) { const arr = WIZ.data[kind === 'ch' ? 'chapter_ids' : 'notion_ids']; const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); else arr.push(id); wizRender(); }
function wizGoto(step) {
  // Transitions avec chargements paresseux ; saute l'étape Section quand le niveau n'en a pas
  const d = WIZ.data; const cur = WIZ.step;
  if (step > cur) {
    if (cur === 1 && !wizHasSections()) { step = 3; }
    if ((cur === 1 || cur === 2) && step >= 3 && !WIZ.subjects.length) { WIZ.step = 3; wizLoadSubjects(); return; }
    if (cur === 4) { if (!d.nameTouched) d.name = wizAutoTitle(); WIZ.step = 5; wizLoadChapters(); return; }
    if (cur === 5 && !d.nameTouched) d.name = wizAutoTitle();
  } else if (step < cur && step === 2 && !wizHasSections()) step = 1;
  WIZ.step = step; wizRender();
}
function wizRender() {
  const u = wizUi(); const d = WIZ.data; const rtl = EVA_I18N[WIZ.ui].dir === 'rtl'; const total = 8; const dir = wizDir();
  let body = '', canNext = false;
  const card = (sel, onclick, icon, iconBg, title, sub, extra = '') => `<button onclick="${onclick}" class="w-full text-left flex items-center gap-3 border-2 rounded-xl p-3 transition ${sel ? 'border-blue-600 bg-blue-50 shadow' : 'border-gray-200 hover:border-blue-300 bg-white'} ${rtl ? 'flex-row-reverse text-right' : ''}">${icon ? `<span class="w-10 h-10 rounded-lg ${iconBg} text-white flex items-center justify-center text-lg flex-shrink-0"><i class="fas ${icon}"></i></span>` : ''}<span class="flex-1 min-w-0" dir="${dir}"><b class="block text-gray-800">${title}</b>${sub ? `<span class="text-xs text-gray-500">${sub}</span>` : ''}</span>${extra}</button>`;
  const pill = (sel, onclick, label) => `<button onclick="${onclick}" class="px-3 py-1.5 rounded-full border-2 text-sm font-semibold ${sel ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600'}">${label}</button>`;
  const verify = (r) => r?.needs_verification ? `<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle" title="${u.verify}"><i class="fas fa-triangle-exclamation"></i> ${u.verify}</span>` : '';
  const loading = WIZ.loading ? `<p class="text-center text-sm text-gray-400 py-6"><i class="fas fa-spinner fa-spin mr-1"></i>${u.loading}</p>` : '';
  if (WIZ.step === 1) {
    const groups = {}; WIZ.levels.forEach(l => { const k = l.cycle?.code || 'autre'; (groups[k] = groups[k] || { cycle: l.cycle, levels: [] }).levels.push(l); });
    const colors = ['bg-blue-600', 'bg-purple-600', 'bg-teal-600']; let i = 0;
    body = loading || Object.values(groups).map(g => `<div class="mb-4"><h4 class="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5" dir="${dir}"><i class="fas fa-graduation-cap mr-1"></i>${esc(wizN(g.cycle))}</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-2">${g.levels.map(l => card(d.level_id === l.id, `wizPickLevel(${l.id})`, null, '', `<span class="inline-flex items-center gap-2"><span class="w-8 h-8 rounded-lg ${colors[i % 3]} text-white flex items-center justify-center font-bold text-xs">${esc(l.legacy_code || l.code)}</span>${esc(wizN(l))}</span>`, '')).join('')}</div></div>${(i++, '')}`).join('') + (WIZ.offline ? `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2"><i class="fas fa-plug-circle-xmark mr-1"></i>${u.offline}</p>` : '');
    canNext = !!d.level_id && !WIZ.loading;
  } else if (WIZ.step === 2) {
    body = loading || `<div class="grid md:grid-cols-2 gap-2 max-w-2xl mx-auto">${WIZ.sections.map(s => card(d.section_id === s.id, `wizPickSection(${s.id})`, 'fa-sitemap', s.kind === 'filiere' ? 'bg-indigo-500' : 'bg-teal-600', esc(wizN(s)), s.kind === 'filiere' ? 'Filière' : 'Bac')).join('')}</div>`;
    canNext = !!d.section_id && !WIZ.loading;
  } else if (WIZ.step === 3) {
    const fam = {}; WIZ.subjects.forEach(s => (fam[s.family || 'autres'] = fam[s.family || 'autres'] || []).push(s));
    body = loading || Object.entries(fam).map(([fk, items]) => { const g = WIZ_FAMILY[fk] || WIZ_FAMILY.autres; return `<div class="mb-3"><h4 class="text-xs font-bold uppercase tracking-wide text-${g.color}-700 mb-1.5" dir="${dir}"><i class="fas ${g.icon} mr-1"></i>${wizL(g.label)}</h4><div class="grid md:grid-cols-3 gap-2">${items.map(s => card(d.subject_id === s.subject_id, `wizPickSubject(${s.subject_id})`, wizIcon(s.code)[0], wizIcon(s.code)[1], esc(wizN(s)) + verify(s), `${s.is_specialty ? '<i class="fas fa-star text-amber-500"></i> ' : ''}${s.duration_default} ${u.min} · ${EVA_I18N[s.default_lang]?.name || s.default_lang}`)).join('')}</div></div>`; }).join('');
    canNext = !!d.subject_id && !WIZ.loading;
  } else if (WIZ.step === 4) {
    body = `<div class="max-w-xl mx-auto space-y-4">
      <div><label class="${lblCls}">${u.kindLbl}</label><div class="flex flex-wrap gap-2">${Object.keys(EVA_I18N.fr.kinds).map(k => pill(d.kind === k, `WIZ.data.kind='${k}'; wizRender()`, esc(EVA_I18N[WIZ.ui].kinds[k]))).join('')}</div></div>
      <div><label class="${lblCls}">${u.s4}</label><div class="space-y-2">${[1, 2, 3].map(t => card(d.trimester === t, `WIZ.data.trimester=${t}; wizRender()`, 'fa-calendar', 'bg-amber-500', u.trimestre(t), '')).join('')}</div></div>
      ${WIZ.domains.length ? `<div><label class="${lblCls}">${u.domain}</label><div class="flex flex-wrap gap-2">${pill(!d.domain, `WIZ.data.domain=null; wizRender()`, '—')}${WIZ.domains.map(x => pill(d.domain === x.code, `WIZ.data.domain='${x.code}'; wizRender()`, `<span dir="${dir}">${esc(wizN(x))}</span>`)).join('')}</div></div>` : ''}
      <div><label class="${lblCls}">${u.difficulty}</label><div class="flex gap-2">${[1, 2, 3].map(n => pill(d.difficulty === n, `WIZ.data.difficulty=${n}; wizRender()`, u.diff[n - 1])).join('')}</div></div></div>`;
    canNext = true;
  } else if (WIZ.step === 5) {
    const chs = WIZ.chapters; const nSel = d.chapter_ids.length + d.notion_ids.length;
    const list = chs.length ? chs.map(ch => `<div class="border rounded-xl bg-white p-2.5 ${d.chapter_ids.includes(ch.id) ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200'}">
        <label class="flex items-center gap-2 cursor-pointer ${rtl ? 'flex-row-reverse text-right' : ''}"><input type="checkbox" class="w-4 h-4" ${d.chapter_ids.includes(ch.id) ? 'checked' : ''} onchange="wizToggle('ch',${ch.id})"><span class="text-base">📖</span><b class="flex-1 text-sm text-gray-800" dir="${dir}">${esc(wizN(ch))}</b><span class="text-[10px] px-1.5 py-0.5 rounded-full ${ch.trimester ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}">${ch.trimester ? 'T' + ch.trimester : u.allT}</span>${verify(ch)}</label>
        ${(ch.notions || []).length ? `<div class="mt-1.5 ${rtl ? 'mr-8' : 'ml-8'} flex flex-wrap gap-1.5">${ch.notions.map(n => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer ${d.notion_ids.includes(n.id) ? 'border-blue-500 bg-blue-100 text-blue-900' : 'border-gray-200 bg-gray-50 text-gray-700'}"><input type="checkbox" class="hidden" ${d.notion_ids.includes(n.id) ? 'checked' : ''} onchange="wizToggle('no',${n.id})">🔖 <span dir="${dir}">${esc(wizN(n))}</span></label>`).join('')}</div>` : ''}</div>`).join('')
      : `<div class="text-center border-2 border-dashed rounded-xl p-6 text-gray-500 text-sm"><i class="fas fa-book-open text-3xl text-gray-300 mb-2 block"></i>${u.noChapters}</div>`;
    body = loading || `<div class="max-w-2xl mx-auto space-y-3">
      <p class="text-xs text-gray-500" dir="${dir}"><i class="fas fa-circle-info mr-1"></i>${esc(wizN(wizLevel()))}${wizSection() ? ' · ' + esc(wizN(wizSection())) : ''} · <b>${esc(wizN(wizSubject()))}</b> · ${u.trimestre(d.trimester)} ${nSel ? `· <span class="text-blue-700 font-semibold">${nSel} ✓</span>` : ''}</p>
      <div class="space-y-2">${list}</div>
      <div><label class="${lblCls}">${u.freeTopic}</label><input class="${inputCls}" dir="${EVA_I18N[d.lang]?.dir || 'ltr'}" value="${esc(d.topic)}" placeholder="${esc(u.freeTopicPh)}" oninput="WIZ.data.topic=this.value"></div></div>`;
    canNext = !WIZ.loading;
  } else if (WIZ.step === 6) {
    body = `<div class="max-w-xl mx-auto space-y-4"><div><label class="${lblCls}">${u.nameLbl}</label><input id="wiz-name" class="${inputCls} text-lg font-bold" dir="${EVA_I18N[d.lang]?.dir || 'ltr'}" maxlength="60" value="${esc(d.name)}" oninput="WIZ.data.name=this.value; WIZ.data.nameTouched=true; document.getElementById('wiz-next').disabled=!this.value.trim(); document.getElementById('wiz-chars').textContent=this.value.length+' / 60 ${u.chars}'"><p id="wiz-chars" class="text-[11px] text-gray-400 text-right">${d.name.length} / 60 ${u.chars}</p><button onclick="WIZ.data.nameTouched=false; WIZ.data.name=wizAutoTitle(); wizRender()" class="text-xs text-blue-700 underline"><i class="fas fa-rotate mr-1"></i>${esc(wizAutoTitle())}</button></div>
    <div><label class="${lblCls}">${u.durLbl} <span class="text-[10px] font-normal text-gray-400">(${u.fromProgram} : ${wizSubject()?.duration_default || 60} ${u.min})</span></label><div class="flex flex-wrap gap-2">${[...new Set([15, 30, 45, 60, 90, 120, 180, d.duration])].sort((a, b) => a - b).map(m => pill(d.duration === m, `WIZ.data.duration=${m}; wizRender()`, `${m} ${u.min}`)).join('')}</div></div>
    <div><label class="${lblCls}">${u.langLbl} <span class="text-[10px] font-normal text-gray-400">(${u.fromProgram} : ${EVA_I18N[wizSubject()?.default_lang]?.name || ''})</span></label><div class="flex gap-2">${Object.entries(EVA_I18N).map(([k, v]) => pill(d.lang === k, `WIZ.data.lang='${k}'; if(!WIZ.data.nameTouched) WIZ.data.name=wizAutoTitle(); wizRender()`, v.name)).join('')}</div></div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.online ? 'checked' : ''} onchange="WIZ.data.online=this.checked" class="w-4 h-4"> ${u.online}</label></div>`; canNext = !!d.name.trim();
  } else if (WIZ.step === 7) {
    const icons = { mcq: ['fa-list-check', 'bg-green-600'], truefalse: ['fa-square-check', 'bg-teal-600'], match: ['fa-right-left', 'bg-pink-600'], strike: ['fa-strikethrough', 'bg-red-500'], fill: ['fa-pen-to-square', 'bg-cyan-600'], conjug: ['fa-spell-check', 'bg-indigo-600'], quote: ['fa-quote-left', 'bg-amber-600'], open: ['fa-pen-fancy', 'bg-purple-600'] };
    body = `<div class="space-y-2 max-w-xl mx-auto">${WIZ.types.map(t => { const ic = icons[t.code] || icons[t.base_type] || ['fa-puzzle-piece', 'bg-slate-600']; return `<div class="flex items-center gap-3 border rounded-xl p-2.5 bg-white ${rtl ? 'flex-row-reverse' : ''}"><span class="w-9 h-9 rounded-lg ${ic[1]} text-white flex items-center justify-center"><i class="fas ${ic[0]}"></i></span><span class="flex-1 min-w-0" dir="${dir}"><b class="text-sm text-gray-800 block truncate">${esc(wizN(t))}</b>${t.base_type !== t.code ? `<span class="text-[10px] text-gray-400">${esc(EVA_I18N[WIZ.ui].types[t.base_type] || t.base_type)}</span>` : ''}</span><div class="flex items-center gap-1"><button onclick="WIZ.data.counts['${t.code}']=Math.max(0,WIZ.data.counts['${t.code}']-1); wizRender()" class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">−</button><span class="w-6 text-center font-bold">${d.counts[t.code] || 0}</span><button onclick="WIZ.data.counts['${t.code}']=Math.min(10,(WIZ.data.counts['${t.code}']||0)+1); wizRender()" class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">+</button></div></div>`; }).join('')}</div>`;
    canNext = Object.values(d.counts).some(n => n > 0);
  } else {
    const s = wizSubject(); const n = Object.values(d.counts).reduce((a, b) => a + b, 0); const L = EVA_I18N[WIZ.ui];
    const chNames = WIZ.chapters.filter(c => d.chapter_ids.includes(c.id)).map(c => '📖 ' + wizN(c)).concat(WIZ.chapters.flatMap(c => (c.notions || []).filter(x => d.notion_ids.includes(x.id)).map(x => '🔖 ' + wizN(x))));
    body = `<div class="max-w-xl mx-auto bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-2xl p-5 space-y-2 text-sm">
    <p class="text-2xl font-black text-blue-900" dir="${EVA_I18N[d.lang]?.dir || 'ltr'}">${esc(d.name)}</p>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1"><span class="text-gray-500">${u.s1}</span><b dir="${dir}">${esc(wizN(wizLevel()))}</b>${wizSection() ? `<span class="text-gray-500">${u.section}</span><b dir="${dir}">${esc(wizN(wizSection()))}</b>` : ''}<span class="text-gray-500">${u.s3}</span><b dir="${dir}">${esc(wizN(s))}</b><span class="text-gray-500">${u.kindLbl}</span><b>${esc(L.kinds[d.kind])}</b><span class="text-gray-500">${u.s4.split(' ')[0]}</span><b>${u.trimestre(d.trimester)}</b>${d.domain ? `<span class="text-gray-500">${u.domain}</span><b dir="${dir}">${esc(wizN(WIZ.domains.find(x => x.code === d.domain)))}</b>` : ''}<span class="text-gray-500">${u.difficulty}</span><b>${u.diff[d.difficulty - 1]}</b><span class="text-gray-500">${u.durLbl}</span><b>${d.duration} ${u.min}</b><span class="text-gray-500">${u.langLbl}</span><b>${EVA_I18N[d.lang].name}</b></div>
    ${chNames.length || d.topic ? `<div class="border-t pt-2 text-xs" dir="${dir}"><b>${u.s5} :</b> ${chNames.map(esc).join(' · ')}${d.topic ? (chNames.length ? ' · ' : '') + '✏️ ' + esc(d.topic) : ''}</div>` : ''}
    <div class="border-t pt-2"><b>${n} ${u.exercises}</b> · ${Object.entries(d.counts).filter(([, v]) => v).map(([k, v]) => `${v} × ${esc(wizN(d.counts_tpl[k]) || k)}`).join(' · ')}</div>
    <label class="flex items-center gap-2 pt-2"><input type="checkbox" id="wiz-ai" class="w-4 h-4"> <i class="fas fa-wand-magic-sparkles text-purple-600"></i> ${u.aiFill}</label></div>`; canNext = true;
  }
  const html = `<div class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" id="wiz-modal" dir="${rtl ? 'rtl' : 'ltr'}">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
      <div class="px-6 pt-5 pb-3">
        <div class="flex items-center justify-between"><p class="text-[11px] font-bold tracking-widest text-blue-700 uppercase">${u.step} ${WIZ.step} ${u.of} ${total}</p><div class="flex gap-1">${Object.entries(EVA_I18N).map(([k, v]) => `<button onclick="WIZ.ui='${k}'; localStorage.setItem('eva_ui_lang','${k}'); curInvalidate(); wizReloadLang()" class="px-2 py-0.5 rounded text-xs ${WIZ.ui === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${k.toUpperCase()}</button>`).join('')}</div></div>
        <h2 class="text-2xl font-black text-gray-900">${u['s' + WIZ.step]}</h2><p class="text-sm text-gray-500">${u['s' + WIZ.step + 'd']}</p>
        <div class="flex gap-1.5 mt-2">${Array.from({ length: total }, (_, i) => `<span class="w-2 h-2 rounded-full ${i < WIZ.step ? 'bg-blue-600' : 'bg-gray-200'} ${i === 1 && !wizHasSections() && d.level_id ? 'opacity-30' : ''}"></span>`).join('')}</div>
      </div>
      <div class="px-6 py-3 overflow-y-auto flex-1">${body}</div>
      <div class="px-6 py-3 border-t flex items-center justify-between">
        <button onclick="${WIZ.step === 1 ? 'wizClose()' : `wizGoto(${WIZ.step - 1})`}" class="${btnSecondary}"><i class="fas fa-arrow-${rtl ? 'right' : 'left'} mr-1"></i> ${WIZ.step === 1 ? u.cancel : u.back}</button>
        <button id="wiz-next" onclick="${WIZ.step === total ? 'wizFinish()' : `wizGoto(${WIZ.step + 1})`}" class="${btnPrimary} ${WIZ.step === total ? 'bg-green-600 hover:bg-green-700' : ''}" ${canNext ? '' : 'disabled'}>${WIZ.step === total ? '<i class="fas fa-check mr-1"></i> ' + u.finish : u.next + ' <i class="fas fa-arrow-' + (rtl ? 'left' : 'right') + ' ml-1"></i>'}</button>
      </div></div></div>`;
  document.getElementById('wiz-modal')?.remove(); document.body.insertAdjacentHTML('beforeend', html);
  if (WIZ.step === 6) setTimeout(() => document.getElementById('wiz-name')?.focus(), 50);
}
// Changement de langue d'interface : les libellés trilingues sont déjà dans les lignes (name_xx) → simple re-rendu
function wizReloadLang() { wizRender(); }
function wizClose() { document.getElementById('wiz-modal')?.remove(); }
async function wizFinish() {
  const d = WIZ.data; const s = wizSubject(); const useAi = document.getElementById('wiz-ai')?.checked; const L = EVA_I18N[d.lang]; const lv = wizLevel();
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  // Matière de l'école : mapping du référentiel (school_subject_id) sinon recherche souple par nom
  let subj = s?.school_subject_id ? App.cache.subjects.find(x => String(x.id) === String(s.school_subject_id)) : null;
  if (!subj) { const want = (s?.name_fr || '').toLowerCase(); subj = App.cache.subjects.find(x => { const nn = (x.name || '').toLowerCase(); return (want && nn.includes(want.split(' ')[0])) || (want.startsWith('math') && /math|رياض/.test(nn)) || (want === 'arabe' && /arab|عرب/.test(nn)) || (want === 'anglais' && /angl|engl|إنج/.test(nn)); }); }
  const isLang = s?.family === 'langues';
  const secs = [];
  if (isLang) { secs.push({ title: L.sections.reading, subtitle: L.sections.readingSub, text_title: '', text: '', items: [] }); secs.push({ title: L.sections.lang, subtitle: '', text: null, items: [] }); secs.push({ title: L.sections.writing, subtitle: '', text: null, items: [] }); }
  else secs.push({ title: L.sections.exercises, subtitle: '', text: null, items: [] });
  const where = { match: 0, strike: 0, truefalse: 0, mcq: 0, quote: 0, fill: Math.min(1, secs.length - 1), conjug: Math.min(1, secs.length - 1), open: secs.length - 1 };
  const blank = { mcq: { question: '', options: ['', '', ''], correct: 0 }, truefalse: { question: '', correct: 0 }, match: { pairs: [{ left: '', right: 0 }], rights: ['', '', ''] }, strike: { subject: '', options: [{ text: '', false: false }, { text: '', false: true }] }, fill: { text: '', words: [], blanks: [{ answer: '' }] }, conjug: { text: '', blanks: [{ verb: '', answer: '' }] }, quote: { question: '', answer: '' }, open: { prompt: '', criteria: [''], lines: 10 } };
  const n = Object.values(d.counts).reduce((a, b) => a + b, 0) || 1; const scale = s?.grading_scale || 20; const pts = Math.max(0.5, Math.round(scale / n * 2) / 2);
  for (const [code, cnt] of Object.entries(d.counts)) for (let i = 0; i < cnt; i++) {
    const t = d.counts_tpl[code] || {}; const base = EVA_I18N.fr.types[t.base_type] ? t.base_type : (EVA_I18N.fr.types[code] ? code : 'open'); const tpl = t.template || {};
    const item = { type: base, consigne: (tpl.consigne && (tpl.consigne[d.lang] || tpl.consigne.fr)) || L.consignes[base], points: base === 'open' ? Math.max(pts, 4) : pts, ...JSON.parse(JSON.stringify(blank[base])) };
    if (base !== code) { item.template_code = code; if (tpl.criteria) item.criteria = [...tpl.criteria]; if (tpl.lines) item.lines = tpl.lines; if (tpl.image) item.image_slot = true; if (tpl.grid) item.grid = true; if (tpl.table) item.table = true; }
    secs[isLang ? (where[base] ?? 0) : 0].items.push(item);
  }
  // Remise à l'échelle exacte sur le barème (dernier item absorbe l'arrondi)
  const items = secs.flatMap(x => x.items); const tot = items.reduce((a, b) => a + b.points, 0); if (items.length && tot !== scale) items[items.length - 1].points = Math.max(0.5, Math.round((items[items.length - 1].points + scale - tot) * 2) / 2);
  const level = lv?.legacy_code || lv?.code || '5AP';
  const chNames = WIZ.chapters.filter(c => d.chapter_ids.includes(c.id)).map(c => c.name_fr).concat(WIZ.chapters.flatMap(c => (c.notions || []).filter(x => d.notion_ids.includes(x.id)).map(x => x.name_fr)));
  wizClose();
  evaNew({ title: d.name, kind: d.kind, level, lang: d.lang, trimester: d.trimester, duration_min: d.duration, subject_id: subj?.id || '', online: d.online, folder: `${s?.name_fr || ''} / T${d.trimester}`, header: {}, sections: secs,
    cur_level_subject_id: d.level_subject_id, cur_chapter_ids: [...d.chapter_ids], cur_notion_ids: [...d.notion_ids],
    source: { wizard: { level_id: d.level_id, level_code: lv?.code, section_id: d.section_id, section_label: wizSection()?.name_fr || null, subject_code: s?.code, subject_label: s?.name_fr, subject_label_ar: s?.name_ar, subject_label_en: s?.name_en, trimester: d.trimester, domain: d.domain, difficulty: d.difficulty, topic: d.topic, chapters: chNames, counts: d.counts } } });
  toast(`${n} ${wizUi().exercises} · ${EVA_I18N[d.lang].name}`);
  if (useAi) setTimeout(() => evaAiModal(), 400);
}

// Entrée de menu « Créer un examen » : page d'accueil de l'assistant (langue mémorisée, reprise des brouillons)
VIEWS.examwizard = async function(el) {
  if (!isStaff()) { navigate('evaluations'); return; }
  const ui = localStorage.getItem('eva_ui_lang') || 'fr'; const u = WIZ_UI[ui] || WIZ_UI.fr;
  let drafts = []; try { const r = (await api.get('/evaluations')).data; drafts = (r.items || []).filter(e => e.status === 'draft').slice(0, 6); } catch {}
  el.innerHTML = pageHeader(u.title + ' <span class="text-gray-400 text-base font-normal">· إنشاء امتحان</span>', 'fa-wand-sparkles',
    `<div class="flex gap-1">${Object.keys(EVA_I18N).map(k => `<button onclick="localStorage.setItem('eva_ui_lang','${k}'); render()" class="px-2 py-1 rounded text-xs ${ui === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${k.toUpperCase()}</button>`).join('')}</div>`) + `
  <div class="grid md:grid-cols-3 gap-4 mb-6">
    <button onclick="evaWizard('${ui}')" class="text-left bg-gradient-to-br from-blue-700 to-blue-900 text-white rounded-2xl p-6 shadow-lg hover:shadow-xl transition"><i class="fas fa-wand-sparkles text-3xl mb-3"></i><h3 class="text-xl font-black">${u.title}</h3><p class="text-sm text-blue-100 mt-1">${u.s1} → ${u.s2} → ${u.s3} → …</p></button>
    <button onclick="evaTemplatesModal()" class="text-left bg-white rounded-2xl p-6 shadow hover:shadow-lg transition border"><i class="fas fa-folder-open text-3xl mb-3 text-amber-500"></i><h3 class="text-lg font-bold text-gray-800">Modèles</h3><p class="text-sm text-gray-500 mt-1">Repartir d'un modèle enregistré ou intégré</p></button>
    <button onclick="navigate('bank')" class="text-left bg-white rounded-2xl p-6 shadow hover:shadow-lg transition border"><i class="fas fa-layer-group text-3xl mb-3 text-blue-600"></i><h3 class="text-lg font-bold text-gray-800">Bibliothèque</h3><p class="text-sm text-gray-500 mt-1">Composer à partir d'exercices existants</p></button>
  </div>
  ${drafts.length ? `<h3 class="font-bold text-gray-700 mb-2"><i class="fas fa-pen-ruler mr-1"></i>Brouillons à terminer</h3><div class="grid md:grid-cols-3 gap-3">${drafts.map(e => `<button onclick="evaEdit(${e.id})" class="text-left bg-white border rounded-xl p-4 hover:border-blue-400"><b class="block truncate">${esc(e.title)}</b><span class="text-xs text-gray-500">${esc(e.level)} · ${e.items_count} exercices · /${e.total_points}</span></button>`).join('')}</div>` : ''}`;
};
