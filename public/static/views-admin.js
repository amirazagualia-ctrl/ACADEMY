/* ============================================================
   Rahma Academy - Vues : Inscriptions, Enseignants, Classes, Matières,
   Notifications, Portail Parent, Paramètres + Gestion utilisateurs
   ============================================================ */

// ================= INSCRIPTIONS (admin) =================
VIEWS.registrations = async function(el) {
  const regs = await db.list('registrations', 'select=*&order=created_at.desc');
  const pending = regs.filter(r => r.status === 'pending');
  el.innerHTML = pageHeader("Demandes d'inscription", 'fa-file-signature') + `
  <div class="flex justify-end mb-4">
    <button onclick="showInscriptionQR()" class="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold text-sm hover:bg-blue-800"><i class="fas fa-qrcode mr-1"></i> QR Code inscription rapide</button>
  </div>
  <section class="grid grid-cols-3 gap-4 mb-4">
    ${statCard('fa-hourglass-half','blue','En attente', pending.length)}
    ${statCard('fa-circle-check','green','Approuvées', regs.filter(r=>r.status==='approved').length)}
    ${statCard('fa-circle-xmark','red','Rejetées', regs.filter(r=>r.status==='rejected').length)}
  </section>
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Élève</th><th>Niveau demandé</th><th>Parent</th><th>Contact</th><th>Date</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${regs.map(r => `<tr>
          <td class="font-semibold">${esc(r.first_name)} ${esc(r.last_name)}<div class="text-xs text-gray-400">${fmtDate(r.birth_date)} • ${r.gender==='M'?'Garçon':'Fille'}</div></td>
          <td><span class="badge badge-blue">${esc(LEVEL_LABELS[r.level]||r.level||'-')}</span></td>
          <td>${esc(r.parent_name||'-')}</td>
          <td class="text-xs">${esc(r.parent_phone||'')}<br>${esc(r.parent_email||'')}</td>
          <td class="text-xs">${fmtDate(r.created_at)}</td>
          <td><span class="badge ${ {pending:'badge-blue',approved:'badge-green',rejected:'badge-red'}[r.status] }">${ {pending:'En attente',approved:'Approuvée',rejected:'Rejetée'}[r.status] }</span></td>
          <td class="text-right whitespace-nowrap">
            ${r.status === 'pending' ? `
            <button onclick="approveRegistration(${r.id})" class="text-green-600 px-1" title="Approuver (crée l'élève)"><i class="fas fa-circle-check"></i></button>
            <button onclick="rejectRegistration(${r.id})" class="text-orange-600 px-1" title="Rejeter"><i class="fas fa-circle-xmark"></i></button>` : ''}
            <button onclick="deleteRegistration(${r.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune demande</td></tr>'}
      </tbody>
    </table>
  </div>`;
};

async function approveRegistration(id) {
  try {
    const r = (await api.post(`/registrations/${id}/approve`)).data;
    toast('Inscription approuvée — élève créé !');
    if (r.code) {
      openModal('<i class="fas fa-key text-amber-500 mr-2"></i>Code élève généré', `
        <p class="text-sm text-gray-600 mb-3">L'élève <b>${esc(r.student.first_name)} ${esc(r.student.last_name)}</b> a été créé (ID ${r.student.id}). Communiquez ce code au tuteur pour qu'il lie son compte parent :</p>
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center mb-3">
          <code class="text-2xl font-bold font-mono text-amber-800">${esc(r.code)}</code>
        </div>
        <p class="text-xs text-gray-400 mb-4"><i class="fas fa-paper-plane mr-1"></i>Le code a aussi été envoyé automatiquement au tuteur (Telegram/email si disponibles).</p>
        <div class="flex gap-3 justify-end">
          <button onclick="navigator.clipboard.writeText('${esc(r.code)}').then(()=>toast('Code copié 📋'))" class="${btnSecondary}"><i class="fas fa-copy mr-1"></i> Copier</button>
          <button onclick="closeModal()" class="${btnPrimary}">Fermer</button>
        </div>`);
    }
    render();
  } catch (e) { toast('Erreur', 'error'); }
}
async function rejectRegistration(id) {
  try { await db.update('registrations', id, { status: 'rejected' }); toast('Demande rejetée', 'info'); render(); }
  catch (e) { toast('Erreur', 'error'); }
}
function deleteRegistration(id) {
  confirmDelete('Supprimer cette demande ?', async () => { await db.remove('registrations', id); toast('Supprimée'); render(); });
}

// ================= ENSEIGNANTS =================
VIEWS.teachers = async function(el) {
  const teachers = await db.list('teachers', 'select=*&order=last_name.asc');
  // Compteur d'élèves affectés par enseignant (table absente => vide, sans erreur)
  let counts = {};
  try {
    const assigns = await db.list('teacher_students', 'select=teacher_id');
    for (const a of assigns) counts[a.teacher_id] = (counts[a.teacher_id] || 0) + 1;
  } catch (e) {}
  const isAdmin = App.user.role === 'admin';
  el.innerHTML = pageHeader('Enseignants', 'fa-chalkboard-user', `<button onclick="showTeacherForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel enseignant</button>`) + `
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Nom</th><th>Matière</th><th>Cycles</th><th>Élèves affectés</th><th>Contact</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${teachers.map(t => `<tr>
          <td class="font-semibold">${esc(t.first_name)} ${esc(t.last_name)}</td>
          <td><span class="badge badge-purple">${esc(t.subject||'-')}</span></td>
          <td>${esc(t.cycles||'-')}</td>
          <td>${isAdmin ? `<button onclick="showAssignStudents(${t.id})" class="badge ${counts[t.id]?'badge-blue':'badge-gray'} cursor-pointer hover:opacity-75" title="Affecter des élèves"><i class="fas fa-user-graduate mr-1"></i>${counts[t.id]||0} élève(s)</button>` : `<span class="badge badge-gray">${counts[t.id]||0}</span>`}</td>
          <td class="text-xs">${esc(t.phone||'')}<br>${esc(t.email||'')}</td>
          <td><span class="badge ${t.status==='actif'?'badge-green':'badge-gray'}">${esc(t.status)}</span></td>
          <td class="text-right whitespace-nowrap">
            ${isAdmin ? `<button onclick="showAssignStudents(${t.id})" class="text-blue-600 px-1" title="Affecter des élèves"><i class="fas fa-user-plus"></i></button>` : ''}
            <button onclick="showTeacherForm(${t.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteTeacher(${t.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun enseignant</td></tr>'}
      </tbody>
    </table>
  </div>`;
};

// ---- Affectation des élèves à un enseignant (admin) ----
async function showAssignStudents(teacherId) {
  let students = [], assigned = new Set(), teacher = {};
  try {
    const [sts, t] = await Promise.all([
      db.list('students', 'select=id,first_name,last_name,level,class_name&status=eq.actif&order=last_name.asc'),
      db.list('teachers', `select=*&id=eq.${teacherId}`)
    ]);
    students = sts; teacher = t[0] || {};
    const cur = (await api.get(`/teachers/${teacherId}/students`)).data;
    for (const a of cur) assigned.add(a.student_id);
  } catch (e) {
    toast(e.response?.data?.error || 'Erreur de chargement (migration 0003 appliquée ?)', 'error');
    return;
  }
  openModal(`<i class="fas fa-user-plus text-blue-600 mr-2"></i>Élèves de ${esc(teacher.first_name||'')} ${esc(teacher.last_name||'')} <span class="badge badge-purple ml-2">${esc(teacher.subject||'')}</span>`, `
    <input id="as-search" class="${inputCls} mb-3" placeholder="🔍 Rechercher un élève..." oninput="filterAssignList(this.value)">
    <div id="as-list" class="max-h-80 overflow-y-auto border border-gray-200 rounded-lg divide-y">
      ${students.map(s => `
        <label class="as-row flex items-center gap-3 px-3 py-2 hover:bg-blue-50 cursor-pointer" data-name="${esc((s.first_name+' '+s.last_name+' '+(s.level||'')).toLowerCase())}">
          <input type="checkbox" class="as-check w-4 h-4" value="${s.id}" ${assigned.has(s.id)?'checked':''}>
          <span class="flex-1 font-medium text-sm">${esc(s.first_name)} ${esc(s.last_name)}</span>
          <span class="text-xs text-gray-400">${esc(s.level||'')}${s.class_name?' • '+esc(s.class_name):''}</span>
        </label>`).join('') || '<p class="text-center text-gray-400 py-6">Aucun élève actif</p>'}
    </div>
    <p class="text-xs text-gray-500 mt-2"><i class="fas fa-info-circle mr-1"></i>Un élève peut être affecté à plusieurs enseignants. L'enseignant ne verra que les élèves cochés ici.</p>
    <div class="flex justify-end gap-3 mt-4">
      <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
      <button type="button" onclick="saveAssignStudents(${teacherId})" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer les affectations</button>
    </div>`, { wide: true });
}
function filterAssignList(q) {
  q = (q || '').toLowerCase().trim();
  document.querySelectorAll('#as-list .as-row').forEach(r => { r.style.display = !q || r.dataset.name.includes(q) ? '' : 'none'; });
}
async function saveAssignStudents(teacherId) {
  const ids = Array.from(document.querySelectorAll('#as-list .as-check:checked')).map(c => Number(c.value));
  try {
    await api.put(`/teachers/${teacherId}/students`, { student_ids: ids });
    closeModal(); toast(`${ids.length} élève(s) affecté(s)`); render();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

async function showTeacherForm(id) {
  let t = {};
  if (id) t = (await db.list('teachers', `select=*&id=eq.${id}`))[0] || {};
  let allSubjects = []; try { allSubjects = await db.list('subjects', 'select=id,name,cycle&order=name.asc'); } catch (e) {}
  const selIds = (t.subject_ids || []).map(Number); const preset = selIds.length ? selIds : allSubjects.filter(s => (s.name || '').trim().toLowerCase() === String(t.subject || '').trim().toLowerCase()).map(s => s.id);
  const subjectPicker = allSubjects.length ? `<div class="col-span-2"><label class="${lblCls}">Matières affectées (notes & carnets limités à ces matières) *</label><div class="flex flex-wrap gap-1.5 p-2 border rounded-lg bg-gray-50 max-h-36 overflow-y-auto">${allSubjects.map(s => `<label class="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-white cursor-pointer has-[:checked]:bg-blue-600 has-[:checked]:text-white has-[:checked]:border-blue-600"><input type="checkbox" class="te-subj hidden" value="${s.id}" data-name="${esc(s.name)}" ${preset.includes(s.id) ? 'checked' : ''} onchange="teSyncSubjectLabel()">${esc(s.name)} <span class="opacity-60">· ${CYCLE_LABELS[s.cycle] || s.cycle || ''}</span></label>`).join('')}</div></div>` : '';
  openModal(`<i class="fas fa-chalkboard-user text-blue-600 mr-2"></i>${id?'Modifier':'Nouvel'} enseignant`, `
    <form onsubmit="saveTeacher(event, ${id||'null'})">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Prénom *</label><input id="te-fn" required value="${esc(t.first_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Nom *</label><input id="te-ln" required value="${esc(t.last_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Email</label><input id="te-email" type="email" value="${esc(t.email||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Téléphone</label><input id="te-phone" value="${esc(t.phone||'')}" class="${inputCls}"></div>
        ${subjectPicker}
        <div><label class="${lblCls}">Libellé matière (affiché) *</label><input id="te-subject" required value="${esc(t.subject||'')}" class="${inputCls}" placeholder="ex : Français"></div>
        <div><label class="${lblCls}">Cycles</label>
        <select id="te-cycles" class="${inputCls}">
          ${['primaire','base','secondaire','primaire,base','base,secondaire','primaire,base,secondaire'].map(c=>`<option value="${c}" ${t.cycles===c?'selected':''}>${c}</option>`).join('')}
        </select></div>
        <div><label class="${lblCls}">Statut</label><select id="te-status" class="${inputCls}"><option value="actif" ${t.status==='actif'?'selected':''}>Actif</option><option value="inactif" ${t.status==='inactif'?'selected':''}>Inactif</option></select></div>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

function teSyncSubjectLabel() { const names = [...document.querySelectorAll('.te-subj:checked')].map(x => x.dataset.name); const inp = document.getElementById('te-subject'); if (inp && names.length) inp.value = names.join(', '); }
async function saveTeacher(e, id) {
  e.preventDefault();
  const subject = (formVal('te-subject') || '').trim();
  if (!subject) { toast('La matière enseignée est obligatoire', 'error'); return; }
  const subject_ids = [...document.querySelectorAll('.te-subj:checked')].map(x => Number(x.value));
  if (document.querySelector('.te-subj') && !subject_ids.length) { toast('Cochez au moins une matière affectée', 'error'); return; }
  const data = { first_name: formVal('te-fn'), last_name: formVal('te-ln'), email: formVal('te-email')||null, phone: formVal('te-phone')||null, subject, cycles: formVal('te-cycles'), status: formVal('te-status') };
  if (document.querySelector('.te-subj')) data.subject_ids = subject_ids;
  try {
    if (id) await db.update('teachers', id, data); else await db.create('teachers', data);
    closeModal(); toast('Enseignant enregistré'); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
function deleteTeacher(id) {
  confirmTrash('cet enseignant', async () => { await removeWithUndo('teachers', id, "L'enseignant"); render(); }, 'Son compte utilisateur reste intact.');
}

// ================= CLASSES =================
VIEWS.classes = async function(el) {
  const [classes, teachers] = await Promise.all([
    db.list('classes', 'select=*,teachers(first_name,last_name)&order=level.asc'),
    db.list('students', 'select=class_name')
  ]);
  const counts = {};
  teachers.forEach(s => { if (s.class_name) counts[s.class_name] = (counts[s.class_name]||0)+1; });

  el.innerHTML = pageHeader('Classes', 'fa-school', isAdmin() ? `<button onclick="showClassForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvelle classe</button>` : '') + `
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${classes.map(cl => `
    <article class="bg-white rounded-xl shadow p-5">
      <div class="flex items-start justify-between">
        <div class="w-12 h-12 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">${esc(cl.name.slice(0,3))}</div>
        ${isAdmin() ? `<div>
          <button onclick="showClassForm(${cl.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
          <button onclick="deleteClass(${cl.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
      <h3 class="font-bold text-gray-800 mt-3">${esc(cl.name)}</h3>
      <p class="text-xs text-gray-500">${esc(LEVEL_LABELS[cl.level]||cl.level)}</p>
      <div class="text-sm mt-2 space-y-1">
        <div><i class="fas fa-user-tie text-gray-400 w-5"></i>${cl.teachers ? esc(`${cl.teachers.first_name} ${cl.teachers.last_name}`) : 'Non assigné'}</div>
        <div><i class="fas fa-door-open text-gray-400 w-5"></i>${esc(cl.room||'-')}</div>
        <div><i class="fas fa-users text-gray-400 w-5"></i>${counts[cl.name]||0} / ${cl.capacity} élèves</div>
      </div>
    </article>`).join('') || '<p class="text-gray-400 col-span-3 text-center py-10">Aucune classe</p>'}
  </div>`;
};

async function showClassForm(id) {
  const teachers = await db.list('teachers', 'select=id,first_name,last_name&order=last_name.asc');
  let cl = {};
  if (id) cl = (await db.list('classes', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-school text-blue-600 mr-2"></i>${id?'Modifier':'Nouvelle'} classe`, `
    <form onsubmit="saveClass(event, ${id||'null'})">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Nom *</label><input id="cl-name" required value="${esc(cl.name||'')}" class="${inputCls}" placeholder="ex: 1AP-A"></div>
        <div><label class="${lblCls}">Niveau *</label><select id="cl-level" class="${inputCls}">${levelOptions(cl.level)}</select></div>
        <div><label class="${lblCls}">Enseignant principal</label>
        <select id="cl-teacher" class="${inputCls}"><option value="">-</option>${teachers.map(t=>`<option value="${t.id}" ${t.id==cl.teacher_id?'selected':''}>${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}</select></div>
        <div><label class="${lblCls}">Salle</label><input id="cl-room" value="${esc(cl.room||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Capacité</label><input id="cl-capacity" type="number" value="${cl.capacity||30}" class="${inputCls}"></div>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveClass(e, id) {
  e.preventDefault();
  const data = { name: formVal('cl-name'), level: formVal('cl-level'), teacher_id: formVal('cl-teacher') ? Number(formVal('cl-teacher')) : null, room: formVal('cl-room')||null, capacity: Number(formVal('cl-capacity'))||30 };
  try {
    if (id) await db.update('classes', id, data); else await db.create('classes', data);
    closeModal(); toast('Classe enregistrée'); render();
  } catch (err) { toast('Erreur', 'error'); }
}
function deleteClass(id) {
  confirmTrash('cette classe', async () => { await removeWithUndo('classes', id, 'La classe'); render(); });
}

// ================= MATIÈRES =================
VIEWS.subjects = async function(el) {
  const subjects = await db.list('subjects', 'select=*&order=cycle.asc,name.asc');
  el.innerHTML = pageHeader('Matières', 'fa-book', `<button onclick="showSubjectForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvelle matière</button>`) + `
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Matière</th><th>Cycle</th><th>Coefficient</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${subjects.map(s => `<tr>
          <td class="font-semibold">${esc(s.name)}</td>
          <td><span class="badge badge-blue">${CYCLE_LABELS[s.cycle]||s.cycle}</span></td>
          <td>${s.coefficient}</td>
          <td class="text-right">
            <button onclick="showSubjectForm(${s.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteSubject(${s.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') || '<tr><td colspan="4" class="text-center py-8 text-gray-400">Aucune matière</td></tr>'}
      </tbody>
    </table>
  </div>`;
};

async function showSubjectForm(id) {
  let s = {};
  if (id) s = (await db.list('subjects', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-book text-blue-600 mr-2"></i>${id?'Modifier':'Nouvelle'} matière`, `
    <form onsubmit="saveSubject(event, ${id||'null'})">
      <label class="${lblCls}">Nom *</label><input id="su2-name" required value="${esc(s.name||'')}" class="${inputCls} mb-3">
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="${lblCls}">Cycle</label>
        <select id="su2-cycle" class="${inputCls}">
          ${['primaire','base','secondaire'].map(c=>`<option value="${c}" ${s.cycle===c?'selected':''}>${CYCLE_LABELS[c]}</option>`).join('')}
        </select></div>
        <div><label class="${lblCls}">Coefficient</label><input id="su2-coef" type="number" step="0.5" value="${s.coefficient||1}" class="${inputCls}"></div>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveSubject(e, id) {
  e.preventDefault();
  const data = { name: formVal('su2-name'), cycle: formVal('su2-cycle'), coefficient: Number(formVal('su2-coef'))||1 };
  try {
    if (id) await db.update('subjects', id, data); else await db.create('subjects', data);
    closeModal(); toast('Matière enregistrée'); render();
  } catch (err) { toast('Erreur', 'error'); }
}
function deleteSubject(id) {
  confirmDelete('Supprimer cette matière ? Les notes associées seront supprimées.', async () => { await db.remove('subjects', id); toast('Supprimée'); render(); });
}

// ================= NOTIFICATIONS =================
VIEWS.notifications = async function(el) {
  const type = App.cache.notifType || '';
  const onlyUnread = !!App.cache.notifUnreadOnly;
  const feed = (await api.get(`/notifications/feed?limit=150${type ? '&type='+type : ''}`)).data;
  let notifs = feed.items || [];
  if (onlyUnread) notifs = notifs.filter(n => !n.read);
  const TYPES = { cours:'Cours', evenement:'Événement', examen:'Examen', absence:'Absence', retard:'Retard', frais:'Frais', note:'Note', engagement:'Engagement', info:'Info' };
  const TYPES_AR = { cours:'درس', evenement:'حدث', examen:'امتحان', absence:'غياب', retard:'تأخر', frais:'معاليم', note:'عدد', engagement:'التزام', info:'إعلام' };
  const audLabel = a => Array.isArray(a) && a.length ? a.map(r => ({student:'Élèves',parent:'Parents',teacher:'Enseignants'}[r]||r)).join(' · ') : '';

  el.innerHTML = pageHeader('Notifications <span class="text-gray-400 text-base font-normal">· الإشعارات</span>', 'fa-bell',
    (feed.unread ? `<button onclick="markAllNotifsRead()" class="${btnSecondary}"><i class="fas fa-check-double mr-1"></i> Tout marquer lu (${feed.unread})</button>` : '') +
    (isStaff() ? `<button onclick="showNotifyForm()" class="${btnPrimary}"><i class="fas fa-paper-plane mr-1"></i> Envoyer une notification</button>` : '')) + `
  ${!feed.supported && isAdmin() ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 mb-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Les notifications ciblées (cours / événements / examens) nécessitent l'exécution de <code>migrations/0006_targeted_notifications.sql</code> dans Supabase SQL Editor.</div>` : ''}
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center flex-wrap">
    <select onchange="App.cache.notifType=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les types</option>
      ${Object.keys(TYPES).map(t=>`<option value="${t}" ${type===t?'selected':''}>${TYPES[t]} · ${TYPES_AR[t]}</option>`).join('')}
    </select>
    <label class="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" ${onlyUnread?'checked':''} onchange="App.cache.notifUnreadOnly=this.checked; render()" class="w-4 h-4"> Non lues uniquement</label>
    <span class="text-xs text-gray-400 ml-auto">${notifs.length} notification(s) · ${feed.unread} non lue(s)</span>
  </div>
  <div class="bg-white rounded-xl shadow divide-y">
    ${notifs.map(n => {
      const targeted = Array.isArray(n.audience);
      const clickable = !!n.link;
      return `
    <div class="p-4 flex gap-3 items-start ${n.read ? '' : 'bg-blue-50/60'} ${clickable ? 'cursor-pointer hover:bg-blue-50' : ''}" ${clickable ? `onclick="openNotif(${n.id}, '${esc(n.link)}')"` : ''}>
      <div class="relative"><i class="fas ${notifIcon(n.type)} text-xl mt-1"></i>${n.read ? '' : '<span class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"></span>'}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <b class="text-sm ${n.read ? 'text-gray-700' : 'text-gray-900'}">${esc(n.title||TYPES[n.type]||n.type)}</b>
          <span class="badge ${ {cours:'badge-blue',evenement:'badge-purple',examen:'badge-red'}[n.type] || 'badge-gray' }">${TYPES[n.type]||n.type}</span>
          ${n.level ? `<span class="badge badge-yellow">${esc(n.level)}</span>` : (targeted ? '<span class="badge badge-gray">Toute l’école</span>' : '')}
          ${isAdmin() && targeted ? `<span class="text-xs text-gray-400"><i class="fas fa-users mr-1"></i>${audLabel(n.audience)}</span>` : ''}
        </div>
        <p class="text-sm text-gray-600 mt-1">${esc(n.message)}</p>
        <p class="text-xs text-gray-400 mt-1">${n.students ? 'Élève : '+esc(`${n.students.first_name} ${n.students.last_name}`)+' • ' : ''}${fmtDT(n.created_at)}${clickable ? ' • <span class="text-blue-600"><i class="fas fa-arrow-up-right-from-square mr-1"></i>Ouvrir</span>' : ''}</p>
      </div>
      <div class="flex flex-col gap-1 items-end">
        ${!n.read && feed.supported ? `<button onclick="event.stopPropagation(); markNotifsRead([${n.id}])" class="text-gray-400 hover:text-green-600 text-sm" title="Marquer comme lu"><i class="fas fa-check"></i></button>` : ''}
        ${isAdmin() ? `<button onclick="event.stopPropagation(); deleteNotification(${n.id})" class="text-red-400 hover:text-red-600" title="Supprimer"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>`; }).join('') || '<p class="text-gray-400 text-center py-10"><i class="fas fa-bell-slash text-3xl mb-2 block"></i>Aucune notification</p>'}
  </div>`;
};

async function markNotifsRead(ids) {
  try { await api.post('/notifications/read', { ids }); } catch (e) {}
  refreshNotifBadge(); render();
}
async function markAllNotifsRead() {
  try { await api.post('/notifications/read', { all: true }); toast('Toutes les notifications sont marquées comme lues'); } catch (e) {}
  refreshNotifBadge(); render();
}
// Ouvrir l'objet concerné (cours, cours interactif, calendrier) et marquer comme lu
async function openNotif(id, link) {
  try { await api.post('/notifications/read', { ids: [id] }); } catch (e) {}
  const m = String(link || '').match(/^#ic-(\d+)$/);
  if (m) { App.cache.icOpenId = Number(m[1]); navigate('interactive'); return; }
  const route = String(link || '').replace(/^#/, '');
  if (ROUTES[route] && ROUTES[route].roles.includes(App.user.role)) navigate(route); else render();
}

function deleteNotification(id) {
  confirmDelete('Supprimer cette notification ?', async () => { await db.remove('notifications', id); toast('Supprimée'); render(); });
}

async function showNotifyForm() {
  const students = await db.list('students', 'select=id,first_name,last_name,level&order=last_name.asc');
  openModal('<i class="fas fa-paper-plane text-blue-600 mr-2"></i>Envoyer une notification au tuteur', `
    <form onsubmit="doNotify(event)">
      <label class="${lblCls}">Élève *</label>
      <select id="nt-student" class="${inputCls} mb-3">
        ${students.map(s=>`<option value="${s.id}">${esc(fullName(s))} (${s.level})</option>`).join('')}
      </select>
      <label class="${lblCls}">Type</label>
      <select id="nt-type" class="${inputCls} mb-3">
        <option value="info">Information</option>
        <option value="engagement">Engagement dans un cours</option>
        <option value="absence">Absence</option>
        <option value="frais">Frais / Paiement</option>
        <option value="note">Note</option>
      </select>
      <label class="${lblCls}">Titre</label><input id="nt-title" class="${inputCls} mb-3" placeholder="Titre de la notification">
      <label class="${lblCls}">Message *</label><textarea id="nt-message" rows="3" required class="${inputCls} mb-4"></textarea>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-paper-plane mr-1"></i> Envoyer</button>
      </div>
    </form>`);
}

async function doNotify(e) {
  e.preventDefault();
  try {
    await api.post('/notify', { student_id: Number(formVal('nt-student')), type: formVal('nt-type'), title: formVal('nt-title')||'Information', message: formVal('nt-message') });
    closeModal(); toast('Notification envoyée au tuteur'); render();
  } catch (err) { toast('Erreur', 'error'); }
}

// ================= PORTAIL PARENT =================
VIEWS.parent = async function(el) {
  const ids = linkedIds();
  if (!ids.length) {
    el.innerHTML = pageHeader('Portail Parent', 'fa-house-user') + `
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <i class="fas fa-link-slash text-4xl text-gray-300 mb-3"></i>
      <p class="text-gray-500">Aucun élève n'est lié à votre compte.</p>
      <p class="text-sm text-gray-400 mt-1">Contactez l'administration pour lier votre compte à vos enfants.</p>
      <button onclick="showParentProfile()" class="${btnPrimary} mt-4"><i class="fas fa-user-gear mr-1"></i> Mon profil</button>
    </div>`;
    return;
  }
  const monthStart = dayjs().format('YYYY-MM') + '-01';
  const [students, att, grades, fees, notifs] = await Promise.all([
    db.list('students', `select=*&id=in.(${ids.join(',')})`),
    db.list('attendance', `select=*&date=gte.${monthStart}&order=date.desc`),
    db.list('grades', `select=*,subjects(name)&order=created_at.desc&limit=20`),
    db.list('fees', 'select=*&order=due_date.asc'),
    db.list('notifications', 'select=*&order=created_at.desc&limit=10')
  ]);

  el.innerHTML = pageHeader('Portail Parent', 'fa-house-user', `<button onclick="showParentProfile()" class="${btnSecondary}"><i class="fas fa-user-gear mr-1"></i> Mon profil</button>`) + `
  <div class="space-y-6">
    ${students.map(s => {
      const sAtt = att.filter(a => a.student_id === s.id);
      const sGrades = grades.filter(g => g.student_id === s.id).slice(0, 5);
      const sFees = fees.filter(f => f.student_id === s.id && f.status !== 'paid');
      const counts = { present:0, absent:0, retard:0, excuse:0 };
      sAtt.forEach(a => counts[a.status] = (counts[a.status]||0)+1);
      return `
      <section class="bg-white rounded-xl shadow p-5">
        <div class="flex items-center gap-4 mb-4">
          ${s.photo_url ? `<img src="${esc(s.photo_url)}" class="w-16 h-16 rounded-full object-cover border-4 border-blue-100">` : `<div class="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold">${esc(s.first_name[0]||'')}</div>`}
          <div>
            <h3 class="text-xl font-bold">${esc(fullName(s))}</h3>
            <span class="badge badge-blue">${esc(LEVEL_LABELS[s.level]||s.level)}</span>
            <span class="badge badge-gray">${esc(s.class_name||'')}</span>
          </div>
          <button onclick="App.cache.gradeStudent='${s.id}'; navigate('grades')" class="${btnSecondary} ml-auto"><i class="fas fa-file-pdf text-red-500 mr-1"></i> Bulletin</button>
        </div>
        <div class="grid md:grid-cols-3 gap-4">
          <div class="border rounded-lg p-3">
            <h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-clipboard-check mr-1 text-green-600"></i>Présence ce mois</h4>
            <div class="flex gap-2 text-center text-xs">
              <div class="flex-1 bg-green-50 rounded p-2"><b class="text-green-700 text-lg">${counts.present}</b><br>Présent</div>
              <div class="flex-1 bg-red-50 rounded p-2"><b class="text-red-700 text-lg">${counts.absent}</b><br>Absent</div>
              <div class="flex-1 bg-yellow-50 rounded p-2"><b class="text-yellow-700 text-lg">${counts.retard}</b><br>Retard</div>
            </div>
          </div>
          <div class="border rounded-lg p-3">
            <h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-star mr-1 text-blue-600"></i>Dernières notes</h4>
            ${sGrades.length ? sGrades.map(g => `<div class="flex justify-between text-xs border-b py-1"><span>${esc(g.subjects?.name||'')} (T${g.trimester})</span><b class="${Number(g.score)>=Number(g.max_score)/2?'text-green-600':'text-red-600'}">${g.score}/${g.max_score}</b></div>`).join('') : '<p class="text-xs text-gray-400">Aucune note récente</p>'}
          </div>
          <div class="border rounded-lg p-3">
            <h4 class="text-xs font-bold text-gray-500 uppercase mb-2"><i class="fas fa-money-bill mr-1 text-orange-500"></i>Frais à payer</h4>
            ${sFees.length ? sFees.map(f => `<div class="flex justify-between text-xs border-b py-1"><span>${esc(f.label)}<br><span class="text-gray-400">Échéance : ${fmtDate(f.due_date)}</span></span><b class="${f.status==='overdue'?'text-red-600':'text-blue-600'}">${fmtMoney(f.amount)}</b></div>`).join('') : '<p class="text-xs text-green-600"><i class="fas fa-circle-check mr-1"></i>Tous les frais sont réglés</p>'}
          </div>
        </div>
      </section>`;
    }).join('')}
    <section class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-bell text-amber-500 mr-2"></i>Notifications récentes</h3>
      ${notifs.length ? notifs.map(n => `
        <div class="flex gap-3 items-start border-b py-2">
          <i class="fas ${notifIcon(n.type)} mt-1"></i>
          <div><b class="text-sm">${esc(n.title||n.type)}</b><p class="text-xs text-gray-500">${esc(n.message)}</p><p class="text-[10px] text-gray-400">${fmtDT(n.created_at)}</p></div>
        </div>`).join('') : '<p class="text-gray-400 text-sm">Aucune notification</p>'}
    </section>
  </div>`;
};

async function showParentProfile() {
  const ids = linkedIds();
  let myStudents = [];
  if (ids.length) {
    try { myStudents = await db.list('students', `select=id,first_name,last_name,level&id=in.(${ids.join(',')})`); } catch {}
  }
  openModal('<i class="fas fa-user-gear text-blue-600 mr-2"></i>Mon profil', `
    <form onsubmit="saveParentProfile(event)">
      <label class="${lblCls}">Nom</label><input id="pp-name" value="${esc(App.user.name)}" class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label><input id="pp-phone" value="${esc(App.user.phone||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Nouveau mot de passe (laisser vide pour ne pas changer)</label>
      <input id="pp-password" type="password" class="${inputCls} mb-3">
      <label class="${lblCls}">Élèves liés à mon compte</label>
      <div class="border rounded-lg p-3 mb-3">
        ${myStudents.length ? myStudents.map(s => `
          <div class="flex items-center gap-2 text-sm py-1">
            <i class="fas fa-user-graduate text-blue-500"></i>
            ${esc(s.first_name)} ${esc(s.last_name)} <span class="text-xs text-gray-400">(${LEVEL_LABELS[s.level]||s.level})</span>
            <span class="ml-auto badge badge-green text-xs"><i class="fas fa-link mr-1"></i>Lié</span>
          </div>`).join('') : '<p class="text-xs text-gray-400">Aucun élève lié pour l\u2019instant</p>'}
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <label class="${lblCls}"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Lier un élève avec son code (ex : RCF-12-ABCD)</label>
        <div class="flex gap-2">
          <input id="pp-code" class="${inputCls} flex-1 uppercase" placeholder="RCF-12-ABCD" autocomplete="off">
          <button type="button" onclick="linkStudentByCode()" class="${btnPrimary}"><i class="fas fa-link"></i></button>
        </div>
        <p class="text-xs text-gray-400 mt-1">Le code élève vous est communiqué par l'école. Pour retirer une liaison, contactez l'administration.</p>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function linkStudentByCode() {
  const code = (formVal('pp-code') || '').trim();
  if (!code) return toast('Saisissez le code élève', 'error');
  try {
    const r = (await api.post('/link-student', { code })).data;
    if (r.token) { App.token = r.token; localStorage.setItem('edu_token', r.token); }
    if (r.linked_student_ids) App.user.linked_student_ids = r.linked_student_ids;
    toast(`✅ ${r.student.first_name} ${r.student.last_name} lié(e) à votre compte !`);
    closeModal(); render();
  } catch (e) { toast(e.response?.data?.error || 'Code invalide', 'error'); }
}

async function saveParentProfile(e) {
  e.preventDefault();
  const data = { name: formVal('pp-name'), phone: formVal('pp-phone') };
  const pw = document.getElementById('pp-password').value;
  if (pw) data.password = pw;
  try {
    await api.patch('/profile', data);
    // Rafraîchir la session
    const me = (await api.get('/auth/me')).data.user;
    App.user = { ...App.user, ...me };
    closeModal(); toast('Profil mis à jour'); render();
  } catch (err) { toast('Erreur', 'error'); }
}

// ================= PARAMÈTRES (admin) =================
VIEWS.settings = async function(el) {
  const tab = App.cache.settingsTab || 'users';
  el.innerHTML = pageHeader('Paramètres', 'fa-gear') + `
  <div class="flex gap-2 mb-4">
    ${[['users','fa-users','Utilisateurs'],['school','fa-building-columns','Établissement'],['year','fa-calendar-check','Année scolaire'],['backup','fa-database','Sauvegardes'],['notifs','fa-bell','Notifications'],['audit','fa-clipboard-list','Journal d\'audit'],['trash','fa-trash-can','Corbeille'],['docs','fa-file-shield','Documents & filigrane'],['account','fa-user-shield','Mon compte']].map(([k,i,l]) => `
      <button onclick="App.cache.settingsTab='${k}'; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab===k?'bg-blue-600 text-white':'bg-white border text-gray-600'}"><i class="fas ${i} mr-1"></i> ${l}</button>`).join('')}
  </div>
  <div id="settings-content"></div>`;
  const content = document.getElementById('settings-content');
  if (tab === 'users') await renderUsersTab(content);
  else if (tab === 'school') await renderSchoolTab(content);
  else if (tab === 'account') await renderMyAccountTab(content);
  else if (tab === 'audit') await renderAuditTab(content);
  else if (tab === 'year') await renderYearTab(content);
  else if (tab === 'backup') await renderBackupTab(content);
  else if (tab === 'trash') await renderTrashTab(content);
  else if (tab === 'docs') await renderDocsTab(content);
  else await renderNotifsTab(content);
};

// ---- Année scolaire ----
async function renderYearTab(el) {
  const r = (await api.get('/school-years')).data;
  if (!r.supported) { el.innerHTML = `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>La gestion des années scolaires nécessite l'exécution de <code>migrations/0009_school_years.sql</code> dans Supabase SQL Editor.</div>`; return; }
  const cur = r.items.find(y => y.is_current);
  el.innerHTML = `
  <div class="grid lg:grid-cols-2 gap-4">
    <div class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-calendar-check text-blue-600 mr-2"></i>Années scolaires · السنوات الدراسية</h3>
      <table class="data-table w-full text-sm">
        <thead><tr><th>Année</th><th>Période</th><th>Statut</th><th></th></tr></thead>
        <tbody>${r.items.map(y => `<tr>
          <td class="font-bold">${esc(y.label)}</td>
          <td class="text-xs text-gray-500">${fmtDate(y.start_date)} → ${fmtDate(y.end_date)}</td>
          <td>${y.is_current ? '<span class="badge badge-green">En cours</span>' : '<span class="badge badge-gray"><i class="fas fa-lock mr-1"></i>Clôturée</span>'}</td>
          <td class="text-right">${y.is_current ? '' : `<button onclick="setSchoolYear('${y.label}')" class="text-blue-600 text-xs hover:underline mr-2"><i class="fas fa-eye mr-1"></i>Consulter</button><button onclick="reopenYear('${y.label}')" class="text-amber-600 text-xs hover:underline" title="Redéfinir comme année en cours (correction)"><i class="fas fa-rotate-left mr-1"></i>Rouvrir</button>`}</td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="text-xs text-gray-400 mt-3"><i class="fas fa-circle-info mr-1"></i>Les notes, présences, frais, événements et inscriptions sont rattachés à l'année en cours. Les années clôturées restent consultables en lecture seule via le sélecteur de la barre latérale.</p>
    </div>
    <div class="bg-white rounded-xl shadow p-5 border-2 border-amber-200">
      <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-forward-step text-amber-500 mr-2"></i>Assistant « Nouvelle année scolaire »</h3>
      <p class="text-xs text-gray-500 mb-3">Clôture <b>${esc(cur?.label||'')}</b>, ouvre <b>${cur ? cur.label.split('-').map(n=>+n+1).join('-') : ''}</b> et fait passer les élèves au niveau supérieur (1AP→2AP … 6AP→7AB … 4AS→sortants). Vous validez élève par élève : <b>promu</b>, <b>redoublant</b> ou <b>sortant</b>. Les élèves sortants deviennent inactifs (historique conservé).</p>
      <ul class="text-xs text-gray-600 space-y-1 mb-4">
        <li><i class="fas fa-check text-green-500 mr-1"></i>Les données de ${esc(cur?.label||'')} restent consultables (bulletins, paiements, présences).</li>
        <li><i class="fas fa-check text-green-500 mr-1"></i>Les mensualités de la nouvelle année seront générées automatiquement.</li>
        <li><i class="fas fa-triangle-exclamation text-amber-500 mr-1"></i>À faire <b>une seule fois</b>, en fin d'année (juillet-août), après la saisie de toutes les notes.</li>
      </ul>
      <div class="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 mb-3"><i class="fas fa-triangle-exclamation mr-1"></i><b>Attention :</b> cette opération modifie le niveau de <b>tous les élèves</b> et clôture l'année. Elle n'est <b>pas</b> destinée aux tests. Une annulation n'est possible que dans les 30 jours et tant qu'aucune donnée (notes, présences…) n'a été saisie dans la nouvelle année.</div>
      <button onclick="showRolloverWizard()" class="${btnPrimary} bg-amber-500 hover:bg-amber-600"><i class="fas fa-wand-magic-sparkles mr-1"></i> Lancer l'assistant</button>
      <div id="rollback-block" class="mt-4"></div>
    </div>
  </div>`;
  loadRollbackBlock();
}
async function loadRollbackBlock() {
  const el = document.getElementById('rollback-block'); if (!el) return;
  try {
    const i = (await api.get('/school-years/rollback/preview')).data;
    if (!i.previous || !i.closed_at) return;
    el.innerHTML = `<div class="border-t pt-3">
      <h4 class="font-bold text-sm text-gray-700 mb-1"><i class="fas fa-rotate-left text-red-500 mr-1"></i>Annuler le dernier passage (${esc(i.previous)} → ${esc(i.current)})</h4>
      <p class="text-xs text-gray-500 mb-2">Passage effectué le ${fmtDT(i.closed_at)} (il y a ${i.days} jour(s)) — ${i.students} élève(s) : ${i.outcomes.promu} promu(s), ${i.outcomes.redoublant} redoublant(s), ${i.outcomes.sortant} sortant(s).</p>
      ${i.possible ? `<button onclick="doRollback('${esc(i.previous)}')" class="${btnSecondary} text-sm text-red-700 border-red-300"><i class="fas fa-rotate-left mr-1"></i> Annuler et revenir à ${esc(i.previous)}</button>` : `<p class="text-xs text-amber-700"><i class="fas fa-lock mr-1"></i>${esc(i.reason || 'Annulation impossible')}</p>`}
    </div>`;
  } catch (e) { /* silencieux */ }
}
async function doRollback(prev) {
  const v = prompt(`Cette action restaure les niveaux/statuts des élèves, supprime les mensualités non payées de la nouvelle année et rétablit ${prev} comme année en cours.\n\nPour confirmer, saisissez : ${prev}`);
  if (v === null) return; if (v.trim() !== prev) return toast('Confirmation incorrecte', 'error');
  try { const r = (await api.post('/school-years/rollback', { confirm: prev })).data; await loadSchoolYears(); App.year = App.currentYear; toast(`Retour à ${r.current} — ${r.restored} élève(s) restauré(s)`); render(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

async function reopenYear(label) {
  if (!confirm(`Redéfinir ${label} comme année EN COURS ? L'année actuelle sera marquée clôturée. À n'utiliser qu'en cas d'erreur.`)) return;
  try { await api.post('/school-years/set-current', { label }); await loadSchoolYears(); toast('Année en cours : ' + label); render(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

async function showRolloverWizard() {
  let p;
  try { p = (await api.get('/school-years/rollover/preview')).data; } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); return; }
  App.cache.rollover = { decisions: Object.fromEntries(p.students.map(s => [s.id, s.outcome])), preview: p };
  const OUT = { promu: ['Promu', 'badge-green'], redoublant: ['Redoublant', 'badge-yellow'], sortant: ['Sortant', 'badge-gray'] };
  const row = s => `<tr id="ro-${s.id}">
    <td class="font-semibold text-sm">${esc(s.first_name)} ${esc(s.last_name)}</td>
    <td class="text-center"><span class="badge badge-blue">${esc(s.level)}</span></td>
    <td class="text-center text-xs ${s.average === null ? 'text-gray-300' : s.average < 10 ? 'text-red-600 font-bold' : 'text-green-700'}">${s.average === null ? '—' : s.average.toFixed(2)}</td>
    <td class="text-center">
      <select onchange="App.cache.rollover.decisions[${s.id}]=this.value; rolloverUpdateCounts()" class="border rounded px-2 py-1 text-xs">
        ${s.next_level ? `<option value="promu" ${s.outcome==='promu'?'selected':''}>Promu → ${s.next_level}</option>` : ''}
        <option value="redoublant" ${s.outcome==='redoublant'?'selected':''}>Redoublant (${s.level})</option>
        <option value="sortant" ${s.outcome==='sortant'?'selected':''}>Sortant (inactif)</option>
      </select>
    </td></tr>`;
  openModal(`<i class="fas fa-wand-magic-sparkles text-amber-500 mr-2"></i>Nouvelle année scolaire : ${esc(p.current)} → ${esc(p.next)}`, `
    <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 mb-3"><i class="fas fa-lightbulb mr-1"></i>Décision proposée automatiquement : <b>promu</b> (moyenne ≥ 10 ou sans notes), <b>redoublant</b> suggéré si moyenne &lt; 10, <b>sortant</b> en fin de 4AS. Ajustez chaque ligne si nécessaire.</div>
    <div class="flex gap-2 mb-2 text-xs" id="ro-counts"></div>
    <div class="max-h-80 overflow-y-auto border rounded-lg">
      <table class="data-table w-full"><thead class="sticky top-0 bg-white"><tr><th>Élève</th><th class="text-center">Niveau ${esc(p.current)}</th><th class="text-center">Moyenne</th><th class="text-center">Décision ${esc(p.next)}</th></tr></thead>
      <tbody>${p.students.map(row).join('') || '<tr><td colspan="4" class="text-center text-gray-400 py-6">Aucun élève actif</td></tr>'}</tbody></table>
    </div>
    <div class="grid grid-cols-2 gap-3 mt-4">
      <div><label class="${lblCls}">Début ${esc(p.next)}</label><input id="ro-start" type="date" value="${p.next.split('-')[0]}-09-01" class="${inputCls}"></div>
      <div><label class="${lblCls}">Fin ${esc(p.next)}</label><input id="ro-end" type="date" value="${p.next.split('-')[1]}-06-30" class="${inputCls}"></div>
    </div>
    <div class="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
      <label class="${lblCls} text-red-800"><i class="fas fa-triangle-exclamation mr-1"></i>Pour confirmer la clôture de <b>${esc(p.current)}</b>, saisissez son libellé exact :</label>
      <input id="ro-confirm" class="${inputCls}" placeholder="${esc(p.current)}" autocomplete="off">
    </div>
    <div id="ro-error" class="text-red-600 text-sm mt-2 hidden"></div>
    <button onclick="doRollover()" id="ro-btn" class="${btnPrimary} w-full mt-4 bg-amber-500 hover:bg-amber-600"><i class="fas fa-forward-step mr-1"></i> Clôturer ${esc(p.current)} et ouvrir ${esc(p.next)}</button>
  `, { wide: true });
  rolloverUpdateCounts();
}
function rolloverUpdateCounts() {
  const d = Object.values(App.cache.rollover?.decisions || {});
  const c = k => d.filter(x => x === k).length;
  const el = document.getElementById('ro-counts'); if (!el) return;
  el.innerHTML = `<span class="badge badge-green">${c('promu')} promu(s)</span><span class="badge badge-yellow">${c('redoublant')} redoublant(s)</span><span class="badge badge-gray">${c('sortant')} sortant(s)</span><span class="text-gray-400 ml-auto">${d.length} élève(s)</span>`;
}
async function doRollover() {
  const err = document.getElementById('ro-error'); err.classList.add('hidden');
  const btn = document.getElementById('ro-btn'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Traitement en cours…';
  try {
    const r = (await api.post('/school-years/rollover', { decisions: App.cache.rollover.decisions, start_date: formVal('ro-start'), end_date: formVal('ro-end'), confirm: formVal('ro-confirm') })).data;
    closeModal(); await loadSchoolYears(); App.year = App.currentYear;
    toast(`Année ${r.opened} ouverte ✅ — ${r.promu} promu(s), ${r.redoublant} redoublant(s), ${r.sortant} sortant(s)`);
    render();
  } catch (e) { err.textContent = e.response?.data?.error || 'Erreur'; err.classList.remove('hidden'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-forward-step mr-1"></i> Réessayer'; }
}

// ---- Sauvegardes ----
const BK_LABELS = { school_years:'Années scolaires', students:'Élèves', student_year_levels:'Parcours élèves', teachers:'Enseignants', teacher_students:'Affectations', classes:'Classes', subjects:'Matières', grades:'Notes', attendance:'Présences', fees:'Frais', courses:'Cours', interactive_courses:'Cours interactifs', events:'Événements', notifications:'Notifications', notification_reads:'Lectures notif.', registrations:'Inscriptions', settings:'Paramètres', user_accounts:'Comptes', audit_log:"Journal d'audit" };
const fmtBytes = n => n > 1048576 ? (n/1048576).toFixed(1)+' Mo' : n > 1024 ? Math.round(n/1024)+' Ko' : n+' o';
async function renderBackupTab(el) {
  const st = (await api.get('/admin/backup/status')).data;
  const total = Object.values(st.counts).filter(n => n >= 0).reduce((a,b) => a+b, 0);
  el.innerHTML = `
  <div class="grid lg:grid-cols-2 gap-4">
    <div class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-download text-blue-600 mr-2"></i>Exporter une sauvegarde complète</h3>
      <p class="text-xs text-gray-500 mb-3">Toutes les tables, toutes les années, y compris la corbeille (<b>${total.toLocaleString('fr-FR')}</b> lignes). Les mots de passe ne sont jamais exportés. Conservez le fichier en lieu sûr (Google Drive, disque externe…).</p>
      <div class="flex gap-2 flex-wrap mb-4">
        <button onclick="backupDownloadJson()" id="bk-json" class="${btnPrimary}"><i class="fas fa-file-code mr-1"></i> Télécharger JSON (restaurable)</button>
        <button onclick="backupDownloadExcel()" id="bk-xlsx" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Télécharger Excel (lecture)</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
        ${st.tables.map(t => `<div class="flex justify-between bg-gray-50 rounded px-2 py-1"><span class="text-gray-600 truncate">${BK_LABELS[t]||t}</span><b class="${st.counts[t] < 0 ? 'text-red-500' : 'text-gray-800'}">${st.counts[t] < 0 ? 'n/d' : st.counts[t]}</b></div>`).join('')}
      </div>
      <div class="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900"><i class="fas fa-cloud mr-1"></i><b>Sauvegarde automatique hebdomadaire</b> vers le stockage Cloudflare R2 : ${st.r2 ? 'activée ✅' : 'sera activée lors du déploiement en production (rétention 12 semaines).'}</div>
    </div>
    <div class="bg-white rounded-xl shadow p-5">
      <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-clock-rotate-left text-amber-500 mr-2"></i>Historique des sauvegardes</h3>
      ${st.history.length ? `<table class="data-table w-full text-xs"><thead><tr><th>Date</th><th>Par</th><th class="text-right">Lignes</th><th class="text-right">Taille</th></tr></thead><tbody>
        ${st.history.map(h => `<tr><td>${fmtDT(h.at)}</td><td class="truncate max-w-[140px]">${esc(h.by||'')}${h.kind==='auto' ? ' <span class="badge badge-blue">auto</span>' : ''}</td><td class="text-right">${(h.rows||0).toLocaleString('fr-FR')}</td><td class="text-right">${fmtBytes(h.size||0)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="text-gray-400 text-sm py-4 text-center"><i class="fas fa-box-open text-2xl block mb-1"></i>Aucune sauvegarde effectuée pour l\'instant</p>'}
      ${st.history.length ? `<p class="text-xs mt-3 ${daysSince(st.history[0].at) > 7 ? 'text-red-600' : 'text-green-700'}"><i class="fas ${daysSince(st.history[0].at) > 7 ? 'fa-triangle-exclamation' : 'fa-circle-check'} mr-1"></i>Dernière sauvegarde il y a ${daysSince(st.history[0].at)} jour(s)${daysSince(st.history[0].at) > 7 ? ' — pensez à exporter régulièrement.' : '.'}</p>` : ''}
    </div>
    <div class="bg-white rounded-xl shadow p-5 lg:col-span-2 border-2 border-red-100">
      <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-upload text-red-500 mr-2"></i>Restaurer une table depuis une sauvegarde JSON</h3>
      <p class="text-xs text-gray-500 mb-3">Choisissez un fichier de sauvegarde, puis la table à restaurer. <b>Compléter</b> ajoute / met à jour les lignes du fichier sans toucher au reste ; <b>Remplacer</b> vide la table puis la recharge (irréversible, confirmation requise). Les mots de passe des comptes ne sont jamais écrasés.</p>
      <div class="flex flex-wrap gap-3 items-end">
        <div><label class="${lblCls}">Fichier JSON</label><input type="file" id="bk-file" accept=".json,application/json" class="${inputCls}" onchange="backupFileChosen(this)"></div>
        <div><label class="${lblCls}">Table</label><select id="bk-table" class="${inputCls} min-w-[220px]" disabled><option value="">— choisir un fichier —</option></select></div>
        <div><label class="${lblCls}">Mode</label><select id="bk-mode" class="${inputCls}"><option value="upsert">Compléter / mettre à jour</option><option value="replace">Remplacer (vider puis recharger)</option></select></div>
        <button onclick="backupRestore()" id="bk-restore" class="${btnPrimary} bg-red-600 hover:bg-red-700" disabled><i class="fas fa-rotate-left mr-1"></i> Restaurer</button>
      </div>
      <div id="bk-file-info" class="text-xs text-gray-500 mt-2"></div>
      <div id="bk-result" class="text-sm mt-2"></div>
    </div>
  </div>`;
}
function daysSince(iso) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); }

async function backupFetch() {
  const r = await api.get('/admin/backup/export', { responseType: 'blob' });
  const text = await r.data.text();
  return { text, data: JSON.parse(text), filename: (r.headers['content-disposition'] || '').match(/filename="([^"]+)"/)?.[1] || 'rahma-academy-backup.json' };
}
function triggerDownload(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
async function backupDownloadJson() {
  const btn = document.getElementById('bk-json'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Export en cours…';
  try { const { text, filename } = await backupFetch(); triggerDownload(new Blob([text], { type: 'application/json' }), filename); toast('Sauvegarde JSON téléchargée ✅'); render(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur export', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-code mr-1"></i> Télécharger JSON (restaurable)'; }
}
async function backupDownloadExcel() {
  const btn = document.getElementById('bk-xlsx'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Export en cours…';
  try {
    const { data, filename } = await backupFetch();
    const wb = XLSX.utils.book_new();
    const meta = [[`${brandName()} — Sauvegarde`], ['Exportée le', fmtDT(data.meta.exported_at)], ['Par', data.meta.exported_by || ''], [], ['Table', 'Lignes'], ...Object.entries(data.meta.tables)];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(meta), 'Résumé');
    for (const [t, rows] of Object.entries(data.tables)) {
      if (!rows.length) continue;
      const flat = rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat), (BK_LABELS[t] || t).replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31));
    }
    XLSX.writeFile(wb, filename.replace(/\.json$/, '.xlsx'));
    toast('Sauvegarde Excel téléchargée ✅'); render();
  } catch (e) { toast(e.response?.data?.error || e.message || 'Erreur export', 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-file-excel text-green-600 mr-1"></i> Télécharger Excel (lecture)'; }
}
let _bkLoaded = null;
async function backupFileChosen(input) {
  const f = input.files[0]; const info = document.getElementById('bk-file-info'); const sel = document.getElementById('bk-table');
  _bkLoaded = null; sel.innerHTML = '<option value="">— choisir une table —</option>'; sel.disabled = true; document.getElementById('bk-restore').disabled = true;
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data.tables || !data.meta) throw new Error(`Format inattendu (fichier non produit par ${brandName()})`);
    _bkLoaded = data;
    info.innerHTML = `<i class="fas fa-circle-check text-green-600 mr-1"></i>Sauvegarde du <b>${fmtDT(data.meta.exported_at)}</b> par ${esc(data.meta.exported_by||'?')} — ${Object.values(data.meta.tables).reduce((a,b)=>a+b,0).toLocaleString('fr-FR')} lignes`;
    for (const [t, rows] of Object.entries(data.tables)) if (t !== 'audit_log') sel.insertAdjacentHTML('beforeend', `<option value="${t}">${BK_LABELS[t]||t} (${rows.length})</option>`);
    sel.disabled = false; document.getElementById('bk-restore').disabled = false;
  } catch (e) { info.innerHTML = `<span class="text-red-600"><i class="fas fa-triangle-exclamation mr-1"></i>${esc(e.message)}</span>`; }
}
async function backupRestore() {
  const table = formVal('bk-table'); const mode = formVal('bk-mode'); const out = document.getElementById('bk-result');
  if (!_bkLoaded || !table) { toast('Choisissez un fichier et une table', 'warning'); return; }
  const rows = _bkLoaded.tables[table] || [];
  let confirm_ = undefined;
  if (mode === 'replace') { confirm_ = prompt(`⚠️ REMPLACER la table « ${BK_LABELS[table]||table} » : toutes les lignes actuelles seront supprimées puis ${rows.length} lignes rechargées.\n\nPour confirmer, tapez : ${table}`); if (confirm_ !== table) { toast('Restauration annulée', 'info'); return; } }
  else if (!confirm(`Compléter la table « ${BK_LABELS[table]||table} » avec ${rows.length} ligne(s) du fichier ? Les lignes existantes ayant le même identifiant seront mises à jour.`)) return;
  out.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Restauration en cours…';
  try {
    const r = (await api.post('/admin/backup/restore', { table, rows, mode, confirm: confirm_ })).data;
    out.innerHTML = `<span class="${r.ok ? 'text-green-700' : 'text-amber-700'}"><i class="fas ${r.ok ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1"></i>${BK_LABELS[table]||table} : ${r.inserted} ajoutée(s), ${r.updated||0} mise(s) à jour${r.skipped ? ', ' + r.skipped + ' ignorée(s)' : ''} sur ${r.total}${r.errors.length ? ' — erreurs : ' + esc(r.errors.join(' ; ')) : ''}</span>`;
    toast(r.ok ? 'Restauration terminée ✅' : 'Restauration partielle', r.ok ? 'success' : 'warning');
  } catch (e) { out.innerHTML = `<span class="text-red-600"><i class="fas fa-triangle-exclamation mr-1"></i>${esc(e.response?.data?.error || 'Erreur')}</span>`; }
}

// ---- Journal d'audit ----
async function renderAuditTab(el) {
  const f = App.cache.auditFilter || {};
  const qs = Object.entries(f).filter(([,v]) => v).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const r = (await api.get('/admin/audit?limit=300' + (qs ? '&' + qs : ''))).data;
  const ACTIONS = { login:'Connexion', login_failed:'Échec connexion', login_blocked:'Connexion bloquée', signup:'Inscription', create:'Création', update:'Modification', delete:'Suppression', soft_delete:'Mise en corbeille', restore:'Restauration', purge:'Suppression définitive' };
  const badge = a => ({ login:'badge-green', login_failed:'badge-yellow', login_blocked:'badge-red', create:'badge-blue', update:'badge-purple', delete:'badge-red', soft_delete:'badge-yellow', purge:'badge-red', restore:'badge-green', signup:'badge-blue' }[a] || 'badge-gray');
  const diff = (b, a) => {
    if (!b && !a) return '';
    if (!b) return `<span class="text-green-700">${esc(JSON.stringify(a)).slice(0, 220)}</span>`;
    if (!a) return `<span class="text-red-700 line-through">${esc(JSON.stringify(b)).slice(0, 220)}</span>`;
    const keys = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    return keys.map(k => `<div><b>${esc(k)}</b> : <span class="text-red-600 line-through">${esc(String(b[k] ?? '∅'))}</span> → <span class="text-green-700">${esc(String(a[k] ?? '∅'))}</span></div>`).join('') || '<span class="text-gray-400">aucun changement</span>';
  };
  el.innerHTML = `
  ${!r.supported ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 mb-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Le journal d'audit nécessite l'exécution de <code>migrations/0007_security.sql</code> dans Supabase SQL Editor.</div>` : ''}
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <select onchange="App.cache.auditFilter={...(App.cache.auditFilter||{}), action:this.value}; render()" class="${inputCls} max-w-[200px]">
      <option value="">Toutes les actions</option>
      ${Object.entries(ACTIONS).map(([k,v]) => `<option value="${k}" ${f.action===k?'selected':''}>${v}</option>`).join('')}
    </select>
    <select onchange="App.cache.auditFilter={...(App.cache.auditFilter||{}), table_name:this.value}; render()" class="${inputCls} max-w-[200px]">
      <option value="">Toutes les tables</option>
      ${['user_accounts','students','teachers','grades','attendance','fees','courses','interactive_courses','events','settings','registrations'].map(t => `<option value="${t}" ${f.table_name===t?'selected':''}>${t}</option>`).join('')}
    </select>
    <input type="text" placeholder="Email utilisateur" value="${esc(f.user_email||'')}" class="${inputCls} max-w-[220px]" onchange="App.cache.auditFilter={...(App.cache.auditFilter||{}), user_email:this.value}; render()">
    <input type="date" value="${esc(f.from||'')}" class="${inputCls} max-w-[160px]" onchange="App.cache.auditFilter={...(App.cache.auditFilter||{}), from:this.value}; render()">
    <input type="date" value="${esc(f.to||'')}" class="${inputCls} max-w-[160px]" onchange="App.cache.auditFilter={...(App.cache.auditFilter||{}), to:this.value}; render()">
    <button onclick="App.cache.auditFilter={}; render()" class="${btnSecondary}"><i class="fas fa-eraser mr-1"></i> Effacer</button>
    <span class="text-sm text-gray-500 ml-auto">${r.items.length} entrée(s)</span>
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full text-sm">
      <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Table / ID</th><th>Détail</th><th>IP</th></tr></thead>
      <tbody>
        ${r.items.map(a => `<tr>
          <td class="whitespace-nowrap text-xs">${fmtDT(a.created_at)}</td>
          <td class="text-xs"><div class="font-semibold">${esc(a.user_email||'—')}</div><div class="text-gray-400">${a.user_role ? roleLabel(a.user_role) : ''}</div></td>
          <td><span class="badge ${badge(a.action)}">${ACTIONS[a.action]||a.action}</span></td>
          <td class="text-xs"><b>${esc(a.table_name||'')}</b>${a.record_id ? ' #'+esc(a.record_id) : ''}</td>
          <td class="text-xs max-w-md">${diff(a.before, a.after)}</td>
          <td class="text-xs text-gray-400">${esc(a.ip||'')}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-center text-gray-400 py-8">Aucune entrée</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

// ---- Corbeille (soft-delete, 30 jours) ----
async function renderTrashTab(el) {
  const r = (await api.get('/admin/trash')).data;
  const TL = { students:'Élève', teachers:'Enseignant', grades:'Note', fees:'Frais', courses:'Cours', interactive_courses:'Cours interactif', events:'Événement', classes:'Classe' };
  const daysLeft = d => Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000));
  el.innerHTML = `
  ${!r.supported ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 mb-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>La corbeille nécessite l'exécution de <code>migrations/0007_security.sql</code>. En attendant, les suppressions restent définitives.</div>` : `<p class="text-sm text-gray-500 mb-4"><i class="fas fa-circle-info mr-1"></i>Les éléments supprimés sont conservés <b>${r.retention_days} jours</b> puis effacés automatiquement. Vous pouvez les restaurer à tout moment avant l'échéance.</p>`}
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full text-sm">
      <thead><tr><th>Type</th><th>Élément</th><th>Supprimé le</th><th>Expire dans</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${(r.items||[]).map(it => `<tr>
          <td><span class="badge badge-gray">${TL[it.table]||it.table}</span></td>
          <td class="font-semibold">${esc(it.label)} <span class="text-gray-400 text-xs">#${it.id}</span></td>
          <td class="text-xs">${fmtDT(it.deleted_at)}</td>
          <td class="text-xs"><span class="badge ${daysLeft(it.expires_at) <= 5 ? 'badge-red' : 'badge-yellow'}">${daysLeft(it.expires_at)} j</span></td>
          <td class="text-right whitespace-nowrap">
            <button onclick="trashRestore('${it.table}', ${it.id})" class="text-green-600 hover:text-green-800 mr-3" title="Restaurer"><i class="fas fa-rotate-left"></i> Restaurer</button>
            <button onclick="trashPurge('${it.table}', ${it.id})" class="text-red-500 hover:text-red-700" title="Supprimer définitivement"><i class="fas fa-fire"></i></button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" class="text-center text-gray-400 py-8"><i class="fas fa-trash-can text-3xl mb-2 block"></i>Corbeille vide</td></tr>'}
      </tbody>
    </table>
  </div>`;
}
async function trashRestore(table, id) {
  try { await api.post('/admin/trash/restore', { table, id }); toast('Élément restauré'); render(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
async function trashPurge(table, id) {
  if (!confirm('Supprimer DÉFINITIVEMENT cet élément ? Cette action est irréversible.')) return;
  try { await api.post('/admin/trash/purge', { table, id }); toast('Supprimé définitivement'); render(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

// ---- Création d'un compte par l'admin (seule voie pour un nouvel administrateur) ----
function showAdminCreateUser() {
  openModal('<i class="fas fa-user-plus text-blue-600 mr-2"></i>Créer un compte utilisateur', `
    <form onsubmit="doAdminCreateUser(event)">
      <label class="${lblCls}">Nom complet</label><input id="au-name" required class="${inputCls} mb-3">
      <label class="${lblCls}">Email</label><input id="au-email" type="email" required class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label><input id="au-phone" class="${inputCls} mb-3" placeholder="+216 ...">
      <label class="${lblCls}">Mot de passe <span class="text-gray-400 font-normal">(8 caractères min.)</span></label><input id="au-password" type="text" required minlength="8" class="${inputCls} mb-3" value="${Math.random().toString(36).slice(2,8)}${Math.random().toString(36).slice(2,6).toUpperCase()}!">
      <label class="${lblCls}">Rôle</label>
      <select id="au-role" class="${inputCls} mb-4">
        <option value="admin">Administration</option><option value="teacher">Enseignant</option><option value="parent">Parent / Tuteur</option><option value="student">Élève</option>
      </select>
      <div id="au-error" class="text-red-600 text-sm mb-3 hidden"></div>
      <button type="submit" class="${btnPrimary} w-full"><i class="fas fa-user-plus mr-1"></i> Créer le compte</button>
    </form>`);
}
async function doAdminCreateUser(e) {
  e.preventDefault();
  const errEl = document.getElementById('au-error'); errEl.classList.add('hidden');
  try {
    await api.post('/admin/users', { name: formVal('au-name'), email: formVal('au-email'), phone: formVal('au-phone'), password: document.getElementById('au-password').value, role: formVal('au-role') });
    closeModal(); toast('Compte créé — communiquez le mot de passe à l\'utilisateur de façon sécurisée'); render();
  } catch (err) { errEl.textContent = err.response?.data?.error || 'Erreur'; errEl.classList.remove('hidden'); }
}

// ---- Gestion des utilisateurs ----
async function renderUsersTab(el) {
  const roleFilter = App.cache.userRoleFilter || '';
  const search = App.cache.userSearch || '';
  let users = (await api.get('/admin/users' + (roleFilter ? `?role=${roleFilter}` : ''))).data;
  if (search) users = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()));

  el.innerHTML = `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <input placeholder="Rechercher nom ou email..." value="${esc(search)}" class="${inputCls} max-w-xs"
      oninput="App.cache.userSearch=this.value; clearTimeout(App._ut); App._ut=setTimeout(()=>render(),400)">
    <select onchange="App.cache.userRoleFilter=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les rôles</option>
      ${['admin','teacher','parent','student'].map(r=>`<option value="${r}" ${roleFilter===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
    </select>
    <span class="text-sm text-gray-500 ml-auto">${users.length} utilisateur(s)</span>
    <button onclick="showAdminCreateUser()" class="${btnPrimary}"><i class="fas fa-user-plus mr-1"></i> Créer un compte</button>
  </div>
  ${users.some(u => u.role==='teacher' && u.status!=='active') ? `<div class="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-3 mb-4 text-sm"><i class="fas fa-user-clock mr-2"></i><b>${users.filter(u => u.role==='teacher' && u.status!=='active').length}</b> compte(s) enseignant en attente de validation — activez-les via le statut.</div>` : ''}
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Dernière connexion</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${users.map(u => `<tr>
          <td class="font-semibold">${esc(u.name)}</td>
          <td class="text-xs">${esc(u.email)}</td>
          <td>
            <select onchange="changeUserRole(${u.id}, this.value)" class="border rounded px-2 py-1 text-xs" ${u.id===App.user.id?'disabled':''}>
              ${['admin','teacher','parent','student'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${roleLabel(r)}</option>`).join('')}
            </select>
          </td>
          <td><span class="badge ${u.status==='active'?'badge-green':'badge-red'}">${u.status==='active'?'Actif':'Inactif'}</span></td>
          <td class="text-xs">${fmtDT(u.last_login)}</td>
          <td class="text-right whitespace-nowrap">
            ${u.id !== App.user.id ? `
            <button onclick="toggleUserStatus(${u.id}, '${u.status}')" class="${u.status==='active'?'text-orange-600':'text-green-600'} px-1" title="${u.status==='active'?'Désactiver':'Activer'}">
              <i class="fas ${u.status==='active'?'fa-user-slash':'fa-user-check'}"></i>
            </button>
            <button onclick="deleteUser(${u.id}, '${esc(u.name)}')" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>` : '<span class="text-xs text-gray-400">Vous</span>'}
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun utilisateur</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

async function toggleUserStatus(id, current) {
  try {
    await api.patch(`/admin/users/${id}`, { status: current === 'active' ? 'inactive' : 'active' });
    toast('Statut mis à jour'); render();
  } catch (e) { toast('Erreur', 'error'); }
}
async function changeUserRole(id, role) {
  try { await api.patch(`/admin/users/${id}`, { role }); toast('Rôle mis à jour'); }
  catch (e) { toast('Erreur', 'error'); render(); }
}
function deleteUser(id, name) {
  confirmDelete(`Supprimer l'utilisateur <b>${name}</b> ?`, async () => {
    await api.delete(`/admin/users/${id}`); toast('Utilisateur supprimé'); render();
  });
}

// ---- Paramètres école ----
// ---- F62 : Établissement (identité / marque blanche) ----
let _brandDraft = null;
async function renderSchoolTab(el) {
  let b; try { b = (await api.get('/brand')).data; } catch (e) { el.innerHTML = emptyState('fa-triangle-exclamation', 'Impossible de charger les paramètres', friendlyError(e)); return; }
  _brandDraft = JSON.parse(JSON.stringify(b));
  const T = b.types || {};
  const F = (id, label, val, extra = '') => `<div><label class="${lblCls}">${label}</label><input id="${id}" value="${esc(val ?? '')}" class="${inputCls}" ${extra} oninput="brandPreview()"></div>`;
  const C = (id, label, val) => `<div><label class="${lblCls}">${label}</label><div class="flex items-center gap-2"><input type="color" id="${id}" value="${esc(val)}" class="h-10 w-14 rounded border cursor-pointer" oninput="document.getElementById('${id}-hex').value=this.value; brandPreview()"><input id="${id}-hex" value="${esc(val)}" class="${inputCls} font-mono w-28" maxlength="7" oninput="if(/^#[0-9a-fA-F]{6}$/.test(this.value)){document.getElementById('${id}').value=this.value; brandPreview()}"></div></div>`;
  const so = b.social || {}, ld = b.landing || {};
  el.innerHTML = `
  <div class="grid lg:grid-cols-[1fr_320px] gap-5 items-start">
    <form onsubmit="saveBrand(event)" class="space-y-4" id="brand-form">
      <section class="bg-white rounded-xl shadow p-5">
        <h3 class="font-bold text-gray-800 mb-1"><i class="fas fa-building-columns text-blue-600 mr-2"></i>Identité de l'établissement</h3>
        <p class="text-xs text-slate-500 mb-4">Ces informations s'affichent partout : menu, page d'accueil, PDF (bulletins, quittances, attestations), filigranes, e-mails et notifications. La plateforme s'adapte à tout type d'établissement.</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2 flex flex-wrap items-center gap-4">
            <div class="relative"><img id="brand-logo-preview" src="${esc(b.logo_url)}" class="w-24 h-24 object-contain rounded-xl border bg-slate-50 p-1" alt="Logo"><input type="hidden" id="br-logo_url" value="${esc(b.logo_url)}"></div>
            <div class="flex-1 min-w-[200px]">
              <label class="${lblCls}">Logo <span class="text-gray-400 font-normal">(PNG transparent conseillé, carré, ≥ 512 px)</span></label>
              <div class="flex flex-wrap gap-2 items-center">
                <label class="${btnSecondary} cursor-pointer"><i class="fas fa-upload mr-1"></i> Choisir un fichier<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="hidden" onchange="brandUploadLogo(this.files[0])"></label>
                ${b.logo_url !== b.defaults?.logo_url ? `<button type="button" onclick="brandResetLogo()" class="${btnGhost} text-xs"><i class="fas fa-rotate-left mr-1"></i>Logo par défaut</button>` : ''}
                <span id="brand-logo-status" class="text-xs text-slate-500"></span>
              </div>
              <p class="text-[11px] text-slate-400 mt-1">Le logo sert aussi de filigrane sur les documents et d'icône d'application (PWA).</p>
            </div>
          </div>
          ${F('br-name', "Nom de l'établissement *", b.name, 'required maxlength="120"')}
          ${F('br-name_ar', 'الاسم بالعربية', b.name_ar, 'dir="rtl"')}
          ${F('br-short_name', 'Nom court (icône, onglet)', b.short_name, 'maxlength="30"')}
          <div><label class="${lblCls}">Type d'établissement</label><select id="br-type" class="${inputCls}" onchange="brandPreview()">${Object.entries(T).map(([k, v]) => `<option value="${k}" ${b.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
          ${F('br-tagline', 'Slogan / sous-titre', b.tagline, 'maxlength="120"')}
          ${F('br-tagline_ar', 'الشعار بالعربية', b.tagline_ar, 'dir="rtl"')}
        </div>
      </section>
      <section class="bg-white rounded-xl shadow p-5">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-address-card text-blue-600 mr-2"></i>Coordonnées & informations légales</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">${F('br-address', 'Adresse', b.address)}</div>
          ${F('br-address_ar', 'العنوان بالعربية', b.address_ar, 'dir="rtl"')}
          ${F('br-phone', 'Téléphone', b.phone, 'inputmode="tel"')}
          ${F('br-email', 'E-mail', b.email, 'type="email"')}
          ${F('br-website', 'Site web', b.website, 'placeholder="https://…"')}
          ${F('br-director', 'Directeur / Responsable', b.director)}
          ${F('br-director_title', 'Titre du signataire (attestations)', b.director_title, 'placeholder="le Directeur"')}
          ${F('br-legal_id', 'Matricule fiscal / N° agrément', b.legal_id)}
          ${F('br-doc_prefix', 'Préfixe des documents (quittances, attestations)', b.doc_prefix, 'placeholder="ex : RA"')}
          <div class="sm:col-span-2"><label class="${lblCls}">Mentions légales (pied des documents)</label><textarea id="br-legal_text" rows="2" class="${inputCls}" oninput="brandPreview()">${esc(b.legal_text || '')}</textarea></div>
        </div>
      </section>
      <section class="bg-white rounded-xl shadow p-5">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-palette text-blue-600 mr-2"></i>Couleurs, devise & langue</h3>
        <div class="grid sm:grid-cols-3 gap-3">
          ${C('br-color_primary', 'Couleur principale', b.color_primary)}
          ${C('br-color_accent', "Couleur d'accent", b.color_accent)}
          ${C('br-color_dark', 'Fond sombre (menu, accueil)', b.color_dark)}
          ${F('br-currency', 'Devise (affichage)', b.currency, 'maxlength="8" placeholder="DT, €, MAD, DZD…"')}
          ${F('br-currency_ar', 'الدولة/العملة بالعربية', b.currency_ar, 'dir="rtl"')}
          ${F('br-registration_fee', "Frais d'inscription (page publique)", b.registration_fee, 'type="number" min="0" step="0.5"')}
          ${F('br-country', 'Pays (code)', b.country, 'maxlength="2" placeholder="TN"')}
        </div>
      </section>
      <section class="bg-white rounded-xl shadow p-5">
        <h3 class="font-bold text-gray-800 mb-3"><i class="fas fa-globe text-blue-600 mr-2"></i>Page d'accueil publique & réseaux sociaux</h3>
        <div class="grid sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">${F('br-landing-headline', "Titre d'accroche (sous le nom)", ld.headline, 'placeholder="ex : L\'excellence au service de chaque élève"')}</div>
          <div class="sm:col-span-2"><label class="${lblCls}">Texte de présentation</label><textarea id="br-landing-subheadline" rows="2" class="${inputCls}" oninput="brandPreview()">${esc(ld.subheadline || '')}</textarea></div>
          ${F('br-social-facebook', 'Facebook', so.facebook, 'placeholder="https://facebook.com/…"')}
          ${F('br-social-instagram', 'Instagram', so.instagram)}
          ${F('br-social-youtube', 'YouTube', so.youtube)}
          ${F('br-social-telegram', 'Telegram', so.telegram)}
          ${F('br-social-whatsapp', 'WhatsApp (numéro ou lien)', so.whatsapp)}
          <div class="sm:col-span-2 flex flex-wrap gap-4 text-sm pt-1">
            ${[['show_stats', 'Chiffres clés'], ['show_features', 'Carrousel fonctionnalités'], ['show_registration', "Bouton d'inscription"], ['show_qr', 'QR code inscription']].map(([k, l]) => `<label class="inline-flex items-center gap-2"><input type="checkbox" id="br-landing-${k}" ${ld[k] !== false ? 'checked' : ''}> ${l}</label>`).join('')}
          </div>
        </div>
      </section>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" onclick="render()" class="${btnSecondary}">Annuler</button>
        <button type="submit" id="brand-save" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer l'identité</button>
      </div>
    </form>
    <aside class="lg:sticky lg:top-20 space-y-3">
      <div class="bg-white rounded-xl shadow p-3">
        <p class="text-xs font-bold text-slate-500 uppercase mb-2">Aperçu en direct</p>
        <div id="brand-preview" class="rounded-xl overflow-hidden text-white"></div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800"><i class="fas fa-lightbulb mr-1"></i>Après enregistrement, l'application se recharge pour appliquer le nouveau thème partout (menu, accueil, PDF, filigranes, PWA).</div>
    </aside>
  </div>`;
  brandPreview();
}
function brandCollect() {
  const v = id => document.getElementById(id)?.value?.trim() ?? '';
  const d = { name: v('br-name'), name_ar: v('br-name_ar'), short_name: v('br-short_name'), type: v('br-type'), tagline: v('br-tagline'), tagline_ar: v('br-tagline_ar'), logo_url: v('br-logo_url'),
    address: v('br-address'), address_ar: v('br-address_ar'), phone: v('br-phone'), email: v('br-email'), website: v('br-website'), director: v('br-director'), director_title: v('br-director_title'), legal_id: v('br-legal_id'), doc_prefix: v('br-doc_prefix'), legal_text: v('br-legal_text'),
    color_primary: v('br-color_primary'), color_accent: v('br-color_accent'), color_dark: v('br-color_dark'), currency: v('br-currency'), currency_ar: v('br-currency_ar'), registration_fee: Number(v('br-registration_fee') || 0), country: v('br-country').toUpperCase(),
    social: { facebook: v('br-social-facebook'), instagram: v('br-social-instagram'), youtube: v('br-social-youtube'), telegram: v('br-social-telegram'), whatsapp: v('br-social-whatsapp') },
    landing: { headline: v('br-landing-headline'), subheadline: v('br-landing-subheadline'), show_stats: !!document.getElementById('br-landing-show_stats')?.checked, show_features: !!document.getElementById('br-landing-show_features')?.checked, show_registration: !!document.getElementById('br-landing-show_registration')?.checked, show_qr: !!document.getElementById('br-landing-show_qr')?.checked } };
  return d;
}
function brandPreview() {
  const el = document.getElementById('brand-preview'); if (!el) return;
  const d = brandCollect();
  const w = (d.name || 'Nom').split(/\s+/); const last = w.length > 1 ? w.pop() : '';
  el.innerHTML = `<div style="background:linear-gradient(135deg,${d.color_dark},${d.color_primary});padding:18px 14px">
    <div class="flex items-center gap-3"><img src="${esc(d.logo_url)}" class="w-12 h-12 object-contain" alt=""><div><div class="font-bold leading-tight">${esc(w.join(' '))} <span style="color:${d.color_accent}">${esc(last)}</span></div><div class="text-[10px] uppercase tracking-widest opacity-70">${esc(d.tagline || '')}</div></div></div>
    <div class="mt-4 text-center"><div class="text-lg font-black">${esc((d.name || '').toUpperCase())}</div><div class="text-xs opacity-80">${esc(d.landing.headline || d.tagline || '')}</div>
    <button type="button" class="mt-3 px-3 py-1.5 rounded-lg text-xs font-bold" style="background:${d.color_accent};color:${d.color_dark}">Inscrire un élève</button></div>
    <div class="mt-4 text-[10px] opacity-70 text-center">${esc([d.address, d.phone].filter(Boolean).join(' • '))}</div></div>
    <div class="bg-white text-slate-700 p-3 text-xs border-t"><div class="flex items-center justify-between"><span class="font-semibold">Frais</span><span class="font-bold" style="color:${d.color_primary}">70 ${esc(d.currency || 'DT')}</span></div><div class="mt-1 text-[10px] text-slate-400">© ${new Date().getFullYear()} ${esc(d.name)} — Document authentifié</div></div>`;
}
async function brandUploadLogo(file) {
  if (!file) return;
  const st = document.getElementById('brand-logo-status');
  if (file.size > 2 * 1024 * 1024) return toast('Logo trop volumineux (max 2 Mo)', 'error');
  try {
    st.textContent = 'Envoi…';
    const up = await uploadFile('branding', file, { raw: true, silent: true });
    document.getElementById('br-logo_url').value = up.url;
    document.getElementById('brand-logo-preview').src = up.url;
    st.textContent = 'Logo envoyé — pensez à enregistrer';
    brandPreview();
  } catch (e) { st.textContent = ''; toast(friendlyError(e), 'error'); }
}
function brandResetLogo() { const d = _brandDraft?.defaults?.logo_url || '/static/logo-rahma.png'; document.getElementById('br-logo_url').value = d; document.getElementById('brand-logo-preview').src = d; brandPreview(); }
async function saveBrand(e) {
  e.preventDefault();
  const btn = document.getElementById('brand-save'); setBusy(btn, true);
  try {
    const d = brandCollect();
    if (!d.name) throw new Error("Le nom de l'établissement est obligatoire");
    await api.put('/admin/brand', d);
    toast("Identité de l'établissement enregistrée — rechargement…");
    setTimeout(() => location.reload(), 900);
  } catch (err) { setBusy(btn, false); toast(err.response?.data?.error || err.message || 'Erreur', 'error'); }
}

// ---- Mon compte (admin : modifier email / mot de passe) ----
async function renderMyAccountTab(el) {
  const u = App.user || {};
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow p-5 max-w-xl">
    <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-user-shield text-blue-600 mr-2"></i>Mon compte administrateur</h3>
    <p class="text-xs text-gray-500 mb-4">Modifiez votre email de connexion et/ou votre mot de passe. Le mot de passe actuel est requis pour toute modification.</p>
    ${u.has_google ? `<div class="flex items-center gap-3 bg-gray-50 border rounded-lg p-3 mb-4 text-sm">${u.avatar_url ? `<img src="${esc(u.avatar_url)}" class="w-9 h-9 rounded-full" referrerpolicy="no-referrer" alt="">` : '<i class="fab fa-google text-lg"></i>'}<div><b>Compte lié à Google</b><div class="text-xs text-gray-500">Vous pouvez vous connecter avec Google ou avec votre mot de passe.${u.auth_provider === 'google' ? ' Compte créé via Google : définissez un mot de passe ci-dessous si vous souhaitez aussi vous connecter sans Google.' : ''}</div></div></div>` : ''}
    <form onsubmit="saveMyAccount(event)">
      <label class="${lblCls}">Nom</label>
      <input id="acc-name" value="${esc(u.name||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Email de connexion</label>
      <input id="acc-email" type="email" value="${esc(u.email||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label>
      <input id="acc-phone" value="${esc(u.phone||'')}" class="${inputCls} mb-4" placeholder="+216 ...">
      <div class="border-t pt-4 mb-4">
        <label class="${lblCls}">Nouveau mot de passe <span class="text-gray-400 font-normal">(laisser vide pour ne pas changer)</span></label>
        <input id="acc-newpass" type="password" class="${inputCls} mb-3" autocomplete="new-password" minlength="8" placeholder="Minimum 8 caractères">
        <label class="${lblCls}">Confirmer le nouveau mot de passe</label>
        <input id="acc-newpass2" type="password" class="${inputCls}" autocomplete="new-password">
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
        <label class="${lblCls} text-amber-800"><i class="fas fa-lock mr-1"></i>Mot de passe actuel (obligatoire)</label>
        <input id="acc-curpass" type="password" required class="${inputCls}" autocomplete="current-password">
      </div>
      <div id="acc-error" class="text-red-600 text-sm mb-3 hidden"></div>
      <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Mettre à jour mon compte</button>
    </form>
  </div>`;
}

async function saveMyAccount(e) {
  e.preventDefault();
  const errEl = document.getElementById('acc-error');
  errEl.classList.add('hidden');
  const np = document.getElementById('acc-newpass').value;
  const np2 = document.getElementById('acc-newpass2').value;
  if (np && np !== np2) { errEl.textContent = 'Les nouveaux mots de passe ne correspondent pas'; errEl.classList.remove('hidden'); return; }
  const payload = {
    name: formVal('acc-name'), email: formVal('acc-email'), phone: formVal('acc-phone'),
    current_password: document.getElementById('acc-curpass').value
  };
  if (np) payload.new_password = np;
  try {
    const r = await api.patch('/auth/me', payload);
    App.token = r.data.token; App.user = { ...App.user, ...r.data.user };
    localStorage.setItem('edu_token', App.token);
    toast('Compte mis à jour avec succès');
    document.getElementById('acc-curpass').value = '';
    document.getElementById('acc-newpass').value = '';
    document.getElementById('acc-newpass2').value = '';
    render();
  } catch (err) {
    errEl.textContent = err.response?.data?.error || 'Erreur lors de la mise à jour';
    errEl.classList.remove('hidden');
  }
}

// ---- Paramètres notifications ----
async function renderNotifsTab(el) {
  const prefs = (await db.list('settings', 'select=*&key=eq.notifications'))[0]?.value || {};
  const row = (key, label, emailOff) => `
    <div class="flex items-center justify-between border-b py-3">
      <span class="text-sm font-medium">${label}</span>
      <div class="flex gap-4 text-sm">
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-email_${key}" ${emailOff ? (prefs['email_'+key]===true?'checked':'') : (prefs['email_'+key]!==false?'checked':'')}> <i class="fas fa-envelope text-blue-500"></i> Email</label>
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-sms_${key}" ${prefs['sms_'+key]===true?'checked':''}> <i class="fas fa-comment-sms text-green-500"></i> SMS</label>
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-telegram_${key}" ${prefs['telegram_'+key]!==false?'checked':''}> <i class="fab fa-telegram text-sky-500"></i> Telegram</label>
      </div>
    </div>`;
  let tg = { configured: false, linked: 0, bot: null };
  try { tg = (await api.get('/telegram/status')).data; } catch {}
  let chan = {};
  try { chan = (await db.list('settings', 'select=*&key=eq.telegram_channel'))[0]?.value || {}; } catch {}
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow p-5 max-w-xl">
    <h3 class="font-bold text-gray-700 mb-2">Notifications automatiques aux tuteurs</h3>
    <p class="text-xs text-gray-400 mb-4">Email : clé API Resend (configurée ✅). Telegram : gratuit et illimité — les parents se lient au bot avec leur numéro. SMS : nécessite Twilio (payant, optionnel).</p>
    ${row('absence', 'Absence / Retard')}
    ${row('frais', 'Frais impayés (relance)')}
    ${row('note', 'Nouvelle note')}
    <p class="text-xs text-gray-500 mt-4 mb-1 font-semibold uppercase tracking-wide">Informations ciblées (parents) — dans l'application : élèves, parents et enseignants sont toujours informés</p>
    ${row('cours', 'Nouveau cours / cours interactif', true)}
    ${row('evenement', 'Nouvel événement (réunion, activité...)', true)}
    ${row('examen', 'Examen programmé / date modifiée', true)}
    <button onclick="saveNotifSettings()" class="${btnPrimary} mt-4"><i class="fas fa-save mr-1"></i> Enregistrer</button>
  </div>
  <div class="bg-white rounded-xl shadow p-5 max-w-xl mt-4">
    <h3 class="font-bold text-gray-700 mb-2"><i class="fab fa-telegram text-sky-500 mr-2"></i>Telegram — notifications gratuites</h3>
    ${tg.configured ? `
      <div class="flex items-center gap-2 mb-3">
        <span class="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700"><i class="fas fa-circle-check mr-1"></i>Bot actif${tg.bot ? ' : @'+esc(tg.bot) : ''}</span>
        <span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700"><i class="fas fa-users mr-1"></i>${tg.linked} parent(s) lié(s)</span>
      </div>
      <ol class="text-xs text-gray-500 list-decimal ml-4 space-y-1 mb-3">
        <li>Partagez ce lien aux parents : <a href="https://t.me/${esc(tg.bot||'')}" target="_blank" class="text-blue-600 font-semibold">t.me/${esc(tg.bot||'')}</a></li>
        <li>Le parent appuie sur <b>Démarrer</b> puis envoie son <b>numéro de téléphone</b> (celui enregistré à l'école)</li>
        <li>C'est tout ! Il reçoit ensuite absences, notes et rappels de frais gratuitement</li>
      </ol>
      <button onclick="setupTelegramWebhook()" class="${btnSecondary} text-xs"><i class="fas fa-rotate mr-1"></i> Reconfigurer le webhook</button>
    ` : `
      <p class="text-xs text-gray-500 mb-3">Le bot Telegram n'est pas encore configuré. Créez un bot gratuit via <b>@BotFather</b> sur Telegram, puis ajoutez le token dans les secrets (TELEGRAM_BOT_TOKEN).</p>
      <button onclick="setupTelegramWebhook()" class="${btnSecondary} text-xs"><i class="fas fa-plug mr-1"></i> Tester la configuration</button>
    `}
  </div>
  <div class="bg-white rounded-xl shadow p-5 max-w-xl mt-4" id="health-block">
    <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-heart-pulse text-rose-500 mr-2"></i>Monitoring & alertes de panne</h3>
    <p class="text-xs text-gray-500 mb-3">La page publique <code>/api/health</code> indique l'état du service (à surveiller avec un moniteur gratuit comme UptimeRobot, toutes les 5 min). Si la base Supabase devient inaccessible (projet en pause…), une <b>alerte Telegram</b> est envoyée à l'administrateur, puis un message de rétablissement.</p>
    <div id="health-status" class="text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Vérification…</div>
    <div class="flex gap-2 mt-3 flex-wrap">
      <button onclick="loadHealth()" class="${btnSecondary} text-sm"><i class="fas fa-rotate mr-1"></i> Vérifier maintenant</button>
      <button onclick="testHealthAlert()" class="${btnSecondary} text-sm" id="health-test-btn"><i class="fab fa-telegram mr-1"></i> Envoyer une alerte de test</button>
    </div>
  </div>
  <div class="bg-white rounded-xl shadow p-5 max-w-xl mt-4" id="exam-reminders-block">
    <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-alarm-clock text-red-500 mr-2"></i>Rappels automatiques avant examen</h3>
    <p class="text-xs text-gray-500 mb-3">Chaque examen du calendrier déclenche automatiquement un rappel <b>3 jours avant</b> et <b>la veille</b> : élèves, parents et enseignants du niveau sont notifiés dans l'application, les parents aussi sur Telegram. Les rappels partent une fois par jour, dès la première utilisation de la plateforme.</p>
    <div id="exam-upcoming" class="text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement des examens à venir…</div>
    <button onclick="runExamReminders()" class="${btnSecondary} text-sm mt-3"><i class="fas fa-paper-plane mr-1"></i> Envoyer les rappels du jour maintenant</button>
  </div>
  <div class="bg-white rounded-xl shadow p-5 max-w-xl mt-4">
    <h3 class="font-bold text-gray-700 mb-2"><i class="fas fa-bullhorn text-amber-500 mr-2"></i>Canal d'annonces Telegram</h3>
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-xs text-blue-900 space-y-1">
      <p class="font-bold"><i class="fas fa-list-ol mr-1"></i>Mise en place (une seule fois)</p>
      <p><b>1.</b> Dans Telegram : <i>Nouveau message → Nouveau canal</i> → nom « ${esc(brandName())} » → <b>Canal public</b> → lien ex. <code>t.me/RahmaAcademyTN</code>.</p>
      <p><b>2.</b> Dans le canal : <i>Administrateurs → Ajouter un administrateur</i> → cherchez <b>@${esc(tg.bot||'RahmaEcoleBot')}</b> → cochez <b>« Publier des messages »</b>.</p>
      <p><b>3.</b> Saisissez ci-dessous le nom du <b>canal</b> (pas celui du bot) puis <b>Vérifier & enregistrer</b>.</p>
    </div>
    <label class="${lblCls}">Nom du canal <span class="text-gray-400 font-normal">(@nom, lien t.me/nom, ou identifiant -100… pour un canal privé)</span></label>
    <div class="flex gap-2 mb-2">
      <input id="tg-channel" class="${inputCls} flex-1" placeholder="@RahmaAcademyTN" value="${esc(chan.username || '')}">
      <button onclick="saveTelegramChannel()" class="${btnPrimary} whitespace-nowrap" id="tg-channel-save"><i class="fas fa-circle-check mr-1"></i> Vérifier & enregistrer</button>
    </div>
    <div id="tg-channel-msg" class="text-xs mb-3 ${chan.username && chan.username.toLowerCase() === ('@' + (tg.bot||'')).toLowerCase() ? 'text-red-600' : 'hidden'}">${chan.username && chan.username.toLowerCase() === ('@' + (tg.bot||'')).toLowerCase() ? '<i class="fas fa-triangle-exclamation mr-1"></i><b>Configuration incorrecte :</b> « ' + esc(chan.username) + ' » est le nom du bot, pas d\'un canal. Suivez les étapes ci-dessus puis saisissez le nom du canal.' : ''}</div>
    ${chan.username && chan.verified ? `
    <div class="flex items-center gap-2 mb-3 flex-wrap">
      <span class="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700"><i class="fas fa-circle-check mr-1"></i>Canal vérifié : ${esc(chan.title || chan.username)}${chan.members ? ' · ' + chan.members + ' abonné(s)' : ''}</span>
      ${chan.username.startsWith('@') ? `<a href="https://t.me/${esc(chan.username.replace('@',''))}" target="_blank" class="text-blue-600 text-xs font-semibold"><i class="fas fa-arrow-up-right-from-square mr-1"></i>Ouvrir le canal</a>` : ''}
    </div>
    <button onclick="showAnnounceForm()" class="${btnPrimary} text-sm"><i class="fas fa-bullhorn mr-1"></i> Publier une annonce</button>
    ${chan.username.startsWith('@') ? `<p class="text-xs text-gray-400 mt-3"><i class="fas fa-lightbulb text-amber-400 mr-1"></i>Partagez le lien <b>t.me/${esc(chan.username.replace('@',''))}</b> aux parents pour qu'ils s'abonnent au canal.</p>` : ''}
    ` : (chan.username ? `<p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2"><i class="fas fa-circle-info mr-1"></i>Canal enregistré mais non vérifié — cliquez sur <b>Vérifier & enregistrer</b> pour valider la configuration avant de publier.</p>` : '')}
  </div>`;
  loadExamUpcoming(); loadHealth();
}

async function loadExamUpcoming() {
  const el = document.getElementById('exam-upcoming'); if (!el) return;
  try {
    const r = (await api.get('/exams/upcoming')).data;
    if (!r.items.length) { el.innerHTML = '<i class="fas fa-circle-check text-green-500 mr-1"></i>Aucun examen dans les 14 prochains jours.'; return; }
    el.innerHTML = `<table class="w-full text-xs"><thead><tr class="text-gray-400"><th class="text-left py-1">Examen</th><th class="text-left">Date</th><th>J-3</th><th>J-1</th></tr></thead><tbody>${r.items.map(e => `<tr class="border-t">
      <td class="py-1.5 font-semibold text-gray-700">${esc(e.title)} ${e.level ? `<span class="badge badge-yellow">${esc(e.level)}</span>` : '<span class="badge badge-gray">Tous</span>'}</td>
      <td class="text-gray-600">${fmtDate(e.date)} <span class="text-gray-400">(${e.days_left === 0 ? "aujourd'hui" : e.days_left === 1 ? 'demain' : 'dans ' + e.days_left + ' j'})</span></td>
      <td class="text-center">${e.reminders.j3 ? '<i class="fas fa-check text-green-600" title="Envoyé le '+e.reminders.j3+'"></i>' : (e.days_left > 3 ? '<span class="text-gray-300">—</span>' : '<i class="fas fa-clock text-amber-500" title="En attente"></i>')}</td>
      <td class="text-center">${e.reminders.j1 ? '<i class="fas fa-check text-green-600" title="Envoyé le '+e.reminders.j1+'"></i>' : (e.days_left > 1 ? '<span class="text-gray-300">—</span>' : '<i class="fas fa-clock text-amber-500" title="En attente"></i>')}</td>
    </tr>`).join('')}</tbody></table>`;
  } catch (e) { el.innerHTML = '<span class="text-red-500">Erreur de chargement</span>'; }
}
async function runExamReminders() {
  try {
    const r = (await api.post('/exams/send-reminders')).data;
    toast(r.sent ? `${r.sent} rappel(s) envoyé(s) : ${r.details.join(', ')}` : (r.checked ? 'Rappels déjà envoyés aujourd\'hui' : 'Aucun examen à J-3 ou J-1'), r.sent ? 'success' : 'info');
    loadExamUpcoming();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

async function saveTelegramChannel() {
  const v = (document.getElementById('tg-channel').value || '').trim();
  const msg = document.getElementById('tg-channel-msg');
  const btn = document.getElementById('tg-channel-save');
  msg.className = 'text-xs mb-3 text-gray-500'; msg.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Vérification auprès de Telegram…';
  btn.disabled = true;
  try {
    if (!v) {
      await api.post('/db/settings', { key: 'telegram_channel', value: {} });
      toast('Canal effacé'); render(); return;
    }
    const r = (await api.post('/telegram/channel/verify', { channel: v })).data;
    await api.post('/db/settings', { key: 'telegram_channel', value: { username: r.username, chat_id: r.chat_id, title: r.title, members: r.members, verified: true, verified_at: new Date().toISOString() } });
    toast('Canal vérifié et enregistré : ' + (r.title || r.username) + ' ✅');
    render();
  } catch (e) {
    const err = e.response?.data?.error || 'Erreur de vérification';
    msg.className = 'text-xs mb-3 text-red-600'; msg.innerHTML = '<i class="fas fa-triangle-exclamation mr-1"></i>' + esc(err);
    btn.disabled = false;
  }
}

function showAnnounceForm() {
  openModal('<i class="fas fa-bullhorn text-amber-500 mr-2"></i>Publier une annonce sur le canal', `
    <form onsubmit="doAnnounce(event)">
      <label class="${lblCls}">Titre</label>
      <input id="an-title" class="${inputCls} mb-3" placeholder="Ex : Vacances d'hiver">
      <label class="${lblCls}">Message *</label>
      <textarea id="an-message" rows="5" class="${inputCls} mb-4" required placeholder="Votre annonce…"></textarea>
      <button type="submit" class="${btnPrimary} w-full"><i class="fas fa-paper-plane mr-1"></i> Publier sur le canal Telegram</button>
    </form>
  `);
}

async function doAnnounce(e) {
  e.preventDefault();
  const title = document.getElementById('an-title').value.trim();
  const message = document.getElementById('an-message').value.trim();
  if (!message) return;
  try {
    const r = (await api.post('/telegram/announce', { title, message })).data;
    if (r.ok) { toast('Annonce publiée sur le canal 📢'); closeModal(); }
    else toast(r.error || r.detail || 'Échec de publication', 'error');
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}

async function saveNotifSettings() {
  const value = {};
  for (const key of ['absence','frais','note','cours','evenement','examen']) {
    value['email_'+key] = document.getElementById('nf-email_'+key).checked;
    value['sms_'+key] = document.getElementById('nf-sms_'+key).checked;
    value['telegram_'+key] = document.getElementById('nf-telegram_'+key).checked;
  }
  try { await db.update('settings', 'notifications', { value }); toast('Préférences enregistrées'); }
  catch (e) { toast('Erreur', 'error'); }
}

// Configurer le webhook Telegram auprès de l'API Telegram
async function setupTelegramWebhook() {
  try {
    const r = (await api.post('/telegram/setup', {})).data;
    if (r.ok) toast(`Webhook configuré ! Bot : @${r.bot || '?'}`, 'success');
    else toast(r.detail || r.error || 'Échec de configuration', 'error');
    render();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}


// ---- Monitoring ----
async function loadHealth() {
  const el = document.getElementById('health-status'); if (!el) return;
  try {
    const r = await fetch('/api/health'); const h = await r.json();
    const ok = h.status === 'ok';
    el.innerHTML = `<div class="flex items-center gap-2 flex-wrap">
      <span class="px-2 py-1 rounded-full text-xs font-bold ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}"><i class="fas ${ok ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1"></i>${ok ? 'Service opérationnel' : 'Service dégradé'}</span>
      <span class="text-xs text-gray-500">Base de données : <b>${h.db === 'ok' ? 'OK' : h.db}</b> · latence ${h.db_latency_ms} ms · alertes Telegram ${h.telegram_alerts ? '<b class="text-green-700">activées</b>' : '<b class="text-red-600">non configurées</b>'}</span>
    </div>${h.db_error ? `<p class="text-xs text-red-600 mt-1">${esc(h.db_error)}</p>` : ''}${h.incident ? `<p class="text-xs text-amber-700 mt-1">Incident en cours depuis ${dayjs(h.incident.since).format('DD/MM HH:mm')} (${h.incident.failures} échecs)</p>` : ''}`;
  } catch (e) { el.innerHTML = '<span class="text-red-600 text-sm">Impossible de joindre /api/health</span>'; }
}
async function testHealthAlert() {
  const b = document.getElementById('health-test-btn'); b.disabled = true;
  try {
    const r = (await api.post('/admin/health/test-alert')).data;
    if (r.ok) toast(`Alerte de test envoyée à ${r.recipients} destinataire(s) Telegram`); else toast(r.reason || 'Échec', 'error');
  } catch (e) { toast('Erreur : ' + (e.response?.data?.error || e.message), 'error'); }
  b.disabled = false;
}

// ---- F60 : Documents & filigrane (registre d'authenticité, droits d'auteur) ----
async function renderDocsTab(el) {
  el.innerHTML = '<p class="text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement…</p>';
  const r = (await api.get('/admin/documents')).data;
  if (!r.supported) { el.innerHTML = `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Exécutez <code>migrations/0018_document_registry.sql</code> dans Supabase pour activer le registre d'authenticité. Le filigrane PDF serveur et le filigrane image fonctionnent déjà ; seul l'enregistrement des codes est en attente.</div>`; return; }
  const items = r.items || []; const wm = items.filter(d => d.watermarked).length;
  el.innerHTML = `
  <div class="grid md:grid-cols-4 gap-3 mb-4 text-center text-xs">
    ${[[items.length,'documents enregistrés','fa-file-shield','text-blue-600'],[wm,'filigranés','fa-stamp','text-green-600'],[items.filter(d=>d.bucket==='courses').length,'cours','fa-book-open','text-purple-600'],[items.filter(d=>d.bucket==='homeworks').length,'devoirs','fa-paper-plane','text-amber-600']].map(([n,l,i,c]) => `<div class="bg-white rounded-xl border p-3"><i class="fas ${i} ${c}"></i><p class="text-2xl font-black text-gray-800">${n}</p><p class="text-gray-500">${l}</p></div>`).join('')}
  </div>
  <div class="bg-white rounded-xl shadow p-4 mb-4 text-sm">
    <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-copyright text-blue-600 mr-2"></i>Protection des droits d'auteur</h3>
    <ul class="list-disc ml-5 text-gray-600 text-xs space-y-1">
      <li><b>PDF</b> : filigrane appliqué par le serveur sur chaque page (logo de l'établissement, texte diagonal « ${esc(brandName().toUpperCase())} · auteur · code », bandeau © + lien de vérification) et métadonnées (auteur, producteur, mots-clés).</li>
      <li><b>Images</b> : logo transparent + texte diagonal + bandeau © appliqués dans le navigateur avant envoi ; refus du serveur si le filigrane échoue.</li>
      <li><b>Authentification</b> : chaque fichier reçoit un code unique et une empreinte SHA-256 ; vérification publique sur <a href="/verifier" target="_blank" class="text-blue-700 underline">/verifier</a> (par code ou en déposant le fichier).</li>
    </ul>
    <div class="flex flex-wrap gap-2 mt-3"><button onclick="docsRegularize()" class="${btnPrimary} text-xs"><i class="fas fa-rotate mr-1"></i>Régulariser les anciens cours (filigrane + registre, 10 par passe)</button><a href="/verifier" target="_blank" class="${btnSecondary} text-xs"><i class="fas fa-magnifying-glass mr-1"></i>Page de vérification</a></div>
    <div id="docs-reg-res" class="text-xs mt-2"></div>
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto"><table class="data-table w-full text-sm">
    <thead><tr><th>Date</th><th>Code</th><th>Fichier</th><th>Espace</th><th>Propriétaire</th><th>Filigrane</th><th>SHA-256</th><th></th></tr></thead>
    <tbody>${items.map(d => `<tr><td class="whitespace-nowrap text-xs">${dayjs(d.created_at).format('DD/MM/YYYY HH:mm')}</td><td><code class="text-xs">${esc(d.code)}</code></td><td class="max-w-[220px] truncate" title="${esc(d.filename||'')}">${esc(d.filename||'')}</td><td><span class="badge badge-blue">${esc(d.bucket)}</span></td><td class="text-xs">${esc(d.owner_name||'')}<br><span class="text-gray-400">${esc(d.owner_role||'')}</span></td><td class="text-center">${d.watermarked ? '<i class="fas fa-circle-check text-green-600"></i>' : '<i class="fas fa-circle-minus text-gray-300"></i>'}</td><td><code class="text-[10px] text-gray-400">${esc((d.sha256||'').slice(0,16))}…</code></td><td class="whitespace-nowrap"><a href="${esc(d.url)}" target="_blank" class="text-blue-600 px-1" title="Ouvrir"><i class="fas fa-up-right-from-square"></i></a><a href="/verifier/${esc(d.code)}" target="_blank" class="text-green-600 px-1" title="Vérifier"><i class="fas fa-shield-halved"></i></a></td></tr>`).join('') || '<tr><td colspan="8" class="text-center text-gray-400 py-8">Aucun document enregistré pour l\'instant — les prochains envois seront automatiquement filigranés et enregistrés.</td></tr>'}</tbody></table></div>`;
}
async function docsRegularize() {
  const box = document.getElementById('docs-reg-res'); box.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Traitement (téléchargement, filigrane, réécriture)…';
  try { const r = (await api.post('/admin/documents/regularize?limit=10')).data; box.innerHTML = `<span class="text-green-700"><i class="fas fa-circle-check mr-1"></i>${r.done} document(s) régularisé(s), ${r.skipped} déjà enregistré(s), ${r.remaining} restant(s).</span>${r.errors?.length ? `<br><span class="text-red-600">${r.errors.map(esc).join(' · ')}</span>` : ''}`; if (r.remaining > 0) box.innerHTML += ' <button onclick="docsRegularize()" class="underline text-blue-700">Continuer</button>'; else setTimeout(render, 1500); }
  catch (e) { box.innerHTML = `<span class="text-red-600">${esc(e.response?.data?.error || e.message)}</span>`; }
}
