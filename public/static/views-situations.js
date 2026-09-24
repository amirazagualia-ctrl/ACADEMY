// ---- 🌟 بوابة الوضعيات الرياضية — Portail des situations-problèmes (6ème année) ----
// Données : window.SITUATIONS (situations-data-*.js). Moteur : questions séquentielles, points par tentative, indices, badges, progression serveur.
const SIT_DOMAINS = {
  agri: { emoji: '🌳', ar: 'الفلاحة والمنتوج', fr: 'Agriculture & production', color: 'from-green-500 to-emerald-600' },
  batiment: { emoji: '🏠', ar: 'البناء والمساحات', fr: 'Bâtiment & surfaces', color: 'from-orange-400 to-amber-600' },
  commerce: { emoji: '🛒', ar: 'التجارة والمبيعات', fr: 'Commerce & ventes', color: 'from-pink-500 to-rose-600' },
  equipement: { emoji: '🚜', ar: 'الفلاح والمعدّات', fr: 'Machines & équipements', color: 'from-yellow-500 to-orange-500' },
  distance: { emoji: '🚌', ar: 'السفر والمسافات', fr: 'Voyages & distances', color: 'from-sky-500 to-blue-600' },
  finance: { emoji: '💰', ar: 'الادخار والقروض', fr: 'Épargne & crédits', color: 'from-lime-500 to-green-600' },
  geometrie: { emoji: '📐', ar: 'الهندسة والقياسات', fr: 'Géométrie & mesures', color: 'from-violet-500 to-purple-600' },
  mesures: { emoji: '📏', ar: 'نظام قيس — الأقيسة الفلاحية', fr: 'Mesures agraires', color: 'from-teal-500 to-cyan-700' },
  defi: { emoji: '🧠', ar: 'تحدّي شامل', fr: 'Défi complet', color: 'from-slate-600 to-gray-800' }
};
const SIT_GENRES = { fraction: ['➗', 'الكسور'], pourcentage: ['％', 'النسب المئوية'], conversion: ['🔄', 'التحويلات والوحدات'], aire: ['⬛', 'المساحات'], volume: ['🧊', 'الحجوم والسعات'], vitesse: ['⏱️', 'السرعة والزمن'], financier: ['💵', 'المسائل المالية'], composee: ['🧩', 'وضعيات مركّبة'] };
const SIT_LEVELS = ['4AP', '5AP', '6AP', '7AB', '8AB', '9AB'];
const SIT_POINTS = [10, 7, 4]; // 1ère, 2e, 3e tentative
const SIT_HINT_COST = 2;

