/* ============================================================
   Rahma Academy — rafiq-i18n.js
   F69 — رفيق المعلم : couche de langues de l'interface.
   4 langues : العربية الفصحى (ar) · الدارجة التونسية (tn) ·
   Français (fr) · English (en).
   Principe : le texte de référence du module est l'arabe standard
   (فصحى). Ce fichier fournit les traductions tunisienne / française /
   anglaise et applique la langue choisie au rendu.
   Dépend de : render(), toast(), closeModal(), openModal().
   ============================================================ */

const RF_LANGS = {
  ar: { name: 'العربية الفصحى', short: 'فصحى',   dir: 'rtl' },
  tn: { name: 'الدارجة التونسية', short: 'تونسي', dir: 'rtl' },
  fr: { name: 'Français',        short: 'FR',    dir: 'ltr' },
  en: { name: 'English',         short: 'EN',    dir: 'ltr' }
};

// clé = texte arabe de référence · valeur = tn | fr | en
const RF_T = {};
`التحضير|التحضير|Préparation|Preparation
أدوات المعلم|أدوات المعلم|Outils de l'enseignant|Teacher tools
التثبيت|ترسيخ الدرس|Consolidation|Reinforcement
الشرح التفاعلي|الشرح التفاعلي|Explication interactive|Interactive explanation
منصتي|منصتي|Ma plateforme|My platform
المجتمع|المجتمع|Communauté|Community
استوديو الدرس|استوديو الدرس|Atelier du cours|Lesson studio
كل الأنواع|الأنواع الكل|Tous les types|All types
إعداد|إعداد|Préparer|Prepare
أنت|أنت|Vous|You
إعداد الملازم|تحضير الملازم|Fiches & livrets|Booklets
إعداد الامتحانات|تحضير الامتحانات|Examens|Exams
إعداد الفيديوهات|تحضير الفيديوهات|Vidéos|Videos
تحويل الشرح لملزمة|حوّل الشرح لملزمة|Enregistrement → fiche|Recording → booklet
صور وحوّل|تصاور وحوّل|Photos → Word|Photos → Word
نسق تلقائي|تنسيق أوتوماتيك|Mise en forme auto|Auto-format
حسابي|حسابي|Mon compte|My account
الإعدادات|الإعدادات|Réglages|Settings
الرئيسية|الرئيسية|Accueil|Home
لا توجد حصص اليوم|ما فماش حصص اليوم|Aucune séance aujourd'hui|No lesson today
الطلاب والمجموعات|التلامذة والمجموعات|Élèves et groupes|Students and groups
حصص اليوم|حصص اليوم|Séances du jour|Today's lessons
حضور اليوم|حضور اليوم|Présents aujourd'hui|Present today
متأخرون|المتأخرين|En retard|Late
إيراد اليوم|مدخول اليوم|Recettes du jour|Today's income
الطلاب|التلامذة|Élèves|Students
منهجي|البرنامج الرسمي|Programme officiel|Official curriculum
منسق الملازم|تنسيق الملازم|Assembler des fiches|Merge booklets
جهّز درسك قبل الحصة|حضّر درسك قبل الحصة|Préparez votre séance|Prepare your lesson
الخرائط الذهنية|الخرايط الذهنية|Cartes mentales|Mind maps
العروض التقديمية|العروض التقديمية|Diaporamas|Slides
ورقة المراجعة|ورقة المراجعة|Fiche mémo|Revision sheet
ألعاب الدرس|ألعاب الدرس|Jeux de classe|Lesson games
إنفوجرافيك الدرس|إنفوغرافيك الدرس|Infographie|Infographic
المنظمات البصرية|المنظمات البصرية|Organisateurs visuels|Visual organizers
بوستر مراجعة|بوستر مراجعة|Affiche de révision|Revision poster
قصة الدرس|قصة الدرس|Récit pédagogique|Lesson story
أدوات الملفات|أدوات الملفات|Bibliothèque|Files library
حقيبة المعلم|محفظة المعلم|Mes documents|My documents
تعديل المستندات|تعديل المستندات|Créer ou modifier|Create or edit
صوّت وشارك|صوّت وشارك|Sondage de classe|Class poll
ملصقاتي|الملصقات متاعي|Mes affiches|My posters
كاتب الرياضيات|كاتب الرياضيات|Exercices de maths|Maths exercises
إطارات السبورة|إطارات السبورة|Fonds de tableau|Board frames
الرسائل|الرسائل|Messages aux familles|Messages to families
السبورة الذكية|السبورة الذكية|Tableau interactif|Interactive board
الشرح المباشر|الشرح المباشر|Tuteur IA Rafik|Rafik AI tutor
المصحف الشريف|المصحف الشريف|Textes et lectures|Texts and readings
صانع التطبيقات|صانع التطبيقات|Cours interactifs|Interactive courses
ورشة التمارين|ورشة التمارين|Exercices d'arabe|Arabic exercises
رياضيات السادسة|رياضيات السادسة|Maths 6e|Maths grade 6
لعبة جديدة من الدرس|لعبة جديدة من الدرس|Nouveau jeu depuis le cours|New game from lesson
ألعاب جاهزة|ألعاب واجدة|Jeux prêts|Ready-made games
سباق الأسئلة|سباق الأسئلة|Course aux questions|Question race
الذاكرة|الذاكرة|Cartes mémoire|Memory cards
وصل صح|وصل صح|Associer|Match
صواب أم خطأ|صحيح ولا غالط|Vrai ou faux|True or false
منشئ الملازم|صانع الملازم|Créateur de livrets|Booklet builder
من درس|من الدرس|Depuis le cours|From lesson
قوالبي|قوالبي|Mes modèles|My templates
أو أنشئ الملزمة من فيديو يوتيوب|ولا اعمل الملزمة من فيديو يوتيوب|Ou depuis une vidéo|Or from a video
امتحان إلكتروني|امتحان إلكتروني|Examen en ligne|Online exam
امتحان ورقي|امتحان ورقي|Examen papier|Paper exam
امتحان سريع|امتحان سريع|Quiz express|Quick quiz
امتحان حصة|امتحان حصة|Interrogation|Class test
امتحان أسبوعي|امتحان أسبوعي|Devoir de la semaine|Weekly test
امتحان شهري|امتحان شهري|Bilan du mois|Monthly test
امتحان مفاجئ|امتحان مفاجئ|Quiz surprise|Surprise quiz
من نتائج طلابك|من نتايج تلامذتك|D'après vos résultats|From your results
ورقة علاج من نتيجة امتحان|ورقة علاج من نتيجة امتحان|Fiche de remédiation|Remediation sheet
أسبوعي · حصة · شهري · مفاجئ|أسبوعي · حصة · شهري · مفاجئ|Hebdo · séance · mois · surprise|Weekly · class · month · surprise
إدارة الاختبارات في التطبيق|إدارة الاختبارات في التطبيق|Gérer les tests en ligne|Manage online tests
على درس واحد|على درس واحد|Sur une leçon|On one lesson
على دروس الأسبوع|على دروس الأسبوع|Sur la semaine|On the week's lessons
شامل على الشهر|شامل على الشهر|Bilan du mois|Full month review
اختبار سريع في دقيقة|اختبار سريع في دقيقة|Quiz en une minute|One-minute quiz
شرح بالشرائح|شرح بالشرائح|Explication en diapos|Slide explanation
فيديو السبورة البيضاء|فيديو السبورة البيضاء|Tableau blanc animé|Whiteboard video
موشن احترافي|موشن احترافي|Motion professionnel|Pro motion
حل مسألة خطوة بخطوة|حل مسألة خطوة بخطوة|Résolution pas à pas|Step-by-step solving
ملخص الدرس في دقيقة|تلخيص الدرس في دقيقة|Résumé en 1 minute|One-minute summary
قصة كرتونية للأطفال|قصة كرتونية للأطفال|Dessin animé|Cartoon story
من أين الدرس؟|الدرس منين؟|D'où vient la leçon ?|Where is the lesson from?
ماذا تريد أن تنتج؟|شنوة تحب تنتج؟|Que voulez-vous produire ?|What do you want to produce?
المصدر|المصدر|Source|Source
النوع|النوع|Format|Format
النتيجة|النتيجة|Résultat|Result
البيانات|البيانات|Réglages|Settings
اللغة|اللغة|Langue|Language
الأسئلة|الأسئلة|Questions|Questions
من منهجي|من البرنامج|Depuis le programme|From curriculum
ملف PDF أو وورد|ملف PDF ولا وورد|Fichier PDF ou Word|PDF or Word file
صور الدرس|تصاور الدرس|Photos du cours|Lesson photos
أو الصق نص الدرس هنا…|ولا لصق نص الدرس هنا…|Ou collez le texte du cours…|Or paste the lesson text…
عنوان الدرس (اختياري)|عنوان الدرس (اختياري)|Titre de la leçon (facultatif)|Lesson title (optional)
تركيز خاص (اختياري)|تركيز خاص (اختياري)|Focus particulier (facultatif)|Specific focus (optional)
توليد|ولّد|Générer|Generate
توليد جديد|ولّد من جديد|Régénérer|Regenerate
السابق|السابق|Précédent|Back
التالي|التالي|Suivant|Next
ملزمة / شرح|ملزمة / شرح|Fiche / explication|Sheet / explanation
أسئلة (QCM)|أسئلة (QCM)|Questions (QCM)|Questions (MCQ)
كروت / فلاش كاردز|كروت / فلاش كاردز|Cartes mémoire|Flashcards
نص فيه فراغات|نص فيه فراغات|Texte à trous|Fill in the blanks
اضغط « توليد »|اضغط « ولّد »|Appuyez sur « Générer »|Press "Generate"
طباعة / PDF|طباعة / PDF|Imprimer / PDF|Print / PDF
حفظ كتقييم|حفظ كتقييم|Enregistrer comme évaluation|Save as assessment
نفس لغة الملف|كيما لغة الملف|Même langue que le fichier|Same language as file
الأساسي|الأساسي|Essentiels|Essentials
الشكل|الشكل|Apparence|Appearance
التواصل|التواصل|Communication|Communication
الشغل|الخدمة|Travail|Work
لغة الذكاء الاصطناعي|لغة الذكاء الاصطناعي|Langue de l'IA|AI language
لغة الواجهة|لغة الواجهة|Langue de l'interface|Interface language
الخصوصية والأمان|الخصوصية والأمان|Confidentialité et sécurité|Privacy and security
الشكل والخط|الشكل والخط|Apparence et police|Look and font
الأيقونة والودجات|الأيقونة والودجات|Icône et widgets|Icon and widgets
الإشعارات|الإشعارات|Notifications|Notifications
واتساب والرسائل|واتساب والرسائل|WhatsApp et messages|WhatsApp and messages
العملة|العملة|Monnaie|Currency
المصاريف في تطبيق الطلاب|المصاريف في تطبيق التلامذة|Frais côté élèves|Fees on student app
كود الطلاب|كود التلامذة|Code élève|Student code
شكل الملفات المفتوحة|شكل الملفات|Format des fichiers|File format
الإدارة المتقدمة|الإدارة المتقدمة|Administration avancée|Advanced admin
ابحث في الإعدادات…|لوّج في الإعدادات…|Rechercher dans les réglages…|Search settings…
العربية|العربية|Arabe|Arabic
خط كوفي واضح|خط كوفي واضح|Noto Kufi, très lisible|Noto Kufi, very readable
القاهرة — العنوان العريض|القاهرة — العنوان العريض|Cairo — titres épais|Cairo — bold headings
المساعدين|المساعدين|Assistants|Assistants
الباقات والاشتراكات|الباقات والاشتراكات|Offres et abonnements|Plans and subscriptions
الدعم الفني|الدعم الفني|Assistance|Support
الاقتراحات|الاقتراحات|Suggestions|Suggestions
السياسات|السياسات|Politiques|Policies
تسجيل الخروج|تسجيل الخروج|Se déconnecter|Sign out
اكتب اقتراحك…|اكتب اقتراحك…|Écrivez votre suggestion…|Write your suggestion…
إرسال|ابعث|Envoyer|Send
إلغاء|إلغاء|Annuler|Cancel
شكراً! وصل اقتراحك للإدارة ✅|يعيشك! وصل اقتراحك للإدارة ✅|Merci ! Votre suggestion est arrivée ✅|Thank you! Suggestion sent ✅
شارك ملزمة|شارك ملزمة|Publier un support|Publish a resource
أسأل المعلمين|اسأل المعلمين|Poser une question|Ask a question
حمّل ملازم|حمّل ملازم|Banque publique|Public library
الأكثر استعمالاً|الأكثر استعمالاً|Les plus utilisés|Most used
مشاركة|شارك|Partager|Share
مشاركة مع المجتمع|مشاركة مع المجتمع|Partager avec la communauté|Share with the community
شارك خبرتك مع باقي المعلمين|شارك خبرتك مع المعلمين|Partagez votre expérience|Share your experience
أدر منصتك وتطبيقك|أدر منصتك وتطبيقك|Gérez votre plateforme|Manage your platform
كيف يسهّل رفيق المعلم عملك|كيفاش يسهّل رفيق المعلم خدمتك|Comment Rafiq facilite votre travail|How Rafiq makes work easier
شاهد الفيديو · 2 min|شوف الفيديو · 2 min|Voir la vidéo · 2 min|Watch the video · 2 min
التحكم في المنصة|التحكم في المنصة|Couleurs et palettes|Colours and palettes
الطلبات والاحتراف|الطلبات والاحتراف|Demandes et abonnements|Requests and plans
بيانات المنصة|بيانات المؤسسة|Identité de l'établissement|School identity
التسويق|التسويق|QR et page publique|QR and public page
إدارة المنصة|إدارة المنصة|Gérer la plateforme|Manage the platform
مفعّل|مفعّل|Actif|Enabled
موقوف|موقوف|Inactif|Disabled
إدارة كل الوحدات|إدارة كل الوحدات|Gérer tous les modules|Manage all modules
الامتحانات الورقية|الامتحانات الورقية|Examens papier|Paper exams
ما نوع الامتحان المطلوب؟|شنوة نوع الامتحان؟|Quel type d'épreuve ?|Which exam type?
أدوات|أدوات|Outils|Tools
اصنع امتحانك|اصنع امتحانك|Créer votre épreuve|Build your exam
على غرار هذا النموذج|كيما هذا النموذج|D'après ce modèle|Like this template
ورقة قصيرة على درس الحصة|ورقة قصيرة على درس الحصة|Feuille courte sur la séance|Short sheet on the lesson
امتحان شامل على الشهر|امتحان شامل على الشهر|Bilan complet du mois|Full monthly review
اختبار سريع دون موعد|اختبار سريع بلا ميعاد|Quiz rapide sans préavis|Quick quiz without notice
إدارة الامتحانات الإلكترونية|إدارة الامتحانات الإلكترونية|Examens en ligne|Online exams
لا توجد اختبارات بعد|ما فماش اختبارات لتوّا|Aucun test pour l'instant|No tests yet
أنشئ أول اختبار إلكتروني ليطوّر طلابك.|اعمل أول اختبار إلكتروني لتطوّر تلامذتك.|Créez votre premier test en ligne.|Create your first online test.
أنشئ|اعمل|Créer|Create
بوقت، والطالب يحل في التطبيق|بوقت، والتلميذ يحل في التطبيق|Chronométré, l'élève répond en ligne|Timed, student answers online
واجب|واجب|Devoir|Homework
بموعد نهائي — يحل في التطبيق أو يصور ورقته|بآخر أجل — يحل في التطبيق ولا يصوّر ورقته|Avec échéance — en ligne ou photo|With deadline — online or photo
أنشئ امتحاناً بالذكاء|اعمل امتحان بالذكاء|Examen généré par IA|AI-generated exam
من درس في المنهج أو ملف أو موضوع|من درس في البرنامج ولا ملف ولا موضوع|Depuis le programme, un fichier ou un thème|From curriculum, file or topic
الامتحانات الحالية|الامتحانات الحالية|Tests en cours|Current tests
النتائج|النتائج|Résultats|Results
شارة الفصل ونتائج الطلاب|نتايج القسم والتلامذة|Moyennes et réussite|Averages and success
عنوان الامتحان|عنوان الامتحان|Titre de l'épreuve|Exam title
عدد الأسئلة|عدد الأسئلة|Nombre de questions|Number of questions
المدة (دق)|المدة (دق)|Durée (min)|Duration (min)
الصعوبة|الصعوبة|Difficulté|Difficulty
سهل|سهل|Facile|Easy
متوسط|متوسط|Moyen|Medium
صعب|صعب|Difficile|Hard
سأكتب الأسئلة بنفسي|نكتب الأسئلة بروحي|J'écris mes questions|I write my own questions
الذكاء يكتب الأسئلة|الذكاء يكتب الأسئلة|L'IA écrit les questions|AI writes the questions
لغة الامتحان|لغة الامتحان|Langue de l'épreuve|Exam language
اصنع الامتحان|اصنع الامتحان|Créer l'épreuve|Create the exam
حوّل درسك لفيديو وموشن|حوّل درسك لفيديو وموشن|Transformez la leçon en vidéo|Turn the lesson into video
حكاية بالشخصيات|حكاية بالشخصيات|Récit à personnages|Character story
حوار الشخصيات|حوار الشخصيات|Dialogue|Dialogue
الخط الزمني|الخط الزمني|Frise chronologique|Timeline
فيديو أسئلة للمراجعة|فيديو أسئلة للمراجعة|Vidéo de révision|Revision video
المعلم الإلكتروني|المعلم الإلكتروني|Professeur virtuel|Virtual teacher
قصة كرتونية|قصة كرتونية|Dessin animé|Cartoon
مواد معيّنة|مواد معيّنة|Supports ciblés|Targeted resources
مراجعة وتواصل|مراجعة وتواصل|Révision|Revision
للأطفال|للصغار|Jeunes élèves|Young learners
شخصيات|شخصيات|Personnages|Characters
حوّل صور صفحات الكتاب لنص منسّق ونظيف|حوّل تصاور صفحات الكتاب لنص منسّق ونظيف|Des photos de pages en texte propre|Page photos into clean text
نفس الكلام… بشكل احترافي|نفس الكلام… بشكل احترافي|Le même texte, en propre|Same words, professionally
من المعرض|من الغاليري|Depuis la galerie|From gallery
صور بالمسح|تصاور بالسكانير|Scanner des pages|Scan pages
نسخ الصفحات|انسخ الصفحات|Copier les pages|Copy the pages
اسم الكتاب / المادة والصفحة (مثلاً : العلوم — ص 24)|اسم الكتاب / المادة والصفحة (مثلاً : العلوم — ص 24)|Livre / matière et page|Book / subject and page
اكتب / الصق|اكتب / لصق|Écrire / coller|Write / paste
الصق|لصق|Coller|Paste
ما الناتج؟|شنوة الناتج؟|Quel résultat ?|Which output?
ملزمة|ملزمة|Fiche|Sheet
مراجعة|مراجعة|Révision|Revision
امتحان|امتحان|Examen|Exam
نسّق تلقائي|نسّق أوتوماتيك|Mettre en forme|Auto-format
تسجيل الحصة|تسجيل الحصة|Enregistrement|Recording
مساحة التفريغ|مساحة التفريغ|Transcription|Transcription
الناتج|الناتج|Résultat|Output
ما الناتج المطلوب؟|شنوة الناتج اللي تحب؟|Quel résultat souhaitez-vous ?|Which output do you want?
جاهز|واجد|C'est prêt|Ready
حوّل لملزمة|حوّل لملزمة|Transformer en fiche|Turn into a sheet
اختر تسجيل الحصة|اختار تسجيل الحصة|Choisir l'enregistrement|Choose the recording
ملزمة من شرحي|ملزمة من شرحی|Fiche de mon cours|Sheet from my lesson
شرح تفصيلي كامل|شرح تفصيلي كامل|Explication complète|Full explanation
نص ملخّص ومقصوص|نص ملخّص ومقصوص|Texte court et résumé|Short summarised text
شرح مبسّط|شرح مبسّط|Explication simplifiée|Simplified explanation
قبل الحصة|قبل الحصة|Avant la séance|Before the lesson
أثناء الحصة|وقت الحصة|Pendant la séance|During the lesson
بعد الحصة|بعد الحصة|Après la séance|After the lesson
مراجعة وامتحانات|مراجعة وامتحانات|Révision et examens|Revision and exams
علوم ورياضيات|علوم ورياضيات|Sciences et maths|Science and maths
لغات|لغات|Langues|Languages
للأهل والإدارة|للأهل والإدارة|Familles et direction|Families and management
شرح وموشن|شرح وموشن|Vidéo et motion|Video and motion
ثبّت التطبيق|ثبّت التطبيق|Installer l'app|Install the app
رفيق المعلم كتطبيق مستقل|رفيق المعلم كتطبيق مستقل|Rafiq comme application séparée|Rafiq as a separate app
ثبّت رفيق المعلم على شاشة الهاتف|ثبّت رفيق المعلم على شاشة الهاتف|Installer Rafiq sur l'écran d'accueil|Install Rafiq on your home screen
تطبيق مستقل بأيقونة خاصة|تطبيق مستقل بأيقونة خاصة|Application séparée, icône dédiée|Separate app, dedicated icon
مثبّت|مثبّت|Installée|Installed`
  .split('\n')
  .forEach((line) => {
    const p = line.split('|');
    if (p.length === 4 && p[0].trim()) RF_T[p[0].trim()] = { tn: p[1], fr: p[2], en: p[3] };
  });

