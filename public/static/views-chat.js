/* ============================================================
   Rahma Cours de Français — Discussions (messagerie interne)
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
      ${isStaff() ? `<div class="p-3"><button onclick="newChatThread()" class="${btnSecondary} w-full text-xs"><i class="fas fa-plus mr-1"></i> Écrire à un tuteur</button></div>` : ''}
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
  const senderName = (m) => esc((m.title || '').split(':').slice(1).join(':') || ((m.title || '').startsWith('parent:') ? 'Tuteur' : 'Administration'));

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