VIEWS.situations = async function (el) { App.cache.icTab = 'situations'; App.route = 'interactive'; return VIEWS.interactive(el); };
async function renderSituations(el) {
  const lvl = App.cache.sitLevel || '6AP';
  const genre = App.cache.sitGenre || '';
  const all = (window.SITUATIONS || []).filter(s => (s.level || '6AP') === lvl && (!genre || s.genre === genre));
  const allLevels = window.SITUATIONS || [];
  let prog = { mine: {}, leaderboard: [] };
  try { prog = (await api.get('/situations/progress' + (isStaff() && App.cache.sitAll ? '?all=1' : ''))).data; } catch {}
  App.cache.sitProg = prog.mine || {};
  const domain = App.cache.sitDomain || null;
  const totalPts = Object.values(App.cache.sitProg).reduce((a, x) => a + (x.score || 0), 0);
  const done = Object.keys(App.cache.sitProg).length;
  const badges = sitBadges(App.cache.sitProg, all);
  const totalAll = allLevels.length;
  el.innerHTML = `
  <div class="bg-gradient-to-l from-indigo-600 to-blue-700 text-white rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3" dir="rtl">
    <div><div class="text-2xl font-bold">🌟 بوابة الوضعيات الرياضية</div><div class="text-xs opacity-80">Situations-problèmes · وضعيات إدماجية متنوّعة</div></div>
    <div class="flex items-center gap-2 text-sm"><span class="bg-white/20 font-bold px-3 py-1.5 rounded-full"><i class="fas fa-star ml-1"></i>${totalPts} نقطة</span><span class="bg-white/20 font-bold px-3 py-1.5 rounded-full"><i class="fas fa-flag-checkered ml-1"></i>${done}/${totalAll}</span>${isStaff() ? `<button onclick="App.cache.sitAll=!App.cache.sitAll; render()" class="bg-white text-blue-700 font-bold text-xs px-3 py-1.5 rounded-full"><i class="fas fa-users ml-1"></i>${App.cache.sitAll ? 'مساحتي' : 'متابعة التلاميذ'}</button>` : ''}</div>
  </div>
  <div class="bg-white rounded-xl shadow p-3 mb-4 space-y-2" dir="rtl">
    <div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-bold text-gray-500 w-20">المستوى</span>${SIT_LEVELS.map(L => { const n = allLevels.filter(x => (x.level || '6AP') === L).length; return `<button onclick="App.cache.sitLevel='${L}'; App.cache.sitDomain=null; render()" class="px-3 py-1 rounded-full text-xs font-bold ${lvl === L ? 'bg-blue-600 text-white' : n ? 'border text-gray-600 hover:bg-gray-50' : 'border text-gray-300 cursor-default'}" ${n ? '' : 'disabled'}>${esc(LEVEL_LABELS[L] || L)}${n ? ` (${n})` : ''}</button>`; }).join('')}</div>
    <div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-bold text-gray-500 w-20">النوع</span><button onclick="App.cache.sitGenre=''; render()" class="px-3 py-1 rounded-full text-xs font-bold ${!genre ? 'bg-purple-600 text-white' : 'border text-gray-600'}">الكلّ</button>${Object.entries(SIT_GENRES).map(([k, [em, ar]]) => { const n = allLevels.filter(x => (x.level || '6AP') === lvl && x.genre === k).length; return n ? `<button onclick="App.cache.sitGenre='${k}'; render()" class="px-3 py-1 rounded-full text-xs font-bold ${genre === k ? 'bg-purple-600 text-white' : 'border text-gray-600 hover:bg-gray-50'}">${em} ${ar} (${n})</button>` : ''; }).join('')}</div>
    ${domain ? `<div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-bold text-gray-500 w-20">الوحدة</span><span class="px-3 py-1 rounded-full text-xs font-bold bg-green-600 text-white">${SIT_DOMAINS[domain].emoji} ${SIT_DOMAINS[domain].ar}</span><button onclick="App.cache.sitDomain=null; render()" class="text-xs text-blue-600 underline">كل الوحدات</button></div>` : ''}
  </div>
  ${isStaff() && App.cache.sitAll ? sitTeacherBoard(prog.leaderboard || [], all.length) : ''}
  ${badges.length ? `<div class="flex flex-wrap gap-2 mb-4" dir="rtl">${badges.map(b => `<span class="bg-white border-2 border-amber-300 rounded-full px-3 py-1 text-sm shadow-sm" title="${esc(b.desc)}">${b.emoji} ${esc(b.ar)}</span>`).join('')}</div>` : ''}
  <div dir="rtl" class="text-right">
    ${!domain ? `
    <h3 class="text-xl font-bold text-gray-800 mb-3">اختر الوحدة <span class="text-gray-400 text-sm font-normal">· Choisis un module (${all.length} وضعية)</span></h3>${!all.length ? '<p class="text-gray-400 text-sm bg-white rounded-xl p-6 text-center">لا توجد وضعيات بهذه المعايير بعد.</p>' : ''}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
      ${Object.entries(SIT_DOMAINS).filter(([k]) => all.some(s => s.domain === k)).map(([k, d]) => { const list = all.filter(s => s.domain === k); const dn = list.filter(s => App.cache.sitProg[s.id]).length; const pts = list.reduce((a, s) => a + (App.cache.sitProg[s.id]?.score || 0), 0); return `
      <button onclick="App.cache.sitDomain='${k}'; render()" class="text-right bg-gradient-to-br ${d.color} text-white rounded-2xl p-4 shadow hover:scale-[1.03] transition relative overflow-hidden">
        <div class="text-4xl mb-2">${d.emoji}</div>
        <div class="font-bold text-lg leading-tight">${d.ar}</div>
        <div class="text-xs opacity-80">${d.fr}</div>
        <div class="mt-3 flex items-center justify-between text-xs"><span class="bg-white/25 rounded-full px-2 py-0.5">${list.length} وضعيات</span><span>${dn}/${list.length} ✓ · ${pts} ن</span></div>
        <div class="absolute bottom-0 left-0 h-1 bg-white/60" style="width:${list.length ? Math.round(dn * 100 / list.length) : 0}%"></div>
      </button>`; }).join('')}
    </div>
    ${prog.leaderboard?.length && !(isStaff() && App.cache.sitAll) ? `<div class="bg-white rounded-xl shadow p-4 max-w-md"><h4 class="font-bold text-gray-700 mb-2">🏆 لوحة الشرف · Classement</h4><ol class="space-y-1 text-sm">${prog.leaderboard.slice(0, 10).map((r, i) => `<li class="flex items-center justify-between ${r.me ? 'bg-amber-50 rounded px-2 font-bold' : 'px-2'}"><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${esc(r.name)}${r.me ? ' (أنت)' : ''}</span><span class="text-amber-700">${r.points} ن · ${r.completed} وضعية</span></li>`).join('')}</ol></div>` : ''}
    ` : `
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <button onclick="App.cache.sitDomain=null; render()" class="${btnSecondary} text-sm"><i class="fas fa-arrow-right ml-1"></i> كل الأنشطة</button>
      <h3 class="text-xl font-bold text-gray-800">${SIT_DOMAINS[domain].emoji} ${SIT_DOMAINS[domain].ar}</h3>
    </div>
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      ${all.filter(s => s.domain === domain).map((s, i) => { const p = App.cache.sitProg[s.id]; return `
      <div class="bg-white rounded-xl shadow p-4 border-t-4 ${p ? 'border-green-500' : 'border-blue-400'}">
        <div class="flex items-start justify-between gap-2"><div class="text-3xl">${s.emoji}</div>${p ? `<span class="text-amber-500 text-sm">${'⭐'.repeat(p.stars)}</span>` : '<span class="badge badge-blue">جديد</span>'}</div>
        <div class="font-bold text-gray-800 mt-1">الوضعية ${String(i + 1).padStart(2, '0')} — ${esc(s.title)}</div><div class="text-[10px] text-purple-700 mt-0.5">${(SIT_GENRES[s.genre] || ['🧩', ''])[0]} ${(SIT_GENRES[s.genre] || ['', 'وضعية'])[1]} · ${esc(LEVEL_LABELS[s.level] || s.level || '')}</div>
        <p class="text-xs text-gray-500 mt-1 leading-relaxed line-clamp-3">${esc(s.context)}</p>
        <div class="flex items-center justify-between mt-3">
          <span class="text-xs text-gray-400">${s.steps.length} مراحل · ${s.steps.length * 10} نقطة${p ? ` · أفضل نتيجة ${p.score}` : ''}</span>
          <button onclick="sitStart('${s.id}')" class="${btnPrimary} text-sm">${p ? '🔁 أعد المحاولة' : '▶ ابدأ'}</button>
        </div>
      </div>`; }).join('')}
    </div>`}
  </div>`;
}

function sitTeacherBoard(rows, total) {
  return `<div class="bg-white rounded-xl shadow p-4 mb-4"><h4 class="font-bold text-gray-700 mb-2"><i class="fas fa-users text-blue-600 mr-1"></i>Suivi des élèves — بوابة الوضعيات</h4>
    ${rows.length ? `<div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr><th>#</th><th>Compte</th><th>Vosituations terminées</th><th>Points</th><th>Étoiles</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td class="font-semibold">${esc(r.name)}</td><td>${r.completed}/${total}</td><td><b class="text-amber-700">${r.points}</b></td><td>${r.stars} ⭐</td></tr>`).join('')}</tbody></table></div>` : '<p class="text-gray-400 text-sm">Aucun élève n\u2019a encore commencé.</p>'}</div>`.replace('Vosituations', 'Situations');
}
function sitBadges(prog, all) {
  all = window.SITUATIONS || all;
  const b = []; const done = Object.keys(prog).length; const pts = Object.values(prog).reduce((a, x) => a + (x.score || 0), 0);
  if (done >= 1) b.push({ emoji: '🏅', ar: 'أوّل إنجاز', desc: 'Première situation terminée' });
  if (done >= 5) b.push({ emoji: '🎖️', ar: 'مثابر', desc: '5 situations terminées' });
  if (done >= 15) b.push({ emoji: '🏆', ar: 'بطل الوضعيات', desc: '15 situations terminées' });
  if (done >= all.length && all.length) b.push({ emoji: '👑', ar: 'أستاذ الرياضيات', desc: 'Toutes les situations terminées' });
  if (Object.values(prog).some(x => x.score >= x.max)) b.push({ emoji: '💯', ar: 'علامة كاملة', desc: 'Score parfait sur une situation' });
  for (const [k, d] of Object.entries(SIT_DOMAINS)) { const list = all.filter(s => s.domain === k); if (list.length && list.every(s => prog[s.id])) b.push({ emoji: d.emoji, ar: 'خبير ' + d.ar.split(' ')[0], desc: 'Domaine complété : ' + d.fr }); }
  if (pts >= 500) b.push({ emoji: '🌟', ar: '500 نقطة', desc: '500 points cumulés' });
  return b;
}

