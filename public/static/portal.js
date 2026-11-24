/* ============================================================
   F74 — Portail d'entrée multi-établissements (trois portes)
   ------------------------------------------------------------
   Porte 1 : connexion par e-mail. L'annuaire (`tenant_directory`)
             répond « à quel(s) établissement(s) cet e-mail est
             rattaché ». Le portail ne vérifie JAMAIS de mot de passe :
             il ne fait que router vers le bon espace.
   Porte 2 : demande de création d'établissement. Elle part dans une
             file d'attente ; un humain la traite. Rien n'est créé
             automatiquement.
   Porte 3 : lien direct /e/<slug> — toujours valable, voie de secours.
   ------------------------------------------------------------
   Invariant : le portail ne peut JAMAIS enfermer quelqu'un dehors.
   L'annuaire est un cache de confort ; s'il est vide, périmé ou
   absent, l'utilisateur garde son lien direct et peut se connecter.
   ============================================================ */

const PORTAL_EMAIL_KEY = 'portal_email';
let PORTAL = { view: 'email', email: '', items: [], degraded: false, slug: null, busy: false, error: '' };

function portalReset() {
  PORTAL = { view: 'email', email: '', items: [], degraded: false, slug: null, busy: false, error: '' };
  portalRender();
}

// --- Rendu ---------------------------------------------------------------
function portalRender() {
  const host = document.getElementById('portal-host');
  if (!host) return;
  host.innerHTML = portalCard();
  const first = host.querySelector('input:not([type=hidden])');
  if (first && PORTAL.view === 'email') setTimeout(() => first.focus(), 60);
}

function portalCard() {
  const title = '<i class="fas fa-building-columns"></i>';
  const head = `
    <div class="text-center mb-5">
      <img src="${esc(brandLogo())}" alt="" class="w-14 h-14 mx-auto object-contain mb-3 drop-shadow" onerror="this.style.display='none'">
      <h2 class="text-lg font-extrabold text-slate-800 leading-tight">Accédez à votre espace</h2>
      <p class="text-sm text-slate-500 mt-1">${PORTAL.view === 'request' || PORTAL.view === 'sent' ? 'Demande de création d’établissement' : 'Votre e-mail suffit : nous savons où vous connecter.'}</p>
    </div>`;

  let body = '';
  if (PORTAL.view === 'email') body = portalViewEmail();
  else if (PORTAL.view === 'list') body = portalViewList();
  else if (PORTAL.view === 'none') body = portalViewNone();
  else if (PORTAL.view === 'login') body = portalViewLogin();
  else if (PORTAL.view === 'request') body = portalViewRequest();
  else if (PORTAL.view === 'sent') body = portalViewSent();

  const err = PORTAL.error ? `<p class="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert"><i class="fas fa-circle-exclamation mr-1"></i>${esc(PORTAL.error)}</p>` : '';
  return `<section id="portal-card" class="portal-card bg-white rounded-2xl shadow-2xl text-left" aria-label="Portail d'accès">${head}${body}${err}</section>`;
}

// ---- Vue 1 : saisie de l'e-mail ----------------------------------------
function portalViewEmail() {
  return `
  <form onsubmit="portalSubmitEmail(event)" novalidate>
    <label class="${lblCls}" for="portal-email">Votre adresse e-mail</label>
    <input id="portal-email" type="email" inputmode="email" autocomplete="email" required
      class="portal-input" placeholder="vous@exemple.tn"
      value="${esc(PORTAL.email)}" ${PORTAL.busy ? 'disabled' : ''}>
    <button type="submit" class="portal-btn mt-3" ${PORTAL.busy ? 'disabled' : ''}>
      ${PORTAL.busy ? '<i class="fas fa-spinner fa-spin mr-2"></i>Recherche…' : 'Continuer <i class="fas fa-arrow-right ml-2 text-xs"></i>'}
    </button>
  </form>
  <div class="flex items-center gap-3 my-4"><span class="flex-1 h-px bg-slate-200"></span><span class="text-[11px] uppercase tracking-wide text-slate-400">ou</span><span class="flex-1 h-px bg-slate-200"></span></div>
  <button type="button" onclick="portalOpenRequest()" class="portal-btn-ghost">
    <i class="fas fa-plus mr-2"></i>Créer mon établissement
  </button>
  <div class="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
    <button type="button" onclick="portalShowLogin()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-right-to-bracket mr-1"></i>Connexion directe</button>
    <button type="button" onclick="showTenantPicker()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-magnifying-glass mr-1"></i>J'ai le code de mon établissement</button>
  </div>
  ${PORTAL.degraded ? `<p class="mt-4 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"><i class="fas fa-triangle-exclamation mr-1"></i>La recherche par e-mail est momentanément indisponible. Utilisez « Connexion directe » ou le code de votre établissement.</p>` : ''}`;
}

