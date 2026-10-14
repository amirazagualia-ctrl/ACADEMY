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

/* ================= Assistant « Créer un examen » (8 étapes) ================= */
const WIZ_SUBJECTS = {
  langues: { label: { fr: 'Langues', ar: 'اللغات', en: 'Languages' }, icon: 'fa-language', color: 'purple', items: [
    { key: 'arabe', lang: 'ar', label: { fr: 'Arabe', ar: 'العربية', en: 'Arabic' }, icon: 'fa-language', color: 'bg-purple-600' },
    { key: 'francais', lang: 'fr', label: { fr: 'Français', ar: 'الفرنسية', en: 'French' }, icon: 'fa-book-open', color: 'bg-cyan-500' },
    { key: 'anglais', lang: 'en', label: { fr: 'Anglais', ar: 'الإنجليزية', en: 'English' }, icon: 'fa-globe', color: 'bg-pink-600' }
  ] },
  sciences: { label: { fr: 'Sciences', ar: 'العلوم', en: 'Sciences' }, icon: 'fa-flask', color: 'blue', items: [
    { key: 'maths', lang: 'ar', label: { fr: 'Mathématiques', ar: 'الرياضيات', en: 'Mathematics' }, icon: 'fa-calculator', color: 'bg-blue-600', subs: [{ key: 'calcul', label: { fr: 'Calcul mental', ar: 'حساب ذهني', en: 'Mental maths' } }, { key: 'normal', label: { fr: 'Épreuve normale', ar: 'اختبار عادي', en: 'Standard test' } }, { key: 'situations', label: { fr: 'Situations-problèmes', ar: 'وضعيات مشكل', en: 'Problem solving' } }] },
    { key: 'eveil', lang: 'ar', label: { fr: 'Éveil scientifique', ar: 'الإيقاظ العلمي', en: 'Science awareness' }, icon: 'fa-seedling', color: 'bg-green-600' }
  ] },
  humaines: { label: { fr: 'Sciences humaines', ar: 'المواد الاجتماعية', en: 'Humanities' }, icon: 'fa-people-group', color: 'amber', items: [
    { key: 'histoire', lang: 'ar', label: { fr: 'Histoire', ar: 'التاريخ', en: 'History' }, icon: 'fa-landmark', color: 'bg-amber-800' },
    { key: 'geo', lang: 'ar', label: { fr: 'Géographie', ar: 'الجغرافيا', en: 'Geography' }, icon: 'fa-earth-africa', color: 'bg-green-700' },
    { key: 'islamique', lang: 'ar', label: { fr: 'Éducation islamique', ar: 'التربية الإسلامية', en: 'Islamic education' }, icon: 'fa-mosque', color: 'bg-teal-700' },
    { key: 'civique', lang: 'ar', label: { fr: 'Éducation civique', ar: 'التربية المدنية', en: 'Civic education' }, icon: 'fa-scale-balanced', color: 'bg-indigo-600' }
  ] }
};
const WIZ_CYCLES = [
  { key: 'primaire', label: { fr: 'Primaire', ar: 'ابتدائي', en: 'Primary' }, sub: { fr: 'Disponible', ar: 'متاح', en: 'Available' }, icon: 'fa-graduation-cap', color: 'bg-blue-600', levels: ['1AP', '2AP', '3AP', '4AP', '5AP', '6AP'] },
  { key: 'base', label: { fr: 'Collège (base)', ar: 'إعدادي', en: 'Middle school' }, sub: { fr: 'Disponible', ar: 'متاح', en: 'Available' }, icon: 'fa-building-columns', color: 'bg-purple-600', levels: ['7AB', '8AB', '9AB'] },
  { key: 'secondaire', label: { fr: 'Secondaire', ar: 'ثانوي', en: 'Secondary' }, sub: { fr: 'Disponible', ar: 'متاح', en: 'Available' }, icon: 'fa-school', color: 'bg-teal-600', levels: ['1AS', '2AS', '3AS', '4AS'] }
];
const WIZ_UI = {
  fr: { title: 'Créer un examen', step: 'Étape', of: 'sur', back: 'Retour', next: 'Suivant', cancel: 'Annuler', finish: 'Ouvrir dans l\'éditeur', s1: 'Choisir le cycle', s1d: 'Sélectionnez le cycle scolaire.', s2: 'Choisir l\'année', s2d: 'Choisissez le niveau de la classe.', s3: 'Choisir la matière', s3d: 'Le catalogue d\'exercices et la langue de l\'épreuve s\'adaptent à votre choix.', s4: 'Pour quel trimestre ?', s4d: 'Le devoir porte sur ce trimestre : l\'IA ne propose que les notions déjà introduites.', s5: 'Choisir le type d\'épreuve', s5d: 'Sélectionnez le domaine ou le type de devoir.', s6: 'Quel est le nom du devoir ?', s6d: 'Écrivez un nom simple, puis choisissez la durée.', s7: 'Que voulez-vous mettre dans ce devoir ?', s7d: 'Appuyez sur + pour ajouter un exercice. Vous pourrez tout modifier après.', s8: 'Récapitulatif', s8d: 'Vérifiez puis ouvrez l\'éditeur : les exercices vides seront créés, prêts à remplir (ou à générer avec l\'IA).', nameLbl: 'Nom du devoir', durLbl: 'Durée', langLbl: 'Langue de l\'épreuve', kindLbl: 'Type d\'évaluation', online: 'Passation en ligne', trimestre: t => `${t}${t === 1 ? 'er' : 'ème'} trimestre`, exercises: 'exercices', points: 'points', aiFill: 'Générer le contenu avec l\'IA (5 jetons)', chars: 'caractères' },
  ar: { title: 'إنشاء امتحان', step: 'الخطوة', of: 'من', back: 'رجوع', next: 'التالي', cancel: 'إلغاء', finish: 'فتح في المحرّر', s1: 'اختر المرحلة', s1d: 'اختر المرحلة الدراسية.', s2: 'اختر السنة', s2d: 'اختر مستوى القسم.', s3: 'اختر المادة', s3d: 'يتكيّف كتالوج التمارين ولغة الاختبار مع اختيارك.', s4: 'لأي ثلاثي؟', s4d: 'يخصّ الفرض هذا الثلاثي: لا يقترح الذكاء الاصطناعي إلا المفاهيم المدروسة.', s5: 'اختر نوع الاختبار', s5d: 'اختر المجال أو نوع الفرض.', s6: 'ما اسم الفرض؟', s6d: 'اكتب اسما بسيطا ثم اختر المدة.', s7: 'ماذا تريد أن تضع في هذا الفرض؟', s7d: 'اضغط + لإضافة تمرين. يمكنك تعديل كل شيء لاحقا.', s8: 'ملخّص', s8d: 'تحقّق ثم افتح المحرّر: ستُنشأ التمارين الفارغة جاهزة للتعبئة (أو للتوليد بالذكاء الاصطناعي).', nameLbl: 'اسم الفرض', durLbl: 'المدة', langLbl: 'لغة الاختبار', kindLbl: 'نوع التقييم', online: 'إنجاز عبر الإنترنت', trimestre: t => `الثلاثي ${['الأول', 'الثاني', 'الثالث'][t - 1]}`, exercises: 'تمارين', points: 'نقاط', aiFill: 'توليد المحتوى بالذكاء الاصطناعي (5 رموز)', chars: 'حرفا' },
  en: { title: 'Create an exam', step: 'Step', of: 'of', back: 'Back', next: 'Next', cancel: 'Cancel', finish: 'Open in the editor', s1: 'Choose the cycle', s1d: 'Select the school cycle.', s2: 'Choose the year', s2d: 'Choose the class level.', s3: 'Choose the subject', s3d: 'The exercise catalogue and the test language adapt to your choice.', s4: 'Which term?', s4d: 'The test covers this term: the AI only suggests notions already taught.', s5: 'Choose the test type', s5d: 'Select the domain or type of test.', s6: 'What is the name of the test?', s6d: 'Write a simple name, then pick the duration.', s7: 'What do you want in this test?', s7d: 'Press + to add an exercise. You can edit everything afterwards.', s8: 'Summary', s8d: 'Check, then open the editor: empty exercises will be created, ready to fill in (or to generate with AI).', nameLbl: 'Test name', durLbl: 'Duration', langLbl: 'Test language', kindLbl: 'Assessment type', online: 'Online sitting', trimestre: t => `Term ${t}`, exercises: 'exercises', points: 'points', aiFill: 'Generate the content with AI (5 tokens)', chars: 'characters' }
};
const WIZ = { step: 1, ui: 'fr', data: {} };
const wizUi = () => WIZ_UI[WIZ.ui] || WIZ_UI.fr;
const wizL = (o) => (o && (o[WIZ.ui] || o.fr)) || '';

