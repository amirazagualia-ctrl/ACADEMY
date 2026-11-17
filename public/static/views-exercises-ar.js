/* ============================================================
   Rahma Academy — views-exercises-ar.js
   F66 — 📚 ورشة التمارين : application autonome de l'école
   (maths + éveil scientifique, 6e année, arabe, RTL) INTÉGRÉE
   comme onglet de « Cours interactifs ».

   • Contenu pédagogique : /static/exercises-ar-data.js (window.EXA_DATA)
   • Thème : celui de « Cours interactifs » (cartes blanches, bleu/indigo,
     mode sombre de la plateforme) — la palette « cahier » d'origine est
     remplacée par les jetons --ink / --soft / --muted / --card, mappés
     sur le design system Rahma dans styles.css.
   • Progression : GET|POST /api/exercices/progress (settings.exercices_progress)
   • Suivi enseignant : ?all=1 (admin/enseignant)
   ============================================================ */

const EXA = {
  subj: 'math',
  set: null,
  qs: [],
  i: 0,
  tries: 0,
  done: false,
  pts: 0,
  res: [],
  missed: [],
  vals: [],
  prog: {},
  board: {},
  reset: false,
  hint: false,
  last: null,
  loading: false
};

// ---------- jetons de style (palette « Cours interactifs ») ----------
const EXA_OPT_BASE = 'w-full text-right px-4 py-3 rounded-xl border-2 transition text-lg leading-relaxed';
const EXA_OPT = EXA_OPT_BASE + ' border-slate-200 bg-white text-gray-800 hover:border-indigo-400 hover:bg-indigo-50';
const EXA_OPT_OK = EXA_OPT_BASE + ' border-green-500 bg-green-50 text-green-700 font-bold';
const EXA_OPT_BAD = EXA_OPT_BASE + ' border-red-400 bg-red-50 text-red-500 line-through';
const EXA_INPUT = 'w-40 max-w-full text-center text-2xl font-bold rounded-xl border-2 px-3 py-2 bg-white text-gray-800';
const EXA_INPUT_OK = EXA_INPUT + ' border-green-500 bg-green-50 text-green-700';
const EXA_INPUT_BAD = EXA_INPUT + ' border-red-400 bg-red-50 text-red-600';
const EXA_ROW = 'rounded-xl border-2 p-3 grid gap-2';
const EXA_ROW_NEUTRAL = EXA_ROW + ' border-slate-200';
const EXA_ROW_OK = EXA_ROW + ' border-green-500 bg-green-50';
const EXA_ROW_BAD = EXA_ROW + ' border-red-400 bg-red-50';
const EXA_BTN = 'px-5 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-bold text-base';
const EXA_BTN_ALT = 'px-5 py-2.5 rounded-xl bg-white border border-slate-200 text-gray-700 hover:bg-gray-50 font-semibold text-sm';