// ---- Vue 2 : choix de l'établissement ---------------------------------
function portalViewList() {
  const one = PORTAL.items.length === 1;
  const row = t => {
    const roleFr = { admin: 'Administration', teacher: 'Enseignant', parent: 'Parent', student: 'Élève' }[t.role] || '';
    const off = t.status !== 'active';
    return `<button type="button" onclick="portalPick('${esc(t.slug)}')" ${off ? 'disabled' : ''}
      class="w-full flex items-center gap-3 p-3 rounded-xl border ${off ? 'border-slate-200 bg-slate-50 opacity-70 cursor-not-allowed' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/50'} text-left transition">
      <img src="${esc(t.logo_url || '/static/logo-rahma.png')}" alt="" class="w-10 h-10 rounded-lg object-contain bg-white border border-slate-100 flex-shrink-0" onerror="this.src='/static/logo-rahma.png'">
      <span class="min-w-0 flex-1">
        <span class="block font-semibold text-slate-800 text-sm truncate">${esc(t.name)}</span>
        <span class="block text-xs text-slate-500">${roleFr ? esc(roleFr) + ' · ' : ''}<span class="font-mono">${esc(t.slug)}</span>${off ? ' · <b>' + (t.status === 'pending' ? 'en attente de validation' : 'suspendu') + '</b>' : ''}</span>
      </span>
      ${off ? '<i class="fas fa-lock text-slate-300"></i>' : '<i class="fas fa-chevron-right text-slate-300"></i>'}
    </button>`;
  };
  return `
  <p class="text-xs text-slate-500 mb-3"><i class="fas fa-circle-check text-green-600 mr-1"></i>
    ${one ? 'Un établissement est rattaché à' : `${PORTAL.items.length} établissements sont rattachés à`} <b class="text-slate-700">${esc(PORTAL.email)}</b>
  </p>
  <div class="space-y-2">${PORTAL.items.map(row).join('')}</div>
  <div class="mt-4 flex items-center justify-between text-xs">
    <button type="button" onclick="portalReset()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-arrow-left mr-1"></i>Autre e-mail</button>
    <button type="button" onclick="portalOpenRequest()" class="text-slate-500 hover:text-slate-800 underline">Créer un établissement</button>
  </div>`;
}

// ---- Vue 3 : aucune correspondance ------------------------------------
function portalViewNone() {
  return `
  <div class="text-center">
    <div class="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-3"><i class="fas fa-magnifying-glass"></i></div>
    <p class="text-sm text-slate-700">Aucun établissement n'est encore rattaché à<br><b class="break-all">${esc(PORTAL.email)}</b></p>
    <p class="text-xs text-slate-500 mt-2">Ce n'est pas un blocage : si votre établissement existe déjà, connectez-vous directement ou demandez son code à votre administration.</p>
  </div>
  <div class="mt-4 space-y-2">
    <button type="button" onclick="portalShowLogin()" class="portal-btn"><i class="fas fa-right-to-bracket mr-2"></i>Se connecter directement</button>
    <button type="button" onclick="portalOpenRequest()" class="portal-btn-ghost"><i class="fas fa-plus mr-2"></i>Créer mon établissement</button>
  </div>
  <div class="mt-4 text-center text-xs"><button type="button" onclick="portalReset()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-arrow-left mr-1"></i>Autre e-mail</button></div>`;
}

