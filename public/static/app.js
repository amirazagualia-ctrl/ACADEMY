/* ============================================================
   Rahma Academy - Plateforme de gestion scolaire
   SPA Frontend (vanilla JS + Tailwind CDN)
   ============================================================ */

const LEVELS = {
  primaire: ['1AP','2AP','3AP','4AP','5AP','6AP'],
  base: ['7AB','8AB','9AB'],
  secondaire: ['1AS','2AS','3AS','4AS']
};
const LEVEL_LABELS = {
  '1AP':'1ère année primaire','2AP':'2ème année primaire','3AP':'3ème année primaire',
  '4AP':'4ème année primaire','5AP':'5ème année primaire','6AP':'6ème année primaire',
  '7AB':'7ème année de base','8AB':'8ème année de base','9AB':'9ème année de base',
  '1AS':'1ère année secondaire','2AS':'2ème année secondaire','3AS':'3ème année secondaire','4AS':'4ème année secondaire'
};
const CYCLE_LABELS = { primaire:'Primaire', base:'Base (Collège)', secondaire:'Secondaire (Lycée)' };
const ALL_LEVELS = [...LEVELS.primaire, ...LEVELS.base, ...LEVELS.secondaire];

// ---------------- State ----------------
const App = {
  user: null,
  token: localStorage.getItem('edu_token') || null,
  route: 'dashboard',
  cache: {},
  year: null,          // année scolaire consultée
  currentYear: null,   // année scolaire courante (écriture)
  years: []
};
const isReadOnlyYear = () => App.year && App.currentYear && App.year !== App.currentYear;
async function loadSchoolYears() {
  try {
    const r = (await api.get('/school-years')).data;
    App.years = r.items || []; App.currentYear = r.current || null;
    if (!App.year || !App.years.some(y => y.label === App.year)) App.year = App.currentYear;
  } catch { App.years = []; }
}
function setSchoolYear(label) { App.year = label; render(); }

// ---------------- API ----------------
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  if (App.token) cfg.headers.Authorization = 'Bearer ' + App.token;
  if (App.year && App.year !== App.currentYear) cfg.headers['X-School-Year'] = App.year;
  return cfg;
});
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 423) toast('<i class="fas fa-lock mr-1"></i> ' + esc(err.response.data?.error || 'Année clôturée : lecture seule'), 'warning');
  return Promise.reject(err);
});
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401 && App.user) { logout(); }
  return Promise.reject(err);
});

const db = {
  list: (table, qs='select=*') => api.get(`/db/${table}?${qs}`).then(r => r.data),
  create: (table, data) => api.post(`/db/${table}`, data).then(r => r.data),
  update: (table, id, data) => api.put(`/db/${table}/${id}`, data).then(r => r.data),
  remove: (table, id) => api.delete(`/db/${table}/${id}`).then(r => r.data)
};

// ---------------- Utils ----------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => d ? dayjs(d).format('DD/MM/YYYY') : '-';
const fmtDT = d => d ? dayjs(d).format('DD/MM/YYYY HH:mm') : '-';
const fullName = s => s ? `${s.first_name} ${s.last_name}` : '';

