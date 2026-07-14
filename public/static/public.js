/* ============================================================
   EduManage - Page publique : accueil, connexion, inscription
   ============================================================ */

function renderPublic(app) {
  app.innerHTML = `
  <div class="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
    <header class="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-white"><i class="fas fa-graduation-cap text-amber-400 mr-2"></i>EduManage</h1>
      <div class="flex gap-3">
        <button onclick="showLoginModal()" class="px-4 py-2 rounded-lg bg-white text-blue-900 font-semibold text-sm hover:bg-blue-50"><i class="fas fa-right-to-bracket mr-1"></i> Connexion</button>
        <button onclick="showSignupModal()" class="px-4 py-2 rounded-lg bg-amber-400 text-blue-900 font-semibold text-sm hover:bg-amber-300"><i class="fas fa-user-plus mr-1"></i> Créer un compte</button>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 pt-12 pb-20 text-center">
      <h2 class="text-4xl md:text-5xl font-extrabold text-white leading-tight">Plateforme d'éducation<br><span class="text-amber-400">complète</span></h2>
      <p class="text-blue-200 mt-4 max-w-2xl mx-auto">Gestion des élèves du primaire (1ère → 6ème année), de base (7ème → 9ème année) et du secondaire (1ère → 4ème année). Présence, notes, bulletins, frais, cours et notifications automatiques.</p>
      <div class="mt-8 flex justify-center gap-4 flex-wrap">
        <button onclick="showRegistrationModal()" class="px-6 py-3 rounded-xl bg-amber-400 text-blue-900 font-bold hover:bg-amber-300 shadow-lg"><i class="fas fa-file-signature mr-2"></i>Inscrire un élève</button>
        <button onclick="showLoginModal()" class="px-6 py-3 rounded-xl bg-white/10 text-white font-bold border border-white/30 hover:bg-white/20"><i class="fas fa-right-to-bracket mr-2"></i>Espace membres</button>
        <button onclick="showInscriptionQR()" class="px-6 py-3 rounded-xl bg-white text-blue-900 font-bold hover:bg-blue-50 shadow-lg"><i class="fas fa-qrcode mr-2"></i>QR Code inscription</button>
      </div>
      <section id="features-grid" class="grid md:grid-cols-3 gap-6 mt-16 text-left">
        ${[
          ['fa-user-graduate','Gestion des élèves','CRUD complet avec photo, du 1AP au 4AS sur les 3 cycles.'],
          ['fa-clipboard-check','Présence & Calendrier','Suivi quotidien de la présence et calendrier scolaire.'],
          ['fa-star','Notes & Bulletins PDF','Saisie des notes par trimestre et bulletins téléchargeables.'],
          ['fa-money-bill-wave',"Frais d'inscription",'Suivi des paiements avec relances automatiques.'],
          ['fa-bell','Notifications automatiques','Email/SMS aux tuteurs : absences, notes, impayés.'],
          ['fa-book-open','Cours & Documents','PDF, Excel, Word... et cours interactifs par niveau.']
        ].map(([i,t,d]) => `
        <article class="bg-white/10 backdrop-blur rounded-xl p-6 border border-white/10">
          <i class="fas ${i} text-2xl text-amber-400"></i>
          <h3 class="text-white font-bold mt-3">${t}</h3>
          <p class="text-blue-200 text-sm mt-1">${d}</p>
        </article>`).join('')}
      </section>
    </main>
    <footer class="text-center text-blue-300 text-xs pb-6">© 2026 EduManage - École Tunisienne</footer>
  </div>`;
}

function showLoginModal() {
  openModal('<i class="fas fa-right-to-bracket text-blue-600 mr-2"></i>Connexion', `
    <form onsubmit="doLogin(event)">
      <label class="${lblCls}">Email</label>
      <input id="login-email" type="email" required class="${inputCls} mb-3" placeholder="votre@email.com">
      <label class="${lblCls}">Mot de passe</label>
      <input id="login-password" type="password" required class="${inputCls} mb-4">
      <div id="login-error" class="text-red-600 text-sm mb-3 hidden"></div>
      <button type="submit" class="${btnPrimary} w-full"><i class="fas fa-right-to-bracket mr-1"></i> Se connecter</button>
      <p class="text-xs text-gray-400 mt-3 text-center">Compte démo admin : admin@edumanage.tn / admin123</p>
    </form>`);
}

