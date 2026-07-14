/* ============================================================
   EduManage - Vues : Notes & Bulletins PDF, Frais, Cours, Interactifs
   ============================================================ */

// ================= NOTES & BULLETINS =================
VIEWS.grades = async function(el) {
  const trimester = App.cache.gradeTrim || 1;
  const selStudent = App.cache.gradeStudent || '';
  const scoped = isParentOrStudent();
  const students = await db.list('students', 'select=id,first_name,last_name,level,class_name,birth_date&order=last_name.asc');
  const sid = selStudent || (students[0]?.id ?? '');
  let grades = [];
  if (sid) grades = await db.list('grades', `select=*,subjects(name,coefficient)&student_id=eq.${sid}&trimester=eq.${trimester}&order=created_at.desc`);
  const student = students.find(s => s.id == sid);

  el.innerHTML = pageHeader('Notes & Bulletins', 'fa-star', isStaff() && sid ? `
    <button onclick="exportGradesExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Export notes classe</button>
    <button onclick="showGradeForm(${sid})" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvelle note</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <select onchange="App.cache.gradeStudent=this.value; render()" class="${inputCls} max-w-xs">
      ${students.map(s => `<option value="${s.id}" ${s.id==sid?'selected':''}>${esc(fullName(s))} (${s.level})</option>`).join('')}
    </select>
    <div class="flex gap-1">
      ${[1,2,3].map(t => `<button onclick="App.cache.gradeTrim=${t}; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${trimester==t?'bg-blue-600 text-white':'border text-gray-600 hover:bg-gray-50'}">Trimestre ${t}</button>`).join('')}
    </div>
    ${sid ? `<button onclick="downloadBulletinPDF(${sid}, ${trimester})" class="${btnSecondary} ml-auto"><i class="fas fa-file-pdf text-red-600 mr-1"></i> Télécharger Bulletin PDF</button>` : ''}
  </div>
  ${student ? `
  <div class="bg-white rounded-xl shadow overflow-x-auto mb-4">
    <table class="data-table w-full">
      <thead><tr><th>Matière</th><th>Type</th><th>Note</th><th>Commentaire</th><th>Date</th>${isStaff()?'<th class="text-right">Actions</th>':''}</tr></thead>
      <tbody>
        ${grades.map(g => `<tr>
          <td class="font-semibold">${esc(g.subjects?.name||'-')} <span class="text-xs text-gray-400">(coef ${g.subjects?.coefficient||1})</span></td>
          <td><span class="badge badge-gray">${ {controle:'Contrôle',synthese:'Synthèse',oral:'Oral'}[g.exam_type]||g.exam_type }</span></td>
          <td><b class="${Number(g.score)/Number(g.max_score||20)*20 >= 10 ? 'text-green-600':'text-red-600'}">${g.score}/${g.max_score}</b></td>
          <td class="text-xs text-gray-500">${esc(g.comment||'')}</td>
          <td class="text-xs">${fmtDate(g.created_at)}</td>
          ${isStaff() ? `<td class="text-right whitespace-nowrap">
            <button onclick="showGradeForm(${sid}, ${g.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteGrade(${g.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>` : ''}
        </tr>`).join('') || `<tr><td colspan="6" class="text-center py-8 text-gray-400">Aucune note pour le trimestre ${trimester}</td></tr>`}
      </tbody>
    </table>
  </div>
  <div id="bulletin-preview" class="bg-white rounded-xl shadow p-5"></div>` : '<p class="text-gray-400">Aucun élève</p>'}`;

  if (sid) renderBulletinPreview(sid, trimester);
};

async function renderBulletinPreview(sid, trimester) {
  const el = document.getElementById('bulletin-preview');
  if (!el) return;
  try {
    const b = (await api.get(`/bulletin/${sid}?trimester=${trimester}`)).data;
    App.cache.lastBulletin = b;
    el.innerHTML = `
      <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-file-lines text-blue-600 mr-2"></i>Aperçu du bulletin — Trimestre ${trimester}</h3>
      ${b.subjects.length ? `
      <table class="data-table w-full mb-3">
        <thead><tr><th>Matière</th><th>Coef</th><th>Moyenne /20</th><th>Observations</th></tr></thead>
        <tbody>${b.subjects.map(s => `<tr>
          <td class="font-semibold">${esc(s.name)}</td><td>${s.coefficient}</td>
          <td><b class="${s.average>=10?'text-green-600':'text-red-600'}">${s.average.toFixed(2)}</b></td>
          <td class="text-xs text-gray-500">${esc(s.comments.join(' • '))}</td>
        </tr>`).join('')}</tbody>
      </table>
      <div class="text-right text-lg"><b>Moyenne générale : <span class="${b.generalAverage>=10?'text-green-600':'text-red-600'}">${b.generalAverage.toFixed(2)}/20</span></b></div>`
      : '<p class="text-gray-400 text-sm">Aucune note saisie pour ce trimestre.</p>'}`;
  } catch { el.innerHTML = ''; }
}

async function showGradeForm(studentId, gradeId) {
  const subjects = await db.list('subjects', 'select=*&order=name.asc');
  let g = {};
  if (gradeId) g = (await db.list('grades', `select=*&id=eq.${gradeId}`))[0] || {};
  openModal(`<i class="fas fa-star text-blue-600 mr-2"></i>${gradeId?'Modifier':'Nouvelle'} note`, `
    <form onsubmit="saveGrade(event, ${studentId}, ${gradeId||'null'})">
      <label class="${lblCls}">Matière *</label>
      <select id="gr-subject" class="${inputCls} mb-3">
        ${subjects.map(s => `<option value="${s.id}" ${s.id==g.subject_id?'selected':''}>${esc(s.name)} (${CYCLE_LABELS[s.cycle]||s.cycle}, coef ${s.coefficient})</option>`).join('')}
      </select>
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div><label class="${lblCls}">Note *</label><input id="gr-score" type="number" step="0.25" min="0" required value="${g.score??''}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Sur</label><input id="gr-max" type="number" value="${g.max_score||20}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Trimestre</label><select id="gr-trim" class="${inputCls}">${[1,2,3].map(t=>`<option value="${t}" ${(g.trimester||App.cache.gradeTrim||1)==t?'selected':''}>T${t}</option>`).join('')}</select></div>
      </div>
      <label class="${lblCls}">Type d'examen</label>
      <select id="gr-type" class="${inputCls} mb-3">
        <option value="controle" ${g.exam_type==='controle'?'selected':''}>Contrôle</option>
        <option value="synthese" ${g.exam_type==='synthese'?'selected':''}>Synthèse</option>
        <option value="oral" ${g.exam_type==='oral'?'selected':''}>Oral</option>
      </select>
      <label class="${lblCls}">Commentaire de l'enseignant</label>
      <textarea id="gr-comment" rows="2" class="${inputCls} mb-4">${esc(g.comment||'')}</textarea>
      <p class="text-xs text-gray-400 mb-3"><i class="fas fa-bell mr-1"></i>Une notification sera envoyée automatiquement au tuteur.</p>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveGrade(e, studentId, gradeId) {
  e.preventDefault();
  const data = {
    student_id: studentId, subject_id: Number(formVal('gr-subject')), score: Number(formVal('gr-score')),
    max_score: Number(formVal('gr-max')) || 20, trimester: Number(formVal('gr-trim')),
    exam_type: formVal('gr-type'), comment: formVal('gr-comment') || null
  };
  try {
    if (gradeId) await db.update('grades', gradeId, data); else await db.create('grades', data);
    closeModal(); toast('Note enregistrée' + (gradeId ? '' : ' + notification envoyée')); render();
  } catch (err) { toast('Erreur', 'error'); }
}
function deleteGrade(id) {
  confirmDelete('Supprimer cette note ?', async () => { await db.remove('grades', id); toast('Note supprimée'); render(); });
}

// ---- Bulletin PDF (jsPDF) ----
async function downloadBulletinPDF(sid, trimester) {
  const b = (await api.get(`/bulletin/${sid}?trimester=${trimester}`)).data;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const school = b.school || {};
  const s = b.student;

  // En-tête école
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text(school.name || 'EduManage - École Tunisienne', 105, 13, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`${school.address || ''}  •  ${school.phone || ''}  •  ${school.email || ''}`, 105, 20, { align: 'center' });
  doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text(`BULLETIN SCOLAIRE — Trimestre ${b.trimester}`, 105, 28, { align: 'center' });

  // Infos élève
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  let y = 42;
  doc.text(`Élève : ${s.first_name} ${s.last_name}`, 14, y);
  doc.text(`Niveau : ${LEVEL_LABELS[s.level] || s.level}`, 110, y);
  y += 6;
  doc.text(`Classe : ${s.class_name || '-'}`, 14, y);
  doc.text(`Date de naissance : ${s.birth_date ? dayjs(s.birth_date).format('DD/MM/YYYY') : '-'}`, 110, y);
  y += 6;
  doc.text(`Année scolaire : ${dayjs().year()}-${dayjs().year()+1}`, 14, y);

  // Tableau des notes
  doc.autoTable({
    startY: y + 6,
    head: [['Matière', 'Coefficient', 'Moyenne /20', 'Observations']],
    body: b.subjects.map(su => [su.name, String(su.coefficient), su.average.toFixed(2), su.comments.join(' • ') || '-']),
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5 },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center', fontStyle: 'bold' } }
  });

  let fy = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont(undefined, 'bold');
  doc.setFillColor(240, 245, 255);
  doc.rect(120, fy - 6, 76, 10, 'F');
  doc.text(`Moyenne générale : ${b.generalAverage.toFixed(2)} / 20`, 124, fy);

  fy += 18;
  doc.setFontSize(10); doc.setFont(undefined, 'normal');
  const mention = b.generalAverage >= 16 ? 'Très bien' : b.generalAverage >= 14 ? 'Bien' : b.generalAverage >= 12 ? 'Assez bien' : b.generalAverage >= 10 ? 'Passable' : 'Insuffisant';
  doc.text(`Mention : ${mention}`, 14, fy);

  fy += 20;
  doc.line(14, fy, 70, fy);
  doc.line(140, fy, 196, fy);
  doc.setFontSize(8);
  doc.text('Signature du directeur', 14, fy + 5);
  doc.text('Signature du parent/tuteur', 140, fy + 5);

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Document généré le ${dayjs().format('DD/MM/YYYY HH:mm')} — EduManage`, 105, 290, { align: 'center' });

  doc.save(`bulletin_${s.last_name}_${s.first_name}_T${trimester}.pdf`);
  toast('Bulletin PDF téléchargé');
}

// ---- Export notes classe (Excel) ----
async function exportGradesExcel() {
  const trimester = App.cache.gradeTrim || 1;
  const grades = await db.list('grades', `select=*,subjects(name),students(first_name,last_name,level)&trimester=eq.${trimester}&order=student_id.asc`);
  const rows = grades.map(g => ({
    'Élève': g.students ? `${g.students.first_name} ${g.students.last_name}` : g.student_id,
    'Niveau': g.students?.level || '', 'Matière': g.subjects?.name || '',
    'Trimestre': g.trimester, 'Type': g.exam_type, 'Note': Number(g.score), 'Sur': Number(g.max_score),
    'Commentaire': g.comment || ''
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Notes T${trimester}`);
  XLSX.writeFile(wb, `notes_T${trimester}_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  toast('Export des notes téléchargé');
}

// ================= FRAIS =================
VIEWS.fees = async function(el) {
  const filterStatus = App.cache.feeStatus || '';
  let qs = 'select=*,students(first_name,last_name,level)&order=due_date.asc';
  if (filterStatus) qs += `&status=eq.${filterStatus}`;
  const fees = await db.list('fees', qs);
  const totals = { paid: 0, pending: 0, overdue: 0 };
  fees.forEach(f => totals[f.status] = (totals[f.status]||0) + Number(f.amount));

  el.innerHTML = pageHeader("Frais d'inscription & paiements", 'fa-money-bill-wave', isStaff() ? `
    <button onclick="exportFeesExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Rapport paiements</button>
    <button onclick="checkOverdueFees()" class="${btnSecondary}"><i class="fas fa-bell mr-1"></i> Relancer impayés</button>
    <button onclick="showFeeForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau frais</button>` : '') + `
  <section class="grid grid-cols-3 gap-4 mb-4">
    ${statCard('fa-circle-check','green','Payé', totals.paid + ' DT')}
    ${statCard('fa-hourglass-half','blue','En attente', (totals.pending||0) + ' DT')}
    ${statCard('fa-triangle-exclamation','red','En retard', (totals.overdue||0) + ' DT')}
  </section>
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center">
    <select onchange="App.cache.feeStatus=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les statuts</option>
      <option value="paid" ${filterStatus==='paid'?'selected':''}>Payé</option>
      <option value="pending" ${filterStatus==='pending'?'selected':''}>En attente</option>
      <option value="overdue" ${filterStatus==='overdue'?'selected':''}>En retard</option>
    </select>
    <span class="text-sm text-gray-500 ml-auto">${fees.length} frais</span>
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto">
    <table class="data-table w-full">
      <thead><tr><th>Élève</th><th>Libellé</th><th>Montant</th><th>Échéance</th><th>Statut</th><th>Payé le</th>${isStaff()?'<th class="text-right">Actions</th>':''}</tr></thead>
      <tbody>
        ${fees.map(f => `<tr>
          <td class="font-semibold">${f.students ? esc(`${f.students.first_name} ${f.students.last_name}`) : '-'} <span class="text-xs text-gray-400">${f.students?.level||''}</span></td>
          <td>${esc(f.label)}</td>
          <td><b>${Number(f.amount)} DT</b></td>
          <td>${fmtDate(f.due_date)}</td>
          <td><span class="badge ${ {paid:'badge-green',pending:'badge-blue',overdue:'badge-red'}[f.status] }">${ {paid:'Payé',pending:'En attente',overdue:'En retard'}[f.status] }</span></td>
          <td>${fmtDate(f.paid_date)} ${f.method ? `<span class="text-xs text-gray-400">(${f.method})</span>` : ''}</td>
          ${isStaff() ? `<td class="text-right whitespace-nowrap">
            ${f.status !== 'paid' ? `<button onclick="markFeePaid(${f.id})" class="text-green-600 px-1" title="Marquer payé"><i class="fas fa-circle-check"></i></button>` : ''}
            <button onclick="showFeeForm(${f.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteFee(${f.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>` : ''}
        </tr>`).join('') || '<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucun frais</td></tr>'}
      </tbody>
    </table>
  </div>`;
  App.cache.feesList = fees;
};

async function showFeeForm(id) {
  const students = await db.list('students', 'select=id,first_name,last_name,level&order=last_name.asc');
  let f = {};
  if (id) f = (await db.list('fees', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-money-bill text-blue-600 mr-2"></i>${id?'Modifier':'Nouveau'} frais`, `
    <form onsubmit="saveFee(event, ${id||'null'})">
      <label class="${lblCls}">Élève *</label>
      <select id="fe-student" class="${inputCls} mb-3">
        ${students.map(s => `<option value="${s.id}" ${s.id==f.student_id?'selected':''}>${esc(fullName(s))} (${s.level})</option>`).join('')}
      </select>
      <label class="${lblCls}">Libellé *</label>
      <input id="fe-label" required value="${esc(f.label||"Frais d'inscription")}" class="${inputCls} mb-3">
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Montant (DT) *</label><input id="fe-amount" type="number" step="0.5" required value="${f.amount??''}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Échéance</label><input id="fe-due" type="date" value="${f.due_date||''}" class="${inputCls}"></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div><label class="${lblCls}">Statut</label>
        <select id="fe-status" class="${inputCls}">
          <option value="pending" ${f.status==='pending'?'selected':''}>En attente</option>
          <option value="paid" ${f.status==='paid'?'selected':''}>Payé</option>
          <option value="overdue" ${f.status==='overdue'?'selected':''}>En retard</option>
        </select></div>
        <div><label class="${lblCls}">Méthode de paiement</label>
        <select id="fe-method" class="${inputCls}">
          <option value="">-</option>
          <option value="especes" ${f.method==='especes'?'selected':''}>Espèces</option>
          <option value="cheque" ${f.method==='cheque'?'selected':''}>Chèque</option>
          <option value="virement" ${f.method==='virement'?'selected':''}>Virement</option>
        </select></div>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveFee(e, id) {
  e.preventDefault();
  const status = formVal('fe-status');
  const data = {
    student_id: Number(formVal('fe-student')), label: formVal('fe-label'), amount: Number(formVal('fe-amount')),
    due_date: formVal('fe-due') || null, status, method: formVal('fe-method') || null,
    paid_date: status === 'paid' ? dayjs().format('YYYY-MM-DD') : null
  };
  try {
    if (id) await db.update('fees', id, data); else await db.create('fees', data);
    closeModal(); toast('Frais enregistré'); render();
  } catch (err) { toast('Erreur', 'error'); }
}

async function markFeePaid(id) {
  try {
    await db.update('fees', id, { status: 'paid', paid_date: dayjs().format('YYYY-MM-DD') });
    toast('Paiement enregistré'); render();
  } catch (e) { toast('Erreur', 'error'); }
}
function deleteFee(id) {
  confirmDelete('Supprimer ce frais ?', async () => { await db.remove('fees', id); toast('Supprimé'); render(); });
}

async function exportFeesExcel() {
  const fees = App.cache.feesList || await db.list('fees', 'select=*,students(first_name,last_name,level)');
  const rows = fees.map(f => ({
    'Élève': f.students ? `${f.students.first_name} ${f.students.last_name}` : '', 'Niveau': f.students?.level || '',
    'Libellé': f.label, 'Montant (DT)': Number(f.amount), 'Échéance': f.due_date || '',
    'Statut': { paid:'Payé', pending:'En attente', overdue:'En retard' }[f.status], 'Payé le': f.paid_date || '', 'Méthode': f.method || ''
  }));
  // Feuille récap
  const byStudent = {};
  fees.forEach(f => {
    const k = f.students ? `${f.students.first_name} ${f.students.last_name}` : String(f.student_id);
    byStudent[k] = byStudent[k] || { 'Élève': k, 'Payé (DT)': 0, 'En attente (DT)': 0, 'En retard (DT)': 0 };
    const col = { paid:'Payé (DT)', pending:'En attente (DT)', overdue:'En retard (DT)' }[f.status];
    byStudent[k][col] += Number(f.amount);
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Détail');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.values(byStudent)), 'Récap par élève');
  XLSX.writeFile(wb, `frais_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  toast('Rapport de paiements téléchargé');
}

// ================= COURS & DOCUMENTS =================
VIEWS.courses = async function(el) {
  const level = App.cache.courseLevel || '';
  let qs = 'select=*,subjects(name),teachers(first_name,last_name)&order=created_at.desc';
  if (level) qs += `&level=eq.${level}`;
  const courses = await db.list('courses', qs);

  el.innerHTML = pageHeader('Cours & Documents', 'fa-book-open', isStaff() ? `<button onclick="showCourseForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau cours</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center">
    <select onchange="App.cache.courseLevel=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les niveaux</option>${levelOptions(level)}
    </select>
    <span class="text-sm text-gray-500 ml-auto">${courses.length} document(s)</span>
  </div>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${courses.map(cr => `
    <article class="bg-white rounded-xl shadow p-5 flex flex-col">
      <div class="flex items-start justify-between">
        <i class="fas ${fileIcon(cr.file_type)} text-3xl"></i>
        ${isStaff() ? `<div>
          <button onclick="showCourseForm(${cr.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
          <button onclick="deleteCourse(${cr.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
      <h3 class="font-bold text-gray-800 mt-3">${esc(cr.title)}</h3>
      <p class="text-xs text-gray-500 mt-1 flex-1">${esc(cr.description||'')}</p>
      <div class="flex gap-2 mt-3 flex-wrap">
        ${cr.level ? `<span class="badge badge-blue">${esc(LEVEL_LABELS[cr.level]||cr.level)}</span>` : ''}
        ${cr.subjects ? `<span class="badge badge-purple">${esc(cr.subjects.name)}</span>` : ''}
      </div>
      <div class="text-xs text-gray-400 mt-2">${cr.teachers ? `Par ${esc(cr.teachers.first_name)} ${esc(cr.teachers.last_name)} • ` : ''}${fmtDate(cr.created_at)}</div>
      ${cr.file_url ? `<a href="${esc(cr.file_url)}" target="_blank" class="${btnPrimary} mt-3 text-center"><i class="fas fa-download mr-1"></i> Télécharger ${esc(cr.file_name||'')}</a>` : ''}
    </article>`).join('') || '<p class="text-gray-400 col-span-3 text-center py-10">Aucun cours disponible</p>'}
  </div>`;
};

function fileIcon(type) {
  if (!type) return 'fa-file text-gray-400';
  if (type.includes('pdf')) return 'fa-file-pdf text-red-500';
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'fa-file-excel text-green-600';
  if (type.includes('word') || type.includes('document')) return 'fa-file-word text-blue-600';
  if (type.includes('presentation') || type.includes('powerpoint')) return 'fa-file-powerpoint text-orange-500';
  if (type.includes('image')) return 'fa-file-image text-purple-500';
  if (type.includes('video')) return 'fa-file-video text-pink-500';
  return 'fa-file text-gray-400';
}

async function showCourseForm(id) {
  const [subjects, teachers] = await Promise.all([
    db.list('subjects', 'select=*&order=name.asc'),
    db.list('teachers', 'select=id,first_name,last_name&order=last_name.asc')
  ]);
  let cr = {};
  if (id) cr = (await db.list('courses', `select=*&id=eq.${id}`))[0] || {};
  openModal(`<i class="fas fa-book-open text-blue-600 mr-2"></i>${id?'Modifier':'Nouveau'} cours`, `
    <form onsubmit="saveCourse(event, ${id||'null'})">
      <label class="${lblCls}">Titre *</label><input id="co-title" required value="${esc(cr.title||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Description</label><textarea id="co-desc" rows="2" class="${inputCls} mb-3">${esc(cr.description||'')}</textarea>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Niveau</label><select id="co-level" class="${inputCls}"><option value="">Tous</option>${levelOptions(cr.level)}</select></div>
        <div><label class="${lblCls}">Matière</label><select id="co-subject" class="${inputCls}"><option value="">-</option>${subjects.map(s=>`<option value="${s.id}" ${s.id==cr.subject_id?'selected':''}>${esc(s.name)} (${s.cycle})</option>`).join('')}</select></div>
      </div>
      <label class="${lblCls}">Enseignant</label>
      <select id="co-teacher" class="${inputCls} mb-3"><option value="">-</option>${teachers.map(t=>`<option value="${t.id}" ${t.id==cr.teacher_id?'selected':''}>${esc(t.first_name)} ${esc(t.last_name)}</option>`).join('')}</select>
      <label class="${lblCls}">Fichier (PDF, Excel, Word, PowerPoint, image...)</label>
      <input id="co-file" type="file" class="${inputCls} mb-1 text-xs" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,image/*,video/*">
      ${cr.file_name ? `<p class="text-xs text-gray-400 mb-3">Fichier actuel : ${esc(cr.file_name)}</p>` : '<div class="mb-3"></div>'}
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

async function saveCourse(e, id) {
  e.preventDefault();
  const level = formVal('co-level');
  const data = {
    title: formVal('co-title'), description: formVal('co-desc') || null,
    level: level || null, cycle: level ? cycleOfLevel(level) : 'primaire',
    subject_id: formVal('co-subject') ? Number(formVal('co-subject')) : null,
    teacher_id: formVal('co-teacher') ? Number(formVal('co-teacher')) : null
  };
  try {
    const file = document.getElementById('co-file').files[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) { toast('Fichier trop volumineux (max 8 Mo)', 'error'); return; }
      toast('Envoi du fichier...', 'info');
      const up = await uploadFile('courses', file);
      data.file_url = up.url; data.file_name = file.name; data.file_type = file.type;
    }
    if (id) await db.update('courses', id, data); else await db.create('courses', data);
    closeModal(); toast('Cours enregistré'); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
function deleteCourse(id) {
  confirmDelete('Supprimer ce cours ?', async () => { await db.remove('courses', id); toast('Supprimé'); render(); });
}

// ================= COURS INTERACTIFS (QUIZ) =================
VIEWS.interactive = async function(el) {
  const level = App.cache.icLevel || '';
  let qs = 'select=*,subjects(name)&order=created_at.desc';
  if (level) qs += `&level=eq.${level}`;
  const ics = await db.list('interactive_courses', qs);

  el.innerHTML = pageHeader('Cours interactifs', 'fa-gamepad', isStaff() ? `<button onclick="showInteractiveForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau quiz</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center">
    <select onchange="App.cache.icLevel=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les niveaux</option>${levelOptions(level)}
    </select>
  </div>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${ics.map(ic => `
    <article class="bg-white rounded-xl shadow p-5">
      <div class="flex items-start justify-between">
        <i class="fas fa-gamepad text-3xl text-purple-500"></i>
        ${isStaff() ? `<div>
          <button onclick="showInteractiveForm(${ic.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
          <button onclick="deleteInteractive(${ic.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
      <h3 class="font-bold text-gray-800 mt-3">${esc(ic.title)}</h3>
      <p class="text-xs text-gray-500 mt-1">${esc(ic.description||'')}</p>
      <div class="flex gap-2 mt-3 flex-wrap">
        ${ic.level ? `<span class="badge badge-blue">${esc(LEVEL_LABELS[ic.level]||ic.level)}</span>` : ''}
        ${ic.subjects ? `<span class="badge badge-purple">${esc(ic.subjects.name)}</span>` : ''}
        <span class="badge badge-gray">${(ic.questions||[]).length} question(s)</span>
      </div>
      <button onclick="playQuiz(${ic.id})" class="${btnPrimary} w-full mt-4"><i class="fas fa-play mr-1"></i> Commencer le quiz</button>
    </article>`).join('') || '<p class="text-gray-400 col-span-3 text-center py-10">Aucun cours interactif</p>'}
  </div>`;
  App.cache.icsList = ics;
};

async function showInteractiveForm(id) {
  const subjects = await db.list('subjects', 'select=*&order=name.asc');
  let ic = { questions: [] };
  if (id) ic = (await db.list('interactive_courses', `select=*&id=eq.${id}`))[0] || { questions: [] };
  App.cache.editingQuestions = JSON.parse(JSON.stringify(ic.questions || []));
  openModal(`<i class="fas fa-gamepad text-purple-600 mr-2"></i>${id?'Modifier':'Nouveau'} cours interactif`, `
    <form onsubmit="saveInteractive(event, ${id||'null'})">
      <label class="${lblCls}">Titre *</label><input id="ic-title" required value="${esc(ic.title||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Description</label><textarea id="ic-desc" rows="2" class="${inputCls} mb-3">${esc(ic.description||'')}</textarea>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Niveau</label><select id="ic-level" class="${inputCls}"><option value="">Tous</option>${levelOptions(ic.level)}</select></div>
        <div><label class="${lblCls}">Matière</label><select id="ic-subject" class="${inputCls}"><option value="">-</option>${subjects.map(s=>`<option value="${s.id}" ${s.id==ic.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      </div>
      <div class="border-t pt-3">
        <div class="flex items-center justify-between mb-2">
          <label class="${lblCls} mb-0">Questions du quiz</label>
          <button type="button" onclick="addQuizQuestion()" class="text-blue-600 text-sm"><i class="fas fa-plus mr-1"></i>Ajouter</button>
        </div>
        <div id="quiz-questions" class="space-y-3 max-h-72 overflow-y-auto"></div>
      </div>
      <div class="flex justify-end gap-3 mt-4">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`, { wide: true });
  renderQuizQuestions();
}

function renderQuizQuestions() {
  const qs = App.cache.editingQuestions || [];
  document.getElementById('quiz-questions').innerHTML = qs.map((q, i) => `
    <div class="border rounded-lg p-3 bg-gray-50">
      <div class="flex gap-2 items-center mb-2">
        <b class="text-xs">Q${i+1}</b>
        <input value="${esc(q.question||'')}" oninput="App.cache.editingQuestions[${i}].question=this.value" placeholder="Question..." class="${inputCls} flex-1">
        <button type="button" onclick="App.cache.editingQuestions.splice(${i},1); renderQuizQuestions()" class="text-red-500"><i class="fas fa-trash"></i></button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        ${[0,1,2,3].map(j => `
          <div class="flex items-center gap-1">
            <input type="radio" name="correct-${i}" ${q.correct==j?'checked':''} onchange="App.cache.editingQuestions[${i}].correct=${j}">
            <input value="${esc(q.options?.[j]||'')}" oninput="App.cache.editingQuestions[${i}].options=App.cache.editingQuestions[${i}].options||['','','',''];App.cache.editingQuestions[${i}].options[${j}]=this.value" placeholder="Réponse ${j+1}" class="${inputCls} text-xs">
          </div>`).join('')}
      </div>
    </div>`).join('') || '<p class="text-xs text-gray-400">Aucune question. Cliquez sur "Ajouter".</p>';
}

function addQuizQuestion() {
  App.cache.editingQuestions.push({ question: '', options: ['','','',''], correct: 0 });
  renderQuizQuestions();
}

async function saveInteractive(e, id) {
  e.preventDefault();
  const level = formVal('ic-level');
  const data = {
    title: formVal('ic-title'), description: formVal('ic-desc') || null,
    level: level || null, cycle: level ? cycleOfLevel(level) : 'primaire',
    subject_id: formVal('ic-subject') ? Number(formVal('ic-subject')) : null,
    questions: (App.cache.editingQuestions || []).filter(q => q.question.trim())
  };
  try {
    if (id) await db.update('interactive_courses', id, data); else await db.create('interactive_courses', data);
    closeModal(); toast('Cours interactif enregistré'); render();
  } catch (err) { toast('Erreur', 'error'); }
}
function deleteInteractive(id) {
  confirmDelete('Supprimer ce cours interactif ?', async () => { await db.remove('interactive_courses', id); toast('Supprimé'); render(); });
}

// ---- Lecture du quiz ----
function playQuiz(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic || !(ic.questions||[]).length) { toast('Ce quiz n\'a pas de questions', 'warning'); return; }
  App.cache.quiz = { ic, index: 0, score: 0 };
  renderQuizStep();
}

function renderQuizStep() {
  const { ic, index, score } = App.cache.quiz;
  const qs = ic.questions;
  if (index >= qs.length) {
    const pct = Math.round(score / qs.length * 100);
    openModal(`<i class="fas fa-trophy text-amber-500 mr-2"></i>Résultat`, `
      <div class="text-center py-4">
        <div class="text-5xl mb-3">${pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '📚'}</div>
        <div class="text-3xl font-bold ${pct>=50?'text-green-600':'text-red-600'}">${score} / ${qs.length}</div>
        <p class="text-gray-500 mt-2">${pct >= 80 ? 'Excellent travail !' : pct >= 50 ? 'Bien, continuez vos efforts !' : 'Il faut réviser encore un peu.'}</p>
        <button onclick="playQuiz(${ic.id})" class="${btnPrimary} mt-4 mr-2"><i class="fas fa-rotate-right mr-1"></i> Rejouer</button>
        <button onclick="closeModal()" class="${btnSecondary} mt-4">Fermer</button>
      </div>`);
    return;
  }
  const q = qs[index];
  openModal(`<i class="fas fa-gamepad text-purple-600 mr-2"></i>${esc(ic.title)} — Question ${index+1}/${qs.length}`, `
    <div class="mb-2 h-2 bg-gray-200 rounded-full"><div class="h-2 bg-purple-500 rounded-full" style="width:${index/qs.length*100}%"></div></div>
    <h4 class="text-lg font-bold text-gray-800 my-4">${esc(q.question)}</h4>
    <div class="space-y-2">
      ${(q.options||[]).filter(o=>o.trim()).map((o, j) => `
        <button onclick="answerQuiz(${j})" class="w-full text-left border rounded-lg px-4 py-3 hover:bg-purple-50 hover:border-purple-300 text-sm font-medium">${String.fromCharCode(65+j)}. ${esc(o)}</button>`).join('')}
    </div>`);
}

function answerQuiz(j) {
  const { ic, index } = App.cache.quiz;
  const correct = ic.questions[index].correct;
  if (j === correct) { App.cache.quiz.score++; toast('Bonne réponse ! ✅'); }
  else toast(`Faux. La bonne réponse était : ${ic.questions[index].options[correct]}`, 'error');
  App.cache.quiz.index++;
  setTimeout(renderQuizStep, 600);
}
