/* ============================================================
   Rahma Academy - Plateforme de gestion scolaire
   SPA Frontend (vanilla JS + Tailwind CDN)
   ============================================================ */

// F62 : structure pédagogique (cycles / niveaux) fournie par l'établissement (BRAND.scheme) — repli : système tunisien
const DEFAULT_SCHEME = {
  preset: 'tunisie',
  cycles: [{ key: 'primaire', label: 'Primaire', label_ar: 'المرحلة الابتدائية' }, { key: 'base', label: 'Base (Collège)', label_ar: 'المرحلة الأساسية (الإعدادية)' }, { key: 'secondaire', label: 'Secondaire (Lycée)', label_ar: 'المرحلة الثانوية' }],
  levels: [
    ['1AP','1ère année primaire','السنة الأولى ابتدائي','primaire'],['2AP','2ème année primaire','السنة الثانية ابتدائي','primaire'],['3AP','3ème année primaire','السنة الثالثة ابتدائي','primaire'],
    ['4AP','4ème année primaire','السنة الرابعة ابتدائي','primaire'],['5AP','5ème année primaire','السنة الخامسة ابتدائي','primaire'],['6AP','6ème année primaire','السنة السادسة ابتدائي','primaire'],
    ['7AB','7ème année de base','السنة السابعة أساسي','base'],['8AB','8ème année de base','السنة الثامنة أساسي','base'],['9AB','9ème année de base','السنة التاسعة أساسي','base'],
    ['1AS','1ère année secondaire','السنة الأولى ثانوي','secondaire'],['2AS','2ème année secondaire','السنة الثانية ثانوي','secondaire'],['3AS','3ème année secondaire','السنة الثالثة ثانوي','secondaire'],['4AS','4ème année secondaire','السنة الرابعة ثانوي','secondaire']
  ].map(([code, label, label_ar, cycle]) => ({ code, label, label_ar, cycle }))
};
// Tables globales (mutables) consommées par toutes les vues : LEVELS, LEVEL_LABELS, CYCLE_LABELS, ALL_LEVELS (+ AR)
const LEVELS = {}, LEVEL_LABELS = {}, CYCLE_LABELS = {}, ALL_LEVELS = [], AR_LEVEL_LABELS = {}, AR_CYCLE_LABELS = {};
let SCHEME = DEFAULT_SCHEME;
function applyScheme(sch) {
  SCHEME = (sch && Array.isArray(sch.cycles) && sch.cycles.length && Array.isArray(sch.levels) && sch.levels.length) ? sch : DEFAULT_SCHEME;
  for (const o of [LEVELS, LEVEL_LABELS, CYCLE_LABELS, AR_LEVEL_LABELS, AR_CYCLE_LABELS]) for (const k of Object.keys(o)) delete o[k];
  ALL_LEVELS.length = 0;
  for (const c of SCHEME.cycles) { LEVELS[c.key] = []; CYCLE_LABELS[c.key] = c.label; AR_CYCLE_LABELS[c.key] = c.label_ar || c.label; }
  for (const l of SCHEME.levels) { (LEVELS[l.cycle] = LEVELS[l.cycle] || []).push(l.code); LEVEL_LABELS[l.code] = l.label; AR_LEVEL_LABELS[l.code] = l.label_ar || l.label; ALL_LEVELS.push(l.code); }
  // Libellés historiques conservés pour les données saisies avec l'ancien schéma
  for (const l of DEFAULT_SCHEME.levels) { if (!LEVEL_LABELS[l.code]) { LEVEL_LABELS[l.code] = l.label; AR_LEVEL_LABELS[l.code] = l.label_ar; } }
  for (const c of DEFAULT_SCHEME.cycles) { if (!CYCLE_LABELS[c.key]) { CYCLE_LABELS[c.key] = c.label; AR_CYCLE_LABELS[c.key] = c.label_ar; } }
}
applyScheme((window.__BRAND__ || {}).scheme);
const CYCLE_KEYS = () => SCHEME.cycles.map(c => c.key);
const FIRST_CYCLE = () => SCHEME.cycles[0]?.key || 'primaire';
// Options <select> des cycles (FR) ; cycles multiples séparés par des virgules pour les enseignants
function cycleOptions(selected) { return SCHEME.cycles.map(c => `<option value="${c.key}" ${selected === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join(''); }
function cycleComboOptions(selected) {
  const keys = CYCLE_KEYS(); const combos = [];
  for (let i = 0; i < keys.length; i++) for (let j = i; j < keys.length; j++) combos.push(keys.slice(i, j + 1).join(','));
  return combos.map(c => `<option value="${c}" ${selected === c ? 'selected' : ''}>${c.split(',').map(k => CYCLE_LABELS[k] || k).join(' + ')}</option>`).join('');
}

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
// ============ F62 : identité de l'établissement (marque blanche) ============
// Injectée par le serveur dans window.__BRAND__ (page principale) ; rechargeable via GET /api/brand.
const BRAND_FALLBACK = { name: 'Rahma Academy', short_name: 'Rahma Academy', tagline: 'Plateforme de gestion scolaire', logo_url: '/static/logo-rahma.png', color_primary: '#1d4ed8', color_accent: '#f59e0b', color_dark: '#000612', currency: 'DT', currency_ar: 'دينار تونسي', address: '', phone: '', email: '', social: {}, landing: {}, modules: {}, registration_fee: 40 };
let BRAND = Object.assign({}, BRAND_FALLBACK, window.__BRAND__ || {});
function brandName() { return BRAND.name || BRAND_FALLBACK.name; }
function brandLogo() { return BRAND.logo_url || BRAND_FALLBACK.logo_url; }
function brandLogoAbs() { const l = brandLogo(); return /^https?:/.test(l) ? l : location.origin + l; }
function brandCurrency() { return BRAND.currency || 'DT'; }
function fmtMoney(v, dec) { const n = Number(v) || 0; return `${dec !== undefined ? n.toFixed(dec) : n} ${brandCurrency()}`; }
// Nom en deux parties pour l'affichage « Rahma <accent>Academy</accent> » (dernier mot coloré)
function brandNameHtml() { const w = brandName().trim().split(/\s+/); if (w.length < 2) return `<span>${esc(brandName())}</span>`; const last = w.pop(); return `${esc(w.join(' '))} <span style="color:var(--brand-accent,#fbbf24)">${esc(last)}</span>`; }
function brandContactLine() { return [BRAND.address, BRAND.phone, BRAND.email].filter(Boolean).join(' · '); }
function applyBrandTheme() {
  const r = document.documentElement.style;
  r.setProperty('--brand-primary', BRAND.color_primary || BRAND_FALLBACK.color_primary);
  r.setProperty('--brand-accent', BRAND.color_accent || BRAND_FALLBACK.color_accent);
  r.setProperty('--brand-dark', BRAND.color_dark || BRAND_FALLBACK.color_dark);
  r.setProperty('--rz-primary', BRAND.color_primary || BRAND_FALLBACK.color_primary);
  document.title = `${brandName()} - ${BRAND.tagline || ''}`.replace(/ - $/, '');
  const ic = document.querySelector('link[rel="icon"]'); if (ic && (BRAND.favicon_url || BRAND.logo_url)) ic.href = BRAND.favicon_url || BRAND.logo_url;
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = BRAND.color_dark || BRAND_FALLBACK.color_dark;
}
async function reloadBrand() { try { BRAND = Object.assign({}, BRAND_FALLBACK, (await api.get('/brand')).data); applyBrandTheme(); applyScheme(BRAND.scheme); _wmLogoImg = null; } catch {} }

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

function confirmDelete(msg, onOk, opts = {}) {
  const label = opts.label || 'Supprimer', icon = opts.icon || 'fa-trash', color = opts.color || 'bg-red-600 hover:bg-red-700';
  openModal(`<i class="fas fa-triangle-exclamation ${opts.color ? 'text-amber-500' : 'text-red-500'} mr-2"></i>${opts.title || 'Confirmation'}`, `
    <p class="text-gray-700 mb-6">${msg}</p>
    <div class="flex justify-end gap-3">
      <button onclick="closeModal()" class="px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50">Annuler</button>
      <button id="confirm-del-btn" class="px-4 py-2 rounded-lg ${color} text-white"><i class="fas ${icon} mr-1"></i> ${label}</button>
    </div>`);
  const b = document.getElementById('confirm-del-btn'); b.focus();
  b.onclick = async () => { closeModal(); await onOk(); };
}
// F61 : suppression réversible — vocabulaire « corbeille », récupérable 30 jours (Paramètres → Corbeille)
function confirmTrash(what, onOk, extra = '') {
  confirmDelete(`Mettre ${what} dans la <b>corbeille</b> ?<br><span class="text-sm text-slate-500">Rien n'est effacé définitivement : l'élément est récupérable pendant <b>30 jours</b> depuis <i>Paramètres → Corbeille</i>.${extra ? ' ' + extra : ''}</span>`, onOk,
    { label: 'Mettre à la corbeille', icon: 'fa-trash-can-arrow-up', color: 'bg-amber-600 hover:bg-amber-700', title: 'Suppression réversible' });
}
// Toast avec action « Annuler » (restauration immédiate). onUndo : async () => {}
function toastUndo(msg, onUndo, ms = 8000) {
  const el = document.createElement('div');
  el.className = 'toast fixed top-4 right-4 z-[100] bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm flex items-center gap-3';
  el.innerHTML = `<span class="flex-1">${msg}</span>`;
  if (onUndo) { const b = document.createElement('button'); b.className = 'font-bold text-amber-300 hover:text-amber-200 underline whitespace-nowrap'; b.textContent = 'Annuler'; b.onclick = async () => { el.remove(); try { await onUndo(); toast('Restauré'); render(); } catch (e) { toast(friendlyError(e), 'error'); } }; el.appendChild(b); }
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
// Suppression (soft) d'une ligne avec toast « Annuler » : restauration via la corbeille si admin
async function removeWithUndo(table, id, label) {
  const r = await db.remove(table, id);
  const soft = r?.soft !== false;
  toastUndo(`${label} ${soft ? 'placé(e) dans la corbeille' : 'supprimé(e)'}`, soft && isAdmin() ? () => api.post('/admin/trash/restore', { table, id }) : null);
  return r;
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

async function uploadFile(bucket, file, opts = {}) {
  // Filigrane automatique (images : navigateur ; PDF : serveur). opts.raw = true pour désactiver (photos de profil)
  const original = file; const sha256_original = await sha256File(original);
  if (!opts.raw && !file.watermarked) file = await applyWatermark(file);
  const data = await fileToBase64(file);
  const r = await api.post(`/upload/${bucket}`, { filename: file.name, contentType: file.type, data, client_watermarked: !!file.watermarked, sha256_original });
  if (r.data?.code && !opts.silent) toast(`Document sécurisé · code ${r.data.code}${r.data.watermarked ? ' · filigrane appliqué' : ''}`, 'success');
  return r.data;
}

// ============ FILIGRANE AUTOMATIQUE (logo Rahma + droits d'auteur) ============
// Le serveur filigrane TOUJOURS les PDF (pdf-lib) et enregistre chaque fichier au registre d'authenticité (code + SHA-256).
// Le navigateur filigrane les images (canvas) avant envoi : logo transparent + bandeau copyright + texte diagonal.
const WATERMARK_LOGO_URL = '/static/logo-rahma.png'; // logo par défaut ; F62 : le logo de l'établissement (BRAND.logo_url) est essayé en premier
const WM_OPACITY = 0.13, WM_WIDTH = 0.55;
let _wmLogoImg = null;
async function wmLogo() {
  if (_wmLogoImg) return _wmLogoImg;
  // Chargement via fetch → blob (évite les blocages CORS/canvas « tainted ») ; repli sur le logo local
  for (const src of [...new Set([brandLogo(), WATERMARK_LOGO_URL, 'https://nxtyizeoypolvrfhulpk.supabase.co/storage/v1/object/public/photos/logo-rahma.png'])]) {
    try {
      const blob = await fetch(src, { mode: 'cors' }).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });
      _wmLogoImg = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(blob); });
      return _wmLogoImg;
    } catch (e) { console.warn('Logo filigrane indisponible :', src, e); }
  }
  return null;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
function wmOwnerLabel() { return (App.user?.name || App.user?.email || brandName()); }
function wmCopyright() { return `© ${new Date().getFullYear()} ${brandName()} — ${wmOwnerLabel()}. Tous droits réservés. Reproduction interdite.`; }
// Filigrane une IMAGE via canvas → retourne un nouveau File (logo + texte diagonal + bandeau copyright)
async function watermarkImage(file) {
  const logo = await wmLogo();
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const W = canvas.width, H = canvas.height;
  if (logo) { const lw = W * WM_WIDTH, lh = logo.naturalHeight * lw / logo.naturalWidth; ctx.globalAlpha = WM_OPACITY; ctx.drawImage(logo, (W - lw) / 2, (H - lh) / 2, lw, lh); ctx.globalAlpha = 1; }
  // Texte diagonal répété
  const diag = `${brandName().toUpperCase()} · ${wmOwnerLabel()}`; const fs = Math.max(14, Math.round(W / 28));
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-Math.PI / 6); ctx.font = `bold ${fs}px Arial`; ctx.fillStyle = 'rgba(40,60,110,0.09)'; ctx.textAlign = 'center';
  for (let y = -H; y <= H; y += fs * 6) for (let x = -W; x <= W; x += ctx.measureText(diag).width + fs * 3) ctx.fillText(diag, x, y);
  ctx.restore();
  // Bandeau copyright
  const bh = Math.max(16, Math.round(H * 0.025)); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(0, H - bh, W, bh);
  ctx.font = `${Math.max(9, Math.round(bh * 0.55))}px Arial`; ctx.fillStyle = '#334155'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(wmCopyright(), Math.round(bh * 0.4), H - bh / 2);
  URL.revokeObjectURL(img.src);
  const isJpeg = /jpe?g/i.test(file.type);
  const blob = await new Promise(res => canvas.toBlob(res, isJpeg ? 'image/jpeg' : 'image/png', 0.92));
  const out = new File([blob], file.name, { type: blob.type }); out.watermarked = true; return out;
}
// PDF : le filigrane complet (logo, texte, copyright, code d'authentification) est appliqué par le serveur.
// Le client ne touche plus au PDF (évite double filigrane et PDF protégés) : on renvoie le fichier tel quel.
async function watermarkPdf(file) { return file; }
async function applyWatermark(file) {
  try {
    if ((file.type || '').startsWith('image/')) return await watermarkImage(file);
  } catch (e) { console.warn('Filigrane image impossible', e); }
  return file;
}
async function sha256File(file) { try { const h = await crypto.subtle.digest('SHA-256', await file.arrayBuffer()); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return null; } }

function levelOptions(selected) {
  let html = '';
  for (const [cy, lvls] of Object.entries(LEVELS)) {
    html += `<optgroup label="${CYCLE_LABELS[cy]}">`;
    for (const l of lvls) html += `<option value="${l}" ${l===selected?'selected':''}>${esc(LEVEL_LABELS[l] || l)}</option>`;
    html += '</optgroup>';
  }
  return html;
}
function cycleOfLevel(l) { for (const [c, ls] of Object.entries(LEVELS)) if (ls.includes(l)) return c; return FIRST_CYCLE(); }

const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm';
const lblCls = 'block text-xs font-semibold text-gray-600 mb-1';
const btnPrimary = 'px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium';
const btnSecondary = 'px-4 py-2 rounded-lg border text-gray-600 hover:bg-gray-50 text-sm';
// ============ F61 : design system (helpers réutilisables) ============
const btnGhost = 'px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 text-sm';
const btnDanger = 'px-4 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 text-sm font-medium';
// Squelettes de chargement (remplacent le spinner global)
function skeletonPage() { return `<div class="animate-pulse space-y-4" aria-busy="true" aria-live="polite"><div class="h-7 w-64 bg-slate-200 rounded"></div><div class="grid grid-cols-2 lg:grid-cols-4 gap-4">${'<div class="h-24 bg-white rounded-xl border border-slate-100"></div>'.repeat(4)}</div><div class="bg-white rounded-xl border border-slate-100 p-4 space-y-3">${'<div class="h-4 bg-slate-100 rounded"></div>'.repeat(6)}</div></div>`; }
function skeletonRows(n = 5, cols = 4) { return Array.from({ length: n }, () => `<tr class="animate-pulse">${Array.from({ length: cols }, () => '<td><div class="h-4 bg-slate-100 rounded"></div></td>').join('')}</tr>`).join(''); }
// État vide standard
function emptyState(icon, title, text = '', actionHtml = '') { return `<div class="text-center py-12 px-4 bg-white rounded-xl border border-dashed border-slate-200"><div class="w-14 h-14 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-2xl mb-3"><i class="fas ${icon}"></i></div><h3 class="font-bold text-slate-700">${title}</h3>${text ? `<p class="text-sm text-slate-500 mt-1 max-w-md mx-auto">${text}</p>` : ''}${actionHtml ? `<div class="mt-4">${actionHtml}</div>` : ''}</div>`; }
// Message d'erreur lisible (remplace « Erreur serveur 503 »)
function friendlyError(e) {
  const st = e?.response?.status; const msg = e?.response?.data?.error;
  if (msg && !/^(Erreur|Error)$/i.test(msg)) return msg;
  if (st === 503 || st === 502 || st === 504) return 'Le service de données est temporairement indisponible. Vos informations n\'ont pas été perdues : réessayez dans quelques instants.';
  if (st === 401) return 'Votre session a expiré. Reconnectez-vous pour continuer.';
  if (st === 403) return 'Vous n\'avez pas les droits nécessaires pour cette action.';
  if (st === 404) return 'L\'élément demandé est introuvable (il a peut-être été supprimé).';
  if (st === 423) return msg || 'Cette année scolaire est clôturée : lecture seule.';
  if (!st && e?.message === 'Network Error') return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  return msg || e?.message || 'Une erreur inattendue est survenue.';
}
// Bouton en cours d'enregistrement : setBusy(btn, true) → spinner + désactivé ; setBusy(btn, false, 'Enregistré ✓')
function setBusy(btn, busy, doneLabel) { if (!btn) return; if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Enregistrement…'; } else { btn.disabled = false; btn.innerHTML = doneLabel || btn.dataset.label || btn.innerHTML; if (doneLabel && btn.dataset.label) setTimeout(() => { btn.innerHTML = btn.dataset.label; }, 1500); } }
// Recherche globale (Ctrl K) : élèves, enseignants, classes, cours, inscriptions — selon le rôle
let _gsTimer = null;
function openGlobalSearch() {
  if (document.getElementById('gsearch')) return;
  document.body.insertAdjacentHTML('beforeend', `<div id="gsearch" class="fixed inset-0 z-[80] bg-black/40 flex items-start justify-center pt-[10vh] px-4" onclick="if(event.target===this) closeGlobalSearch()" role="dialog" aria-modal="true" aria-label="Recherche globale">
    <div class="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden"><div class="flex items-center gap-3 px-4 border-b"><i class="fas fa-magnifying-glass text-slate-400"></i><input id="gs-input" class="flex-1 h-12 outline-none text-sm" placeholder="Rechercher un élève, un enseignant, une classe, un cours…" autocomplete="off" oninput="globalSearch(this.value)" onkeydown="if(event.key==='Escape') closeGlobalSearch()"><kbd class="text-[10px] border rounded px-1 text-slate-400">Échap</kbd></div>
    <div id="gs-res" class="max-h-[60vh] overflow-y-auto p-2 text-sm"><p class="text-xs text-slate-400 p-3">Tapez au moins 2 caractères.</p></div></div></div>`);
  setTimeout(() => document.getElementById('gs-input')?.focus(), 30);
}
function closeGlobalSearch() { document.getElementById('gsearch')?.remove(); }
function globalSearch(q) {
  clearTimeout(_gsTimer); const res = document.getElementById('gs-res'); q = (q || '').trim(); if (q.length < 2) { res.innerHTML = '<p class="text-xs text-slate-400 p-3">Tapez au moins 2 caractères.</p>'; return; }
  _gsTimer = setTimeout(async () => {
    res.innerHTML = `<p class="text-xs text-slate-400 p-3"><i class="fas fa-spinner fa-spin mr-1"></i>Recherche…</p>`;
    const like = `*${q.replace(/[%*,()]/g, '')}*`; const groups = [];
    const safe = async (fn) => { try { return await fn(); } catch { return []; } };
    const staff = isStaff();
    const [students, teachers, classes, courses, regs] = await Promise.all([
      safe(() => db.list('students', `select=id,first_name,last_name,level,class_name,photo_url&or=(first_name.ilike.${like},last_name.ilike.${like},national_id.ilike.${like})&limit=8`)),
      staff ? safe(() => db.list('teachers', `select=id,first_name,last_name,subject&or=(first_name.ilike.${like},last_name.ilike.${like},subject.ilike.${like})&limit=5`)) : [],
      staff ? safe(() => db.list('classes', `select=id,name,level&name.ilike.${like}&limit=5`)) : [],
      safe(() => db.list('courses', `select=id,title,level&title.ilike.${like}&limit=6`)),
      isAdmin() ? safe(() => db.list('registrations', `select=id,first_name,last_name,status&or=(first_name.ilike.${like},last_name.ilike.${like})&limit=5`)) : []
    ]);
    const row = (icon, title, sub, onclick) => `<button onclick="${onclick}; closeGlobalSearch()" class="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50"><span class="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"><i class="fas ${icon}"></i></span><span class="min-w-0"><b class="block truncate text-slate-800">${title}</b><span class="text-xs text-slate-500">${sub}</span></span></button>`;
    if (students.length) groups.push(['Élèves', students.map(s => row('fa-user-graduate', esc(fullName(s)), esc(LEVEL_LABELS[s.level] || s.level || '') + (s.class_name ? ' · ' + esc(s.class_name) : ''), `App.cache.gradeStudent=${s.id}; App.cache.studentFocus=${s.id}; navigate('students')`))]);
    if (teachers.length) groups.push(['Enseignants', teachers.map(t => row('fa-chalkboard-user', esc(t.first_name + ' ' + t.last_name), esc(t.subject || ''), `navigate('teachers')`))]);
    if (classes.length) groups.push(['Classes', classes.map(c => row('fa-school', esc(c.name), esc(LEVEL_LABELS[c.level] || c.level || ''), `navigate('classes')`))]);
    if (courses.length) groups.push(['Cours', courses.map(c => row('fa-book-open', esc(c.title), esc(LEVEL_LABELS[c.level] || c.level || ''), `navigate('courses')`))]);
    if (regs.length) groups.push(['Inscriptions', regs.map(r => row('fa-file-signature', esc(r.first_name + ' ' + r.last_name), esc(r.status || ''), `navigate('registrations')`))]);
    res.innerHTML = groups.length ? groups.map(([t, items]) => `<p class="text-[10px] uppercase tracking-widest text-slate-400 px-3 pt-2">${t}</p>${items.join('')}`).join('') : emptyState('fa-magnifying-glass', 'Aucun résultat', `Rien ne correspond à « ${esc(q)} ».`);
  }, 250);
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && App.user) { e.preventDefault(); openGlobalSearch(); } if (e.key === 'Escape') { closeGlobalSearch(); document.getElementById('user-menu')?.classList.add('hidden'); } });

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
// F59 : périmètre enseignant (matières + élèves affectés par l'admin) exposé par /api/auth/me
function teacherScope() { return App.user?.role === 'teacher' ? (App.user.scope || { subject_ids: null, student_ids: null }) : null; }
function scopedSubjects(subjects) { const sc = teacherScope(); if (!sc || sc.subject_ids === null) return subjects; return subjects.filter(s => sc.subject_ids.includes(Number(s.id))); }
function scopeBanner() {
  const sc = teacherScope(); if (!sc) return '';
  const noSubj = sc.subject_ids !== null && !sc.subject_ids.length; const noStud = sc.student_ids !== null && !sc.student_ids.length;
  if (!noSubj && !noStud && sc.subject_ids === null) return `<div class="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs mb-3"><i class="fas fa-triangle-exclamation mr-1"></i>Aucune matière n'est encore reliée à votre fiche : demandez à l'administration de définir votre matière (fiche enseignant → Matières).</div>`;
  if (noSubj || noStud) return `<div class="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-xs mb-3"><i class="fas fa-lock mr-1"></i>${noSubj ? 'Aucune matière affectée' : ''}${noSubj && noStud ? ' · ' : ''}${noStud ? 'Aucun élève affecté' : ''} — l'administration doit compléter votre fiche enseignant avant toute saisie.</div>`;
  return `<div class="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-3 py-2 text-xs mb-3"><i class="fas fa-user-lock mr-1"></i>Vous notez et observez uniquement <b>votre matière</b>${sc.student_ids !== null ? ` et vos <b>${sc.student_ids.length} élève(s) affecté(s)</b>` : ''} par l'administration.</div>`;
}
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
  curriculum: { icon:'fa-sitemap', label:'Référentiel programme', roles:['admin'] },
  notifications: { icon:'fa-bell', label:'Notifications', roles:['admin','teacher','parent','student'] },
  chat: { icon:'fa-comments', label:'Discussions', roles:['admin','teacher','parent','student'] },
  parent: { icon:'fa-house-user', label:'Portail Parent', roles:['parent'] },
  settings: { icon:'fa-gear', label:'Paramètres', roles:['admin'] }
};