// ---------- Moteur de jeu ----------
function sitStart(id) {
  const s = (window.SITUATIONS || []).find(x => x.id === id); if (!s) return;
  App.cache.sit = { s, i: 0, score: 0, tries: 0, hintUsed: false, log: [], done: false };
  sitRender();
}
function sitRender() {
  const g = App.cache.sit; const s = g.s; const step = s.steps[g.i]; const max = s.steps.length * 10;
  const body = g.done ? sitFinal() : `
    <div dir="rtl" class="text-right">
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm leading-relaxed mb-3"><b>${s.emoji} ${esc(s.title)}</b><br>${esc(s.context)}</div>
      <div class="flex items-center justify-between mb-2 text-xs text-gray-500"><span>المرحلة <b class="text-blue-700 text-base">${g.i + 1}</b> / ${s.steps.length}</span><span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full" id="sit-score">⭐ ${g.score} نقطة</span></div>
      <div class="w-full bg-gray-200 rounded-full h-2 mb-4"><div class="bg-blue-600 h-2 rounded-full transition-all" style="width:${Math.round(g.i * 100 / s.steps.length)}%"></div></div>
      <h4 class="font-bold text-lg text-gray-800 mb-3">${['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'][g.i] || g.i + 1} ${esc(step.q)}</h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3" id="sit-options">
        ${step.options.map((o, j) => `<button onclick="sitAnswer(${j})" class="sit-opt border-2 border-gray-200 rounded-xl px-4 py-3 text-right font-semibold hover:border-blue-400 hover:bg-blue-50 transition" data-j="${j}">⬜ ${esc(o)}</button>`).join('')}
      </div>
      <div id="sit-feedback" class="min-h-[2.5rem] text-sm mb-2"></div>
      <div class="flex items-center justify-between flex-wrap gap-2">
        <button onclick="sitHint()" id="sit-hint" class="${btnSecondary} text-xs" ${g.hintUsed ? 'disabled' : ''}><i class="fas fa-lightbulb text-amber-500 ml-1"></i> مساعدة (−${SIT_HINT_COST} نقاط)</button>
        <span class="text-xs text-gray-400">المحاولة ${Math.min(g.tries + 1, 3)} / 3 · ${SIT_POINTS[Math.min(g.tries, 2)]} نقاط للإجابة الصحيحة</span>
      </div>
    </div>`;
  if (!document.getElementById('modal')) openModal(`<span dir="rtl">🧩 الوضعية — ${esc(s.title)}</span>`, `<div id="sit-body">${body}</div>`, { wide: true });
  else document.getElementById('sit-body').innerHTML = body;
}
function sitAnswer(j) {
  const g = App.cache.sit; const step = g.s.steps[g.i]; const fb = document.getElementById('sit-feedback');
  const btns = [...document.querySelectorAll('.sit-opt')];
  if (j === step.correct) {
    const pts = Math.max(SIT_POINTS[Math.min(g.tries, 2)] - (g.hintUsed ? SIT_HINT_COST : 0), 0);
    g.score += pts; g.log.push({ i: g.i, tries: g.tries + 1, hint: g.hintUsed, pts });
    const sc = document.getElementById('sit-score'); if (sc) sc.textContent = `⭐ ${g.score} نقطة`;
    btns.forEach(b => { b.disabled = true; if (Number(b.dataset.j) === j) b.className = 'sit-opt border-2 border-green-500 bg-green-50 text-green-800 rounded-xl px-4 py-3 text-right font-bold'; });
    fb.innerHTML = `<div class="bg-green-50 border border-green-300 text-green-800 rounded-lg p-2">✅ إجابة صحيحة! <b>+${pts} نقاط</b>${step.explain ? `<div class="text-xs text-green-700 mt-1">📝 ${esc(step.explain)}</div>` : ''}</div><div class="text-left mt-2"><button onclick="sitNext()" class="${btnPrimary}">${g.i + 1 < g.s.steps.length ? 'المرحلة التالية ←' : '🎉 النتيجة النهائية'}</button></div>`;
    if (typeof confetti === 'function' && g.tries === 0) try { confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } }); } catch {}
  } else {
    g.tries++;
    const b = btns.find(x => Number(x.dataset.j) === j); if (b) { b.disabled = true; b.className = 'sit-opt border-2 border-red-300 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-right line-through opacity-70'; }
    if (g.tries >= 3) {
      g.log.push({ i: g.i, tries: 3, hint: g.hintUsed, pts: 0 });
      btns.forEach(x => { x.disabled = true; if (Number(x.dataset.j) === step.correct) x.className = 'sit-opt border-2 border-green-500 bg-green-50 text-green-800 rounded-xl px-4 py-3 text-right font-bold'; });
      fb.innerHTML = `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-2">❌ الإجابة الصحيحة : <b>${esc(step.options[step.correct])}</b>${step.explain ? `<div class="text-xs mt-1">📝 ${esc(step.explain)}</div>` : ''}</div><div class="text-left mt-2"><button onclick="sitNext()" class="${btnPrimary}">${g.i + 1 < g.s.steps.length ? 'المرحلة التالية ←' : 'النتيجة النهائية'}</button></div>`;
    } else fb.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2">❌ ليست الإجابة الصحيحة، حاول مرّة أخرى (${3 - g.tries} محاولات متبقّية).</div>`;
    document.querySelector('#sit-feedback')?.scrollIntoView({ block: 'nearest' });
    setTimeout(() => sitUpdateTryLabel(), 0);
  }
}
function sitUpdateTryLabel() { const g = App.cache.sit; const el = document.querySelector('#sit-body .text-xs.text-gray-400'); if (el) el.textContent = `المحاولة ${Math.min(g.tries + 1, 3)} / 3 · ${SIT_POINTS[Math.min(g.tries, 2)]} نقاط للإجابة الصحيحة`; }
function sitHint() {
  const g = App.cache.sit; if (g.hintUsed) return; g.hintUsed = true;
  const step = g.s.steps[g.i]; document.getElementById('sit-hint').disabled = true;
  const fb = document.getElementById('sit-feedback'); fb.innerHTML = `<div class="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2">💡 <b>مساعدة :</b> ${esc(step.hint || 'أعد قراءة المعطيات بتمعّن.')} <span class="text-xs">(−${SIT_HINT_COST} نقاط)</span></div>` + fb.innerHTML;
}
function sitNext() {
  const g = App.cache.sit; g.i++; g.tries = 0; g.hintUsed = false;
  if (g.i >= g.s.steps.length) { g.done = true; sitSave(); }
  sitRender();
}
async function sitSave() {
  const g = App.cache.sit; const max = g.s.steps.length * 10;
  try { const r = (await api.post('/situations/progress', { situation_id: g.s.id, score: g.score, max })).data; g.saved = r; } catch {}
}
function sitFinal() {
  const g = App.cache.sit; const max = g.s.steps.length * 10; const pct = g.score / max;
  const stars = pct >= 0.9 ? 5 : pct >= 0.75 ? 4 : pct >= 0.6 ? 3 : pct >= 0.4 ? 2 : 1;
  const msg = stars >= 5 ? 'ممتاز! أداء مثالي 🌟' : stars >= 4 ? 'أحسنت! عمل رائع' : stars >= 3 ? 'جيّد، واصل التدريب' : stars >= 2 ? 'لا بأس، أعد المحاولة لتحسين نتيجتك' : 'حاول من جديد، ستنجح بالتأكيد 💪';
  if (typeof confetti === 'function' && stars >= 4) try { confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } }); } catch {}
  return `<div dir="rtl" class="text-center py-4">
    <div class="text-6xl mb-2">${stars >= 4 ? '🎉' : stars >= 3 ? '👏' : '💪'}</div>
    <h3 class="text-2xl font-bold text-gray-800 mb-1">${stars >= 3 ? 'أحسنت!' : 'انتهت الوضعية'}</h3>
    <p class="text-gray-600 mb-3">حصلت على <b class="text-3xl text-blue-700">${g.score}</b> / ${max} نقطة</p>
    <div class="text-3xl mb-2">${'⭐'.repeat(stars)}<span class="text-gray-300">${'⭐'.repeat(5 - stars)}</span></div>
    <p class="text-sm text-gray-500 mb-4">مستوى الأداء : ${msg}</p>
    <div class="inline-block bg-amber-50 border-2 border-amber-300 rounded-2xl px-5 py-3 mb-4"><div class="text-3xl">🏅</div><div class="font-bold text-amber-800">شارة الإنجاز — ${esc(g.s.title)}</div></div>
    <div class="text-right bg-gray-50 rounded-xl p-3 text-sm max-w-md mx-auto mb-4">
      <b>تفاصيل المراحل :</b>
      <ul class="mt-1 space-y-0.5">${g.log.map(l => `<li>${l.pts > 0 ? '✅' : '❌'} المرحلة ${l.i + 1} — ${l.pts} نقاط <span class="text-gray-400 text-xs">(${l.tries} محاولة${l.hint ? '، مساعدة' : ''})</span></li>`).join('')}</ul>
    </div>
    <div class="flex justify-center gap-2 flex-wrap">
      <button onclick="sitStart('${g.s.id}')" class="${btnSecondary}">🔁 أعد المحاولة</button>
      <button onclick="closeModal(); render()" class="${btnPrimary}">العودة إلى البوابة</button>
    </div>
  </div>`;
}
