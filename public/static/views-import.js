// ---- Feature 46 : Import Excel en masse (élèves / notes) ----
// Colonnes attendues (en-têtes souples : on reconnaît plusieurs libellés FR/EN/AR)
const IMPORT_SPECS = {
  students: {
    title: 'Importer des élèves', icon: 'fa-user-graduate', endpoint: '/admin/import/students', adminOnly: true,
    columns: [
      ['national_id', 'Identifiant (12 chiffres)', ['identifiant', 'id', 'national_id', 'matricule', 'المعرف', 'identifiant national', 'identifiant élève', 'identifiant eleve'], true],
      ['first_name', 'Prénom', ['prénom', 'prenom', 'first_name', 'firstname', 'الاسم'], true],
      ['last_name', 'Nom', ['nom', 'last_name', 'lastname', 'nom de famille', 'اللقب'], true],
      ['birth_date', 'Date de naissance', ['date de naissance', 'naissance', 'birth_date', 'birthdate', 'né le', 'ne le', 'تاريخ الولادة'], false],
      ['gender', 'Sexe (M/F)', ['sexe', 'genre', 'gender', 'الجنس'], false],
      ['level', 'Niveau (ex. 6AP)', ['niveau', 'level', 'classe niveau', 'المستوى'], true],
      ['class_name', 'Classe (ex. 6AP-A)', ['classe', 'class', 'class_name', 'groupe', 'القسم'], false],
      ['parent_name', 'Nom du parent', ['parent', 'nom du parent', 'parent_name', 'tuteur', 'الولي'], false],
      ['parent_phone', 'Téléphone parent', ['téléphone', 'telephone', 'tel', 'phone', 'parent_phone', 'gsm', 'الهاتف'], false],
      ['parent_email', 'Email parent', ['email', 'e-mail', 'mail', 'parent_email', 'البريد'], false],
      ['address', 'Adresse', ['adresse', 'address', 'العنوان'], false],
      ['monthly_fee', `Mensualité (${brandCurrency()})`, ['mensualité', 'mensualite', 'frais', 'monthly_fee', 'المعلوم'], false]
    ],
    sample: [{ 'Identifiant (12 chiffres)': '123456789012', 'Prénom': 'Ahmed', 'Nom': 'BEN ALI', 'Date de naissance': '12/05/2015', 'Sexe (M/F)': 'M', 'Niveau (ex. 6AP)': '6AP', 'Classe (ex. 6AP-A)': '6AP-A', 'Nom du parent': 'Mohamed BEN ALI', 'Téléphone parent': '+21620000000', 'Email parent': 'parent@example.com', 'Adresse': 'Messadine', [`Mensualité (${brandCurrency()})`]: 60 }],
    options: () => `<label class="flex items-center gap-2 text-sm"><input type="checkbox" id="imp-update"> Mettre à jour les élèves déjà enregistrés (même identifiant) au lieu de les ignorer</label>`,
    extraPayload: () => ({ mode: document.getElementById('imp-update')?.checked ? 'update' : 'skip' }),
    reportCols: r => `<td class="font-mono text-xs">${esc(r.national_id || '')}</td><td>${esc(r.name)}</td><td>${esc(r.level || '-')}</td>`,
    reportHead: '<th>Identifiant</th><th>Élève</th><th>Niveau</th>',
    resultLine: s => `${s.inserted ?? s.insert} ajouté(s), ${s.updated ?? s.update} mis à jour, ${s.skip} ignoré(s), ${s.error + (s.failed || 0)} en erreur`
  },
  grades: {
    title: 'Importer des notes', icon: 'fa-star', endpoint: '/admin/import/grades', adminOnly: false,
    columns: [
      ['national_id', 'Identifiant élève', ['identifiant', 'id', 'national_id', 'matricule', 'المعرف'], false],
      ['student_name', 'Élève (Prénom Nom)', ['élève', 'eleve', 'nom', 'student', 'student_name', 'nom complet', 'التلميذ'], false],
      ['subject', 'Matière', ['matière', 'matiere', 'subject', 'المادة'], true],
      ['trimester', 'Trimestre (1-3)', ['trimestre', 'trimester', 'tri', 'الثلاثي'], true],
      ['exam_type', 'Type (controle/devoir1/devoir2/examen/oral/synthese)', ['type', 'exam_type', 'épreuve', 'epreuve', 'نوع'], false],
      ['score', 'Note', ['note', 'score', 'العدد', 'resultat', 'résultat'], true],
      ['max_score', 'Barème (défaut 20)', ['barème', 'bareme', 'max', 'max_score', 'sur'], false],
      ['comment', 'Commentaire', ['commentaire', 'comment', 'observation', 'appréciation', 'appreciation', 'ملاحظة'], false],
      ['date', 'Date', ['date', 'التاريخ'], false]
    ],
    sample: [{ 'Identifiant élève': '123456789012', 'Élève (Prénom Nom)': 'Ahmed BEN ALI', 'Matière': 'Français', 'Trimestre (1-3)': 1, 'Type (controle/devoir1/devoir2/examen/oral/synthese)': 'devoir1', 'Note': 14.5, 'Barème (défaut 20)': 20, 'Commentaire': 'Bien', 'Date': '15/10/2026' }],
    options: () => `<p class="text-xs text-gray-500">L'élève est reconnu par son identifiant (recommandé) ou, à défaut, par « Prénom Nom ». Les matières doivent exister dans <i>Matières</i>.</p>`,
    extraPayload: () => ({}),
    reportCols: r => `<td>${esc(r.student || '')}</td><td>${esc(r.subject || '')} · T${r.trimester || '?'} · ${esc(r.exam_type || '')}</td><td><b>${r.score ?? ''}</b>/${r.max_score ?? 20}</td>`,
    reportHead: '<th>Élève</th><th>Matière</th><th>Note</th>',
    resultLine: s => `${s.inserted ?? s.insert} note(s) ajoutée(s), ${s.error + (s.failed || 0)} en erreur`
  }
};
const _impNorm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ').trim();

