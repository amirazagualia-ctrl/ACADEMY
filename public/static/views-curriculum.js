/* ======================= Feature 58 : Référentiel programme (admin) =======================
   Arbre Cycle → Niveau → (Section) → Matière → Trimestre → Chapitre → Notion, CRUD trilingue,
   réordonnancement par glisser-déposer (natif HTML5), statut / à vérifier, import/export, seed, mapping matières.
   Aucune liste codée en dur : tout vient de /api/curriculum/*. */
const CURA = { status: null, levels: [], sections: [], subjects: [], chapters: [], level_id: null, section_id: null, ls: null, trimester: 'all', lang: 'fr', schoolSubjects: [], allSubjects: [], domains: [], types: [], tab: 'tree' };
const curaN = (r) => r ? (r[`name_${CURA.lang}`] || r.name_fr || r.name_ar || '') : '';
const curaDir = () => CURA.lang === 'ar' ? 'rtl' : 'ltr';
const curaBadge = (r) => `${r.status === 'draft' ? '<span class="badge badge-gray" title="Brouillon : invisible pour les enseignants">brouillon</span> ' : ''}${r.needs_verification ? '<span class="badge badge-yellow" title="Contenu à vérifier par rapport au programme officiel"><i class="fas fa-triangle-exclamation"></i> à vérifier</span>' : ''}`;
const curaConfirm = (msg) => new Promise(res => confirmDelete(msg, () => res(true)));
async function curaApi(method, path, body) { const r = await api({ method, url: '/curriculum' + path, data: body }); if (typeof curInvalidate === 'function') curInvalidate(); return r.data; }

