/* ============================================================
   Rahma Academy - Feature 55 : Bibliothèque d'exercices (بنك التمارين), jetons IA,
   modèles / dossiers, versions (sauvegarde auto), partage, variantes A/B, en-tête établissement.
   Étend le constructeur d'évaluations (views-evaluations.js).
   ============================================================ */

const BANK = { filters: { level: '', subject_id: '', chapter_id: '', type: '', difficulty: '', q: '', mine: '', favorites: '' }, items: [], chapters: [], stats: null, wallet: null, target: null };
const BANK_DIFF = { 1: ['Facile', 'bg-green-100 text-green-700'], 2: ['Moyen', 'bg-amber-100 text-amber-700'], 3: ['Difficile', 'bg-red-100 text-red-700'] };
const bankTitle = x => x.title || x.data?.consigne || x.data?.question || x.data?.text || '(sans titre)';
const bankPreview = x => { const d = x.data || {}; if (d.type === 'mcq') return `${d.question || ''} — ${(d.options || []).map(o => typeof o === 'string' ? o : o.text).join(' / ')}`; if (d.type === 'truefalse') return d.question || ''; if (d.type === 'match') return (d.pairs || []).map(p => p.left).join(', ') + ' ⇄ ' + (d.rights || []).join(', '); if (d.type === 'strike') return `${d.subject || ''} : ${(d.options || []).map(o => o.text).join(' / ')}`; if (d.type === 'fill' || d.type === 'conjug') return (d.text || '').slice(0, 160); if (d.type === 'quote') return d.question || ''; return (d.prompt || '').slice(0, 160); };
const bankTypeShort = k => (EVA_TYPES[k]?.label || k).split(' /')[0].split(' (')[0];

/* ---------- Vue Bibliothèque (menu) ---------- */
VIEWS.bank = async function(el) {
  if (!isStaff()) { el.innerHTML = pageHeader('Bibliothèque', 'fa-layer-group') + '<p class="text-gray-500">Réservé aux enseignants.</p>'; return; }
  const st = (await api.get('/bank/stats')).data;
  if (!st.supported) { el.innerHTML = pageHeader('Bibliothèque d\'exercices', 'fa-layer-group') + `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Exécutez <code>migrations/0015_exercise_bank.sql</code> dans Supabase SQL Editor (après 0014).</div>`; return; }
  BANK.stats = st; BANK.target = null;
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  try { BANK.wallet = (await api.get('/ai/wallet')).data; } catch { BANK.wallet = null; }
  el.innerHTML = pageHeader('Bibliothèque d\'exercices <span class="text-gray-400 text-base font-normal">· بنك التمارين</span>', 'fa-layer-group',
    `${bankWalletBadge()}<button onclick="bankEditModal()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel exercice</button><button onclick="bankAiModal()" class="${btnPrimary} bg-purple-600 hover:bg-purple-700"><i class="fas fa-wand-magic-sparkles mr-1"></i> Générer (IA)</button>${App.user.role === 'admin' ? `<button onclick="bankModeration()" class="${btnSecondary}"><i class="fas fa-shield-halved mr-1"></i> Modération${st.pending ? ` <span class="badge badge-red">${st.pending}</span>` : ''}</button><button onclick="adminAiWallets()" class="${btnSecondary}"><i class="fas fa-coins mr-1 text-amber-600"></i> Jetons</button>` : ''}`) + `
  <div class="grid md:grid-cols-5 gap-3 mb-4">
    ${[['Exercices', st.total, 'fa-layer-group', 'blue'], ['Mes exercices', st.mine, 'fa-user', 'purple'], ['Partagés (école/public)', st.public, 'fa-globe', 'green'], ['Générés IA', st.ai, 'fa-wand-magic-sparkles', 'amber'], ['Niveaux couverts', Object.keys(st.by_level || {}).filter(k => k !== '—').length, 'fa-graduation-cap', 'red']].map(([l, v, i, c]) => `<div class="bg-white rounded-xl shadow p-3 flex items-center gap-3"><div class="w-9 h-9 rounded-lg bg-${c}-100 text-${c}-700 flex items-center justify-center"><i class="fas ${i}"></i></div><div><p class="text-[11px] text-gray-500">${l}</p><p class="text-lg font-bold">${v}</p></div></div>`).join('')}
  </div>
  <div id="bank-root">${bankPanelHtml(false)}</div>`;
  await bankLoad();
};
function bankWalletBadge() { const w = BANK.wallet; if (!w || !w.supported) return ''; return `<span class="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm font-bold" title="Jetons IA disponibles"><i class="fas fa-coins"></i>${w.unlimited ? '∞' : w.balance} jetons</span>`; }