// ---------- utilitaires ----------
function exaD() {
  return window.EXA_DATA || { FIG: {}, SUBJECTS: [], PRAISE: [] };
}
function exaRoot() {
  return document.getElementById('exa-root');
}
function exaEl(sel) {
  const r = exaRoot();
  return r ? r.querySelector(sel) : null;
}
function exaAll(sel) {
  const r = exaRoot();
  return r ? Array.from(r.querySelectorAll(sel)) : [];
}
function exaFind(id) {
  const subs = exaD().SUBJECTS || [];
  for (const s of subs) for (let k = 0; k < s.sets.length; k++) if (s.sets[k].id === id) return { s, set: s.sets[k], idx: k };
  return null;
}
function exaFig(name) {
  const f = exaD().FIG || {};
  return name && typeof f[name] === 'function' ? f[name]() : '';
}
function exaParseNum(v) {
  const s = String(v == null ? '' : v)
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[٫,،]/g, '.')
    .replace(/\s/g, '');
  return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
}
function exaStarsHtml(n) {
  let o = '<span class="tracking-widest text-sm" aria-label="' + n + ' من 3 نجوم">';
  for (let k = 0; k < 3; k++) o += '<span class="' + (k < n ? 'text-amber-400' : 'text-gray-300') + '">★</span>';
  return o + '</span>';
}
/** réponse attendue d'une question (num/mcq/sort/match/fill) */
function exaRowAns(q) {
  if (q.t === 'sort') return q.items.map(x => x[1]);
  if (q.t === 'match') return q.rows.map(x => x[1]);
  return q.ans;
}
function exaAnsText(q) {
  if (q.t === 'num') return q.a + (q.unit ? ' ' + q.unit : '');
  if (q.t === 'mcq') return q.opts[q.a];
  if (q.t === 'sort') return q.items.map(x => x[0] + ' ← ' + q.bins[x[1]]).join(' ، ');
  if (q.t === 'match') return q.rows.map(x => x[0] + ' ← ' + q.bank[x[1]]).join(' ، ');
  return (q.ans || []).map(i => q.bank[i]).join(' ، ');
}
function exaMaxStars() {
  return (exaD().SUBJECTS || []).reduce((t, s) => t + s.sets.length * 3, 0);
}
function exaTotalStars() {
  return Object.keys(EXA.prog).reduce((t, k) => t + (EXA.prog[k].stars || 0), 0);
}
function exaPraise() {
  const p = exaD().PRAISE || ['أحسنت !'];
  return p[Math.floor(Math.random() * p.length)];
}

// ---------- progression (serveur) ----------
async function exaLoadProgress() {
  try {
    const all = isStaff() && App.cache.exaAll ? '?all=1' : '';
    const r = (await api.get('/exercices/progress' + all)).data || {};
    EXA.prog = r.mine || {};
    EXA.board = r.leaderboard || [];
  } catch {
    EXA.prog = {};
    EXA.board = [];
  }
}
async function exaSaveProgress(pct, stars) {
  if (!EXA.set) return null;
  try {
    const r = (await api.post('/exercices/progress', { set_id: EXA.set.id, subject: EXA.subj, score: EXA.pts, max: EXA.qs.length || 1, stars })).data;
    if (r && r.entry) EXA.prog[EXA.set.id] = r.entry;
    return r;
  } catch {
    return null;
  }
}

// ---------- rendu ----------
function exaPaint(html) {
  const r = exaRoot();
  if (!r) return;
  r.innerHTML = html;
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch {}
}