// F62 : modules activables / désactivables par établissement (BRAND.modules — true par défaut)
// Chaque module regroupe une ou plusieurs routes ; un module désactivé disparaît du menu, de la barre mobile, des raccourcis et de la recherche.
const MODULES = {
  attendance:    { label: 'Présence & appel',            icon: 'fa-clipboard-check', routes: ['attendance'],            desc: 'Appel quotidien, absences, retards, justificatifs.' },
  notebook:      { label: 'Carnet de classe & notation', icon: 'fa-chalkboard',      routes: ['notebook', 'gradebook'], desc: 'Observations, plan de classe, carnet de notation.' },
  grades:        { label: 'Notes & bulletins',           icon: 'fa-star',            routes: ['grades'],                desc: 'Saisie des notes, moyennes, bulletins PDF.' },
  fees:          { label: 'Frais & paiements',           icon: 'fa-money-bill-wave', routes: ['fees'],                  desc: 'Mensualités, quittances, relances, paiement en ligne.' },
  courses:       { label: 'Cours & documents',           icon: 'fa-book-open',       routes: ['courses'],               desc: 'Supports de cours filigranés et authentifiés.' },
  interactive:   { label: 'Cours interactifs',           icon: 'fa-gamepad',         routes: ['interactive'],           desc: 'Quiz, exercices et applications intégrées.' },
  homeworks:     { label: 'Devoirs à rendre',            icon: 'fa-book',            routes: ['homeworks'],             desc: 'Devoirs, dépôt des travaux, correction.' },
  evaluations:   { label: 'Évaluations & banque',        icon: 'fa-file-signature',  routes: ['evaluations', 'examwizard', 'bank', 'curriculum'], desc: 'Constructeur d\u2019examens, assistant IA, bibliothèque d\u2019exercices, référentiel.' },
  timetable:     { label: 'Emploi du temps',             icon: 'fa-calendar-week',   routes: ['timetable'],             desc: 'Séances hebdomadaires par niveau.' },
  calendar:      { label: 'Calendrier & événements',     icon: 'fa-calendar-days',   routes: ['calendar'],              desc: 'Examens, réunions, vacances, rappels.' },
  analytics:     { label: 'Analyses & rapports',         icon: 'fa-chart-column',    routes: ['analytics'],             desc: 'Élèves à risque, statistiques, exports.' },
  certificates:  { label: 'Certificats & attestations',  icon: 'fa-certificate',     routes: ['certificates'],          desc: 'Attestations numérotées, QR de vérification.' },
  chat:          { label: 'Discussions',                 icon: 'fa-comments',        routes: ['chat'],                  desc: 'Messagerie interne parents / enseignants / administration.' },
  registrations: { label: 'Inscriptions en ligne',       icon: 'fa-file-pen',        routes: ['registrations'],         desc: 'Formulaire public, QR code, validation des demandes.' },
  classes:       { label: 'Classes & matières',          icon: 'fa-school',          routes: ['classes', 'subjects'],   desc: 'Organisation des classes et des matières.' }
};
function moduleEnabled(key) { const m = BRAND.modules || {}; return m[key] !== false; }
function routeEnabled(route) { for (const [k, m] of Object.entries(MODULES)) if (m.routes.includes(route)) return moduleEnabled(k); return true; }
function navigate(route) {
  if (!routeEnabled(route)) { toast('Ce module est désactivé pour votre établissement (Paramètres → Établissement → Modules).', 'warning'); return; }
  App.route = route;
  render();
}