function toast(msg, type='success') {
  const colors = { success:'bg-green-600', error:'bg-red-600', info:'bg-blue-600', warning:'bg-yellow-600' };
  const el = document.createElement('div');
  el.className = `toast fixed top-4 right-4 z-[100] ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm`;
  el.innerHTML = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function openModal(title, bodyHtml, options={}) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.id = 'modal';
  wrap.className = 'fixed inset-0 z-50 modal-backdrop flex items-start justify-center overflow-y-auto py-8 px-4';
  wrap.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl w-full ${options.wide ? 'max-w-3xl' : 'max-w-lg'}">
      <header class="flex items-center justify-between px-6 py-4 border-b">
        <h3 class="text-lg font-bold text-gray-800">${title}</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times text-xl"></i></button>
      </header>
      <div class="p-6">${bodyHtml}</div>
    </div>`;
  wrap.addEventListener('click', e => { if (e.target === wrap) closeModal(); });
  document.body.appendChild(wrap);
}
function closeModal() { document.getElementById('modal')?.remove(); }

function confirmDelete(msg, onOk) {
  openModal('<i class="fas fa-triangle-exclamation text-red-500 mr-2"></i>Confirmation', `
    <p class="text-gray-700 mb-6">${msg}</p>
    <div class="flex justify-end gap-3">
      <button onclick="closeModal()" class="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Annuler</button>
      <button id="confirm-del-btn" class="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"><i class="fas fa-trash mr-1"></i> Supprimer</button>
    </div>`);
  document.getElementById('confirm-del-btn').onclick = async () => { closeModal(); await onOk(); };
}

function formVal(id) { return document.getElementById(id)?.value?.trim() ?? ''; }

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function uploadFile(bucket, file) {
  const data = await fileToBase64(file);
  const r = await api.post(`/upload/${bucket}`, { filename: file.name, contentType: file.type, data });
  return r.data;
}

// ============ FILIGRANE AUTOMATIQUE (logo Rahma) ============
const WATERMARK_LOGO_URL = 'https://nxtyizeoypolvrfhulpk.supabase.co/storage/v1/object/public/photos/logo_rahma_watermark.png';
const WM_OPACITY = 0.13, WM_WIDTH = 0.55; // 55% de la largeur, opacité discrète

let _wmLogoImg = null;
async function wmLogo() {
  if (_wmLogoImg) return _wmLogoImg;
  _wmLogoImg = await new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = WATERMARK_LOGO_URL;
  });
  return _wmLogoImg;
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// Filigrane une IMAGE via canvas → retourne un nouveau File
async function watermarkImage(file) {
  const logo = await wmLogo();
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const lw = canvas.width * WM_WIDTH, lh = logo.naturalHeight * lw / logo.naturalWidth;
  ctx.globalAlpha = WM_OPACITY;
  ctx.drawImage(logo, (canvas.width - lw) / 2, (canvas.height - lh) / 2, lw, lh);
  ctx.globalAlpha = 1;
  URL.revokeObjectURL(img.src);
  const isJpeg = /jpe?g/i.test(file.type);
  const blob = await new Promise(res => canvas.toBlob(res, isJpeg ? 'image/jpeg' : 'image/png', 0.92));
  return new File([blob], file.name, { type: blob.type });
}

// Filigrane un PDF via pdf-lib → retourne un nouveau File
async function watermarkPdf(file) {
  await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  const { PDFDocument } = window.PDFLib;
  const [pdfBytes, logoBytes] = await Promise.all([
    file.arrayBuffer(),
    fetch(WATERMARK_LOGO_URL).then(r => r.arrayBuffer())
  ]);
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const logo = await pdf.embedPng(logoBytes);
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const lw = width * WM_WIDTH, lh = logo.height * lw / logo.width;
    page.drawImage(logo, { x: (width - lw) / 2, y: (height - lh) / 2, width: lw, height: lh, opacity: WM_OPACITY });
  }
  const out = await pdf.save();
  return new File([out], file.name, { type: 'application/pdf' });
}

// Point d'entrée : filigrane si image ou PDF, sinon renvoie le fichier tel quel.
// En cas d'erreur (PDF protégé, image non lisible…), le fichier original est envoyé.
async function applyWatermark(file) {
  try {
    if ((file.type || '').startsWith('image/')) return await watermarkImage(file);
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return await watermarkPdf(file);
  } catch (e) { console.warn('Filigrane impossible, envoi du fichier original', e); }
  return file;
}

function levelOptions(selected) {
  let html = '';
  for (const [cy, lvls] of Object.entries(LEVELS)) {
    html += `<optgroup label="${CYCLE_LABELS[cy]}">`;
    for (const l of lvls) html += `<option value="${l}" ${l===selected?'selected':''}>${LEVEL_LABELS[l]}</option>`;
    html += '</optgroup>';
  }
  return html;
}
function cycleOfLevel(l) { for (const [c, ls] of Object.entries(LEVELS)) if (ls.includes(l)) return c; return 'primaire'; }

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';
const lblCls = 'block text-xs font-semibold text-gray-600 mb-1';
const btnPrimary = 'px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium';
const btnSecondary = 'px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 text-sm';

// ---------------- Auth ----------------
function logout() {
  App.user = null; App.token = null;
  localStorage.removeItem('edu_token');
  render();
}

async function tryRestoreSession() {
  if (!App.token) return;
  try {
    const r = await api.get('/auth/me');
    App.user = r.data.user; App.appEnv = r.data.app_env || 'production';
    await loadSchoolYears();
  } catch { App.token = null; localStorage.removeItem('edu_token'); }
}

function isAdmin() { return App.user?.role === 'admin'; }
function isStaff() { return ['admin','teacher'].includes(App.user?.role); }
function isParentOrStudent() { return ['parent','student'].includes(App.user?.role); }
function linkedIds() {
  const ids = [];
  if (App.user?.linked_student_id) ids.push(Number(App.user.linked_student_id));
  (App.user?.linked_student_ids || []).forEach(i => { const n = Number(i); if (n && !ids.includes(n)) ids.push(n); });
  return ids;
}

// ---------------- Router / Layout ----------------
const ROUTES = {
  dashboard: { icon:'fa-chart-pie', label:'Tableau de bord', roles:['admin','teacher','parent','student'] },
  students: { icon:'fa-user-graduate', label:'Élèves', roles:['admin','teacher','parent','student'] },
  attendance: { icon:'fa-clipboard-check', label:'Présence', roles:['admin','teacher','parent','student'] },
  notebook: { icon:'fa-chalkboard', label:'Carnet de classe', roles:['admin','teacher'] },
  gradebook: { icon:'fa-table-list', label:'Carnet de notation', roles:['admin','teacher'] },
  analytics: { icon:'fa-chart-column', label:'Analyses & rapports', roles:['admin','teacher'] },
  calendar: { icon:'fa-calendar-days', label:'Calendrier', roles:['admin','teacher','parent','student'] },
  timetable: { icon:'fa-calendar-week', label:'Emploi du temps', roles:['admin','teacher','parent','student'] },
  homeworks: { icon:'fa-book-open', label:'Devoirs', roles:['admin','teacher','parent','student'] },
  evaluations: { icon:'fa-file-signature', label:'Évaluations', roles:['admin','teacher','parent','student'] },
  examwizard: { icon:'fa-wand-sparkles', label:'Créer un examen', roles:['admin','teacher'] },
  bank: { icon:'fa-layer-group', label:'Bibliothèque', roles:['admin','teacher'] },
  grades: { icon:'fa-star', label:'Notes & Bulletins', roles:['admin','teacher','parent','student'] },
  fees: { icon:'fa-money-bill-wave', label:'Frais', roles:['admin','teacher','parent','student'] },
  courses: { icon:'fa-book-open', label:'Cours & Documents', roles:['admin','teacher','parent','student'] },
  interactive: { icon:'fa-gamepad', label:'Cours interactifs', roles:['admin','teacher','parent','student'] },
  certificates: { icon:'fa-certificate', label:'Certificats', roles:['admin','teacher','parent','student'] },
  registrations: { icon:'fa-file-signature', label:'Inscriptions', roles:['admin'] },
  teachers: { icon:'fa-chalkboard-user', label:'Enseignants', roles:['admin'] },
  classes: { icon:'fa-school', label:'Classes', roles:['admin','teacher'] },
  subjects: { icon:'fa-book', label:'Matières', roles:['admin'] },
  notifications: { icon:'fa-bell', label:'Notifications', roles:['admin','teacher','parent','student'] },
  chat: { icon:'fa-comments', label:'Discussions', roles:['admin','teacher','parent','student'] },
  parent: { icon:'fa-house-user', label:'Portail Parent', roles:['parent'] },
  settings: { icon:'fa-gear', label:'Paramètres', roles:['admin'] }
};

function navigate(route) {
  App.route = route;
  render();
}

async function render() {
  const app = document.getElementById('app');
  if (!App.user) { renderPublic(app); return; }
  const routes = Object.entries(ROUTES).filter(([k,v]) => v.roles.includes(App.user.role));
  if (!ROUTES[App.route] || !ROUTES[App.route].roles.includes(App.user.role)) App.route = App.user.role === 'parent' ? 'parent' : 'dashboard';

  app.innerHTML = `
  ${App.appEnv && App.appEnv !== 'production' ? `<div class="fixed top-0 left-0 right-0 z-[70] bg-amber-400 text-amber-950 text-center text-xs font-bold py-1 tracking-wide" id="env-banner"><i class="fas fa-flask mr-1"></i>ENVIRONNEMENT DE TEST (${esc(App.appEnv.toUpperCase())}) — données fictives, aucun impact sur la production</div>` : ''}
  <div class="flex min-h-screen ${App.appEnv && App.appEnv !== 'production' ? 'pt-6' : ''}">
    <aside class="w-64 bg-gradient-to-b from-[#000612] to-blue-900 text-white flex-shrink-0 hidden md:flex flex-col" id="sidebar">
      <div class="p-5 border-b border-blue-700">
        <div class="flex items-center gap-3">
          <img src="/static/logo-rahma.png" alt="Logo Rahma Academy" class="w-12 h-12 object-contain drop-shadow">
          <div>
            <h1 class="text-lg font-bold leading-tight">Rahma <span class="text-amber-400">Academy</span></h1>
            <p class="text-[10px] text-blue-300 tracking-widest uppercase">Plateforme scolaire</p>
          </div>
        </div>
      </div>
      ${App.years.length ? `<div class="px-4 pt-3" id="year-selector">
        <label class="text-[10px] uppercase tracking-widest text-blue-300 block mb-1"><i class="fas fa-calendar-check mr-1"></i>Année scolaire · السنة الدراسية</label>
        <select onchange="setSchoolYear(this.value)" class="w-full bg-blue-950/60 border ${isReadOnlyYear() ? 'border-amber-400 text-amber-300' : 'border-blue-700 text-white'} rounded-lg px-2 py-1.5 text-sm font-semibold">
          ${App.years.map(y => `<option value="${y.label}" ${y.label===App.year?'selected':''}>${y.label}${y.is_current ? ' · en cours' : ' · clôturée'}</option>`).join('')}
        </select>
      </div>` : ''}
      <nav class="flex-1 py-3 overflow-y-auto" id="main-nav">
        ${routes.map(([k,v]) => `
          <a href="#" onclick="navigate('${k}');return false;" class="sidebar-link flex items-center gap-3 px-5 py-2.5 text-sm ${App.route===k?'active':''}">
            <span class="relative w-5 text-center"><i class="fas ${v.icon}"></i>${k==='notifications' ? '<span id="notif-badge" class="notif-badge hidden">0</span>' : ''}${k==='homeworks' ? '<span id="hw-badge" class="notif-badge hidden">0</span>' : ''}</span> ${v.label}
          </a>`).join('')}
      </nav>
      <div class="p-4 border-t border-blue-700 text-xs">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-8 h-8 rounded-full bg-amber-400 text-blue-900 flex items-center justify-center font-bold">${esc(App.user.name[0]||'?')}</div>
          <div><div class="font-semibold">${esc(App.user.name)}</div><div class="text-blue-300">${roleLabel(App.user.role)}</div></div>
        </div>
        <button onclick="logout()" class="w-full text-left text-blue-200 hover:text-white"><i class="fas fa-right-from-bracket mr-1"></i> Déconnexion</button>
      </div>
    </aside>
    <div class="flex-1 flex flex-col min-w-0">
      <header class="bg-white shadow-sm px-4 py-3 flex items-center justify-between md:hidden">
        <h1 class="font-bold text-blue-900 flex items-center gap-2"><img src="/static/logo-rahma-circle.png" alt="Logo" class="w-8 h-8 rounded-full">Rahma <span class="text-amber-500">Academy</span></h1>
        <select onchange="navigate(this.value)" class="border rounded px-2 py-1 text-sm">
          ${routes.map(([k,v]) => `<option value="${k}" ${App.route===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
        <button onclick="navigate('notifications')" class="relative text-gray-500 px-1" aria-label="Notifications"><i class="fas fa-bell text-lg"></i><span id="notif-badge-m" class="notif-badge hidden">0</span></button>
        <button onclick="logout()" class="text-gray-500"><i class="fas fa-right-from-bracket"></i></button>
      </header>
      ${isReadOnlyYear() ? `<div class="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 flex items-center justify-between gap-3" id="readonly-banner"><span><i class="fas fa-lock mr-2"></i>Vous consultez l'année <b>${esc(App.year)}</b> (clôturée) — <b>lecture seule</b>. Les saisies sont désactivées.</span><button onclick="setSchoolYear(App.currentYear)" class="px-3 py-1 rounded bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600">Revenir à ${esc(App.currentYear)}</button></div>` : ''}
      <main class="flex-1 p-4 md:p-6 overflow-x-auto" id="main-content">
        <div class="text-center py-20 text-gray-400"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
      </main>
    </div>
  </div>`;

  refreshNotifBadge();
  if (typeof refreshHwBadge === 'function') refreshHwBadge();
  const view = VIEWS[App.route];
  if (view) {
    try { await view(document.getElementById('main-content')); }
    catch (e) {
      console.error(e);
      document.getElementById('main-content').innerHTML = `<div class="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700"><i class="fas fa-circle-exclamation mr-2"></i>Erreur : ${esc(e.response?.data?.error || e.message)}</div>`;
    }
  }
}

// ---------------- Badge de notifications non lues (cloche) ----------------
let _notifTimer = null;
async function refreshNotifBadge() {
  if (!App.user) return;
  try {
    const r = await api.get('/notifications/unread-count');
    const n = Number(r.data?.unread || 0);
    App.cache.unreadNotifs = n;
    ['notif-badge', 'notif-badge-m'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = n > 99 ? '99+' : n;
      el.classList.toggle('hidden', n === 0);
    });
    if (n > 0 && App.cache.lastUnreadShown !== undefined && n > App.cache.lastUnreadShown) {
      toast(`<i class="fas fa-bell mr-1"></i> ${n - App.cache.lastUnreadShown} nouvelle(s) notification(s)`, 'info');
    }
    App.cache.lastUnreadShown = n;
  } catch (e) { /* silencieux */ }
  clearInterval(_notifTimer);
  _notifTimer = setInterval(() => { if (App.user) refreshNotifBadge(); else clearInterval(_notifTimer); }, 60000);
}

function roleLabel(r) { return { admin:'Administration', teacher:'Enseignant', parent:'Parent', student:'Élève' }[r] || r; }

function pageHeader(title, icon, actionsHtml='') {
  return `<div class="flex flex-wrap items-center justify-between gap-3 mb-6">
    <h2 class="text-2xl font-bold text-gray-800"><i class="fas ${icon} mr-2 text-blue-600"></i>${title}</h2>
    <div class="flex gap-2 flex-wrap">${actionsHtml}</div>
  </div>`;
}

const VIEWS = {};

// ---------------- PWA : installation de l'application ----------------
let deferredInstallPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW non enregistré:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById('pwa-install-banner')) return;
  if (localStorage.getItem('edu_install_dismissed')) return;
  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-blue-900 text-white rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 max-w-md w-[calc(100%-2rem)]';
  banner.innerHTML = `
    <i class="fas fa-mobile-screen-button text-2xl text-amber-400"></i>
    <div class="flex-1">
      <p class="font-bold text-sm">Installer Rahma Academy</p>
      <p class="text-xs text-blue-200">Accès rapide depuis votre écran d'accueil</p>
    </div>
    <button onclick="installPWA()" class="px-3 py-1.5 rounded-lg bg-amber-400 text-blue-900 text-xs font-bold hover:bg-amber-300">Installer</button>
    <button onclick="dismissInstallBanner()" class="text-blue-300 hover:text-white"><i class="fas fa-times"></i></button>`;
  document.body.appendChild(banner);
}

async function installPWA() {
  if (!deferredInstallPrompt) {
    toast("Utilisez le menu du navigateur : « Ajouter à l'écran d'accueil »", 'info');
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') toast('Application installée !', 'success');
  deferredInstallPrompt = null;
  dismissInstallBanner(false);
}

function dismissInstallBanner(remember = true) {
  document.getElementById('pwa-install-banner')?.remove();
  if (remember) localStorage.setItem('edu_install_dismissed', '1');
}

window.addEventListener('appinstalled', () => {
  dismissInstallBanner(false);
  deferredInstallPrompt = null;
});

// ---------------- Boot (après chargement de tous les scripts) ----------------
window.addEventListener('DOMContentLoaded', async () => {
  if (typeof handleGoogleReturn === 'function' && await handleGoogleReturn()) { render(); return; }
  await tryRestoreSession();
  // Deep-link vers un cours interactif partagé : /#ic-<id>
  const m = (location.hash || '').match(/^#ic-(\d+)$/);
  if (m && App.user) { App.route = 'interactive'; App.cache.icOpenId = Number(m[1]); }
  else if (m) { App.cache.icPendingId = Number(m[1]); } // ouvert après connexion
  render();
});