/** Grille de cartes des séries, dans le style des cartes « Cours interactifs ». */
function exaHome() {
  EXA.set = null;
  EXA.qs = [];
  const d = exaD();
  const subj = (d.SUBJECTS || []).filter(s => s.id === EXA.subj)[0] || (d.SUBJECTS || [])[0];
  if (!subj) return exaPaint('<p class="text-sm text-gray-400">لا يوجد محتوى.</p>');
  const sets = subj.sets || [];
  const doneCount = sets.filter(s => EXA.prog[s.id]).length;
  const html = `
  <div dir="rtl" id="exa-home" class="ar">
    <div class="bg-gradient-to-l from-blue-600 to-indigo-700 text-white rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
      <div>
        <div class="text-2xl font-bold"><i class="fas fa-book-open-reader ml-2"></i>ورشة التمارين</div>
        <div class="text-xs opacity-85">تمارين للسنة السادسة ابتدائي · التصحيح بعد كلّ سؤال</div>
      </div>
      <div class="flex items-center gap-2 text-sm flex-wrap">
        <span class="bg-white/20 font-bold px-3 py-1.5 rounded-full" title="مجموع النجوم"><i class="fas fa-star text-amber-300 ml-1"></i>${exaTotalStars()} / ${exaMaxStars()}</span>
        <span class="bg-white/20 font-bold px-3 py-1.5 rounded-full">${doneCount} / ${sets.length} سلاسل</span>
        ${isStaff() ? `<button onclick="App.cache.exaAll=!App.cache.exaAll; exaReload()" class="bg-white text-indigo-700 font-bold px-3 py-1.5 rounded-full text-xs"><i class="fas fa-users ml-1"></i>${App.cache.exaAll ? 'إخفاء المتابعة' : 'متابعة التلاميذ'}</button>` : ''}
      </div>
    </div>
    ${isStaff() && App.cache.exaAll ? exaTeacherBoard() : ''}
    <div class="grid grid-cols-2 gap-3 mb-4" role="group" aria-label="المادّة">
      ${(d.SUBJECTS || []).map(s => `
        <button onclick="EXA.subj='${s.id}'; EXA.reset=false; exaHome();" aria-pressed="${s.id === EXA.subj}"
          class="rounded-xl border-2 px-3 py-2.5 text-center transition ${s.id === EXA.subj ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-gray-700 hover:border-indigo-300'}">
          <span class="block font-bold text-lg leading-tight">${esc(s.name)}</span>
          <span class="block text-xs ${s.id === EXA.subj ? 'text-indigo-100' : 'text-gray-400'}">${s.sets.length} سلاسل</span>
        </button>`).join('')}
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      ${sets.map(set => {
        const p = EXA.prog[set.id] || {};
        const pct = p.pct != null ? Math.round(p.pct * 100) : p.best != null ? Math.round(p.best * 100) : null;
        return `
        <button onclick="exaStart('${set.id}')" class="text-right bg-white rounded-xl shadow border border-slate-100 p-4 flex flex-col gap-1 hover:border-indigo-300 hover:shadow-md transition">
          <span class="font-bold text-gray-800 text-lg leading-tight">${esc(set.title)}</span>
          <span class="text-sm text-gray-500 leading-snug">${esc(set.blurb || '')}</span>
          <span class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-gray-500">
            <span>${set.qs.length} أسئلة${pct != null ? ' · ' + pct + '%' : ''}</span>
            ${exaStarsHtml(p.stars || 0)}
          </span>
          <span class="block h-1 rounded-full bg-slate-100 overflow-hidden"><span class="block h-1 bg-indigo-500" style="width:${pct || 0}%"></span></span>
        </button>`;
      }).join('')}
    </div>
    <button onclick="exaResetProgress()" class="mt-6 text-xs text-gray-400 underline hover:text-red-600">${EXA.reset ? 'اضغط مرّة أخرى لمسح التقدّم' : 'مسح التقدّم'}</button>
  </div>`;
  exaPaint(html);
}