// ---------- langue courante ----------
function rafiqLang() {
  try {
    const v = localStorage.getItem('rafiq_ui_lang');
    return RF_LANGS[v] ? v : 'ar';
  } catch (e) { return 'ar'; }
}
function rafiqDir() { return RF_LANGS[rafiqLang()].dir; }
function rafiqIsAr() { const l = rafiqLang(); return l === 'ar' || l === 'tn'; }

// texte principal localisé (repli : arabe de référence)
function rfSay(ar, fr) {
  const l = rafiqLang();
  if (l === 'ar') return ar;
  const e = RF_T[String(ar).trim()];
  if (l === 'tn') return (e && e.tn) || ar;
  if (l === 'fr') return (e && e.fr) || fr || ar;
  if (l === 'en') return (e && e.en) || (e && e.fr) || fr || ar;
  return ar;
}
// ligne secondaire : en arabe (فصحى/تونسي) on garde le français d'origine ;
// en français / anglais, la tuile reste monolingue.
function rfSub(ar, fr) {
  return rafiqIsAr() ? (fr || '') : '';
}

function rafiqSetLang(k) {
  if (!RF_LANGS[k]) return;
  try { localStorage.setItem('rafiq_ui_lang', k); } catch (e) {}
  toast(RF_LANGS[k].name, 'info');
  if (typeof render === 'function') render();
}

