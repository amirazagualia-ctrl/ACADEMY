/* ============================================================
   Rahma Academy — views-math6.js
   F65 — 🧮 رياضيات السنة السادسة : application interactive (arabe)
   Moteur d'exercices GÉNÉRÉS (infinis) : 7 unités × 3 niveaux,
   réponse saisie ou QCM, correction immédiate, indice, explication,
   chrono, points, étoiles, progression serveur (/api/math6/progress),
   suivi enseignant, lien vers le tuteur IA « رفيق ».
   ============================================================ */

const M6_UNITS = {
  nombres:    { emoji: '🔢', ar: 'الأعداد العشرية', fr: 'Nombres décimaux', color: 'from-blue-500 to-indigo-600', skills: ['الجمع والطرح', 'الضرب', 'القسمة'] },
  fractions:  { emoji: '🍕', ar: 'الكسور', fr: 'Fractions', color: 'from-pink-500 to-rose-600', skills: ['كسر من كمية', 'جمع وطرح الكسور', 'مقارنة وتحويل'] },
  pourcent:   { emoji: '％', ar: 'النسب المئوية', fr: 'Pourcentages', color: 'from-amber-400 to-orange-600', skills: ['حساب نسبة', 'التخفيض والزيادة', 'إيجاد النسبة'] },
  proportion: { emoji: '⚖️', ar: 'التناسب', fr: 'Proportionnalité', color: 'from-emerald-500 to-green-700', skills: ['السعر والكمية', 'السلّم والوصفات', 'السرعة والزمن'] },
  mesures:    { emoji: '📏', ar: 'القياس والتحويلات', fr: 'Mesures & conversions', color: 'from-cyan-500 to-teal-700', skills: ['الطول والكتلة والسعة', 'المساحة والأقيسة الفلاحية', 'الزمن'] },
  geometrie:  { emoji: '📐', ar: 'الهندسة', fr: 'Géométrie', color: 'from-violet-500 to-purple-700', skills: ['محيط ومساحة', 'المثلث والدائرة', 'الحجوم'] },
  problemes:  { emoji: '🧩', ar: 'مسائل', fr: 'Problèmes', color: 'from-slate-600 to-gray-800', skills: ['خطوة واحدة', 'خطوتان', 'مسائل مركّبة'] }
};
const M6_N = 10;               // questions par série
const M6_PTS = [10, 5, 0];     // 1re, 2e tentative, échec
const M6_HINT = 2;             // coût d'un indice
const M6 = { unit: null, level: 1, qs: [], i: 0, tries: 0, score: 0, streak: 0, hint: false, done: false, t0: 0, timer: null, prog: {}, board: [], answered: null, lastPick: null, lastPts: 0 };

// ---------- utilitaires ----------
const m6r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const m6pick = arr => arr[Math.floor(Math.random() * arr.length)];
const m6gcd = (a, b) => b ? m6gcd(b, a % b) : Math.abs(a);
function m6fmt(n, d) { // virgule décimale, espace des milliers
  if (typeof n !== 'number' || !isFinite(n)) return String(n);
  const s = (d !== undefined ? n.toFixed(d) : String(Math.round(n * 1000) / 1000)).replace('.', ',');
  const [ip, fp] = s.split(','); return ip.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (fp ? ',' + fp : '');
}
function m6parse(s) { // accepte 12,5 · 12.5 · ١٢٫٥ · 3/4 · 1 200
  if (s == null) return NaN;
  const t = String(s).trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[،٫]/g, ',').replace(/\s+/g, '').replace(',', '.');
  const f = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/); if (f) return Number(f[1]) / Number(f[2]);
  return t === '' ? NaN : Number(t);
}
function m6frac(a, b) { const g = m6gcd(a, b) || 1; a /= g; b /= g; return b === 1 ? `${a}` : `${a}/${b}`; }
function m6shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const M6_NAMES = ['أحمد', 'سلمى', 'يوسف', 'مريم', 'عمر', 'آمنة', 'علي', 'نور', 'سامي', 'ليلى', 'خالد', 'هند'];
const M6_SHOPS = [['كتاب', 12.5], ['كرّاس', 1.8], ['قلم', 0.9], ['محفظة', 45], ['كرة', 18.5], ['قميص', 32], ['حذاء', 65], ['لعبة', 24.9], ['ساعة', 55], ['حقيبة', 38]];