// ============ F61 : Shell applicatif modernisé — menu groupé rétractable, barre supérieure, navigation mobile ============
// Familles de navigation (ordre d'affichage). Chaque route reste définie dans ROUTES (rôles, icône, libellé).
const NAV_GROUPS = [
  { key: 'home', label: 'Accueil', icon: 'fa-house', routes: ['dashboard', 'parent', 'notifications'] },
  { key: 'students', label: 'Élèves', icon: 'fa-user-graduate', routes: ['students', 'attendance', 'notebook', 'gradebook'] },
  { key: 'pedagogy', label: 'Pédagogie', icon: 'fa-chalkboard', routes: ['courses', 'interactive', 'homeworks', 'evaluations', 'examwizard', 'bank', 'calendar', 'timetable'] },
  { key: 'follow', label: 'Suivi', icon: 'fa-chart-line', routes: ['grades', 'fees', 'analytics', 'certificates'] },
  { key: 'comm', label: 'Communication', icon: 'fa-comments', routes: ['chat'] },
  { key: 'admin', label: 'Administration', icon: 'fa-gears', routes: ['registrations', 'teachers', 'classes', 'subjects', 'curriculum', 'settings'] }
];
// Accès prioritaires de la barre mobile inférieure (par rôle)
const MOBILE_TABS = {
  admin: ['dashboard', 'students', 'attendance', 'grades', 'notifications'],
  teacher: ['dashboard', 'attendance', 'notebook', 'gradebook', 'notifications'],
  parent: ['parent', 'grades', 'fees', 'chat', 'notifications'],
  student: ['dashboard', 'homeworks', 'grades', 'courses', 'notifications']
};
// Action « Ajouter » contextuelle par page (libellé → fonction globale si disponible)
const QUICK_ADD = {
  students: ['Ajouter un élève', 'showStudentForm'], teachers: ['Ajouter un enseignant', 'showTeacherForm'], courses: ['Créer un cours', 'showCourseForm'],
  grades: ['Ajouter une note', () => typeof showGradeForm === 'function' && showGradeForm(App.cache.gradeStudent || '')], homeworks: ['Nouveau devoir', 'showHwForm'],
  evaluations: ['Nouvelle évaluation', 'evaNew'], events: ['Nouvel événement', 'showEventForm'], calendar: ['Nouvel événement', 'showEventForm'], fees: ['Ajouter des frais', 'showFeeForm'],
  classes: ['Nouvelle classe', 'showClassForm'], subjects: ['Nouvelle matière', 'showSubjectForm'], interactive: ['Nouveau cours interactif', 'showInteractiveForm'], chat: ['Nouveau message', null]
};
const UI = { collapsed: localStorage.getItem('ui_nav_collapsed') === '1', openGroups: JSON.parse(localStorage.getItem('ui_nav_groups') || 'null'), menuOpen: false };
function groupOfRoute(r) { return NAV_GROUPS.find(g => g.routes.includes(r))?.key || 'home'; }
function toggleNavCollapse() { UI.collapsed = !UI.collapsed; localStorage.setItem('ui_nav_collapsed', UI.collapsed ? '1' : '0'); render(); }
function toggleNavGroup(k) { UI.openGroups = UI.openGroups || {}; UI.openGroups[k] = !UI.openGroups[k]; localStorage.setItem('ui_nav_groups', JSON.stringify(UI.openGroups)); const el = document.getElementById('nav-group-' + k); if (el) el.classList.toggle('hidden'); const ch = document.getElementById('nav-chev-' + k); if (ch) ch.classList.toggle('rotate-180'); }
function navGroupHtml(g, routes) {
  const items = g.routes.filter(r => routes[r]); if (!items.length) return '';
  const active = items.includes(App.route); const open = UI.openGroups ? (UI.openGroups[g.key] ?? active) : active;
  if (UI.collapsed) return items.map(r => `<a href="#" onclick="navigate('${r}');return false;" title="${esc(routes[r].label)}" aria-label="${esc(routes[r].label)}" class="sidebar-link flex items-center justify-center h-11 mx-2 rounded-lg text-base ${App.route === r ? 'active' : ''}"><span class="relative"><i class="fas ${routes[r].icon}"></i>${r === 'notifications' ? '<span id="notif-badge" class="notif-badge hidden">0</span>' : ''}${r === 'homeworks' ? '<span id="hw-badge" class="notif-badge hidden">0</span>' : ''}</span></a>`).join('');
  return `<div class="mb-1">
    <button onclick="toggleNavGroup('${g.key}')" class="w-full flex items-center justify-between px-5 py-2 text-[11px] font-bold uppercase tracking-widest ${active ? 'text-amber-300' : 'text-blue-300'} hover:text-white" aria-expanded="${open}"><span><i class="fas ${g.icon} mr-2 w-4 text-center"></i>${g.label}</span><i id="nav-chev-${g.key}" class="fas fa-chevron-down text-[9px] transition-transform ${open ? '' : 'rotate-180'}"></i></button>
    <div id="nav-group-${g.key}" class="${open ? '' : 'hidden'}">${items.map(r => `<a href="#" onclick="navigate('${r}');return false;" class="sidebar-link flex items-center gap-3 pl-8 pr-4 py-2 text-sm ${App.route === r ? 'active' : ''}"><span class="relative w-5 text-center"><i class="fas ${routes[r].icon}"></i>${r === 'notifications' ? '<span id="notif-badge" class="notif-badge hidden">0</span>' : ''}${r === 'homeworks' ? '<span id="hw-badge" class="notif-badge hidden">0</span>' : ''}</span>${routes[r].label}</a>`).join('')}</div></div>`;
}
function topbarHtml(routes) {
  const r = routes[App.route] || {}; const g = NAV_GROUPS.find(x => x.key === groupOfRoute(App.route));
  const qa = QUICK_ADD[App.route]; const qaFn = qa ? (typeof qa[1] === 'function' ? qa[1] : (typeof window[qa[1]] === 'function' ? window[qa[1]] : null)) : null;
  if (qaFn) window.__quickAdd = qaFn;
  const initials = esc((App.user.name || '?').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase());
  return `<header class="topbar sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 px-3 md:px-6 h-14 flex items-center gap-3" id="topbar">
    <button onclick="toggleNavCollapse()" class="hidden md:inline-flex icon-btn" aria-label="Réduire le menu" title="Réduire / étendre le menu"><i class="fas fa-bars"></i></button>
    <button onclick="UI.menuOpen=true; render()" class="md:hidden icon-btn" aria-label="Ouvrir le menu"><i class="fas fa-bars"></i></button>
    <nav class="min-w-0 flex-1" aria-label="Fil d'Ariane"><ol class="flex items-center gap-1.5 text-xs text-slate-500 truncate"><li class="hidden sm:inline">${esc(g?.label || 'Accueil')}</li><li class="hidden sm:inline text-slate-300">/</li><li class="text-sm font-bold text-slate-800 truncate"><i class="fas ${r.icon || 'fa-circle'} mr-1.5 text-blue-600"></i>${esc(r.label || '')}</li></ol></nav>
    <button onclick="openGlobalSearch()" class="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-sm hover:bg-white hover:border-blue-300 w-44 lg:w-64" aria-label="Recherche globale"><i class="fas fa-magnifying-glass text-xs"></i><span class="flex-1 text-left truncate">Rechercher…</span><kbd class="hidden lg:inline text-[10px] border rounded px-1 bg-white">Ctrl K</kbd></button>
    <button onclick="openGlobalSearch()" class="sm:hidden icon-btn" aria-label="Rechercher"><i class="fas fa-magnifying-glass"></i></button>
    ${qa ? `<button onclick="(window.__quickAdd||(()=>navigate('${App.route}')))()" class="btn btn-primary hidden md:inline-flex" ${qaFn ? '' : 'disabled title="Indisponible sur cette page"'}><i class="fas fa-plus"></i><span class="hidden lg:inline">${esc(qa[0])}</span></button>` : ''}
    <button onclick="navigate('notifications')" class="icon-btn relative" aria-label="Notifications"><i class="fas fa-bell"></i><span id="notif-badge-m" class="notif-badge hidden">0</span></button>
    <a href="/aide" target="_blank" class="icon-btn hidden md:inline-flex" aria-label="Aide" title="Aide"><i class="fas fa-circle-question"></i></a>
    <div class="relative"><button onclick="document.getElementById('user-menu').classList.toggle('hidden')" class="flex items-center gap-2 h-9 pl-1 pr-2 rounded-full hover:bg-slate-100" aria-label="Menu utilisateur" aria-haspopup="true"><span class="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-blue-950 flex items-center justify-center text-xs font-black">${initials}</span><span class="hidden lg:block text-left leading-tight"><span class="block text-xs font-bold text-slate-800 max-w-[120px] truncate">${esc(App.user.name)}</span><span class="block text-[10px] text-slate-500">${roleLabel(App.user.role)}</span></span><i class="fas fa-chevron-down text-[10px] text-slate-400 hidden lg:inline"></i></button>
      <div id="user-menu" class="hidden absolute right-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-40 text-sm">
        <div class="px-4 py-2 border-b"><p class="font-bold text-slate-800 truncate">${esc(App.user.name)}</p><p class="text-xs text-slate-500 truncate">${esc(App.user.email || '')}</p></div>
        ${App.user.role === 'admin' ? `<a href="#" onclick="App.cache.settingsTab='account'; navigate('settings'); return false;" class="block px-4 py-2 hover:bg-slate-50"><i class="fas fa-user-shield w-5 text-slate-400"></i>Mon compte</a>` : `<a href="#" onclick="typeof showMyAccount==='function' ? showMyAccount() : navigate('dashboard'); return false;" class="block px-4 py-2 hover:bg-slate-50"><i class="fas fa-user w-5 text-slate-400"></i>Mon profil</a>`}
        ${App.years.length ? `<div class="px-4 py-2 border-t"><label class="text-[10px] uppercase tracking-widest text-slate-400 block mb-1">Année scolaire</label><select onchange="setSchoolYear(this.value)" class="w-full border rounded-lg px-2 py-1 text-xs ${isReadOnlyYear() ? 'border-amber-400 text-amber-700' : ''}">${App.years.map(y => `<option value="${y.label}" ${y.label === App.year ? 'selected' : ''}>${y.label}${y.is_current ? ' · en cours' : ' · clôturée'}</option>`).join('')}</select></div>` : ''}
        <button onclick="logout()" class="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 border-t"><i class="fas fa-right-from-bracket w-5"></i>Déconnexion</button>
      </div></div>
  </header>`;
}
function mobileTabsHtml(routes) {
  const tabs = (MOBILE_TABS[App.user.role] || MOBILE_TABS.admin).filter(r => routes[r]).slice(0, 5);
  return `<nav class="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-${tabs.length} pb-[env(safe-area-inset-bottom)]" id="mobile-tabs" aria-label="Navigation principale">
    ${tabs.map(r => `<a href="#" onclick="navigate('${r}');return false;" class="flex flex-col items-center justify-center h-14 text-[10px] font-semibold ${App.route === r ? 'text-blue-700' : 'text-slate-500'}" aria-label="${esc(routes[r].label)}"><span class="relative text-lg mb-0.5"><i class="fas ${routes[r].icon}"></i>${r === 'notifications' ? '<span id="notif-badge-t" class="notif-badge hidden">0</span>' : ''}</span>${esc(routes[r].label.split(' ')[0])}</a>`).join('')}
  </nav>`;
}

