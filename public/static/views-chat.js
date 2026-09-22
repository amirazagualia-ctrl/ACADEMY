/* ============================================================
   Rahma Academy — Discussions (messagerie interne)
   Parents <-> Administration, un fil par élève
   ============================================================ */

VIEWS.chat = async function (el) {
  const threads = (await api.get('/chat/threads')).data;
  let channel = null;
  try { channel = (await db.list('settings', 'select=*&key=eq.telegram_channel'))[0]?.value?.username || null; } catch (e) {}
  const current = App.cache.chatStudent || null;

  // Auto-sélection : si un seul fil, l'ouvrir
  const selected = current || (threads.length === 1 ? threads[0].student_id : null);
  if (selected && selected !== current) App.cache.chatStudent = selected;

  el.innerHTML = pageHeader('Discussions', 'fa-comments') + `
  ${channel ? `
  <div class="bg-sky-50 border border-sky-200 rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap">
    <i class="fab fa-telegram text-sky-500 text-2xl"></i>
    <div class="flex-1 min-w-0 text-sm">
      <b class="text-sky-800">Canal d'annonces de l'école</b>
      <p class="text-xs text-sky-600">Abonnez-vous pour recevoir toutes les annonces (vacances, événements, rappels)</p>
    </div>
    <a href="https://t.me/${esc(channel.replace('@',''))}" target="_blank" class="bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold px-4 py-2 rounded-lg"><i class="fab fa-telegram mr-1"></i> Rejoindre ${esc(channel)}</a>
  </div>` : ''}
  <div class="bg-white rounded-xl shadow overflow-hidden flex flex-col md:flex-row" style="min-height:65vh">
    <aside class="md:w-72 border-b md:border-b-0 md:border-r flex-shrink-0 overflow-y-auto" id="chat-threads" style="max-height:65vh">
      ${threads.length ? threads.map(t => `
        <a href="#" onclick="openChatThread(${t.student_id});return false;"
           class="flex items-center gap-3 p-3 border-b hover:bg-blue-50 ${selected === t.student_id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}">
          <div class="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold flex-shrink-0">
            ${esc((t.student?.first_name || '?')[0])}${esc((t.student?.last_name || '')[0] || '')}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2">
              <b class="text-sm truncate">${esc(t.student ? `${t.student.first_name} ${t.student.last_name}` : 'Élève ' + t.student_id)}</b>
              ${t.unread ? `<span class="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 font-bold">${t.unread}</span>` : ''}
            </div>
            <p class="text-xs text-gray-400 truncate">${t.last ? esc(t.last.message) : '<i>Aucun message — démarrez la discussion</i>'}</p>
          </div>
        </a>`).join('') : `<p class="text-gray-400 text-sm text-center py-10 px-4">${isStaff() ? 'Aucune discussion. Les parents peuvent vous écrire depuis leur espace.' : 'Aucun enfant lié à votre compte.'}</p>`}
      ${isStaff() ? `<div class="p-3 space-y-2"><button onclick="newChatThread()" class="${btnSecondary} w-full text-xs"><i class="fas fa-plus mr-1"></i> Écrire à un tuteur</button><button onclick="showGroupMessage()" class="${btnPrimary} w-full text-xs"><i class="fas fa-bullhorn mr-1"></i> Message groupé (niveau / classe)</button></div>` : ''}
    </aside>
    <section class="flex-1 flex flex-col min-w-0" id="chat-panel">
      ${selected ? '<div class="flex-1 flex items-center justify-center text-gray-300"><i class="fas fa-spinner fa-spin text-2xl"></i></div>' : `
      <div class="flex-1 flex flex-col items-center justify-center text-gray-300 py-16">
        <i class="fas fa-comments text-5xl mb-3"></i>
        <p class="text-sm text-gray-400">Sélectionnez une discussion${isStaff() ? ' ou écrivez à un tuteur' : ''}</p>
      </div>`}
    </section>
  </div>`;

  if (selected) await renderChatPanel(selected);
};

function openChatThread(studentId) {
  App.cache.chatStudent = studentId;
  render();
}