// ---------- générateurs : M6_GEN[unit][level]() → { q, answer | options+correct, unit, hint, explain, tol, answerText, frac } ----------
const M6_GEN = {
  nombres: {
    1() { const a = m6r(100, 9999) / 100, b = m6r(100, 9999) / 100; if (Math.random() < .5) return { q: `أحسب : ${m6fmt(a, 2)} + ${m6fmt(b, 2)}`, answer: +(a + b).toFixed(2), hint: 'رتّب الفاصلة تحت الفاصلة ثمّ اجمع.', explain: `${m6fmt(a, 2)} + ${m6fmt(b, 2)} = ${m6fmt(a + b, 2)}` }; const [x, y] = a > b ? [a, b] : [b, a]; return { q: `أحسب : ${m6fmt(x, 2)} − ${m6fmt(y, 2)}`, answer: +(x - y).toFixed(2), hint: 'رتّب الفاصلة تحت الفاصلة ثمّ اطرح.', explain: `${m6fmt(x, 2)} − ${m6fmt(y, 2)} = ${m6fmt(x - y, 2)}` }; },
    2() { const a = m6r(11, 999) / 10, b = m6r(3, 12); if (Math.random() < .4) { const p = m6pick([10, 100, 1000]); return { q: `أحسب : ${m6fmt(a)} × ${p}`, answer: +(a * p).toFixed(3), hint: 'الضرب في 10 أو 100 أو 1000 : أزح الفاصلة نحو اليمين.', explain: `${m6fmt(a)} × ${p} = ${m6fmt(a * p)}` }; } return { q: `أحسب : ${m6fmt(a)} × ${b}`, answer: +(a * b).toFixed(2), hint: 'اضرب كأنّها أعداد صحيحة ثمّ ضع الفاصلة (رقم واحد بعد الفاصلة).', explain: `${m6fmt(a)} × ${b} = ${m6fmt(a * b)}` }; },
    3() { const d = m6r(2, 9), q = m6r(11, 99) / 10, a = +(q * d).toFixed(2); if (Math.random() < .4) { const p = m6pick([10, 100]); const n = m6r(15, 999); return { q: `أحسب : ${n} ÷ ${p}`, answer: n / p, hint: 'القسمة على 10 أو 100 : أزح الفاصلة نحو اليسار.', explain: `${n} ÷ ${p} = ${m6fmt(n / p)}` }; } return { q: `أحسب : ${m6fmt(a)} ÷ ${d}`, answer: q, hint: `جرّب الضرب : ${d} × ? = ${m6fmt(a)}`, explain: `${m6fmt(a)} ÷ ${d} = ${m6fmt(q)} لأنّ ${m6fmt(q)} × ${d} = ${m6fmt(a)}` }; }
  },
  fractions: {
    1() { const b = m6pick([2, 3, 4, 5, 6, 8, 10]), a = m6r(1, b - 1), n = b * m6r(3, 15); const ctx = m6pick(['تلميذا', 'شجرة', 'كتابا', 'دينارا', 'كيلوغراما']); return { q: `أحسب ${a}/${b} من ${n} ${ctx}`, answer: n * a / b, hint: `اقسم ${n} على ${b} ثمّ اضرب في ${a}.`, explain: `${n} ÷ ${b} = ${n / b} ، ثمّ ${n / b} × ${a} = ${n * a / b}` }; },
    2() { const b = m6pick([2, 3, 4, 5, 6]), d = m6pick([2, 3, 4, 6, 8, 12]); const a = m6r(1, b - 1), c = m6r(1, d - 1); const L = b * d / m6gcd(b, d); const na = a * L / b, nc = c * L / d; const sum = Math.random() < .6 || na <= nc; const num = sum ? na + nc : na - nc; const simp = m6frac(num, L); return { q: `أحسب و بسّط : ${a}/${b} ${sum ? '+' : '−'} ${c}/${d}`, answer: num / L, answerText: simp, frac: true, hint: `وحّد المقامات : المقام المشترك هو ${L}.`, explain: `${a}/${b} = ${na}/${L} و ${c}/${d} = ${nc}/${L} ← ${na}/${L} ${sum ? '+' : '−'} ${nc}/${L} = ${num}/${L}${simp !== `${num}/${L}` ? ' = ' + simp : ''}` }; },
    3() { if (Math.random() < .5) { const b = m6pick([2, 4, 5, 8, 10, 20, 25, 50]), a = m6r(1, b * 2); return { q: `اكتب الكسر ${a}/${b} في شكل عدد عشري`, answer: a / b, hint: `اقسم ${a} على ${b} (أو وسّع المقام إلى 10 أو 100).`, explain: `${a}/${b} = ${m6fmt(a / b)}` }; } const fr = []; while (fr.length < 4) { const b = m6r(2, 9), a = m6r(1, b * 2); if (!fr.some(f => f[0] / f[1] === a / b)) fr.push([a, b]); } const vals = fr.map(f => f[0] / f[1]); return { q: 'أيّ الكسور التالية أكبر ؟', options: fr.map(f => `${f[0]}/${f[1]}`), correct: vals.indexOf(Math.max(...vals)), hint: 'حوّل كلّ كسر إلى عدد عشري أو قارنه بـ 1.', explain: fr.map(f => `${f[0]}/${f[1]} ≈ ${m6fmt(f[0] / f[1], 2)}`).join(' · ') }; }
  },
  pourcent: {
    1() { const p = m6pick([10, 20, 25, 50, 75, 5, 15, 30, 40, 60]), n = m6pick([20, 40, 60, 80, 100, 120, 200, 240, 300, 400, 500, 800]); return { q: `أحسب ${p} ٪ من ${n}`, answer: n * p / 100, hint: `${p} ٪ تعني ${p} من كلّ 100 : اضرب ${n} في ${p} ثمّ اقسم على 100.`, explain: `${n} × ${p} ÷ 100 = ${m6fmt(n * p / 100)}` }; },
    2() { const [it, pr0] = m6pick(M6_SHOPS); const pr = pr0 * m6pick([1, 2, 4, 10]); const p = m6pick([10, 20, 25, 30, 50]); const up = Math.random() < .3; const res = up ? pr * (1 + p / 100) : pr * (1 - p / 100); return { q: `ثمن ${it} ${m6fmt(pr)} د. ${up ? 'ارتفع ثمنه' : 'عُرض بتخفيض'} بنسبة ${p} ٪. ما ثمنه الجديد ؟`, answer: +res.toFixed(3), unit: 'د', tol: .01, hint: `أحسب أوّلا قيمة ${up ? 'الزيادة' : 'التخفيض'} : ${m6fmt(pr)} × ${p} ÷ 100.`, explain: `${up ? 'الزيادة' : 'التخفيض'} = ${m6fmt(pr * p / 100)} د ← الثمن الجديد = ${m6fmt(pr)} ${up ? '+' : '−'} ${m6fmt(pr * p / 100)} = ${m6fmt(res)} د` }; },
    3() { const tot = m6pick([20, 25, 40, 50, 80, 200, 400]), p = m6pick([10, 15, 20, 25, 30, 40, 50, 60, 75, 80]); const part = tot * p / 100; const ctx = m6pick(['تلميذا نجحوا من بين', 'شجرة مثمرة من بين', 'كرة حمراء من بين']); return { q: `${part} ${ctx} ${tot}. ما النسبة المئوية ؟`, answer: p, unit: '٪', hint: 'النسبة = الجزء ÷ الكلّ × 100', explain: `${part} ÷ ${tot} × 100 = ${p} ٪` }; }
  },
  proportion: {
    1() { const k = m6r(2, 6), pu = m6pick([0.8, 1.2, 1.5, 2.5, 3, 4.5, 6]), k2 = m6r(2, 9); const item = m6pick(['البرتقال', 'الطماطم', 'التفّاح', 'البطاطا', 'الموز']); return { q: `ثمن ${k} كغ من ${item} هو ${m6fmt(pu * k)} د. ما ثمن ${k2} كغ ؟`, answer: +(pu * k2).toFixed(3), unit: 'د', tol: .01, hint: `أحسب ثمن الكيلوغرام الواحد أوّلا : ${m6fmt(pu * k)} ÷ ${k}.`, explain: `ثمن 1 كغ = ${m6fmt(pu)} د ← ${k2} كغ = ${m6fmt(pu)} × ${k2} = ${m6fmt(pu * k2)} د` }; },
    2() { if (Math.random() < .5) { const sc = m6pick([100, 1000, 10000, 50000, 100000]), cm = m6r(2, 25); const real = cm * sc; const km = real / 100000; const useKm = km >= 1; return { q: `على خريطة سلّمها 1/${m6fmt(sc)}، المسافة بين مدينتين ${cm} صم. ما المسافة الحقيقيّة ب${useKm ? 'الكيلومتر' : 'المتر'} ؟`, answer: useKm ? km : real / 100, unit: useKm ? 'كم' : 'م', hint: `1 صم على الخريطة = ${m6fmt(sc)} صم في الحقيقة.`, explain: `${cm} × ${m6fmt(sc)} = ${m6fmt(real)} صم = ${useKm ? m6fmt(km) + ' كم' : m6fmt(real / 100) + ' م'}` }; } const p = m6r(4, 8), p2 = m6pick([2, 3, 4, 6, 12].filter(x => x !== p)); const g = m6pick([150, 200, 250, 300]); const ing = m6pick(['الدقيق', 'السكّر', 'الأرز']); return { q: `لتحضير حلوى لـ ${p} أشخاص نحتاج ${g} غ من ${ing}. كم غراما نحتاج لـ ${p2} أشخاص ؟`, answer: +(g / p * p2).toFixed(1), unit: 'غ', tol: .1, hint: `أحسب الكمّية لشخص واحد : ${g} ÷ ${p}.`, explain: `${g} ÷ ${p} = ${m6fmt(g / p)} غ للشخص ← × ${p2} = ${m6fmt(g / p * p2)} غ` }; },
    3() { const v = m6pick([60, 80, 90, 100, 120]), t = m6pick([0.5, 1, 1.5, 2, 2.5, 3]); const mode = m6r(0, 2); const d = v * t; const th = t === Math.floor(t) ? `${t} س` : `${Math.floor(t)} س و 30 دق`; if (mode === 0) return { q: `تسير سيّارة بسرعة ${v} كم/س. ما المسافة التي تقطعها في ${th} ؟`, answer: d, unit: 'كم', hint: 'المسافة = السرعة × الزمن', explain: `${v} × ${m6fmt(t)} = ${d} كم` }; if (mode === 1) return { q: `قطعت حافلة ${d} كم في ${th}. ما سرعتها المتوسّطة ؟`, answer: v, unit: 'كم/س', hint: 'السرعة = المسافة ÷ الزمن', explain: `${d} ÷ ${m6fmt(t)} = ${v} كم/س` }; return { q: `قطار سرعته ${v} كم/س. كم ساعة يحتاج لقطع ${d} كم ؟`, answer: t, unit: 'س', hint: 'الزمن = المسافة ÷ السرعة', explain: `${d} ÷ ${v} = ${m6fmt(t)} س` }; }
  },
  mesures: {
    1() { const T = m6pick([['كم', 'م', 1000], ['م', 'صم', 100], ['م', 'مم', 1000], ['كغ', 'غ', 1000], ['طن', 'كغ', 1000], ['ل', 'صل', 100], ['ل', 'مل', 1000], ['هل', 'ل', 100]]); const v = m6pick([0.25, 0.5, 1.2, 2.5, 3, 4.75, 7.5, 12]); const rev = Math.random() < .4; return rev ? { q: `حوّل : ${m6fmt(v * T[2])} ${T[1]} = ? ${T[0]}`, answer: v, unit: T[0], hint: `1 ${T[0]} = ${m6fmt(T[2])} ${T[1]} ← اقسم على ${m6fmt(T[2])}.`, explain: `${m6fmt(v * T[2])} ÷ ${m6fmt(T[2])} = ${m6fmt(v)} ${T[0]}` } : { q: `حوّل : ${m6fmt(v)} ${T[0]} = ? ${T[1]}`, answer: v * T[2], unit: T[1], hint: `1 ${T[0]} = ${m6fmt(T[2])} ${T[1]} ← اضرب في ${m6fmt(T[2])}.`, explain: `${m6fmt(v)} × ${m6fmt(T[2])} = ${m6fmt(v * T[2])} ${T[1]}` }; },
    2() { const T = m6pick([['م²', 'دسم²', 100], ['كم²', 'هك', 100], ['هك', 'آر', 100], ['آر', 'م²', 100], ['هك', 'م²', 10000], ['دسم²', 'صم²', 100]]); const v = m6pick([0.5, 1.5, 2, 3.25, 4, 7.5, 12]); const rev = Math.random() < .4; return rev ? { q: `حوّل : ${m6fmt(v * T[2])} ${T[1]} = ? ${T[0]}`, answer: v, unit: T[0], hint: 'وحدات المساحة : كلّ وحدة = 100 من الوحدة الأصغر مباشرة (1 هك = 100 آر = 10 000 م²).', explain: `${m6fmt(v * T[2])} ÷ ${m6fmt(T[2])} = ${m6fmt(v)} ${T[0]}` } : { q: `حوّل : ${m6fmt(v)} ${T[0]} = ? ${T[1]}`, answer: v * T[2], unit: T[1], hint: `1 ${T[0]} = ${m6fmt(T[2])} ${T[1]}`, explain: `${m6fmt(v)} × ${m6fmt(T[2])} = ${m6fmt(v * T[2])} ${T[1]}` }; },
    3() { const mode = m6r(0, 2); if (mode === 0) { const h = m6r(1, 5), m = m6pick([15, 20, 30, 45, 50]); return { q: `حوّل إلى دقائق : ${h} س و ${m} دق`, answer: h * 60 + m, unit: 'دق', hint: '1 س = 60 دق', explain: `${h} × 60 + ${m} = ${h * 60 + m} دق` }; } if (mode === 1) { const h1 = m6r(7, 10), m1 = m6pick([10, 20, 30, 40, 45]), dh = m6r(1, 3), dm = m6pick([15, 25, 35, 45, 50]); let H = h1 + dh, M = m1 + dm; if (M >= 60) { M -= 60; H++; } return { q: `انطلقت حافلة على الساعة ${h1} س ${m1} دق ودام السفر ${dh} س ${dm} دق. متى وصلت ؟ (اكتب الساعة ثمّ الدقائق مفصولتين بفاصلة، مثال 10,25)`, answer: H + M / 100, answerText: `${H} س ${String(M).padStart(2, '0')} دق`, tol: 0.001, hint: 'اجمع الساعات معا والدقائق معا ؛ إذا تجاوزت الدقائق 60 حوّلها إلى ساعة.', explain: `${h1} س ${m1} دق + ${dh} س ${dm} دق = ${H} س ${String(M).padStart(2, '0')} دق` }; } const s = m6pick([90, 150, 200, 270, 330, 450]); return { q: `حوّل ${s} ثانية إلى دقائق وثوان (مثال : 2,30 تعني 2 دق و 30 ثا)`, answer: Math.floor(s / 60) + (s % 60) / 100, answerText: `${Math.floor(s / 60)} دق ${s % 60} ثا`, tol: 0.001, hint: '1 دق = 60 ثا : اقسم على 60.', explain: `${s} = ${Math.floor(s / 60)} × 60 + ${s % 60} ← ${Math.floor(s / 60)} دق و ${s % 60} ثا` }; }
  },
  geometrie: {
    1() { const L = m6r(5, 30), l = m6r(3, L - 1); if (Math.random() < .3) { const c = m6r(4, 25); const per = Math.random() < .5; return { q: `مربّع طول ضلعه ${c} صم. أحسب ${per ? 'محيطه' : 'مساحته'}.`, answer: per ? 4 * c : c * c, unit: per ? 'صم' : 'صم²', hint: per ? 'محيط المربّع = الضلع × 4' : 'مساحة المربّع = الضلع × الضلع', explain: per ? `${c} × 4 = ${4 * c} صم` : `${c} × ${c} = ${c * c} صم²` }; } const per = Math.random() < .5; return { q: `مستطيل طوله ${L} م وعرضه ${l} م. أحسب ${per ? 'محيطه' : 'مساحته'}.`, answer: per ? 2 * (L + l) : L * l, unit: per ? 'م' : 'م²', hint: per ? 'محيط المستطيل = (الطول + العرض) × 2' : 'مساحة المستطيل = الطول × العرض', explain: per ? `(${L} + ${l}) × 2 = ${2 * (L + l)} م` : `${L} × ${l} = ${L * l} م²` }; },
    2() { if (Math.random() < .5) { const b = m6pick([4, 6, 8, 10, 12, 15]), h = m6pick([3, 5, 6, 7, 9, 10]); return { q: `مثلّث قاعدته ${b} صم وارتفاعه ${h} صم. أحسب مساحته.`, answer: b * h / 2, unit: 'صم²', hint: 'مساحة المثلّث = القاعدة × الارتفاع ÷ 2', explain: `${b} × ${h} ÷ 2 = ${m6fmt(b * h / 2)} صم²` }; } const r = m6pick([2, 3, 5, 7, 10, 12]); const dia = Math.random() < .5; return { q: `دائرة ${dia ? 'قطرها' : 'شعاعها'} ${dia ? 2 * r : r} صم. أحسب محيطها (π ≈ 3,14).`, answer: +(2 * r * 3.14).toFixed(2), unit: 'صم', tol: .02, hint: 'محيط الدائرة = القطر × 3,14 = الشعاع × 2 × 3,14', explain: `${2 * r} × 3,14 = ${m6fmt(2 * r * 3.14)} صم` }; },
    3() { if (Math.random() < .4) { const c = m6r(2, 9); return { q: `مكعّب طول حرفه ${c} صم. أحسب حجمه.`, answer: c ** 3, unit: 'صم³', hint: 'حجم المكعّب = الحرف × الحرف × الحرف', explain: `${c} × ${c} × ${c} = ${c ** 3} صم³` }; } const L = m6r(4, 12), l = m6r(2, 8), h = m6r(2, 10); const toL = Math.random() < .4; return { q: `متوازي مستطيلات أبعاده ${L} دسم × ${l} دسم × ${h} دسم. أحسب حجمه${toL ? ' باللتر' : ' بالدسم³'}.`, answer: L * l * h, unit: toL ? 'ل' : 'دسم³', hint: 'الحجم = الطول × العرض × الارتفاع' + (toL ? ' ؛ 1 دسم³ = 1 ل' : ''), explain: `${L} × ${l} × ${h} = ${L * l * h} دسم³${toL ? ' = ' + (L * l * h) + ' ل' : ''}` }; }
  },
  problemes: {
    1() { const n = m6pick(M6_NAMES); const [it, pr] = m6pick(M6_SHOPS); const k = m6r(2, 6); const pay = m6pick([20, 50, 100, 200, 500].filter(x => x > pr * k)); return { q: `اشترى ${n} ${k} ${it} بثمن ${m6fmt(pr)} د للواحد ودفع ورقة من فئة ${pay} د. كم يُرجع له البائع ؟`, answer: +(pay - pr * k).toFixed(3), unit: 'د', tol: .01, hint: `أحسب أوّلا الثمن الجملي : ${m6fmt(pr)} × ${k}.`, explain: `الثمن الجملي = ${m6fmt(pr * k)} د ← الباقي = ${pay} − ${m6fmt(pr * k)} = ${m6fmt(pay - pr * k)} د` }; },
    2() { if (Math.random() < .5) { const n = m6pick(M6_NAMES), m = m6pick([120, 150, 180, 240, 300]); const b = m6pick([2, 3, 4, 5]), a = m6r(1, b - 1); const spent = m * a / b; const extra = m6pick([10, 15, 20, 25]); return { q: `مع ${n} ${m} د. أنفق ${a}/${b} من ماله لشراء كتب ثمّ ${extra} د لشراء هديّة. كم بقي له ؟`, answer: m - spent - extra, unit: 'د', hint: `أحسب ${a}/${b} من ${m} أوّلا.`, explain: `${a}/${b} من ${m} = ${spent} د ← ${m} − ${spent} − ${extra} = ${m - spent - extra} د` }; } const L = m6r(12, 40), l = m6r(6, L - 2); const pr = m6pick([1.5, 2, 2.5, 3, 4]); return { q: `حديقة مستطيلة طولها ${L} م وعرضها ${l} م. نريد إحاطتها بسياج ثمن المتر الواحد منه ${m6fmt(pr)} د. ما ثمن السياج ؟`, answer: 2 * (L + l) * pr, unit: 'د', hint: 'أحسب المحيط أوّلا ثمّ اضربه في ثمن المتر.', explain: `المحيط = (${L} + ${l}) × 2 = ${2 * (L + l)} م ← ${2 * (L + l)} × ${m6fmt(pr)} = ${m6fmt(2 * (L + l) * pr)} د` }; },
    3() { if (Math.random() < .5) { const ha = m6pick([1.5, 2, 2.4, 3, 3.6, 4.5]); const b = m6pick([2, 3, 4, 5, 8]), a = m6r(1, b - 1); const part = ha * a / b; const yieldQ = m6pick([2, 2.5, 3, 4]); const prodT = part * yieldQ; const price = m6pick([400, 500, 600, 800]); return { q: `يملك فلاح أرضا مساحتها ${m6fmt(ha)} هك، خصّص ${a}/${b} منها لزراعة القمح. ينتج الهكتار الواحد ${m6fmt(yieldQ)} طن، ويُباع الطن ب${price} د. ما المدخول الجملي ؟`, answer: +(prodT * price).toFixed(2), unit: 'د', tol: .01, hint: `1) مساحة القمح = ${m6fmt(ha)} × ${a}/${b}  2) الإنتاج = المساحة × ${m6fmt(yieldQ)}  3) المدخول = الإنتاج × ${price}`, explain: `المساحة = ${m6fmt(part)} هك ← الإنتاج = ${m6fmt(prodT)} طن ← المدخول = ${m6fmt(prodT)} × ${price} = ${m6fmt(prodT * price)} د` }; } const cap = m6pick([120, 150, 200, 240, 300]); const b = m6pick([3, 4, 5, 6]), a = m6r(1, b - 1); const used = cap * a / b; const cands = [5, 6, 8, 10, 12].filter(x => used % x === 0); const perDay = cands.length ? m6pick(cands) : 5; return { q: `خزّان سعته ${cap} ل يحتوي على ${a}/${b} من سعته من الماء. تستهلك العائلة ${perDay} ل يوميّا. بعد كم يوما يفرغ الخزّان ؟`, answer: used / perDay, unit: 'يوما', tol: .01, hint: `كمّية الماء = ${cap} × ${a}/${b} ، ثمّ اقسم على ${perDay}.`, explain: `الماء = ${m6fmt(used)} ل ← ${m6fmt(used)} ÷ ${perDay} = ${m6fmt(used / perDay)} يوما` }; }
  }
};
/* --- suite (vue, jeu, résultats) : voir plus bas --- */