async function render() {
  const app = document.getElementById('app');
  if (!App.user) { renderPublic(app); return; }
  const routesList = Object.entries(ROUTES).filter(([k,v]) => v.roles.includes(App.user.role) && routeEnabled(k));
  const routes = Object.fromEntries(routesList);
  if (!ROUTES[App.route] || !ROUTES[App.route].roles.includes(App.user.role) || !routeEnabled(App.route)) App.route = App.user.role === 'parent' ? 'parent' : 'dashboard';
  const envTest = App.appEnv && App.appEnv !== 'production';
  const sidebarInner = `
      <div class="${UI.collapsed ? 'p-3 justify-center' : 'p-5'} border-b border-blue-800 flex items-center gap-3">
        <img src="${esc(brandLogo())}" alt="Logo ${esc(brandName())}" class="w-11 h-11 object-contain drop-shadow flex-shrink-0">
        ${UI.collapsed ? '' : `<div class="min-w-0"><h1 class="text-lg font-bold leading-tight truncate" title="${esc(brandName())}">${brandNameHtml()}</h1><p class="text-[10px] text-blue-300 tracking-widest uppercase truncate">${esc(BRAND.tagline || 'Plateforme scolaire')}</p></div>`}
      </div>
      <nav class="flex-1 py-3 overflow-y-auto" id="main-nav">${NAV_GROUPS.map(g => navGroupHtml(g, routes)).join('')}</nav>
      ${UI.collapsed ? `<div class="p-2 border-t border-blue-800 text-center"><button onclick="logout()" class="icon-btn text-blue-200 hover:text-white" aria-label="Déconnexion"><i class="fas fa-right-from-bracket"></i></button></div>` : `<div class="p-4 border-t border-blue-800 text-xs">
        <div class="flex items-center gap-2 mb-2"><div class="w-8 h-8 rounded-full bg-amber-400 text-blue-900 flex items-center justify-center font-bold">${esc(App.user.name[0]||'?')}</div><div class="min-w-0"><div class="font-semibold truncate">${esc(App.user.name)}</div><div class="text-blue-300">${roleLabel(App.user.role)}${App.year ? ' · ' + esc(App.year) : ''}</div></div></div>
        <button onclick="logout()" class="w-full text-left text-blue-200 hover:text-white"><i class="fas fa-right-from-bracket mr-1"></i> Déconnexion</button></div>`}`;
  app.innerHTML = `
  ${envTest ? `<div class="fixed top-0 left-0 right-0 z-[70] bg-amber-400 text-amber-950 text-center text-xs font-bold py-1 tracking-wide" id="env-banner"><i class="fas fa-flask mr-1"></i>ENVIRONNEMENT DE TEST (${esc(App.appEnv.toUpperCase())}) — données fictives, aucun impact sur la production</div>` : ''}
  <div class="flex min-h-screen bg-slate-50 ${envTest ? 'pt-6' : ''}">
    <aside class="${UI.collapsed ? 'w-16' : 'w-64'} text-white flex-shrink-0 hidden md:flex brand-sidebar flex-col sticky top-0 h-screen transition-all" id="sidebar">${sidebarInner}</aside>
    ${UI.menuOpen ? `<div class="fixed inset-0 z-50 md:hidden" id="mobile-drawer"><div class="absolute inset-0 bg-black/50" onclick="UI.menuOpen=false; render()"></div><aside class="absolute inset-y-0 left-0 w-72 brand-sidebar text-white flex flex-col shadow-2xl">${sidebarInner.replace(/UI\.collapsed/g, 'false')}</aside></div>` : ''}
    <div class="flex-1 flex flex-col min-w-0">
      ${topbarHtml(routes)}
      ${isReadOnlyYear() ? `<div class="bg-amber-100 border-b border-amber-300 text-amber-900 text-sm px-4 py-2 flex items-center justify-between gap-3" id="readonly-banner"><span><i class="fas fa-lock mr-2"></i>Vous consultez l'année <b>${esc(App.year)}</b> (clôturée) — <b>lecture seule</b>. Les saisies sont désactivées.</span><button onclick="setSchoolYear(App.currentYear)" class="btn btn-sm bg-amber-500 text-white hover:bg-amber-600">Revenir à ${esc(App.currentYear)}</button></div>` : ''}
      <main class="flex-1 p-4 md:p-6 overflow-x-auto pb-20 md:pb-6" id="main-content">${skeletonPage()}</main>
    </div>
    ${mobileTabsHtml(routes)}
  </div>`;
  document.addEventListener('click', (e) => { const m = document.getElementById('user-menu'); if (m && !m.classList.contains('hidden') && !e.target.closest('#user-menu') && !e.target.closest('[aria-haspopup]')) m.classList.add('hidden'); }, { once: true, capture: true });
  if (UI.menuOpen) UI.menuOpen = false;

  refreshNotifBadge();
  if (typeof refreshHwBadge === 'function') refreshHwBadge();
  const view = VIEWS[App.route];
  if (view) {
    try { await view(document.getElementById('main-content')); }
    catch (e) {
      console.error(e);
      document.getElementById('main-content').innerHTML = `<div class="bg-rose-50 border border-rose-200 rounded-xl p-6 text-rose-800"><p class="font-bold"><i class="fas fa-circle-exclamation mr-2"></i>Impossible d'afficher cette page</p><p class="text-sm mt-1">${esc(friendlyError(e))}</p><button onclick="render()" class="${btnSecondary} mt-3"><i class="fas fa-rotate mr-1"></i>Réessayer</button></div>`;
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
    ['notif-badge', 'notif-badge-m', 'notif-badge-t'].forEach(id => {
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
      <p class="font-bold text-sm">Installer ${esc(brandName())}</p>
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
  applyBrandTheme();
  if (typeof handleGoogleReturn === 'function' && await handleGoogleReturn()) { render(); return; }
  await tryRestoreSession();
  // Deep-link vers un cours interactif partagé : /#ic-<id>
  const m = (location.hash || '').match(/^#ic-(\d+)$/);
  if (m && App.user) { App.route = 'interactive'; App.cache.icOpenId = Number(m[1]); }
  else if (m) { App.cache.icPendingId = Number(m[1]); } // ouvert après connexion
  render();
});