async function newChatThread() {
  const students = await db.list('students', 'select=id,first_name,last_name,level,parent_name&status=eq.actif&order=last_name.asc');
  openModal('<i class="fas fa-comments text-blue-600 mr-2"></i>Nouvelle discussion', `
    <label class="${lblCls}">Élève (tuteur destinataire)</label>
    <select id="nc-student" class="${inputCls} mb-4">
      ${students.map(s => `<option value="${s.id}">${esc(fullName(s))} (${s.level}) — ${esc(s.parent_name || 'tuteur')}</option>`).join('')}
    </select>
    <button onclick="App.cache.chatStudent=Number(document.getElementById('nc-student').value); closeModal(); render();" class="${btnPrimary} w-full">Ouvrir la discussion</button>
  `);
}

async function renderChatPanel(studentId) {
  const panel = document.getElementById('chat-panel');
  if (!panel) return;
  let msgs = [];
  try { msgs = (await api.get(`/chat/messages/${studentId}`)).data; } catch (e) {}
  let student = null;
  try { student = (await db.list('students', `select=id,first_name,last_name,level,parent_name&id=eq.${studentId}`))[0]; } catch (e) {}

  const mine = (m) => {
    const p = (m.title || '').startsWith('parent:');
    return isStaff() ? !p : p;
  };
  // 'staff:Nom|Matière' -> Nom + badge matière ; 'parent:Nom' -> Nom
  const senderName = (m) => {
    const raw = (m.title || '').split(':').slice(1).join(':');
    const isParent = (m.title || '').startsWith('parent:');
    if (!raw) return esc(isParent ? 'Tuteur' : 'Administration');
    const [name, subject] = raw.split('|');
    return esc(name || (isParent ? 'Tuteur' : 'Administration')) +
      (subject ? ` <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 align-middle"><i class="fas fa-book-open mr-0.5"></i>${esc(subject)}</span>` : '');
  };

  panel.innerHTML = `
    <header class="p-3 border-b bg-gray-50 flex items-center gap-3">
      <div class="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">${esc((student?.first_name || '?')[0])}</div>
      <div>
        <b class="text-sm">${esc(student ? `${student.first_name} ${student.last_name}` : 'Élève')}</b>
        <p class="text-xs text-gray-400">${esc(student?.level || '')}${student?.parent_name ? ' • Tuteur : ' + esc(student.parent_name) : ''}</p>
      </div>
      <button onclick="renderChatPanel(${studentId})" class="ml-auto text-gray-400 hover:text-blue-600" title="Actualiser"><i class="fas fa-rotate"></i></button>
    </header>
    <div class="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50" id="chat-messages" style="max-height:45vh">
      ${msgs.length ? msgs.map(m => `
        <div class="flex ${mine(m) ? 'justify-end' : 'justify-start'}">
          <div class="max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm ${mine(m) ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white border rounded-bl-sm'}">
            <p class="text-xs font-bold ${mine(m) ? 'text-blue-200' : 'text-blue-600'} mb-0.5">${senderName(m)}</p>
            <p class="whitespace-pre-wrap break-words">${esc(m.message)}</p>
            <p class="text-[10px] mt-1 ${mine(m) ? 'text-blue-200' : 'text-gray-400'}">${fmtDT(m.created_at)}</p>
          </div>
        </div>`).join('') : '<p class="text-center text-gray-400 text-sm py-8">Aucun message. Écrivez le premier !</p>'}
    </div>
    <form onsubmit="sendChatMessage(event, ${studentId})" class="p-3 border-t flex gap-2 items-end">
      <textarea id="chat-input" rows="1" placeholder="Écrivez votre message…" class="${inputCls} flex-1 resize-none" style="min-height:42px"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit();}"></textarea>
      <button type="submit" class="${btnPrimary} h-[42px] px-5"><i class="fas fa-paper-plane"></i></button>
    </form>`;

  const box = document.getElementById('chat-messages');
  if (box) box.scrollTop = box.scrollHeight;
}

async function sendChatMessage(e, studentId) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const text = (input?.value || '').trim();
  if (!text) return;
  input.disabled = true;
  try {
    await api.post('/chat/send', { student_id: studentId, text });
    await renderChatPanel(studentId);
  } catch (err) {
    toast(err.response?.data?.error || "Erreur d'envoi", 'error');
    input.disabled = false;
  }
}