// ---------- vue d'accueil ----------
VIEWS.math6 = async function (el) { App.cache.icTab = 'math6'; App.route = 'interactive'; return VIEWS.interactive(el); };
async function renderMath6(el) {
  if (M6.unit && !M6.done && M6.qs.length) return m6RenderGame(el); // partie en cours : rendu immédiat, sans appel réseau
  try { const r = (await api.get('/math6/progress' + (isStaff() && App.cache.m6All ? '?all=1' : ''))).data; M6.prog = r.mine || {}; M6.board = r.leaderboard || []; } catch { M6.prog = {}; M6.board = []; }
  const totalPts = Object.values(M6.prog).reduce((a, x) => a + (x.best || 0), 0);
  const series = Object.keys(M6.prog).length;
  const stars = Object.values(M6.prog).reduce((a, x) => a + (x.stars || 0), 0);
  const max = M6_N * M6_PTS[0];
  el.innerHTML = `
  <div class="bg-gradient-to-l from-fuchsia-600 to-violet-700 text-white rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3" dir="rtl">
    <div><div class="text-2xl font-bold">🧮 رياضيات السنة السادسة</div><div class="text-xs opacity-80">تمارين تفاعلية لا نهائية · Maths 6e — exercices générés</div></div>
    <div class="flex items-center gap-2 text-sm flex-wrap"><span class="bg-white/20 font-bold px-3 py-1.5 rounded-full"><i class="fas fa-star ml-1"></i>${totalPts} نقطة</span><span class="bg-white/20 font-bold px-3 py-1.5 rounded-full">⭐ ${stars}</span><span class="bg-white/20 font-bold px-3 py-1.5 rounded-full">${series} سلسلة</span>
    ${isStaff() ? `<button onclick="App.cache.m6All=!App.cache.m6All; render()" class="bg-white text-violet-700 font-bold px-3 py-1.5 rounded-full text-xs"><i class="fas fa-users ml-1"></i>${App.cache.m6All ? 'إخفاء المتابعة' : 'متابعة التلاميذ'}</button>` : ''}</div>
  </div>
  ${isStaff() && App.cache.m6All ? m6TeacherBoard(M6.board) : ''}
  <div dir="rtl" class="text-right">
    <div class="flex items-center gap-2 mb-3 flex-wrap"><span class="text-xs font-bold text-gray-500">المستوى</span>${[1, 2, 3].map(L => `<button onclick="M6.level=${L}; render()" class="px-3 py-1 rounded-full text-xs font-bold ${M6.level === L ? 'bg-violet-600 text-white' : 'bg-white border text-gray-600'}">${['', '⭐ مبتدئ', '⭐⭐ متوسّط', '⭐⭐⭐ متقدّم'][L]}</button>`).join('')}<span class="text-xs text-gray-400 mr-auto">${M6_N} أسئلة في كلّ سلسلة · ${M6_PTS[0]} نقاط للإجابة الصحيحة من أوّل محاولة</span></div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6" id="m6-units">
      ${Object.entries(M6_UNITS).map(([k, u]) => { const p = M6.prog[`${k}_${M6.level}`]; return `
      <button onclick="m6Start('${k}')" class="text-right bg-gradient-to-br ${u.color} text-white rounded-2xl p-4 shadow hover:scale-[1.03] transition relative overflow-hidden" aria-label="${esc(u.ar)} — ${esc(u.fr)}">
        <div class="text-4xl mb-2">${u.emoji}</div>
        <div class="font-bold text-lg leading-tight">${u.ar}</div>
        <div class="text-xs opacity-80">${u.fr}</div>
        <div class="text-[11px] opacity-90 mt-1">${u.skills[M6.level - 1]}</div>
        <div class="mt-3 flex items-center justify-between text-xs"><span class="bg-white/25 rounded-full px-2 py-0.5">${p ? `أفضل نتيجة ${p.best}/${max}` : 'لم تُلعب بعد'}</span><span>${p ? '⭐'.repeat(p.stars) : ''}</span></div>
        <div class="absolute bottom-0 left-0 h-1 bg-white/60" style="width:${p ? Math.round(p.best * 100 / max) : 0}%"></div>
      </button>`; }).join('')}
    </div>
    ${M6.board.length && !(isStaff() && App.cache.m6All) ? `<div class="bg-white rounded-xl shadow p-4 max-w-md"><h4 class="font-bold text-gray-700 mb-2">🏆 لوحة الشرف</h4>${M6.board.slice(0, 10).map((b, i) => `<div class="flex items-center justify-between text-sm py-1 border-b last:border-0 ${b.me ? 'font-bold text-violet-700' : ''}"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${esc(b.name)}</span><span>${b.points} ن · ${b.series} سلسلة</span></div>`).join('')}</div>` : ''}
  </div>`;
}
function m6TeacherBoard(rows) {
  return `<div class="bg-white rounded-xl shadow p-4 mb-4"><h4 class="font-bold text-gray-700 mb-2"><i class="fas fa-users text-violet-600 mr-1"></i>Suivi des élèves — رياضيات السادسة</h4>
  ${rows.length ? `<div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr><th>Élève</th><th>Séries</th><th>Points</th><th>Étoiles</th><th>Unités maîtrisées (≥ 80 %)</th><th>Dernière activité</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td class="font-semibold">${esc(r.name)}</td><td>${r.series}</td><td>${r.points}</td><td>${r.stars}</td><td class="text-xs">${(r.mastered || []).map(k => { const [u, L] = k.split('_'); return `<span class="badge badge-green">${M6_UNITS[u]?.emoji || ''} ${esc(M6_UNITS[u]?.fr || u)} N${L}</span>`; }).join(' ') || '—'}</td><td class="text-xs text-gray-500">${r.last ? fmtDT(r.last) : '—'}</td></tr>`).join('')}
  </tbody></table></div>` : '<p class="text-sm text-gray-400">Aucun élève n\u2019a encore joué.</p>'}</div>`;
}

// ---------- jeu ----------
function m6Start(unit) {
  Object.assign(M6, { unit, qs: [], i: 0, tries: 0, score: 0, streak: 0, hint: false, done: false, answered: null, lastPick: null, t0: Date.now() });
  const gen = M6_GEN[unit][M6.level]; const seen = new Set();
  let guard = 0; while (M6.qs.length < M6_N && guard++ < 300) { const q = gen(); if (seen.has(q.q)) continue; seen.add(q.q); M6.qs.push(q); }
  clearInterval(M6.timer); M6.timer = setInterval(() => { const t = document.getElementById('m6-timer'); if (t) t.textContent = m6Elapsed(); else clearInterval(M6.timer); }, 1000);
  render();
}
function m6Elapsed() { const s = Math.floor((Date.now() - M6.t0) / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function m6Quit() { clearInterval(M6.timer); M6.unit = null; M6.qs = []; M6.done = false; render(); }
function m6RenderGame(el) {
  const u = M6_UNITS[M6.unit], q = M6.qs[M6.i], isMcq = Array.isArray(q.options);
  const st = M6.answered; // null | 'ok' | 'retry' | 'fail'
  const locked = st === 'ok' || st === 'fail';
  el.innerHTML = `
  <div dir="rtl" class="max-w-3xl mx-auto" id="m6-game">
    <div class="flex items-center justify-between gap-2 mb-3 flex-wrap">
      <button onclick="m6Quit()" class="${btnSecondary} text-sm"><i class="fas fa-arrow-right ml-1"></i> الوحدات</button>
      <div class="font-bold text-gray-800">${u.emoji} ${u.ar} <span class="text-xs text-gray-400 font-normal">· ${['', 'مبتدئ', 'متوسّط', 'متقدّم'][M6.level]}</span></div>
      <div class="flex items-center gap-2 text-sm"><span class="bg-violet-100 text-violet-800 font-bold px-3 py-1 rounded-full"><i class="fas fa-star ml-1"></i><span id="m6-score">${M6.score}</span></span>${M6.streak >= 3 ? `<span class="bg-orange-100 text-orange-700 font-bold px-2 py-1 rounded-full">🔥 ${M6.streak}</span>` : ''}<span class="bg-gray-100 text-gray-600 font-mono px-2 py-1 rounded-full" id="m6-timer">${m6Elapsed()}</span></div>
    </div>
    <div class="flex gap-1 mb-4" aria-label="التقدّم">${M6.qs.map((x, i) => `<div class="flex-1 h-2 rounded-full ${i < M6.i ? (x.res === 'ok' ? 'bg-green-500' : x.res === 'retry' ? 'bg-amber-400' : 'bg-red-400') : i === M6.i ? 'bg-violet-500' : 'bg-gray-200'}"></div>`).join('')}</div>
    <div class="bg-white rounded-2xl shadow-lg p-6 border-t-4 border-violet-500">
      <div class="text-xs text-gray-400 mb-2">السؤال ${M6.i + 1} / ${M6_N}</div>
      <p class="text-xl font-bold text-gray-800 leading-relaxed ar" id="m6-q">${esc(q.q)}</p>
      ${M6.hint ? `<p class="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2"><i class="fas fa-lightbulb ml-1"></i>${esc(q.hint)}</p>` : ''}
      <div class="mt-5">
        ${isMcq ? `<div class="grid grid-cols-2 gap-3">${q.options.map((o, i) => `<button onclick="m6Answer(${i})" ${locked ? 'disabled' : ''} class="m6-opt px-4 py-3 rounded-xl border-2 text-lg font-bold transition ${locked && i === q.correct ? 'border-green-500 bg-green-50 text-green-700' : (M6.lastPick === i && st) ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 hover:border-violet-400 hover:bg-violet-50'}">${esc(o)}</button>`).join('')}</div>`
        : `<form onsubmit="event.preventDefault(); m6Answer(document.getElementById('m6-in').value)" class="flex items-center gap-2 flex-wrap">
            <input id="m6-in" inputmode="decimal" autocomplete="off" ${locked ? 'disabled' : ''} class="flex-1 min-w-[160px] border-2 rounded-xl px-4 py-3 text-2xl font-bold text-center ${st === 'ok' ? 'border-green-500 bg-green-50' : st ? 'border-red-400 bg-red-50' : 'border-violet-300 focus:border-violet-600'}" placeholder="${q.frac ? 'مثال : 3/4' : '؟'}" dir="ltr" aria-label="الإجابة">
            ${q.unit ? `<span class="text-lg font-bold text-gray-600">${q.unit}</span>` : ''}
            ${locked ? '' : `<button type="submit" class="${btnPrimary} text-lg px-6 py-3 bg-violet-600 hover:bg-violet-700" id="m6-check"><i class="fas fa-check ml-1"></i> تحقّق</button>`}
          </form>
          ${locked ? '' : `<div class="flex gap-1 mt-2 flex-wrap md:hidden" aria-label="لوحة الأرقام">${['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', ',', '/'].map(k => `<button type="button" onclick="m6Key('${k}')" class="w-10 h-10 rounded-lg border bg-gray-50 hover:bg-violet-50 font-bold text-gray-700">${k}</button>`).join('')}<button type="button" onclick="m6Key('⌫')" class="w-14 h-10 rounded-lg border bg-gray-50 font-bold text-gray-700">⌫</button></div>`}`}
      </div>
      <div class="mt-4 min-h-[2rem]" aria-live="polite" id="m6-feedback">
        ${st === 'ok' ? `<p class="text-green-700 font-bold text-lg">${m6pick(['أحسنت ! ✅', 'ممتاز ! 🌟', 'رائع ! 🎉', 'صحيح ! 👏'])} <span class="text-sm font-normal text-gray-500">+${M6.lastPts} نقاط</span></p><p class="text-sm text-gray-600 mt-1">${esc(q.explain)}</p>` : ''}
        ${st === 'retry' ? `<p class="text-amber-700 font-bold">ليس صحيحا… حاول مرّة أخرى 💪 <span class="text-xs font-normal">(محاولة ثانية = ${M6_PTS[1]} نقاط)</span></p>` : ''}
        ${st === 'fail' ? `<p class="text-red-600 font-bold">الإجابة الصحيحة : <span dir="ltr">${esc(q.answerText || (isMcq ? q.options[q.correct] : m6fmt(q.answer)))}</span> ${q.unit || ''}</p><p class="text-sm text-gray-600 mt-1">${esc(q.explain)}</p>` : ''}
      </div>
      <div class="flex items-center justify-between mt-4 flex-wrap gap-2">
        <div class="flex gap-2">
          ${!locked ? `<button onclick="m6Hint()" ${M6.hint ? 'disabled' : ''} class="${btnSecondary} text-sm" id="m6-hint"><i class="fas fa-lightbulb text-amber-500 ml-1"></i> إرشاد (−${M6_HINT})</button>` : ''}
          ${typeof openTutor === 'function' ? `<button onclick="m6AskTutor()" class="${btnSecondary} text-sm"><i class="fas fa-robot text-violet-600 ml-1"></i> اسأل رفيق</button>` : ''}
        </div>
        ${locked ? `<button onclick="m6Next()" class="${btnPrimary} bg-violet-600 hover:bg-violet-700 text-lg px-6" id="m6-next">${M6.i + 1 < M6_N ? 'التالي ←' : 'النتيجة 🏁'}</button>` : ''}
      </div>
    </div>
  </div>`;
  const inp = document.getElementById('m6-in'); if (inp && !inp.disabled) setTimeout(() => inp.focus(), 50);
  const nx = document.getElementById('m6-next'); if (nx) setTimeout(() => nx.focus(), 50);
}
function m6AskTutor() { const q = M6.qs[M6.i]; openTutor({ lang: 'ar', subject: 'الرياضيات', question: 'اشرح لي كيف أحلّ هذا التمرين خطوة خطوة دون إعطاء الجواب النهائي : ' + q.q }); }
function m6Key(k) { const i = document.getElementById('m6-in'); if (!i) return; if (k === '⌫') i.value = i.value.slice(0, -1); else i.value += k; i.focus(); }
function m6Hint() { if (M6.hint) return; M6.hint = true; M6.score = Math.max(0, M6.score - M6_HINT); render(); }
function m6Answer(v) {
  const q = M6.qs[M6.i]; if (M6.answered === 'ok' || M6.answered === 'fail') return;
  let ok;
  if (Array.isArray(q.options)) { M6.lastPick = Number(v); ok = Number(v) === q.correct; }
  else { const n = m6parse(v); if (isNaN(n)) { toast('اكتب عددا من فضلك', 'warning'); return; } const tol = q.tol !== undefined ? q.tol : 0.005; ok = Math.abs(n - q.answer) <= tol; }
  if (ok) { M6.lastPts = M6_PTS[M6.tries] || 0; M6.score += M6.lastPts; M6.streak++; q.res = M6.tries === 0 ? 'ok' : 'retry'; M6.answered = 'ok'; if (M6.streak % 5 === 0 && typeof confetti === 'function') { try { confetti({ particleCount: 60, spread: 70, origin: { y: .7 } }); } catch {} } }
  else { M6.tries++; M6.streak = 0; if (M6.tries >= 2) { q.res = 'fail'; M6.answered = 'fail'; } else M6.answered = 'retry'; }
  render();
}
function m6Next() {
  M6.i++; M6.tries = 0; M6.hint = false; M6.answered = null; M6.lastPick = null;
  if (M6.i >= M6_N) { clearInterval(M6.timer); M6.done = true; return m6Finish(); }
  render();
}

// ---------- résultats ----------
async function m6Finish() {
  const max = M6_N * M6_PTS[0], score = M6.score, pct = score / max;
  const stars = pct >= .9 ? 5 : pct >= .75 ? 4 : pct >= .6 ? 3 : pct >= .4 ? 2 : 1;
  const el = document.getElementById('sit-root') || document.getElementById('main-content');
  let saved = null; try { saved = (await api.post('/math6/progress', { unit: M6.unit, level: M6.level, score, max, seconds: Math.floor((Date.now() - M6.t0) / 1000) })).data; } catch {}
  if (stars >= 4 && typeof confetti === 'function') { try { confetti({ particleCount: 150, spread: 90, origin: { y: .6 } }); } catch {} }
  const u = M6_UNITS[M6.unit];
  const wrong = M6.qs.filter(x => x.res !== 'ok');
  el.innerHTML = `
  <div dir="rtl" class="max-w-2xl mx-auto" id="m6-result">
    <div class="bg-white rounded-2xl shadow-lg p-8 text-center border-t-4 border-violet-500">
      <div class="text-5xl mb-2">${u.emoji}</div>
      <h3 class="text-2xl font-bold text-gray-800">${pct >= .9 ? 'مذهل ! 🏆' : pct >= .6 ? 'أحسنت ! 🎉' : 'لا بأس، واصل التدرّب 💪'}</h3>
      <div class="text-amber-500 text-3xl my-2">${'⭐'.repeat(stars)}<span class="text-gray-300">${'⭐'.repeat(5 - stars)}</span></div>
      <p class="text-4xl font-black text-violet-700">${score} <span class="text-lg text-gray-400 font-normal">/ ${max}</span></p>
      <p class="text-sm text-gray-500 mt-1">⏱️ ${m6Elapsed()} · ${M6.qs.filter(x => x.res === 'ok').length} إجابة صحيحة من أوّل محاولة${saved && saved.improved ? ' · 🆕 رقم قياسي جديد !' : ''}</p>
      ${wrong.length ? `<details class="text-right mt-4 bg-gray-50 rounded-xl p-3"><summary class="cursor-pointer font-bold text-gray-700 text-sm">مراجعة الأخطاء (${wrong.length})</summary><div class="mt-2 space-y-2 text-sm">${wrong.map(x => `<div class="border-b pb-2"><p class="font-semibold">${esc(x.q)}</p><p class="text-green-700">الجواب : <span dir="ltr">${esc(x.answerText || (Array.isArray(x.options) ? x.options[x.correct] : m6fmt(x.answer)))}</span> ${x.unit || ''}</p><p class="text-gray-500 text-xs">${esc(x.explain)}</p></div>`).join('')}</div></details>` : ''}
      <div class="flex justify-center gap-3 mt-6 flex-wrap">
        <button onclick="m6Start('${M6.unit}')" class="${btnPrimary} bg-violet-600 hover:bg-violet-700"><i class="fas fa-rotate ml-1"></i> سلسلة جديدة</button>
        ${M6.level < 3 && pct >= .75 ? `<button onclick="M6.level=${M6.level + 1}; m6Start('${M6.unit}')" class="${btnPrimary} bg-green-600 hover:bg-green-700"><i class="fas fa-arrow-up ml-1"></i> المستوى التالي</button>` : ''}
        <button onclick="m6Quit()" class="${btnSecondary}">الوحدات</button>
      </div>
    </div>
  </div>`;
}