function evaWizard(uiLang) {
  WIZ.ui = EVA_I18N[uiLang] ? uiLang : (localStorage.getItem('eva_ui_lang') || 'fr'); WIZ.step = 1;
  WIZ.data = { cycle: null, level: null, subject: null, sub: null, trimester: 1, name: '', duration: 60, lang: 'fr', kind: 'controle', online: true, counts: {} };
  Object.keys(EVA_I18N.fr.types).forEach(k => { WIZ.data.counts[k] = 0; });
  wizRender();
}
function wizRender() {
  const u = wizUi(); const d = WIZ.data; const rtl = EVA_I18N[WIZ.ui].dir === 'rtl'; const total = 8;
  let body = '', canNext = false;
  const card = (sel, onclick, icon, iconBg, title, sub, extra = '') => `<button onclick="${onclick}" class="w-full text-left flex items-center gap-3 border-2 rounded-xl p-3 transition ${sel ? 'border-blue-600 bg-blue-50 shadow' : 'border-gray-200 hover:border-blue-300 bg-white'} ${rtl ? 'flex-row-reverse text-right' : ''}">${icon ? `<span class="w-10 h-10 rounded-lg ${iconBg} text-white flex items-center justify-center text-lg flex-shrink-0"><i class="fas ${icon}"></i></span>` : ''}<span class="flex-1 min-w-0"><b class="block text-gray-800">${title}</b>${sub ? `<span class="text-xs text-gray-500">${sub}</span>` : ''}</span>${extra}</button>`;
  if (WIZ.step === 1) { body = `<div class="space-y-3 max-w-md mx-auto">${WIZ_CYCLES.map(c => card(d.cycle === c.key, `WIZ.data.cycle='${c.key}'; WIZ.data.level=null; wizRender()`, c.icon, c.color, wizL(c.label), wizL(c.sub))).join('')}</div>`; canNext = !!d.cycle; }
  else if (WIZ.step === 2) { const cyc = WIZ_CYCLES.find(c => c.key === d.cycle); const colors = ['bg-gray-500', 'bg-teal-600', 'bg-purple-500', 'bg-rose-500', 'bg-blue-600', 'bg-amber-600']; body = `<div class="grid grid-cols-2 gap-3 max-w-xl mx-auto">${cyc.levels.map((l, i) => card(d.level === l, `WIZ.data.level='${l}'; wizRender()`, null, '', `<span class="inline-flex items-center gap-2"><span class="w-8 h-8 rounded-lg ${colors[i % 6]} text-white flex items-center justify-center font-bold">${l.replace(/\D/g, '')}</span>${esc(EVA_I18N[WIZ.ui].levels[l] || l)}</span>`, '')).join('')}</div>`; canNext = !!d.level; }
  else if (WIZ.step === 3) { body = Object.entries(WIZ_SUBJECTS).map(([gk, g]) => `<div class="mb-3"><h4 class="text-xs font-bold uppercase tracking-wide text-${g.color}-700 mb-1.5"><i class="fas ${g.icon} mr-1"></i>${wizL(g.label)}</h4><div class="grid md:grid-cols-3 gap-2">${g.items.map(s => card(d.subject === s.key, `wizPickSubject('${s.key}')`, s.icon, s.color, wizL(s.label), '')).join('')}</div></div>`).join(''); canNext = !!d.subject; }
  else if (WIZ.step === 4) { body = `<div class="space-y-3 max-w-xl mx-auto">${[1, 2, 3].map(t => card(d.trimester === t, `WIZ.data.trimester=${t}; wizRender()`, 'fa-calendar', 'bg-amber-500', u.trimestre(t), '')).join('')}</div>`; canNext = true; }
  else if (WIZ.step === 5) { const s = wizSubject(); const subs = s?.subs || [{ key: 'normal', label: { fr: 'Épreuve normale', ar: 'اختبار عادي', en: 'Standard test' } }, { key: 'dictee', label: { fr: 'Dictée / Langue', ar: 'إملاء / قواعد', en: 'Dictation / Language' } }, { key: 'lecture', label: { fr: 'Lecture - compréhension', ar: 'فهم المقروء', en: 'Reading comprehension' } }, { key: 'production', label: { fr: 'Production écrite', ar: 'إنتاج كتابي', en: 'Writing' } }]; body = `<div class="space-y-3 max-w-xl mx-auto">${subs.map(x => card(d.sub === x.key, `WIZ.data.sub='${x.key}'; wizRender()`, 'fa-clipboard-list', 'bg-blue-600', wizL(x.label), '')).join('')}<div class="pt-2"><label class="${lblCls}">${u.kindLbl}</label><select class="${inputCls}" onchange="WIZ.data.kind=this.value">${Object.keys(EVA_I18N.fr.kinds).map(k => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${esc(EVA_I18N[WIZ.ui].kinds[k])}</option>`).join('')}</select></div></div>`; canNext = !!d.sub; }
  else if (WIZ.step === 6) { body = `<div class="max-w-xl mx-auto space-y-4"><div><label class="${lblCls}">${u.nameLbl}</label><input id="wiz-name" class="${inputCls} text-lg font-bold" maxlength="60" value="${esc(d.name)}" oninput="WIZ.data.name=this.value; document.getElementById('wiz-next').disabled=!this.value.trim(); document.getElementById('wiz-chars').textContent=this.value.length+' / 60 ${u.chars}'"><p id="wiz-chars" class="text-[11px] text-gray-400 text-right">${d.name.length} / 60 ${u.chars}</p></div>
    <div><label class="${lblCls}">${u.durLbl}</label><div class="flex flex-wrap gap-2">${[10, 15, 30, 45, 60, 90, 120, 180].map(m => `<button onclick="WIZ.data.duration=${m}; wizRender()" class="px-3 py-1.5 rounded-full border-2 text-sm font-semibold ${d.duration === m ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600'}">${m} ${u.min || 'min'}</button>`).join('')}</div></div>
    <div><label class="${lblCls}">${u.langLbl}</label><div class="flex gap-2">${Object.entries(EVA_I18N).map(([k, v]) => `<button onclick="WIZ.data.lang='${k}'; wizRender()" class="px-3 py-1.5 rounded-full border-2 text-sm font-semibold ${d.lang === k ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-600'}">${v.name}</button>`).join('')}</div></div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.online ? 'checked' : ''} onchange="WIZ.data.online=this.checked" class="w-4 h-4"> ${u.online}</label></div>`; canNext = !!d.name.trim(); }
  else if (WIZ.step === 7) { const icons = { mcq: ['fa-list-check', 'bg-green-600'], truefalse: ['fa-square-check', 'bg-teal-600'], match: ['fa-right-left', 'bg-pink-600'], strike: ['fa-strikethrough', 'bg-red-500'], fill: ['fa-pen-to-square', 'bg-cyan-600'], conjug: ['fa-spell-check', 'bg-indigo-600'], quote: ['fa-quote-left', 'bg-amber-600'], open: ['fa-pen-fancy', 'bg-purple-600'] }; body = `<div class="space-y-2 max-w-xl mx-auto">${Object.keys(EVA_I18N.fr.types).map(k => `<div class="flex items-center gap-3 border rounded-xl p-2.5 bg-white ${rtl ? 'flex-row-reverse' : ''}"><span class="w-9 h-9 rounded-lg ${icons[k][1]} text-white flex items-center justify-center"><i class="fas ${icons[k][0]}"></i></span><b class="flex-1 text-sm text-gray-800">${esc(EVA_I18N[WIZ.ui].types[k])}</b><div class="flex items-center gap-1"><button onclick="WIZ.data.counts['${k}']=Math.max(0,WIZ.data.counts['${k}']-1); wizRender()" class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">−</button><span class="w-6 text-center font-bold">${d.counts[k]}</span><button onclick="WIZ.data.counts['${k}']=Math.min(10,WIZ.data.counts['${k}']+1); wizRender()" class="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-bold">+</button></div></div>`).join('')}</div>`; canNext = Object.values(d.counts).some(n => n > 0); }
  else { const s = wizSubject(); const n = Object.values(d.counts).reduce((a, b) => a + b, 0); const L = EVA_I18N[WIZ.ui]; body = `<div class="max-w-xl mx-auto bg-gradient-to-br from-blue-50 to-white border-2 border-blue-200 rounded-2xl p-5 space-y-2 text-sm">
    <p class="text-2xl font-black text-blue-900">${esc(d.name)}</p>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1"><span class="text-gray-500">${u.s1}</span><b>${wizL(WIZ_CYCLES.find(c => c.key === d.cycle)?.label)}</b><span class="text-gray-500">${u.s2}</span><b>${esc(L.levels[d.level])}</b><span class="text-gray-500">${u.s3}</span><b>${wizL(s?.label)}${d.sub ? ' · ' + wizL((s?.subs || []).find(x => x.key === d.sub)?.label || { fr: d.sub })  : ''}</b><span class="text-gray-500">${u.s4}</span><b>${u.trimestre(d.trimester)}</b><span class="text-gray-500">${u.kindLbl}</span><b>${esc(L.kinds[d.kind])}</b><span class="text-gray-500">${u.durLbl}</span><b>${d.duration} ${u.min || 'min'}</b><span class="text-gray-500">${u.langLbl}</span><b>${EVA_I18N[d.lang].name}</b></div>
    <div class="border-t pt-2"><b>${n} ${u.exercises}</b> · ${Object.entries(d.counts).filter(([, v]) => v).map(([k, v]) => `${v} × ${esc(evaTypeShort(k, { lang: WIZ.ui }))}`).join(' · ')}</div>
    <label class="flex items-center gap-2 pt-2"><input type="checkbox" id="wiz-ai" class="w-4 h-4"> <i class="fas fa-wand-magic-sparkles text-purple-600"></i> ${u.aiFill}</label></div>`; canNext = true; }
  const html = `<div class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4" id="wiz-modal" dir="${rtl ? 'rtl' : 'ltr'}">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
      <div class="px-6 pt-5 pb-3">
        <div class="flex items-center justify-between"><p class="text-[11px] font-bold tracking-widest text-blue-700 uppercase">${u.step} ${WIZ.step} ${u.of} ${total}</p><div class="flex gap-1">${Object.entries(EVA_I18N).map(([k, v]) => `<button onclick="WIZ.ui='${k}'; localStorage.setItem('eva_ui_lang','${k}'); wizRender()" class="px-2 py-0.5 rounded text-xs ${WIZ.ui === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${k.toUpperCase()}</button>`).join('')}</div></div>
        <h2 class="text-2xl font-black text-gray-900">${u['s' + WIZ.step]}</h2><p class="text-sm text-gray-500">${u['s' + WIZ.step + 'd']}</p>
        <div class="flex gap-1.5 mt-2">${Array.from({ length: total }, (_, i) => `<span class="w-2 h-2 rounded-full ${i < WIZ.step ? 'bg-blue-600' : 'bg-gray-200'}"></span>`).join('')}</div>
      </div>
      <div class="px-6 py-3 overflow-y-auto flex-1">${body}</div>
      <div class="px-6 py-3 border-t flex items-center justify-between">
        <button onclick="${WIZ.step === 1 ? 'wizClose()' : 'WIZ.step--; wizRender()'}" class="${btnSecondary}"><i class="fas fa-arrow-${rtl ? 'right' : 'left'} mr-1"></i> ${WIZ.step === 1 ? u.cancel : u.back}</button>
        <button id="wiz-next" onclick="${WIZ.step === total ? 'wizFinish()' : 'WIZ.step++; wizRender()'}" class="${btnPrimary} ${WIZ.step === total ? 'bg-green-600 hover:bg-green-700' : ''}" ${canNext ? '' : 'disabled'}>${WIZ.step === total ? '<i class="fas fa-check mr-1"></i> ' + u.finish : u.next + ' <i class="fas fa-arrow-' + (rtl ? 'left' : 'right') + ' ml-1"></i>'}</button>
      </div></div></div>`;
  document.getElementById('wiz-modal')?.remove(); document.body.insertAdjacentHTML('beforeend', html);
  if (WIZ.step === 6) setTimeout(() => document.getElementById('wiz-name')?.focus(), 50);
}
function wizSubject() { for (const g of Object.values(WIZ_SUBJECTS)) { const s = g.items.find(x => x.key === WIZ.data.subject); if (s) return s; } return null; }
function wizPickSubject(key) { WIZ.data.subject = key; WIZ.data.sub = null; const s = wizSubject(); if (s?.lang) WIZ.data.lang = s.lang; wizRender(); }
function wizClose() { document.getElementById('wiz-modal')?.remove(); }
async function wizFinish() {
  const d = WIZ.data; const s = wizSubject(); const useAi = document.getElementById('wiz-ai')?.checked; const L = EVA_I18N[d.lang];
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  // Matière de l'école correspondante (recherche souple par nom)
  const want = (s?.label?.fr || '').toLowerCase(); const subj = App.cache.subjects.find(x => { const n = (x.name || '').toLowerCase(); return n.includes(want.split(' ')[0]) || (want.startsWith('math') && /math|رياض/.test(n)) || (want === 'arabe' && /arab|عرب/.test(n)) || (want === 'anglais' && /angl|engl|إنج/.test(n)); });
  // Sections selon le type d'épreuve
  const secs = [];
  const isLangSubject = ['arabe', 'francais', 'anglais'].includes(d.subject);
  if (isLangSubject && (d.sub === 'normal' || d.sub === 'lecture')) secs.push({ title: L.sections.reading, subtitle: L.sections.readingSub, text_title: '', text: '', items: [] });
  if (isLangSubject && (d.sub === 'normal' || d.sub === 'dictee')) secs.push({ title: L.sections.lang, subtitle: '', text: null, items: [] });
  if (isLangSubject && (d.sub === 'normal' || d.sub === 'production')) secs.push({ title: L.sections.writing, subtitle: '', text: null, items: [] });
  if (!secs.length) secs.push({ title: L.sections.exercises, subtitle: '', text: null, items: [] });
  // Répartition des items : lecture → match/strike/truefalse/mcq/quote ; langue → fill/conjug ; production → open ; sinon tout dans la 1ʳᵉ
  const where = { match: 0, strike: 0, truefalse: 0, mcq: 0, quote: 0, fill: Math.min(1, secs.length - 1), conjug: Math.min(1, secs.length - 1), open: secs.length - 1 };
  const blank = { mcq: { question: '', options: ['', '', ''], correct: 0 }, truefalse: { question: '', correct: 0 }, match: { pairs: [{ left: '', right: 0 }], rights: ['', '', ''] }, strike: { subject: '', options: [{ text: '', false: false }, { text: '', false: true }] }, fill: { text: '', words: [], blanks: [{ answer: '' }] }, conjug: { text: '', blanks: [{ verb: '', answer: '' }] }, quote: { question: '', answer: '' }, open: { prompt: '', criteria: [''], lines: 10 } };
  const n = Object.values(d.counts).reduce((a, b) => a + b, 0) || 1; const pts = Math.max(0.5, Math.round(20 / n * 2) / 2);
  for (const [k, cnt] of Object.entries(d.counts)) for (let i = 0; i < cnt; i++) secs[isLangSubject ? where[k] : 0].items.push({ type: k, consigne: L.consignes[k], points: k === 'open' ? Math.max(pts, 4) : pts, ...JSON.parse(JSON.stringify(blank[k])) });
  wizClose();
  evaNew({ title: d.name, kind: d.kind, level: d.level, lang: d.lang, trimester: d.trimester, duration_min: d.duration, subject_id: subj?.id || '', online: d.online, folder: `${s?.label?.fr || ''} / T${d.trimester}`, header: {}, sections: secs, source: { wizard: { ...d, subject_label: s?.label?.fr } } });
  toast(`${n} ${wizUi().exercises} · ${EVA_I18N[d.lang].name}`);
  if (useAi) setTimeout(() => evaAiModal(), 400);
}