/* ---------- Panneau (filtres + liste) : réutilisé dans le constructeur (compact) ---------- */
function bankPanelHtml(compact) {
  const f = BANK.filters;
  return `<div class="bg-white rounded-xl shadow p-3 mb-3">
    <div class="grid ${compact ? 'grid-cols-2' : 'md:grid-cols-6'} gap-2">
      <input class="${inputCls} ${compact ? 'col-span-2' : 'md:col-span-2'}" placeholder="🔎 Rechercher (consigne, question, chapitre…)" value="${esc(f.q)}" oninput="BANK.filters.q=this.value" onkeydown="if(event.key==='Enter')bankLoad()">
      <select class="${inputCls}" onchange="BANK.filters.level=this.value; BANK.filters.chapter_id=''; bankLoadChapters().then(bankLoad)"><option value="">Tous niveaux</option>${ALL_LEVELS.map(l => `<option value="${l}" ${f.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="${inputCls}" onchange="BANK.filters.subject_id=this.value; BANK.filters.chapter_id=''; bankLoadChapters().then(bankLoad)"><option value="">Toutes matières</option>${(App.cache.subjects || []).map(s => `<option value="${s.id}" ${String(f.subject_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <select class="${inputCls}" id="bank-chapter" onchange="BANK.filters.chapter_id=this.value; bankLoad()"><option value="">Tous chapitres</option>${BANK.chapters.map(ch => `<option value="${ch.id}" ${String(f.chapter_id) === String(ch.id) ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}</select>
      <select class="${inputCls}" onchange="BANK.filters.type=this.value; bankLoad()"><option value="">Tous types</option>${Object.keys(EVA_TYPES).map(k => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${esc(bankTypeShort(k))}</option>`).join('')}</select>
    </div>
    <div class="flex flex-wrap gap-2 mt-2 items-center text-xs">
      ${[1, 2, 3].map(d => `<button onclick="BANK.filters.difficulty=BANK.filters.difficulty==${d}?'':'${d}'; bankLoad()" class="px-2 py-1 rounded-full border ${String(f.difficulty) === String(d) ? BANK_DIFF[d][1] + ' border-current font-bold' : 'text-gray-500'}">${BANK_DIFF[d][0]}</button>`).join('')}
      <button onclick="BANK.filters.mine=BANK.filters.mine?'':'1'; bankLoad()" class="px-2 py-1 rounded-full border ${f.mine ? 'bg-purple-100 text-purple-700 font-bold' : 'text-gray-500'}"><i class="fas fa-user mr-1"></i>Mes exercices</button>
      <button onclick="BANK.filters.favorites=BANK.filters.favorites?'':'1'; bankLoad()" class="px-2 py-1 rounded-full border ${f.favorites ? 'bg-amber-100 text-amber-700 font-bold' : 'text-gray-500'}"><i class="fas fa-star mr-1"></i>Favoris</button>
      <button onclick="bankLoad()" class="${btnPrimary} text-xs py-1 ml-auto"><i class="fas fa-search mr-1"></i>Rechercher</button>
      ${compact ? `<button onclick="bankEditModal()" class="${btnSecondary} text-xs py-1" title="Nouvel exercice"><i class="fas fa-plus"></i></button><button onclick="bankAiModal(true)" class="${btnSecondary} text-xs py-1 text-purple-700" title="Générer avec l'IA"><i class="fas fa-wand-magic-sparkles"></i></button>` : ''}
    </div>
  </div>
  <div id="bank-list" class="${compact ? 'space-y-2' : 'grid md:grid-cols-2 xl:grid-cols-3 gap-3'}"><p class="text-gray-400 text-sm p-4"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement…</p></div>`;
}
async function bankLoadChapters() {
  const f = BANK.filters; if (!f.level && !f.subject_id) { BANK.chapters = []; }
  else BANK.chapters = (await api.get(`/chapters?${f.level ? 'level=' + f.level : ''}${f.subject_id ? '&subject_id=' + f.subject_id : ''}`)).data || [];
  const sel = document.getElementById('bank-chapter'); if (sel) sel.innerHTML = '<option value="">Tous chapitres</option>' + BANK.chapters.map(ch => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('');
}
async function bankLoad() {
  const box = document.getElementById('bank-list'); if (!box) return;
  const qs = Object.entries(BANK.filters).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = (await api.get('/bank?' + qs)).data; BANK.items = r.items || [];
  const compact = !!BANK.target;
  if (!BANK.items.length) { box.innerHTML = `<div class="col-span-full bg-white rounded-xl p-8 text-center text-gray-400 text-sm"><i class="fas fa-box-open text-3xl mb-2"></i><p>Aucun exercice ne correspond.</p><p class="mt-2">Créez-en un, générez-le avec l'IA, ou enregistrez des exercices depuis une évaluation (bouton <i class="fas fa-bookmark"></i>).</p></div>`; return; }
  box.innerHTML = BANK.items.map(x => bankCardHtml(x, compact)).join('');
}
function bankCardHtml(x, compact) {
  const t = EVA_TYPES[x.type] || { label: x.type, icon: 'fa-question' }; const dif = BANK_DIFF[x.difficulty] || BANK_DIFF[2];
  return `<article class="bg-white rounded-xl ${compact ? 'border p-2.5' : 'shadow p-4'} flex flex-col gap-1.5 ${x.status === 'pending' ? 'ring-1 ring-amber-300' : ''}">
    <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
      <span class="font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5"><i class="fas ${t.icon} mr-1"></i>${esc(bankTypeShort(x.type))}</span>
      ${x.level ? `<span class="badge badge-blue">${esc(x.level)}</span>` : ''}${x.subjects?.name ? `<span class="badge badge-gray">${esc(x.subjects.name)}</span>` : ''}<span class="rounded-full px-1.5 ${dif[1]}">${dif[0]}</span>
      ${x.ai_generated ? '<span class="text-purple-600" title="Généré par IA"><i class="fas fa-wand-magic-sparkles"></i></span>' : ''}${x.visibility !== 'private' ? `<span class="text-green-600" title="${x.visibility === 'public' ? 'Public' : 'École'}"><i class="fas fa-globe"></i></span>` : '<span class="text-gray-400" title="Privé"><i class="fas fa-lock"></i></span>'}${x.status === 'pending' ? '<span class="badge badge-yellow">En attente</span>' : ''}
      <span class="ml-auto text-gray-400">${(x.data?.points || 1)} pt · ${x.uses || 0} util.</span>
    </div>
    <p class="font-semibold text-gray-800 text-sm leading-snug">${esc(bankTitle(x))}</p>
    ${compact ? '' : `<p class="text-xs text-gray-500 line-clamp-2">${esc(bankPreview(x))}</p>${x.chapters?.name || x.chapter ? `<p class="text-[11px] text-gray-400"><i class="fas fa-bookmark mr-1"></i>${esc(x.chapters?.name || x.chapter)}</p>` : ''}`}
    <div class="flex gap-1 mt-auto pt-1 flex-wrap">
      ${BANK.target ? `<button onclick="bankAddToEval(${x.id})" class="${btnPrimary} text-xs py-1 flex-1"><i class="fas fa-plus mr-1"></i>Ajouter</button>` : `<button onclick="bankPreviewModal(${x.id})" class="${btnSecondary} text-xs py-1"><i class="fas fa-eye mr-1"></i>Aperçu</button>`}
      <button onclick="bankFav(${x.id}, this)" class="px-2 py-1 rounded-lg text-xs ${x.favorite ? 'text-amber-500' : 'text-gray-400'} hover:bg-amber-50" title="Favori"><i class="${x.favorite ? 'fas' : 'far'} fa-star"></i></button>
      <button onclick="bankEditModal(${x.id})" class="px-2 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100" title="${x.mine || App.user.role === 'admin' ? 'Modifier' : 'Modifier (crée une copie personnelle)'}"><i class="fas fa-pen"></i></button>
      ${!compact ? `<button onclick="bankAiVariant(${x.id})" class="px-2 py-1 rounded-lg text-xs text-purple-600 hover:bg-purple-50" title="Reformuler avec l'IA (1 jeton)"><i class="fas fa-shuffle"></i></button>` : ''}
      ${x.mine || App.user.role === 'admin' ? `<button onclick="bankDelete(${x.id})" class="px-2 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50"><i class="fas fa-trash"></i></button>` : `<button onclick="bankReport(${x.id})" class="px-2 py-1 rounded-lg text-xs text-gray-400 hover:bg-red-50" title="Signaler un exercice défectueux"><i class="fas fa-flag"></i></button>`}
    </div></article>`;
}
async function bankFav(id, btn) { const r = (await api.post(`/bank/${id}/favorite`)).data; const x = BANK.items.find(i => i.id === id); if (x) x.favorite = r.favorite; btn.className = btn.className.replace(/text-(amber-500|gray-400)/, r.favorite ? 'text-amber-500' : 'text-gray-400'); btn.innerHTML = `<i class="${r.favorite ? 'fas' : 'far'} fa-star"></i>`; }
function bankDelete(id) { confirmDelete('Supprimer cet exercice (corbeille 30 jours) ?', async () => { await api.delete(`/bank/${id}`); toast('Supprimé'); bankLoad(); }); }
async function bankReport(id) { const reason = prompt('Pourquoi signaler cet exercice ? (erreur, hors programme, droits…)'); if (reason === null) return; await api.post(`/bank/${id}/report`, { reason }); toast('Merci, l\'exercice a été signalé à la modération'); }
function bankPreviewModal(id) {
  const x = BANK.items.find(i => i.id === id); if (!x) return;
  const doc = { title: bankTitle(x), kind: 'controle', level: x.level || '', lang: x.lang, sections: [{ title: x.subjects?.name || 'Exercice', subtitle: '', text: x.source_text || null, items: [x.data] }], total_points: x.data.points || 1 };
  openModal(`<i class="fas fa-eye mr-2 text-blue-600"></i>Aperçu — ${esc(bankTitle(x)).slice(0, 60)}`, `<div class="max-h-[60vh] overflow-y-auto text-sm">${evaFicheHtml(doc, 'key').replace(/<header[\s\S]*?<\/header>/, '')}</div><div class="flex justify-end gap-2 mt-3"><button onclick="closeModal()" class="${btnSecondary}">Fermer</button><button onclick="closeModal(); bankStartEvalWith(${id})" class="${btnPrimary}"><i class="fas fa-file-signature mr-1"></i>Créer une évaluation avec cet exercice</button></div>`, { wide: true });
}
function bankStartEvalWith(id) { const x = BANK.items.find(i => i.id === id); evaNew({ title: '', kind: 'controle', level: x.level || '5AP', lang: x.lang || 'fr', trimester: 1, subject_id: x.subject_id || '', online: true, sections: [{ title: x.subjects?.name || 'Exercices', subtitle: '', text: x.source_text || null, items: [{ ...x.data, bank_id: x.id }] }] }); api.post(`/bank/${id}/use`).catch(() => {}); }

/* ---------- Créer / modifier un exercice (réutilise l'éditeur d'item du constructeur) ---------- */
async function bankEditModal(id) {
  const x = id ? BANK.items.find(i => i.id === id) : null;
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  BANK.edit = x ? JSON.parse(JSON.stringify(x)) : { type: 'mcq', title: '', level: BANK.filters.level || EVA.doc?.level || '', subject_id: BANK.filters.subject_id || EVA.doc?.subject_id || '', chapter_id: '', chapter: '', difficulty: 2, lang: 'fr', visibility: 'private', source_text: '', data: { type: 'mcq', consigne: "J'entoure la bonne réponse.", question: '', options: ['', '', ''], correct: 0, points: 1 } };
  const e = BANK.edit; const chapters = e.level || e.subject_id ? (await api.get(`/chapters?${e.level ? 'level=' + e.level : ''}${e.subject_id ? '&subject_id=' + e.subject_id : ''}`)).data : [];
  // L'éditeur d'item attend EVA.doc.sections[si].items[ii] → doc temporaire (l'évaluation en cours est mise de côté)
  if (!BANK._savedDoc) BANK._savedDoc = EVA.doc; EVA.doc = { sections: [{ items: [e.data] }] };
  openModal(`<i class="fas fa-layer-group mr-2 text-blue-600"></i>${x ? (x.mine || App.user.role === 'admin' ? 'Modifier l\'exercice' : 'Copie personnelle de l\'exercice') : 'Nouvel exercice'}`, `
    <div class="grid md:grid-cols-4 gap-2 mb-3">
      <div class="md:col-span-2"><label class="${lblCls}">Titre court</label><input class="${inputCls}" value="${esc(e.title || '')}" oninput="BANK.edit.title=this.value"></div>
      <div><label class="${lblCls}">Type</label><select class="${inputCls}" onchange="bankChangeType(this.value)">${Object.keys(EVA_TYPES).map(k => `<option value="${k}" ${e.data.type === k ? 'selected' : ''}>${esc(bankTypeShort(k))}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Difficulté</label><select class="${inputCls}" onchange="BANK.edit.difficulty=+this.value">${[1, 2, 3].map(d => `<option value="${d}" ${e.difficulty == d ? 'selected' : ''}>${BANK_DIFF[d][0]}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Niveau</label><select class="${inputCls}" onchange="BANK.edit.level=this.value"><option value="">—</option>${ALL_LEVELS.map(l => `<option value="${l}" ${e.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Matière</label><select class="${inputCls}" onchange="BANK.edit.subject_id=this.value||null"><option value="">—</option>${App.cache.subjects.map(s => `<option value="${s.id}" ${String(e.subject_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Chapitre</label><select class="${inputCls}" id="bank-edit-chapter" onchange="BANK.edit.chapter_id=this.value||null; BANK.edit.chapter=this.value?this.selectedOptions[0].textContent:null"><option value="">—</option>${chapters.map(ch => `<option value="${ch.id}" ${String(e.chapter_id) === String(ch.id) ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}</select><button onclick="bankNewChapter()" class="text-[11px] text-blue-600"><i class="fas fa-plus"></i> nouveau chapitre</button></div>
      <div><label class="${lblCls}">Visibilité</label><select class="${inputCls}" onchange="BANK.edit.visibility=this.value"><option value="private" ${e.visibility === 'private' ? 'selected' : ''}>🔒 Privé</option><option value="school" ${e.visibility === 'school' ? 'selected' : ''}>🏫 École</option><option value="public" ${e.visibility === 'public' ? 'selected' : ''}>🌍 Public</option></select></div>
    </div>
    <div id="bank-item-editor" class="mb-3">${evaItemEditor(0, 0, e.data)}</div>
    <details><summary class="text-xs font-semibold text-gray-600 cursor-pointer">Texte support (optionnel)</summary><textarea class="${inputCls} mt-1" rows="4" oninput="BANK.edit.source_text=this.value">${esc(e.source_text || '')}</textarea></details>
    <div class="flex justify-end gap-2 mt-3"><button onclick="bankCancelEdit()" class="${btnSecondary}">Annuler</button><button onclick="bankSaveEdit()" class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div>`, { wide: true });
  const m = document.getElementById('modal'); m.querySelector('header button').setAttribute('onclick', 'bankCancelEdit()');
  m.addEventListener('click', ev => { if (ev.target === m) bankCancelEdit(); }, { once: true });
}
function bankChangeType(type) { const pts = EVA.doc.sections[0].items[0].points || 1; EVA.doc.sections[0].items = []; evaAddItem(0, type); EVA.doc.sections[0].items[0].points = pts; BANK.edit.data = EVA.doc.sections[0].items[0]; document.getElementById('bank-item-editor').innerHTML = evaItemEditor(0, 0, BANK.edit.data); }
function bankCancelEdit() { if (BANK._savedDoc !== undefined) { EVA.doc = BANK._savedDoc; BANK._savedDoc = undefined; } closeModal(); }
async function bankSaveEdit() {
  const e = BANK.edit; e.data = EVA.doc.sections[0].items[0]; e.type = e.data.type;
  try {
    const r = e.id ? await api.put(`/bank/${e.id}`, e) : await api.post('/bank', e);
    toast(r.data?.copied ? 'Copie personnelle créée (l\'original reste inchangé)' : e.visibility !== 'private' && App.user.role !== 'admin' && !e.id ? 'Enregistré — en attente de validation pour le partage' : 'Exercice enregistré');
    bankCancelEdit(); if (document.getElementById('bank-list')) bankLoad();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
async function bankNewChapter() {
  const e = BANK.edit; if (!e.level) return toast('Choisissez d\'abord un niveau', 'error');
  const name = prompt('Nom du chapitre (ex. Les fractions, Le présent de l\'indicatif)'); if (!name) return;
  try { const ch = (await api.post('/chapters', { name, level: e.level, subject_id: e.subject_id || null })).data; e.chapter_id = ch.id; e.chapter = ch.name; const sel = document.getElementById('bank-edit-chapter'); if (sel) { sel.insertAdjacentHTML('beforeend', `<option value="${ch.id}" selected>${esc(ch.name)}</option>`); } toast('Chapitre créé'); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
// Évaluation → bibliothèque : enregistrer un item
async function bankSaveFromEval(si, ii, quiet) {
  const it = EVA.doc.sections[si].items[ii]; const s = EVA.doc.sections[si];
  try { const r = (await api.post('/bank', { data: it, type: it.type, level: EVA.doc.level, subject_id: EVA.doc.subject_id || null, lang: EVA.doc.lang, difficulty: 2, visibility: 'private', source_text: s.text || null, title: it.consigne })).data; it.bank_id = r.items?.[0]?.id; if (!quiet) toast('Exercice enregistré dans ma bibliothèque'); return true; }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); return false; }
}
async function bankSaveAllFromEval() { let n = 0; for (const [si, s] of EVA.doc.sections.entries()) for (const [ii, it] of s.items.entries()) if (!it.bank_id) { if (await bankSaveFromEval(si, ii, true)) n++; } toast(`${n} exercice(s) ajoutés à la bibliothèque`); }

/* ---------- IA : générer des exercices (jetons) ---------- */
async function bankAiModal(toEval) {
  try { BANK.wallet = (await api.get('/ai/wallet')).data; } catch {}
  const w = BANK.wallet || {}; const lvl = BANK.filters.level || EVA.doc?.level || ''; const sid = BANK.filters.subject_id || EVA.doc?.subject_id || '';
  openModal('<i class="fas fa-wand-magic-sparkles text-purple-600 mr-2"></i>Générer des exercices avec l\'IA', `
    ${!w.enabled ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 text-sm mb-3">IA non configurée sur le serveur (clé <code>OPENAI_API_KEY</code>).</div>` : w.supported ? `<div class="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm mb-3"><span><i class="fas fa-coins text-amber-600 mr-1"></i>Solde : <b>${w.unlimited ? '∞' : w.balance}</b> jetons</span><span class="text-xs text-gray-500">1 exercice = 1 jeton · fiche complète = 5 · reformulation = 1</span></div>` : ''}
    <div class="grid md:grid-cols-4 gap-2 mb-2">
      <div><label class="${lblCls}">Type</label><select id="bai-type" class="${inputCls}">${Object.keys(EVA_TYPES).map(k => `<option value="${k}">${esc(bankTypeShort(k))}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Niveau</label><select id="bai-level" class="${inputCls}">${ALL_LEVELS.map(l => `<option value="${l}" ${lvl === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Matière</label><select id="bai-subject" class="${inputCls}"><option value="">—</option>${(App.cache.subjects || []).map(s => `<option value="${s.id}" ${String(sid) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Nombre (1 jeton/ex.)</label><input id="bai-count" type="number" class="${inputCls}" value="1" min="1" max="5"></div>
      <div><label class="${lblCls}">Difficulté</label><select id="bai-diff" class="${inputCls}"><option value="1">Facile</option><option value="2" selected>Moyen</option><option value="3">Difficile</option></select></div>
      <div><label class="${lblCls}">Langue</label><select id="bai-lang" class="${inputCls}"><option value="fr">Français</option><option value="ar">العربية</option><option value="en">English</option></select></div>
      <div class="md:col-span-2"><label class="${lblCls}">Chapitre / notion</label><input id="bai-chapter" class="${inputCls}" placeholder="ex. Le présent des verbes du 1er groupe"></div>
    </div>
    <label class="${lblCls}">Consigne pour l'IA</label><textarea id="bai-prompt" class="${inputCls} mb-2" rows="2" placeholder="ex. Un QCM sur les mesures agraires avec des nombres décimaux, contexte tunisien (dinars, hectares)"></textarea>
    <details class="mb-2"><summary class="text-xs text-gray-600 cursor-pointer">Texte support (optionnel : extrait du cours, texte de lecture)</summary><textarea id="bai-text" class="${inputCls} mt-1" rows="4">${esc(EVA.doc?.source?.text_excerpt || document.getElementById('eva-source-text')?.value || '')}</textarea></details>
    <div id="bai-res"></div>
    <p class="text-[11px] text-gray-400 mt-2"><i class="fas fa-circle-info mr-1"></i>Le résultat est un brouillon marqué « généré par IA » : relisez et corrigez toujours avant usage.</p>
    <div class="flex justify-end gap-2 mt-3"><button onclick="closeModal()" class="${btnSecondary}">Fermer</button><button id="bai-go" onclick="bankAiGo(${toEval ? 'true' : 'false'})" class="${btnPrimary} bg-purple-600 hover:bg-purple-700" ${w.enabled ? '' : 'disabled'}><i class="fas fa-wand-magic-sparkles mr-1"></i> Générer</button></div>`, { wide: true });
}
async function bankAiGo(toEval) {
  const g = id => document.getElementById(id).value; const btn = document.getElementById('bai-go'); const res = document.getElementById('bai-res');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Génération…';
  try {
    const subj = App.cache.subjects?.find(s => String(s.id) === g('bai-subject'))?.name || '';
    const r = (await api.post('/bank/ai', { mode: 'exercise', type: g('bai-type'), level: g('bai-level'), subject: subj, chapter: g('bai-chapter'), difficulty: +g('bai-diff'), lang: g('bai-lang'), count: +g('bai-count'), prompt: g('bai-prompt'), text: g('bai-text') })).data;
    BANK.aiItems = r.items; if (BANK.wallet) BANK.wallet.balance = r.balance;
    res.innerHTML = `<div class="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm"><p class="font-bold text-purple-800 mb-2">${r.items.length} exercice(s) généré(s) — solde : ${r.balance ?? '∞'}</p>
      ${r.items.map((it, i) => `<div class="bg-white rounded-lg p-2 mb-2 border"><p class="text-xs text-gray-500">${esc(EVA_TYPES[it.type]?.label || it.type)} · ${it.points} pt</p><p class="font-semibold">${esc(it.consigne || '')}</p><p class="text-gray-700 text-xs">${esc(bankPreview({ data: it }))}</p>
        <div class="flex gap-1 mt-1"><button onclick="bankAiKeep(${i}, true)" class="${btnSecondary} text-xs py-1"><i class="fas fa-layer-group mr-1"></i>Enregistrer dans la bibliothèque</button>${toEval || BANK.target ? `<button onclick="bankAiKeep(${i}, false)" class="${btnPrimary} text-xs py-1"><i class="fas fa-plus mr-1"></i>Ajouter à l'évaluation</button>` : ''}</div></div>`).join('')}</div>`;
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-1"></i> Générer encore';
  } catch (e) { res.innerHTML = `<div class="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 text-sm">${esc(e.response?.data?.error || e.message)}</div>`; btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-1"></i> Réessayer'; }
}
async function bankAiKeep(i, toBank) {
  const it = BANK.aiItems[i]; const g = id => document.getElementById(id)?.value;
  if (toBank) { try { await api.post('/bank', { data: it, type: it.type, level: g('bai-level'), subject_id: g('bai-subject') || null, chapter: g('bai-chapter') || null, difficulty: +g('bai-diff') || 2, lang: g('bai-lang') || 'fr', ai_generated: true, visibility: 'private', title: it.consigne }); toast('Enregistré dans la bibliothèque'); if (document.getElementById('bank-list')) bankLoad(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }
  else { const si = BANK.target?.si ?? EVA.doc.sections.length - 1; EVA.doc.sections[si].items.push({ ...it }); evaRefreshSections(); toast('Ajouté à l\'évaluation'); }
}
async function bankAiVariant(id) {
  const x = BANK.items.find(i => i.id === id); if (!x) return; if (!confirm('Reformuler cet exercice avec l\'IA (1 jeton) ? Une copie sera créée dans votre bibliothèque.')) return;
  try { const r = (await api.post('/bank/ai', { mode: 'rephrase', type: x.type, item: x.data, level: x.level, lang: x.lang, difficulty: x.difficulty })).data; await api.post('/bank', { data: r.items[0], type: x.type, level: x.level, subject_id: x.subject_id, chapter_id: x.chapter_id, difficulty: x.difficulty, lang: x.lang, ai_generated: true, origin_id: x.id, title: (x.title || '') + ' (variante)' }); toast('Variante créée'); bankLoad(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

/* ---------- Intégration constructeur : panneau latéral « Bibliothèque » ---------- */
function bankOpenSidePanel(si) {
  BANK.target = { si }; BANK.filters.level = EVA.doc.level || ''; BANK.filters.subject_id = EVA.doc.subject_id || '';
  document.getElementById('bank-side')?.remove();
  const side = document.createElement('div'); side.id = 'bank-side'; side.className = 'fixed inset-y-0 right-0 z-[45] w-full max-w-md bg-gray-50 shadow-2xl border-l flex flex-col';
  side.innerHTML = `<div class="flex items-center justify-between px-4 py-3 bg-white border-b"><h3 class="font-bold text-gray-800"><i class="fas fa-layer-group text-blue-600 mr-2"></i>Bibliothèque → section ${si + 1}</h3><button onclick="bankCloseSidePanel()" class="text-gray-400 hover:text-gray-700 text-xl">&times;</button></div><div class="p-3 overflow-y-auto flex-1" id="bank-side-body">${bankPanelHtml(true)}</div>`;
  document.body.appendChild(side);
  bankLoadChapters().then(bankLoad);
}
function bankCloseSidePanel() { BANK.target = null; document.getElementById('bank-side')?.remove(); }
async function bankAddToEval(id) {
  const x = BANK.items.find(i => i.id === id); if (!x || !BANK.target) return;
  const s = EVA.doc.sections[BANK.target.si]; s.items.push({ ...JSON.parse(JSON.stringify(x.data)), bank_id: x.id });
  if (x.source_text && !s.text) s.text = x.source_text;
  evaRefreshSections(); api.post(`/bank/${id}/use`).catch(() => {}); toast(`Ajouté à la section ${BANK.target.si + 1}`);
}

/* ---------- Modération (admin) ---------- */
async function bankModeration() {
  const items = (await api.get('/bank/moderation')).data;
  openModal('<i class="fas fa-shield-halved mr-2 text-blue-600"></i>Modération de la bibliothèque', `<p class="text-xs text-gray-500 mb-2">Exercices proposés au partage (école/public) ou signalés. Valider, masquer ou corriger.</p>
    <div class="max-h-[60vh] overflow-y-auto space-y-2">${items.length ? items.map(x => `<div class="border rounded-lg p-2 text-sm"><div class="flex items-center gap-2 flex-wrap text-xs mb-1"><span class="badge badge-blue">${esc(x.level || '—')}</span><span class="badge badge-gray">${esc(bankTypeShort(x.type))}</span>${x.status === 'pending' ? '<span class="badge badge-yellow">En attente</span>' : ''}${x.reports ? `<span class="badge badge-red">${x.reports} signalement(s)</span>` : ''}<span class="text-gray-400 ml-auto">${esc(x.visibility)}</span></div><p class="font-semibold">${esc(bankTitle(x))}</p><p class="text-xs text-gray-500">${esc(bankPreview(x))}</p>
      <div class="flex gap-1 mt-1"><button onclick="bankModerate(${x.id},'approved')" class="px-2 py-1 rounded bg-green-600 text-white text-xs"><i class="fas fa-check mr-1"></i>Valider</button><button onclick="bankModerate(${x.id},'hidden')" class="px-2 py-1 rounded bg-gray-500 text-white text-xs"><i class="fas fa-eye-slash mr-1"></i>Masquer</button><button onclick="bankModerateEdit(${x.id})" class="px-2 py-1 rounded border text-xs"><i class="fas fa-pen mr-1"></i>Corriger</button></div></div>`).join('') : '<p class="text-gray-400 text-sm p-4 text-center">Rien à modérer 🎉</p>'}</div>
    <div class="text-right mt-3"><button onclick="closeModal()" class="${btnPrimary}">Fermer</button></div>`, { wide: true });
  BANK.modItems = items;
}
async function bankModerate(id, status) { await api.put(`/bank/${id}`, { status }); toast(status === 'approved' ? 'Validé' : 'Masqué'); bankModeration(); }
function bankModerateEdit(id) { const x = BANK.modItems.find(i => i.id === id); closeModal(); if (!BANK.items.find(i => i.id === id)) BANK.items.push(x); bankEditModal(id); }

/* ---------- Jetons IA : vue admin ---------- */
async function adminAiWallets() {
  const r = (await api.get('/admin/ai-wallets')).data;
  if (!r.supported) return openModal('Jetons IA', `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 text-sm">Exécutez <code>migrations/0015_exercise_bank.sql</code>.</div>`);
  openModal('<i class="fas fa-coins mr-2 text-amber-600"></i>Jetons IA des enseignants', `
    <p class="text-xs text-gray-500 mb-3">${r.total_consumed} jetons consommés au total · coût IA estimé <b>${(r.total_cost_usd || 0).toFixed(3)} $</b>. 50 jetons offerts à chaque enseignant ; recharge manuelle ci-dessous.</p>
    <div class="max-h-[55vh] overflow-y-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-xs text-gray-600"><tr><th class="p-2 text-left">Utilisateur</th><th class="p-2">Solde</th><th class="p-2">Consommés</th><th class="p-2">Recharge</th></tr></thead><tbody class="divide-y">
      ${r.items.map(u => `<tr><td class="p-2"><b>${esc(u.name || u.email)}</b> <span class="text-xs text-gray-400">${u.role}</span></td><td class="p-2 text-center font-bold ${u.wallet && u.wallet.balance < 10 ? 'text-red-600' : ''}">${u.role === 'admin' ? '∞' : u.wallet ? u.wallet.balance : '50 (défaut)'}</td><td class="p-2 text-center text-gray-500">${u.wallet?.consumed || 0}</td><td class="p-2 text-center"><div class="flex gap-1 justify-center">${[20, 50, 100].map(n => `<button onclick="adminAiCredit(${u.id},${n})" class="px-2 py-0.5 rounded border text-xs hover:bg-amber-50">+${n}</button>`).join('')}</div></td></tr>`).join('')}</tbody></table></div>
    <div class="text-right mt-3"><button onclick="closeModal()" class="${btnPrimary}">Fermer</button></div>`, { wide: true });
}
async function adminAiCredit(uid, n) { try { await api.post('/admin/ai-wallets/credit', { user_id: uid, tokens: n }); toast(`+${n} jetons`); adminAiWallets(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }

/* ---------- Constructeur : autosave + versions, modèles/dossiers, partage, en-tête, variantes ---------- */
let _evaAutosaveTimer = null, _evaLastSnapshot = '';
function evaStartAutosave() {
  clearInterval(_evaAutosaveTimer); _evaLastSnapshot = JSON.stringify({ s: EVA.doc?.sections, t: EVA.doc?.title, h: EVA.doc?.header });
  _evaAutosaveTimer = setInterval(async () => {
    if (!EVA.id || !EVA.doc || !document.getElementById('eva-sections')) return clearInterval(_evaAutosaveTimer);
    const snap = JSON.stringify({ s: EVA.doc.sections, t: EVA.doc.title, h: EVA.doc.header }); if (snap === _evaLastSnapshot) return;
    try { const r = await api.post(`/evaluations/${EVA.id}/autosave`, { sections: EVA.doc.sections, title: EVA.doc.title, header: EVA.doc.header || {}, folder: EVA.doc.folder || null, shuffle: !!EVA.doc.shuffle }); _evaLastSnapshot = snap; const el = document.getElementById('eva-autosave'); if (el) el.innerHTML = `<i class="fas fa-cloud-arrow-up text-green-600 mr-1"></i>Sauvegardé à ${dayjs(r.data.saved_at).format('HH:mm:ss')}`; } catch {}
  }, 30000);
}
async function evaVersionsModal() {
  if (!EVA.id) return toast('Enregistrez d\'abord l\'évaluation', 'error');
  const vs = (await api.get(`/evaluations/${EVA.id}/versions`)).data;
  openModal('<i class="fas fa-clock-rotate-left mr-2 text-blue-600"></i>Historique des versions', `<p class="text-xs text-gray-500 mb-2">Sauvegarde automatique toutes les 30 s (30 versions conservées).</p><div class="max-h-[50vh] overflow-y-auto divide-y">${vs.length ? vs.map(v => `<div class="py-2 flex items-center gap-2 text-sm"><i class="fas fa-${v.note === 'auto' ? 'cloud' : 'save'} text-gray-400"></i><span class="flex-1">${dayjs(v.saved_at).format('DD/MM/YYYY HH:mm:ss')} <span class="text-xs text-gray-400">${esc(v.note || '')}</span></span><button onclick="evaRestoreVersion(${v.id})" class="${btnSecondary} text-xs py-1"><i class="fas fa-rotate-left mr-1"></i>Restaurer</button></div>`).join('') : '<p class="text-gray-400 text-sm p-3">Aucune version enregistrée.</p>'}</div><div class="text-right mt-3"><button onclick="closeModal()" class="${btnPrimary}">Fermer</button></div>`);
}
async function evaRestoreVersion(vid) { const v = (await api.get(`/evaluations/${EVA.id}/versions/${vid}`)).data; if (!confirm('Restaurer cette version ? Le contenu actuel sera remplacé (une version de sauvegarde sera créée).')) return; EVA.doc.sections = v.sections; if (v.title) EVA.doc.title = v.title; closeModal(); evaBuilder(); toast('Version restaurée'); }
async function evaShareModal() {
  if (!EVA.id) return toast('Enregistrez d\'abord l\'évaluation', 'error');
  const cols = (await api.get('/colleagues')).data; const cur = EVA.doc.shared_with || [];
  openModal('<i class="fas fa-share-nodes mr-2 text-blue-600"></i>Partager avec des collègues', `<div class="max-h-[45vh] overflow-y-auto divide-y mb-3">${cols.length ? cols.map(u => `<label class="flex items-center gap-2 py-2 text-sm cursor-pointer"><input type="checkbox" class="eva-share-cb w-4 h-4" value="${u.id}" ${cur.includes(u.id) ? 'checked' : ''}> <span class="flex-1">${esc(u.name || u.email)}</span><span class="text-xs text-gray-400">${u.role}</span></label>`).join('') : '<p class="text-gray-400 text-sm p-3">Aucun collègue.</p>'}</div>
    <label class="flex items-center gap-2 text-sm mb-3"><input type="checkbox" id="eva-share-edit" ${EVA.doc.shared_edit ? 'checked' : ''} class="w-4 h-4"> Autoriser la modification (sinon lecture seule)</label>
    <div class="flex justify-end gap-2"><button onclick="closeModal()" class="${btnSecondary}">Annuler</button><button onclick="evaShareSave()" class="${btnPrimary}"><i class="fas fa-share-nodes mr-1"></i>Partager</button></div>`);
}
async function evaShareSave() { const ids = [...document.querySelectorAll('.eva-share-cb:checked')].map(c => +c.value); const edit = document.getElementById('eva-share-edit').checked; const r = (await api.post(`/evaluations/${EVA.id}/share`, { user_ids: ids, edit })).data; EVA.doc.shared_with = r.shared_with; EVA.doc.shared_edit = r.shared_edit; closeModal(); toast(ids.length ? `Partagé avec ${ids.length} collègue(s)` : 'Partage retiré'); }
async function evaTemplatesModal() {
  let ts = []; try { ts = (await api.get('/evaluations/templates/list')).data || []; } catch {}
  const folders = [...new Set(ts.map(t => t.folder || 'Sans dossier'))];
  openModal('<i class="fas fa-folder-tree mr-2 text-amber-600"></i>Modèles d\'évaluation', `<p class="text-xs text-gray-500 mb-2">Un modèle garde la structure (sections, exercices, en-tête). Choisissez-en un pour démarrer une nouvelle évaluation.</p>
    <div class="max-h-[55vh] overflow-y-auto space-y-3">${ts.length ? folders.map(f => `<div><h4 class="text-xs font-bold text-gray-500 uppercase mb-1"><i class="fas fa-folder mr-1 text-amber-500"></i>${esc(f)}</h4>${ts.filter(t => (t.folder || 'Sans dossier') === f).map(t => `<div class="flex items-center gap-2 border rounded-lg p-2 mb-1 text-sm"><div class="flex-1"><b>${esc(t.title)}</b><p class="text-xs text-gray-500">${esc(EVA_KINDS[t.kind] || t.kind)} · ${esc(t.level)} · ${t.subjects?.name ? esc(t.subjects.name) + ' · ' : ''}${(t.sections || []).reduce((n, s) => n + (s.items || []).length, 0)} exercices · /${t.total_points}</p></div><button onclick="evaFromTemplate(${t.id})" class="${btnPrimary} text-xs py-1"><i class="fas fa-plus mr-1"></i>Utiliser</button></div>`).join('')}</div>`).join('') : '<p class="text-gray-400 text-sm p-4 text-center">Aucun modèle personnel. Dans le constructeur, cochez « Enregistrer comme modèle ».</p>'}
    <div class="border-t pt-2"><h4 class="text-xs font-bold text-gray-500 uppercase mb-1">Modèles intégrés</h4><div class="flex items-center gap-2 border rounded-lg p-2 text-sm"><div class="flex-1"><b>Évaluation des prérequis — Français 5AP</b><p class="text-xs text-gray-500">« Macaron, le petit mouton » · 3 sections · 11 exercices · /20</p></div><button onclick="closeModal(); evaNew(evaTemplateFr5())" class="${btnPrimary} text-xs py-1"><i class="fas fa-plus mr-1"></i>Utiliser</button></div></div></div>
    <div class="text-right mt-3"><button onclick="closeModal()" class="${btnSecondary}">Fermer</button></div>`, { wide: true });
}
async function evaFromTemplate(id) { const t = (await api.get(`/evaluations/${id}`)).data; closeModal(); evaNew({ title: t.title.replace(/\s*\(modèle\)\s*$/i, ''), kind: t.kind, level: t.level, lang: t.lang, trimester: 1, duration_min: t.duration_min, subject_id: t.subject_id, online: t.online, header: t.header || {}, sections: JSON.parse(JSON.stringify(t.sections || [])) }); EVA.doc.source = { template_id: id }; }
// Variante B : mélange de l'ordre des exercices (et des options QCM / propositions à relier) → nouvelle évaluation « — Sujet B »
async function evaMakeVariant() {
  if (!EVA.doc.title?.trim()) return toast('Donnez d\'abord un titre', 'error');
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const d = JSON.parse(JSON.stringify(EVA.doc)); delete d.id; delete d.attempts;
  d.sections.forEach(s => { shuffle(s.items); s.items.forEach(it => { if (it.type === 'mcq' && Array.isArray(it.options)) { const idx = shuffle(it.options.map((_, i) => i)); it.options = idx.map(i => it.options[i]); it.correct = idx.indexOf(it.correct); } if (it.type === 'match' && Array.isArray(it.rights)) { const idx = shuffle(it.rights.map((_, i) => i)); it.rights = idx.map(i => it.rights[i]); (it.pairs || []).forEach(p => { p.right = idx.indexOf(p.right); }); } }); });
  const base = EVA.doc.title.replace(/\s*—\s*Sujet [AB]$/, '');
  d.title = base + ' — Sujet B'; EVA.doc.title = base + ' — Sujet A'; d.status = 'draft'; d.is_template = false; d.shared_with = [];
  try { if (EVA.id) await api.put(`/evaluations/${EVA.id}`, { title: EVA.doc.title }); await api.post('/evaluations', d); toast('Sujet B créé (brouillon) — retrouvez les deux sujets dans la liste'); const t = document.querySelector('#eva-meta input'); if (t) t.value = EVA.doc.title; }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
// Bloc « Options avancées » injecté dans la colonne gauche du constructeur
function evaAdvancedHtml(d) {
  const h = d.header || {};
  return `<div class="bg-white rounded-xl shadow p-4 space-y-2" id="eva-advanced">
    <h3 class="font-bold text-gray-700 text-sm"><i class="fas fa-school mr-1 text-blue-600"></i>En-tête de l'établissement</h3>
    <input class="${inputCls}" value="${esc(h.school ?? (App.settings?.school_name || ''))}" oninput="(EVA.doc.header=EVA.doc.header||{}).school=this.value" placeholder="Nom de l'établissement">
    <input class="${inputCls}" value="${esc(h.teacher_name || '')}" oninput="(EVA.doc.header=EVA.doc.header||{}).teacher_name=this.value" placeholder="Enseignant(e)">
    <input class="${inputCls}" value="${esc(h.instructions || '')}" oninput="(EVA.doc.header=EVA.doc.header||{}).instructions=this.value" placeholder="Consignes générales (ex. Calculatrice interdite)">
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${h.show_logo !== false ? 'checked' : ''} onchange="(EVA.doc.header=EVA.doc.header||{}).show_logo=this.checked" class="w-4 h-4"> Logo de l'école sur le PDF</label>
    <h3 class="font-bold text-gray-700 text-sm pt-2 border-t"><i class="fas fa-folder-tree mr-1 text-amber-600"></i>Modèle & dossier</h3>
    <input class="${inputCls}" value="${esc(d.folder || '')}" oninput="EVA.doc.folder=this.value" placeholder="Dossier (ex. Français / T1)">
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.is_template ? 'checked' : ''} onchange="EVA.doc.is_template=this.checked" class="w-4 h-4"> Enregistrer comme modèle réutilisable</label>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.shuffle ? 'checked' : ''} onchange="EVA.doc.shuffle=this.checked" class="w-4 h-4"> Mélanger l'ordre des exercices en passation en ligne</label>
    <div class="flex flex-wrap gap-1.5 pt-2 border-t">
      <button onclick="evaTemplatesModal()" class="${btnSecondary} text-xs py-1"><i class="fas fa-folder-open mr-1"></i>Modèles</button>
      <button onclick="evaVersionsModal()" class="${btnSecondary} text-xs py-1"><i class="fas fa-clock-rotate-left mr-1"></i>Versions</button>
      <button onclick="evaShareModal()" class="${btnSecondary} text-xs py-1"><i class="fas fa-share-nodes mr-1"></i>Partager${(d.shared_with || []).length ? ` (${d.shared_with.length})` : ''}</button>
      <button onclick="evaMakeVariant()" class="${btnSecondary} text-xs py-1" title="Créer un Sujet B avec exercices et options mélangés"><i class="fas fa-shuffle mr-1"></i>Sujet A/B</button>
      <button onclick="bankSaveAllFromEval()" class="${btnSecondary} text-xs py-1" title="Enregistrer tous les exercices dans ma bibliothèque"><i class="fas fa-bookmark mr-1"></i>→ Bibliothèque</button>
    </div>
    <p id="eva-autosave" class="text-[11px] text-gray-400">${EVA.id ? '<i class="fas fa-cloud mr-1"></i>Sauvegarde automatique toutes les 30 s' : '<i class="fas fa-circle-info mr-1"></i>Enregistrez une première fois pour activer la sauvegarde automatique'}</p>
  </div>`;
}
