/* ============================================================
   Rahma Academy - Vues : Notes & Bulletins PDF, Frais, Cours, Interactifs
   ============================================================ */

// ================= NOTES & BULLETINS =================
VIEWS.grades = async function(el) {
  const trimester = App.cache.gradeTrim || 1;
  const selStudent = App.cache.gradeStudent || '';
  const scoped = isParentOrStudent();
  const students = await db.list('students', 'select=id,first_name,last_name,level,class_name,birth_date&order=last_name.asc');
  const sid = selStudent || (students[0]?.id ?? '');
  let grades = [];
  if (sid) {
    try {
      grades = await db.list('grades', `select=*,subjects(name,coefficient),teachers(first_name,last_name,subject)&student_id=eq.${sid}&trimester=eq.${trimester}&order=created_at.desc`);
    } catch (e) {
      // Migration 0004 non appliquée : pas de colonne teacher_id
      grades = await db.list('grades', `select=*,subjects(name,coefficient)&student_id=eq.${sid}&trimester=eq.${trimester}&order=created_at.desc`);
    }
  }
  const student = students.find(s => s.id == sid);

  el.innerHTML = pageHeader('Notes & Bulletins', 'fa-star', isStaff() && sid ? `
    <button onclick="showSignatureTracking()" class="${btnSecondary}"><i class="fas fa-file-signature text-blue-600 mr-1"></i> Suivi signatures</button>
    <button onclick="exportGradesExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Export notes classe</button>
    <button onclick="openImport('grades')" class="${btnSecondary}"><i class="fas fa-file-import text-blue-600 mr-1"></i> Importer notes</button>
    <button onclick="showGradeForm(${sid})" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvelle note</button>` : '') + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <select onchange="App.cache.gradeStudent=this.value; render()" class="${inputCls} max-w-xs">
      ${students.map(s => `<option value="${s.id}" ${s.id==sid?'selected':''}>${esc(fullName(s))} (${s.level})</option>`).join('')}
    </select>
    <div class="flex gap-1">
      ${[1,2,3].map(t => `<button onclick="App.cache.gradeTrim=${t}; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${trimester==t?'bg-blue-600 text-white':'border text-gray-600 hover:bg-gray-50'}">Trimestre ${t}</button>`).join('')}
    </div>
    ${sid ? `<button onclick="showProgress(${sid})" class="${btnSecondary} ml-auto"><i class="fas fa-chart-line text-blue-600 mr-1"></i> Progression</button>
    <button onclick="downloadBulletinPDF(${sid}, ${trimester})" class="${btnSecondary}"><i class="fas fa-file-pdf text-red-600 mr-1"></i> Télécharger Bulletin PDF</button>` : ''}
  </div>
  ${student ? `
  <div class="bg-white rounded-xl shadow overflow-x-auto mb-4">
    <table class="data-table w-full">
      <thead><tr><th>Matière</th><th>Enseignant</th><th>Type</th><th>Note</th><th>Commentaire</th><th>Date</th>${isStaff()?'<th class="text-right">Actions</th>':''}</tr></thead>
      <tbody>
        ${grades.map(g => `<tr>
          <td class="font-semibold">${esc(g.subjects?.name||'-')} <span class="text-xs text-gray-400">(coef ${g.subjects?.coefficient||1})</span></td>
          <td>${g.teachers ? `<span class="text-sm">${esc(g.teachers.first_name)} ${esc(g.teachers.last_name)}</span>${g.teachers.subject ? `<br><span class="badge badge-purple text-[10px]">${esc(g.teachers.subject)}</span>` : ''}` : '<span class="text-xs text-gray-400">—</span>'}</td>
          <td><span class="badge badge-gray">${ {controle:'Contrôle',synthese:'Synthèse',oral:'Oral',devoir1:'Devoir 1 · فرض 1',devoir2:'Devoir 2 · فرض 2',examen:'Examen · الاختبار'}[g.exam_type]||g.exam_type }</span></td>
          <td><b class="${Number(g.score)/Number(g.max_score||20)*20 >= 10 ? 'text-green-600':'text-red-600'}">${g.score}/${g.max_score}</b></td>
          <td class="text-xs text-gray-500">${esc(g.comment||'')}</td>
          <td class="text-xs">${fmtDate(g.created_at)}</td>
          ${isStaff() ? `<td class="text-right whitespace-nowrap">
            <button onclick="showGradeForm(${sid}, ${g.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteGrade(${g.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>` : ''}
        </tr>`).join('') || `<tr><td colspan="7" class="text-center py-8 text-gray-400">Aucune note pour le trimestre ${trimester}</td></tr>`}
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
      : '<p class="text-gray-400 text-sm">Aucune note saisie pour ce trimestre.</p>'}
      ${renderBulletinSignature(b, sid, trimester)}`;
  } catch { el.innerHTML = ''; }
}

// ---- Signature du bulletin par le parent (accusé de lecture) ----
function renderBulletinSignature(b, sid, trimester) {
  if (!b.signSupported) return isStaff() ? `<p class="text-xs text-gray-400 mt-3"><i class="fas fa-circle-info mr-1"></i>Signature parentale : exécutez <code>migrations/0011_bulletin_signatures.sql</code> pour activer l'accusé de lecture.</p>` : '';
  const sg = b.signature;
  if (sg) return `<div class="mt-4 border border-green-300 bg-green-50 rounded-lg p-3 text-sm" id="bulletin-signature">
    <div class="flex items-start gap-2"><i class="fas fa-file-signature text-green-600 text-xl mt-0.5"></i>
      <div><b class="text-green-800">Bulletin signé par le parent · تم توقيع الدفتر</b>
        <div class="text-xs text-gray-700 mt-1">Signé par <b>${esc(sg.signer_name || 'Parent')}</b>${sg.signer_email ? ` (${esc(sg.signer_email)})` : ''} le <b>${dayjs(sg.signed_at).format('DD/MM/YYYY à HH:mm')}</b> — moyenne au moment de la signature : <b>${Number(sg.general_average).toFixed(2)}/20</b> (${sg.grades_count} notes).</div>
        ${sg.comment ? `<div class="text-xs text-gray-600 mt-1 italic">« ${esc(sg.comment)} »</div>` : ''}
        <div class="text-[10px] text-gray-400 mt-1 break-all">Empreinte : ${esc(sg.fingerprint || '')}${b.fingerprint && sg.fingerprint && b.fingerprint !== sg.fingerprint ? ' <span class="text-amber-600 font-bold">⚠ des notes ont été modifiées depuis la signature</span>' : ''}</div>
      </div></div></div>`;
  if (b.canSign) return `<div class="mt-4 border border-blue-300 bg-blue-50 rounded-lg p-3 text-sm" id="bulletin-signature">
    <div class="flex items-start gap-2"><i class="fas fa-pen-nib text-blue-600 text-xl mt-0.5"></i>
      <div class="flex-1"><b class="text-blue-800">Accusé de lecture du bulletin · إشعار بالاطلاع</b>
        <p class="text-xs text-gray-700 mt-1">En signant, vous confirmez avoir pris connaissance des résultats du trimestre ${trimester}. La signature est horodatée et conservée par l'école.</p>
        <textarea id="sig-comment" class="${inputCls} text-xs mt-2" rows="2" placeholder="Remarque facultative pour l'école (ex. : demande de rendez-vous)"></textarea>
        <label class="flex items-center gap-2 text-xs mt-2"><input type="checkbox" id="sig-confirm"> J'ai lu le bulletin de mon enfant et j'en accuse réception.</label>
        <button onclick="signBulletin(${sid}, ${trimester})" class="${btnPrimary} text-sm mt-2" id="sig-btn"><i class="fas fa-signature mr-1"></i> Signer le bulletin</button>
      </div></div></div>`;
  if (App.user.role === 'parent') return '';
  return `<p class="text-xs text-amber-700 mt-3" id="bulletin-signature"><i class="fas fa-hourglass-half mr-1"></i>Bulletin non encore signé par le parent.</p>`;
}
async function signBulletin(sid, trimester) {
  if (!document.getElementById('sig-confirm').checked) return toast('Cochez la case de confirmation', 'error');
  const btn = document.getElementById('sig-btn'); btn.disabled = true;
  try {
    await api.post(`/bulletin/${sid}/sign`, { trimester, confirm: true, comment: document.getElementById('sig-comment').value });
    toast('Bulletin signé. Merci !');
    renderBulletinPreview(sid, trimester);
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); btn.disabled = false; }
}

