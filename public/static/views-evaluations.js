/* ============================================================
   Rahma Academy - Feature 54 : Constructeur d'évaluations (التقييمات)
   Enseignant/Admin : construire (manuel, depuis un cours / support téléversé, IA), aperçu, PDF fiche, publier, corriger.
   Élève/Parent : passer en ligne, voir le résultat.
   ============================================================ */

const EVA_KINDS = { prerequis: 'Évaluation des prérequis', controle: 'Contrôle', synthese: 'Évaluation de synthèse', devoir: 'Devoir de contrôle', examen: 'Examen' };
const EVA_TYPES = {
  mcq:       { label: 'QCM / J\'entoure la bonne réponse', icon: 'fa-list-ul', auto: true },
  truefalse: { label: 'Oui / Non (croix devant la bonne réponse)', icon: 'fa-check-square', auto: true },
  match:     { label: 'Je relie par une flèche', icon: 'fa-arrows-left-right', auto: true },
  strike:    { label: 'Je barre ce qui est faux', icon: 'fa-strikethrough', auto: true },
  fill:      { label: 'Je complète (mots du cadre)', icon: 'fa-i-cursor', auto: true },
  conjug:    { label: 'Je conjugue (verbes entre parenthèses)', icon: 'fa-spell-check', auto: true },
  quote:     { label: 'Je relève la phrase du texte', icon: 'fa-quote-left', auto: false },
  open:      { label: 'Production écrite / réponse rédigée', icon: 'fa-pen-fancy', auto: false }
};
const EVA = { doc: null, id: null, sources: null };
const evaTotal = doc => (doc.sections || []).reduce((n, s) => n + (s.items || []).reduce((m, it) => m + (Number(it.points) || 0), 0), 0);

// Modèle intégré : fiche Français 5AP « Macaron, le petit mouton » (évaluation des prérequis)
function evaTemplateFr5() {
  return { title: 'Évaluation des prérequis — Français', kind: 'prerequis', level: '5AP', lang: 'fr', trimester: 1, duration_min: 60, sections: [
    { title: 'Lecture - compréhension', subtitle: 'Je lis le texte puis je réponds aux questions.', text_title: 'Macaron, le petit mouton', text: `Dans le pré, Lison et sa sœur Marion jouent au ballon.\nMacaron, le petit mouton, les regarde avec des yeux ronds.\n– Mais que veut donc ce mouton ? demande Marion à son frère.\n– Il a peut-être faim, répond Lison.\n\nLa petite fille cherche dans ses poches.\nElle trouve trois bonbons.\nElle les donne à Macaron.\n\nLe petit mouton secoue la tête tristement : il n'a pas faim.\nD'ailleurs, il n'aime pas les bonbons.\n– Il a peut-être froid, dit Lison.\n\nLa fillette enlève son bonnet et le met sur la tête du mouton.\nLe bonnet lui tombe sur les yeux, ce qui le rend furieux.\nLison lui lance alors le ballon.\nLe petit mouton le rattrape avec la tête.\nIl gambade. Il aime jouer au ballon.`, items: [
      { type: 'match', consigne: 'Je relie par une flèche.', pairs: [{ left: 'Macaron', right: 1 }], rights: ['est un petit chat.', 'est un petit mouton.', 'est un petit lapin.'], points: 1 },
      { type: 'strike', consigne: 'Je barre ce qui est faux.', subject: 'Macaron', options: [{ text: 'veut manger des bonbons.', false: true }, { text: 'veut jouer au ballon.', false: false }], points: 1 },
      { type: 'quote', consigne: 'Je relève la phrase du texte qui justifie ma réponse.', question: 'Macaron veut jouer au ballon.', answer: 'Il aime jouer au ballon.', points: 1 },
      { type: 'truefalse', consigne: 'Je mets une croix devant la bonne réponse.', question: 'Le petit mouton est content d\'avoir un bonnet.', correct: 1, points: 1 },
      { type: 'quote', consigne: 'J\'écris la phrase qui le dit.', question: 'Le petit mouton n\'est pas content d\'avoir un bonnet.', answer: 'Le bonnet lui tombe sur les yeux, ce qui le rend furieux.', points: 1 },
      { type: 'mcq', consigne: 'J\'entoure la bonne réponse.', question: 'Le mouton gambade :', options: ['le mouton court.', 'le mouton se couche.'], correct: 0, points: 1 },
      { type: 'mcq', consigne: 'J\'entoure la bonne réponse.', question: 'Dans le pré :', options: ['dans un jardin.', 'dans un champ.'], correct: 1, points: 1 }
    ] },
    { title: 'Production écrite', subtitle: 'J\'écris une petite histoire en respectant les images.', text: null, items: [
      { type: 'open', consigne: 'J\'écris une petite histoire en respectant les images.', prompt: 'Pendant les vacances, Laure prend son chat et va chez son grand-père. Tous les trois sont heureux d\'être ensemble. Un matin, le facteur sonne à la porte et donne une lettre à grand-père puis s\'en va. Plus tard, Laure sort chercher son chat mais elle ne le trouve pas.\n\nImages : 1) Laure demande à grand-père où est le chat  2) Laure cherche sous la voiture  3) Grand-père cherche dans le jardin  4) Le facteur revient à vélo avec un panier  5) Le facteur sonne : le chat était dans son sac !', criteria: ['Respect des images (5 phrases, une par image)', 'Phrases correctes (majuscule, point)', 'Vocabulaire adapté', 'Orthographe', 'Présentation / écriture soignée'], lines: 12, points: 5 }
    ] },
    { title: 'Langue', subtitle: '', text: null, items: [
      { type: 'conjug', consigne: 'Je complète avec les verbes entre parenthèses au présent.', text: 'Marion et son frère (être) ___ dans le jardin.\nLe petit mouton (aller) ___ près des enfants.\nIl (être) ___ triste.\nLa petite fille (avoir) ___ des bonbons dans sa poche. Elle en donne un au mouton.\nMacaron est content. Il (faire) ___ des sauts.\nMaintenant, les enfants (finir) ___ de jouer.', blanks: [{ verb: 'être', answer: 'sont' }, { verb: 'aller', answer: 'va' }, { verb: 'être', answer: 'est' }, { verb: 'avoir', answer: 'a' }, { verb: 'faire', answer: 'fait' }, { verb: 'finir', answer: 'finissent' }], points: 3 },
      { type: 'fill', consigne: 'Je lis les mots suivants puis je complète le paragraphe avec les mots du cadre.', words: ['sa laine', 'des yeux', 'ses oreilles', 'ronds', 'noires', 'blanches'], text: 'Marion parle avec son amie Julie. Elle lui dit : « Mon mouton a ___ ___ , ___ est ___ . ___ sont ___ . »', blanks: [{ answer: 'des yeux' }, { answer: 'ronds' }, { answer: 'sa laine' }, { answer: 'blanche', alt: ['blanches'] }, { answer: 'ses oreilles' }, { answer: 'noires' }], points: 3 },
      { type: 'fill', consigne: 'J\'écoute et je complète par les mots.', dictation: 'Marion et son frère Lison habitent à la campagne, loin de la ville. Ils aiment beaucoup les animaux. Ils se lèvent tôt le matin pour jouer avec les petites bêtes.', text: 'Marion et son ___ Lison habitent à la ___ , ___ la ville.\nIls aiment ___ les animaux.\nIls se lèvent ___ le ___ pour jouer avec les petites bêtes.', blanks: [{ answer: 'frère' }, { answer: 'campagne' }, { answer: 'loin de' }, { answer: 'beaucoup' }, { answer: 'tôt' }, { answer: 'matin' }], points: 2 }
    ] }
  ] };
}

/* ======================= VUE PRINCIPALE ======================= */
VIEWS.evaluations = async function(el) {
  const r = (await api.get('/evaluations' + (App.cache.evaAll && App.user.role === 'teacher' ? '?mine=0' : ''))).data;
  if (!r.supported) { el.innerHTML = pageHeader('Évaluations', 'fa-file-signature') + `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-4 text-sm"><i class="fas fa-triangle-exclamation mr-2"></i>Le module Évaluations nécessite l'exécution de <code>migrations/0014_evaluations.sql</code> dans Supabase SQL Editor.</div>`; return; }
  App.cache.evaItems = r.items;
  if (isStaff()) return renderEvaStaff(el, r.items);
  if (!App.cache.kidsById) { App.cache.kidsById = {}; try { if (linkedIds().length) (await api.get('/db/students')).data.forEach(s => { App.cache.kidsById[s.id] = s; }); } catch {} }
  return renderEvaFamily(el, r.items);
};

function evaStatusBadge(e) { return e.status === 'closed' ? '<span class="badge badge-gray"><i class="fas fa-lock mr-1"></i>Clôturée</span>' : e.status === 'draft' ? '<span class="badge badge-yellow">Brouillon</span>' : '<span class="badge badge-green">Publiée</span>'; }

