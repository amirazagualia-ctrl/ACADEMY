/* ============================================================
   F63 — Multi-établissements : sélecteur d'accueil, assistant de
   création (3 étapes, base Supabase propre), super-administration
   ============================================================ */

// ---------- Sélecteur d'établissement (page publique) ----------
let _tenantsList = null;
async function loadTenants() {
  if (_tenantsList) return _tenantsList;
  try { _tenantsList = (await api.get('/tenants')).data; } catch { _tenantsList = { items: [], registry: false, types: {}, presets: {} }; }
  return _tenantsList;
}
function tenantChipHtml() {
  const cur = TENANT.slug;
  const b = window.__BRAND__ || {};
  const status = b.tenant_status || 'active';
  return `<button type="button" onclick="showTenantPicker()" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs hover:bg-white/20" title="Changer d'établissement" id="tenant-chip">
    <i class="fas fa-building-columns"></i><span class="hidden sm:inline">${esc(b.name || brandName())}</span><span class="font-mono opacity-70">${esc(cur)}</span>${status !== 'active' ? `<span class="ml-1 px-1.5 rounded bg-amber-400 text-amber-950 font-bold">${status === 'pending' ? 'en attente' : 'suspendu'}</span>` : ''}<i class="fas fa-chevron-down text-[9px] opacity-70"></i>
  </button>`;
}
async function showTenantPicker() {
  openModal('<i class="fas fa-building-columns text-blue-600 mr-2"></i>Choisissez votre établissement', `<div class="text-center py-6 text-slate-400"><i class="fas fa-spinner fa-spin"></i></div>`);
  const d = await loadTenants();
  const items = d.items || [];
  const card = t => `<button type="button" onclick="switchTenant('${esc(t.slug)}')" class="w-full flex items-center gap-3 p-3 rounded-xl border ${t.slug === TENANT.slug ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'} text-left">
      <img src="${esc(t.logo_url || '/static/logo-rahma.png')}" class="w-11 h-11 rounded-lg object-contain bg-white border" alt="">
      <span class="min-w-0 flex-1"><span class="block font-semibold text-slate-800 truncate">${esc(t.name)}</span><span class="block text-xs text-slate-500">${esc((d.types || {})[t.type] || t.type || '')} · <span class="font-mono">${esc(t.slug)}</span></span></span>
      ${t.slug === TENANT.slug ? '<i class="fas fa-circle-check text-blue-600"></i>' : '<i class="fas fa-chevron-right text-slate-300"></i>'}
    </button>`;
  openModal('<i class="fas fa-building-columns text-blue-600 mr-2"></i>Choisissez votre établissement', `
    <p class="text-sm text-slate-500 mb-3">Chaque établissement dispose de son propre espace et de sa propre base de données. Sélectionnez le vôtre, saisissez son code, ou créez-en un nouveau.</p>
    <div class="relative mb-3"><i class="fas fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i><input id="tp-search" class="${inputCls} pl-9" placeholder="Rechercher un établissement…" oninput="tpFilter(this.value)"></div>
    <div id="tp-list" class="space-y-2 max-h-[45vh] overflow-y-auto pr-1">${items.map(card).join('') || emptyState('fa-building-columns', 'Aucun établissement public', '')}</div>
    <div class="mt-4 pt-3 border-t grid sm:grid-cols-2 gap-3">
      <form onsubmit="event.preventDefault(); const v=formVal('tp-code').toLowerCase(); if(v) tpGoCode(v)" class="flex gap-2"><input id="tp-code" class="${inputCls}" placeholder="Code de l'établissement (ex. lycee-ibn-khaldoun)" pattern="[a-z0-9-]{2,31}"><button class="${btnSecondary} whitespace-nowrap"><i class="fas fa-arrow-right"></i></button></form>
      <button type="button" onclick="closeModal(); showTenantWizard()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Créer un nouvel établissement</button>
    </div>
    ${!d.registry ? `<p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3"><i class="fas fa-triangle-exclamation mr-1"></i>Le registre des établissements n'est pas encore installé sur la base maître (migration <code>0019_tenants.sql</code>). Seul l'établissement par défaut est disponible.</p>` : ''}`, { wide: true });
  window._tpItems = items; window._tpCard = card;
}
function tpFilter(q) { q = (q || '').toLowerCase(); const el = document.getElementById('tp-list'); if (!el) return; const list = (window._tpItems || []).filter(t => !q || t.name.toLowerCase().includes(q) || t.slug.includes(q)); el.innerHTML = list.map(window._tpCard).join('') || emptyState('fa-filter-circle-xmark', 'Aucun résultat', 'Essayez le code exact ou créez votre établissement.'); }
async function tpGoCode(slug) {
  try { const t = (await api.get(`/tenants/${encodeURIComponent(slug)}`)).data; if (t.status === 'suspended') return toast('Cet établissement est suspendu', 'error'); switchTenant(t.slug); }
  catch (e) { toast(e.response?.status === 404 ? 'Aucun établissement avec ce code' : friendlyError(e), 'error'); }
}

// ---------- Assistant de création (3 étapes) ----------
const TW_STEPS = [['Identité', 'fa-building-columns'], ['Base de données', 'fa-database'], ['Administrateur', 'fa-user-shield']];
let TW = null;
function twSlugify(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31); }
async function showTenantWizard() {
  const d = await loadTenants();
  TW = { step: 0, types: d.types || {}, presets: d.presets || {}, typePreset: d.type_preset || {}, slugState: null, probe: null,
    data: { name: '', slug: '', type: 'ecole', country: 'TN', currency: 'DT', tagline: '', phone: '', address: '', levels_preset: 'tunisie', db_url: '', db_key: '', admin_name: '', admin_email: '', admin_password: '', admin_password2: '', is_public: true, accept: false }, errors: {} };
  twRender();
}
function twSet(k, v) {
  TW.data[k] = v; delete TW.errors[k];
  if (k === 'name' && !TW.slugTouched) { TW.data.slug = twSlugify(v); const el = document.getElementById('tw-slug'); if (el) el.value = TW.data.slug; twCheckSlug(); }
  if (k === 'slug') { TW.slugTouched = true; twCheckSlug(); }
  if (k === 'type') { TW.data.levels_preset = TW.typePreset[v] || 'tunisie'; const el = document.getElementById('tw-levels_preset'); if (el) el.value = TW.data.levels_preset; }
  if (k === 'db_url' || k === 'db_key') { TW.probe = null; const r = document.getElementById('tw-probe'); if (r) r.innerHTML = ''; }
  const e = document.getElementById(`tw-err-${k}`); if (e) e.remove();
}
let _twSlugT = null;
function twCheckSlug() {
  clearTimeout(_twSlugT); const el = document.getElementById('tw-slug-state'); if (el) el.innerHTML = '<i class="fas fa-spinner fa-spin text-slate-400"></i>';
  _twSlugT = setTimeout(async () => {
    const slug = TW.data.slug; if (!slug) { TW.slugState = null; if (el) el.innerHTML = ''; return; }
    try { const r = (await api.get(`/tenants/check/${encodeURIComponent(slug)}`)).data; TW.slugState = r; if (el) el.innerHTML = r.available ? '<span class="text-green-600"><i class="fas fa-circle-check mr-1"></i>Disponible</span>' : `<span class="text-red-600"><i class="fas fa-circle-xmark mr-1"></i>${esc(r.reason || 'Déjà utilisé')}</span>`; }
    catch { TW.slugState = null; if (el) el.innerHTML = ''; }
  }, 400);
}
function twValidate(step) {
  const d = TW.data, err = {};
  if (step === 0) { if (!d.name.trim()) err.name = "Le nom de l'établissement est obligatoire"; if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(d.slug)) err.slug = 'Code : 2 à 31 caractères (minuscules, chiffres, tirets)'; else if (TW.slugState && TW.slugState.available === false) err.slug = TW.slugState.reason || 'Code déjà utilisé'; }
  if (step === 1) { if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/.test(d.db_url.trim())) err.db_url = 'URL attendue : https://xxxx.supabase.co'; if (d.db_key.trim().length < 40) err.db_key = 'Collez la clé service_role complète'; if (!TW.probe || !TW.probe.ok) err.probe = 'Testez la connexion : la base doit être joignable et installée'; }
  if (step === 2) { if (!d.admin_name.trim()) err.admin_name = 'Votre nom est obligatoire'; if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.admin_email)) err.admin_email = 'E-mail invalide'; if (d.admin_password.length < 8) err.admin_password = '8 caractères minimum'; if (d.admin_password !== d.admin_password2) err.admin_password2 = 'Les deux mots de passe diffèrent'; if (!d.accept) err.accept = 'Veuillez accepter les conditions'; }
  TW.errors = err; return !Object.keys(err).length;
}
function twGo(dir) { if (dir > 0 && !twValidate(TW.step)) { twRender(); return; } TW.step = Math.max(0, Math.min(TW_STEPS.length, TW.step + dir)); twRender(); }
function twField(k, label, input, hint) { const e = TW.errors[k]; return `<div><label class="${lblCls}" for="tw-${k}">${label}</label>${input.replace('class="', `class="${e ? 'border-red-400 ' : ''}`)}${e ? `<p id="tw-err-${k}" class="text-xs text-red-600 mt-0.5" role="alert"><i class="fas fa-circle-exclamation mr-1"></i>${e}</p>` : hint ? `<p class="text-xs text-gray-400 mt-0.5">${hint}</p>` : ''}</div>`; }
async function twTestDb() {
  const btn = document.getElementById('tw-test'); const out = document.getElementById('tw-probe');
  if (!TW.data.db_url || !TW.data.db_key) return toast('Renseignez l\'URL et la clé', 'warning');
  setBusy(btn, true); out.innerHTML = '';
  try {
    const r = (await api.post('/tenants/test-db', { db_url: TW.data.db_url.trim(), db_key: TW.data.db_key.trim() })).data; TW.probe = r;
    out.innerHTML = r.ok ? `<div class="rounded-lg bg-green-50 border border-green-200 text-green-800 p-3 text-sm"><i class="fas fa-circle-check mr-1"></i>Connexion réussie — base installée et prête.${r.buckets_missing?.length ? `<br><span class="text-amber-700"><i class="fas fa-triangle-exclamation mr-1"></i>Buckets de stockage manquants : ${r.buckets_missing.join(', ')} (créés par le script d'installation ; sinon créez-les dans Storage, en accès public).</span>` : ''}</div>`
      : `<div class="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 text-sm"><i class="fas fa-triangle-exclamation mr-1"></i>Connexion OK mais la base n'est pas installée. Tables manquantes : <b>${r.missing.join(', ')}</b>.<br>Exécutez le <a href="/api/tenants/install.sql" class="underline font-semibold" download>script d'installation</a> dans Supabase → SQL Editor, puis re-testez.</div>`;
  } catch (e) { TW.probe = null; const d = (e.response?.data && typeof e.response.data === 'object') ? e.response.data : {}; const msg = d.error || (e.response && typeof e.response.data === 'string' ? 'Base injoignable : vérifiez l\'URL du projet (hôte introuvable ou projet en pause).' : friendlyError(e)); out.innerHTML = `<div class="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3 text-sm"><i class="fas fa-circle-xmark mr-1"></i>${esc(msg)}</div>`; }
  finally { setBusy(btn, false); delete TW.errors.probe; const pe = document.getElementById('tw-err-probe'); if (pe) pe.remove(); }
}
function twRender() {
  const d = TW.data, st = TW.step, last = TW_STEPS.length;
  const I = (k, type = 'text', extra = '') => `<input id="tw-${k}" type="${type}" value="${esc(String(d[k] ?? ''))}" class="${inputCls}" ${extra} oninput="twSet('${k}', this.value)">`;
  const progress = `<ol class="flex items-center gap-2 mb-5 text-xs" aria-label="Étapes">${TW_STEPS.map(([l, i], n) => `<li class="flex items-center gap-2 ${n < last - 1 ? 'flex-1' : ''}"><span class="flex items-center gap-2 ${n === st ? 'text-blue-700 font-bold' : n < st || st === last ? 'text-green-700' : 'text-slate-400'}"><span class="w-7 h-7 rounded-full flex items-center justify-center border-2 ${n === st ? 'border-blue-600 bg-blue-50' : n < st || st === last ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300'}">${n < st || st === last ? '<i class="fas fa-check"></i>' : n + 1}</span><span class="hidden sm:inline">${l}</span></span>${n < last - 1 ? `<span class="flex-1 h-0.5 ${n < st ? 'bg-green-500' : 'bg-slate-200'}"></span>` : ''}</li>`).join('')}</ol>`;
  let body = '';
  if (st === 0) body = `<div class="grid sm:grid-cols-2 gap-3">
    <div class="sm:col-span-2">${twField('name', "Nom de l'établissement *", I('name', 'text', 'placeholder="ex : Lycée Ibn Khaldoun" autofocus maxlength="120"'))}</div>
    ${twField('slug', 'Code / identifiant *', `<div class="flex items-center gap-2"><span class="text-slate-400 text-sm">/e/</span>${I('slug', 'text', 'placeholder="lycee-ibn-khaldoun" maxlength="31"')}<span id="tw-slug-state" class="text-xs whitespace-nowrap"></span></div>`, 'Servira dans le lien de connexion de vos utilisateurs')}
    <div><label class="${lblCls}">Type d'établissement</label><select id="tw-type" class="${inputCls}" onchange="twSet('type', this.value)">${Object.entries(TW.types).map(([k, v]) => `<option value="${k}" ${d.type === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    <div><label class="${lblCls}">Structure pédagogique</label><select id="tw-levels_preset" class="${inputCls}" onchange="twSet('levels_preset', this.value)">${Object.entries(TW.presets).map(([k, v]) => `<option value="${k}" ${d.levels_preset === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select><p class="text-xs text-gray-400 mt-0.5">Modifiable ensuite dans Paramètres → Établissement</p></div>
    ${twField('country', 'Pays (code)', I('country', 'text', 'maxlength="2" placeholder="TN"'))}
    ${twField('currency', 'Devise', I('currency', 'text', 'maxlength="8" placeholder="DT, €, MAD…"'))}
    ${twField('phone', 'Téléphone', I('phone', 'tel'))}
    <div class="sm:col-span-2">${twField('address', 'Adresse', I('address', 'text'))}</div>
    <div class="sm:col-span-2">${twField('tagline', 'Slogan (optionnel)', I('tagline', 'text', 'maxlength="120"'))}</div>
    <label class="sm:col-span-2 inline-flex items-center gap-2 text-sm"><input type="checkbox" ${d.is_public ? 'checked' : ''} onchange="twSet('is_public', this.checked)"> Afficher mon établissement dans la liste publique de la page d'accueil</label>
  </div>`;
  if (st === 1) body = `
    <div class="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 mb-4">
      <p class="font-bold mb-1"><i class="fas fa-shield-halved mr-1"></i>Votre établissement possède sa propre base de données</p>
      <ol class="list-decimal ml-5 space-y-1">
        <li>Créez un projet gratuit sur <a href="https://supabase.com" target="_blank" rel="noopener" class="underline font-semibold">supabase.com</a> (Nouveau projet → région proche → mot de passe fort).</li>
        <li>Dans <b>SQL Editor</b>, collez et exécutez le <a href="/api/tenants/install.sql" download class="underline font-semibold">script d'installation <i class="fas fa-download"></i></a> (tables, index, stockage).</li>
        <li>Dans <b>Project Settings → API</b>, copiez l'<b>URL du projet</b> et la clé <b>service_role</b> (jamais la clé anon).</li>
      </ol>
      <p class="text-xs mt-2 opacity-80"><i class="fas fa-lock mr-1"></i>La clé est chiffrée (AES-256) avant stockage et n'est jamais renvoyée au navigateur. Vous restez propriétaire de vos données.</p>
    </div>
    <div class="grid gap-3">
      ${twField('db_url', 'URL du projet Supabase *', I('db_url', 'url', 'placeholder="https://xxxxxxxx.supabase.co" autocomplete="off"'))}
      ${twField('db_key', 'Clé service_role *', `<textarea id="tw-db_key" rows="3" class="${inputCls} font-mono text-xs" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…" autocomplete="off" oninput="twSet('db_key', this.value)">${esc(d.db_key)}</textarea>`)}
      <div class="flex flex-wrap items-center gap-2"><button type="button" id="tw-test" onclick="twTestDb()" class="${btnSecondary}"><i class="fas fa-plug mr-1"></i> Tester la connexion</button>${TW.errors.probe ? `<span id="tw-err-probe" class="text-xs text-red-600" role="alert"><i class="fas fa-circle-exclamation mr-1"></i>${TW.errors.probe}</span>` : ''}</div>
      <div id="tw-probe">${TW.probe ? (TW.probe.ok ? '<div class="rounded-lg bg-green-50 border border-green-200 text-green-800 p-3 text-sm"><i class="fas fa-circle-check mr-1"></i>Connexion réussie — base installée et prête.</div>' : `<div class="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 text-sm">Tables manquantes : ${esc((TW.probe.missing || []).join(', '))}</div>`) : ''}</div>
    </div>`;
  if (st === 2) body = `<div class="grid sm:grid-cols-2 gap-3">
    ${twField('admin_name', 'Votre nom *', I('admin_name', 'text', 'autocomplete="name"'))}
    ${twField('admin_email', 'E-mail de connexion *', I('admin_email', 'email', 'autocomplete="email"'))}
    ${twField('admin_password', 'Mot de passe *', I('admin_password', 'password', 'autocomplete="new-password" minlength="8"'), '8 caractères minimum')}
    ${twField('admin_password2', 'Confirmer le mot de passe *', I('admin_password2', 'password', 'autocomplete="new-password"'))}
    <div class="sm:col-span-2 text-sm bg-slate-50 border rounded-xl p-3">
      <label class="inline-flex items-start gap-2"><input type="checkbox" ${d.accept ? 'checked' : ''} onchange="twSet('accept', this.checked)" class="mt-1"><span>Je certifie être habilité(e) à administrer <b>${esc(d.name || 'cet établissement')}</b> et j'accepte que la plateforme accède à la base de données fournie pour le compte de l'établissement.</span></label>
      ${TW.errors.accept ? `<p id="tw-err-accept" class="text-xs text-red-600 mt-1" role="alert">${TW.errors.accept}</p>` : ''}
    </div>
  </div>`;
  if (st === last) body = `<div class="text-center py-6"><div class="w-16 h-16 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center text-3xl mb-3"><i class="fas fa-check"></i></div><h3 class="text-lg font-bold text-slate-800">Établissement créé</h3><p class="text-sm text-slate-500 mt-1">${esc(TW.result?.pending ? "Votre espace est créé et sera activé après validation par l'administrateur de la plateforme. Vous pouvez déjà vous connecter pour préparer votre configuration." : 'Votre espace est actif.')}</p><div class="bg-slate-50 border rounded-lg p-3 mt-4 text-left text-sm"><p class="font-semibold text-slate-700 mb-1"><i class="fas fa-right-to-bracket mr-1"></i>Connexion de l'administrateur</p><p class="text-xs text-slate-500">Ouvrez le lien de votre établissement, puis connectez-vous avec <b>${esc(TW.result?.admin_email || d.admin_email)}</b> et le mot de passe défini à l'étape précédente.</p></div><p class="text-xs text-slate-400 mt-3">Lien de connexion de vos utilisateurs : <code class="bg-slate-100 px-1 rounded">${location.origin}/e/${esc(d.slug)}</code></p><a href="/e/${esc(d.slug)}" class="${btnPrimary} mt-4 inline-flex items-center justify-center"><i class="fas fa-building-columns mr-1"></i> Ouvrir l'espace</a></div>`;
  openModal(`<i class="fas fa-building-columns text-blue-600 mr-2"></i>Créer un établissement <span class="text-sm font-normal text-slate-400 ml-2">${st < last ? `Étape ${st + 1} / ${last}` : ''}</span>`, `
    ${progress}
    <form onsubmit="event.preventDefault(); ${st === last - 1 ? 'twSubmit()' : st < last ? 'twGo(1)' : ''}" novalidate>
      ${body}
      ${st < last ? `<div class="flex items-center justify-end gap-2 mt-5">
        ${st > 0 ? `<button type="button" onclick="twGo(-1)" class="${btnSecondary}"><i class="fas fa-arrow-left mr-1"></i> Précédent</button>` : `<button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button>`}
        <button type="submit" id="tw-next" class="${btnPrimary}">${st === last - 1 ? '<i class="fas fa-rocket mr-1"></i> Créer mon établissement' : 'Suivant <i class="fas fa-arrow-right ml-1"></i>'}</button>
      </div>` : ''}
    </form>`, { wide: true });
  if (st === 0 && d.slug) twCheckSlug();
}
async function twSubmit() {
  if (!twValidate(2)) { twRender(); return; }
  const btn = document.getElementById('tw-next'); setBusy(btn, true);
  try {
    const d = TW.data;
    const r = (await api.post('/tenants', { name: d.name.trim(), slug: d.slug, type: d.type, country: d.country, currency: d.currency, tagline: d.tagline, phone: d.phone, address: d.address, levels_preset: d.levels_preset, is_public: d.is_public, db_url: d.db_url.trim(), db_key: d.db_key.trim(), admin_name: d.admin_name.trim(), admin_email: d.admin_email.trim(), admin_password: d.admin_password })).data;
    TW.result = r; TW.step = TW_STEPS.length; _tenantsList = null; twRender();
  } catch (e) {
    setBusy(btn, false); const data = e.response?.data || {};
    if (data.probe) { TW.probe = data.probe; TW.step = 1; TW.errors.probe = data.error; twRender(); }
    toast(data.error || friendlyError(e), 'error');
  }
}
// L2 : plus de bascule de session par jeton — l'établissement s'ouvre puis on se connecte normalement.
function switchTenantWithToken(slug) { if (!slug) return; localStorage.setItem('edu_tenant', slug); document.cookie = `tenant=${slug}; path=/; max-age=31536000; SameSite=Lax`; location.href = `/e/${slug}`; }

// ---------- Super-administration (Paramètres → Établissements, admin de l'établissement par défaut) ----------
async function renderTenantsAdminTab(el) {
  el.innerHTML = skeletonPage();
  let r; try { r = (await api.get('/tenants/admin/list')).data; } catch (e) { el.innerHTML = emptyState('fa-triangle-exclamation', 'Accès refusé ou indisponible', friendlyError(e)); return; }
  if (!r.supported) { el.innerHTML = emptyState('fa-database', 'Registre des établissements non installé', 'Appliquez <code>migrations/0019_tenants.sql</code> sur la base maître (Supabase → SQL Editor), puis rechargez.', `<a href="/api/tenants/install.sql" download class="${btnSecondary}"><i class="fas fa-download mr-1"></i> Script d'installation (base établissement)</a>`); return; }
  const items = r.items || [];
  const badge = s => `<span class="badge ${s === 'active' ? 'badge-green' : s === 'pending' ? 'badge-yellow' : 'badge-red'}">${s === 'active' ? 'Actif' : s === 'pending' ? 'En attente' : 'Suspendu'}</span>`;
  const counts = { active: items.filter(t => t.status === 'active').length, pending: items.filter(t => t.status === 'pending').length, suspended: items.filter(t => t.status === 'suspended').length };
  el.innerHTML = `
  <div class="grid grid-cols-3 gap-3 mb-4">${[['Actifs', counts.active, 'green'], ['En attente', counts.pending, 'yellow'], ['Suspendus', counts.suspended, 'red']].map(([l, v, c]) => `<div class="bg-${c}-50 rounded-xl p-3 text-center"><div class="text-2xl font-bold text-${c}-700">${v}</div><div class="text-xs text-${c}-800">${l}</div></div>`).join('')}</div>
  <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <p class="text-sm text-slate-500"><i class="fas fa-circle-info mr-1"></i>Chaque établissement utilise sa propre base Supabase. Vous validez les demandes, pouvez suspendre un espace ou mettre à jour ses accès. Lien d'un établissement : <code>${location.origin}/e/&lt;code&gt;</code></p>
    <div class="flex gap-2"><a href="/api/tenants/install.sql" download class="${btnSecondary}"><i class="fas fa-download mr-1"></i> Script SQL établissement</a><button onclick="closeModal(); showTenantWizard()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Nouvel établissement</button></div>
  </div>
  ${items.length ? `<div class="bg-white rounded-xl shadow overflow-x-auto"><table class="data-table table-cards w-full">
    <thead><tr><th>Établissement</th><th>Code</th><th>Type</th><th>Administrateur</th><th>Base</th><th>Statut</th><th>Créé</th><th class="text-right">Actions</th></tr></thead>
    <tbody>${items.map(t => `<tr>
      <td data-label="Établissement"><div class="flex items-center gap-2">${t.logo_url ? `<img src="${esc(t.logo_url)}" class="w-8 h-8 rounded object-contain border" alt="">` : '<div class="w-8 h-8 rounded bg-slate-100 text-slate-400 flex items-center justify-center"><i class="fas fa-building-columns"></i></div>'}<div><div class="font-semibold">${esc(t.name)}</div>${t.custom_domain ? `<div class="text-xs text-slate-400">${esc(t.custom_domain)}</div>` : ''}${t.is_public === false ? '<div class="text-[10px] text-slate-400"><i class="fas fa-eye-slash mr-1"></i>non listé</div>' : ''}</div></div></td>
      <td data-label="Code"><a href="/e/${esc(t.slug)}" target="_blank" class="font-mono text-blue-600 hover:underline">${esc(t.slug)}</a></td>
      <td data-label="Type">${esc((_tenantsList?.types || {})[t.type] || t.type || '')}</td>
      <td data-label="Administrateur" class="text-xs">${esc(t.admin_name || '')}<br><span class="text-slate-500">${esc(t.admin_email || '')}</span></td>
      <td data-label="Base" class="text-xs"><span class="font-mono">${esc((t.db_url || '').replace(/^https:\/\//, '').replace(/\.supabase\.co$/, ''))}</span><br><span class="text-slate-400">clé …${esc(t.db_key_hint || '')}</span>${t.last_seen_at ? `<br><span class="text-green-600">vu ${fmtDT(t.last_seen_at)}</span>` : ''}</td>
      <td data-label="Statut">${badge(t.status)}</td>
      <td data-label="Créé" class="text-xs">${fmtDate(t.created_at)}</td>
      <td data-label="Actions" class="text-right whitespace-nowrap">
        ${t.status !== 'active' ? `<button onclick="tenantSetStatus(${t.id}, 'active', '${esc(t.name)}')" class="icon-btn text-green-600" title="Valider / activer"><i class="fas fa-circle-check"></i></button>` : `<button onclick="tenantSetStatus(${t.id}, 'suspended', '${esc(t.name)}')" class="icon-btn text-amber-600" title="Suspendre"><i class="fas fa-pause-circle"></i></button>`}
        <button onclick="tenantProbe(${t.id}, this)" class="icon-btn text-blue-600" title="Tester la connexion à sa base"><i class="fas fa-plug"></i></button>
        <button onclick="tenantEdit(${t.id})" class="icon-btn text-slate-600" title="Modifier"><i class="fas fa-pen"></i></button>
        <button onclick="tenantDelete(${t.id}, '${esc(t.name)}')" class="icon-btn text-slate-400 hover:text-red-600" title="Retirer du registre"><i class="fas fa-trash-can"></i></button>
      </td></tr>`).join('')}</tbody></table></div>`
  : emptyState('fa-building-columns', 'Aucun établissement enregistré', "Les futurs administrateurs créent leur établissement depuis la page d'accueil (« Choisir un établissement » → « Créer un nouvel établissement »). Vous validez ensuite ici.", `<button onclick="showTenantWizard()" class="${btnPrimary}"><i class="fas fa-plus mr-1"></i> Créer un établissement</button>`)}`;
  window._tenantsAdmin = items;
}
async function tenantSetStatus(id, status, name) {
  const labels = { active: ['Activer', 'fa-circle-check', 'bg-green-600 hover:bg-green-700'], suspended: ['Suspendre', 'fa-pause-circle', 'bg-amber-600 hover:bg-amber-700'] };
  confirmDelete(`${status === 'active' ? 'Activer' : 'Suspendre'} l'établissement <b>${name}</b> ?${status === 'suspended' ? '<br><span class="text-sm text-slate-500">Ses utilisateurs ne pourront plus se connecter jusqu\'à réactivation. Aucune donnée n\'est supprimée.</span>' : ''}`, async () => {
    try { await api.patch(`/tenants/admin/${id}`, { status }); toast('Statut mis à jour'); render(); } catch (e) { toast(friendlyError(e), 'error'); }
  }, { label: labels[status][0], icon: labels[status][1], color: labels[status][2], title: 'Établissement' });
}
async function tenantProbe(id, btn) {
  const ic = btn.querySelector('i'); ic.className = 'fas fa-spinner fa-spin';
  try { const r = (await api.post(`/tenants/admin/${id}/probe`)).data; toast(r.ok ? 'Base joignable et installée ✔' : r.reachable ? `Base joignable mais tables manquantes : ${r.missing.join(', ')}` : (r.error || 'Base injoignable'), r.ok ? 'success' : 'warning'); }
  catch (e) { toast(friendlyError(e), 'error'); } finally { ic.className = 'fas fa-plug'; }
}
function tenantEdit(id) {
  const t = (window._tenantsAdmin || []).find(x => x.id === id); if (!t) return;
  openModal(`<i class="fas fa-building-columns text-blue-600 mr-2"></i>${esc(t.name)}`, `
    <form onsubmit="tenantSave(event, ${id})" class="space-y-3">
      <div><label class="${lblCls}">Nom</label><input id="te-name" value="${esc(t.name)}" class="${inputCls}"></div>
      <div><label class="${lblCls}">Domaine personnalisé <span class="text-gray-400 font-normal">(optionnel, ex. ecole.mondomaine.tn)</span></label><input id="te-domain" value="${esc(t.custom_domain || '')}" class="${inputCls}" placeholder="sous-domaine ou domaine pointant vers la plateforme"></div>
      <label class="inline-flex items-center gap-2 text-sm"><input type="checkbox" id="te-public" ${t.is_public !== false ? 'checked' : ''}> Visible dans la liste publique</label>
      <div><label class="${lblCls}">Notes internes</label><textarea id="te-notes" rows="2" class="${inputCls}">${esc(t.notes || '')}</textarea></div>
      <details class="border rounded-lg p-3"><summary class="text-sm font-semibold cursor-pointer">Mettre à jour l'accès à la base (URL / clé)</summary>
        <div class="mt-2 space-y-2"><input id="te-dburl" value="${esc(t.db_url || '')}" class="${inputCls}" placeholder="https://xxxx.supabase.co"><textarea id="te-dbkey" rows="2" class="${inputCls} font-mono text-xs" placeholder="Nouvelle clé service_role (laisser vide pour conserver)"></textarea></div></details>
      <div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="${btnSecondary}">Annuler</button><button type="submit" class="${btnPrimary}"><i class="fas fa-save mr-1"></i> Enregistrer</button></div>
    </form>`, { wide: true });
}
async function tenantSave(e, id) {
  e.preventDefault(); const btn = e.submitter; setBusy(btn, true);
  try {
    const body = { name: formVal('te-name'), custom_domain: formVal('te-domain'), is_public: document.getElementById('te-public').checked, notes: formVal('te-notes') };
    const key = formVal('te-dbkey'); if (key) { body.db_key = key; body.db_url = formVal('te-dburl'); } else if (formVal('te-dburl')) body.db_url = formVal('te-dburl');
    await api.patch(`/tenants/admin/${id}`, body); closeModal(); toast('Établissement mis à jour'); render();
  } catch (err) { setBusy(btn, false); toast(err.response?.data?.error || friendlyError(err), 'error'); }
}
function tenantDelete(id, name) {
  confirmDelete(`Retirer <b>${name}</b> du registre ?<br><span class="text-sm text-slate-500">Sa base Supabase n'est pas touchée ; l'établissement pourra être ré-enregistré avec les mêmes accès.</span>`, async () => {
    try { await api.delete(`/tenants/admin/${id}`); toast('Établissement retiré du registre'); render(); } catch (e) { toast(friendlyError(e), 'error'); }
  }, { label: 'Retirer', icon: 'fa-trash-can', title: 'Registre des établissements' });
}