async function showGradeForm(studentId, gradeId) {
  const subjects = await db.list('subjects', 'select=*&order=name.asc');
  let teachers = [];
  try { teachers = await db.list('teachers', 'select=id,first_name,last_name,subject&status=eq.actif&order=last_name.asc'); } catch (e) {}
  let g = {};
  if (gradeId) g = (await db.list('grades', `select=*&id=eq.${gradeId}`))[0] || {};
  const isAdmin = App.user.role === 'admin';
  openModal(`<i class="fas fa-star text-blue-600 mr-2"></i>${gradeId?'Modifier':'Nouvelle'} note`, `
    <form onsubmit="saveGrade(event, ${studentId}, ${gradeId||'null'})">
      <label class="${lblCls}">Matière *</label>
      <select id="gr-subject" class="${inputCls} mb-3" onchange="onGradeSubjectChange()">
        ${scopedSubjects(subjects).map(s => `<option value="${s.id}" data-coef="${s.coefficient}" ${s.id==g.subject_id?'selected':''}>${esc(s.name)} (${CYCLE_LABELS[s.cycle]||s.cycle})</option>`).join('')}
        ${isAdmin ? '<option value="__new__">➕ Nouvelle matière...</option>' : ''}
      </select>${!isAdmin && !scopedSubjects(subjects).length ? `<p class="text-xs text-red-600 -mt-2 mb-3"><i class="fas fa-lock mr-1"></i>Aucune matière ne vous est affectée.</p>` : ''}
      <div id="gr-new-subject" class="hidden grid grid-cols-2 gap-3 mb-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div><label class="${lblCls}">Nom de la nouvelle matière *</label><input id="gr-new-name" class="${inputCls}" placeholder="Ex : Informatique"></div>
        <div><label class="${lblCls}">Cycle</label><select id="gr-new-cycle" class="${inputCls}">
          <option value="primaire">Primaire</option>
          <option value="base">Base (Collège)</option>
          <option value="secondaire">Secondaire (Lycée)</option>
        </select></div>
      </div>
      <div class="grid grid-cols-4 gap-3 mb-3">
        <div><label class="${lblCls}">Note *</label><input id="gr-score" type="number" step="0.25" min="0" required value="${g.score??''}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Sur</label><input id="gr-max" type="number" value="${g.max_score||20}" class="${inputCls}"></div>
        <div><label class="${lblCls}">Coefficient *</label><input id="gr-coef" type="number" step="0.5" min="0.5" max="10" required class="${inputCls}" placeholder="Ex : 2"></div>
        <div><label class="${lblCls}">Trimestre</label><select id="gr-trim" class="${inputCls}">${[1,2,3].map(t=>`<option value="${t}" ${(g.trimester||App.cache.gradeTrim||1)==t?'selected':''}>T${t}</option>`).join('')}</select></div>
      </div>
      <p class="text-xs text-gray-400 mb-3 -mt-1"><i class="fas fa-info-circle mr-1"></i>Saisissez le coefficient de la matière : il sera appliqué à la matière (bulletins et moyennes).</p>
      <label class="${lblCls}">Type d'examen</label>
      <select id="gr-type" class="${inputCls} mb-3">
        <option value="controle" ${g.exam_type==='controle'?'selected':''}>Contrôle</option>
        <option value="synthese" ${g.exam_type==='synthese'?'selected':''}>Synthèse</option>
        <option value="oral" ${g.exam_type==='oral'?'selected':''}>Oral</option>
        <option value="devoir1" ${g.exam_type==='devoir1'?'selected':''}>Devoir 1 · فرض 1</option>
        <option value="devoir2" ${g.exam_type==='devoir2'?'selected':''}>Devoir 2 · فرض 2</option>
        <option value="examen" ${g.exam_type==='examen'?'selected':''}>Examen · الاختبار</option>
      </select>
      ${isAdmin && teachers.length ? `
      <label class="${lblCls}">Enseignant (mentionné sur la note côté parents)</label>
      <select id="gr-teacher" class="${inputCls} mb-3">
        <option value="">— Non précisé —</option>
        ${teachers.map(t => `<option value="${t.id}" ${t.id==g.teacher_id?'selected':''}>${esc(t.first_name)} ${esc(t.last_name)}${t.subject?' — '+esc(t.subject):''}</option>`).join('')}
      </select>` : ''}
      <label class="${lblCls}">Commentaire de l'enseignant</label>
      <textarea id="gr-comment" rows="2" class="${inputCls} mb-4">${esc(g.comment||'')}</textarea>
      <p class="text-xs text-gray-400 mb-3"><i class="fas fa-bell mr-1"></i>Une notification sera envoyée automatiquement au tuteur.</p>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}

// Affiche/masque le bloc "Nouvelle matière" (le coefficient reste à saisir manuellement, sans valeur par défaut)
function onGradeSubjectChange() {
  const sel = document.getElementById('gr-subject');
  const block = document.getElementById('gr-new-subject');
  const nameInput = document.getElementById('gr-new-name');
  if (!sel || !block) return;
  const isNew = sel.value === '__new__';
  block.classList.toggle('hidden', !isNew);
  if (nameInput) nameInput.required = isNew;
  if (isNew && nameInput) nameInput.focus();
}

async function saveGrade(e, studentId, gradeId) {
  e.preventDefault();
  const newCoef = Number(formVal('gr-coef'));
  if (!newCoef || newCoef <= 0) { toast('Veuillez saisir le coefficient', 'error'); return; }

  let subjectId;
  let coefMsg = '';
  try {
    if (formVal('gr-subject') === '__new__') {
      // Création d'une nouvelle matière directement depuis le formulaire de note
      const name = (formVal('gr-new-name') || '').trim();
      if (!name) { toast('Veuillez saisir le nom de la nouvelle matière', 'error'); return; }
      const created = await db.create('subjects', { name, cycle: formVal('gr-new-cycle'), coefficient: newCoef });
      subjectId = (Array.isArray(created) ? created[0] : created).id;
      coefMsg = ` (matière « ${name} » créée)`;
    } else {
      subjectId = Number(formVal('gr-subject'));
      // Appliquer le coefficient saisi à la matière s'il diffère
      const sel = document.getElementById('gr-subject');
      const oldCoef = Number(sel.options[sel.selectedIndex]?.dataset.coef || 0);
      if (newCoef !== oldCoef) { await db.update('subjects', subjectId, { coefficient: newCoef }); coefMsg = ' (coefficient mis à jour)'; }
    }

    const data = {
      student_id: studentId, subject_id: subjectId, score: Number(formVal('gr-score')),
      max_score: Number(formVal('gr-max')) || 20, trimester: Number(formVal('gr-trim')),
      exam_type: formVal('gr-type'), comment: formVal('gr-comment') || null
    };
    const teacherSel = document.getElementById('gr-teacher');
    if (teacherSel && teacherSel.value) data.teacher_id = Number(teacherSel.value);
    if (gradeId) await db.update('grades', gradeId, data); else await db.create('grades', data);
    closeModal(); toast('Note enregistrée' + coefMsg + (gradeId ? '' : ' + notification envoyée')); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
function deleteGrade(id) {
  confirmTrash('cette note', async () => { await removeWithUndo('grades', id, 'La note'); render(); });
}

// ---- Bulletin PDF (jsPDF) ----
async function downloadBulletinPDF(sid, trimester) {
  const b = (await api.get(`/bulletin/${sid}?trimester=${trimester}`)).data;
  const doc = await pdfDoc();
  const school = b.school || {};
  const s = b.student;

  // En-tête école
  doc.setFillColor(30, 64, 175);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont(undefined, 'bold');
  doc.text(school.name || brandName(), 105, 13, { align: 'center' });
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
  doc.text(`Année scolaire : ${App.year || App.currentYear || (dayjs().year() + '-' + (dayjs().year()+1))}`, 14, y);

  // Tableau des notes
  doc.autoTable({
    startY: y + 6,
    head: [['Matière', 'Coefficient', 'Moyenne /20', 'Observations']],
    body: b.subjects.map(su => [su.name, String(su.coefficient), su.average.toFixed(2), su.comments.join(' • ') || '-']),
    theme: 'grid',
    headStyles: { fillColor: [30, 64, 175], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2.5, font: 'Amiri' },
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
  if (b.signature) {
    const sg = b.signature;
    doc.setFontSize(8); doc.setTextColor(22, 101, 52);
    doc.text(`Signé électroniquement par ${sg.signer_name || 'le parent'}`, 140, fy - 8);
    doc.text(`le ${dayjs(sg.signed_at).format('DD/MM/YYYY à HH:mm')}`, 140, fy - 4);
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text(`Empreinte ${String(sg.fingerprint || '').slice(0, 16)}…`, 140, fy - 0.5);
    doc.setTextColor(0);
  }

  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Document généré le ${dayjs().format('DD/MM/YYYY HH:mm')} — ${school.name || brandName()}`, 105, 290, { align: 'center' });

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
  if (App.cache.payStatus === undefined) { try { App.cache.payStatus = (await api.get('/payments/status')).data; } catch { App.cache.payStatus = null; } }
  const filterStatus = App.cache.feeStatus || '';
  let qs = 'select=*,students(first_name,last_name,level)&order=due_date.asc';
  if (filterStatus) qs += `&status=eq.${filterStatus}`;
  const fees = await db.list('fees', qs);
  const totals = { paid: 0, pending: 0, overdue: 0 };
  fees.forEach(f => totals[f.status] = (totals[f.status]||0) + Number(f.amount));

  el.innerHTML = pageHeader('Frais & paiements', 'fa-money-bill-wave', isStaff() ? `
    ${App.user.role === 'admin' ? `<button onclick="showOnlinePayments()" class="${btnSecondary}" title="Paiements en ligne"><i class="fas fa-credit-card ${App.cache.payStatus?.enabled ? 'text-green-600' : 'text-gray-400'} mr-1"></i> En ligne</button>` : ''}
    ${App.user.role === 'admin' ? `<button onclick="generateMonthlyFees()" class="${btnSecondary}"><i class="fas fa-calendar-plus text-blue-600 mr-1"></i> Générer mensualités</button>
    <button onclick="showMonthlyFeeSettings()" class="${btnSecondary}" title="Montant mensuel par défaut"><i class="fas fa-sliders"></i></button>` : ''}
    <button onclick="exportFeesExcel()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-600 mr-1"></i> Rapport paiements</button>
    <button onclick="checkOverdueFees()" class="${btnSecondary}"><i class="fas fa-bell mr-1"></i> Relancer impayés</button>
    <button onclick="showFeeForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau frais</button>` : '') + `
  <section class="grid grid-cols-3 gap-4 mb-4">
    ${statCard('fa-circle-check','green','Payé', fmtMoney(totals.paid))}
    ${statCard('fa-hourglass-half','blue','En attente', fmtMoney(totals.pending||0))}
    ${statCard('fa-triangle-exclamation','red','En retard', fmtMoney(totals.overdue||0))}
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
      <thead><tr><th>Élève</th><th>Libellé</th><th>Montant</th><th>Échéance</th><th>Statut</th><th>Payé le</th>${isStaff()?'<th class="text-right">Actions</th>':'<th class="text-right">Quittance</th>'}</tr></thead>
      <tbody>
        ${fees.map(f => `<tr>
          <td class="font-semibold">${f.students ? `<a href="javascript:void(0)" onclick="showFeeHistory(${f.student_id})" class="text-blue-700 hover:underline" title="Voir l'historique de paiement">${esc(`${f.students.first_name} ${f.students.last_name}`)}</a>` : '-'} <span class="text-xs text-gray-400">${f.students?.level||''}</span></td>
          <td>${esc(f.label)}</td>
          <td><b>${fmtMoney(f.amount)}</b></td>
          <td>${fmtDate(f.due_date)}</td>
          <td><span class="badge ${ {paid:'badge-green',pending:'badge-blue',overdue:'badge-red'}[f.status] }">${ {paid:'Payé',pending:'En attente',overdue:'En retard'}[f.status] }</span></td>
          <td>${fmtDate(f.paid_date)} ${f.method ? `<span class="text-xs text-gray-400">(${f.method})</span>` : ''}</td>
          ${isStaff() ? `<td class="text-right whitespace-nowrap">
            ${f.status !== 'paid' ? `<button onclick="markFeePaid(${f.id})" class="text-green-600 px-1" title="Marquer payé"><i class="fas fa-circle-check"></i></button>` : `<button onclick="printFeeReceipt(${f.id})" class="text-blue-600 px-1" title="Quittance de paiement"><i class="fas fa-receipt"></i></button>`}
            <button onclick="showFeeForm(${f.id})" class="text-amber-600 px-1"><i class="fas fa-pen"></i></button>
            <button onclick="deleteFee(${f.id})" class="text-red-600 px-1"><i class="fas fa-trash"></i></button>
          </td>` : `<td class="text-right whitespace-nowrap">${f.status === 'paid' ? `<button onclick="printFeeReceipt(${f.id})" class="text-blue-600 px-1" title="Quittance"><i class="fas fa-receipt"></i></button>` : (App.cache.payStatus?.enabled ? `<button onclick="payOnline(${f.id})" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"><i class="fas fa-credit-card mr-1"></i> Payer en ligne</button>` : '')}</td>`}
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
        <div><label class="${lblCls}">Montant (${brandCurrency()}) *</label><input id="fe-amount" type="number" step="0.5" required value="${f.amount??''}" class="${inputCls}"></div>
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
    let wasPaid = false, feeId = id;
    if (id) {
      wasPaid = ((await db.list('fees', `select=status&id=eq.${id}`))[0] || {}).status === 'paid';
      await db.update('fees', id, data);
    } else {
      const created = await db.create('fees', data);
      feeId = created?.id || created?.[0]?.id;
    }
    closeModal(); toast('Frais enregistré');
    if (status === 'paid' && !wasPaid && feeId) await printFeeReceipt(feeId); // Quittance auto à la validation
    render();
  } catch (err) { toast('Erreur', 'error'); }
}