// ---------- localisation du DOM déjà rendu ----------
// Traduit les nœuds texte dont le contenu est une clé du dictionnaire,
// ainsi que les attributs placeholder / title.
const RF_SKIP_TAGS = { SCRIPT: 1, STYLE: 1, I: 1, INPUT: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1 };
function rfLocalize(root) {
  if (!root) return;
  const lang = rafiqLang();
  if (lang === 'ar') return; // l'arabe standard est la langue source
  const walk = (node) => {
    for (let n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const raw = n.nodeValue;
        const key = raw.trim();
        if (key && RF_T[key] && raw.indexOf('\n') < 0) {
          const e = RF_T[key];
          const tr = e[lang] || (lang === 'en' ? e.fr : null);
          if (tr) n.nodeValue = raw.replace(key, tr);
        }
      } else if (n.nodeType === 1 && !RF_SKIP_TAGS[n.tagName]) {
        walk(n);
      }
    }
  };
  walk(root);
  const ph = root.querySelectorAll ? root.querySelectorAll('[placeholder]') : [];
  for (let i = 0; i < ph.length; i++) {
    const key = (ph[i].placeholder || '').trim();
    if (RF_T[key]) ph[i].placeholder = RF_T[key][lang] || ph[i].placeholder;
  }
  const ti = root.querySelectorAll ? root.querySelectorAll('[title]') : [];
  for (let i = 0; i < ti.length; i++) {
    const key = (ti[i].title || '').trim();
    if (RF_T[key]) ti[i].title = RF_T[key][lang] || ti[i].title;
  }
}
// rendu du module + application de la langue
function rfMount(el) {
  if (!el) return;
  rfLocalize(el);
  try { el.setAttribute('dir', rafiqDir()); } catch (e) {}
}