// ---- Message groupé : enseignant/admin → tous les parents d'un niveau ou d'une classe ----
async function showGroupMessage() {
  let targets = {};
  try { targets = (await api.get('/chat/broadcast/targets')).data.levels || {}; } catch (e) { return toast(e.response?.data?.error || 'Erreur', 'error'); }
  const levels = Object.keys(targets).sort();
  if (!levels.length) return toast('Aucun élève dans votre périmètre', 'error');
  App.cache.gmTargets = targets;
  openModal('<i class="fas fa-bullhorn text-blue-600 mr-2"></i>Message groupé aux parents <span class="text-gray-400 text-sm font-normal">· رسالة جماعية للأولياء</span>', `
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div><label class="${lblCls}">Niveau *</label>
        <select id="gm-level" class="${inputCls}" onchange="gmLevelChanged()">${levels.map(l => `<option value="${l}">${esc(LEVEL_LABELS[l] || l)} (${targets[l].count})</option>`).join('')}</select></div>
      <div><label class="${lblCls}">Classe</label>
        <select id="gm-class" class="${inputCls}"></select></div>
    </div>
    <div id="gm-count" class="text-xs text-gray-600 bg-blue-50 rounded-lg p-2 mb-3"></div>
    <label class="${lblCls}">Message *</label>
    <textarea id="gm-text" class="${inputCls} mb-2" rows="5" maxlength="2000" placeholder="Ex. : Chers parents, le contrôle de mathématiques est reporté à jeudi 12 octobre. Merci de veiller aux révisions."></textarea>
    <p class="text-xs text-gray-500 mb-3"><i class="fas fa-circle-info mr-1"></i>Le message apparaît dans la discussion de chaque élève (le parent peut répondre individuellement), est envoyé sur Telegram aux parents liés et publié dans les notifications du niveau.</p>
    <div class="flex justify-end gap-2"><button onclick="closeModal()" class="${btnSecondary}">Annuler</button><button id="gm-send" onclick="sendGroupMessage()" class="${btnPrimary}"><i class="fas fa-paper-plane mr-1"></i> Envoyer</button></div>`);
  gmLevelChanged();
}
function gmLevelChanged() {
  const t = App.cache.gmTargets || {}; const lvl = document.getElementById('gm-level').value; const L = t[lvl] || { count: 0, with_phone: 0, classes: {} };
  const sel = document.getElementById('gm-class');
  sel.innerHTML = `<option value="">Tout le niveau (${L.count})</option>` + Object.entries(L.classes).sort().map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join('');
  sel.onchange = gmUpdateCount; gmUpdateCount();
}
function gmUpdateCount() {
  const t = App.cache.gmTargets || {}; const lvl = document.getElementById('gm-level').value; const cls = document.getElementById('gm-class').value; const L = t[lvl] || { count: 0, with_phone: 0, classes: {} };
  const n = cls ? (L.classes[cls] || 0) : L.count;
  document.getElementById('gm-count').innerHTML = `<i class="fas fa-users mr-1"></i><b>${n}</b> élève(s) ciblé(s)${!cls ? ` · <b>${L.with_phone}</b> parent(s) avec téléphone (Telegram)` : ''}${isStaff() && App.user.role === 'teacher' ? ' · limité à vos élèves affectés' : ''}`;
}
async function sendGroupMessage() {
  const level = document.getElementById('gm-level').value, class_name = document.getElementById('gm-class').value, text = document.getElementById('gm-text').value.trim();
  if (!text) return toast('Message vide', 'error');
  if (!confirm(`Envoyer ce message à tous les parents de ${class_name || LEVEL_LABELS[level] || level} ?`)) return;
  const btn = document.getElementById('gm-send'); btn.disabled = true;
  try {
    const r = (await api.post('/chat/broadcast', { level, class_name, text })).data;
    closeModal(); toast(`Message envoyé à ${r.count} famille(s)${r.telegram ? ` · ${r.telegram} Telegram` : ''}`);
    App.cache.chatStudent = null; render();
  } catch (e) { toast(e.response?.data?.error || 'Erreur', 'error'); btn.disabled = false; }
}