async function markFeePaid(id) {
  try {
    await db.update('fees', id, { status: 'paid', paid_date: dayjs().format('YYYY-MM-DD') });
    toast('Paiement enregistré');
    await printFeeReceipt(id); // Quittance générée automatiquement
    render();
  } catch (e) { toast('Erreur', 'error'); }
}

// ---- Mensualités automatiques ----
async function generateMonthlyFees() {
  try {
    toast('Génération des mensualités...', 'info');
    const r = (await api.post('/fees/generate-monthly', {})).data;
    toast(r.created > 0 ? `${r.created} mensualité(s) créée(s) pour ${r.period}` : `Mensualités de ${r.period} déjà générées pour tous les élèves actifs`);
    render();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

async function showMonthlyFeeSettings() {
  const cfg = (await db.list('settings', 'select=*&key=eq.fees'))[0]?.value || {};
  openModal('<i class="fas fa-sliders text-blue-600 mr-2"></i>Mensualités — réglages', `
    <form onsubmit="saveMonthlyFeeSettings(event)">
      <label class="${lblCls}">Montant mensuel par défaut (${brandCurrency()}) *</label>
      <input id="mf-amount" type="number" step="0.5" min="1" required value="${cfg.monthly_amount || 60}" class="${inputCls} mb-2">
      <p class="text-xs text-gray-500 mb-4"><i class="fas fa-circle-info text-blue-500 mr-1"></i>
        Chaque mois, une mensualité est créée <b>automatiquement</b> pour chaque élève actif (échéance le 10 du mois).
        Ce montant est utilisé sauf si un <b>montant personnalisé</b> est défini dans la fiche de l'élève.
        Les frais échus passent automatiquement « En retard » avec rappel au tuteur (app + Telegram/email).</p>
      <div class="flex justify-end gap-3">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`);
}
async function saveMonthlyFeeSettings(e) {
  e.preventDefault();
  try {
    await db.create('settings', { key: 'fees', value: { monthly_amount: Number(formVal('mf-amount')) } });
    closeModal(); toast('Réglages enregistrés');
  } catch (err) { toast('Erreur', 'error'); }
}

// ---- Historique de paiement d'un élève ----
async function showFeeHistory(studentId) {
  let h;
  try { h = (await api.get(`/fees/history/${studentId}`)).data; }
  catch (e) { return toast(e.response?.data?.error || 'Erreur', 'error'); }
  const s = h.student, fees = h.fees, t = h.totals;
  const stBadge = { paid: ['badge-green', 'Payé'], pending: ['badge-blue', 'En attente'], overdue: ['badge-red', 'En retard'] };
  openModal(`<i class="fas fa-clock-rotate-left text-blue-600 mr-2"></i>Historique de paiement — ${esc(s.first_name)} ${esc(s.last_name)}`, `
    <div class="flex flex-wrap gap-2 mb-3 text-sm">
      <span class="badge badge-blue">${esc(LEVEL_LABELS[s.level] || s.level || '')}</span>
      ${s.class_name ? `<span class="badge badge-gray">${esc(s.class_name)}</span>` : ''}
      ${s.monthly_fee ? `<span class="badge badge-purple" title="Montant mensuel personnalisé">Mensualité : ${fmtMoney(s.monthly_fee)}</span>` : ''}
    </div>
    <div class="grid grid-cols-3 gap-2 mb-4 text-center">
      <div class="bg-green-50 rounded-lg p-2"><div class="text-lg font-bold text-green-700">${fmtMoney(t.paid)}</div><div class="text-xs text-gray-500">Payé</div></div>
      <div class="bg-blue-50 rounded-lg p-2"><div class="text-lg font-bold text-blue-700">${fmtMoney(t.pending)}</div><div class="text-xs text-gray-500">En attente</div></div>
      <div class="bg-red-50 rounded-lg p-2"><div class="text-lg font-bold text-red-700">${fmtMoney(t.overdue)}</div><div class="text-xs text-gray-500">En retard</div></div>
    </div>
    ${t.overdue > 0 ? `<p class="text-xs bg-red-50 text-red-700 rounded-lg p-2 mb-3"><i class="fas fa-triangle-exclamation mr-1"></i>Des paiements sont en retard. Merci de régulariser auprès de l'administration.</p>` : ''}
    <div class="overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
      <table class="data-table w-full text-sm">
        <thead><tr><th>Libellé</th><th>Montant</th><th>Échéance</th><th>Statut</th><th>Payé le</th><th></th></tr></thead>
        <tbody>
          ${fees.map(f => `<tr>
            <td>${esc(f.label)}</td>
            <td><b>${fmtMoney(f.amount)}</b></td>
            <td>${fmtDate(f.due_date)}</td>
            <td><span class="badge ${stBadge[f.status]?.[0] || 'badge-gray'}">${stBadge[f.status]?.[1] || f.status}</span></td>
            <td>${fmtDate(f.paid_date)} ${f.method ? `<span class="text-xs text-gray-400">(${f.method})</span>` : ''}</td>
            <td class="text-right whitespace-nowrap">
              ${f.status === 'paid' ? `<button onclick="printFeeReceipt(${f.id})" class="text-blue-600 px-1" title="Quittance"><i class="fas fa-receipt"></i></button>` : ''}
              ${isStaff() && f.status !== 'paid' ? `<button onclick="closeModal(); markFeePaid(${f.id})" class="text-green-600 px-1" title="Marquer payé"><i class="fas fa-circle-check"></i></button>` : ''}
            </td>
          </tr>`).join('') || '<tr><td colspan="6" class="text-center py-6 text-gray-400">Aucun frais enregistré</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="flex justify-end mt-4">
      <button onclick="closeModal()" class="${btnSecondary}">Fermer</button>
    </div>`, { wide: true });
}

// ---- Quittance de paiement (PDF) ----
function amountToFrenchWords(n) {
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function under100(x) {
    if (x < 20) return units[x];
    const t = Math.floor(x / 10), u = x % 10;
    if (t === 7 || t === 9) return tens[t] + (u === 1 && t === 7 ? ' et ' : '-') + units[10 + u];
    let s = tens[t];
    if (u === 1 && t < 8) s += ' et un'; else if (u > 0) s += '-' + units[u];
    else if (t === 8) s += 's';
    return s;
  }
  function under1000(x) {
    const h = Math.floor(x / 100), r = x % 100;
    let s = '';
    if (h > 0) s = (h > 1 ? units[h] + ' ' : '') + 'cent' + (h > 1 && r === 0 ? 's' : '');
    if (r > 0) s += (s ? ' ' : '') + under100(r);
    return s;
  }
  const int = Math.floor(n), mill = Math.round((n - int) * 1000);
  let out = '';
  if (int >= 1000) {
    const th = Math.floor(int / 1000);
    out = (th > 1 ? under1000(th) + ' ' : '') + 'mille';
    if (int % 1000 > 0) out += ' ' + under1000(int % 1000);
  } else out = under1000(int) || 'zéro';
  out += ' dinar' + (int > 1 ? 's' : '');
  if (mill > 0) out += ' et ' + mill + ' millime' + (mill > 1 ? 's' : '');
  return out;
}

async function printFeeReceipt(id) {
  try {
    const f = (await db.list('fees', `select=*,students(first_name,last_name,level,class_name,parent_name)&id=eq.${id}`))[0];
    if (!f) return toast('Frais introuvable', 'error');
    if (f.status !== 'paid') return toast("Ce frais n'est pas encore payé", 'error');
    const school = (await db.list('settings', 'select=*&key=eq.school'))[0]?.value || {};
    const receiptNo = `Q-${dayjs(f.paid_date || undefined).format('YYYY')}-${String(f.id).padStart(5, '0')}`;
    const methodLabels = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement' };

    const doc = await pdfDoc({ format: 'a5', orientation: 'landscape' }); // 210 x 148 mm

    // Charger le logo et préparer les variantes (filigrane + cachet) via canvas
    let logoImg = null, watermarkImg = null, stampImg = null;
    try {
      logoImg = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im); im.onerror = rej; im.crossOrigin = 'anonymous';
        im.src = brandLogo();
      });
      // Filigrane : logo très transparent
      const wc = document.createElement('canvas'); wc.width = 600; wc.height = 600;
      const wctx = wc.getContext('2d');
      wctx.globalAlpha = 0.07;
      wctx.drawImage(logoImg, 0, 0, 600, 600);
      watermarkImg = wc.toDataURL('image/png');
      // Cachet : logo droit (0°), semi-transparent (70%), effet tampon encre
      const sc = document.createElement('canvas'); sc.width = 400; sc.height = 400;
      const sctx = sc.getContext('2d');
      sctx.globalAlpha = 0.70;
      sctx.drawImage(logoImg, 0, 0, 400, 400);
      stampImg = sc.toDataURL('image/png');
    } catch (e) { /* logo optionnel */ }

    // Filigrane central (dessiné en premier = sous le texte)
    if (watermarkImg) doc.addImage(watermarkImg, 'PNG', 55, 24, 100, 100);

    // En-tête
    doc.setFillColor(30, 64, 175);
    doc.rect(0, 0, 210, 26, 'F');
    if (logoImg) {
      try {
        const hc = document.createElement('canvas'); hc.width = 200; hc.height = 200;
        hc.getContext('2d').drawImage(logoImg, 0, 0, 200, 200);
        doc.addImage(hc.toDataURL('image/png'), 'PNG', 6, 3, 20, 20);
      } catch (e) {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont(undefined, 'bold');
    doc.text(school.name || brandName(), 105, 10, { align: 'center' });
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    doc.text(`${school.address || ''}  •  ${school.phone || ''}`, 105, 16, { align: 'center' });
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text('QUITTANCE DE PAIEMENT', 105, 23, { align: 'center' });

    // Numéro + date
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    doc.text(`N° ${receiptNo}`, 14, 35);
    doc.setFont(undefined, 'normal');
    doc.text(`Date de paiement : ${fmtDate(f.paid_date)}`, 196, 35, { align: 'right' });
    doc.setDrawColor(30, 64, 175); doc.setLineWidth(0.5);
    doc.line(14, 38, 196, 38);

    // Corps
    let y = 47;
    const st = f.students || {};
    doc.setFontSize(10);
    // Libellé et valeur séparés (noms en arabe : évite le mélange bidi dans une même chaîne)
    pdfLabelValue(doc, 'Reçu de :', st.parent_name || 'M./Mme le tuteur de l\u2019élève', 14, y); y += 7;
    pdfLabelValue(doc, 'Pour l\u2019élève :', `${st.first_name || ''} ${st.last_name || ''}`, 14, y, `(${LEVEL_LABELS[st.level] || st.level || '-'}${st.class_name ? ' — ' + st.class_name : ''})`); y += 7;
    doc.text(`Objet : ${f.label}`, 14, y); y += 7;
    doc.text(`Mode de paiement : ${methodLabels[f.method] || f.method || 'Espèces'}`, 14, y); y += 10;

    // Montant encadré
    doc.setFillColor(240, 246, 255);
    doc.setDrawColor(30, 64, 175);
    doc.roundedRect(14, y - 6, 182, 18, 2, 2, 'FD');
    doc.setFont(undefined, 'bold'); doc.setFontSize(14);
    doc.setTextColor(30, 64, 175);
    doc.text(fmtMoney(f.amount, 3), 24, y + 5);
    doc.setFontSize(9); doc.setFont(undefined, 'italic');
    doc.setTextColor(70, 70, 70);
    const words = amountToFrenchWords(Number(f.amount));
    doc.text(`Soit : ${words.charAt(0).toUpperCase() + words.slice(1)}`, 70, y + 5, { maxWidth: 122 });
    y += 24;

    // Signatures
    doc.setTextColor(40, 40, 40);
    doc.setFontSize(9); doc.setFont(undefined, 'normal');
    doc.text('Signature du payeur', 30, y + 14);
    doc.text('Cachet et signature de l\u2019administration', 145, y + 14);
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
    doc.line(18, y + 10, 78, y + 10);
    doc.line(130, y + 10, 192, y + 10);

    // Cachet officiel (tampon logo droit 0°, 70%) — décalé de +15 mm vers le bas et +15 mm vers la droite
    // Taille 25 mm pour rester entièrement dans la page A5 (bord bas à 148 mm)
    if (stampImg) doc.addImage(stampImg, 'PNG', 159, y + 14, 25, 25);

    // Pied de page
    doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text(`Quittance ${receiptNo} générée le ${dayjs().format('DD/MM/YYYY HH:mm')} — ${school.name || brandName()}`, 105, 141, { align: 'center' });

    doc.save(`quittance-${receiptNo}.pdf`);
    toast(`Quittance ${receiptNo} générée`);
  } catch (e) { console.error(e); toast('Erreur génération quittance', 'error'); }
}
function deleteFee(id) {
  confirmTrash('ce frais', async () => { await removeWithUndo('fees', id, 'Le frais'); render(); });
}

async function exportFeesExcel() {
  const fees = App.cache.feesList || await db.list('fees', 'select=*,students(first_name,last_name,level)');
  const rows = fees.map(f => ({
    'Élève': f.students ? `${f.students.first_name} ${f.students.last_name}` : '', 'Niveau': f.students?.level || '',
    'Libellé': f.label, [`Montant (${brandCurrency()})`]: Number(f.amount), 'Échéance': f.due_date || '',
    'Statut': { paid:'Payé', pending:'En attente', overdue:'En retard' }[f.status], 'Payé le': f.paid_date || '', 'Méthode': f.method || ''
  }));
  // Feuille récap
  const byStudent = {};
  fees.forEach(f => {
    const k = f.students ? `${f.students.first_name} ${f.students.last_name}` : String(f.student_id);
    const CU = brandCurrency(); byStudent[k] = byStudent[k] || { 'Élève': k, [`Payé (${CU})`]: 0, [`En attente (${CU})`]: 0, [`En retard (${CU})`]: 0 };
    const col = { paid:`Payé (${CU})`, pending:`En attente (${CU})`, overdue:`En retard (${CU})` }[f.status];
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
      ${cr.file_url && (cr.file_type||'').includes('image') ? `<a href="${esc(cr.file_url)}" target="_blank" title="Voir en grand"><img src="${esc(cr.file_url)}" alt="${esc(cr.title)}" loading="lazy" class="w-full h-40 object-cover object-top rounded-lg mt-3 border hover:opacity-90 transition"></a>` : ''}
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
      toast('Filigrane, empreinte et envoi sécurisé…', 'info');
      const up = await uploadFile('courses', file);
      data.file_url = up.url; data.file_name = file.name; data.file_type = file.type;
    }
    if (id) await db.update('courses', id, data); else await db.create('courses', data);
    closeModal(); toast('Cours enregistré'); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}
function deleteCourse(id) {
  confirmTrash('ce cours', async () => { await removeWithUndo('courses', id, 'Le cours'); render(); });
}

// ================= COURS INTERACTIFS (QUIZ) =================
// Types de cours interactifs disponibles
const IC_TYPES = {
  quiz:       { icon: 'fa-gamepad',        color: 'purple', label: 'Quiz',            desc: 'Questions à choix multiples avec score' },
  flashcards: { icon: 'fa-clone',          color: 'amber',  label: 'Cartes mémoire',  desc: 'Cartes recto/verso pour mémoriser' },
  fillblank:  { icon: 'fa-pen-to-square',  color: 'green',  label: 'Texte à trous',   desc: 'Compléter les mots manquants [entre crochets]' },
  external:   { icon: 'fa-up-right-from-square', color: 'sky', label: 'Application externe', desc: 'Intégrer un lien (LearningApps, Wordwall, GeoGebra…)' }
};
function icType(ic) { return IC_TYPES[ic.course_type] ? ic.course_type : (ic.external_url ? 'external' : 'quiz'); }

VIEWS.interactive = async function(el) {
  const tab = App.cache.icTab || 'courses';
  const tabsHtml = `<div class="flex gap-2 mb-4 flex-wrap" id="ic-tabs">
    <button onclick="App.cache.icTab='courses'; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab==='courses'?'bg-blue-600 text-white':'bg-white border text-gray-600'}"><i class="fas fa-gamepad mr-1"></i> Activités interactives</button>
    <button onclick="App.cache.icTab='situations'; render()" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab==='situations'?'bg-indigo-600 text-white':'bg-white border text-gray-600'}"><i class="fas fa-puzzle-piece mr-1"></i> 🌟 بوابة الوضعيات الرياضية</button>
  </div>`;
  if (tab === 'situations' && typeof renderSituations === 'function') {
    el.innerHTML = pageHeader('Cours interactifs', 'fa-gamepad') + tabsHtml + '<div id="sit-root"><i class="fas fa-spinner fa-spin text-gray-400"></i></div>';
    return renderSituations(document.getElementById('sit-root'));
  }
  const level = App.cache.icLevel || '';
  const typeFilter = App.cache.icType || '';
  let qs = 'select=*,subjects(name),teachers(first_name,last_name,subject)&order=created_at.desc';
  if (level) qs += `&level=eq.${level}`;
  let ics = [];
  try { ics = await db.list('interactive_courses', qs); }
  catch (e) {
    // Migration 0004 non appliquée : colonnes enrichies absentes
    let qs2 = 'select=*,subjects(name)&order=created_at.desc';
    if (level) qs2 += `&level=eq.${level}`;
    ics = await db.list('interactive_courses', qs2);
  }
  if (typeFilter) ics = ics.filter(ic => icType(ic) === typeFilter);

  const playLabels = { quiz: 'Commencer le quiz', flashcards: 'Réviser les cartes', fillblank: 'Compléter le texte', external: "Ouvrir l'activité" };
  el.innerHTML = pageHeader('Cours interactifs', 'fa-gamepad', isStaff() ? `<button onclick="showAiGenerator('summary')" class="${btnSecondary}"><i class="fas fa-wand-magic-sparkles text-purple-600 mr-1"></i> Fiche de révision IA</button><button onclick="showInteractiveForm()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouveau cours interactif</button>` : '') + `
  ${tabsHtml}
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex gap-3 items-center flex-wrap">
    <select onchange="App.cache.icLevel=this.value; render()" class="${inputCls} max-w-xs">
      <option value="">Tous les niveaux</option>${levelOptions(level)}
    </select>
    <div class="flex gap-1 flex-wrap">
      <button onclick="App.cache.icType=''; render()" class="px-3 py-1.5 rounded-full text-xs font-bold ${!typeFilter?'bg-blue-600 text-white':'border text-gray-500 hover:bg-gray-50'}">Tous</button>
      ${Object.entries(IC_TYPES).map(([k,t]) => `<button onclick="App.cache.icType='${k}'; render()" class="px-3 py-1.5 rounded-full text-xs font-bold ${typeFilter===k?'bg-blue-600 text-white':'border text-gray-500 hover:bg-gray-50'}"><i class="fas ${t.icon} mr-1"></i>${t.label}</button>`).join('')}
    </div>
  </div>
  <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    ${ics.map(ic => { const ty = icType(ic); const T = IC_TYPES[ty]; return `
    <article class="bg-white rounded-xl shadow p-5 flex flex-col">
      <div class="flex items-start justify-between">
        <i class="fas ${T.icon} text-3xl text-${T.color}-500"></i>
        ${isStaff() ? `<div class="flex items-center">
          <button onclick="shareInteractive(${ic.id})" class="text-sky-600 px-1" title="Partager avec les élèves"><i class="fas fa-share-nodes"></i></button>
          <button onclick="duplicateInteractive(${ic.id})" class="text-gray-500 px-1" title="Dupliquer comme modèle"><i class="fas fa-copy"></i></button>
          <button onclick="showInteractiveForm(${ic.id})" class="text-amber-600 px-1" title="Modifier"><i class="fas fa-pen"></i></button>
          <button onclick="deleteInteractive(${ic.id})" class="text-red-600 px-1" title="Supprimer"><i class="fas fa-trash"></i></button>
        </div>` : ''}
      </div>
      <h3 class="font-bold text-gray-800 mt-3">${esc(ic.title)}</h3>
      <p class="text-xs text-gray-500 mt-1 flex-1">${esc((ic.description||'').slice(0,160))}${(ic.description||'').length>160?'…':''}</p>
      <div class="flex gap-2 mt-3 flex-wrap">
        <span class="badge badge-${T.color === 'purple' ? 'purple' : T.color === 'amber' ? 'amber' : T.color === 'green' ? 'green' : 'blue'}"><i class="fas ${T.icon} mr-1"></i>${T.label}</span>
        ${ic.level ? `<span class="badge badge-blue">${esc(LEVEL_LABELS[ic.level]||ic.level)}</span>` : ''}
        ${ic.subjects ? `<span class="badge badge-purple">${esc(ic.subjects.name)}</span>` : ''}
        ${ty==='quiz' ? `<span class="badge badge-gray">${(ic.questions||[]).length} question(s)</span>` : ''}
        ${ty==='flashcards' ? `<span class="badge badge-gray">${((ic.content||{}).cards||[]).length} carte(s)</span>` : ''}
      </div>
      ${ic.teachers ? `<p class="text-[11px] text-gray-400 mt-2"><i class="fas fa-chalkboard-user mr-1"></i>${esc(ic.teachers.first_name)} ${esc(ic.teachers.last_name)}${ic.teachers.subject ? ' — ' + esc(ic.teachers.subject) : ''}</p>` : ''}
      <button onclick="playInteractive(${ic.id})" class="${btnPrimary} w-full mt-4"><i class="fas fa-play mr-1"></i> ${playLabels[ty]}</button>
    </article>`; }).join('') || '<p class="text-gray-400 col-span-3 text-center py-10">Aucun cours interactif</p>'}
  </div>`;
  App.cache.icsList = ics;
  // Ouverture automatique d'un cours partagé par lien (/#ic-<id>)
  if (App.cache.icOpenId) {
    const openId = App.cache.icOpenId; App.cache.icOpenId = null;
    const found = ics.find(x => x.id === openId);
    if (found) setTimeout(() => playInteractive(openId), 200);
    else toast('Cours interactif introuvable ou supprimé', 'warning');
  }
};

// ---- Partage d'un cours interactif (staff) ----
function shareInteractive(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic) return;
  const link = `${location.origin}/#ic-${ic.id}`;
  const T = IC_TYPES[icType(ic)];
  openModal(`<i class="fas fa-share-nodes text-sky-600 mr-2"></i>Partager « ${esc(ic.title)} »`, `
    <div class="mb-4">
      <label class="text-xs font-bold text-gray-500 uppercase">Lien direct du cours</label>
      <div class="flex gap-2 mt-1">
        <input id="ic-share-link" readonly value="${esc(link)}" class="${inputCls} flex-1 text-sm bg-gray-50" onclick="this.select()">
        <button onclick="copyShareLink()" class="${btnPrimary}"><i class="fas fa-copy mr-1"></i> Copier</button>
      </div>
      <p class="text-[11px] text-gray-400 mt-1"><i class="fas fa-circle-info mr-1"></i>L'élève/parent qui ouvre ce lien arrive directement sur l'activité (après connexion).</p>
    </div>
    <div class="grid grid-cols-2 gap-2 mb-4">
      <a href="https://wa.me/?text=${encodeURIComponent(`📚 ${ic.title}\n${T.label} — ${brandName()}\n${link}`)}" target="_blank"
        class="flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-bold text-green-600 hover:bg-green-50"><i class="fab fa-whatsapp text-lg"></i> WhatsApp</a>
      <a href="https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(`📚 ${ic.title} — ${T.label}`)}" target="_blank"
        class="flex items-center justify-center gap-2 border rounded-lg py-2.5 text-sm font-bold text-sky-600 hover:bg-sky-50"><i class="fab fa-telegram text-lg"></i> Telegram</a>
    </div>
    <div class="border-t pt-4">
      <label class="text-xs font-bold text-gray-500 uppercase">Notifier les parents dans l'application</label>
      <p class="text-[11px] text-gray-400 mb-2">Envoie une notification (+ Telegram/email si configurés) aux tuteurs des élèves du niveau <b>${esc(LEVEL_LABELS[ic.level]||ic.level||'tous niveaux')}</b>.</p>
      <button onclick="notifyInteractive(${ic.id})" id="ic-notify-btn" class="${btnSecondary} w-full"><i class="fas fa-bullhorn mr-1"></i> Envoyer aux élèves du niveau</button>
      <div id="ic-notify-result" class="text-center text-sm font-bold mt-2"></div>
    </div>`);
}
function copyShareLink() {
  const inp = document.getElementById('ic-share-link');
  inp.select();
  navigator.clipboard?.writeText(inp.value).then(() => toast('Lien copié !')).catch(() => { document.execCommand('copy'); toast('Lien copié !'); });
}
async function notifyInteractive(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic) return;
  const btn = document.getElementById('ic-notify-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Envoi en cours…';
  try {
    const r = await api.post('/interactive/notify', { course_id: id });
    const el = document.getElementById('ic-notify-result');
    el.innerHTML = `<span class="text-green-600"><i class="fas fa-check mr-1"></i>${r.data.sent} élève(s) notifié(s)</span>`;
    toast(`Cours partagé avec ${r.data.sent} élève(s)`);
  } catch (err) {
    document.getElementById('ic-notify-result').innerHTML = `<span class="text-red-600">${esc(err.response?.data?.error || 'Erreur')}</span>`;
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-bullhorn mr-1"></i> Envoyer aux élèves du niveau';
}

// ---- Duplication d'un cours interactif (modèle réutilisable) ----
async function duplicateInteractive(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic) return;
  try {
    await db.create('interactive_courses', {
      title: `${ic.title} (copie)`, description: ic.description, level: ic.level, cycle: ic.cycle,
      subject_id: ic.subject_id, questions: ic.questions || [],
      course_type: ic.course_type || 'quiz', content: ic.content || {}, external_url: ic.external_url || null
    });
    toast('Copie créée — vous pouvez la modifier'); render();
  } catch (e) { toast('Erreur lors de la duplication', 'error'); }
}

// Router de lecture selon le type
function playInteractive(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic) return;
  const ty = icType(ic);
  if (ty === 'external') return playExternal(ic);
  if (ty === 'flashcards') return playFlashcards(ic);
  if (ty === 'fillblank') return playFillBlank(ic);
  return playQuiz(id);
}

async function showInteractiveForm(id) {
  const subjects = await db.list('subjects', 'select=*&order=name.asc');
  let ic = { questions: [], content: {} };
  if (id) ic = (await db.list('interactive_courses', `select=*&id=eq.${id}`))[0] || { questions: [], content: {} };
  App.cache.editingQuestions = JSON.parse(JSON.stringify(ic.questions || []));
  App.cache.editingCards = JSON.parse(JSON.stringify((ic.content || {}).cards || []));
  const ty = icType(ic);
  openModal(`<i class="fas fa-gamepad text-purple-600 mr-2"></i>${id?'Modifier':'Nouveau'} cours interactif`, `
    <form onsubmit="saveInteractive(event, ${id||'null'})">
      <label class="${lblCls}">Type d'activité *</label>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3" id="ic-type-picker">
        ${Object.entries(IC_TYPES).map(([k,t]) => `
        <label class="ic-type-opt border-2 rounded-lg p-2 cursor-pointer text-center transition ${ty===k?'border-blue-600 bg-blue-50':'border-gray-200 hover:border-gray-300'}">
          <input type="radio" name="ic-type" value="${k}" ${ty===k?'checked':''} class="hidden" onchange="onIcTypeChange('${k}')">
          <i class="fas ${t.icon} text-${t.color}-500 text-xl block mb-1"></i>
          <b class="text-xs block">${t.label}</b>
          <span class="text-[10px] text-gray-400 leading-tight block">${t.desc}</span>
        </label>`).join('')}
      </div>
      <div class="flex items-center justify-between mb-1"><label class="${lblCls} mb-0">Titre *</label><button type="button" onclick="showAiGenerator()" class="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-2 py-1 hover:bg-purple-100"><i class="fas fa-wand-magic-sparkles mr-1"></i>Générer avec l'IA (texte / PDF)</button></div><input id="ic-title" required value="${esc(ic.title||'')}" class="${inputCls} mb-3">
      <label class="${lblCls}">Description</label><textarea id="ic-desc" rows="2" class="${inputCls} mb-3">${esc(ic.description||'')}</textarea>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="${lblCls}">Niveau</label><select id="ic-level" class="${inputCls}"><option value="">Tous</option>${levelOptions(ic.level)}</select></div>
        <div><label class="${lblCls}">Matière</label><select id="ic-subject" class="${inputCls}"><option value="">-</option>${subjects.map(s=>`<option value="${s.id}" ${s.id==ic.subject_id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div>
      </div>

      <!-- QUIZ -->
      <div id="ic-pane-quiz" class="border-t pt-3" style="display:${ty==='quiz'?'block':'none'}">
        <div class="flex items-center justify-between mb-2">
          <label class="${lblCls} mb-0">Questions du quiz</label>
          <button type="button" onclick="addQuizQuestion()" class="text-blue-600 text-sm"><i class="fas fa-plus mr-1"></i>Ajouter</button>
        </div>
        <div id="quiz-questions" class="space-y-3 max-h-72 overflow-y-auto"></div>
      </div>

      <!-- FLASHCARDS -->
      <div id="ic-pane-flashcards" class="border-t pt-3" style="display:${ty==='flashcards'?'block':'none'}">
        <div class="flex items-center justify-between mb-2">
          <label class="${lblCls} mb-0">Cartes mémoire (recto → verso)</label>
          <button type="button" onclick="addFlashcard()" class="text-blue-600 text-sm"><i class="fas fa-plus mr-1"></i>Ajouter</button>
        </div>
        <div id="ic-cards" class="space-y-2 max-h-72 overflow-y-auto"></div>
      </div>

      <!-- TEXTE À TROUS -->
      <div id="ic-pane-fillblank" class="border-t pt-3" style="display:${ty==='fillblank'?'block':'none'}">
        <label class="${lblCls}">Texte avec les mots à cacher [entre crochets]</label>
        <textarea id="ic-fbtext" rows="5" class="${inputCls} mb-1" placeholder="Le [chat] boit du [lait] chaque matin.">${esc((ic.content||{}).text||'')}</textarea>
        <p class="text-xs text-gray-400"><i class="fas fa-lightbulb mr-1"></i>Mettez chaque mot à deviner entre crochets. L'élève devra le taper pour valider.</p>
      </div>

      <!-- APPLICATION EXTERNE -->
      <div id="ic-pane-external" class="border-t pt-3" style="display:${ty==='external'?'block':'none'}">
        <label class="${lblCls}">Lien de l'application (https://…) *</label>
        <input id="ic-url" type="url" value="${esc(ic.external_url||'')}" class="${inputCls} mb-1" placeholder="https://learningapps.org/watch?v=..." dir="ltr">
        <p class="text-xs text-gray-400 mb-2"><i class="fas fa-circle-info mr-1"></i>Collez le lien d'une activité déjà créée : LearningApps, Wordwall, GeoGebra, Quizizz, Genially, H5P, vidéo YouTube…</p>
        <label class="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <input type="checkbox" id="ic-embed" ${(ic.content||{}).embed !== false ? 'checked' : ''} class="w-4 h-4">
          Intégrer dans la page (iframe) — décochez pour ouvrir dans un nouvel onglet
        </label>
      </div>

      <div class="flex justify-end gap-3 mt-4">
        <button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>
        <button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
      </div>
    </form>`, { wide: true });
  renderQuizQuestions();
  renderFlashcardEditor();
}

function onIcTypeChange(k) {
  ['quiz','flashcards','fillblank','external'].forEach(t => {
    const pane = document.getElementById('ic-pane-' + t);
    if (pane) pane.style.display = t === k ? 'block' : 'none';
  });
  document.querySelectorAll('#ic-type-picker .ic-type-opt').forEach(o => {
    const checked = o.querySelector('input').value === k;
    o.classList.toggle('border-blue-600', checked);
    o.classList.toggle('bg-blue-50', checked);
    o.classList.toggle('border-gray-200', !checked);
  });
}

function renderFlashcardEditor() {
  const box = document.getElementById('ic-cards');
  if (!box) return;
  const cards = App.cache.editingCards || [];
  box.innerHTML = cards.map((cd, i) => `
    <div class="flex gap-2 items-center">
      <b class="text-xs text-gray-400 w-6">${i+1}</b>
      <input value="${esc(cd.front||'')}" oninput="App.cache.editingCards[${i}].front=this.value" placeholder="Recto (question / mot)" class="${inputCls} flex-1">
      <i class="fas fa-arrow-right text-gray-300"></i>
      <input value="${esc(cd.back||'')}" oninput="App.cache.editingCards[${i}].back=this.value" placeholder="Verso (réponse)" class="${inputCls} flex-1">
      <button type="button" onclick="App.cache.editingCards.splice(${i},1); renderFlashcardEditor()" class="text-red-500"><i class="fas fa-trash"></i></button>
    </div>`).join('') || '<p class="text-xs text-gray-400">Aucune carte. Cliquez sur "Ajouter".</p>';
}
function addFlashcard() {
  (App.cache.editingCards = App.cache.editingCards || []).push({ front: '', back: '' });
  renderFlashcardEditor();
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
  const ty = document.querySelector('input[name="ic-type"]:checked')?.value || 'quiz';
  const data = {
    title: formVal('ic-title'), description: formVal('ic-desc') || null,
    level: level || null, cycle: level ? cycleOfLevel(level) : 'primaire',
    subject_id: formVal('ic-subject') ? Number(formVal('ic-subject')) : null,
    questions: [],
    course_type: ty, content: {}, external_url: null
  };
  if (ty === 'quiz') {
    data.questions = (App.cache.editingQuestions || []).filter(q => q.question.trim());
    if (!data.questions.length) { toast('Ajoutez au moins une question', 'error'); return; }
  } else if (ty === 'flashcards') {
    const cards = (App.cache.editingCards || []).filter(c => (c.front||'').trim() && (c.back||'').trim());
    if (!cards.length) { toast('Ajoutez au moins une carte (recto + verso)', 'error'); return; }
    data.content = { cards };
  } else if (ty === 'fillblank') {
    const text = (document.getElementById('ic-fbtext')?.value || '').trim();
    if (!/\[[^\]]+\]/.test(text)) { toast('Le texte doit contenir au moins un mot entre [crochets]', 'error'); return; }
    data.content = { text };
  } else if (ty === 'external') {
    const url = (document.getElementById('ic-url')?.value || '').trim();
    if (!/^https?:\/\/.+/.test(url)) { toast('Entrez un lien valide (http:// ou https://)', 'error'); return; }
    data.external_url = url;
    data.content = { embed: document.getElementById('ic-embed')?.checked !== false };
  }
  try {
    if (id) await db.update('interactive_courses', id, data); else await db.create('interactive_courses', data);
    closeModal(); toast('Cours interactif enregistré'); render();
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}

// ---- Lecteur : application externe ----
function playExternal(ic) {
  const url = ic.external_url;
  if (!url) { toast('Aucun lien défini', 'warning'); return; }
  const embed = ic.content?.embed !== false;
  if (!embed) { window.open(url, '_blank'); return; }
  openModal(`<i class="fas fa-up-right-from-square text-sky-600 mr-2"></i>${esc(ic.title)}`, `
    <div class="mb-2 flex justify-end">
      <a href="${esc(url)}" target="_blank" class="text-sm text-sky-600 hover:underline"><i class="fas fa-arrow-up-right-from-square mr-1"></i>Ouvrir dans un nouvel onglet</a>
    </div>
    <iframe src="${esc(url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
      class="w-full border rounded-lg bg-white" style="height:70vh"></iframe>`, { wide: true });
}

// ---- Lecteur : cartes mémoire ----
function playFlashcards(ic) {
  const cards = ic.content?.cards || [];
  if (!cards.length) { toast('Ce cours n\'a pas de cartes', 'warning'); return; }
  App.cache.fc = { ic, cards, index: 0, flipped: false };
  renderFlashcardStep();
}
function renderFlashcardStep() {
  const { ic, cards, index, flipped } = App.cache.fc;
  if (index >= cards.length) {
    openModal(`<i class="fas fa-clone text-amber-500 mr-2"></i>${esc(ic.title)}`, `
      <div class="text-center py-6">
        <div class="text-5xl mb-3">🎉</div>
        <p class="text-lg font-bold text-gray-800">Vous avez parcouru les ${cards.length} cartes !</p>
        <button onclick="playFlashcards(App.cache.fc.ic)" class="${btnPrimary} mt-4 mr-2"><i class="fas fa-rotate-right mr-1"></i> Recommencer</button>
        <button onclick="closeModal()" class="${btnSecondary} mt-4">Fermer</button>
      </div>`);
    return;
  }
  const c = cards[index];
  openModal(`<i class="fas fa-clone text-amber-500 mr-2"></i>${esc(ic.title)} — Carte ${index+1}/${cards.length}`, `
    <div class="mb-2 h-2 bg-gray-200 rounded-full"><div class="h-2 bg-amber-500 rounded-full" style="width:${index/cards.length*100}%"></div></div>
    <div onclick="App.cache.fc.flipped=!App.cache.fc.flipped;renderFlashcardStep()"
      class="cursor-pointer select-none rounded-2xl border-2 ${flipped ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'} p-8 my-4 text-center min-h-[160px] flex flex-col items-center justify-center transition">
      <div class="text-xs uppercase tracking-wide ${flipped ? 'text-green-600' : 'text-amber-600'} mb-2">
        <i class="fas ${flipped ? 'fa-lightbulb' : 'fa-question'} mr-1"></i>${flipped ? 'Réponse' : 'Question'} — cliquez pour retourner
      </div>
      <div class="text-xl font-bold text-gray-800 whitespace-pre-wrap">${esc(flipped ? c.back : c.front)}</div>
    </div>
    <div class="flex justify-between">
      <button onclick="if(App.cache.fc.index>0){App.cache.fc.index--;App.cache.fc.flipped=false;renderFlashcardStep()}" class="${btnSecondary}" ${index===0?'disabled style="opacity:.4"':''}><i class="fas fa-chevron-left mr-1"></i> Précédente</button>
      <button onclick="App.cache.fc.index++;App.cache.fc.flipped=false;renderFlashcardStep()" class="${btnPrimary}">Suivante <i class="fas fa-chevron-right ml-1"></i></button>
    </div>`);
}

// ---- Lecteur : texte à trous ----
function playFillBlank(ic) {
  const text = ic.content?.text || '';
  const answers = [];
  let i = 0;
  const html = esc(text).replace(/\[([^\]]+)\]/g, (m, w) => {
    answers.push(w.trim());
    const idx = i++;
    return `<input data-fb="${idx}" class="border-b-2 border-green-400 bg-green-50 rounded px-2 py-0.5 mx-1 text-center font-semibold focus:outline-none focus:border-green-600" style="width:${Math.max(60, w.length * 12)}px" autocomplete="off">`;
  });
  if (!answers.length) { toast('Ce cours n\'a pas de trous définis', 'warning'); return; }
  App.cache.fb = { ic, answers };
  openModal(`<i class="fas fa-pen-to-square text-green-600 mr-2"></i>${esc(ic.title)}`, `
    <p class="text-sm text-gray-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Complétez les mots manquants puis vérifiez vos réponses.</p>
    <div class="leading-loose text-gray-800 text-lg whitespace-pre-wrap bg-gray-50 border rounded-xl p-4">${html}</div>
    <div id="fb-result" class="text-center font-bold text-lg my-3"></div>
    <div class="text-center">
      <button onclick="checkFillBlank()" class="${btnPrimary}"><i class="fas fa-check mr-1"></i> Vérifier</button>
      <button onclick="closeModal()" class="${btnSecondary} ml-2">Fermer</button>
    </div>`, { wide: true });
}
function checkFillBlank() {
  const { answers } = App.cache.fb;
  const norm = s => (s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let good = 0;
  document.querySelectorAll('[data-fb]').forEach(inp => {
    const idx = Number(inp.dataset.fb);
    const ok = norm(inp.value) === norm(answers[idx]);
    inp.classList.remove('border-green-400', 'bg-green-50', 'border-green-600', 'bg-green-100', 'border-red-500', 'bg-red-50');
    if (ok) { good++; inp.classList.add('border-green-600', 'bg-green-100'); inp.title = ''; }
    else { inp.classList.add('border-red-500', 'bg-red-50'); inp.title = `Réponse : ${answers[idx]}`; }
  });
  const el = document.getElementById('fb-result');
  if (el) el.innerHTML = good === answers.length
    ? `<span class="text-green-600">🏆 Parfait ! ${good}/${answers.length}</span>`
    : `<span class="${good >= answers.length/2 ? 'text-amber-600' : 'text-red-600'}">${good}/${answers.length} — survolez les cases rouges pour voir la réponse</span>`;
}
function deleteInteractive(id) {
  confirmTrash('ce cours interactif', async () => { await removeWithUndo('interactive_courses', id, 'Le cours interactif'); render(); });
}

// ---- Lecture du quiz ----
function playQuiz(id) {
  const ic = (App.cache.icsList || []).find(x => x.id === id);
  if (!ic || !(ic.questions||[]).length) { toast('Ce quiz n\'a pas de questions', 'warning'); return; }
  App.cache.quiz = { ic, index: 0, score: 0 };
  // Si une lecture / consigne longue est fournie, l'afficher avant de commencer
  if (ic.description && ic.description.length > 80) {
    openModal(`<i class="fas fa-book-open text-purple-600 mr-2"></i>${esc(ic.title)}`, `
      <p class="text-sm text-gray-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Lis bien le texte, puis réponds aux questions.</p>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-gray-800 leading-relaxed whitespace-pre-wrap mb-4">${esc(ic.description)}</div>
      <div class="text-center">
        <button onclick="renderQuizStep()" class="${btnPrimary}"><i class="fas fa-play mr-1"></i> Commencer le quiz</button>
      </div>`, { wide: true });
    return;
  }
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

// ---- Suivi des signatures de bulletins (admin / enseignant) ----
async function showSignatureTracking() {
  const trimester = App.cache.gradeTrim || 1;
  openModal('<i class="fas fa-file-signature text-blue-600 mr-2"></i>Suivi des signatures de bulletins', `
    <div class="flex gap-2 items-center mb-3 flex-wrap">
      <div class="flex gap-1">${[1,2,3].map(t => `<button onclick="App.cache.sigTrim=${t}; loadSignatureTracking()" class="px-3 py-1.5 rounded-lg text-sm font-semibold ${(App.cache.sigTrim||trimester)==t?'bg-blue-600 text-white':'border text-gray-600'}">T${t}</button>`).join('')}</div>
      <select id="sig-level" class="${inputCls} max-w-[200px]" onchange="loadSignatureTracking()"><option value="">Tous les niveaux</option>${Object.entries(LEVEL_LABELS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span id="sig-summary" class="text-xs text-gray-500 ml-auto"></span>
    </div>
    <div id="sig-list" class="text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Chargement…</div>`, { wide: true });
  App.cache.sigTrim = App.cache.sigTrim || trimester;
  loadSignatureTracking();
}
async function loadSignatureTracking() {
  const el = document.getElementById('sig-list'); if (!el) return;
  const t = App.cache.sigTrim || 1, level = document.getElementById('sig-level')?.value || '';
  // rafraîchir l'état des boutons trimestre
  el.parentElement.querySelectorAll('button').forEach(b => { if (/^T[123]$/.test(b.textContent.trim())) { const on = b.textContent.trim() === 'T' + t; b.className = `px-3 py-1.5 rounded-lg text-sm font-semibold ${on?'bg-blue-600 text-white':'border text-gray-600'}`; } });
  try {
    const r = (await api.get(`/bulletin-signatures?trimester=${t}${level ? '&level=' + encodeURIComponent(level) : ''}`)).data;
    if (!r.supported) { el.innerHTML = '<p class="text-amber-700 text-sm">Exécutez <code>migrations/0011_bulletin_signatures.sql</code> dans Supabase pour activer ce module.</p>'; return; }
    const withGrades = r.items.filter(i => i.has_grades);
    const signed = withGrades.filter(i => i.signature).length;
    document.getElementById('sig-summary').textContent = `${signed} / ${withGrades.length} bulletin(s) signé(s) · ${r.items.length - withGrades.length} sans notes`;
    el.innerHTML = withGrades.length ? `<div class="overflow-x-auto"><table class="data-table w-full"><thead><tr><th>Élève</th><th>Niveau</th><th>Parent</th><th>Statut</th><th>Signé le</th><th>Moyenne</th><th>Remarque</th>${App.user.role === 'admin' ? '<th></th>' : ''}</tr></thead><tbody>
      ${withGrades.map(i => `<tr>
        <td class="font-semibold">${esc(i.first_name)} ${esc(i.last_name)}</td><td>${esc(i.level)}</td>
        <td class="text-xs">${esc(i.parent_name || '-')}<br><span class="text-gray-400">${esc(i.parent_phone || '')}</span></td>
        <td>${i.signature ? '<span class="badge badge-green"><i class="fas fa-check mr-1"></i>Signé</span>' : '<span class="badge badge-yellow"><i class="fas fa-hourglass-half mr-1"></i>En attente</span>'}</td>
        <td class="text-xs">${i.signature ? dayjs(i.signature.signed_at).format('DD/MM/YYYY HH:mm') + '<br><span class="text-gray-400">' + esc(i.signature.signer_name || '') + '</span>' : '-'}</td>
        <td>${i.signature ? Number(i.signature.general_average).toFixed(2) : '-'}</td>
        <td class="text-xs italic text-gray-600">${esc(i.signature?.comment || '')}</td>
        ${App.user.role === 'admin' ? `<td class="text-right">${i.signature ? `<button onclick="revokeSignature(${i.signature.id})" class="text-red-600 px-1" title="Annuler la signature"><i class="fas fa-rotate-left"></i></button>` : ''}</td>` : ''}
      </tr>`).join('')}</tbody></table></div>` : '<p class="text-gray-400 text-sm">Aucun élève avec des notes pour ce trimestre.</p>';
  } catch (e) { el.innerHTML = `<p class="text-red-600 text-sm">${esc(e.response?.data?.error || e.message)}</p>`; }
}
async function revokeSignature(id) {
  if (!confirm('Annuler cette signature ? Le parent devra signer de nouveau le bulletin.')) return;
  try { await api.delete(`/bulletin-signatures/${id}`); toast('Signature annulée'); loadSignatureTracking(); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

// ---- Paiement en ligne (Konnect) ----
async function payOnline(feeId) {
  const btn = event?.target?.closest('button'); if (btn) btn.disabled = true;
  try {
    const r = (await api.post('/payments/init', { fee_id: feeId })).data;
    toast('Redirection vers la page de paiement sécurisée…');
    // Vérification au retour de l'onglet (le webhook fait aussi le travail côté serveur)
    const check = async () => { try { const v = (await api.post('/payments/verify', { fee_id: feeId })).data; if (v.status === 'completed') { toast('Paiement confirmé ✅'); render(); } } catch {} };
    const onVis = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', onVis); setTimeout(check, 1500); } };
    document.addEventListener('visibilitychange', onVis);
    window.open(r.pay_url, '_blank') || (location.href = r.pay_url);
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); if (btn) btn.disabled = false; }
}

async function showOnlinePayments() {
  const st = App.cache.payStatus || {};
  let r = { supported: false, items: [] };
  try { r = (await api.get('/payments')).data; } catch (e) {}
  const STL = { pending: ['badge-blue', 'En attente'], completed: ['badge-green', 'Réussi'], failed: ['badge-red', 'Échoué'], expired: ['badge-gray', 'Expiré'], cancelled: ['badge-gray', 'Annulé'] };
  openModal('<i class="fas fa-credit-card text-green-600 mr-2"></i>Paiements en ligne (Konnect)', `
    <div class="rounded-lg p-3 text-sm mb-3 ${st.enabled ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-amber-50 border border-amber-300 text-amber-800'}">
      ${st.enabled ? `<i class="fas fa-circle-check mr-1"></i>Paiement en ligne <b>activé</b> (${esc(st.env)}). Moyens acceptés : ${st.methods.map(esc).join(', ')}. Les parents voient un bouton « Payer en ligne » sur chaque frais impayé ; le frais est validé automatiquement et la quittance envoyée.` :
      `<i class="fas fa-triangle-exclamation mr-1"></i><b>Non activé.</b> Pour l'activer : 1) créez un compte marchand sur <a href="https://konnect.network" target="_blank" class="underline">konnect.network</a> (agrégateur tunisien : cartes bancaires, e-DINAR, Flouci, wallet) ; 2) récupérez la <b>clé API</b> et l'<b>identifiant du wallet</b> ; 3) renseignez les secrets <code>KONNECT_API_KEY</code>, <code>KONNECT_WALLET_ID</code> et <code>KONNECT_ENV=production</code> ; ${r.supported ? '' : '4) exécutez <code>migrations/0013_online_payments.sql</code>.'}</div>`}
    ${r.supported ? `<div class="overflow-x-auto max-h-80"><table class="data-table w-full text-sm"><thead><tr><th>Date</th><th>Élève</th><th>Frais</th><th>Montant</th><th>Statut</th><th>Réf.</th><th></th></tr></thead><tbody>
      ${r.items.map(p => `<tr><td class="text-xs">${fmtDT(p.initiated_at)}</td><td>${esc(p.students?.first_name || '')} ${esc(p.students?.last_name || '')}</td><td class="text-xs">${esc(p.fees?.label || '')}</td><td><b>${(p.amount_millimes / 1000).toFixed(3)} DT</b></td><td><span class="badge ${(STL[p.status] || ['badge-gray'])[0]}">${(STL[p.status] || [0, p.status])[1]}</span></td><td class="font-mono text-[10px] text-gray-400">${esc(p.payment_ref || '')}</td><td>${p.status === 'pending' ? `<button onclick="verifyPayment('${esc(p.payment_ref)}')" class="text-blue-600 text-xs"><i class="fas fa-rotate mr-1"></i>Vérifier</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="text-center text-gray-400 py-6">Aucun paiement en ligne</td></tr>'}</tbody></table></div>` : ''}`, { wide: true });
}
async function verifyPayment(ref) {
  try { const v = (await api.post('/payments/verify', { payment_ref: ref })).data; toast(`Statut : ${v.status}`); showOnlinePayments(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