function openImport(kind) {
  const spec = IMPORT_SPECS[kind]; if (!spec) return;
  if (spec.adminOnly && App.user.role !== 'admin') return toast('Réservé à l\u2019administrateur', 'error');
  if (isReadOnlyYear()) return toast('Année scolaire clôturée : import impossible', 'error');
  App.cache.imp = { kind, rows: null, mapping: null };
  openModal(`<i class="fas ${spec.icon} text-blue-600 mr-2"></i>${spec.title}`, `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-3">
      <b><i class="fas fa-list-ol mr-1"></i>Étapes</b> : 1) téléchargez le modèle et remplissez-le (ou utilisez votre propre fichier : les colonnes sont reconnues par leur en-tête) → 2) choisissez le fichier → 3) vérifiez la <b>simulation</b> → 4) importez. Rien n'est enregistré avant l'étape 4.
    </div>
    <div class="flex flex-wrap gap-2 mb-3">
      <button onclick="downloadImportTemplate('${kind}')" class="${btnSecondary} text-sm"><i class="fas fa-file-excel text-green-600 mr-1"></i> Télécharger le modèle Excel</button>
      <label class="${btnPrimary} text-sm cursor-pointer"><i class="fas fa-upload mr-1"></i> Choisir un fichier (.xlsx / .csv)<input type="file" accept=".xlsx,.xls,.csv" class="hidden" onchange="importFileChosen(this.files[0])"></label>
    </div>
    <div class="mb-3">${spec.options()}</div>
    <div id="imp-preview" class="text-sm text-gray-400">Aucun fichier chargé.</div>
    <div class="flex justify-end gap-2 mt-4">
      <button onclick="closeModal()" class="${btnSecondary}">Fermer</button>
      <button id="imp-sim" onclick="runImport(true)" class="${btnSecondary} hidden"><i class="fas fa-vial mr-1"></i> Simuler</button>
      <button id="imp-go" onclick="runImport(false)" class="${btnPrimary} hidden" disabled><i class="fas fa-database mr-1"></i> Importer</button>
    </div>`, { wide: true });
}
function downloadImportTemplate(kind) {
  const spec = IMPORT_SPECS[kind];
  const ws = XLSX.utils.json_to_sheet(spec.sample); ws['!cols'] = spec.columns.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, kind === 'students' ? 'Élèves' : 'Notes');
  const help = XLSX.utils.aoa_to_sheet([['Colonne', 'Obligatoire', 'Remarques'], ...spec.columns.map(([k, label, , req]) => [label, req ? 'oui' : 'non', k === 'level' ? '1AP…6AP, 7AB…9AB, 1AS…4AS' : k === 'birth_date' || k === 'date' ? 'JJ/MM/AAAA' : k === 'gender' ? 'M ou F' : k === 'exam_type' ? 'controle, devoir1, devoir2, examen, oral, synthese' : ''])]);
  help['!cols'] = [{ wch: 45 }, { wch: 12 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, help, 'Aide');
  XLSX.writeFile(wb, `modele_import_${kind === 'students' ? 'eleves' : 'notes'}.xlsx`);
}
async function importFileChosen(file) {
  if (!file) return;
  const spec = IMPORT_SPECS[App.cache.imp.kind];
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  const headerIdx = aoa.findIndex(r => r.filter(x => String(x).trim()).length >= 2);
  if (headerIdx < 0) return toast('Fichier vide', 'error');
  const headers = aoa[headerIdx].map(h => _impNorm(h));
  // correspondance en-tête → champ
  const mapping = {}; const unmatched = [];
  spec.columns.forEach(([key, label, aliases]) => {
    const idx = headers.findIndex(h => h && (h === _impNorm(label) || aliases.some(a => h === _impNorm(a)) || aliases.some(a => h.startsWith(_impNorm(a) + ' ')) ));
    if (idx >= 0) mapping[key] = idx;
  });
  headers.forEach((h, i) => { if (h && !Object.values(mapping).includes(i)) unmatched.push(aoa[headerIdx][i]); });
  const missing = spec.columns.filter(([k, , , req]) => req && mapping[k] === undefined && !(App.cache.imp.kind === 'grades' && k === 'subject' && false));
  const rows = aoa.slice(headerIdx + 1).map((r, i) => { const o = { _line: headerIdx + i + 2 }; for (const [k, idx] of Object.entries(mapping)) o[k] = r[idx]; return o; }).filter(o => Object.keys(o).some(k => k !== '_line' && String(o[k]).trim() !== ''));
  App.cache.imp.rows = rows; App.cache.imp.mapping = mapping; App.cache.imp.report = null;
  const prev = document.getElementById('imp-preview');
  prev.innerHTML = `
    <div class="flex flex-wrap gap-2 items-center mb-2"><span class="badge badge-blue">${file.name}</span><span class="text-xs text-gray-500">${rows.length} ligne(s) de données</span></div>
    <div class="text-xs mb-2"><b>Colonnes reconnues :</b> ${Object.keys(mapping).map(k => `<span class="badge badge-green">${esc(spec.columns.find(c => c[0] === k)[1])}</span>`).join(' ') || '—'}</div>
    ${unmatched.length ? `<div class="text-xs mb-2 text-gray-500"><b>Ignorées :</b> ${unmatched.map(esc).join(', ')}</div>` : ''}
    ${missing.length ? `<div class="text-xs text-red-600 mb-2"><i class="fas fa-triangle-exclamation mr-1"></i>Colonnes obligatoires absentes : ${missing.map(m => `<b>${esc(m[1])}</b>`).join(', ')}. Renommez les en-têtes ou utilisez le modèle.</div>` : ''}
    <div class="overflow-x-auto max-h-48 border rounded"><table class="data-table w-full text-xs"><thead><tr><th>#</th>${Object.keys(mapping).map(k => `<th>${esc(spec.columns.find(c => c[0] === k)[1])}</th>`).join('')}</tr></thead>
    <tbody>${rows.slice(0, 8).map(r => `<tr><td class="text-gray-400">${r._line}</td>${Object.keys(mapping).map(k => `<td>${esc(String(r[k] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length > 8 ? `<p class="text-xs text-gray-400 mt-1">… et ${rows.length - 8} autre(s) ligne(s)</p>` : ''}
    <div id="imp-report" class="mt-3"></div>`;
  document.getElementById('imp-sim').classList.toggle('hidden', !!missing.length || !rows.length);
  const go = document.getElementById('imp-go'); go.classList.toggle('hidden', !!missing.length || !rows.length); go.disabled = true;
}
async function runImport(dry) {
  const imp = App.cache.imp; const spec = IMPORT_SPECS[imp.kind];
  if (!imp.rows?.length) return;
  if (!dry && !confirm(`Importer définitivement ${imp.rows.length} ligne(s) ? Les lignes en erreur seront ignorées.`)) return;
  const sim = document.getElementById('imp-sim'), go = document.getElementById('imp-go'); sim.disabled = go.disabled = true;
  const rep = document.getElementById('imp-report'); rep.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>' + (dry ? 'Simulation…' : 'Import en cours…');
  try {
    const r = (await api.post(spec.endpoint, { rows: imp.rows, dry_run: dry, ...spec.extraPayload() })).data;
    const s = r.summary; const errs = r.report.filter(x => x.action === 'error'); const fails = r.failures || [];
    rep.innerHTML = `
      <div class="rounded-lg p-3 text-sm ${dry ? 'bg-blue-50 border border-blue-200 text-blue-900' : 'bg-green-50 border border-green-300 text-green-800'}">
        <b><i class="fas ${dry ? 'fa-vial' : 'fa-circle-check'} mr-1"></i>${dry ? 'Simulation' : 'Import terminé'}</b> — ${spec.resultLine(s)}.
        ${dry ? '<br><span class="text-xs">Aucune donnée enregistrée. Corrigez les erreurs puis cliquez sur « Importer ».</span>' : ''}
      </div>
      ${errs.length ? `<details class="mt-2" open><summary class="text-sm font-semibold text-red-700 cursor-pointer">${errs.length} ligne(s) en erreur</summary>
        <div class="overflow-x-auto max-h-56 border rounded mt-1"><table class="data-table w-full text-xs"><thead><tr><th>Ligne</th>${spec.reportHead}<th>Erreurs</th></tr></thead>
        <tbody>${errs.map(x => `<tr><td>${x.line}</td>${spec.reportCols(x)}<td class="text-red-600">${x.errors.map(esc).join(' ; ')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
      ${fails.length ? `<div class="text-xs text-red-600 mt-2"><b>Échecs base de données :</b> ${fails.map(f => `${esc(f.name || f.student_id)} (${esc(f.error)})`).join(' ; ')}</div>` : ''}
      ${dry && r.report.some(x => x.action === 'skip') ? `<details class="mt-2"><summary class="text-sm text-gray-600 cursor-pointer">${s.skip} ligne(s) ignorée(s) — déjà enregistrées</summary><div class="text-xs text-gray-500 mt-1">${r.report.filter(x => x.action === 'skip').map(x => `L${x.line} ${esc(x.name)} → existe : ${esc(x.existing)}`).join('<br>')}</div></details>` : ''}
      ${dry ? `<button onclick="exportImportReport()" class="${btnSecondary} text-xs mt-2"><i class="fas fa-file-excel text-green-600 mr-1"></i> Exporter le rapport</button>` : ''}`;
    imp.report = r.report;
    if (dry) { go.disabled = (s.insert + (s.update || 0)) === 0; sim.disabled = false; }
    else { toast('Import terminé'); go.classList.add('hidden'); sim.classList.add('hidden'); App.cache.studentsList = null; if (imp.kind === 'students') App.cache.kidsById = null; setTimeout(() => { if (App.route !== 'settings') render(); }, 300); }
  } catch (e) { rep.innerHTML = `<p class="text-red-600 text-sm">${esc(e.response?.data?.error || e.message)}</p>`; sim.disabled = false; go.disabled = true; }
}
function exportImportReport() {
  const imp = App.cache.imp; if (!imp?.report) return;
  const ws = XLSX.utils.json_to_sheet(imp.report.map(r => ({ Ligne: r.line, ...Object.fromEntries(Object.entries(r).filter(([k]) => !['line', 'errors', 'action'].includes(k))), Action: r.action, Erreurs: (r.errors || []).join(' ; ') })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rapport'); XLSX.writeFile(wb, `rapport_import_${imp.kind}_${dayjs().format('YYYY-MM-DD_HHmm')}.xlsx`);
}