// ---- Vue 4 : mot de passe de l'établissement choisi -------------------
function portalViewLogin() {
  const t = PORTAL.items.find(x => x.slug === PORTAL.slug);
  const name = t ? t.name : PORTAL.slug;
  return `
  <div class="flex items-center gap-2 mb-4 p-2 rounded-lg bg-slate-50 border border-slate-100">
    <img src="${esc((t && t.logo_url) || '/static/logo-rahma.png')}" alt="" class="w-8 h-8 rounded object-contain bg-white border border-slate-100" onerror="this.src='/static/logo-rahma.png'">
    <span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 truncate">${esc(name)}</span><span class="block text-[11px] text-slate-500 font-mono">${esc(PORTAL.slug)}</span></span>
  </div>
  <form onsubmit="doLogin(event)" novalidate>
    <input type="hidden" id="login-email" value="${esc(PORTAL.email)}">
    <label class="${lblCls}" for="login-password">Mot de passe</label>
    <input id="login-password" type="password" autocomplete="current-password" required class="portal-input" placeholder="••••••••">
    <div id="login-error" class="text-red-600 text-sm mt-2 hidden" role="alert"></div>
    <button type="submit" class="portal-btn mt-3"><i class="fas fa-right-to-bracket mr-2"></i>Se connecter</button>
  </form>
  <div class="mt-3 flex items-center justify-between text-xs">
    <button type="button" onclick="portalBackToList()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-arrow-left mr-1"></i>Retour</button>
    <button type="button" onclick="showGoogleIfEnabled && showGoogleIfEnabled()" class="hidden"></button>
    <span class="text-slate-400"><i class="fas fa-lock mr-1"></i>Connexion sécurisée</span>
  </div>`;
}

// ---- Vue 5 : demande de création --------------------------------------
function portalViewRequest() {
  return `
  <form onsubmit="portalSubmitRequest(event)" novalidate class="space-y-3">
    <div>
      <label class="${lblCls}" for="pr-name">Nom de l'établissement *</label>
      <input id="pr-name" class="portal-input" required maxlength="120" placeholder="ex : École El Amal">
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="${lblCls}" for="pr-type">Type</label>
        <select id="pr-type" class="portal-input">
          ${Object.entries((typeof _tenantsList !== 'undefined' && _tenantsList && _tenantsList.types) || { ecole: 'École', college: 'Collège', lycee: 'Lycée', institut: 'Institut', centre: 'Centre', jardin: 'Jardin d’enfants', autre: 'Autre' }).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="${lblCls}" for="pr-city">Ville</label>
        <input id="pr-city" class="portal-input" maxlength="80" placeholder="Tunis">
      </div>
    </div>
    <div>
      <label class="${lblCls}" for="pr-director_name">Directeur / directrice *</label>
      <input id="pr-director_name" class="portal-input" required maxlength="80" placeholder="Prénom et nom">
    </div>
    <div>
      <label class="${lblCls}" for="pr-director_email">E-mail de contact *</label>
      <input id="pr-director_email" type="email" inputmode="email" class="portal-input" required placeholder="direction@exemple.tn" value="${esc(PORTAL.email)}">
    </div>
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="${lblCls}" for="pr-phone">Téléphone</label>
        <input id="pr-phone" type="tel" class="portal-input" maxlength="24" placeholder="+216 …">
      </div>
      <div>
        <label class="${lblCls}" for="pr-expected_students">Élèves attendus</label>
        <input id="pr-expected_students" type="number" min="1" max="20000" class="portal-input" placeholder="120">
      </div>
    </div>
    <div>
      <label class="${lblCls}" for="pr-message">Message <span class="text-slate-400 font-normal">(facultatif)</span></label>
      <textarea id="pr-message" rows="3" maxlength="1500" class="portal-input" placeholder="Vos besoins, vos questions…"></textarea>
    </div>
    <!-- Piège à robots : invisible et sans intérêt pour un humain -->
    <input type="text" id="pr-website" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true">
    <button type="submit" class="portal-btn" id="pr-submit">
      <i class="fas fa-paper-plane mr-2"></i>Envoyer ma demande
    </button>
    <p class="text-[11px] text-slate-400 text-center leading-relaxed">
      Nous vous recontactons à l'adresse indiquée. Aucun mot de passe, aucune clé technique ne vous sera demandé ici.
    </p>
  </form>
  <div class="mt-3 text-center text-xs"><button type="button" onclick="portalReset()" class="text-slate-500 hover:text-slate-800 underline"><i class="fas fa-arrow-left mr-1"></i>Retour</button></div>`;
}