async function doLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const r = await api.post('/auth/login', { email: formVal('login-email'), password: document.getElementById('login-password').value });
    App.token = r.data.token; App.user = r.data.user;
    localStorage.setItem('edu_token', App.token);
    closeModal(); render();
    toast(`Bienvenue, ${esc(App.user.name)} !`);
  } catch (err) {
    errEl.textContent = err.response?.data?.error || 'Erreur de connexion';
    errEl.classList.remove('hidden');
  }
}

async function showSignupModal() {
  let students = [];
  try { students = (await api.get('/public/students')).data; } catch {}
  openModal('<i class="fas fa-user-plus text-blue-600 mr-2"></i>Créer un compte', `
    <form onsubmit="doSignup(event)">
      <label class="${lblCls}">Nom complet</label>
      <input id="su-name" required class="${inputCls} mb-3">
      <label class="${lblCls}">Email</label>
      <input id="su-email" type="email" required class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label>
      <input id="su-phone" class="${inputCls} mb-3" placeholder="+216 ...">
      <label class="${lblCls}">Mot de passe</label>
      <input id="su-password" type="password" required minlength="6" class="${inputCls} mb-3">
      <label class="${lblCls}">Rôle</label>
      <select id="su-role" class="${inputCls} mb-3" onchange="document.getElementById('su-link-wrap').style.display = ['parent','student'].includes(this.value) ? 'block' : 'none'">
        <option value="parent">Parent / Tuteur</option>
        <option value="student">Élève</option>
        <option value="teacher">Enseignant</option>
        <option value="admin">Administration</option>
      </select>
      <div id="su-link-wrap">
        <label class="${lblCls}">Élève lié (sélectionnez l'élève concerné)</label>
        <select id="su-student" class="${inputCls} mb-3">
          <option value="">-- Aucun pour l'instant --</option>
          ${students.map(s => `<option value="${s.id}">${esc(s.first_name)} ${esc(s.last_name)} (${LEVEL_LABELS[s.level]||s.level})</option>`).join('')}
        </select>
      </div>
      <div id="su-error" class="text-red-600 text-sm mb-3 hidden"></div>
      <button type="submit" class="${btnPrimary} w-full"><i class="fas fa-user-plus mr-1"></i> Créer mon compte</button>
    </form>`);
}

async function doSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('su-error');
  errEl.classList.add('hidden');
  const role = formVal('su-role');
  const sid = formVal('su-student');
  try {
    const r = await api.post('/auth/signup', {
      name: formVal('su-name'), email: formVal('su-email'), phone: formVal('su-phone'),
      password: document.getElementById('su-password').value, role,
      linked_student_id: sid ? Number(sid) : null
    });
    if (r.data.pending) { closeModal(); toast(r.data.message, 'info'); return; }
    App.token = r.data.token; App.user = r.data.user;
    localStorage.setItem('edu_token', App.token);
    closeModal(); render();
    toast('Compte créé avec succès !');
  } catch (err) {
    errEl.textContent = err.response?.data?.error || 'Erreur';
    errEl.classList.remove('hidden');
  }
}

function showRegistrationModal() {
  openModal('<i class="fas fa-file-signature text-blue-600 mr-2"></i>Demande d\'inscription d\'un élève', `
    <form onsubmit="doPublicRegistration(event)">
      <div class="grid grid-cols-2 gap-3">
        <div><label class="${lblCls}">Prénom de l'élève</label><input id="reg-fn" required class="${inputCls}"></div>
        <div><label class="${lblCls}">Nom de l'élève</label><input id="reg-ln" required class="${inputCls}"></div>
        <div><label class="${lblCls}">Date de naissance</label><input id="reg-bd" type="date" class="${inputCls}"></div>
        <div><label class="${lblCls}">Genre</label><select id="reg-gender" class="${inputCls}"><option value="M">Garçon</option><option value="F">Fille</option></select></div>
        <div class="col-span-2"><label class="${lblCls}">Niveau demandé</label><select id="reg-level" class="${inputCls}">${levelOptions()}</select></div>
        <div><label class="${lblCls}">Nom du parent/tuteur</label><input id="reg-pname" required class="${inputCls}"></div>
        <div><label class="${lblCls}">Téléphone</label><input id="reg-pphone" required class="${inputCls}" placeholder="+216 ..."></div>
        <div class="col-span-2"><label class="${lblCls}">Email du parent</label><input id="reg-pemail" type="email" class="${inputCls}"></div>
        <div class="col-span-2"><label class="${lblCls}">Adresse</label><input id="reg-address" class="${inputCls}"></div>
        <div class="col-span-2"><label class="${lblCls}">Remarques</label><textarea id="reg-notes" rows="2" class="${inputCls}"></textarea></div>
      </div>
      <button type="submit" class="${btnPrimary} w-full mt-4"><i class="fas fa-paper-plane mr-1"></i> Envoyer la demande</button>
    </form>`, { wide: true });
}

