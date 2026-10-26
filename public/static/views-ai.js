// ---- Feature 49 : Génération IA de quiz / flashcards / texte à trous / fiche de révision (à partir d'un texte ou d'un PDF) ----
const AI_KINDS = { quiz: 'Quiz (QCM)', flashcards: 'Cartes mémoire', fillblank: 'Texte à trous', summary: 'Fiche de révision' };

async function showAiGenerator(defaultKind) {
  let st = { enabled: false };
  try { st = (await api.get('/ai/status')).data; } catch (e) { return toast(e.response?.data?.error || 'Erreur', 'error'); }
  const level = document.getElementById('ic-level')?.value || '';
  const subjSel = document.getElementById('ic-subject'); const subject = subjSel?.selectedOptions?.[0]?.textContent?.trim() || '';
  const kind = defaultKind || document.querySelector('input[name="ic-type"]:checked')?.value || 'quiz';
  // Modale IA au-dessus du formulaire (conteneur séparé pour ne pas fermer le formulaire en cours)
  document.getElementById('ai-modal')?.remove();
  const wrap = document.createElement('div'); wrap.id = 'ai-modal';
  wrap.className = 'fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4';
  wrap.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
    <div class="flex items-center justify-between px-5 py-3 border-b"><h3 class="font-bold text-gray-800"><i class="fas fa-wand-magic-sparkles text-purple-600 mr-2"></i>Générer avec l'IA <span class="text-gray-400 text-sm font-normal">· إنشاء بالذكاء الاصطناعي</span></h3><button onclick="document.getElementById('ai-modal').remove()" class="text-gray-400 hover:text-gray-700 text-xl">&times;</button></div>
    <div class="p-5">
      ${!st.enabled ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 text-sm mb-3"><i class="fas fa-triangle-exclamation mr-1"></i>La génération IA n'est pas configurée sur le serveur (clé <code>OPENAI_API_KEY</code>). Demandez à l'administrateur.</div>` : `<p class="text-xs text-gray-500 mb-3"><i class="fas fa-shield-halved mr-1"></i>Le texte est envoyé au service IA via le serveur de l'école (clé protégée). Aucune donnée d'élève n'est transmise. Quota : <b>${st.used}/${st.limit}</b> générations aujourd'hui · modèle ${esc(st.model)}.</p>`}
      <div class="grid md:grid-cols-4 gap-3 mb-3">
        <div><label class="${lblCls}">Type</label><select id="ai-kind" class="${inputCls}">${Object.entries(AI_KINDS).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div><label class="${lblCls}">Nombre</label><input type="number" id="ai-count" class="${inputCls}" value="8" min="3" max="20"></div>
        <div><label class="${lblCls}">Difficulté</label><select id="ai-diff" class="${inputCls}"><option value="facile">Facile</option><option value="moyen" selected>Moyen</option><option value="difficile">Difficile</option></select></div>
        <div><label class="${lblCls}">Langue</label><select id="ai-lang" class="${inputCls}"><option value="fr">Français</option><option value="ar">العربية</option></select></div>
      </div>
      <div class="flex flex-wrap gap-2 items-center mb-2">
        <label class="${btnSecondary} text-sm cursor-pointer"><i class="fas fa-file-pdf text-red-600 mr-1"></i> Charger un PDF / TXT<input type="file" accept=".pdf,.txt,.md" class="hidden" onchange="aiLoadFile(this.files[0])"></label>
        <span id="ai-file-info" class="text-xs text-gray-500"></span>
        <span class="text-xs text-gray-400 ml-auto" id="ai-chars">0 caractère</span>
      </div>
      <textarea id="ai-text" class="${inputCls} mb-3" rows="9" placeholder="Collez ici le contenu du cours (leçon, texte, résumé)… ou chargez un PDF ci-dessus." oninput="document.getElementById('ai-chars').textContent = this.value.length + ' caractères'"></textarea>
      <input type="hidden" id="ai-level" value="${esc(level)}"><input type="hidden" id="ai-subject" value="${esc(subject === '-' ? '' : subject)}">
      <div id="ai-result" class="mb-3"></div>
      <div class="flex justify-end gap-2"><button onclick="document.getElementById('ai-modal').remove()" class="${btnSecondary}">Fermer</button><button id="ai-go" onclick="aiGenerate()" class="${btnPrimary} bg-purple-600 hover:bg-purple-700" ${st.enabled ? '' : 'disabled'}><i class="fas fa-wand-magic-sparkles mr-1"></i> Générer</button></div>
    </div></div>`;
  document.body.appendChild(wrap);
}
async function aiLoadFile(file) {
  if (!file) return;
  const info = document.getElementById('ai-file-info'); info.textContent = 'Lecture…';
  try {
    let text = '';
    if (/\.pdf$/i.test(file.name)) {
      if (!window.pdfjsLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }
      const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = Math.min(pdf.numPages, 25);
      for (let i = 1; i <= pages; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(it => it.str).join(' ') + '\n\n'; }
      if (pdf.numPages > pages) text += `\n[… ${pdf.numPages - pages} page(s) non lues]`;
      if (text.trim().length < 80) { info.innerHTML = '<span class="text-red-600">Ce PDF ne contient pas de texte sélectionnable (scan/image). Collez le texte manuellement.</span>'; return; }
    } else text = await file.text();
    const ta = document.getElementById('ai-text'); ta.value = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 24000);
    document.getElementById('ai-chars').textContent = ta.value.length + ' caractères';
    info.innerHTML = `<span class="badge badge-green">${esc(file.name)}</span>`;
  } catch (e) { info.innerHTML = `<span class="text-red-600">Lecture impossible : ${esc(e.message)}</span>`; }
}
async function aiGenerate() {
  const btn = document.getElementById('ai-go'), out = document.getElementById('ai-result');
  const payload = { kind: document.getElementById('ai-kind').value, count: Number(document.getElementById('ai-count').value) || 8, difficulty: document.getElementById('ai-diff').value, lang: document.getElementById('ai-lang').value, level: document.getElementById('ai-level').value, subject: document.getElementById('ai-subject').value, text: document.getElementById('ai-text').value };
  if (payload.text.trim().length < 80) return toast('Texte trop court (80 caractères minimum)', 'error');
  btn.disabled = true; out.innerHTML = '<div class="text-sm text-purple-700 bg-purple-50 rounded-lg p-3"><i class="fas fa-spinner fa-spin mr-1"></i>Génération en cours (10 à 40 secondes)…</div>';
  try {
    const r = (await api.post('/ai/generate', payload, { timeout: 90000 })).data;
    App.cache.aiResult = r;
    out.innerHTML = aiPreview(r) + `<div class="flex flex-wrap gap-2 mt-3">
      ${r.kind === 'summary' ? `<button onclick="aiPrintSummary()" class="${btnPrimary} text-sm"><i class="fas fa-print mr-1"></i> Imprimer / PDF la fiche</button><button onclick="aiSaveSummaryAsCourse()" class="${btnSecondary} text-sm"><i class="fas fa-book mr-1"></i> Enregistrer dans Cours & Documents</button>` : `<button onclick="aiApplyToForm()" class="${btnPrimary} text-sm"><i class="fas fa-file-import mr-1"></i> Insérer dans le formulaire</button>`}
      <button onclick="aiGenerate()" class="${btnSecondary} text-sm"><i class="fas fa-rotate mr-1"></i> Régénérer</button>
      <span class="text-xs text-gray-400 self-center ml-auto">${r.used}/${r.limit} aujourd'hui</span></div>`;
  } catch (e) { out.innerHTML = `<div class="text-sm text-red-700 bg-red-50 rounded-lg p-3"><i class="fas fa-circle-xmark mr-1"></i>${esc(e.response?.data?.error || e.message)}</div>`; }
  btn.disabled = false;
}
function aiPreview(r) {
  const d = r.data;
  if (r.kind === 'quiz') return `<div class="border rounded-lg p-3 max-h-64 overflow-y-auto text-sm"><b>${esc(d.title || 'Quiz')}</b> — ${d.questions.length} question(s)<ol class="list-decimal ml-5 mt-2 space-y-2">${d.questions.map(q => `<li>${esc(q.question)}<ul class="ml-3 text-xs">${q.options.map((o, i) => `<li class="${i === q.correct ? 'text-green-700 font-bold' : 'text-gray-600'}">${i === q.correct ? '✔' : '•'} ${esc(o)}</li>`).join('')}</ul>${q.explanation ? `<div class="text-[11px] text-gray-400 italic">${esc(q.explanation)}</div>` : ''}</li>`).join('')}</ol></div>`;
  if (r.kind === 'flashcards') return `<div class="border rounded-lg p-3 max-h-64 overflow-y-auto text-sm"><b>${esc(d.title || 'Cartes')}</b> — ${d.cards.length} carte(s)<table class="w-full text-xs mt-2">${d.cards.map(c => `<tr class="border-t"><td class="py-1 pr-2 font-semibold">${esc(c.front)}</td><td class="py-1 text-gray-600">${esc(c.back)}</td></tr>`).join('')}</table></div>`;
  if (r.kind === 'fillblank') return `<div class="border rounded-lg p-3 max-h-64 overflow-y-auto text-sm"><b>${esc(d.title || 'Texte à trous')}</b><p class="mt-2 leading-relaxed">${esc(d.text).replace(/\[([^\]]+)\]/g, '<mark class="bg-yellow-100 font-bold">[$1]</mark>')}</p></div>`;
  return `<div class="border rounded-lg p-3 max-h-72 overflow-y-auto text-sm" id="ai-summary-preview"><h4 class="font-bold text-base text-blue-800">${esc(d.title || 'Fiche de révision')}</h4><p class="mt-2 text-gray-700 whitespace-pre-line">${esc(d.summary || '')}</p>
    ${d.key_points?.length ? `<h5 class="font-bold mt-3">Points clés</h5><ul class="list-disc ml-5">${d.key_points.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
    ${d.definitions?.length ? `<h5 class="font-bold mt-3">Définitions</h5><dl>${d.definitions.map(x => `<dt class="font-semibold inline">${esc(x.term)} :</dt> <dd class="inline text-gray-700">${esc(x.definition)}</dd><br>`).join('')}</dl>` : ''}
    ${d.exercises?.length ? `<h5 class="font-bold mt-3">Exercices</h5><ol class="list-decimal ml-5">${d.exercises.map(x => `<li>${esc(x.question)}<div class="text-xs text-green-700">Corrigé : ${esc(x.answer)}</div></li>`).join('')}</ol>` : ''}</div>`;
}
function aiApplyToForm() {
  const r = App.cache.aiResult; if (!r) return;
  const d = r.data;
  const setType = k => { const radio = document.querySelector(`input[name="ic-type"][value="${k}"]`); if (radio && !radio.checked) { radio.checked = true; if (typeof onIcTypeChange === 'function') onIcTypeChange(k); } };
  const title = document.getElementById('ic-title'), desc = document.getElementById('ic-desc');
  if (title && !title.value.trim() && d.title) title.value = d.title;
  if (desc && !desc.value.trim() && d.description) desc.value = d.description;
  if (r.kind === 'quiz') { setType('quiz'); App.cache.editingQuestions = d.questions.map(q => ({ question: q.question, options: [...q.options, '', '', '', ''].slice(0, 4), correct: q.correct })); if (typeof renderQuizQuestions === 'function') renderQuizQuestions(); }
  else if (r.kind === 'flashcards') { setType('flashcards'); App.cache.editingCards = d.cards.map(c => ({ front: c.front, back: c.back })); if (typeof renderFlashcardEditor === 'function') renderFlashcardEditor(); }
  else if (r.kind === 'fillblank') { setType('fillblank'); const ta = document.getElementById('ic-fbtext'); if (ta) ta.value = d.text; }
  document.getElementById('ai-modal')?.remove();
  toast('Contenu inséré — relisez, ajustez puis enregistrez ✅');
}
function aiPrintSummary() {
  const r = App.cache.aiResult; if (!r || r.kind !== 'summary') return;
  const d = r.data; const lvl = document.getElementById('ai-level')?.value || ''; const subj = document.getElementById('ai-subject')?.value || '';
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(d.title || 'Fiche de révision')}</title>
  <style>@page{size:A4;margin:16mm}body{font-family:Georgia,serif;color:#111;line-height:1.5;position:relative}h1{color:#1e40af;border-bottom:2px solid #1e40af;padding-bottom:4px;font-size:22px}h2{color:#1e40af;font-size:15px;margin-top:18px}header{display:flex;align-items:center;gap:12px;margin-bottom:10px}header img{width:56px;height:56px;object-fit:contain}header .s{font-size:12px;color:#555}.wm{position:fixed;top:35%;left:25%;width:50%;opacity:.05;z-index:-1}dt{font-weight:bold;display:inline}dd{display:inline;margin:0}.ex li{margin-bottom:6px}.ans{color:#166534;font-size:12px}footer{position:fixed;bottom:6mm;left:0;right:0;text-align:center;font-size:10px;color:#888}</style></head><body>
  <img class="wm" src="${brandLogoAbs()}"><header><img src="${brandLogoAbs()}"><div><b>${esc(brandName())}</b><div class="s">Fiche de révision${lvl ? ' — ' + esc(LEVEL_LABELS[lvl] || lvl) : ''}${subj ? ' — ' + esc(subj) : ''} · ${dayjs().format('DD/MM/YYYY')}</div></div></header>
  <h1>${esc(d.title || 'Fiche de révision')}</h1><p style="white-space:pre-line">${esc(d.summary || '')}</p>
  ${d.key_points?.length ? `<h2>Points clés</h2><ul>${d.key_points.map(k => `<li>${esc(k)}</li>`).join('')}</ul>` : ''}
  ${d.definitions?.length ? `<h2>Définitions</h2><dl>${d.definitions.map(x => `<div><dt>${esc(x.term)} :</dt> <dd>${esc(x.definition)}</dd></div>`).join('')}</dl>` : ''}
  ${d.exercises?.length ? `<h2>Exercices</h2><ol class="ex">${d.exercises.map(x => `<li>${esc(x.question)}</li>`).join('')}</ol><h2>Corrigé</h2><ol class="ex">${d.exercises.map(x => `<li class="ans">${esc(x.answer)}</li>`).join('')}</ol>` : ''}
  <footer>Rahma Academy — fiche générée avec l'aide de l'IA, relue par l'enseignant</footer><script>setTimeout(()=>window.print(),400)</script></body></html>`);
  w.document.close();
}
async function aiSaveSummaryAsCourse() {
  const r = App.cache.aiResult; if (!r || r.kind !== 'summary') return;
  const d = r.data; const lvl = document.getElementById('ai-level')?.value || null;
  const md = `${d.summary || ''}\n\nPOINTS CLÉS\n${(d.key_points || []).map(k => '• ' + k).join('\n')}\n\nDÉFINITIONS\n${(d.definitions || []).map(x => `${x.term} : ${x.definition}`).join('\n')}\n\nEXERCICES\n${(d.exercises || []).map((x, i) => `${i + 1}. ${x.question}\n   → ${x.answer}`).join('\n')}`;
  try {
    await api.post('/db/courses', { title: d.title || 'Fiche de révision', description: md.slice(0, 8000), level: lvl, cycle: lvl ? cycleOfLevel(lvl) : 'primaire', file_type: 'text' });
    toast('Fiche enregistrée dans Cours & Documents ✅'); document.getElementById('ai-modal')?.remove();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