function renderEvaStaff(el, items) {
  const filter = App.cache.evaFilter || 'all';
  const list = items.filter(e => filter === 'all' ? true : e.status === filter);
  el.innerHTML = pageHeader('Évaluations <span class="text-gray-400 text-base font-normal">· التقييمات</span>', 'fa-file-signature',
    isReadOnlyYear() ? '' : `<button onclick="evaNew()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvelle évaluation</button>`) + `
  <div class="bg-white rounded-xl shadow mb-4 p-4 flex flex-wrap gap-3 items-center">
    <div class="flex gap-1">${[['all', 'Toutes'], ['draft', 'Brouillons'], ['published', 'Publiées'], ['closed', 'Clôturées']].map(([k, l]) => `<button onclick="App.cache.evaFilter='${k}'; render()" class="px-3 py-1.5 rounded-lg text-sm font-semibold ${filter === k ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}">${l}</button>`).join('')}</div>
    ${App.user.role === 'teacher' ? `<label class="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" ${App.cache.evaAll ? 'checked' : ''} onchange="App.cache.evaAll=this.checked; render()" class="w-4 h-4"> Voir aussi celles des autres enseignants de mes niveaux</label>` : ''}
    <span class="ml-auto text-xs text-gray-500"><i class="fas fa-lightbulb text-amber-500 mr-1"></i>Construisez à partir d'un cours, d'un support téléversé (PDF), d'un texte ou avec l'IA — puis imprimez la fiche ou publiez-la en ligne.</span>
  </div>
  ${!list.length ? `<div class="bg-white rounded-xl shadow p-10 text-center text-gray-400"><i class="fas fa-file-signature text-4xl mb-3"></i><p>Aucune évaluation.</p>${isReadOnlyYear() ? '' : `<button onclick="evaNew()" class="${btnPrimary} mt-4"><i class="fas fa-plus mr-1"></i> Créer la première</button> <button onclick="evaNew(evaTemplateFr5())" class="${btnSecondary} mt-4"><i class="fas fa-file-import mr-1"></i> Charger le modèle Français 5AP</button>`}</div>` : ''}
  <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
    ${list.map(e => `<article class="bg-white rounded-xl shadow p-5 flex flex-col ${e.status === 'closed' ? 'opacity-75' : ''}">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="min-w-0"><h3 class="font-bold text-gray-800 truncate">${esc(e.title)}</h3>
          <p class="text-xs text-gray-500">${esc(EVA_KINDS[e.kind] || e.kind)} · ${e.subjects?.name ? esc(e.subjects.name) + ' · ' : ''}<span class="badge badge-blue">${esc(e.level)}</span>${e.teachers ? ' · ' + esc(e.teachers.first_name + ' ' + e.teachers.last_name) : ''}</p></div>
        ${evaStatusBadge(e)}
      </div>
      <div class="flex gap-2 text-[11px] text-gray-500 mb-3 flex-wrap"><span class="badge badge-gray">${e.items_count} exercice(s)</span><span class="badge badge-gray">/${e.total_points}</span>${e.online ? '<span class="badge badge-purple"><i class="fas fa-laptop mr-1"></i>En ligne</span>' : '<span class="badge badge-gray"><i class="fas fa-print mr-1"></i>Papier</span>'}${e.count_in_term ? '<span class="badge badge-purple"><i class="fas fa-star mr-1"></i>Compte T' + e.trimester + '</span>' : ''}${e.due_at ? `<span class="badge badge-yellow"><i class="fas fa-calendar-day mr-1"></i>${dayjs(e.due_at).format('DD/MM HH:mm')}</span>` : ''}${e.source?.ai_model ? '<span class="badge badge-purple"><i class="fas fa-wand-magic-sparkles mr-1"></i>IA</span>' : ''}</div>
      <div class="text-xs text-gray-600 mb-3"><span class="font-bold">${e.attempted}</span>/${e.total_students} copies · <span class="font-bold text-green-700">${e.graded}</span> corrigées${e.avg != null ? ` · moy. <b>${e.avg}/20</b>` : ''}
        <div class="h-1.5 bg-gray-100 rounded-full mt-1"><div class="h-1.5 bg-blue-500 rounded-full" style="width:${e.total_students ? Math.round(e.attempted / e.total_students * 100) : 0}%"></div></div></div>
      <div class="mt-auto flex flex-wrap gap-1.5">
        <button onclick="evaOpen(${e.id})" class="${btnPrimary} text-xs py-1.5"><i class="fas fa-highlighter mr-1"></i>Copies</button>
        ${isReadOnlyYear() ? '' : `<button onclick="evaEdit(${e.id})" class="${btnSecondary} text-xs py-1.5"><i class="fas fa-pen mr-1"></i>Modifier</button>`}
        <button onclick="evaPdfById(${e.id}, false)" class="${btnSecondary} text-xs py-1.5" title="Fiche élève PDF"><i class="fas fa-file-pdf text-red-600 mr-1"></i>Fiche</button>
        <button onclick="evaPdfById(${e.id}, true)" class="${btnSecondary} text-xs py-1.5" title="Corrigé PDF"><i class="fas fa-key text-amber-600 mr-1"></i>Corrigé</button>
        ${isReadOnlyYear() ? '' : `<button onclick="evaDuplicate(${e.id})" class="${btnSecondary} text-xs py-1.5" title="Dupliquer"><i class="fas fa-copy"></i></button>
        ${e.status === 'draft' ? `<button onclick="evaSetStatus(${e.id}, 'published')" class="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold"><i class="fas fa-paper-plane mr-1"></i>Publier</button>` : e.status === 'published' ? `<button onclick="evaSetStatus(${e.id}, 'closed')" class="${btnSecondary} text-xs py-1.5"><i class="fas fa-lock mr-1"></i>Clôturer</button>` : `<button onclick="evaSetStatus(${e.id}, 'published')" class="${btnSecondary} text-xs py-1.5"><i class="fas fa-lock-open mr-1"></i>Réouvrir</button>`}
        <button onclick="evaDelete(${e.id})" class="px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 text-xs"><i class="fas fa-trash"></i></button>`}
      </div>
    </article>`).join('')}
  </div>`;
}
async function evaSetStatus(id, status) { try { await api.put(`/evaluations/${id}`, { status }); toast(status === 'published' ? 'Évaluation publiée (familles notifiées)' : 'Statut mis à jour'); render(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }
async function evaDuplicate(id) { try { await api.post(`/evaluations/${id}/duplicate`); toast('Copie créée (brouillon)'); render(); } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); } }
function evaDelete(id) { confirmDelete('Supprimer cette évaluation (et ses copies) ?', async () => { await api.delete(`/evaluations/${id}`); toast('Supprimée'); render(); }); }
async function evaPdfById(id, corrige) { const ev = (await api.get(`/evaluations/${id}`)).data; await evaPdf(ev, corrige); }

/* ======================= CONSTRUCTEUR ======================= */
function evaNew(template) {
  EVA.id = null;
  EVA.doc = template || { title: '', kind: 'prerequis', level: '5AP', lang: 'fr', trimester: 1, duration_min: 60, subject_id: '', online: true, count_in_term: false, due_at: '', status: 'draft', source: {}, sections: [{ title: 'Lecture - compréhension', subtitle: 'Je lis le texte puis je réponds aux questions.', text_title: '', text: '', items: [] }] };
  if (template) { EVA.doc.status = 'draft'; EVA.doc.source = { template: 'fr5_macaron' }; }
  evaBuilder();
}
async function evaEdit(id) { const ev = (await api.get(`/evaluations/${id}`)).data; EVA.id = id; EVA.doc = { ...ev, sections: ev.sections || [] }; delete EVA.doc.attempts; evaBuilder(); }