async function doPublicRegistration(e) {
  e.preventDefault();
  const level = formVal('reg-level');
  try {
    await api.post('/db/registrations', {
      first_name: formVal('reg-fn'), last_name: formVal('reg-ln'), birth_date: formVal('reg-bd') || null,
      gender: formVal('reg-gender'), cycle: cycleOfLevel(level), level,
      parent_name: formVal('reg-pname'), parent_phone: formVal('reg-pphone'),
      parent_email: formVal('reg-pemail'), address: formVal('reg-address'), notes: formVal('reg-notes')
    });
    closeModal();
    toast('Demande d\'inscription envoyée ! L\'administration vous contactera.', 'success');
  } catch (err) { toast(err.response?.data?.error || 'Erreur', 'error'); }
}

// ---------- QR Code : accès rapide au formulaire d'inscription ----------
function showInscriptionQR() {
  const url = location.origin + '/inscription';
  openModal(`
    <div class="text-center">
      <h3 class="text-xl font-bold text-gray-800 mb-1"><i class="fas fa-qrcode mr-2 text-blue-700"></i>Inscription rapide par QR Code</h3>
      <p class="text-sm text-gray-500 mb-4">Scannez ce code avec un smartphone pour ouvrir directement le formulaire d'inscription d'un élève.</p>
      <div class="flex justify-center mb-3">
        <canvas id="qr-inscription-canvas" class="rounded-xl border border-gray-200 shadow"></canvas>
      </div>
      <p class="text-xs text-gray-400 break-all mb-4">${esc(url)}</p>
      <div class="flex justify-center gap-3 flex-wrap">
        <button onclick="downloadInscriptionQR()" class="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold text-sm hover:bg-blue-800"><i class="fas fa-download mr-1"></i> Télécharger PNG</button>
        <button onclick="printInscriptionQR()" class="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200"><i class="fas fa-print mr-1"></i> Imprimer l'affiche</button>
        <button onclick="closeModal()" class="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">Fermer</button>
      </div>
    </div>
  `);
  if (window.QRCode) {
    QRCode.toCanvas(document.getElementById('qr-inscription-canvas'), url, { width: 260, margin: 2, color: { dark: '#1e3a8a', light: '#ffffff' } });
  } else {
    document.getElementById('qr-inscription-canvas').outerHTML = '<p class="text-red-500 text-sm">Librairie QR non chargée. Rechargez la page.</p>';
  }
}

function downloadInscriptionQR() {
  const canvas = document.getElementById('qr-inscription-canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = 'qr-inscription-edumanage.png';
  a.href = canvas.toDataURL('image/png');
  a.click();
}

function printInscriptionQR() {
  const canvas = document.getElementById('qr-inscription-canvas');
  if (!canvas) return;
  const img = canvas.toDataURL('image/png');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>QR Inscription - EduManage</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h1{color:#1e3a8a}img{width:320px;height:320px;margin:24px 0}p{color:#555}</style>
    </head><body>
    <h1>🎓 EduManage</h1>
    <h2>Inscrivez votre élève en 1 minute !</h2>
    <img src="${img}" alt="QR Code inscription">
    <p>Scannez ce code avec l'appareil photo de votre smartphone<br>pour ouvrir le formulaire d'inscription.</p>
    <script>window.onload = () => window.print();<\/script>
    </body></html>`);
  w.document.close();
}

// Ouverture automatique du formulaire quand on arrive via le QR (/inscription)
window.addEventListener('DOMContentLoaded', () => {
  if (location.pathname === '/inscription') {
    setTimeout(() => { if (typeof App === 'undefined' || !App.user) showRegistrationModal(); }, 300);
  }
});
