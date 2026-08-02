/* ============================================================
   Rahma École Française - Page publique : accueil, connexion, inscription
   ============================================================ */

function renderPublic(app) {
  app.innerHTML = `
  <div class="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900">
    <header class="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
      <h1 class="text-2xl font-bold text-white flex items-center gap-3"><img src="/static/logo-rahma.png" alt="Logo Rahma École Française" class="w-12 h-12 rounded-full bg-white p-0.5">Rahma École Française</h1>
      <div class="flex gap-3">
        <button onclick="showLoginModal()" class="px-4 py-2 rounded-lg bg-white text-blue-900 font-semibold text-sm hover:bg-blue-50"><i class="fas fa-right-to-bracket mr-1"></i> Connexion</button>
        <button onclick="showSignupModal()" class="px-4 py-2 rounded-lg bg-amber-400 text-blue-900 font-semibold text-sm hover:bg-amber-300"><i class="fas fa-user-plus mr-1"></i> Créer un compte</button>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 pt-12 pb-20 text-center">
      <img src="/static/logo-rahma.png" alt="Logo Rahma École Française" class="w-28 h-28 mx-auto mb-6 rounded-full bg-white p-1 shadow-2xl">
      <h2 class="text-4xl md:text-5xl font-extrabold text-white leading-tight">Rahma École Française<br><span class="text-amber-400">Plateforme de gestion scolaire</span></h2>
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
    <footer class="text-center text-blue-300 text-xs pb-6">
      <p class="mb-1"><i class="fas fa-location-dot mr-1"></i>10 Av Imam Malik, Messadine 4013 &nbsp;•&nbsp; <i class="fas fa-phone mr-1"></i>+216 52 517 581</p>
      <p>© 2026 Rahma École Française</p>
    </footer>
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

// ---------- Formulaire d'inscription bilingue (arabe par défaut) ----------
const REGISTRATION_FEE_DT = 40;

const AR_LEVEL_LABELS = {
  '1AP':'السنة الأولى ابتدائي','2AP':'السنة الثانية ابتدائي','3AP':'السنة الثالثة ابتدائي',
  '4AP':'السنة الرابعة ابتدائي','5AP':'السنة الخامسة ابتدائي','6AP':'السنة السادسة ابتدائي',
  '7AB':'السنة السابعة أساسي','8AB':'السنة الثامنة أساسي','9AB':'السنة التاسعة أساسي',
  '1AS':'السنة الأولى ثانوي','2AS':'السنة الثانية ثانوي','3AS':'السنة الثالثة ثانوي','4AS':'السنة الرابعة ثانوي'
};
const AR_CYCLE_LABELS = { primaire:'المرحلة الابتدائية', base:'المرحلة الأساسية (الإعدادية)', secondaire:'المرحلة الثانوية' };

function levelOptionsAr(selected) {
  let html = '';
  for (const [cy, lvls] of Object.entries(LEVELS)) {
    html += `<optgroup label="${AR_CYCLE_LABELS[cy]}">`;
    for (const l of lvls) html += `<option value="${l}" ${l===selected?'selected':''}>${AR_LEVEL_LABELS[l]}</option>`;
    html += '</optgroup>';
  }
  return html;
}

const REG_I18N = {
  ar: {
    dir: 'rtl', title: 'مطلب تسجيل تلميذ', switchLabel: 'Français 🇫🇷',
    fn: 'اسم التلميذ', ln: 'لقب التلميذ', bd: 'تاريخ الولادة', gender: 'الجنس',
    boy: 'ذكر', girl: 'أنثى', level: 'المستوى الدراسي المطلوب',
    pname: 'اسم الولي', pphone: 'رقم الهاتف', pemail: 'البريد الإلكتروني للولي',
    address: 'العنوان', notes: 'ملاحظات', submit: 'إرسال المطلب',
    feeLabel: 'معلوم التسجيل', feeNote: 'يُدفع عند قبول المطلب لدى إدارة المدرسة',
    fee: `${REGISTRATION_FEE_DT} دينار تونسي`
  },
  fr: {
    dir: 'ltr', title: "Demande d'inscription d'un élève", switchLabel: 'العربية 🇹🇳',
    fn: "Prénom de l'élève", ln: "Nom de l'élève", bd: 'Date de naissance', gender: 'Genre',
    boy: 'Garçon', girl: 'Fille', level: 'Niveau demandé',
    pname: 'Nom du parent/tuteur', pphone: 'Téléphone', pemail: 'Email du parent',
    address: 'Adresse', notes: 'Remarques', submit: 'Envoyer la demande',
    feeLabel: "Frais d'inscription", feeNote: "À régler auprès de l'administration après acceptation de la demande",
    fee: `${REGISTRATION_FEE_DT} DT`
  }
};

let regLang = 'ar';
function showRegistrationModal(lang) {
  lang = lang || 'ar'; // arabe par défaut
  regLang = lang;
  const t = REG_I18N[lang];
  const other = lang === 'ar' ? 'fr' : 'ar';
  openModal(`<i class="fas fa-file-signature text-blue-600 mx-2"></i>${t.title}`, `
    <div dir="${t.dir}">
      <div class="flex justify-end mb-3">
        <button type="button" onclick="showRegistrationModal('${other}')" class="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"><i class="fas fa-language mx-1"></i>${REG_I18N[lang].switchLabel}</button>
      </div>
      <form onsubmit="doPublicRegistration(event)">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="${lblCls}">${t.fn}</label><input id="reg-fn" required class="${inputCls}"></div>
          <div><label class="${lblCls}">${t.ln}</label><input id="reg-ln" required class="${inputCls}"></div>
          <div><label class="${lblCls}">${t.bd}</label><input id="reg-bd" type="date" class="${inputCls}"></div>
          <div><label class="${lblCls}">${t.gender}</label><select id="reg-gender" class="${inputCls}"><option value="M">${t.boy}</option><option value="F">${t.girl}</option></select></div>
          <div class="col-span-2"><label class="${lblCls}">${t.level}</label><select id="reg-level" class="${inputCls}">${lang === 'ar' ? levelOptionsAr() : levelOptions()}</select></div>
          <div><label class="${lblCls}">${t.pname}</label><input id="reg-pname" required class="${inputCls}"></div>
          <div><label class="${lblCls}">${t.pphone}</label><input id="reg-pphone" required class="${inputCls}" placeholder="+216 ..." dir="ltr"></div>
          <div class="col-span-2"><label class="${lblCls}">${t.pemail}</label><input id="reg-pemail" type="email" class="${inputCls}" dir="ltr"></div>
          <div class="col-span-2"><label class="${lblCls}">${t.address}</label><input id="reg-address" class="${inputCls}"></div>
          <div class="col-span-2"><label class="${lblCls}">${t.notes}</label><textarea id="reg-notes" rows="2" class="${inputCls}"></textarea></div>
          <div class="col-span-2">
            <div class="flex items-center justify-between bg-amber-50 border border-amber-300 rounded-lg px-4 py-3">
              <span class="text-sm font-bold text-amber-800"><i class="fas fa-money-bill-wave mx-2"></i>${t.feeLabel}</span>
              <span class="text-lg font-extrabold text-amber-700">${t.fee}</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">${t.feeNote}</p>
          </div>
        </div>
        <button type="submit" class="${btnPrimary} w-full mt-4"><i class="fas fa-paper-plane mx-1"></i> ${t.submit}</button>
      </form>
    </div>`, { wide: true });
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
    toast(regLang === 'ar'
      ? 'تم إرسال مطلب التسجيل بنجاح! ستتصل بكم الإدارة قريباً.'
      : 'Demande d\'inscription envoyée ! L\'administration vous contactera.', 'success');
  } catch (err) { toast(err.response?.data?.error || (regLang === 'ar' ? 'حدث خطأ' : 'Erreur'), 'error'); }
}

// ---------- QR Code : accès rapide au formulaire d'inscription ----------
function showInscriptionQR() {
  const url = location.origin + '/inscription';
  openModal(`
    <div class="text-center">
      <h3 class="text-xl font-bold text-gray-800 mb-1"><i class="fas fa-qrcode mr-2 text-blue-700"></i>Inscription rapide par QR Code</h3>
      <p class="text-sm text-gray-500 mb-4">Scannez ce code avec un smartphone pour ouvrir directement le formulaire d'inscription d'un élève.</p>
      <div class="flex justify-center mb-3">
        <div id="qr-inscription-box" class="p-3 bg-white rounded-xl border border-gray-200 shadow inline-block"></div>
      </div>
      <p class="text-xs text-gray-400 break-all mb-4">${esc(url)}</p>
      <div class="flex justify-center gap-3 flex-wrap">
        <button onclick="downloadInscriptionQR()" class="px-4 py-2 rounded-lg bg-blue-700 text-white font-semibold text-sm hover:bg-blue-800"><i class="fas fa-download mr-1"></i> Télécharger PNG</button>
        <button onclick="printInscriptionQR()" class="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200"><i class="fas fa-print mr-1"></i> Imprimer l'affiche</button>
        <button onclick="closeModal()" class="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200">Fermer</button>
      </div>
    </div>
  `);
  const box = document.getElementById('qr-inscription-box');
  if (window.QRCode) {
    new QRCode(box, { text: url, width: 260, height: 260, colorDark: '#1e3a8a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
  } else {
    box.outerHTML = '<p class="text-red-500 text-sm">Librairie QR non chargée. Rechargez la page.</p>';
  }
}

function getInscriptionQRDataUrl() {
  const box = document.getElementById('qr-inscription-box');
  if (!box) return null;
  const canvas = box.querySelector('canvas');
  if (canvas) return canvas.toDataURL('image/png');
  const img = box.querySelector('img');
  return img ? img.src : null;
}

function downloadInscriptionQR() {
  const data = getInscriptionQRDataUrl();
  if (!data) return;
  const a = document.createElement('a');
  a.download = 'qr-inscription-edumanage.png';
  a.href = data;
  a.click();
}

function printInscriptionQR() {
  const img = getInscriptionQRDataUrl();
  if (!img) return;
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><title>QR Inscription - Rahma École Française</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h1{color:#1e3a8a}img.qr{width:320px;height:320px;margin:24px 0}img.logo{width:110px;height:110px}p{color:#555}</style>
    </head><body>
    <img class="logo" src="${location.origin}/static/logo-rahma.png" alt="Logo">
    <h1>Rahma École Française</h1>
    <h2>Inscrivez votre élève en 1 minute !</h2>
    <img class="qr" src="${img}" alt="QR Code inscription">
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