async function evaBuilder() {
  const d = EVA.doc;
  if (!App.cache.subjects) { try { App.cache.subjects = await db.list('subjects', 'select=id,name&order=name'); } catch { App.cache.subjects = []; } }
  const el = document.getElementById('main-content');
  el.innerHTML = pageHeader((EVA.id ? 'Modifier' : 'Nouvelle') + ' évaluation <span class="text-gray-400 text-base font-normal">· بناء تقييم</span>', 'fa-file-signature',
    `<button onclick="navigate('evaluations')" class="${btnSecondary}"><i class="fas fa-arrow-left mr-1"></i> Retour</button>
     <button onclick="evaPreview()" class="${btnSecondary}"><i class="fas fa-eye mr-1"></i> Aperçu</button>
     <button onclick="evaPdf(EVA.doc,false)" class="${btnSecondary}"><i class="fas fa-file-pdf text-red-600 mr-1"></i> PDF fiche</button>
     <button onclick="evaSave('draft')" class="${btnSecondary}"><i class="fas fa-save mr-1"></i> Enregistrer</button>
     <button onclick="evaSave('published')" class="${btnPrimary} bg-green-600 hover:bg-green-700"><i class="fas fa-paper-plane mr-1"></i> Enregistrer & publier</button>`) + `
  <div class="grid lg:grid-cols-3 gap-4">
    <section class="lg:col-span-1 space-y-4">
      <div class="bg-white rounded-xl shadow p-4 space-y-3" id="eva-meta">
        <h3 class="font-bold text-gray-700 text-sm"><i class="fas fa-sliders mr-1 text-blue-600"></i>Paramètres</h3>
        <div><label class="${lblCls}">Titre</label><input class="${inputCls}" value="${esc(d.title)}" oninput="EVA.doc.title=this.value" placeholder="Évaluation des prérequis — Français"></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="${lblCls}">Type</label><select class="${inputCls}" onchange="EVA.doc.kind=this.value">${Object.entries(EVA_KINDS).map(([k, v]) => `<option value="${k}" ${d.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div><label class="${lblCls}">Niveau</label><select class="${inputCls}" onchange="EVA.doc.level=this.value; EVA.sources=null">${ALL_LEVELS.map(l => `<option value="${l}" ${d.level === l ? 'selected' : ''}>${l} — ${LEVEL_LABELS[l]}</option>`).join('')}</select></div>
          <div><label class="${lblCls}">Matière</label><select class="${inputCls}" onchange="EVA.doc.subject_id=this.value||null"><option value="">—</option>${App.cache.subjects.map(s => `<option value="${s.id}" ${String(d.subject_id) === String(s.id) ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
          <div><label class="${lblCls}">Langue</label><select class="${inputCls}" onchange="EVA.doc.lang=this.value"><option value="fr" ${d.lang !== 'ar' ? 'selected' : ''}>Français</option><option value="ar" ${d.lang === 'ar' ? 'selected' : ''}>العربية</option></select></div>
          <div><label class="${lblCls}">Trimestre</label><select class="${inputCls}" onchange="EVA.doc.trimester=+this.value">${[1, 2, 3].map(t => `<option value="${t}" ${d.trimester === t ? 'selected' : ''}>T${t}</option>`).join('')}</select></div>
          <div><label class="${lblCls}">Durée (min)</label><input type="number" class="${inputCls}" value="${d.duration_min || ''}" oninput="EVA.doc.duration_min=+this.value||null"></div>
        </div>
        <div><label class="${lblCls}">Date limite en ligne (optionnel)</label><input type="datetime-local" class="${inputCls}" value="${d.due_at ? dayjs(d.due_at).format('YYYY-MM-DDTHH:mm') : ''}" onchange="EVA.doc.due_at=this.value?new Date(this.value).toISOString():null"></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.online !== false ? 'checked' : ''} onchange="EVA.doc.online=this.checked" class="w-4 h-4"> Passation en ligne (élèves/parents)</label>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" ${d.count_in_term ? 'checked' : ''} onchange="EVA.doc.count_in_term=this.checked" class="w-4 h-4"> La note compte dans le carnet (T${d.trimester})</label>
        <p class="text-xs text-gray-500">Total actuel : <b id="eva-total">${evaTotal(d)}</b> pts</p>
      </div>
      <div class="bg-white rounded-xl shadow p-4 space-y-3">
        <h3 class="font-bold text-gray-700 text-sm"><i class="fas fa-folder-open mr-1 text-amber-600"></i>Construire à partir de…</h3>
        <button onclick="evaSourcesModal()" class="${btnSecondary} w-full text-left"><i class="fas fa-book mr-2 text-blue-600"></i>Un cours / support téléversé (Cours & Documents, Cours interactifs)</button>
        <label class="${btnSecondary} w-full text-left block cursor-pointer"><i class="fas fa-file-pdf mr-2 text-red-600"></i>Un PDF / TXT de mon ordinateur<input type="file" accept=".pdf,.txt,.md" class="hidden" onchange="evaLoadLocalFile(this.files[0])"></label>
        <button onclick="evaAiModal()" class="${btnSecondary} w-full text-left"><i class="fas fa-wand-magic-sparkles mr-2 text-purple-600"></i>Générer la fiche complète avec l'IA</button>
        <button onclick="if(confirm('Remplacer le contenu actuel par le modèle Français 5AP ?')){const t=evaTemplateFr5(); EVA.doc={...EVA.doc,...t}; evaBuilder();}" class="${btnSecondary} w-full text-left"><i class="fas fa-file-import mr-2 text-green-600"></i>Le modèle Français 5AP (Macaron)</button>
        <div id="eva-source-info" class="text-xs text-gray-500">${d.source?.file_name ? `<i class="fas fa-paperclip mr-1"></i>Support : ${esc(d.source.file_name)}` : d.source?.course_title ? `<i class="fas fa-book mr-1"></i>Cours : ${esc(d.source.course_title)}` : ''}</div>
        <textarea id="eva-source-text" class="${inputCls}" rows="5" placeholder="Texte source (extrait du cours / support) — utilisé pour l'IA et copiable dans une section">${esc(d.source?.text_excerpt || '')}</textarea>
      </div>
    </section>
    <section class="lg:col-span-2 space-y-4" id="eva-sections">${evaSectionsHtml(d)}</section>
  </div>`;
}
function evaRefreshSections() { const s = document.getElementById('eva-sections'); if (s) s.innerHTML = evaSectionsHtml(EVA.doc); const t = document.getElementById('eva-total'); if (t) t.textContent = evaTotal(EVA.doc); }
function evaSectionsHtml(d) {
  return d.sections.map((s, si) => `<div class="bg-white rounded-xl shadow">
    <div class="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-white rounded-t-xl">
      <span class="w-7 h-7 rounded-full bg-red-600 text-white font-bold flex items-center justify-center text-sm">${si + 1}</span>
      <input class="font-bold text-gray-800 bg-transparent border-b border-dashed flex-1 min-w-0 px-1" value="${esc(s.title)}" oninput="EVA.doc.sections[${si}].title=this.value" placeholder="Titre de la section (ex. Lecture - compréhension)">
      <button onclick="evaMoveSection(${si},-1)" class="text-gray-400 hover:text-gray-700 px-1" title="Monter"><i class="fas fa-arrow-up"></i></button>
      <button onclick="evaMoveSection(${si},1)" class="text-gray-400 hover:text-gray-700 px-1" title="Descendre"><i class="fas fa-arrow-down"></i></button>
      <button onclick="if(confirm('Supprimer cette section ?')){EVA.doc.sections.splice(${si},1); evaRefreshSections();}" class="text-red-500 hover:text-red-700 px-1"><i class="fas fa-trash"></i></button>
    </div>
    <div class="p-4 space-y-3">
      <input class="${inputCls}" value="${esc(s.subtitle || '')}" oninput="EVA.doc.sections[${si}].subtitle=this.value" placeholder="Consigne générale (ex. Je lis le texte puis je réponds aux questions.)">
      <details ${s.text ? 'open' : ''}><summary class="text-xs font-semibold text-gray-600 cursor-pointer"><i class="fas fa-book-open mr-1"></i>Texte support de la section (lecture, document…)</summary>
        <input class="${inputCls} mt-2" value="${esc(s.text_title || '')}" oninput="EVA.doc.sections[${si}].text_title=this.value" placeholder="Titre du texte (ex. Macaron, le petit mouton)">
        <textarea class="${inputCls} mt-2" rows="6" oninput="EVA.doc.sections[${si}].text=this.value" placeholder="Collez le texte à lire…">${esc(s.text || '')}</textarea>
        <button onclick="const t=document.getElementById('eva-source-text')?.value; if(t){EVA.doc.sections[${si}].text=t; evaRefreshSections();}" class="text-xs text-blue-600 mt-1"><i class="fas fa-arrow-down mr-1"></i>Copier le texte source ici</button></details>
      ${(s.items || []).map((it, ii) => evaItemEditor(si, ii, it)).join('')}
      <div class="flex flex-wrap gap-1.5 pt-1 border-t">
        <span class="text-xs text-gray-500 self-center mr-1">Ajouter :</span>
        ${Object.entries(EVA_TYPES).map(([k, v]) => `<button onclick="evaAddItem(${si},'${k}')" class="text-xs px-2 py-1 rounded-lg bg-gray-100 hover:bg-blue-100 text-gray-700" title="${esc(v.label)}"><i class="fas ${v.icon} mr-1"></i>${esc(v.label.split(' /')[0].split(' (')[0])}</button>`).join('')}
      </div>
    </div>
  </div>`).join('') + `<button onclick="EVA.doc.sections.push({title:'Nouvelle section',subtitle:'',text:null,items:[]}); evaRefreshSections()" class="${btnSecondary} w-full border-dashed"><i class="fas fa-plus mr-1"></i> Ajouter une section (Langue, Production écrite, Grammaire…)</button>`;
}
function evaMoveSection(si, dir) { const a = EVA.doc.sections; const j = si + dir; if (j < 0 || j >= a.length) return; [a[si], a[j]] = [a[j], a[si]]; evaRefreshSections(); }
function evaAddItem(si, type) {
  const base = { type, consigne: EVA_TYPES[type].label.split(' /')[0] + '.', points: 1 };
  const extra = { mcq: { question: '', options: ['', '', ''], correct: 0 }, truefalse: { question: '', correct: 0 }, match: { pairs: [{ left: '', right: 0 }], rights: ['', '', ''] }, strike: { subject: '', options: [{ text: '', false: false }, { text: '', false: true }] }, fill: { text: '', words: [], blanks: [{ answer: '' }] }, conjug: { text: '', blanks: [{ verb: '', answer: '' }] }, quote: { question: '', answer: '' }, open: { prompt: '', criteria: [''], lines: 10, points: 5 } }[type];
  if (type === 'match') base.consigne = 'Je relie par une flèche.'; if (type === 'strike') base.consigne = 'Je barre ce qui est faux.'; if (type === 'truefalse') base.consigne = 'Je mets une croix devant la bonne réponse.'; if (type === 'mcq') base.consigne = "J'entoure la bonne réponse."; if (type === 'conjug') base.consigne = 'Je complète avec les verbes entre parenthèses au présent.'; if (type === 'fill') base.consigne = 'Je complète le paragraphe avec les mots du cadre.'; if (type === 'quote') base.consigne = 'Je relève la phrase du texte qui justifie ma réponse.'; if (type === 'open') base.consigne = "J'écris une petite histoire en respectant les images.";
  EVA.doc.sections[si].items.push({ ...base, ...extra }); evaRefreshSections();
}
const evaP = (si, ii) => `EVA.doc.sections[${si}].items[${ii}]`;
function evaItemEditor(si, ii, it) {
  const P = evaP(si, ii); const t = EVA_TYPES[it.type] || { label: it.type, icon: 'fa-question' };
  let body = '';
  if (it.type === 'mcq') body = `<input class="${inputCls}" value="${esc(it.question || '')}" oninput="${P}.question=this.value" placeholder="Question / amorce (ex. Le mouton gambade :)">
    ${(it.options || []).map((o, oi) => `<div class="flex items-center gap-2"><input type="radio" name="mcq${si}_${ii}" ${it.correct === oi ? 'checked' : ''} onchange="${P}.correct=${oi}" title="Bonne réponse"><input class="${inputCls}" value="${esc(o)}" oninput="${P}.options[${oi}]=this.value" placeholder="Option ${oi + 1}"><button onclick="${P}.options.splice(${oi},1); if(${P}.correct>=${P}.options.length)${P}.correct=0; evaRefreshSections()" class="text-red-400"><i class="fas fa-times"></i></button></div>`).join('')}
    <button onclick="${P}.options.push(''); evaRefreshSections()" class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Option</button>`;
  else if (it.type === 'truefalse') body = `<input class="${inputCls}" value="${esc(it.question || '')}" oninput="${P}.question=this.value" placeholder="Affirmation (ex. Le petit mouton est content d'avoir un bonnet.)">
    <div class="flex gap-4 text-sm"><label><input type="radio" name="tf${si}_${ii}" ${it.correct === 0 ? 'checked' : ''} onchange="${P}.correct=0"> Oui / Vrai</label><label><input type="radio" name="tf${si}_${ii}" ${it.correct === 1 ? 'checked' : ''} onchange="${P}.correct=1"> Non / Faux</label></div>`;
  else if (it.type === 'match') body = `<div class="grid md:grid-cols-2 gap-3"><div><p class="${lblCls}">Colonne gauche → bonne réponse (n°)</p>${(it.pairs || []).map((p, pi) => `<div class="flex gap-1 mb-1"><input class="${inputCls}" value="${esc(p.left)}" oninput="${P}.pairs[${pi}].left=this.value" placeholder="Macaron"><select class="border rounded-lg px-2 text-sm" onchange="${P}.pairs[${pi}].right=+this.value">${(it.rights || []).map((r, ri) => `<option value="${ri}" ${p.right === ri ? 'selected' : ''}>${ri + 1}</option>`).join('')}</select><button onclick="${P}.pairs.splice(${pi},1); evaRefreshSections()" class="text-red-400"><i class="fas fa-times"></i></button></div>`).join('')}<button onclick="${P}.pairs.push({left:'',right:0}); evaRefreshSections()" class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Élément</button></div>
    <div><p class="${lblCls}">Colonne droite (propositions, intrus compris)</p>${(it.rights || []).map((r, ri) => `<div class="flex gap-1 mb-1"><span class="text-xs w-5 self-center text-gray-500">${ri + 1}.</span><input class="${inputCls}" value="${esc(r)}" oninput="${P}.rights[${ri}]=this.value" placeholder="est un petit mouton."><button onclick="${P}.rights.splice(${ri},1); evaRefreshSections()" class="text-red-400"><i class="fas fa-times"></i></button></div>`).join('')}<button onclick="${P}.rights.push(''); evaRefreshSections()" class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Proposition</button></div></div>`;
  else if (it.type === 'strike') body = `<input class="${inputCls}" value="${esc(it.subject || '')}" oninput="${P}.subject=this.value" placeholder="Sujet (ex. Macaron)">
    ${(it.options || []).map((o, oi) => `<div class="flex items-center gap-2"><label class="text-xs text-red-600 whitespace-nowrap"><input type="checkbox" ${o.false ? 'checked' : ''} onchange="${P}.options[${oi}].false=this.checked"> faux</label><input class="${inputCls}" value="${esc(o.text)}" oninput="${P}.options[${oi}].text=this.value" placeholder="veut manger des bonbons."><button onclick="${P}.options.splice(${oi},1); evaRefreshSections()" class="text-red-400"><i class="fas fa-times"></i></button></div>`).join('')}
    <button onclick="${P}.options.push({text:'',false:false}); evaRefreshSections()" class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Proposition</button>`;
  else if (it.type === 'fill' || it.type === 'conjug') body = `<textarea class="${inputCls}" rows="4" oninput="${P}.text=this.value; evaSyncBlanks(${si},${ii})" placeholder="Texte avec ___ pour chaque trou${it.type === 'conjug' ? ' — ex. Marion et son frère (être) ___ dans le jardin.' : ''}">${esc(it.text || '')}</textarea>
    ${it.type === 'fill' ? `<input class="${inputCls}" value="${esc((it.words || []).join(' - '))}" oninput="${P}.words=this.value.split(/\\s*-\\s*/).filter(Boolean)" placeholder="Mots du cadre séparés par - (ex. sa laine - des yeux - ronds) ; vide = dictée / sans cadre">
    <input class="${inputCls}" value="${esc(it.dictation || '')}" oninput="${P}.dictation=this.value" placeholder="Texte à dicter (optionnel, pour « J'écoute et je complète »)">` : ''}
    <div class="grid md:grid-cols-2 gap-1">${(it.blanks || []).map((b, bi) => `<div class="flex gap-1 items-center"><span class="text-xs text-gray-500 w-6">${bi + 1}.</span>${it.type === 'conjug' ? `<input class="${inputCls} w-24" value="${esc(b.verb || '')}" oninput="${P}.blanks[${bi}].verb=this.value" placeholder="verbe">` : ''}<input class="${inputCls}" value="${esc(b.answer || '')}" oninput="${P}.blanks[${bi}].answer=this.value" placeholder="réponse attendue"><input class="${inputCls} w-28" value="${esc((b.alt || []).join(','))}" oninput="${P}.blanks[${bi}].alt=this.value.split(',').map(x=>x.trim()).filter(Boolean)" placeholder="variantes"></div>`).join('')}</div>
    <p class="text-[11px] text-gray-400">Les trous sont créés automatiquement d'après les ___ du texte (${(it.blanks || []).length}).</p>`;
  else if (it.type === 'quote') body = `<input class="${inputCls}" value="${esc(it.question || '')}" oninput="${P}.question=this.value" placeholder="Ce qu'il faut justifier (ex. Macaron veut jouer au ballon.)"><input class="${inputCls}" value="${esc(it.answer || '')}" oninput="${P}.answer=this.value" placeholder="Phrase attendue (corrigé)">`;
  else if (it.type === 'open') body = `<textarea class="${inputCls}" rows="4" oninput="${P}.prompt=this.value" placeholder="Situation / histoire à écrire, description des images…">${esc(it.prompt || '')}</textarea>
    <input class="${inputCls}" value="${esc(it.image_url || '')}" oninput="${P}.image_url=this.value" placeholder="URL d'une image (BD, images séquentielles) — optionnel"> <label class="text-xs text-blue-600 cursor-pointer"><i class="fas fa-upload mr-1"></i>Téléverser une image<input type="file" accept="image/*" class="hidden" onchange="evaUploadItemImage(${si},${ii},this.files[0])"></label>
    <p class="${lblCls} mt-1">Critères de correction (grille)</p>${(it.criteria || []).map((cr, ci) => `<div class="flex gap-1 mb-1"><input class="${inputCls}" value="${esc(cr)}" oninput="${P}.criteria[${ci}]=this.value"><button onclick="${P}.criteria.splice(${ci},1); evaRefreshSections()" class="text-red-400"><i class="fas fa-times"></i></button></div>`).join('')}<button onclick="${P}.criteria.push(''); evaRefreshSections()" class="text-xs text-blue-600"><i class="fas fa-plus mr-1"></i>Critère</button>
    <div class="flex items-center gap-2 text-xs"><span>Lignes d'écriture :</span><input type="number" class="border rounded px-2 py-1 w-16" value="${it.lines || 10}" oninput="${P}.lines=+this.value"></div>`;
  return `<div class="border rounded-lg p-3 bg-gray-50/60 space-y-2">
    <div class="flex items-center gap-2 flex-wrap"><span class="text-xs font-bold text-blue-700 bg-blue-100 rounded px-2 py-0.5"><i class="fas ${t.icon} mr-1"></i>${ii + 1}. ${esc(t.label)}</span>${t.auto ? '<span class="text-[10px] text-green-700"><i class="fas fa-robot mr-1"></i>auto-corrigé</span>' : '<span class="text-[10px] text-amber-700"><i class="fas fa-user-pen mr-1"></i>correction manuelle</span>'}
      <span class="ml-auto text-xs">Points <input type="number" step="0.5" min="0" class="border rounded px-2 py-0.5 w-16" value="${it.points}" oninput="${P}.points=+this.value; document.getElementById('eva-total').textContent=evaTotal(EVA.doc)"></span>
      <button onclick="evaMoveItem(${si},${ii},-1)" class="text-gray-400 hover:text-gray-700"><i class="fas fa-arrow-up"></i></button><button onclick="evaMoveItem(${si},${ii},1)" class="text-gray-400 hover:text-gray-700"><i class="fas fa-arrow-down"></i></button>
      <button onclick="EVA.doc.sections[${si}].items.splice(${ii},1); evaRefreshSections()" class="text-red-500"><i class="fas fa-trash"></i></button></div>
    <input class="${inputCls} font-semibold" value="${esc(it.consigne || '')}" oninput="${P}.consigne=this.value" placeholder="Consigne (ex. Je relie par une flèche.)">
    ${body}</div>`;
}
function evaMoveItem(si, ii, dir) { const a = EVA.doc.sections[si].items; const j = ii + dir; if (j < 0 || j >= a.length) return; [a[ii], a[j]] = [a[j], a[ii]]; evaRefreshSections(); }
function evaSyncBlanks(si, ii) {
  const it = EVA.doc.sections[si].items[ii]; const n = (it.text.match(/___/g) || []).length; it.blanks = it.blanks || [];
  if (it.type === 'conjug') { const verbs = [...it.text.matchAll(/\(([^)]+)\)\s*___/g)].map(m => m[1]); verbs.forEach((v, i) => { it.blanks[i] = it.blanks[i] || { answer: '' }; it.blanks[i].verb = v; }); }
  while (it.blanks.length < n) it.blanks.push({ answer: '' }); it.blanks.length = n;
  const box = document.getElementById('eva-sections'); const ta = document.activeElement; const pos = ta?.selectionStart;
  evaRefreshSections();
  // restaurer le focus dans le textarea
  const tas = box.querySelectorAll('textarea'); for (const x of tas) if (x.value === it.text) { x.focus(); try { x.setSelectionRange(pos, pos); } catch {} break; }
}
async function evaUploadItemImage(si, ii, file) { if (!file) return; try { const up = await uploadFile('courses', file); EVA.doc.sections[si].items[ii].image_url = up.url; evaRefreshSections(); toast('Image ajoutée'); } catch (e) { toast(e.response?.data?.error || 'Erreur upload', 'error'); } }

/* --- Sources : cours & supports téléversés --- */
async function evaSourcesModal() {
  const lvl = EVA.doc.level;
  if (!EVA.sources) EVA.sources = (await api.get(`/evaluations/sources?level=${encodeURIComponent(lvl)}`)).data;
  const { courses, interactive } = EVA.sources;
  openModal(`<i class="fas fa-folder-open text-amber-600 mr-2"></i>Supports disponibles — ${esc(lvl)}`, `
    <p class="text-xs text-gray-500 mb-3">Choisissez un cours ou un support téléversé par un enseignant/admin : son texte servira de base (texte de lecture, génération IA).</p>
    <h4 class="font-bold text-sm text-gray-700 mb-1"><i class="fas fa-book mr-1"></i>Cours & Documents (${courses.length})</h4>
    <div class="max-h-48 overflow-y-auto border rounded-lg divide-y mb-3">${courses.length ? courses.map(c => `<div class="p-2 flex items-center gap-2 text-sm hover:bg-blue-50"><i class="fas ${/pdf/.test(c.file_type || '') ? 'fa-file-pdf text-red-500' : /image/.test(c.file_type || '') ? 'fa-file-image text-blue-500' : 'fa-file text-gray-400'}"></i><div class="flex-1 min-w-0"><b class="truncate block">${esc(c.title)}</b><span class="text-xs text-gray-500">${esc(c.file_name || '')} ${c.description ? '· ' + esc(c.description.slice(0, 60)) : ''}</span></div>${c.file_url ? `<a href="${esc(c.file_url)}" target="_blank" class="text-xs text-blue-600"><i class="fas fa-eye"></i></a>` : ''}<button onclick="evaUseCourse(${c.id})" class="${btnPrimary} text-xs py-1">Utiliser</button></div>`).join('') : '<p class="p-3 text-xs text-gray-400">Aucun cours pour ce niveau.</p>'}</div>
    <h4 class="font-bold text-sm text-gray-700 mb-1"><i class="fas fa-gamepad mr-1"></i>Cours interactifs (${interactive.length})</h4>
    <div class="max-h-40 overflow-y-auto border rounded-lg divide-y">${interactive.length ? interactive.map(c => `<div class="p-2 flex items-center gap-2 text-sm hover:bg-blue-50"><div class="flex-1 min-w-0"><b class="truncate block">${esc(c.title)}</b><span class="text-xs text-gray-500">${esc(c.course_type)} ${c.description ? '· ' + esc(c.description.slice(0, 60)) : ''}</span></div><button onclick="evaUseInteractive(${c.id})" class="${btnPrimary} text-xs py-1">Utiliser</button></div>`).join('') : '<p class="p-3 text-xs text-gray-400">Aucun cours interactif pour ce niveau.</p>'}</div>`, { wide: true });
}
async function evaUseCourse(id) {
  const c = EVA.sources.courses.find(x => x.id === id); closeModal();
  EVA.doc.source = { ...(EVA.doc.source || {}), course_id: c.id, course_title: c.title, file_url: c.file_url, file_name: c.file_name };
  let text = c.description || '';
  if (c.file_url && /pdf/.test(c.file_type || '')) { toast('Lecture du PDF…', 'info'); try { text = await evaPdfToText(await (await fetch(c.file_url)).arrayBuffer()) || text; } catch (e) { toast('PDF non lisible (scan ?) — collez le texte manuellement', 'error'); } }
  else if (c.file_url && /image/.test(c.file_type || '')) toast('Support image : collez le texte manuellement ou utilisez le texte du cours', 'info');
  evaApplySourceText(text, `Cours : ${c.title}`);
}
function evaUseInteractive(id) {
  const c = EVA.sources.interactive.find(x => x.id === id); closeModal();
  EVA.doc.source = { ...(EVA.doc.source || {}), interactive_id: c.id, course_title: c.title };
  const ct = c.content || {}; let text = c.description || '';
  if (ct.text) text += '\n' + ct.text.replace(/\[([^\]]+)\]/g, '$1');
  if (ct.cards) text += '\n' + ct.cards.map(k => `${k.front} : ${k.back}`).join('\n');
  if (ct.questions) text += '\n' + ct.questions.map(q => `${q.question} → ${q.options?.[q.correct] || ''}`).join('\n');
  evaApplySourceText(text.trim(), `Cours interactif : ${c.title}`);
}
function evaApplySourceText(text, label) {
  EVA.doc.source.text_excerpt = (text || '').slice(0, 24000);
  const ta = document.getElementById('eva-source-text'); if (ta) ta.value = EVA.doc.source.text_excerpt;
  const info = document.getElementById('eva-source-info'); if (info) info.innerHTML = `<i class="fas fa-check text-green-600 mr-1"></i>${esc(label)} — ${EVA.doc.source.text_excerpt.length} caractères`;
  toast('Source chargée : vous pouvez copier le texte dans une section ou lancer l\'IA');
}
async function evaPdfToText(buf) {
  if (!window.pdfjsLib) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise; let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 25); i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); text += tc.items.map(it => it.str).join(' ') + '\n\n'; }
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
async function evaLoadLocalFile(file) {
  if (!file) return;
  try {
    let text = /\.pdf$/i.test(file.name) ? await evaPdfToText(await file.arrayBuffer()) : await file.text();
    if (text.length < 40) return toast('Fichier sans texte sélectionnable (scan) — collez le texte manuellement', 'error');
    // Téléverser le support pour le conserver (bucket courses)
    try { const up = await uploadFile('courses', file); EVA.doc.source = { ...(EVA.doc.source || {}), file_url: up.url, file_name: file.name }; } catch {}
    evaApplySourceText(text, `Fichier : ${file.name}`);
  } catch (e) { toast('Lecture impossible', 'error'); }
}
/* --- IA : fiche complète --- */
async function evaAiModal() {
  let st = { enabled: false }; try { st = (await api.get('/ai/status')).data; } catch {}
  const text = document.getElementById('eva-source-text')?.value || EVA.doc.source?.text_excerpt || '';
  openModal('<i class="fas fa-wand-magic-sparkles text-purple-600 mr-2"></i>Générer l\'évaluation avec l\'IA', `
    ${!st.enabled ? `<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-lg p-3 text-sm mb-3">IA non configurée (clé <code>OPENAI_API_KEY</code>).</div>` : `<p class="text-xs text-gray-500 mb-3">Quota : <b>${st.used}/${st.limit}</b> aujourd'hui · modèle ${esc(st.model)}. L'IA rédige les sections, le texte de lecture et les exercices typés à partir du texte source ci-dessous ; vous pourrez tout modifier ensuite.</p>`}
    <label class="${lblCls}">Sections à générer (une par ligne)</label><textarea id="eva-ai-secs" class="${inputCls} mb-2" rows="3">Lecture - compréhension\nLangue\nProduction écrite</textarea>
    <label class="${lblCls}">Texte source</label><textarea id="eva-ai-text" class="${inputCls} mb-3" rows="8" placeholder="Contenu du cours / support…">${esc(text)}</textarea>
    <div id="eva-ai-res" class="mb-2"></div>
    <div class="flex justify-end gap-2"><button onclick="closeModal()" class="${btnSecondary}">Annuler</button><button id="eva-ai-go" onclick="evaAiGo()" class="${btnPrimary} bg-purple-600 hover:bg-purple-700" ${st.enabled ? '' : 'disabled'}><i class="fas fa-wand-magic-sparkles mr-1"></i> Générer</button></div>`, { wide: true });
}
async function evaAiGo() {
  const btn = document.getElementById('eva-ai-go'); const res = document.getElementById('eva-ai-res');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Génération (30–60 s)…'; res.innerHTML = '';
  try {
    const subj = App.cache.subjects?.find(s => String(s.id) === String(EVA.doc.subject_id))?.name || '';
    const r = (await api.post('/evaluations/ai', { text: document.getElementById('eva-ai-text').value, level: EVA.doc.level, subject: subj, lang: EVA.doc.lang, kind: EVA.doc.kind, sections: document.getElementById('eva-ai-secs').value.split('\n').map(x => x.trim()).filter(Boolean) })).data;
    EVA.doc.sections = r.sections; if (!EVA.doc.title) EVA.doc.title = r.title; EVA.doc.source = { ...(EVA.doc.source || {}), ai_model: r.model, text_excerpt: document.getElementById('eva-ai-text').value.slice(0, 24000) };
    closeModal(); evaBuilder(); toast(`Fiche générée : ${r.sections.length} sections, ${evaTotal(EVA.doc)} pts — relisez et ajustez`);
  } catch (e) { res.innerHTML = `<div class="bg-red-50 border border-red-300 text-red-700 rounded-lg p-3 text-sm">${esc(e.response?.data?.error || e.message)}</div>`; btn.disabled = false; btn.innerHTML = '<i class="fas fa-wand-magic-sparkles mr-1"></i> Réessayer'; }
}
/* --- Sauvegarde --- */
async function evaSave(status) {
  const d = EVA.doc;
  if (!d.title?.trim()) return toast('Titre requis', 'error');
  if (!d.sections.some(s => (s.items || []).length)) return toast('Ajoutez au moins un exercice', 'error');
  const srcTa = document.getElementById('eva-source-text'); if (srcTa) d.source = { ...(d.source || {}), text_excerpt: srcTa.value.slice(0, 24000) };
  const payload = { title: d.title, kind: d.kind, subject_id: d.subject_id || null, level: d.level, lang: d.lang, trimester: d.trimester, duration_min: d.duration_min, sections: d.sections, source: d.source || {}, online: d.online !== false, count_in_term: !!d.count_in_term, due_at: d.due_at || null, status: status || d.status || 'draft' };
  try {
    const r = EVA.id ? await api.put(`/evaluations/${EVA.id}`, payload) : await api.post('/evaluations', payload);
    EVA.id = r.data.id; toast(status === 'published' ? 'Évaluation publiée' : 'Enregistrée'); navigate('evaluations');
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

/* ======================= RENDU FICHE (aperçu HTML + passation) ======================= */
// mode : 'preview' (fiche vierge), 'answer' (formulaire élève), 'correct' (copie + corrigé), 'key' (corrigé seul)
function evaFicheHtml(doc, mode, att) {
  const rtl = doc.lang === 'ar'; const answers = att?.answers || {}; const scores = att?.item_scores || {};
  const ans = (k) => answers[k];
  let n = 0;
  const yearLbl = App.year || (App.years?.find(y => y.is_current)?.label) || '';
  const head = `<header class="rounded-2xl border-2 border-blue-900 overflow-hidden mb-4">
    <div class="bg-gradient-to-r from-red-600 via-white to-blue-900 h-2"></div>
    <div class="grid grid-cols-3 divide-x text-center text-sm">
      <div class="p-2 font-bold text-red-700"><i class="fas fa-calendar mr-1 text-blue-900"></i>${esc(yearLbl)}</div>
      <div class="p-2"><div class="text-[11px] font-bold text-blue-900 tracking-wide">${esc((EVA_KINDS[doc.kind] || doc.kind).toUpperCase())}</div><div class="font-black text-red-600">${esc(doc.title)}</div></div>
      <div class="p-2 text-blue-900 font-bold text-xs">⭐<br>${esc((LEVEL_LABELS[doc.level] || doc.level).toUpperCase())}${doc.duration_min ? `<div class="text-gray-500 font-normal">${doc.duration_min} min · /${doc.total_points || evaTotal(doc)}</div>` : ''}</div>
    </div>
    ${mode !== 'preview' && att?.students ? `<div class="border-t px-3 py-1.5 text-sm bg-blue-50 flex justify-between"><span>Élève : <b>${esc(att.students.first_name + ' ' + att.students.last_name)}</b></span>${att.score != null ? `<span class="font-bold text-red-700">Note : ${att.score}/${att.max_score}</span>` : ''}</div>` : mode === 'preview' ? '<div class="border-t px-3 py-1.5 text-sm text-gray-500">Nom : ………………………………………… Prénom : ………………………………………</div>' : ''}
  </header>`;
  const secs = doc.sections.map((s, si) => {
    const items = (s.items || []).map((it, ii) => {
      const key = `s${si}i${ii}`; n++;
      const a = ans(key); const inp = mode === 'answer'; const showKey = mode === 'key' || mode === 'correct';
      let body = '';
      if (it.type === 'mcq') body = `<p class="mb-1">${esc(it.question || '')}</p><div class="flex flex-wrap gap-2">${(it.options || []).map((o, oi) => { const txt = typeof o === 'string' ? o : o.text; const sel = Number(a) === oi; const ok = showKey && it.correct === oi; return inp ? `<label class="border rounded-full px-3 py-1 cursor-pointer ${sel ? 'bg-blue-600 text-white' : 'hover:bg-blue-50'}"><input type="radio" name="${key}" value="${oi}" class="hidden" ${sel ? 'checked' : ''} onchange="EVA.answers['${key}']=${oi}; evaRefreshItem('${key}')">● ${esc(txt)}</label>` : `<span class="border rounded-full px-3 py-1 ${ok ? 'bg-green-100 border-green-600 font-bold' : ''} ${sel && !ok && showKey ? 'bg-red-100 border-red-500 line-through' : sel ? 'bg-blue-100' : ''}">● ${esc(txt)}</span>`; }).join('')}</div>`;
      else if (it.type === 'truefalse') body = `<p class="mb-1">${esc(it.question || '')}</p><div class="flex gap-6">${['Oui', 'Non'].map((l, oi) => { const sel = Number(a) === oi; const ok = showKey && it.correct === oi; return inp ? `<label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="${key}" ${sel ? 'checked' : ''} onchange="EVA.answers['${key}']=${oi}" class="w-5 h-5"> ${l}</label>` : `<span class="flex items-center gap-2"><span class="w-5 h-5 border-2 rounded flex items-center justify-center ${ok ? 'border-green-600 text-green-700' : sel ? 'border-red-500 text-red-600' : ''}">${sel || ok ? '✗' : ''}</span>${l}</span>`; }).join('')}</div>`;
      else if (it.type === 'match') body = `<div class="grid grid-cols-2 gap-2">${(it.pairs || []).map((p, pi) => `<div class="bg-blue-50 rounded-lg px-3 py-1 font-bold self-start">${esc(p.left)} ●</div>${inp ? `<select class="border rounded-lg px-2 py-1" onchange="(EVA.answers['${key}']=EVA.answers['${key}']||{})[${pi}]=+this.value"><option value="">— relier à —</option>${(it.rights || []).map((r, ri) => `<option value="${ri}" ${a?.[pi] === ri ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>` : `<div class="text-sm">${(it.rights || []).map((r, ri) => `<div>● ${esc(r)} ${showKey && p.right === ri ? '<span class="text-green-700 font-bold">← ' + esc(p.left) + '</span>' : ''}${a && a[pi] === ri ? ` <span class="${showKey && p.right !== ri ? 'text-red-600 line-through' : 'text-blue-700'}">(réponse élève)</span>` : ''}</div>`).join('')}</div>`}`).join('')}</div>`;
      else if (it.type === 'strike') body = `<div class="flex gap-3"><div class="bg-blue-50 rounded-lg px-3 py-1 font-bold self-start">${esc(it.subject || '')}</div><div class="space-y-1">${(it.options || []).map((o, oi) => { const struck = !!a?.[oi]; return inp ? `<label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" ${struck ? 'checked' : ''} onchange="(EVA.answers['${key}']=EVA.answers['${key}']||{})[${oi}]=this.checked; this.nextElementSibling.classList.toggle('line-through',this.checked)" class="w-4 h-4"><span class="${struck ? 'line-through' : ''}">● ${esc(o.text)}</span></label>` : `<div class="${struck ? 'line-through text-red-600' : ''} ${showKey && o.false ? 'bg-red-50 rounded px-1' : ''}">● ${esc(o.text)} ${showKey && o.false ? '<span class="text-[10px] text-red-600">(faux → à barrer)</span>' : ''}</div>`; }).join('')}</div></div>`;
      else if (it.type === 'fill' || it.type === 'conjug') {
        let bi = 0;
        body = `${it.words?.length ? `<div class="border border-red-400 border-dashed rounded-lg px-3 py-1 mb-2 text-center">${it.words.map(esc).join(' &nbsp;-&nbsp; ')}</div>` : ''}${it.dictation && (mode === 'key' || mode === 'correct') ? `<p class="text-xs text-purple-700 mb-1"><i class="fas fa-volume-high mr-1"></i>Dictée : ${esc(it.dictation)}</p>` : ''}${it.dictation && inp ? `<button type="button" onclick="evaSpeak(${JSON.stringify(it.dictation).replace(/"/g, '&quot;')}, '${doc.lang}')" class="text-xs text-purple-700 border border-purple-300 rounded-full px-3 py-0.5 mb-1"><i class="fas fa-volume-high mr-1"></i>Écouter</button>` : ''}
        <p class="leading-8">${esc(it.text || '').replace(/___/g, () => { const i = bi++; const b = (it.blanks || [])[i] || {}; const v = a?.[i] ?? ''; return inp ? `<input class="border-b-2 border-dotted border-gray-600 bg-yellow-50 px-1 w-32 text-center" value="${esc(v)}" oninput="(EVA.answers['${key}']=EVA.answers['${key}']||{})[${i}]=this.value">` : showKey ? `<span class="border-b-2 border-dotted px-2 ${v ? (evaNormJs(v) === evaNormJs(b.answer) || (b.alt || []).map(evaNormJs).includes(evaNormJs(v)) ? 'text-green-700 font-bold' : 'text-red-600 line-through') : ''}">${esc(v) || '&nbsp;&nbsp;&nbsp;&nbsp;'}</span>${mode === 'key' || (v && evaNormJs(v) !== evaNormJs(b.answer)) ? ` <span class="text-green-700 font-bold">${esc(b.answer || '')}</span>` : ''}` : `<span class="inline-block border-b-2 border-dotted border-gray-500 w-28 align-baseline">&nbsp;${esc(v)}</span>`; }).replace(/\n/g, '<br>')}</p>`;
      }
      else if (it.type === 'quote') body = `<p class="mb-1 italic">${esc(it.question || '')}</p>${inp ? `<textarea class="w-full border rounded-lg px-2 py-1" rows="2" oninput="EVA.answers['${key}']=this.value">${esc(a || '')}</textarea>` : `<div class="border-b border-dotted min-h-[1.6em]">${esc(a || '')}</div>${showKey ? `<p class="text-green-700 text-sm mt-1"><i class="fas fa-key mr-1"></i>${esc(it.answer || '')}</p>` : ''}`}`;
      else if (it.type === 'open') body = `${it.prompt ? `<div class="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2 whitespace-pre-line">${esc(it.prompt)}</div>` : ''}${it.image_url ? `<img src="${esc(it.image_url)}" class="max-h-72 rounded-lg border mb-2" alt="support">` : ''}${inp ? `<textarea class="w-full border rounded-lg px-2 py-1 leading-7" style="background:repeating-linear-gradient(transparent,transparent 27px,#cbd5e1 28px)" rows="${it.lines || 10}" oninput="EVA.answers['${key}']=this.value">${esc(a || '')}</textarea>` : a ? `<div class="whitespace-pre-line border rounded-lg p-2 bg-white">${esc(a)}</div>` : `<div style="height:${(it.lines || 10) * 1.6}em;background:repeating-linear-gradient(transparent,transparent 1.5em,#94a3b8 1.6em)" class="border-l-2 border-red-300"></div>`}${(showKey || mode === 'preview') && it.criteria?.length ? `<ul class="text-xs text-gray-600 mt-2 list-disc ml-5">${it.criteria.map(cr => `<li>${esc(cr)}</li>`).join('')}</ul>` : ''}`;
      const scoreBox = mode === 'correct' ? `<span class="ml-auto text-xs whitespace-nowrap">${EVA_TYPES[it.type]?.auto ? `<span class="${scores[key] === it.points ? 'text-green-700' : 'text-red-600'} font-bold">${scores[key] ?? 0}/${it.points}</span>` : `<input type="number" step="0.5" min="0" max="${it.points}" value="${scores[key] ?? ''}" class="border rounded px-1 w-14 text-center" oninput="EVA.grade.item_scores['${key}']=+this.value; evaGradeTotal()"> /${it.points}`}</span>` : `<span class="ml-auto text-xs text-gray-400 whitespace-nowrap">${it.points} pt${it.points > 1 ? 's' : ''}</span>`;
      return `<div class="mb-4" id="item-${key}"><div class="flex items-start gap-2 mb-1"><span class="w-6 h-6 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">${n}</span><span class="bg-orange-50 text-red-700 font-bold px-2 rounded">${esc(it.consigne || '')}</span>${scoreBox}</div><div class="ml-8 text-[15px]">${body}</div></div>`;
    }).join('');
    return `<section class="bg-white rounded-2xl border-2 border-blue-900 p-4 mb-4 ${rtl ? 'text-right' : ''}" ${rtl ? 'dir="rtl"' : ''}>
      <h3 class="text-blue-900 font-black text-lg mb-1"><i class="fas fa-book-open mr-2 text-red-600"></i>${esc(s.title)}</h3>
      ${s.subtitle ? `<p class="text-sm text-gray-600 mb-2 bg-blue-50 inline-block px-2 rounded">${esc(s.subtitle)}</p>` : ''}
      ${s.text ? `<div class="mb-4">${s.text_title ? `<h4 class="text-center font-black text-red-600 text-xl bg-orange-50 rounded-lg py-1 mb-2">${esc(s.text_title)}</h4>` : ''}<div class="whitespace-pre-line leading-7 text-[15px] px-2">${esc(s.text)}</div></div>` : ''}
      ${items}</section>`;
  }).join('');
  return head + secs;
}
const evaNormJs = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
function evaRefreshItem() {}
function evaSpeak(text, lang) { try { const u = new SpeechSynthesisUtterance(text); u.lang = lang === 'ar' ? 'ar-TN' : 'fr-FR'; u.rate = 0.85; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch { toast('Synthèse vocale indisponible', 'error'); } }
function evaPreview() {
  const d = { ...EVA.doc, total_points: evaTotal(EVA.doc) };
  openModal('<i class="fas fa-eye mr-2 text-blue-600"></i>Aperçu de la fiche', `<div class="max-h-[75vh] overflow-y-auto pr-1">${evaFicheHtml(d, 'preview')}</div><div class="flex justify-end gap-2 mt-3"><button onclick="evaPdf(EVA.doc,false)" class="${btnSecondary}"><i class="fas fa-file-pdf text-red-600 mr-1"></i>PDF fiche</button><button onclick="evaPdf(EVA.doc,true)" class="${btnSecondary}"><i class="fas fa-key text-amber-600 mr-1"></i>PDF corrigé</button><button onclick="closeModal()" class="${btnPrimary}">Fermer</button></div>`, { wide: true });
}

/* ======================= PDF (format fiche) ======================= */
async function evaPdf(doc, corrige) {
  toast('Génération du PDF…', 'info');
  const pdf = await pdfDoc({ unit: 'mm', format: 'a4' });
  const W = 210, M = 12; let y = 0; const rtl = doc.lang === 'ar';
  const yearLbl = App.year || App.years?.find(y => y.is_current)?.label || '';
  const total = doc.total_points || evaTotal(doc);
  const line = (txt, size, style, opts = {}) => {
    pdf.setFontSize(size); pdf.setFont(undefined, style || 'normal');
    const lines = pdf.splitTextToSize(String(txt ?? ''), (opts.w || (W - 2 * M - (opts.x ? opts.x - M : 0))));
    for (const l of lines) { if (y > 280) { pdf.addPage(); header(); } pdf.text(l, rtl ? W - M : (opts.x || M), y, { align: rtl ? 'right' : 'left' }); y += size * 0.5; }
    y += opts.gap ?? 1;
  };
  const header = () => {
    y = 10;
    pdf.setFillColor(220, 38, 38); pdf.rect(0, 0, W / 3, 3, 'F'); pdf.setFillColor(255, 255, 255); pdf.rect(W / 3, 0, W / 3, 3, 'F'); pdf.setFillColor(30, 58, 138); pdf.rect(2 * W / 3, 0, W / 3, 3, 'F');
    pdf.setDrawColor(30, 58, 138); pdf.setLineWidth(0.6); pdf.roundedRect(M, y, W - 2 * M, 16, 3, 3);
    pdf.line(M + 45, y, M + 45, y + 16); pdf.line(W - M - 50, y, W - M - 50, y + 16);
    pdf.setFontSize(13); pdf.setFont(undefined, 'bold'); pdf.setTextColor(220, 38, 38); pdf.text(yearLbl, M + 22.5, y + 10, { align: 'center' });
    pdf.setFontSize(8); pdf.setTextColor(30, 58, 138); pdf.text((EVA_KINDS[doc.kind] || doc.kind).toUpperCase(), W / 2 - 2.5, y + 6, { align: 'center' });
    pdf.setFontSize(11); pdf.setTextColor(220, 38, 38); pdf.text(pdf.splitTextToSize(doc.title, 78)[0], W / 2 - 2.5, y + 12, { align: 'center' });
    pdf.setFontSize(7.5); pdf.setTextColor(30, 58, 138); pdf.text((LEVEL_LABELS[doc.level] || doc.level).toUpperCase(), W - M - 25, y + 7, { align: 'center' }); pdf.setFont(undefined, 'normal'); pdf.setTextColor(90); pdf.text(`${doc.duration_min ? doc.duration_min + ' min · ' : ''}/${total}${corrige ? ' · CORRIGÉ' : ''}`, W - M - 25, y + 12.5, { align: 'center' });
    pdf.setTextColor(0); y += 22;
    if (!corrige && pdf.getNumberOfPages() === 1) { pdf.setFontSize(10); pdf.text('Nom : ……………………………………   Prénom : ……………………………………   Classe : …………', M, y); y += 7; }
  };
  header();
  let n = 0;
  for (const s of doc.sections) {
    if (y > 250) { pdf.addPage(); header(); }
    pdf.setFillColor(219, 234, 254); pdf.roundedRect(M, y - 4, W - 2 * M, 8, 2, 2, 'F');
    pdf.setTextColor(30, 58, 138); line(s.title, 12, 'bold', { x: M + 3, gap: 2 }); pdf.setTextColor(0);
    if (s.subtitle) { pdf.setTextColor(80); line(s.subtitle, 9.5, 'normal', { gap: 2 }); pdf.setTextColor(0); }
    if (s.text) {
      if (s.text_title) { pdf.setTextColor(220, 38, 38); pdf.setFontSize(14); pdf.setFont(undefined, 'bold'); pdf.text(s.text_title, W / 2, y + 2, { align: 'center' }); y += 8; pdf.setTextColor(0); }
      pdf.setFontSize(10.5); pdf.setFont(undefined, 'normal');
      for (const para of String(s.text).split('\n')) { if (!para.trim()) { y += 2; continue; } line(para, 10.5, 'normal', { x: M + 4, gap: 0.5 }); }
      y += 3;
    }
    for (const it of s.items || []) {
      n++; if (y > 262) { pdf.addPage(); header(); }
      pdf.setFillColor(220, 38, 38); pdf.circle(M + 3, y - 1.5, 3, 'F'); pdf.setTextColor(255); pdf.setFontSize(8); pdf.setFont(undefined, 'bold'); pdf.text(String(n), M + 3, y - 0.3, { align: 'center' }); pdf.setTextColor(0);
      pdf.setTextColor(185, 28, 28); pdf.setFontSize(10.5); pdf.text(it.consigne || '', M + 8, y); pdf.setTextColor(120); pdf.setFontSize(8); pdf.setFont(undefined, 'normal'); pdf.text(`${it.points} pt${it.points > 1 ? 's' : ''}`, W - M, y, { align: 'right' }); pdf.setTextColor(0); y += 6;
      const X = M + 8;
      if (it.type === 'mcq') { if (it.question) line(it.question, 10.5, 'normal', { x: X }); (it.options || []).forEach((o, oi) => { const txt = typeof o === 'string' ? o : o.text; pdf.setFontSize(10.5); pdf.setFont(undefined, corrige && it.correct === oi ? 'bold' : 'normal'); if (corrige && it.correct === oi) pdf.setTextColor(21, 128, 61); pdf.text(`•  ${txt}${corrige && it.correct === oi ? '  ✔' : ''}`, X + 4, y); pdf.setTextColor(0); y += 6; }); }
      else if (it.type === 'truefalse') { line(it.question, 10.5, 'normal', { x: X }); pdf.rect(X + 2, y - 4, 5, 5); pdf.rect(X + 50, y - 4, 5, 5); pdf.setFontSize(10.5); pdf.setFont(undefined, 'normal'); pdf.text('Oui', X + 9, y); pdf.text('Non', X + 57, y); if (corrige) { pdf.setTextColor(21, 128, 61); pdf.setFont(undefined, 'bold'); pdf.text('✗', X + 3 + (it.correct === 1 ? 48 : 0), y - 0.3); pdf.setTextColor(0); } y += 8; }
      else if (it.type === 'match') { const lh = 6; const rows = Math.max((it.pairs || []).length, (it.rights || []).length); (it.pairs || []).forEach((p, pi) => { pdf.setFillColor(219, 234, 254); pdf.roundedRect(X, y - 4.5 + pi * lh * 1.5, 40, 6, 1.5, 1.5, 'F'); pdf.setFontSize(10.5); pdf.setFont(undefined, 'bold'); pdf.text(`${p.left}  ●`, X + 2, y + pi * lh * 1.5); }); (it.rights || []).forEach((r, ri) => { pdf.setFont(undefined, 'normal'); pdf.setFontSize(10.5); pdf.text(`●  ${r}`, X + 70, y + ri * lh); if (corrige) { const p = (it.pairs || []).find(pp => pp.right === ri); if (p) { pdf.setDrawColor(21, 128, 61); pdf.setLineWidth(0.5); pdf.line(X + 40, y - 1.5 + (it.pairs.indexOf(p)) * lh * 1.5, X + 69, y - 1.5 + ri * lh); pdf.setDrawColor(30, 58, 138); } } }); y += Math.max(rows * lh, (it.pairs || []).length * lh * 1.5) + 3; }
      else if (it.type === 'strike') { pdf.setFillColor(219, 234, 254); pdf.roundedRect(X, y - 4.5, 36, 6, 1.5, 1.5, 'F'); pdf.setFontSize(10.5); pdf.setFont(undefined, 'bold'); pdf.text(it.subject || '', X + 2, y); pdf.setFont(undefined, 'normal'); (it.options || []).forEach((o, oi) => { const yy = y + oi * 6; pdf.text(`●  ${o.text}`, X + 45, yy); if (corrige && o.false) { pdf.setDrawColor(220, 38, 38); pdf.setLineWidth(0.5); pdf.line(X + 45, yy - 1.3, X + 45 + pdf.getTextWidth(`●  ${o.text}`), yy - 1.3); pdf.setDrawColor(30, 58, 138); } }); y += Math.max(1, (it.options || []).length) * 6 + 3; }
      else if (it.type === 'fill' || it.type === 'conjug') {
        if (it.words?.length) { pdf.setDrawColor(220, 38, 38); pdf.setLineDashPattern([1.5, 1], 0); pdf.roundedRect(X, y - 4.5, W - M - X, 7, 2, 2); pdf.setLineDashPattern([], 0); pdf.setDrawColor(30, 58, 138); pdf.setFontSize(10.5); pdf.setFont(undefined, 'normal'); pdf.text(it.words.join('   -   '), W / 2 + 4, y, { align: 'center' }); y += 9; }
        if (it.dictation && corrige) { pdf.setTextColor(126, 34, 206); line('Dictée : ' + it.dictation, 9, 'normal', { x: X }); pdf.setTextColor(0); }
        let bi = 0; const txt = String(it.text || '').replace(/___/g, () => { const b = (it.blanks || [])[bi++] || {}; return corrige ? `[${b.answer || ''}]` : '……………………'; });
        for (const para of txt.split('\n')) { if (!para.trim()) continue; pdf.setFontSize(10.5); pdf.setFont(undefined, 'normal'); pdf.text('•', X, y); line(para, 10.5, 'normal', { x: X + 4, gap: 2 }); }
      }
      else if (it.type === 'quote') { if (it.question) { pdf.setFont(undefined, 'italic'); line(it.question, 10, 'normal', { x: X }); } if (corrige) { pdf.setTextColor(21, 128, 61); line('→ ' + (it.answer || ''), 10.5, 'bold', { x: X }); pdf.setTextColor(0); } else { pdf.setLineDashPattern([0.8, 1], 0); pdf.line(X, y, W - M, y); y += 7; pdf.line(X, y, W - M, y); pdf.setLineDashPattern([], 0); y += 5; } }
      else if (it.type === 'open') {
        if (it.prompt) { pdf.setFillColor(255, 251, 235); const lines = pdf.splitTextToSize(it.prompt, W - M - X - 4); pdf.roundedRect(X, y - 4, W - M - X, lines.length * 5 + 3, 2, 2, 'F'); line(it.prompt, 10, 'normal', { x: X + 2, gap: 3 }); }
        if (it.image_url) { try { const img = await evaImgData(it.image_url); const h = Math.min(80, (W - M - X) * img.h / img.w); if (y + h > 285) { pdf.addPage(); header(); } pdf.addImage(img.data, 'JPEG', X, y, h * img.w / img.h, h); y += h + 3; } catch {} }
        if (corrige) { if (it.criteria?.length) { pdf.setTextColor(80); line('Critères : ' + it.criteria.join(' ; '), 9, 'normal', { x: X }); pdf.setTextColor(0); } }
        else { const lines = it.lines || 10; for (let i = 0; i < lines; i++) { if (y > 285) { pdf.addPage(); header(); } pdf.setDrawColor(148, 163, 184); pdf.setLineWidth(0.2); pdf.line(X, y, W - M, y); y += 8; } pdf.setDrawColor(30, 58, 138); pdf.setLineWidth(0.6); if (it.criteria?.length) { pdf.setTextColor(120); line('Critères : ' + it.criteria.join(' ; '), 8, 'normal', { x: X }); pdf.setTextColor(0); } }
      }
      y += 3;
    }
    y += 3;
  }
  // Pied de page
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(`${App.settings?.school_name || 'Rahma Academy'} — ${doc.title} — page ${i}/${pages}`, W / 2, 292, { align: 'center' }); pdf.setFillColor(30, 58, 138); pdf.circle(W - M, 291, 3, 'F'); pdf.setTextColor(255); pdf.text(String(i), W - M, 292, { align: 'center' }); }
  pdf.save(`${corrige ? 'Corrige' : 'Evaluation'}_${(doc.title || 'fiche').replace(/[^\w\u0600-\u06FF-]+/g, '_')}_${doc.level}.pdf`);
}
function evaImgData(url) { return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); res({ data: c.toDataURL('image/jpeg', 0.85), w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = rej; im.src = url; }); }

/* ======================= COPIES / CORRECTION (staff) ======================= */
async function evaOpen(id) {
  const ev = (await api.get(`/evaluations/${id}`)).data;
  App.cache.evaCur = ev;
  const el = document.getElementById('main-content');
  const studs = (await db.list('students', `select=id,first_name,last_name,level&status=eq.actif&level=eq.${encodeURIComponent(ev.level)}&order=last_name`)).filter(s => !isStaff() || App.user.role === 'admin' || true);
  const byId = Object.fromEntries((ev.attempts || []).map(a => [a.student_id, a]));
  const graded = (ev.attempts || []).filter(a => a.score != null);
  const avg = graded.length ? (graded.reduce((x, a) => x + Number(a.score) / Number(a.max_score || ev.total_points) * 20, 0) / graded.length).toFixed(1) : null;
  el.innerHTML = pageHeader(`Copies — ${esc(ev.title)} <span class="badge badge-blue">${esc(ev.level)}</span>`, 'fa-highlighter',
    `<button onclick="navigate('evaluations')" class="${btnSecondary}"><i class="fas fa-arrow-left mr-1"></i> Retour</button><button onclick="evaPdf(App.cache.evaCur,false)" class="${btnSecondary}"><i class="fas fa-file-pdf text-red-600 mr-1"></i> Fiche</button><button onclick="evaPdf(App.cache.evaCur,true)" class="${btnSecondary}"><i class="fas fa-key text-amber-600 mr-1"></i> Corrigé</button><button onclick="evaExportXlsx()" class="${btnSecondary}"><i class="fas fa-file-excel text-green-700 mr-1"></i> Excel</button>`) + `
  <div class="grid md:grid-cols-4 gap-3 mb-4">
    ${[['Élèves', studs.length, 'fa-users', 'blue'], ['Copies rendues', ev.attempts.length, 'fa-paper-plane', 'purple'], ['Corrigées', graded.length, 'fa-check-double', 'green'], ['Moyenne /20', avg ?? '—', 'fa-chart-line', 'amber']].map(([l, v, i, c]) => `<div class="bg-white rounded-xl shadow p-4 flex items-center gap-3"><div class="w-10 h-10 rounded-lg bg-${c}-100 text-${c}-700 flex items-center justify-center"><i class="fas ${i}"></i></div><div><p class="text-xs text-gray-500">${l}</p><p class="text-xl font-bold">${v}</p></div></div>`).join('')}
  </div>
  <div class="bg-white rounded-xl shadow overflow-x-auto"><table class="w-full text-sm">
    <thead class="bg-gray-50 text-gray-600 text-xs uppercase"><tr><th class="p-3 text-left">Élève</th><th class="p-3">Statut</th><th class="p-3">Auto</th><th class="p-3">Note</th><th class="p-3">/20</th><th class="p-3">Rendu le</th><th class="p-3"></th></tr></thead>
    <tbody class="divide-y">${studs.map(s => { const a = byId[s.id]; const m = Number(a?.max_score || ev.total_points || 20); return `<tr class="hover:bg-blue-50/40">
      <td class="p-3 font-semibold">${esc(s.last_name + ' ' + s.first_name)}</td>
      <td class="p-3 text-center">${!a ? '<span class="badge badge-gray">Non rendu</span>' : a.status === 'graded' ? '<span class="badge badge-green">Corrigée</span>' : '<span class="badge badge-yellow">À corriger</span>'}</td>
      <td class="p-3 text-center text-gray-500">${a?.auto_score ?? '—'}</td>
      <td class="p-3 text-center font-bold ${a?.score != null ? (a.score / m >= 0.5 ? 'text-green-700' : 'text-red-600') : ''}">${a?.score != null ? a.score + '/' + m : '—'}</td>
      <td class="p-3 text-center">${a?.score != null ? (a.score / m * 20).toFixed(1) : '—'}</td>
      <td class="p-3 text-center text-xs text-gray-500">${a?.submitted_by ? dayjs(a.submitted_at).format('DD/MM HH:mm') : a ? 'papier' : ''}</td>
      <td class="p-3 text-right">${isReadOnlyYear() ? '' : `<button onclick="evaGradeModal(${s.id})" class="${btnPrimary} text-xs py-1"><i class="fas ${a ? 'fa-highlighter' : 'fa-pen'} mr-1"></i>${a ? 'Corriger' : 'Saisir (papier)'}</button>`}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function evaExportXlsx() {
  const ev = App.cache.evaCur; const rows = (ev.attempts || []).map(a => ({ Élève: a.students ? a.students.last_name + ' ' + a.students.first_name : a.student_id, Statut: a.status, 'Auto': a.auto_score, Note: a.score, Max: a.max_score, '/20': a.score != null ? +(a.score / a.max_score * 20).toFixed(2) : '', Remarque: a.feedback || '', Rendu: a.submitted_at }));
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Copies'); XLSX.writeFile(wb, `Evaluation_${ev.level}_${ev.title.replace(/\W+/g, '_')}.xlsx`);
}
function evaGradeModal(sid) {
  const ev = App.cache.evaCur; const a = (ev.attempts || []).find(x => x.student_id === sid) || null;
  EVA.grade = { student_id: sid, item_scores: { ...(a?.item_scores || {}) } };
  const st = a?.students || {}; const max = Number(a?.max_score || ev.total_points || 20);
  const html = a ? evaFicheHtml({ ...ev }, 'correct', a) : `<div class="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm mb-3"><i class="fas fa-print mr-1"></i>Passation papier : saisissez les points par exercice ci-dessous ou la note globale.</div>` + evaFicheHtml({ ...ev }, 'correct', { answers: {}, item_scores: {} });
  openModal(`<i class="fas fa-highlighter mr-2 text-amber-600"></i>Correction — ${esc((st.first_name || '') + ' ' + (st.last_name || ''))}`, `
    <div class="max-h-[60vh] overflow-y-auto pr-1 text-sm">${html}</div>
    <div class="border-t pt-3 mt-3 grid md:grid-cols-3 gap-3 items-end">
      <div><label class="${lblCls}">Total (calculé)</label><div class="text-2xl font-bold text-blue-800"><span id="eva-grade-total">${a?.score ?? Object.values(EVA.grade.item_scores).reduce((x, y) => x + (+y || 0), 0)}</span> / ${max}</div></div>
      <div><label class="${lblCls}">Ou note globale (remplace)</label><input type="number" step="0.25" min="0" max="${max}" id="eva-grade-score" class="${inputCls}" placeholder="ex. 14.5"></div>
      <div><label class="${lblCls}">Remarque à la famille</label><input id="eva-grade-fb" class="${inputCls}" value="${esc(a?.feedback || '')}"></div>
    </div>
    <div class="flex justify-end gap-2 mt-3"><button onclick="closeModal()" class="${btnSecondary}">Annuler</button><button onclick="evaGradeSave()" class="${btnPrimary} bg-green-600 hover:bg-green-700"><i class="fas fa-check mr-1"></i> Valider la note${ev.count_in_term ? ' (+ carnet)' : ''}</button></div>`, { wide: true });
}
function evaGradeTotal() { const t = document.getElementById('eva-grade-total'); if (t) t.textContent = Math.round(Object.values(EVA.grade.item_scores).reduce((x, y) => x + (+y || 0), 0) * 100) / 100; }
async function evaGradeSave() {
  const ev = App.cache.evaCur; const g = EVA.grade; const sc = document.getElementById('eva-grade-score').value;
  try { await api.post(`/evaluations/${ev.id}/grade`, { student_id: g.student_id, item_scores: g.item_scores, score: sc !== '' ? +sc : null, feedback: document.getElementById('eva-grade-fb').value }); closeModal(); toast('Note enregistrée (famille notifiée)'); evaOpen(ev.id); }
  catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}

/* ======================= FAMILLE : passation ======================= */
function renderEvaFamily(el, items) {
  const kids = linkedIds().map(id => App.cache.kidsById[id]).filter(Boolean);
  el.innerHTML = pageHeader('Évaluations en ligne <span class="text-gray-400 text-base font-normal">· التقييمات</span>', 'fa-file-signature') + `
  ${!items.length ? '<div class="bg-white rounded-xl shadow p-10 text-center text-gray-400"><i class="fas fa-file-signature text-4xl mb-3"></i><p>Aucune évaluation disponible pour le moment.</p></div>' : ''}
  <div class="grid md:grid-cols-2 gap-4">${items.map(e => { const kidsLv = kids.filter(k => k.level === e.level); return `<article class="bg-white rounded-xl shadow p-5">
    <div class="flex items-start justify-between gap-2 mb-1"><h3 class="font-bold text-gray-800">${esc(e.title)}</h3><span class="badge badge-blue">${esc(e.level)}</span></div>
    <p class="text-xs text-gray-500 mb-2">${esc(EVA_KINDS[e.kind] || e.kind)}${e.subjects?.name ? ' · ' + esc(e.subjects.name) : ''}${e.teachers ? ' · ' + esc(e.teachers.first_name + ' ' + e.teachers.last_name) : ''} · ${e.items_count} exercices · /${e.total_points}${e.duration_min ? ' · ' + e.duration_min + ' min' : ''}</p>
    ${e.due_at ? `<p class="text-xs ${new Date(e.due_at) < Date.now() ? 'text-red-600' : 'text-amber-700'} mb-2"><i class="fas fa-calendar-day mr-1"></i>À faire avant le ${dayjs(e.due_at).format('DD/MM/YYYY HH:mm')}</p>` : ''}
    <div class="space-y-2">${(kidsLv.length ? kidsLv : [{ id: linkedIds()[0], first_name: 'Moi', last_name: '' }]).map(k => { const a = (e.my_attempts || []).find(x => x.student_id === k.id); return `<div class="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-3 py-2"><span class="text-sm font-semibold">${esc(k.first_name + ' ' + k.last_name)}</span>
      ${a ? (a.status === 'graded' ? `<span class="font-bold ${a.score / a.max_score >= 0.5 ? 'text-green-700' : 'text-red-600'}">${a.score}/${a.max_score}</span> <button onclick="evaShowResult(${e.id},${k.id})" class="${btnSecondary} text-xs py-1"><i class="fas fa-eye mr-1"></i>Voir la copie</button>` : `<span class="badge badge-yellow">Rendue · en attente de correction</span>`) : (e.due_at && new Date(e.due_at) < Date.now() ? '<span class="badge badge-red">Délai dépassé</span>' : `<button onclick="evaTake(${e.id},${k.id})" class="${btnPrimary} text-xs py-1.5"><i class="fas fa-play mr-1"></i>Commencer</button>`)}</div>`; }).join('')}</div>
  </article>`; }).join('')}</div>`;
}
async function evaTake(id, sid) {
  const ev = (await api.get(`/evaluations/${id}`)).data; EVA.take = { ev, sid }; EVA.answers = {};
  const el = document.getElementById('main-content');
  el.innerHTML = pageHeader(esc(ev.title), 'fa-pen', `<button onclick="if(confirm('Quitter sans rendre ? Vos réponses seront perdues.')) navigate('evaluations')" class="${btnSecondary}">Quitter</button>`) + `
    <div class="max-w-3xl mx-auto">${ev.duration_min ? `<div class="sticky top-0 z-10 bg-white/90 backdrop-blur rounded-lg shadow px-4 py-2 mb-3 flex items-center justify-between text-sm"><span><i class="fas fa-hourglass-half mr-1 text-amber-600"></i>Temps conseillé : ${ev.duration_min} min</span><span id="eva-timer" class="font-mono font-bold text-blue-800">00:00</span></div>` : ''}
    <form id="eva-form" onsubmit="return false">${evaFicheHtml(ev, 'answer')}</form>
    <div class="text-center mb-8"><button onclick="evaSubmit()" class="${btnPrimary} bg-green-600 hover:bg-green-700 text-lg px-8 py-3"><i class="fas fa-paper-plane mr-2"></i>Rendre ma copie</button></div></div>`;
  if (ev.duration_min) { const t0 = Date.now(); clearInterval(EVA.timer); EVA.timer = setInterval(() => { const el2 = document.getElementById('eva-timer'); if (!el2) return clearInterval(EVA.timer); const s = Math.floor((Date.now() - t0) / 1000); el2.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); if (s > ev.duration_min * 60) el2.classList.add('text-red-600'); }, 1000); }
  window.scrollTo(0, 0);
}
async function evaSubmit() {
  const { ev, sid } = EVA.take; const total = ev.sections.reduce((n, s) => n + s.items.length, 0); const done = Object.keys(EVA.answers).filter(k => { const v = EVA.answers[k]; return v !== '' && v != null && !(typeof v === 'object' && !Object.values(v).some(x => x !== '' && x != null && x !== false)); }).length;
  if (done < total && !confirm(`${total - done} exercice(s) sans réponse. Rendre quand même ?`)) return;
  try { const r = (await api.post(`/evaluations/${ev.id}/submit`, { student_id: sid, answers: EVA.answers })).data; clearInterval(EVA.timer); try { confetti && confetti({ particleCount: 120, spread: 80 }); } catch {}
    openModal('<i class="fas fa-check-circle text-green-600 mr-2"></i>Copie rendue', `<div class="text-center py-4"><p class="text-4xl font-black text-blue-800 mb-2">${r.auto_score} <span class="text-lg text-gray-400">pts auto-corrigés</span></p><p class="text-sm text-gray-600">${r.pending_manual ? 'Les exercices rédigés (production écrite, phrases à relever) seront corrigés par l\'enseignant. Vous recevrez la note finale par notification.' : `Note finale : <b>${r.auto_score}/${r.max}</b>`}</p></div><div class="text-center"><button onclick="closeModal(); navigate('evaluations')" class="${btnPrimary}">OK</button></div>`);
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); }
}
async function evaShowResult(id, sid) {
  const ev = (await api.get(`/evaluations/${id}`)).data; const a = (ev.attempts || []).find(x => x.student_id === sid); if (!a) return;
  a.students = App.cache.kidsById[sid];
  openModal(`<i class="fas fa-file-lines mr-2 text-blue-600"></i>Copie corrigée — ${a.score}/${a.max_score}`, `<div class="max-h-[70vh] overflow-y-auto pr-1 text-sm">${a.feedback ? `<div class="bg-green-50 border border-green-200 rounded-lg p-3 mb-3"><i class="fas fa-comment mr-1"></i><b>Remarque :</b> ${esc(a.feedback)}</div>` : ''}${evaFicheHtml(ev, 'correct', a).replace(/<input[^>]*type="number"[^>]*>/g, '')}</div><div class="text-right mt-3"><button onclick="closeModal()" class="${btnPrimary}">Fermer</button></div>`, { wide: true });
}