VIEWS.curriculum = async function(el) {
  if (App.user.role !== 'admin') { navigate('dashboard'); return; }
  el.innerHTML = pageHeader('Référentiel programme <span class="text-gray-400 text-base font-normal">· البرنامج الرسمي</span>', 'fa-sitemap',
    `<div class="flex gap-1">${['fr', 'ar', 'en'].map(k => `<button onclick="CURA.lang='${k}'; render()" class="px-2 py-1 rounded text-xs ${CURA.lang === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${k.toUpperCase()}</button>`).join('')}</div>
     <button onclick="curaImportModal()" class="${btnSecondary}"><i class="fas fa-file-import mr-1"></i> Importer</button>
     <button onclick="curaExport()" class="${btnSecondary}"><i class="fas fa-file-export mr-1"></i> Exporter JSON</button>
     <button onclick="curaSeed()" class="${btnSecondary}"><i class="fas fa-seedling mr-1 text-green-600"></i> Charger le programme de base</button>`) + `<div id="cura-body"><p class="text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement…</p></div>`;
  try { CURA.status = (await api.get('/curriculum/status')).data; } catch { CURA.status = { supported: false }; }
  const body = document.getElementById('cura-body');
  if (!CURA.status.supported) { body.innerHTML = `<div class="bg-amber-50 border border-amber-300 text-amber-900 rounded-xl p-5"><p class="font-bold"><i class="fas fa-database mr-1"></i>Tables du référentiel absentes</p><p class="text-sm mt-1">Exécutez <code>migrations/0016_curriculum.sql</code> dans Supabase → SQL Editor, puis cliquez sur « Charger le programme de base ». En attendant, l'assistant « Créer un examen » utilise le programme embarqué en lecture seule (${CURA.status.counts?.cur_level_subjects || 0} couples niveau/matière).</p></div>`; return; }
  try { [CURA.levels, CURA.allSubjects, CURA.types] = await Promise.all([curaApi('get', `/levels?lang=${CURA.lang}`), curaApi('get', `/subjects?lang=${CURA.lang}`), curaApi('get', `/exercise-types?lang=${CURA.lang}`)]); } catch { CURA.levels = []; }
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  if (!CURA.levels.length) { body.innerHTML = `<div class="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm"><p class="font-bold text-blue-900"><i class="fas fa-circle-info mr-1"></i>Référentiel vide</p><p class="mt-1">Cliquez sur « Charger le programme de base » pour importer cycles, niveaux, sections, matières, domaines et types d'exercices (idempotent : relançable sans doublon).</p></div>`; return; }
  const c = CURA.status.counts || {};
  body.innerHTML = `
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4 text-center text-xs">${[['cur_levels', 'niveaux', 'fa-layer-group'], ['cur_sections', 'sections', 'fa-sitemap'], ['cur_subjects', 'matières', 'fa-book'], ['cur_level_subjects', 'niveau × matière', 'fa-link'], ['cur_chapters', 'chapitres', 'fa-book-open'], ['cur_notions', 'notions', 'fa-bookmark']].map(([k, l, i]) => `<div class="bg-white rounded-xl border p-2"><i class="fas ${i} text-blue-500"></i><p class="text-xl font-black text-gray-800">${c[k] ?? '–'}</p><p class="text-gray-500">${l}</p></div>`).join('')}</div>
    <div class="flex gap-2 mb-3 border-b">${[['tree', 'fa-sitemap', 'Programme'], ['subjects', 'fa-book', 'Matières & mapping'], ['types', 'fa-shapes', 'Types d\'exercices']].map(([t, i, l]) => `<button onclick="CURA.tab='${t}'; curaRenderTab()" class="px-3 py-2 text-sm font-semibold border-b-2 ${CURA.tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500'}"><i class="fas ${i} mr-1"></i>${l}</button>`).join('')}</div>
    <div id="cura-tab"></div>`;
  curaRenderTab();
};
function curaRenderTab() { const t = document.getElementById('cura-tab'); if (!t) return; if (CURA.tab === 'subjects') return curaRenderSubjects(t); if (CURA.tab === 'types') return curaRenderTypes(t); curaRenderTree(t); }

/* ---------- Onglet Programme : sélecteurs + chapitres/notions ---------- */
async function curaRenderTree(t) {
  const groups = {}; CURA.levels.forEach(l => { const k = l.cycle?.code || '?'; (groups[k] = groups[k] || { cycle: l.cycle, levels: [] }).levels.push(l); });
  const lv = CURA.levels.find(l => l.id === CURA.level_id);
  t.innerHTML = `<div class="grid lg:grid-cols-[280px_1fr] gap-4">
    <aside class="bg-white rounded-xl border p-3 space-y-3 self-start">
      ${Object.values(groups).map(g => `<div><h4 class="text-[11px] font-bold uppercase text-gray-400 mb-1" dir="${curaDir()}">${esc(curaN(g.cycle))}</h4><div class="flex flex-wrap gap-1">${g.levels.map(l => `<button onclick="curaPickLevel(${l.id})" class="px-2 py-1 rounded text-xs font-semibold ${CURA.level_id === l.id ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}" title="${esc(curaN(l))}">${esc(l.legacy_code || l.code)}</button>`).join('')}</div></div>`).join('')}
      <div id="cura-sections"></div>
      <div id="cura-subjects"></div>
    </aside>
    <section id="cura-main" class="min-w-0">${lv ? '' : '<div class="text-center text-gray-400 border-2 border-dashed rounded-xl p-10"><i class="fas fa-hand-pointer text-3xl mb-2 block"></i>Choisissez un niveau, puis une matière, pour gérer ses chapitres trimestre par trimestre.</div>'}</section></div>`;
  if (lv) await curaPickLevel(CURA.level_id, true);
}
async function curaPickLevel(id, keep) {
  if (!keep) { CURA.level_id = id; CURA.section_id = null; CURA.ls = null; }
  const lv = CURA.levels.find(l => l.id === id);
  try { CURA.sections = await curaApi('get', `/levels/${id}/sections?lang=${CURA.lang}`); } catch { CURA.sections = []; }
  const sec = document.getElementById('cura-sections');
  sec.innerHTML = CURA.sections.length ? `<h4 class="text-[11px] font-bold uppercase text-gray-400 mb-1">Section</h4><div class="flex flex-wrap gap-1">${CURA.sections.map(s => `<button onclick="curaPickSection(${s.id})" class="px-2 py-1 rounded text-xs ${CURA.section_id === s.id ? 'bg-teal-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}" dir="${curaDir()}">${esc(curaN(s))}</button>`).join('')}</div>` : '';
  if (CURA.sections.length && !CURA.section_id) { document.getElementById('cura-subjects').innerHTML = '<p class="text-xs text-gray-400">Choisissez une section.</p>'; document.getElementById('cura-main').innerHTML = `<div class="text-center text-gray-400 border-2 border-dashed rounded-xl p-10">${esc(curaN(lv))} : choisissez une section.</div>`; return; }
  await curaLoadSubjects();
}
async function curaPickSection(id) { CURA.section_id = id; CURA.ls = null; await curaPickLevel(CURA.level_id, true); }
async function curaLoadSubjects() {
  try { CURA.subjects = await curaApi('get', `/subjects?levelId=${CURA.level_id}${CURA.section_id ? '&sectionId=' + CURA.section_id : ''}&lang=${CURA.lang}`); } catch { CURA.subjects = []; }
  const box = document.getElementById('cura-subjects'); if (!box) return;
  box.innerHTML = `<h4 class="text-[11px] font-bold uppercase text-gray-400 mb-1 flex items-center justify-between">Matières <button onclick="curaAddLevelSubject()" class="text-blue-600 hover:underline normal-case font-semibold"><i class="fas fa-plus"></i> ajouter</button></h4>
    <ul id="cura-ls-list" class="space-y-1">${CURA.subjects.map(s => `<li draggable="true" data-id="${s.level_subject_id}" ondragstart="curaDragStart(event)" ondragover="curaDragOver(event)" ondrop="curaDrop(event,'level_subjects','cura-ls-list')" class="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer border ${CURA.ls?.level_subject_id === s.level_subject_id ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-100 hover:border-blue-200'}" onclick="curaPickLs(${s.level_subject_id})"><i class="fas fa-grip-vertical text-gray-300 cursor-grab"></i><span class="flex-1 truncate" dir="${curaDir()}">${esc(curaN(s))}</span>${s.is_specialty ? '<i class="fas fa-star text-amber-500" title="Spécialité"></i>' : ''}${s.needs_verification ? '<i class="fas fa-triangle-exclamation text-amber-500" title="À vérifier"></i>' : ''}${s.status === 'draft' ? '<i class="fas fa-eye-slash text-gray-400" title="Brouillon"></i>' : ''}<button onclick="event.stopPropagation(); curaEditLevelSubject(${s.level_subject_id})" class="text-gray-400 hover:text-blue-600"><i class="fas fa-pen"></i></button></li>`).join('')}</ul>`;
  if (CURA.ls) await curaPickLs(CURA.ls.level_subject_id);
}
async function curaPickLs(lsId) {
  CURA.ls = CURA.subjects.find(s => s.level_subject_id === lsId) || null; if (!CURA.ls) return;
  document.querySelectorAll('#cura-ls-list li').forEach(li => li.classList.toggle('bg-blue-50', Number(li.dataset.id) === lsId));
  await curaLoadChapters();
}
async function curaLoadChapters() {
  const main = document.getElementById('cura-main'); const s = CURA.ls; if (!main || !s) return;
  main.innerHTML = '<p class="text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement…</p>';
  try { CURA.chapters = await curaApi('get', `/chapters?levelSubjectId=${s.level_subject_id}&trimester=all&lang=${CURA.lang}`); } catch { CURA.chapters = []; }
  const lv = CURA.levels.find(l => l.id === CURA.level_id); const sec = CURA.sections.find(x => x.id === CURA.section_id);
  const tris = [[1, '1er trimestre'], [2, '2ème trimestre'], [3, '3ème trimestre'], [0, 'Toute l\'année']];
  const shown = CURA.chapters.filter(ch => CURA.trimester === 'all' || ch.trimester === Number(CURA.trimester));
  main.innerHTML = `<div class="bg-white rounded-xl border p-4">
    <div class="flex flex-wrap items-start justify-between gap-2 mb-3">
      <div dir="${curaDir()}"><p class="text-xs text-gray-500">${esc(curaN(lv))}${sec ? ' · ' + esc(curaN(sec)) : ''}</p><h3 class="text-lg font-bold text-gray-800">${esc(curaN(s))} ${curaBadge(s)}</h3><p class="text-xs text-gray-500">Langue : <b>${EVA_I18N[s.default_lang]?.name || s.default_lang}</b> · Durée : <b>${s.duration_default} min</b> · Barème : <b>/${s.grading_scale}</b>${s.coefficient ? ' · Coef. ' + s.coefficient : ''}</p></div>
      <div class="flex gap-2"><button onclick="curaEditLevelSubject(${s.level_subject_id})" class="${btnSecondary} text-xs"><i class="fas fa-sliders mr-1"></i>Paramètres</button><button onclick="curaEditChapter(null)" class="${btnPrimary} text-xs"><i class="fas fa-plus mr-1"></i>Chapitre</button></div>
    </div>
    <div class="flex gap-1 mb-3 flex-wrap">${[['all', 'Tous']].concat(tris.map(([k, l]) => [String(k), l])).map(([k, l]) => `<button onclick="CURA.trimester='${k}'; curaLoadChapters()" class="px-2.5 py-1 rounded-full text-xs font-semibold border ${String(CURA.trimester) === k ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600'}">${l} <span class="opacity-70">${k === 'all' ? CURA.chapters.length : CURA.chapters.filter(c => c.trimester === Number(k)).length}</span></button>`).join('')}</div>
    ${shown.length ? `<ul id="cura-ch-list" class="space-y-2">${shown.map(ch => `<li draggable="true" data-id="${ch.id}" ondragstart="curaDragStart(event)" ondragover="curaDragOver(event)" ondrop="curaDrop(event,'chapters','cura-ch-list')" class="border rounded-xl p-3 bg-gray-50/60">
        <div class="flex items-center gap-2"><i class="fas fa-grip-vertical text-gray-300 cursor-grab"></i><span class="text-base">📖</span><b class="flex-1 text-sm" dir="${curaDir()}">${esc(curaN(ch))}</b><span class="text-[10px] px-1.5 py-0.5 rounded-full ${ch.trimester ? 'bg-amber-100 text-amber-800' : 'bg-gray-200 text-gray-700'}">${ch.trimester ? 'T' + ch.trimester : 'Année'}</span>${curaBadge(ch)}<code class="text-[10px] text-gray-400 hidden md:inline">${esc(ch.code || '')}</code>
          <button onclick="curaEditNotion(${ch.id}, null)" class="text-gray-400 hover:text-green-600" title="Ajouter une notion"><i class="fas fa-plus"></i></button><button onclick="curaEditChapter(${ch.id})" class="text-gray-400 hover:text-blue-600" title="Modifier"><i class="fas fa-pen"></i></button><button onclick="curaDelete('chapters', ${ch.id}, 'ce chapitre et ses notions')" class="text-gray-400 hover:text-red-600" title="Supprimer"><i class="fas fa-trash"></i></button></div>
        <ul id="cura-no-${ch.id}" class="ml-9 mt-1.5 flex flex-wrap gap-1.5">${(ch.notions || []).map(n => `<li draggable="true" data-id="${n.id}" ondragstart="curaDragStart(event)" ondragover="curaDragOver(event)" ondrop="curaDrop(event,'notions','cura-no-${ch.id}')" class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-white border cursor-grab group" dir="${curaDir()}">🔖 ${esc(curaN(n))}<button onclick="curaEditNotion(${ch.id}, ${n.id})" class="text-gray-300 group-hover:text-blue-600"><i class="fas fa-pen text-[10px]"></i></button><button onclick="curaDelete('notions', ${n.id}, 'cette notion')" class="text-gray-300 group-hover:text-red-600"><i class="fas fa-xmark text-[10px]"></i></button></li>`).join('')}${!(ch.notions || []).length ? '<li class="text-[11px] text-gray-400 italic">Aucune notion — <button onclick="curaEditNotion(' + ch.id + ', null)" class="underline">ajouter</button></li>' : ''}</ul></li>`).join('')}</ul>`
      : `<div class="text-center text-gray-400 border-2 border-dashed rounded-xl p-8 text-sm"><i class="fas fa-book-open text-3xl mb-2 block text-gray-300"></i>Aucun chapitre${CURA.trimester !== 'all' ? ' pour ce trimestre' : ''}. <button onclick="curaEditChapter(null)" class="text-blue-600 underline">Ajouter le premier chapitre</button> ou <button onclick="curaImportModal()" class="text-blue-600 underline">importer un CSV</button>.</div>`}
  </div>`;
}

/* ---------- Glisser-déposer natif : réordonne puis POST /reorder ---------- */
let _curaDrag = null;
function curaDragStart(e) { _curaDrag = e.currentTarget; e.dataTransfer.effectAllowed = 'move'; e.stopPropagation(); }
function curaDragOver(e) { e.preventDefault(); const li = e.currentTarget; if (!_curaDrag || li === _curaDrag || li.parentElement !== _curaDrag.parentElement) return; const r = li.getBoundingClientRect(); const horizontal = li.parentElement.classList.contains('flex-wrap'); const before = horizontal ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2; li.parentElement.insertBefore(_curaDrag, before ? li : li.nextSibling); }
async function curaDrop(e, table, listId) {
  e.preventDefault(); e.stopPropagation(); if (!_curaDrag) return; _curaDrag = null;
  const ids = [...document.getElementById(listId).querySelectorAll(':scope > li[data-id]')].map(li => Number(li.dataset.id));
  try { await curaApi('post', `/${table}/reorder`, { ids }); toast('Ordre enregistré'); } catch (err) { toast(err.response?.data?.error || 'Erreur de réordonnancement', 'error'); }
}

/* ---------- Formulaires trilingues ---------- */
const curaTri = (r = {}) => ['fr', 'ar', 'en'].map(k => `<div><label class="${lblCls}">Nom (${k.toUpperCase()})</label><input id="cura-name-${k}" class="${inputCls}" dir="${k === 'ar' ? 'rtl' : 'ltr'}" value="${esc(r[`name_${k}`] || '')}" required></div>`).join('');
const curaReadTri = () => { const o = {}; for (const k of ['fr', 'ar', 'en']) o[`name_${k}`] = document.getElementById(`cura-name-${k}`).value.trim(); if (!o.name_fr && !o.name_ar) throw new Error('Nom FR ou AR requis'); o.name_fr = o.name_fr || o.name_ar; o.name_ar = o.name_ar || o.name_fr; o.name_en = o.name_en || o.name_fr; return o; };
const curaStatusFields = (r = {}) => `<div class="grid grid-cols-2 gap-3"><div><label class="${lblCls}">Statut</label><select id="cura-status" class="${inputCls}"><option value="published" ${r.status !== 'draft' ? 'selected' : ''}>Publié (visible enseignants)</option><option value="draft" ${r.status === 'draft' ? 'selected' : ''}>Brouillon</option></select></div><label class="flex items-center gap-2 text-sm mt-6"><input type="checkbox" id="cura-verify" ${r.needs_verification ? 'checked' : ''} class="w-4 h-4"> À vérifier</label></div>`;
function curaEditChapter(id) {
  const ch = id ? CURA.chapters.find(c => c.id === id) : { trimester: CURA.trimester === 'all' ? 1 : Number(CURA.trimester), status: 'published' };
  openModal(`<i class="fas fa-book-open mr-2 text-blue-600"></i>${id ? 'Modifier le chapitre' : 'Nouveau chapitre'} <span class="text-sm font-normal text-gray-500">· ${esc(curaN(CURA.ls))}</span>`, `<form onsubmit="curaSaveChapter(event, ${id || 'null'})" class="space-y-3">
    ${curaTri(ch)}
    <div class="grid grid-cols-2 gap-3"><div><label class="${lblCls}">Trimestre</label><select id="cura-tri" class="${inputCls}">${[[1, '1er trimestre'], [2, '2ème trimestre'], [3, '3ème trimestre'], [0, 'Toute l\'année']].map(([k, l]) => `<option value="${k}" ${ch.trimester === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div><div><label class="${lblCls}">Code (import idempotent)</label><input id="cura-code" class="${inputCls} font-mono text-xs" value="${esc(ch.code || '')}" placeholder="auto"></div></div>
    ${curaStatusFields(ch)}
    <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div></form>`);
}
async function curaSaveChapter(e, id) {
  e.preventDefault();
  try {
    const lv = CURA.levels.find(l => l.id === CURA.level_id); const names = curaReadTri(); const tri = Number(document.getElementById('cura-tri').value);
    const code = document.getElementById('cura-code').value.trim() || `${lv?.code}.${CURA.ls.code}${CURA.section_id ? '.' + (CURA.sections.find(s => s.id === CURA.section_id)?.code || '') : ''}.T${tri}.${names.name_fr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    const body = { ...names, trimester: tri, code, status: document.getElementById('cura-status').value, needs_verification: document.getElementById('cura-verify').checked, level_subject_id: CURA.ls.level_subject_id };
    if (!id) body.position = CURA.chapters.filter(c => c.trimester === tri).length + 1;
    await curaApi(id ? 'put' : 'post', `/chapters${id ? '/' + id : ''}`, body); closeModal(); toast('Chapitre enregistré'); curaLoadChapters();
  } catch (err) { toast(err.response?.data?.detail?.message || err.response?.data?.error || err.message, 'error'); }
}
function curaEditNotion(chId, id) {
  const ch = CURA.chapters.find(c => c.id === chId); const n = id ? (ch.notions || []).find(x => x.id === id) : {};
  openModal(`<i class="fas fa-bookmark mr-2 text-green-600"></i>${id ? 'Modifier la notion' : 'Nouvelle notion'} <span class="text-sm font-normal text-gray-500">· ${esc(curaN(ch))}</span>`, `<form onsubmit="curaSaveNotion(event, ${chId}, ${id || 'null'})" class="space-y-3">${curaTri(n)}<div><label class="${lblCls}">Code</label><input id="cura-code" class="${inputCls} font-mono text-xs" value="${esc(n.code || '')}" placeholder="auto"></div>
    <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div></form>`);
}
async function curaSaveNotion(e, chId, id) {
  e.preventDefault();
  try {
    const ch = CURA.chapters.find(c => c.id === chId); const names = curaReadTri();
    const code = document.getElementById('cura-code').value.trim() || `${ch.code || 'ch' + chId}.${names.name_fr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)}`;
    const body = { ...names, code, chapter_id: chId }; if (!id) body.position = (ch.notions || []).length + 1;
    await curaApi(id ? 'put' : 'post', `/notions${id ? '/' + id : ''}`, body); closeModal(); toast('Notion enregistrée'); curaLoadChapters();
  } catch (err) { toast(err.response?.data?.detail?.message || err.response?.data?.error || err.message, 'error'); }
}
async function curaDelete(table, id, label) {
  if (!(await curaConfirm(`Supprimer ${label} ?`))) return;
  try { await curaApi('delete', `/${table}/${id}`); toast('Supprimé'); if (table === 'level_subjects') { CURA.ls = null; curaLoadSubjects(); document.getElementById('cura-main').innerHTML = ''; } else curaLoadChapters(); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
// Paramètres du couple niveau × matière (langue, durée, barème, coefficient, spécialité, statut)
function curaEditLevelSubject(lsId) {
  const s = CURA.subjects.find(x => x.level_subject_id === lsId); if (!s) return;
  openModal(`<i class="fas fa-sliders mr-2 text-blue-600"></i>${esc(s.name_fr)} <span class="text-sm font-normal text-gray-500">· ${esc(curaN(CURA.levels.find(l => l.id === CURA.level_id)))}</span>`, `<form onsubmit="curaSaveLevelSubject(event, ${lsId})" class="space-y-3">
    <div class="grid grid-cols-2 gap-3">
      <div><label class="${lblCls}">Langue de l'épreuve</label><select id="cura-lang" class="${inputCls}"><option value="">Héritée de la matière</option>${['ar', 'fr', 'en'].map(k => `<option value="${k}" ${s.default_lang === k ? 'selected' : ''}>${EVA_I18N[k].name}</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Durée par défaut (min)</label><input id="cura-dur" type="number" min="10" step="5" class="${inputCls}" value="${s.duration_default || ''}"></div>
      <div><label class="${lblCls}">Barème</label><input id="cura-scale" type="number" min="10" step="10" class="${inputCls}" value="${s.grading_scale || 20}"></div>
      <div><label class="${lblCls}">Coefficient</label><input id="cura-coef" type="number" min="0" step="0.5" class="${inputCls}" value="${s.coefficient ?? ''}"></div>
    </div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cura-spec" ${s.is_specialty ? 'checked' : ''} class="w-4 h-4"> Matière de spécialité (section)</label>
    ${curaStatusFields(s)}
    <div class="flex justify-between gap-2 pt-2"><button type="button" onclick="closeModal(); curaDelete('level_subjects', ${lsId}, 'cette matière pour ce niveau (et ses chapitres)')" class="${btnSecondary} text-red-600"><i class="fas fa-trash mr-1"></i>Retirer</button><div class="flex gap-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div></div></form>`);
}
async function curaSaveLevelSubject(e, lsId) {
  e.preventDefault();
  const body = { default_lang: document.getElementById('cura-lang').value || null, duration_default: Number(document.getElementById('cura-dur').value) || null, grading_scale: Number(document.getElementById('cura-scale').value) || 20, coefficient: document.getElementById('cura-coef').value === '' ? null : Number(document.getElementById('cura-coef').value), is_specialty: document.getElementById('cura-spec').checked, status: document.getElementById('cura-status').value, needs_verification: document.getElementById('cura-verify').checked };
  try { await curaApi('put', `/level_subjects/${lsId}`, body); closeModal(); toast('Paramètres enregistrés'); await curaLoadSubjects(); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
function curaAddLevelSubject() {
  const have = new Set(CURA.subjects.map(s => s.subject_id)); const avail = CURA.allSubjects.filter(s => !have.has(s.id));
  openModal('<i class="fas fa-plus mr-2 text-blue-600"></i>Ajouter une matière à ce niveau', `<form onsubmit="curaSaveAddLs(event)" class="space-y-3">
    <div><label class="${lblCls}">Matière du référentiel</label><select id="cura-add-subj" class="${inputCls}">${avail.map(s => `<option value="${s.id}">${esc(s.name_fr)} · ${esc(s.name_ar)}</option>`).join('')}</select></div>
    <p class="text-xs text-gray-500">La matière n'existe pas ? Créez-la d'abord dans l'onglet « Matières & mapping ».</p>
    <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}" ${avail.length ? '' : 'disabled'}><i class="fas fa-plus mr-1"></i>Ajouter</button></div></form>`);
}
async function curaSaveAddLs(e) {
  e.preventDefault();
  try { await curaApi('post', '/level_subjects', { level_id: CURA.level_id, section_id: CURA.section_id || null, subject_id: Number(document.getElementById('cura-add-subj').value), position: CURA.subjects.length + 1, status: 'published' }); closeModal(); toast('Matière ajoutée'); await curaLoadSubjects(); } catch (err) { toast(err.response?.data?.detail?.message || err.response?.data?.error || 'Erreur', 'error'); }
}

/* ---------- Onglet Matières & mapping vers le carnet de notes ---------- */
function curaRenderSubjects(t) {
  const school = App.cache.subjects || [];
  t.innerHTML = `<div class="bg-white rounded-xl border p-4">
    <div class="flex items-center justify-between mb-3"><p class="text-sm text-gray-600">Chaque matière du programme est reliée à une matière du carnet de notes (mapping automatique par nom, modifiable).</p><button onclick="curaEditSubject(null)" class="${btnPrimary} text-xs"><i class="fas fa-plus mr-1"></i>Matière</button></div>
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-left text-xs text-gray-500 border-b"><th class="py-2">Code</th><th>FR</th><th>AR</th><th>EN</th><th>Famille</th><th>Langue</th><th>Carnet de notes</th><th></th></tr></thead><tbody>
    ${CURA.allSubjects.map(s => `<tr class="border-b hover:bg-gray-50"><td class="py-1.5"><code class="text-xs">${esc(s.code)}</code></td><td>${esc(s.name_fr)}</td><td dir="rtl">${esc(s.name_ar)}</td><td>${esc(s.name_en)}</td><td class="text-xs text-gray-500">${esc(s.family || '')}${s.is_optional ? ' · optionnelle' : ''}</td><td class="text-xs">${EVA_I18N[s.default_lang]?.name || s.default_lang}</td>
      <td><select onchange="curaMapSubject(${s.id}, this.value)" class="${inputCls} text-xs py-1 ${s.school_subject_id ? '' : 'border-amber-300 bg-amber-50'}"><option value="">— non reliée —</option>${school.map(x => `<option value="${x.id}" ${String(s.school_subject_id) === String(x.id) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td class="text-right whitespace-nowrap"><button onclick="curaEditSubject(${s.id})" class="text-gray-400 hover:text-blue-600 px-1"><i class="fas fa-pen"></i></button><button onclick="curaDeleteSubject(${s.id})" class="text-gray-400 hover:text-red-600 px-1"><i class="fas fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div></div>`;
}
async function curaMapSubject(id, schoolId) { try { await curaApi('put', `/subjects/${id}`, { school_subject_id: schoolId ? Number(schoolId) : null }); toast('Mapping enregistré'); const s = CURA.allSubjects.find(x => x.id === id); if (s) s.school_subject_id = schoolId ? Number(schoolId) : null; } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); } }
function curaEditSubject(id) {
  const s = id ? CURA.allSubjects.find(x => x.id === id) : { default_lang: 'ar', family: 'autres' };
  openModal(`<i class="fas fa-book mr-2 text-blue-600"></i>${id ? 'Modifier la matière' : 'Nouvelle matière'}`, `<form onsubmit="curaSaveSubject(event, ${id || 'null'})" class="space-y-3">${curaTri(s)}
    <div class="grid grid-cols-3 gap-3"><div><label class="${lblCls}">Code</label><input id="cura-code" class="${inputCls} font-mono text-xs" value="${esc(s.code || '')}" ${id ? 'readonly' : 'required'} placeholder="ex. allemand"></div>
    <div><label class="${lblCls}">Famille</label><select id="cura-family" class="${inputCls}">${['langues', 'sciences', 'humaines', 'arts', 'techno', 'sport', 'autres'].map(f => `<option ${s.family === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
    <div><label class="${lblCls}">Langue par défaut</label><select id="cura-lang" class="${inputCls}">${['ar', 'fr', 'en'].map(k => `<option value="${k}" ${s.default_lang === k ? 'selected' : ''}>${EVA_I18N[k].name}</option>`).join('')}</select></div></div>
    <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="cura-opt" ${s.is_optional ? 'checked' : ''} class="w-4 h-4"> Matière optionnelle</label>
    <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div></form>`);
}
async function curaSaveSubject(e, id) {
  e.preventDefault();
  try { const body = { ...curaReadTri(), family: document.getElementById('cura-family').value, default_lang: document.getElementById('cura-lang').value, is_optional: document.getElementById('cura-opt').checked }; if (!id) { body.code = document.getElementById('cura-code').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'); body.position = CURA.allSubjects.length + 1; }
    await curaApi(id ? 'put' : 'post', `/subjects${id ? '/' + id : ''}`, body); closeModal(); toast('Matière enregistrée'); CURA.allSubjects = await curaApi('get', `/subjects?lang=${CURA.lang}`); curaRenderTab(); } catch (err) { toast(err.response?.data?.detail?.message || err.response?.data?.error || err.message, 'error'); }
}
async function curaDeleteSubject(id) { if (!(await curaConfirm('Supprimer cette matière du référentiel (et toutes ses affectations/chapitres) ?'))) return; try { await curaApi('delete', `/subjects/${id}`); toast('Supprimée'); CURA.allSubjects = await curaApi('get', `/subjects?lang=${CURA.lang}`); curaRenderTab(); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); } }

/* ---------- Onglet Types d'exercices ---------- */
function curaRenderTypes(t) {
  t.innerHTML = `<div class="bg-white rounded-xl border p-4"><div class="flex items-center justify-between mb-3"><p class="text-sm text-gray-600">Les 8 types moteur sont corrigés automatiquement ; les autres sont des gabarits du type « réponse rédigée » (ou « compléter »), filtrés par matière.</p><button onclick="curaEditType(null)" class="${btnPrimary} text-xs"><i class="fas fa-plus mr-1"></i>Type</button></div>
    <ul id="cura-type-list" class="space-y-1.5">${CURA.types.map(x => `<li draggable="true" data-id="${x.id}" ondragstart="curaDragStart(event)" ondragover="curaDragOver(event)" ondrop="curaDrop(event,'exercise_types','cura-type-list')" class="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-gray-50/60"><i class="fas fa-grip-vertical text-gray-300 cursor-grab"></i><code class="text-xs w-36 truncate">${esc(x.code)}</code><span class="flex-1" dir="${curaDir()}">${esc(curaN(x))}</span><span class="badge badge-blue">${esc(x.base_type)}</span><span class="text-xs text-gray-500">${(x.subject_codes || []).length ? x.subject_codes.join(', ') : 'toutes matières'}</span><button onclick="curaEditType(${x.id})" class="text-gray-400 hover:text-blue-600 px-1"><i class="fas fa-pen"></i></button>${x.base_type !== x.code ? `<button onclick="curaDeleteType(${x.id})" class="text-gray-400 hover:text-red-600 px-1"><i class="fas fa-trash"></i></button>` : ''}</li>`).join('')}</ul></div>`;
}
function curaEditType(id) {
  const x = id ? CURA.types.find(y => y.id === id) : { base_type: 'open', subject_codes: [], template: {} };
  openModal(`<i class="fas fa-shapes mr-2 text-blue-600"></i>${id ? 'Modifier le type' : 'Nouveau type d\'exercice'}`, `<form onsubmit="curaSaveType(event, ${id || 'null'})" class="space-y-3">${curaTri(x)}
    <div class="grid grid-cols-2 gap-3"><div><label class="${lblCls}">Code</label><input id="cura-code" class="${inputCls} font-mono text-xs" value="${esc(x.code || '')}" ${id ? 'readonly' : 'required'}></div><div><label class="${lblCls}">Type moteur</label><select id="cura-base" class="${inputCls}">${Object.keys(EVA_I18N.fr.types).map(k => `<option value="${k}" ${x.base_type === k ? 'selected' : ''}>${esc(EVA_I18N.fr.types[k])}</option>`).join('')}</select></div></div>
    <div><label class="${lblCls}">Matières concernées (codes, vide = toutes)</label><input id="cura-subj" class="${inputCls} text-xs" value="${esc((x.subject_codes || []).join(', '))}" placeholder="maths, physique"></div>
    <div><label class="${lblCls}">Gabarit JSON (consigne {fr,ar,en}, criteria[], lines, image, grid, table)</label><textarea id="cura-tpl" class="${inputCls} font-mono text-xs" rows="4">${esc(JSON.stringify(x.template || {}, null, 1))}</textarea></div>
    <div class="flex justify-end gap-2 pt-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button class="${btnPrimary}"><i class="fas fa-save mr-1"></i>Enregistrer</button></div></form>`);
}
async function curaSaveType(e, id) {
  e.preventDefault();
  try { let tpl = {}; try { tpl = JSON.parse(document.getElementById('cura-tpl').value || '{}'); } catch { throw new Error('Gabarit JSON invalide'); }
    const body = { ...curaReadTri(), base_type: document.getElementById('cura-base').value, subject_codes: document.getElementById('cura-subj').value.split(',').map(s => s.trim()).filter(Boolean), template: tpl }; if (!id) { body.code = document.getElementById('cura-code').value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'); body.position = CURA.types.length + 1; }
    await curaApi(id ? 'put' : 'post', `/exercise_types${id ? '/' + id : ''}`, body); closeModal(); toast('Type enregistré'); CURA.types = await curaApi('get', `/exercise-types?lang=${CURA.lang}`); curaRenderTab(); } catch (err) { toast(err.response?.data?.detail?.message || err.response?.data?.error || err.message, 'error'); }
}
async function curaDeleteType(id) { if (!(await curaConfirm('Supprimer ce type d\'exercice ?'))) return; try { await curaApi('delete', `/exercise_types/${id}`); CURA.types = await curaApi('get', `/exercise-types?lang=${CURA.lang}`); curaRenderTab(); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); } }

/* ---------- Seed / import / export ---------- */
async function curaSeed() {
  if (!(await curaConfirm('Charger / mettre à jour le programme de base (cycles, niveaux, sections, matières, domaines, types, chapitres d\'exemple) ? Opération idempotente : les éléments existants sont mis à jour, rien n\'est supprimé.'))) return;
  toast('Chargement en cours (20–40 s)…');
  try { const r = await curaApi('post', '/seed'); toast(`Programme chargé : ${r.levels} niveaux, ${r.level_subjects} couples, ${r.chapters} chapitres, ${r.mapped_subjects} matières reliées`); render(); } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
async function curaExport() { try { const d = await curaApi('get', '/export'); const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `referentiel_programme_${new Date().toISOString().slice(0, 10)}.json`; a.click(); } catch (err) { toast('Export impossible', 'error'); } }
function curaImportModal() {
  openModal('<i class="fas fa-file-import mr-2 text-blue-600"></i>Importer des chapitres / notions', `<div class="space-y-3 text-sm">
    <p class="text-gray-600">Deux formats acceptés :</p>
    <ul class="list-disc ml-5 text-xs text-gray-600 space-y-1"><li><b>CSV</b> (séparateur <code>,</code> ou <code>;</code>) avec en-têtes : <code>level,section,subject,trimester,code,name_ar,name_fr,name_en,notion_code,notion_ar,notion_fr,notion_en</code> — une ligne par notion (les lignes d'un même chapitre se regroupent par <code>code</code>). Codes niveau : P1…P6, C7…C9, S1…S4 ; codes matière/section = ceux de l'onglet Matières (ex. <code>maths</code>, <code>sciences_exp</code>).</li><li><b>JSON</b> au format <code>/seed/*.json</code> ou de l'export (clés <code>chapters</code>, <code>subjects</code>, …).</li></ul>
    <textarea id="cura-import" class="${inputCls} font-mono text-xs" rows="8" placeholder="level,section,subject,trimester,code,name_ar,name_fr,name_en,notion_code,notion_ar,notion_fr,notion_en
P6,,maths,2,P6.maths.T2.proportionnalite,التناسب,Proportionnalité,Proportionality,P6.maths.T2.proportionnalite.tableau,جدول التناسب,Tableau de proportionnalité,Proportionality table"></textarea>
    <input type="file" accept=".csv,.json,text/csv,application/json" onchange="const f=this.files[0]; if(f){ f.text().then(t=>document.getElementById('cura-import').value=t); }" class="text-xs">
    <p class="text-xs text-gray-500">Les chapitres importés sont marqués « à vérifier » et publiés ; relancez l'import pour mettre à jour (clé = code).</p>
    <div class="flex justify-end gap-2"><button onclick="closeModal()" class="${btnSecondary}">Annuler</button><button onclick="curaImportGo()" class="${btnPrimary}"><i class="fas fa-file-import mr-1"></i>Importer</button></div></div>`, { wide: true });
}
async function curaImportGo() {
  const txt = document.getElementById('cura-import').value.trim(); if (!txt) return toast('Collez un CSV ou un JSON', 'error');
  let body; try { body = { data: JSON.parse(txt) }; } catch { body = { csv: txt }; }
  try { const r = await curaApi('post', '/import', body); closeModal(); toast(`Import OK : ${r.chapters || 0} chapitres, ${r.notions || 0} notions`); if (CURA.ls) curaLoadChapters(); else render(); } catch (err) { toast(err.response?.data?.error || 'Erreur d\'import', 'error'); }
}