// ---- Vue 6 : demande envoyée ------------------------------------------
function portalViewSent() {
  return `
  <div class="text-center py-2">
    <div class="w-14 h-14 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mb-3"><i class="fas fa-check"></i></div>
    <h3 class="font-bold text-slate-800">Demande envoyée</h3>
    <p class="text-sm text-slate-600 mt-2">Merci ! Nous revenons vers vous à l'adresse indiquée pour créer votre espace.</p>
    <p class="text-xs text-slate-400 mt-3">Si vous n'avez rien reçu sous quelques jours, écrivez-nous : la demande est bien enregistrée.</p>
  </div>
  <button type="button" onclick="portalReset()" class="portal-btn-ghost mt-4"><i class="fas fa-arrow-left mr-2"></i>Retour à l'accueil</button>`;
}

// --- Actions -------------------------------------------------------------
async function portalSubmitEmail(e) {
  e.preventDefault();
  const email = formVal('portal-email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { PORTAL.error = 'Adresse e-mail invalide.'; portalRender(); return; }
  PORTAL.email = email; PORTAL.busy = true; PORTAL.error = '';
  portalRender();
  try {
    const d = (await api.get(`/portal/lookup?email=${encodeURIComponent(email)}`)).data;
    PORTAL.busy = false; PORTAL.degraded = !!d.degraded;
    try { sessionStorage.setItem(PORTAL_EMAIL_KEY, email); } catch {}
    if (!d.known || !(d.items || []).length) { PORTAL.view = 'none'; portalRender(); return; }
    PORTAL.items = d.items;
    if (PORTAL.items.length === 1) { PORTAL.slug = PORTAL.items[0].slug; PORTAL.view = 'login'; }
    else PORTAL.view = 'list';
    portalRender();
  } catch (err) {
    PORTAL.busy = false;
    PORTAL.error = err.response?.data?.error || 'Recherche impossible pour le moment.';
    portalRender();
  }
}

function portalPick(slug) {
  const t = (PORTAL.items || []).find(x => x.slug === slug);
  if (t && t.status !== 'active') return;
  // Même établissement que la page courante : on se connecte sur place.
  if (typeof TENANT !== 'undefined' && TENANT && slug === TENANT.slug) { PORTAL.slug = slug; PORTAL.view = 'login'; portalRender(); return; }
  // Autre établissement : on change de tenant par l'URL (le cookie suit), puis on reprend ici.
  try { sessionStorage.setItem(PORTAL_EMAIL_KEY, PORTAL.email); } catch {}
  location.href = `/e/${slug}/?portal=1`;
}

function portalBackToList() { PORTAL.view = PORTAL.items.length > 1 ? 'list' : 'none'; PORTAL.error = ''; portalRender(); }
function portalShowLogin() { PORTAL.view = 'login'; PORTAL.slug = (typeof TENANT !== 'undefined' && TENANT && TENANT.slug) || 'rahma'; PORTAL.error = ''; portalRender(); }
function portalOpenRequest() { PORTAL.view = 'request'; PORTAL.error = ''; portalRender(); }

async function portalSubmitRequest(e) {
  e.preventDefault();
  if (formVal('pr-website')) return; // piège à robots : on ignore silencieusement
  const body = {
    name: formVal('pr-name'), type: formVal('pr-type'), city: formVal('pr-city'),
    director_name: formVal('pr-director_name'), director_email: formVal('pr-director_email'),
    phone: formVal('pr-phone'), expected_students: formVal('pr-expected_students'), message: formVal('pr-message')
  };
  const btn = document.getElementById('pr-submit'); setBusy(btn, true);
  try {
    await api.post('/portal/request', body);
    PORTAL.view = 'sent'; PORTAL.error = ''; portalRender();
  } catch (err) {
    setBusy(btn, false);
    PORTAL.error = err.response?.data?.error || 'Envoi impossible pour le moment.';
    portalRender();
  }
}

// Retour depuis /e/<slug>/?portal=1 : l'établissement est déjà choisi par l'URL, on pré-remplit l'e-mail.
function portalResumeAfterTenantSwitch() {
  if (App.user) return;
  let email = '';
  try { email = sessionStorage.getItem(PORTAL_EMAIL_KEY) || ''; } catch {}
  showLoginModal();
  if (email && document.getElementById('login-email')) document.getElementById('login-email').value = email;
  const pwd = document.getElementById('login-password'); if (pwd) pwd.focus();
}