// ---------- sélecteur de langue ----------
function rfLangBar() {
  const cur = rafiqLang();
  return `<div class="flex items-center gap-1 flex-wrap mb-3" dir="rtl">
    <span class="text-[10px] font-bold text-slate-400 ml-1"><i class="fas fa-language mr-1"></i>اللغة</span>
    ${Object.entries(RF_LANGS).map(([k, v]) => `<button type="button" onclick="rafiqSetLang('${k}')"
      class="px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${cur === k ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400'}"
      title="${esc(v.name)}">${esc(v.short)}</button>`).join('')}
  </div>`;
}
function rafiqLangPicker() {
  const cur = rafiqLang();
  openModal('<i class="fas fa-language text-teal-600 mr-2"></i>لغة الواجهة — Langue',
    `<div class="grid gap-2">
      ${Object.entries(RF_LANGS).map(([k, v]) => `<button type="button" onclick="rafiqSetLang('${k}'); closeModal()"
        class="pal-card ${cur === k ? 'pal-on' : ''}">
        <span class="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center text-sm font-black">${esc(v.short)}</span>
        <span class="min-w-0 text-right flex-1"><span class="block text-sm font-bold text-slate-800">${esc(v.name)}</span>
        <span class="block text-[11px] text-slate-500">${k === 'ar' ? 'Arabe standard (فصحى)' : k === 'tn' ? 'Derja tunisienne (دارجة)' : k === 'fr' ? 'Français' : 'English'}</span></span>
        ${cur === k ? '<i class="fas fa-circle-check text-teal-600 text-sm"></i>' : ''}</button>`).join('')}
    </div>
    <p class="text-[11px] text-slate-400 mt-3">Le choix est conservé sur cet appareil. <span dir="rtl">يُحفظ الاختيار على هذا الجهاز.</span></p>`);
}

// langue de génération IA : l'API accepte ar / fr → tn rend ar, en rend fr
function rafiqAiLang() {
  const l = rafiqLang();
  if (l === 'fr' || l === 'en') return 'fr';
  return 'ar';
}
