/* ============================================================
   Rahma Academy - Devoirs à rendre (الواجبات المنزلية)
   Enseignant : publier / suivre / corriger. Élève-Parent : consulter / déposer. Admin : tout.
   ============================================================ */

const HW_STATUS = {
  todo:     { label: 'À faire',    ar: 'للإنجاز',   cls: 'bg-amber-100 text-amber-800 border-amber-300',  icon: 'fa-pen' },
  late:     { label: 'En retard',  ar: 'متأخر',     cls: 'bg-red-100 text-red-800 border-red-300',        icon: 'fa-clock' },
  submitted:{ label: 'Rendu',      ar: 'تم التسليم', cls: 'bg-blue-100 text-blue-800 border-blue-300',     icon: 'fa-paper-plane' },
  graded:   { label: 'Corrigé',    ar: 'مُصحَّح',    cls: 'bg-green-100 text-green-800 border-green-300',  icon: 'fa-check-double' },
  closed:   { label: 'Clôturé',    ar: 'مغلق',      cls: 'bg-gray-100 text-gray-600 border-gray-300',     icon: 'fa-lock' }
};
const hwStatusOf = (hw, sub) => sub ? (sub.status === 'submitted' ? 'submitted' : 'graded') : (hw.status === 'closed' ? 'closed' : (hw.overdue ? 'late' : 'todo'));
const hwBadge = k => { const s = HW_STATUS[k]; return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${s.cls}"><i class="fas ${s.icon}"></i>${s.label} · ${s.ar}</span>`; };
const hwCountdown = due => { const d = new Date(due) - Date.now(); if (d < 0) return `<span class="text-red-600">dépassé depuis ${Math.ceil(-d/86400000)} j</span>`; const j = Math.floor(d/86400000), h = Math.floor(d%86400000/3600000); return j > 0 ? `${j} j ${h} h restants` : h > 0 ? `<span class="text-amber-600 font-bold">${h} h restantes</span>` : `<span class="text-red-600 font-bold">moins d'une heure</span>`; };
const HW_DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const fmtDue = d => HW_DAYS[dayjs(d).day()] + ' ' + dayjs(d).format('DD/MM/YYYY à HH:mm');
const hwFileIcon = t => /pdf/.test(t||'') ? 'fa-file-pdf text-red-500' : /image/.test(t||'') ? 'fa-file-image text-blue-500' : /word/.test(t||'') ? 'fa-file-word text-blue-700' : 'fa-file text-gray-500';
const fileLinks = files => (files||[]).map(f => `<a href="${esc(f.url)}" target="_blank" class="inline-flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 rounded px-2 py-1 mr-1 mb-1"><i class="fas ${hwFileIcon(f.type)}"></i>${esc(f.name||'fichier')}</a>`).join('');

VIEWS.homeworks = async function(el) {
  const r = (await api.get('/homeworks' + (App.cache.hwAll && App.user.role === 'teacher' ? '?mine=0' : ''))).data;
  if (!r.supported) { el.innerHTML = pageHeader('Devoirs', 'fa-book-open') + `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Le module Devoirs nécessite l'exécution de <code>migrations/0010_homeworks.sql</code> dans Supabase SQL Editor, puis la création du bucket Storage public <code>homeworks</code>.</div>`; return; }
  App.cache.hwItems = r.items;
  if (isStaff()) return renderHwStaff(el, r.items);
  // enfants liés (niveau) pour filtrer les devoirs par classe
  if (!App.cache.kidsById) {
    App.cache.kidsById = {};
    try {
      const ids = linkedIds();
      if (ids.length) (await api.get('/db/students')).data.forEach(s => { App.cache.kidsById[s.id] = s; });
    } catch {}
  }
  return renderHwFamily(el, r.items);
};

/* ---------------- ENSEIGNANT / ADMIN ---------------- */
function renderHwStaff(el, items) {
  const filter = App.cache.hwFilter || 'open';
  let list = items.filter(h => filter === 'all' ? true : filter === 'open' ? h.status !== 'closed' : h.status === 'closed');
  const toGrade = items.reduce((a, h) => a + (h.submitted - h.graded), 0);
  el.innerHTML = pageHeader('Devoirs à rendre <span class="text-gray-400 text-base font-normal">· الواجبات المنزلية</span>', 'fa-book-open',
    (isReadOnlyYear() ? '' : `<button onclick="showHwForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau devoir</button>`)) + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <div class="flex gap-1">${[['open','En cours'],['closed','Clôturés'],['all','Tous']].map(([k,l]) => `<button onclick="App.cache.hwFilter='${k}'; render()" class="px-3 py-1.5 rounded-lg text-sm font-semibold ${filter===k?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}">${l}</button>`).join('')}</div>
    ${App.user.role === 'teacher' ? `<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" ${App.cache.hwAll?'checked':''} onchange="App.cache.hwAll=this.checked; render()" class="w-4 h-4"> Voir aussi les devoirs des autres enseignants de mes niveaux</label>` : ''}
    <span class="ml-auto text-sm ${toGrade ? 'text-amber-700 font-bold' : 'text-gray-400'}"><i class="fas fa-highlighter mr-1"></i>${toGrade} dépôt(s) à corriger</span>
  </div>
  <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    ${list.map(h => {
      const pct = h.total_students ? Math.round(h.submitted / h.total_students * 100) : 0;
      const gpct = h.total_students ? Math.round(h.graded / h.total_students * 100) : 0;
      return `<article class="bg-white rounded-xl shadow p-5 flex flex-col ${h.status==='closed'?'opacity-75':''}">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="min-w-0"><h3 class="font-bold text-gray-800 truncate">${esc(h.title)}</h3>
            <p class="text-xs text-gray-500">${h.subjects?.name ? esc(h.subjects.name) + ' · ' : ''}<span class="badge badge-blue">${esc(h.level)}</span>${h.teachers ? ' · ' + esc(h.teachers.first_name + ' ' + h.teachers.last_name) : ''}</p></div>
          ${h.status==='closed' ? hwBadge('closed') : h.status==='draft' ? '<span class="badge badge-gray">Brouillon</span>' : h.overdue ? '<span class="badge badge-red">Délai dépassé</span>' : '<span class="badge badge-green">Ouvert</span>'}
        </div>
        <p class="text-xs text-gray-500 mb-1"><i class="fas fa-calendar-day mr-1"></i>${fmtDue(h.due_at)} — ${hwCountdown(h.due_at)}</p>
        <div class="flex gap-2 text-[11px] text-gray-500 mb-3 flex-wrap">${h.count_in_term ? '<span class="badge badge-purple"><i class="fas fa-star mr-1"></i>Compte T' + h.trimester + '</span>' : ''}${h.allow_late ? '' : '<span class="badge badge-yellow">Retard bloqué</span>'}<span class="badge badge-gray">/${h.max_points}</span>${h.attachment_url ? `<a href="${esc(h.attachment_url)}" target="_blank" class="badge badge-blue"><i class="fas fa-paperclip mr-1"></i>Pièce jointe</a>` : ''}</div>
        <div class="mb-1 flex justify-between text-xs"><span>Rendus <b>${h.submitted}/${h.total_students}</b></span><span>Corrigés <b>${h.graded}</b></span></div>
        <div class="h-2 bg-gray-100 rounded-full overflow-hidden relative"><div class="absolute inset-y-0 left-0 bg-blue-400" style="width:${pct}%"></div><div class="absolute inset-y-0 left-0 bg-green-500" style="width:${gpct}%"></div></div>
        <div class="flex gap-2 mt-4 flex-wrap">
          <button onclick="openHwGrading(${h.id})" class="${btnPrimary} text-xs flex-1"><i class="fas fa-highlighter mr-1"></i> Corriger${h.submitted - h.graded ? ` (${h.submitted - h.graded})` : ''}</button>
          ${isReadOnlyYear() ? '' : `<button onclick="showHwForm(${h.id})" class="${btnSecondary} text-xs" title="Modifier"><i class="fas fa-pen"></i></button>
          <button onclick="hwRemind(${h.id})" class="${btnSecondary} text-xs" title="Relancer les élèves qui n'ont pas rendu"><i class="fas fa-bell"></i></button>
          ${h.status !== 'closed' ? `<button onclick="hwSetStatus(${h.id},'closed')" class="${btnSecondary} text-xs" title="Clôturer"><i class="fas fa-lock"></i></button>` : `<button onclick="hwSetStatus(${h.id},'published')" class="${btnSecondary} text-xs" title="Rouvrir"><i class="fas fa-lock-open"></i></button>`}`}
          <button onclick="printHw(${h.id})" class="${btnSecondary} text-xs" title="Imprimer la fiche"><i class="fas fa-print"></i></button>
          ${isReadOnlyYear() ? '' : `<button onclick="hwDelete(${h.id})" class="text-red-400 hover:text-red-600 text-xs px-2" title="Supprimer"><i class="fas fa-trash"></i></button>`}
        </div>
      </article>`; }).join('') || `<p class="text-gray-400 col-span-full text-center py-12"><i class="fas fa-book-open text-4xl block mb-2"></i>Aucun devoir${filter==='open'?' en cours':''}. ${isStaff() && !isReadOnlyYear() ? 'Cliquez sur « Nouveau devoir » pour commencer.' : ''}</p>`}
  </div>`;
}

async function showHwForm(id) {
  const h = id ? App.cache.hwItems.find(x => x.id === id) : null;
  const subjects = await db.list('subjects', 'select=id,name,cycle&order=name');
  const lv = App.user.role === 'teacher' ? null : null;
  const due = h ? dayjs(h.due_at) : dayjs().add(3, 'day').hour(18).minute(0);
  openModal(`<i class="fas fa-book-open text-blue-600 mr-2"></i>${h ? 'Modifier le devoir' : 'Nouveau devoir · واجب جديد'}`, `
    <form onsubmit="saveHw(event, ${id || 'null'})">
      <label class="${lblCls}">Titre <span class="text-red-500">*</span></label>
      <input id="hw-title" required class="${inputCls} mb-3" value="${esc(h?.title||'')}" placeholder="Ex : Exercices p. 34 n° 1 à 4">
      <label class="${lblCls}">Consignes</label>
      <textarea id="hw-instructions" rows="4" class="${inputCls} mb-3" placeholder="Détaillez le travail attendu…">${esc(h?.instructions||'')}</textarea>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${lblCls}">Niveau <span class="text-red-500">*</span></label><select id="hw-level" class="${inputCls}">${levelOptions(h?.level)}</select></div>
        <div><label class="${lblCls}">Matière</label><select id="hw-subject" class="${inputCls}"><option value="">—</option>${subjects.map(s => `<option value="${s.id}" ${h?.subject_id===s.id?'selected':''}>${esc(s.name)} (${s.cycle})</option>`).join('')}</select></div>
        <div><label class="${lblCls}">Date limite <span class="text-red-500">*</span></label><input id="hw-due-date" type="date" required class="${inputCls}" value="${due.format('YYYY-MM-DD')}"></div>
        <div><label class="${lblCls}">Heure limite</label><input id="hw-due-time" type="time" class="${inputCls}" value="${due.format('HH:mm')}"></div>
        <div><label class="${lblCls}">Barème (points)</label><input id="hw-max" type="number" min="1" step="0.5" class="${inputCls}" value="${h?.max_points||20}"></div>
        <div><label class="${lblCls}">Trimestre</label><select id="hw-trim" class="${inputCls}">${[1,2,3].map(t => `<option value="${t}" ${(h?.trimester||1)===t?'selected':''}>Trimestre ${t}</option>`).join('')}</select></div>
      </div>
      <div class="mt-3 space-y-2">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="hw-count" class="w-4 h-4" ${h ? (h.count_in_term?'checked':'') : ''}> <b>Compte pour le trimestre</b> <span class="text-gray-400">— la note est reportée dans le carnet (ramenée sur 20, type « devoir »)</span></label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="hw-late" class="w-4 h-4" ${h ? (h.allow_late?'checked':'') : 'checked'}> <b>Dépôt tardif autorisé</b> <span class="text-gray-400">— marqué « en retard » ; décoché = bloqué après la date limite</span></label>
      </div>
      <div class="mt-3"><label class="${lblCls}">Pièce jointe (PDF / image, facultatif)</label>
        <input type="file" id="hw-file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="${inputCls}">
        ${h?.attachment_url ? `<p class="text-xs mt-1"><a href="${esc(h.attachment_url)}" target="_blank" class="text-blue-600"><i class="fas fa-paperclip mr-1"></i>${esc(h.attachment_name||'Pièce jointe actuelle')}</a> <label class="ml-2 text-gray-500"><input type="checkbox" id="hw-file-remove"> retirer</label></p>` : ''}
      </div>
      <div id="hw-error" class="text-red-600 text-sm mt-3 hidden"></div>
      <div class="flex gap-2 mt-4">
        <button type="submit" class="${btnPrimary} flex-1" id="hw-save"><i class="fas fa-paper-plane mr-1"></i> ${h ? 'Enregistrer' : 'Publier et notifier'}</button>
        ${!h ? `<button type="button" onclick="saveHw(event, null, 'draft')" class="${btnSecondary}"><i class="fas fa-file mr-1"></i> Brouillon</button>` : ''}
      </div>
    </form>`, { wide: true });
}

async function hwUploadFile(file, bucket = 'homeworks') {
  // Filigrane + registre d'authenticité via uploadFile (images : navigateur ; PDF : serveur)
  const r = await uploadFile(bucket, file, { silent: true });
  return { url: r.url, name: file.name, type: file.type, size: file.size, code: r.code, sha256: r.sha256 };
}

async function saveHw(e, id, forceStatus) {
  e.preventDefault();
  const err = document.getElementById('hw-error'); err.classList.add('hidden');
  const btn = document.getElementById('hw-save'); btn.disabled = true;
  try {
    const payload = {
      title: formVal('hw-title'), instructions: formVal('hw-instructions'), level: formVal('hw-level'),
      subject_id: formVal('hw-subject') ? Number(formVal('hw-subject')) : null,
      due_at: dayjs(`${formVal('hw-due-date')} ${formVal('hw-due-time') || '23:59'}`).toISOString(),
      max_points: Number(formVal('hw-max')) || 20, trimester: Number(formVal('hw-trim')),
      count_in_term: document.getElementById('hw-count').checked, allow_late: document.getElementById('hw-late').checked
    };
    if (forceStatus) payload.status = forceStatus;
    const f = document.getElementById('hw-file').files[0];
    if (f) { if (f.size > 10 * 1024 * 1024) throw new Error('Pièce jointe > 10 Mo'); const up = await hwUploadFile(f, 'courses'); payload.attachment_url = up.url; payload.attachment_name = up.name; }
    else if (document.getElementById('hw-file-remove')?.checked) { payload.attachment_url = null; payload.attachment_name = null; }
    if (id) await api.put(`/homeworks/${id}`, payload); else await api.post('/homeworks', payload);
    closeModal(); toast(id ? 'Devoir mis à jour' : (forceStatus === 'draft' ? 'Brouillon enregistré' : 'Devoir publié — élèves et parents notifiés 📚')); refreshHwBadge(); render();
  } catch (ex) { err.textContent = ex.response?.data?.error || ex.message || 'Erreur'; err.classList.remove('hidden'); btn.disabled = false; }
}
async function hwSetStatus(id, status) { try { await api.put(`/homeworks/${id}`, { status }); toast(status === 'closed' ? 'Devoir clôturé' : 'Devoir rouvert'); render(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }
async function hwDelete(id) { if (!confirm('Mettre ce devoir à la corbeille ? (restaurable 30 jours par l\'administration)')) return; try { await api.delete(`/homeworks/${id}`); toast('Devoir supprimé'); render(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }
async function hwRemind(id) { try { const r = (await api.post(`/homeworks/${id}/remind`)).data; toast(r.missing ? `Relance envoyée à ${r.sent} élève(s) / parent(s) n'ayant pas rendu` : 'Tous les élèves ont rendu 🎉', r.missing ? 'success' : 'info'); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }

/* ---- Correction élève par élève ---- */
async function openHwGrading(id) {
  const h = App.cache.hwItems.find(x => x.id === id); if (!h) return;
  // Élèves du niveau (portée enseignant) + dépôts
  let students = await db.list('students', `select=id,first_name,last_name,level,photo_url&status=eq.actif&level=eq.${encodeURIComponent(h.level)}&order=last_name`);
  const subs = await db.list('homework_submissions', `select=*&homework_id=eq.${id}`).catch(() => []);
  const bySid = Object.fromEntries(subs.map(s => [s.student_id, s]));
  // ordre : à corriger d'abord, puis rendus corrigés, puis non rendus
  students.sort((a, b) => { const ra = bySid[a.id] ? (bySid[a.id].status === 'submitted' ? 0 : 1) : 2, rb = bySid[b.id] ? (bySid[b.id].status === 'submitted' ? 0 : 1) : 2; return ra - rb || a.last_name.localeCompare(b.last_name); });
  App.cache.hwGrading = { hw: h, students, bySid, idx: 0 };
  openModal(`<i class="fas fa-highlighter text-amber-500 mr-2"></i>Correction — ${esc(h.title)} <span class="badge badge-blue ml-2">${esc(h.level)}</span>`, `<div id="hw-grading"></div>`, { wide: true });
  renderHwGrading();
}
function renderHwGrading() {
  const g = App.cache.hwGrading; const el = document.getElementById('hw-grading'); if (!g || !el) return;
  const h = g.hw; const s = g.students[g.idx]; const sub = s ? g.bySid[s.id] : null;
  const graded = g.students.filter(x => g.bySid[x.id] && g.bySid[x.id].status !== 'submitted').length;
  if (!s) { el.innerHTML = '<p class="text-gray-400 text-center py-10">Aucun élève actif dans ce niveau.</p>'; return; }
  el.innerHTML = `
  <div class="flex items-center justify-between mb-3 text-sm">
    <button onclick="hwNav(-1)" class="${btnSecondary}" ${g.idx===0?'disabled':''}><i class="fas fa-chevron-left"></i> Précédent</button>
    <div class="text-center"><b>${g.idx+1} / ${g.students.length}</b> · <span class="text-green-700">${graded} corrigé(s)</span></div>
    <button onclick="hwNav(1)" class="${btnSecondary}" ${g.idx===g.students.length-1?'disabled':''}>Suivant <i class="fas fa-chevron-right"></i></button>
  </div>
  <div class="flex gap-1 mb-4 flex-wrap">${g.students.map((x,i) => { const st = g.bySid[x.id]; const c = !st ? 'bg-gray-200' : st.status==='submitted' ? 'bg-blue-400' : 'bg-green-500'; return `<button onclick="App.cache.hwGrading.idx=${i}; renderHwGrading()" class="w-7 h-7 rounded-full text-[10px] font-bold text-white ${c} ${i===g.idx?'ring-2 ring-offset-1 ring-blue-700':''}" title="${esc(x.first_name+' '+x.last_name)}">${esc(x.first_name[0])}</button>`; }).join('')}</div>
  <div class="grid md:grid-cols-2 gap-4">
    <section class="bg-gray-50 rounded-lg p-4">
      <div class="flex items-center gap-3 mb-3">${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-12 h-12 rounded-full object-cover">` : `<div class="w-12 h-12 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-lg">${esc(s.first_name[0])}</div>`}
        <div><b class="text-gray-800">${esc(s.first_name)} ${esc(s.last_name)}</b><div class="text-xs">${sub ? hwBadge(sub.status==='submitted'?'submitted':'graded') + (sub.is_late ? ' <span class="badge badge-red">en retard</span>' : '') : hwBadge(h.overdue ? 'late' : 'todo') + ' <span class="text-gray-400">non rendu</span>'}</div></div></div>
      ${sub ? `<p class="text-xs text-gray-500 mb-2"><i class="fas fa-clock mr-1"></i>Rendu le ${fmtDT(sub.submitted_at)}</p>
        ${sub.content ? `<div class="bg-white border rounded p-3 text-sm whitespace-pre-wrap mb-2">${esc(sub.content)}</div>` : ''}
        ${(sub.files||[]).length ? `<div class="mb-2">${fileLinks(sub.files)}</div>` : ''}
        ${(sub.files||[]).filter(f => /image/.test(f.type||'')).map(f => `<img src="${esc(f.url)}" class="max-h-72 rounded border mb-2 cursor-zoom-in" onclick="window.open('${esc(f.url)}','_blank')">`).join('')}
        ${(sub.files||[]).filter(f => /pdf/.test(f.type||'')).slice(0,1).map(f => `<iframe src="${esc(f.url)}" class="w-full h-72 border rounded"></iframe>`).join('')}`
      : '<p class="text-sm text-gray-400 italic">Aucun dépôt. Vous pouvez tout de même attribuer une note (ex. 0 pour travail non rendu).</p>'}
    </section>
    <section>
      <label class="${lblCls}">Note <span class="text-gray-400 font-normal">/ ${h.max_points}${h.count_in_term ? ' — reportée sur 20 dans le carnet (T' + h.trimester + ')' : ''}</span></label>
      <div class="flex items-center gap-2 mb-3"><input id="hg-score" type="number" min="0" max="${h.max_points}" step="0.25" class="${inputCls} w-32 text-lg font-bold" value="${sub?.score ?? ''}" onkeydown="if(event.key==='Enter'){event.preventDefault();hwSaveGrade(true)}"><span class="text-gray-400">/ ${h.max_points}</span>
        <div class="flex gap-1 ml-2">${[0, Math.round(h.max_points/2), Math.round(h.max_points*0.75), h.max_points].map(v => `<button type="button" onclick="document.getElementById('hg-score').value=${v}" class="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200">${v}</button>`).join('')}</div></div>
      <label class="${lblCls}">Commentaire / correction · ملاحظات</label>
      <textarea id="hg-feedback" rows="5" class="${inputCls} mb-3" placeholder="Points forts, erreurs à revoir, conseils…">${esc(sub?.feedback||'')}</textarea>
      <label class="${lblCls}">Fichier corrigé (facultatif)</label>
      <input type="file" id="hg-file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="${inputCls} mb-1">
      ${sub?.corrected_file_url ? `<p class="text-xs mb-3"><a href="${esc(sub.corrected_file_url)}" target="_blank" class="text-blue-600"><i class="fas fa-file-circle-check mr-1"></i>Correction jointe</a></p>` : '<div class="mb-3"></div>'}
      <div id="hg-error" class="text-red-600 text-sm mb-2 hidden"></div>
      <div class="flex gap-2">
        <button onclick="hwSaveGrade(false)" class="${btnSecondary} flex-1"><i class="fas fa-save mr-1"></i> Enregistrer</button>
        <button onclick="hwSaveGrade(true)" class="${btnPrimary} flex-1"><i class="fas fa-check mr-1"></i> Enregistrer & suivant</button>
      </div>
      <p class="text-[11px] text-gray-400 mt-2"><i class="fas fa-bell mr-1"></i>L'élève et le parent sont notifiés de la note et du commentaire.</p>
    </section>
  </div>
  <div class="flex justify-between mt-4 pt-3 border-t">
    <button onclick="hwExportGrades()" class="${btnSecondary} text-xs"><i class="fas fa-file-excel text-green-600 mr-1"></i> Exporter les notes (Excel)</button>
    <button onclick="closeModal(); render()" class="${btnSecondary} text-xs">Fermer</button>
  </div>`;
  setTimeout(() => document.getElementById('hg-score')?.focus(), 50);
}
function hwNav(d) { const g = App.cache.hwGrading; g.idx = Math.max(0, Math.min(g.students.length - 1, g.idx + d)); renderHwGrading(); }
async function hwSaveGrade(next) {
  const g = App.cache.hwGrading; const s = g.students[g.idx]; const err = document.getElementById('hg-error'); err.classList.add('hidden');
  const scoreRaw = formVal('hg-score'); const feedback = formVal('hg-feedback');
  try {
    let corrected_file_url;
    const f = document.getElementById('hg-file').files[0]; if (f) corrected_file_url = (await hwUploadFile(f, 'homeworks')).url;
    const r = (await api.post(`/homeworks/${g.hw.id}/grade`, { student_id: s.id, score: scoreRaw === '' ? null : Number(scoreRaw), feedback, corrected_file_url })).data;
    g.bySid[s.id] = r;
    toast(scoreRaw === '' ? 'Commentaire enregistré' : `Note ${scoreRaw}/${g.hw.max_points} enregistrée pour ${s.first_name}`);
    if (next && g.idx < g.students.length - 1) g.idx++;
    renderHwGrading();
  } catch (e) { err.textContent = e.response?.data?.error || 'Erreur'; err.classList.remove('hidden'); }
}
function hwExportGrades() {
  const g = App.cache.hwGrading;
  const rows = g.students.map(s => { const sub = g.bySid[s.id]; return { 'Élève': `${s.first_name} ${s.last_name}`, 'Niveau': s.level, 'Statut': sub ? (sub.status==='submitted'?'Rendu':'Corrigé') : 'Non rendu', 'Retard': sub?.is_late ? 'Oui' : '', 'Rendu le': sub?.submitted_at ? fmtDT(sub.submitted_at) : '', [`Note /${g.hw.max_points}`]: sub?.score ?? '', 'Commentaire': sub?.feedback || '' }; });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Notes');
  XLSX.writeFile(wb, `devoir-${g.hw.level}-${g.hw.title.replace(/[^\w\u0600-\u06FF]+/g, '_').slice(0, 40)}.xlsx`);
}

/* ---------------- ÉLÈVE / PARENT ---------------- */
function renderHwFamily(el, items) {
  const kids = (App.cache.students || []);
  const order = { late: 0, todo: 1, submitted: 2, graded: 3, closed: 4 };
  // une carte par (devoir, enfant)
  const cards = [];
  for (const h of items) {
    const subs = h.my_submissions || [];
    const ids = linkedIds();
    for (const sid of ids) {
      const sub = subs.find(s => s.student_id === sid);
      // niveau de l'enfant : via la soumission (students.level) ou cache
      const kid = sub?.students || (App.cache.kidsById || {})[sid];
      if (kid && kid.level !== h.level) continue;
      cards.push({ h, sid, sub, kid, st: hwStatusOf(h, sub) });
    }
  }
  cards.sort((a, b) => order[a.st] - order[b.st] || new Date(a.h.due_at) - new Date(b.h.due_at));
  const todo = cards.filter(c => c.st === 'todo' || c.st === 'late').length;
  el.innerHTML = pageHeader('Devoirs <span class="text-gray-400 text-base font-normal">· الواجبات المنزلية</span>', 'fa-book-open') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center text-sm">
    <span class="${todo ? 'text-amber-700 font-bold' : 'text-green-700'}"><i class="fas ${todo ? 'fa-pen' : 'fa-check-circle'} mr-1"></i>${todo ? todo + ' devoir(s) à rendre' : 'Tous les devoirs sont rendus 🎉'}</span>
    <span class="text-gray-400 ml-auto">${Object.entries(HW_STATUS).filter(([k]) => k !== 'closed').map(([k,v]) => `<span class="inline-block w-2.5 h-2.5 rounded-full ${v.cls.split(' ')[0]} mr-1"></span>${v.label}`).join(' &nbsp; ')}</span>
  </div>
  <div class="grid md:grid-cols-2 gap-4">
    ${cards.map(({ h, sid, sub, kid, st }) => `<article class="bg-white rounded-xl shadow p-5 border-l-4 ${st==='late'?'border-red-400':st==='todo'?'border-amber-400':st==='submitted'?'border-blue-400':st==='graded'?'border-green-500':'border-gray-300'}">
      <div class="flex items-start justify-between gap-2 mb-1">
        <div class="min-w-0"><h3 class="font-bold text-gray-800">${esc(h.title)}</h3>
          <p class="text-xs text-gray-500">${h.subjects?.name ? esc(h.subjects.name) + ' · ' : ''}<span class="badge badge-blue">${esc(h.level)}</span>${h.teachers ? ' · ' + esc(h.teachers.first_name + ' ' + h.teachers.last_name) : ''}${kid && linkedIds().length > 1 ? ` · <b>${esc(kid.first_name||'')}</b>` : ''}</p></div>
        ${hwBadge(st)}
      </div>
      <p class="text-xs text-gray-500 mb-2"><i class="fas fa-calendar-day mr-1"></i>À rendre le <b>${fmtDue(h.due_at)}</b> — ${hwCountdown(h.due_at)}</p>
      ${h.instructions ? `<p class="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 mb-2">${esc(h.instructions)}</p>` : ''}
      ${h.attachment_url ? `<a href="${esc(h.attachment_url)}" target="_blank" class="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mb-2"><i class="fas fa-paperclip"></i>${esc(h.attachment_name||'Document du devoir')}</a>` : ''}
      ${sub ? `<div class="mt-2 border-t pt-2 text-sm">
          <p class="text-xs text-gray-500"><i class="fas fa-paper-plane mr-1"></i>Rendu le ${fmtDT(sub.submitted_at)}${sub.is_late ? ' <span class="text-red-600">(en retard)</span>' : ''}</p>
          ${sub.content ? `<p class="text-gray-700 mt-1 whitespace-pre-wrap">${esc(sub.content).slice(0, 300)}</p>` : ''}${fileLinks(sub.files)}
          ${sub.status !== 'submitted' ? `<div class="mt-2 bg-green-50 border border-green-200 rounded p-3"><div class="flex items-center justify-between"><b class="text-green-800"><i class="fas fa-star mr-1"></i>Note : ${sub.score ?? '—'} / ${h.max_points}</b>${h.count_in_term ? '<span class="badge badge-purple">compte T' + h.trimester + '</span>' : ''}</div>${sub.feedback ? `<p class="text-sm text-gray-700 mt-1 whitespace-pre-wrap">${esc(sub.feedback)}</p>` : ''}${sub.corrected_file_url ? `<a href="${esc(sub.corrected_file_url)}" target="_blank" class="text-xs text-blue-700 mt-1 inline-block"><i class="fas fa-file-circle-check mr-1"></i>Voir la correction</a>` : ''}</div>` : ''}
        </div>` : ''}
      <div class="mt-3 flex gap-2">
        ${h.status === 'published' && (!sub || sub.status === 'submitted') && (h.allow_late || !h.overdue) ? `<button onclick="showHwSubmit(${h.id}, ${sid})" class="${btnPrimary} text-sm flex-1"><i class="fas ${sub ? 'fa-rotate' : 'fa-upload'} mr-1"></i> ${sub ? 'Modifier mon dépôt' : 'Déposer mon travail · تسليم'}</button>` : (!sub && h.overdue && !h.allow_late ? '<p class="text-xs text-red-600"><i class="fas fa-lock mr-1"></i>Délai dépassé — dépôt fermé</p>' : '')}
        <button onclick="printHw(${h.id})" class="${btnSecondary} text-sm" title="Imprimer"><i class="fas fa-print"></i></button>
      </div>
    </article>`).join('') || '<p class="text-gray-400 col-span-full text-center py-12"><i class="fas fa-book-open text-4xl block mb-2"></i>Aucun devoir pour le moment.</p>'}
  </div>`;
}

function showHwSubmit(hwId, sid) {
  const h = App.cache.hwItems.find(x => x.id === hwId); const sub = (h.my_submissions||[]).find(s => s.student_id === sid);
  App.cache.hwFiles = [...(sub?.files || [])];
  openModal(`<i class="fas fa-upload text-blue-600 mr-2"></i>Déposer mon travail · تسليم الواجب`, `
    <p class="text-sm text-gray-600 mb-3"><b>${esc(h.title)}</b> — à rendre le ${fmtDue(h.due_at)}${h.overdue ? ' <span class="text-red-600 font-bold">(dépôt en retard)</span>' : ''}</p>
    <label class="${lblCls}">Réponse / remarques (texte)</label>
    <textarea id="hs-content" rows="5" class="${inputCls} mb-3" placeholder="Écrivez votre réponse ici, ou joignez une photo de votre cahier…">${esc(sub?.content||'')}</textarea>
    <label class="${lblCls}">Fichiers (photo du cahier, PDF… — max 5, 10 Mo chacun)</label>
    <div id="hs-drop" class="border-2 border-dashed border-blue-300 rounded-xl p-5 text-center text-sm text-gray-500 bg-blue-50/40 cursor-pointer" onclick="document.getElementById('hs-file').click()" ondragover="event.preventDefault(); this.classList.add('bg-blue-100')" ondragleave="this.classList.remove('bg-blue-100')" ondrop="event.preventDefault(); this.classList.remove('bg-blue-100'); hwAddFiles(event.dataTransfer.files)">
      <i class="fas fa-cloud-arrow-up text-2xl text-blue-500 block mb-1"></i>Glissez vos fichiers ici ou <u>cliquez</u><br><span class="text-xs">Sur téléphone : <b>Prendre une photo</b> fonctionne directement</span>
      <input type="file" id="hs-file" class="hidden" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,image/*" onchange="hwAddFiles(this.files)">
    </div>
    <div id="hs-files" class="mt-2"></div>
    <div id="hs-error" class="text-red-600 text-sm mt-2 hidden"></div>
    <button onclick="doHwSubmit(${hwId}, ${sid})" id="hs-send" class="${btnPrimary} w-full mt-4"><i class="fas fa-paper-plane mr-1"></i> Envoyer mon devoir</button>`);
  renderHwFiles();
}
function renderHwFiles() { const el = document.getElementById('hs-files'); if (!el) return; el.innerHTML = (App.cache.hwFiles||[]).map((f, i) => `<span class="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1 mr-1 mb-1"><i class="fas ${hwFileIcon(f.type)}"></i>${esc(f.name)} ${f.size ? '(' + Math.round(f.size/1024) + ' Ko)' : ''}<button onclick="App.cache.hwFiles.splice(${i},1); renderHwFiles()" class="text-red-500 ml-1"><i class="fas fa-times"></i></button></span>`).join('') || '<span class="text-xs text-gray-400">Aucun fichier</span>'; }
async function hwAddFiles(list) {
  const err = document.getElementById('hs-error'); err.classList.add('hidden');
  for (const f of Array.from(list)) {
    if ((App.cache.hwFiles||[]).length >= 5) { err.textContent = 'Maximum 5 fichiers'; err.classList.remove('hidden'); break; }
    if (f.size > 10 * 1024 * 1024) { err.textContent = `${f.name} dépasse 10 Mo`; err.classList.remove('hidden'); continue; }
    const el = document.getElementById('hs-files'); el.insertAdjacentHTML('beforeend', `<span class="text-xs text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Envoi de ${esc(f.name)}…</span>`);
    try { App.cache.hwFiles.push(await hwUploadFile(f, 'homeworks')); } catch (e) { err.textContent = e.response?.data?.error || `Échec envoi ${f.name}`; err.classList.remove('hidden'); }
    renderHwFiles();
  }
}
async function doHwSubmit(hwId, sid) {
  const err = document.getElementById('hs-error'); err.classList.add('hidden'); const btn = document.getElementById('hs-send'); btn.disabled = true;
  try { await api.post(`/homeworks/${hwId}/submit`, { student_id: sid, content: formVal('hs-content'), files: App.cache.hwFiles }); closeModal(); toast('Devoir envoyé ✅ — votre enseignant est prévenu'); refreshHwBadge(); render(); }
  catch (e) { err.textContent = e.response?.data?.error || 'Erreur'; err.classList.remove('hidden'); btn.disabled = false; }
}

/* ---------------- Impression fiche devoir ---------------- */
function printHw(id) {
  const h = App.cache.hwItems.find(x => x.id === id); if (!h) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Devoir — ${esc(h.title)}</title>
  <style>@page{size:A4;margin:18mm}body{font-family:Arial,sans-serif;color:#111;position:relative}header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1e3a8a;padding-bottom:10px;margin-bottom:18px}header img{width:64px;height:64px}h1{margin:0;color:#1e3a8a;font-size:20px}.sub{color:#555;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:13px;margin:14px 0;background:#f3f6fb;padding:12px;border-radius:8px}.box{border:1px solid #cbd5e1;border-radius:8px;padding:14px;min-height:120px;white-space:pre-wrap;font-size:14px;line-height:1.5}.answer{margin-top:18px;border:1px dashed #94a3b8;border-radius:8px;height:260px}.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;opacity:.06;z-index:-1}.wm img{width:60%}footer{position:fixed;bottom:8mm;left:0;right:0;text-align:center;font-size:10px;color:#777}</style></head><body>
  <div class="wm"><img src="${location.origin}/static/logo-rahma.png"></div>
  <header><img src="${location.origin}/static/logo-rahma.png"><div><h1>Rahma Academy — Devoir à rendre · واجب منزلي</h1><div class="sub">${h.subjects?.name ? esc(h.subjects.name) + ' · ' : ''}Niveau ${esc(h.level)}${h.teachers ? ' · ' + esc(h.teachers.first_name + ' ' + h.teachers.last_name) : ''}</div></div></header>
  <h2 style="margin:0 0 6px;font-size:18px">${esc(h.title)}</h2>
  <div class="meta"><div><b>À rendre le :</b> ${fmtDue(h.due_at)}</div><div><b>Barème :</b> /${h.max_points}${h.count_in_term ? ' (compte pour le trimestre ' + h.trimester + ')' : ''}</div><div><b>Dépôt tardif :</b> ${h.allow_late ? 'autorisé (marqué en retard)' : 'non autorisé'}</div><div><b>Élève :</b> ______________________</div></div>
  <div class="box">${esc(h.instructions || 'Voir les consignes en classe.')}</div>
  <div class="answer"></div>
  <footer>Rahma Academy · 10 Av Imam Malik, Messadine 4013 · +216 52 517 581 · Déposez votre travail dans l'application, rubrique « Devoirs »</footer>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

/* ---------------- Badge menu ---------------- */
async function refreshHwBadge() {
  if (!App.user) return;
  try { const n = Number((await api.get('/homeworks/badge')).data.count || 0); const el = document.getElementById('hw-badge'); if (el) { el.textContent = n > 99 ? '99+' : n; el.classList.toggle('hidden', n === 0); } } catch {}
}