function exaTeacherBoard() {
  const rows = EXA.board || [];
  return `
  <div class="bg-white rounded-xl shadow p-4 mb-4">
    <h4 class="font-bold text-gray-700 mb-2"><i class="fas fa-users text-indigo-600 ml-1"></i>Suivi des élèves — ورشة التمارين</h4>
    ${rows.length ? `<div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr><th>Élève</th><th>Séries</th><th>Points</th><th>Étoiles</th><th>Dernière activité</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td class="font-semibold">${esc(r.name)}</td><td>${r.sets || 0}</td><td>${r.points || 0}</td><td>${r.stars || 0}</td><td class="text-xs text-gray-500">${r.last ? fmtDT(r.last) : '—'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="text-sm text-gray-400">Aucun élève n’a encore joué.</p>'}
  </div>`;
}

async function exaReload() {
  await exaLoadProgress();
  if (EXA.set && EXA.qs.length && !EXA.done) return exaQuestion();
  exaHome();
}

// ---------- exercice ----------
function exaStart(id) {
  const f = exaFind(id);
  if (!f) return exaHome();
  Object.assign(EXA, { set: f.set, qs: f.set.qs, i: 0, tries: 0, done: false, pts: 0, res: [], missed: [], vals: [], last: null, hint: false });
  exaQuestion();
}

function exaQuestion() {
  const set = EXA.set;
  const q = set.qs[EXA.i];
  Object.assign(EXA, { tries: 0, done: false, vals: [], last: null, hint: false });
  const dots = set.qs
    .map((_, k) => {
      const c = k === EXA.i ? 'bg-indigo-500' : EXA.res[k] === 'ok' ? 'bg-green-500' : EXA.res[k] === 'half' ? 'bg-amber-400' : EXA.res[k] === 'no' ? 'bg-red-400' : 'bg-slate-200';
      return `<i class="flex-1 h-2 rounded-full max-w-[34px] ${c}"></i>`;
    })
    .join('');
  const support = set.intro
    ? `<details class="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 mb-3" open>
         <summary class="cursor-pointer font-bold text-sm text-gray-700">السّند</summary>
         <p class="mt-1.5 text-[15px] text-gray-700 leading-relaxed">${esc(set.intro)}</p>
         ${set.fig ? `<div class="max-w-md mx-auto mt-2 exa-fig">${exaFig(set.fig)}</div>` : ''}
       </details>`
    : set.fig
      ? `<div class="max-w-md mx-auto mb-3 exa-fig">${exaFig(set.fig)}</div>`
      : '';
  exaPaint(`
  <div dir="rtl" class="ar" id="exa-game">
    <div class="flex items-center gap-3 mb-3 flex-wrap">
      <button onclick="exaHome()" class="${EXA_BTN_ALT}"><i class="fas fa-arrow-right ml-1"></i>الرئيسية</button>
      <div class="flex gap-1.5 flex-1 min-w-[120px]" aria-hidden="true">${dots}</div>
      <span class="text-xs text-gray-400 font-semibold">${EXA.i + 1} / ${set.qs.length}</span>
    </div>
    <div class="bg-white rounded-2xl shadow border-t-4 border-indigo-500 px-4 sm:px-6 py-5">
      <div class="text-xs text-gray-400 mb-2">${esc(set.title)} · السؤال ${EXA.i + 1} من ${set.qs.length}</div>
      ${support}
      <h2 class="text-xl sm:text-2xl font-bold text-gray-800 leading-relaxed mb-4">${esc(q.q)}</h2>
      ${q.fig ? `<div class="max-w-md mx-auto mb-4 exa-fig">${exaFig(q.fig)}</div>` : ''}
      <div id="exa-ans">${exaAnswerHtml(q)}</div>
      <div id="exa-fb" class="mt-4" aria-live="polite"></div>
      <div class="flex gap-2 mt-4 flex-wrap" id="exa-acts">
        ${q.t !== 'mcq' ? `<button class="${EXA_BTN}" onclick="exaCheck()"><i class="fas fa-check ml-1"></i>تحقّق</button>` : ''}
        ${q.h ? `<button class="${EXA_BTN_ALT}" onclick="exaShowHint()"><i class="fas fa-lightbulb text-amber-500 ml-1"></i>تلميح</button>` : ''}
      </div>
    </div>
  </div>`);
  const inp = exaEl('#exa-num');
  if (inp) inp.focus({ preventScroll: true });
}

/** sélecteur unique pour les questions « match » / « fill » */
function exaSelect(r, q) {
  return `<select data-exa-sel="${r}" onchange="exaSel(this)" aria-label="الإجابة"
    class="w-full max-w-md text-base px-2.5 py-1.5 rounded-lg border-2 border-slate-200 bg-white text-gray-800">
    <option value="-1">اختر…</option>
    ${q.bank.map((b, k) => `<option value="${k}">${esc(b)}</option>`).join('')}
  </select>`;
}

function exaAnswerHtml(q) {
  if (q.t === 'mcq')
    return `<div class="grid gap-2.5">${q.opts.map((o, k) => `<button class="${EXA_OPT}" onclick="exaPick(${k})" data-exa-opt="${k}">${esc(o)}</button>`).join('')}</div>`;
  if (q.t === 'num')
    return `<div class="flex items-center gap-3 flex-wrap">
      <input id="exa-num" class="${EXA_INPUT}" type="text" inputmode="decimal" autocomplete="off" dir="ltr" aria-label="الإجابة" onkeydown="if(event.key==='Enter'){event.preventDefault();exaCheck()}">
      ${q.unit ? `<span class="text-lg font-bold text-gray-500">${esc(q.unit)}</span>` : ''}
    </div>`;
  if (q.t === 'sort')
    return `<div class="grid gap-3">${q.items
      .map(
        (it, r) => `<div class="${EXA_ROW_NEUTRAL}" data-exa-row="${r}" data-kind="sort">
        <p class="text-base leading-relaxed">${esc(it[0])}</p>
        <div class="flex gap-2 flex-wrap">${q.bins
          .map(
            (b, k) =>
              `<button onclick="exaSeg(${r},${k})" data-exa-seg="${r}-${k}" aria-pressed="false"
                 class="px-3.5 py-1 rounded-full border-2 border-slate-200 bg-white text-sm">${esc(b)}</button>`
          )
          .join('')}</div></div>`
      )
      .join('')}</div>`;
  if (q.t === 'match')
    return `<div class="grid gap-3">${q.rows
      .map(
        (rw, r) => `<div class="${EXA_ROW_NEUTRAL}" data-exa-row="${r}" data-kind="match">
        <p class="text-base leading-relaxed">${esc(rw[0])}</p>${exaSelect(r, q)}</div>`
      )
      .join('')}</div>`;
  return `<div class="leading-loose text-base">${String(q.text).replace(/\{(\d+)\}/g, (_, n) => exaSelect(Number(n), q))}</div>`;
}

function exaFeedback(cls, html) {
  const box = exaEl('#exa-fb');
  if (!box) return;
  const map = {
    good: 'bg-green-50 border-green-500',
    retry: 'bg-amber-50 border-amber-400',
    fix: 'bg-red-50 border-red-400',
    hint: 'bg-slate-50 border-slate-200'
  };
  box.innerHTML = `<div class="rounded-xl border-2 px-3.5 py-2.5 ${map[cls] || map.hint}">${html}</div>`;
}

function exaShowHint() {
  const q = EXA.set.qs[EXA.i];
  if (!q.h) return;
  EXA.hint = true;
  exaFeedback('hint', `<b class="font-bold">تلميح</b><p class="text-[15px] mt-0.5">${esc(q.h)}</p>`);
}

function exaLock() {
  EXA.done = true;
  exaAll('#exa-ans button, #exa-ans input, #exa-ans select').forEach(n => {
    n.disabled = true;
  });
  const acts = exaEl('#exa-acts');
  if (!acts) return;
  const last = EXA.i === EXA.set.qs.length - 1;
  acts.innerHTML = `<button class="${EXA_BTN}" onclick="exaNext()" id="exa-next"><i class="fas fa-arrow-left ml-1"></i>${last ? 'النتيجة' : 'السؤال التالي'}</button>`;
  const nx = exaEl('#exa-next');
  if (nx) nx.focus({ preventScroll: true });
}

function exaFinish(kind) {
  EXA.res[EXA.i] = kind;
  exaLock();
}

function exaResolve(ok) {
  const q = EXA.set.qs[EXA.i];
  if (ok) {
    EXA.pts += EXA.tries === 0 ? 1 : 0.5;
    exaFeedback('good', `<b class="font-bold text-green-700">${exaPraise()}</b><p class="text-[15px] text-gray-700 mt-0.5">${esc(q.why)}</p>`);
    exaFinish(EXA.tries === 0 ? 'ok' : 'half');
    if (typeof confetti === 'function' && EXA.res.filter(x => x === 'ok').length % 5 === 0) {
      try {
        confetti({ particleCount: 50, spread: 65, origin: { y: 0.7 } });
      } catch {}
    }
    return;
  }
  if (EXA.tries === 0) {
    EXA.tries = 1;
    exaFeedback('retry', `<b class="font-bold text-amber-700">حاول مرّة أخرى</b><p class="text-[15px] mt-0.5">${q.h ? 'تلميح: ' + esc(q.h) : 'أعد قراءة السؤال بتمعّن.'}</p>`);
    return;
  }
  EXA.missed.push(q);
  exaFeedback('fix', `<b class="font-bold text-red-600">الإصلاح</b><p class="text-[15px] text-red-600 mt-0.5">الجواب: ${esc(exaAnsText(q))}</p><p class="text-[15px] text-gray-700 mt-1">${esc(q.why)}</p>`);
  // mise en évidence de la bonne réponse
  if (q.t === 'mcq') exaAll('[data-exa-opt]').forEach((n, k) => k === q.a && n.classList.add('border-green-500', 'bg-green-50', 'font-bold'));
  if (q.t === 'num') {
    const inp = exaEl('#exa-num');
    if (inp) {
      inp.value = q.a;
      inp.className = EXA_INPUT_BAD;
    }
  }
  if (q.t === 'sort' || q.t === 'match' || q.t === 'fill') {
    const ans = exaRowAns(q);
    exaAll('[data-exa-row]').forEach(row => {
      row.className = EXA_ROW_OK;
    });
    exaAll('[data-exa-sel]').forEach((s, k) => {
      s.value = ans[k];
      s.classList.add('border-green-500', 'bg-green-50');
    });
    exaAll('[data-exa-seg]').forEach(b => {
      const [r, k] = b.getAttribute('data-exa-seg').split('-').map(Number);
      b.setAttribute('aria-pressed', String(k === ans[r]));
    });
  }
  exaFinish('no');
}

function exaCheck() {
  const q = EXA.set.qs[EXA.i];
  if (q.t === 'num') {
    const inp = exaEl('#exa-num');
    const v = exaParseNum(inp ? inp.value : '');
    if (isNaN(v)) {
      exaFeedback('retry', `<b class="font-bold">اكتب عددا</b><p class="text-[15px] mt-0.5">اكتب الجواب في الخانة ثمّ اضغط «تحقّق».</p>`);
      return;
    }
    const ok = Math.abs(v - q.a) < 1e-6;
    if (inp) inp.className = ok ? EXA_INPUT_OK : EXA_INPUT_BAD;
    exaResolve(ok);
    return;
  }
  const ans = exaRowAns(q);
  const n = ans.length;
  for (let i = 0; i < n; i++)
    if (EXA.vals[i] == null || EXA.vals[i] < 0) {
      exaFeedback('retry', `<b class="font-bold">أكمل الإجابة</b><p class="text-[15px] mt-0.5">اختر جوابا لكلّ سطر قبل أن تضغط «تحقّق».</p>`);
      return;
    }
  const rows = exaAll('[data-exa-row]');
  const sels = exaAll('[data-exa-sel]');
  let good = 0;
  for (let i = 0; i < n; i++) {
    const c = EXA.vals[i] === ans[i];
    if (c) good++;
    if (rows[i]) rows[i].className = c ? EXA_ROW_OK : EXA_ROW_BAD;
    if ((q.t === 'fill' || q.t === 'match') && sels[i]) sels[i].classList.toggle('border-red-400', !c);
    if ((q.t === 'fill' || q.t === 'match') && sels[i] && c) sels[i].classList.add('border-green-500', 'bg-green-50');
  }
  exaResolve(good === n);
}

function exaPick(k) {
  const q = EXA.set.qs[EXA.i];
  if (EXA.done) return;
  const btn = exaAll('[data-exa-opt]')[k];
  if (!btn) return;
  if (k === q.a) {
    btn.className = EXA_OPT_OK;
    exaResolve(true);
  } else {
    btn.className = EXA_OPT_BAD;
    btn.disabled = true;
    exaResolve(false);
  }
}

function exaSeg(r, k) {
  EXA.vals[r] = k;
  exaAll(`[data-exa-seg^="${r}-"]`).forEach(b => {
    const active = b === exaEl(`[data-exa-seg="${r}-${k}"]`);
    b.setAttribute('aria-pressed', String(active));
    b.className = active
      ? 'px-3.5 py-1 rounded-full border-2 border-indigo-600 bg-indigo-600 text-white text-sm font-bold'
      : 'px-3.5 py-1 rounded-full border-2 border-slate-200 bg-white text-sm';
  });
  const row = exaEl(`[data-exa-row="${r}"]`);
  if (row) row.className = EXA_ROW_NEUTRAL;
}

function exaSel(sel) {
  const r = Number(sel.getAttribute('data-exa-sel'));
  EXA.vals[r] = Number(sel.value);
  sel.classList.remove('border-red-400', 'border-green-500', 'bg-green-50');
  const row = sel.closest('[data-exa-row]');
  if (row) row.className = EXA_ROW_NEUTRAL;
}

function exaNext() {
  if (EXA.i < EXA.set.qs.length - 1) {
    EXA.i++;
    exaQuestion();
  } else exaEnd();
}

// ---------- résultats ----------
async function exaEnd() {
  const n = EXA.qs.length || 1;
  const pct = EXA.pts / n;
  const stars = pct >= 0.85 ? 3 : pct >= 0.6 ? 2 : pct >= 0.3 ? 1 : 0;
  const f = exaFind(EXA.set.id);
  const next = f ? f.s.sets[f.idx + 1] : null;
  EXA.done = true;
  const msg = ['لا بأس، راجع الإصلاحات أسفله ثمّ أعد المحاولة.', 'بداية جيّدة، أعد المحاولة لتحسّن نتيجتك.', 'جيّد جدّا! أنت على الطريق الصحيح.', 'ممتاز! أتقنت هذه السلسلة.'][stars];
  const saved = await exaSaveProgress(pct, stars);
  if (stars >= 2 && typeof confetti === 'function') {
    try {
      confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
    } catch {}
  }
  const big = [0, 1, 2].map(k => `<span class="${k < stars ? 'text-amber-400' : 'text-gray-200'}">★</span>`).join('');
  const missed = EXA.missed.length
    ? `<div class="text-right mt-5 grid gap-2">
         <h3 class="font-bold text-gray-700 text-sm">أسئلة للمراجعة</h3>
         ${EXA.missed.map(q => `<div class="rounded-xl border border-slate-200 px-3 py-2"><b class="block text-sm text-gray-800">${esc(q.q)}</b><span class="text-sm text-green-700">الجواب: ${esc(exaAnsText(q))}</span></div>`).join('')}
       </div>`
    : '';
  exaPaint(`
  <div dir="rtl" class="ar" id="exa-result">
    <div class="bg-white rounded-2xl shadow border-t-4 border-indigo-500 px-5 py-7 text-center">
      <div class="text-5xl tracking-[.35em] leading-none mb-1" aria-label="${stars} من 3 نجوم">${big}</div>
      <div class="text-2xl font-black text-gray-800">${Math.round(pct * 100)}% <span class="text-base text-gray-400 font-normal">· ${esc(EXA.set.title)}</span></div>
      <p class="text-sm text-gray-600 mt-1">${msg}</p>
      <p class="text-xs text-gray-400 mt-1">${EXA.pts} / ${n} نقطة${saved && saved.improved ? ' · 🆕 أفضل نتيجة !' : ''}</p>
      ${missed}
      <div class="flex justify-center gap-2 mt-6 flex-wrap">
        <button class="${EXA_BTN}" onclick="exaStart('${EXA.set.id}')"><i class="fas fa-rotate ml-1"></i>أعد السلسلة</button>
        ${next ? `<button class="${EXA_BTN_ALT}" onclick="exaStart('${next.id}')">السلسلة التالية <i class="fas fa-arrow-left mr-1"></i></button>` : ''}
        <button class="${EXA_BTN_ALT}" onclick="exaHome()">الرئيسية</button>
      </div>
    </div>
  </div>`);
}

async function exaResetProgress() {
  if (!EXA.reset) {
    EXA.reset = true;
    exaHome();
    return;
  }
  EXA.reset = false;
  try {
    await api.post('/exercices/progress', { reset: true });
  } catch {}
  EXA.prog = {};
  exaHome();
}

// ---------- entrée de l'onglet (précédent : F65 math6) ----------
VIEWS.exercisesAr = async function (el) {
  App.cache.icTab = 'exercices';
  App.route = 'interactive';
  return VIEWS.interactive(el);
};

async function renderExercisesAr(el) {
  if (!window.EXA_DATA) {
    el.innerHTML = '<p class="text-sm text-red-600"><i class="fas fa-triangle-exclamation ml-1"></i>تعذّر تحميل محتوى الورشة (exercises-ar-data.js).</p>';
    return;
  }
  if (EXA.set && EXA.qs.length && !EXA.done) return exaQuestion(); // partie en cours : pas d'appel réseau
  EXA.set = null;
  await exaLoadProgress();
  el.innerHTML = '<div id="exa-root"></div>';
  exaHome();
}
