/* ============================================================
   Rahma Cours de Français - Vues : Inscriptions, Enseignants, Classes, Matières,
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
    await api.post(`/registrations/${id}/approve`);
    toast('Inscription approuvée — élève créé !'); render();
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
  el.innerHTML = pageHeader('Enseignants', 'fa-chalkboard-user', `<button onclick="showTeacherForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel enseignant</button>`) + `
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Nom</th><th>Matière</th><th>Cycles</th><th>Contact</th><th>Statut</th><th class="text-right">Actions</th></tr></thead>
      <tbody>
        ${teachers.map(t => `<tr>
          <td class="font-semibold">${esc(t.first_name)} ${esc(t.last_name)}</td>
          <td><span class="badge badge-purple">${esc(t.subject||'-')}</span></td>
          <td>${esc(t.cycles||'-')}</td>
          <td class="text-xs">${esc(t.phone||'')}<br>${esc(t.email||'')}</td>
          <td><span class="badge ${t.status==='actif'?'badge-green':'badge-gray'}">${esc(t.status)}</span></td>
          <td class="text-right whitespace-nowrap">
            <button onclick="showTeacherForm(${t.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteTeacher(${t.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucun enseignant</td></tr>'}
      </tbody>
    </table>
  </div>`;
};

async function showTeacherForm(id) {
  let t = {};
  if (id) t = (await db.list('teachers', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-chalkboard-user text-blue-600 mr-2"></i>${id?'Modifier':'Nouvel'} enseignant`, `
    <form onsubmit="saveTeacher(event, ${id||'null'})">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Prénom *</label><input id="te-fn" required value="${esc(t.first_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Nom *</label><input id="te-ln" required value="${esc(t.last_name||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Email</label><input id="te-email" type="email" value="${esc(t.email||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Téléphone</label><input id="te-phone" value="${esc(t.phone||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Matière</label><input id="te-subject" value="${esc(t.subject||'')}" class="${inputCls}"></div>
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

async function saveTeacher(e, id) {
  e.preventDefault();
  const data = { first_name: formVal('te-fn'), last_name: formVal('te-ln'), email: formVal('te-email')||null, phone: formVal('te-phone')||null, subject: formVal('te-subject')||null, cycles: formVal('te-cycles'), status: formVal('te-status') };
  try {
    if (id) await db.update('teachers', id, data); else await db.create('teachers', data);
    closeModal(); toast('Enseignant enregistré'); render();
  } catch (err) { toast('Erreur', 'error'); }
}
function deleteTeacher(id) {
  confirmDelete('Supprimer cet enseignant ?', async () => { await db.remove('teachers', id); toast('Supprimé'); render(); });
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
  confirmDelete('Supprimer cette classe ?', async () => { await db.remove('classes', id); toast('Supprimée'); render(); });
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
  let qs = 'select=*,students(first_name,last_name)&order=created_at.desc&limit=100';
  if (type) qs += `&type=eq.${type}`;
  const notifs = await db.list('notifications', qs);

  el.innerHTML = pageHeader('Notifications', 'fa-bell', isStaff() ? `<button onclick="showNotifyForm()" class="${btnPrimary}"><i class="fas fa-paper-plane mr-1"></i> Envoyer une notification</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center">
    <select onchange="App.cache.notifType=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les types</option>
      ${['absence','retard','frais','note','engagement','info'].map(t=>`<option value="${t}" ${type===t?'selected':''}>${ {absence:'Absence',retard:'Retard',frais:'Frais',note:'Note',engagement:'Engagement',info:'Info'}[t] }</option>`).join('')}
    </select>
  </div>
  <div class="bg-white rounded-xl shadow divide-y">
    ${notifs.map(n => `
    <div class="p-4 flex gap-3 items-start">
      <i class="fas ${notifIcon(n.type)} text-xl mt-1"></i>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <b class="text-sm">${esc(n.title||n.type)}</b>
          <span class="badge badge-gray">${n.sent_via}</span>
          <span class="badge ${n.status==='sent'?'badge-green':'badge-yellow'}">${n.status==='sent'?'Envoyé':'Journalisé'}</span>
        </div>
        <p class="text-sm text-gray-600 mt-1">${esc(n.message)}</p>
        <p class="text-xs text-gray-400 mt-1">${n.students ? 'Élève : '+esc(`${n.students.first_name} ${n.students.last_name}`)+' • ' : ''}${n.recipient ? 'Destinataire : '+esc(n.recipient)+' • ' : ''}${fmtDT(n.created_at)}</p>
      </div>
      ${isAdmin() ? `<button onclick="deleteNotification(${n.id})" class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button>` : ''}
    </div>`).join('') || '<p class="text-gray-400 text-center py-10">Aucune notification</p>'}
  </div>`;
};

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
            ${sFees.length ? sFees.map(f => `<div class="flex justify-between text-xs border-b py-1"><span>${esc(f.label)}<br><span class="text-gray-400">Échéance : ${fmtDate(f.due_date)}</span></span><b class="${f.status==='overdue'?'text-red-600':'text-blue-600'}">${Number(f.amount)} DT</b></div>`).join('') : '<p class="text-xs text-green-600"><i class="fas fa-circle-check mr-1"></i>Tous les frais sont réglés</p>'}
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
  let students = [];
  try { students = (await api.get('/public/students')).data; } catch {}
  const ids = linkedIds();
  openModal('<i class="fas fa-user-gear text-blue-600 mr-2"></i>Mon profil', `
    <form onsubmit="saveParentProfile(event)">
      <label class="${lblCls}">Nom</label><input id="pp-name" value="${esc(App.user.name)}" class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label><input id="pp-phone" value="${esc(App.user.phone||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Nouveau mot de passe (laisser vide pour ne pas changer)</label>
      <input id="pp-password" type="password" class="${inputCls} mb-3">
      <label class="${lblCls}">Élèves liés à mon compte</label>
      <div class="border rounded-lg p-3 max-h-48 overflow-y-auto mb-4">
        ${students.map(s => `
          <label class="flex items-center gap-2 text-sm py-1">
            <input type="checkbox" class="pp-student" value="${s.id}" ${ids.includes(s.id)?'checked':''}>
            ${esc(s.first_name)} ${esc(s.last_name)} <span class="text-xs text-gray-400">(${LEVEL_LABELS[s.level]||s.level})</span>
          </label>`).join('') || '<p class="text-xs text-gray-400">Aucun élève</p>'}
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveParentProfile(e) {
  e.preventDefault();
  const checked = [...document.querySelectorAll('.pp-student:checked')].map(c => Number(c.value));
  const data = { name: formVal('pp-name'), phone: formVal('pp-phone'), linked_student_ids: checked, linked_student_id: checked[0] || null };
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
    ${[['users','fa-users','Utilisateurs'],['school','fa-school','École'],['notifs','fa-bell','Notifications'],['account','fa-user-shield','Mon compte']].map(([k,i,l]) => `
      <button onclick="App.cache.settingsTab='${k}'; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab===k?'bg-blue-600 text-white':'bg-white border text-gray-600'}"><i class="fas ${i} mr-1"></i> ${l}</button>`).join('')}
  </div>
  <div id="settings-content"></div>`;
  const content = document.getElementById('settings-content');
  if (tab === 'users') await renderUsersTab(content);
  else if (tab === 'school') await renderSchoolTab(content);
  else if (tab === 'account') await renderMyAccountTab(content);
  else await renderNotifsTab(content);
};

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
  </div>
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
async function renderSchoolTab(el) {
  const school = (await db.list('settings', 'select=*&key=eq.school'))[0]?.value || {};
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow p-5 max-w-xl">
    <h3 class="font-bold text-gray-700 mb-4">Informations de l'école (affichées sur les bulletins)</h3>
    <form onsubmit="saveSchoolSettings(event)">
      <label class="${lblCls}">Nom de l'école</label><input id="sc-name" value="${esc(school.name||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Adresse</label><input id="sc-address" value="${esc(school.address||'')}" class="${inputCls} mb-3">
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="${lblCls}">Téléphone</label><input id="sc-phone" value="${esc(school.phone||'')}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Email</label><input id="sc-email" value="${esc(school.email||'')}" class="${inputCls}"></div>
      </div>
      <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
    </form>
  </div>`;
}

async function saveSchoolSettings(e) {
  e.preventDefault();
  try {
    await db.update('settings', 'school', { value: { name: formVal('sc-name'), address: formVal('sc-address'), phone: formVal('sc-phone'), email: formVal('sc-email') } });
    toast('Paramètres enregistrés');
  } catch (err) { toast('Erreur', 'error'); }
}

// ---- Mon compte (admin : modifier email / mot de passe) ----
async function renderMyAccountTab(el) {
  const u = App.user || {};
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow p-5 max-w-xl">
    <h3 class="font-bold text-gray-700 mb-1"><i class="fas fa-user-shield text-blue-600 mr-2"></i>Mon compte administrateur</h3>
    <p class="text-xs text-gray-500 mb-4">Modifiez votre email de connexion et/ou votre mot de passe. Le mot de passe actuel est requis pour toute modification.</p>
    <form onsubmit="saveMyAccount(event)">
      <label class="${lblCls}">Nom</label>
      <input id="acc-name" value="${esc(u.name||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Email de connexion</label>
      <input id="acc-email" type="email" value="${esc(u.email||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label>
      <input id="acc-phone" value="${esc(u.phone||'')}" class="${inputCls} mb-4" placeholder="+216 ...">
      <div class="border-t pt-4 mb-4">
        <label class="${lblCls}">Nouveau mot de passe <span class="text-gray-400 font-normal">(laisser vide pour ne pas changer)</span></label>
        <input id="acc-newpass" type="password" class="${inputCls} mb-3" autocomplete="new-password" minlength="6" placeholder="Minimum 6 caractères">
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
  const row = (key, label) => `
    <div class="flex items-center justify-between border-b py-3">
      <span class="text-sm font-medium">${label}</span>
      <div class="flex gap-4 text-sm">
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-email_${key}" ${prefs['email_'+key]!==false?'checked':''}> <i class="fas fa-envelope text-blue-500"></i> Email</label>
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-sms_${key}" ${prefs['sms_'+key]===true?'checked':''}> <i class="fas fa-comment-sms text-green-500"></i> SMS</label>
        <label class="flex items-center gap-1"><input type="checkbox" id="nf-telegram_${key}" ${prefs['telegram_'+key]!==false?'checked':''}> <i class="fab fa-telegram text-sky-500"></i> Telegram</label>
      </div>
    </div>`;
  let tg = { configured: false, linked: 0, bot: null };
  try { tg = (await api.get('/telegram/status')).data; } catch {}
  el.innerHTML = `
  <div class="bg-white rounded-xl shadow p-5 max-w-xl">
    <h3 class="font-bold text-gray-700 mb-2">Notifications automatiques aux tuteurs</h3>
    <p class="text-xs text-gray-400 mb-4">Email : clé API Resend (configurée ✅). Telegram : gratuit et illimité — les parents se lient au bot avec leur numéro. SMS : nécessite Twilio (payant, optionnel).</p>
    ${row('absence', 'Absence / Retard')}
    ${row('frais', 'Frais impayés (relance)')}
    ${row('note', 'Nouvelle note')}
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
  </div>`;
}

async function saveNotifSettings() {
  const value = {};
  for (const key of ['absence','frais','note']) {
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
