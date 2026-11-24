// F75 : invitations — émission (super-admin) et acceptation (publique, par lien à usage unique).
//
//   POST /api/tenants/admin/invite        → émet un lien + envoie l'e-mail (super-admin)
//   GET  /api/invite/:token               → le lien est-il encore valable ? (public)
//   POST /api/invite/:token               → choisit le mot de passe / active le compte (public)
//   GET  /invitation/:token               → page autonome (aucune session, aucun JS d'application)
//
// Aucun mot de passe ne transite par e-mail. Voir src/lib/invite.ts pour les invariants.
import { Hono } from 'hono'
import { audit, superAdmin } from '../lib/auth'
import { getBrand } from '../lib/brand'
import { applyInvitation, buildInviteEmail, consumeInvitation, findInvitation, issueInvitation, releaseInvitation, validatePassword } from '../lib/invite'
import { sendEmail } from '../lib/notify'
import { loadTenant, tenantCtx } from '../lib/tenant'
import { clientIp, escapeHtml, publicOrigin, rateLimit, slugOk } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

const ROLES_FR: Record<string, string> = { admin: 'Administration', teacher: 'Enseignant', parent: 'Parent', student: 'Élève' }

// ---------------------------------------------------------------------------
// 1) Émission d'une invitation (super-admin de la plateforme)
// ---------------------------------------------------------------------------
app.post('/api/tenants/admin/invite', async (c) => {
  const su = await superAdmin(c); if (!su) return c.json({ error: 'Accès refusé' }, 403)
  const ip = clientIp(c)
  if (!rateLimit(`invite:${ip}`, 20, 3600_000).ok) return c.json({ error: 'Trop d’invitations envoyées depuis cette connexion. Réessayez dans une heure.' }, 429)
  const b = await c.req.json().catch(() => ({}))
  const tenant = String(b.tenant || '').trim().toLowerCase()
  if (!slugOk(tenant)) return c.json({ error: 'Établissement invalide.' }, 400)
  const tcfg = await loadTenant(c.env, tenant)
  if (!tcfg) return c.json({ error: 'Établissement introuvable.' }, 404)
  const email = String(b.email || '').trim().toLowerCase()
  const purpose = b.purpose === 'reset' ? 'reset' : 'invite'
  const brand = await tenantCtx.run(tcfg, () => getBrand(c.env))
  const iss = await issueInvitation(c.env, {
    tenant, email, role: b.role, name: b.name || null, purpose, createdBy: su.email || null, ip
  })
  if (!iss.ok || !iss.token) return c.json({ error: iss.error || 'Émission impossible.' }, 500)
  const url = `${publicOrigin(c)}/invitation/${iss.token}`
  const mail = buildInviteEmail({
    brandName: brand.name || 'Rahma Academy', brandColor: (brand as any).color_primary,
    inviteeName: b.name || null, email, tenantName: tcfg.name || tenant, url, purpose,
    invitedBy: su.email || null
  })
  const sent = await sendEmail(c.env, email, mail.subject, mail.html).catch(() => ({ sent: false, reason: 'network' }))
  await audit(c.env, c, su, 'tenant_invite', 'tenant_invitations', null, null, { tenant, email, role: b.role, purpose, sent: sent.sent })
  return c.json({
    ok: true,
    sent: sent.sent,
    // L'URL n'est renvoyée QUE si l'e-mail n'a pas pu partir : l'administrateur peut alors
    // la transmettre par un autre canal. Sinon, elle ne doit pas traîner dans l'historique.
    url: sent.sent ? null : url,
    reason: sent.sent ? undefined : (sent as any).reason,
    expires_days: 7
  })
})

// ---------------------------------------------------------------------------
// 2) Le lien est-il valable ? (public, aucune donnée sensible)
// ---------------------------------------------------------------------------
app.get('/api/invite/:token', async (c) => {
  const ip = clientIp(c)
  if (!rateLimit(`invite-read:${ip}`, 40, 600_000).ok) return c.json({ error: 'Trop de tentatives.' }, 429)
  const { row, usable, reason } = await findInvitation(c.env, c.req.param('token'))
  if (!usable || !row) {
    const msg = reason === 'expiré' ? 'Ce lien a expiré. Demandez-en un nouveau à votre établissement.'
      : reason === 'déjà utilisé' ? 'Ce lien a déjà servi. Connectez-vous avec votre mot de passe, ou demandez un nouveau lien.'
      : 'Ce lien est invalide.'
    return c.json({ valid: false, error: msg }, 410)
  }
  const tcfg = await loadTenant(c.env, row.tenant)
  const brand = tcfg ? await tenantCtx.run(tcfg, () => getBrand(c.env)) : null
  return c.json({
    valid: true,
    email: row.email,
    name: row.name,
    role: row.role,
    role_label: ROLES_FR[row.role] || row.role,
    purpose: row.purpose,
    tenant: { slug: row.tenant, name: tcfg?.name || brand?.name || row.tenant, logo_url: tcfg?.logo_url || null },
    expires_at: row.expires_at
  })
})

// ---------------------------------------------------------------------------
// 3) Acceptation : choix du mot de passe (public, lien à usage unique)
// ---------------------------------------------------------------------------
app.post('/api/invite/:token', async (c) => {
  const ip = clientIp(c)
  if (!rateLimit(`invite-accept:${ip}`, 10, 900_000).ok) return c.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, 429)
  const { row, usable, reason } = await findInvitation(c.env, c.req.param('token'))
  if (!usable || !row) {
    return c.json({ error: reason === 'expiré' ? 'Ce lien a expiré.' : reason === 'déjà utilisé' ? 'Ce lien a déjà servi.' : 'Ce lien est invalide.' }, 410)
  }
  const b = await c.req.json().catch(() => ({}))
  const v = validatePassword(b.password)
  if ('error' in v) return c.json({ error: v.error }, 400)
  if (String(b.password2 ?? v.value) !== v.value) return c.json({ error: 'Les deux mots de passe ne correspondent pas.' }, 400)

  const tcfg = await loadTenant(c.env, row.tenant)
  if (!tcfg) return c.json({ error: "L'établissement de cette invitation est introuvable." }, 404)

  // Consommation ATOMIQUE avant écriture : deux requêtes simultanées ne peuvent pas passer toutes les deux.
  const claimed = await consumeInvitation(c.env, row)
  if (!claimed) return c.json({ error: 'Ce lien vient d’être utilisé. Rechargez la page.' }, 409)

  const r = await applyInvitation(c.env, tcfg, row, v.value)
  if (!r.ok) {
    // Rien n'a été modifié : on rend le lien utilisable plutôt que d'obliger à en réémettre un.
    await releaseInvitation(c.env, row.id)
    return c.json({ error: r.error || 'Activation impossible.' }, 400)
  }
  await audit(c.env, c, { email: row.email, role: row.role }, row.purpose === 'reset' ? 'invite_reset' : 'invite_accept', 'user_accounts', r.userId ?? null, null, { tenant: row.tenant, created: !!r.created, ip })
  // Pas de session ouverte ici : l'utilisateur se connecte normalement, sur SON établissement.
  return c.json({ ok: true, created: !!r.created, login_url: `/e/${row.tenant}`, email: row.email })
})

// ---------------------------------------------------------------------------
// 4) Page autonome d'activation — volontairement sans dépendance à l'application
//    (elle doit fonctionner même si l'utilisateur n'a jamais chargé l'app).
// ---------------------------------------------------------------------------
const pageShell = (title: string, inner: string) => `<!DOCTYPE html><html lang="fr"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link href="/static/styles.css" rel="stylesheet">
</head><body class="brand-bg min-h-screen flex items-center justify-center p-4">
<main class="portal-card bg-white rounded-2xl shadow-2xl" id="invite-card">${inner}</main>
<script>${INVITE_CLIENT_JS}</script>
</body></html>`

const INVITE_CLIENT_JS = `
(function(){
  var token = decodeURIComponent((location.pathname.match(/\\/invitation\\/([^/?#]+)/) || [])[1] || '');
  var card = document.getElementById('invite-card');
  function fail(msg){
    card.innerHTML = '<div class="text-center py-2"><div class="w-12 h-12 mx-auto rounded-full bg-red-50 text-red-600 flex items-center justify-center text-xl mb-3"><i class="fas fa-circle-exclamation"></i></div><h1 class="text-lg font-extrabold text-slate-800">Lien inutilisable</h1><p class="text-sm text-slate-600 mt-2">'+msg+'</p><a href="/" class="portal-btn-ghost mt-4"><i class="fas fa-arrow-left mr-2"></i>Retour à l\\'accueil</a></div>';
  }
  function post(url, body){
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(function(r){ return r.json().then(function(d){ return { ok:r.ok, status:r.status, data:d }; }); });
  }
  fetch('/api/invite/'+encodeURIComponent(token)).then(function(r){ return r.json().then(function(d){ return {ok:r.ok,data:d}; }); }).then(function(res){
    var d = res.data || {};
    if (!res.ok || !d.valid) return fail(d.error || 'Ce lien est invalide.');
    var reset = d.purpose === 'reset';
    card.innerHTML = ''
      + '<div class="text-center mb-5">'
      + '<img src="'+(d.tenant && d.tenant.logo_url ? d.tenant.logo_url.replace(/"/g,'') : '/static/logo-rahma.png')+'" alt="" class="w-14 h-14 mx-auto object-contain mb-3" onerror="this.style.display=\\'none\\'">'
      + '<h1 class="text-lg font-extrabold text-slate-800 leading-tight">'+(reset ? 'Nouveau mot de passe' : 'Activez votre accès')+'</h1>'
      + '<p class="text-sm text-slate-500 mt-1">'+(d.tenant ? String(d.tenant.name).replace(/[<>&]/g,'') : '')+'</p>'
      + '</div>'
      + '<div class="flex items-center gap-2 mb-4 p-2 rounded-lg bg-slate-50 border border-slate-100">'
      + '<span class="w-8 h-8 rounded bg-white border border-slate-100 flex items-center justify-center text-slate-400"><i class="fas fa-envelope"></i></span>'
      + '<span class="min-w-0 flex-1"><span class="block text-sm font-semibold text-slate-800 break-all">'+String(d.email).replace(/[<>&]/g,'')+'</span><span class="block text-[11px] text-slate-500">'+(d.role_label || '')+'</span></span>'
      + '</div>'
      + '<form id="invite-form" novalidate>'
      + '<label class="block text-xs font-semibold text-gray-600 mb-1" for="pw">Mot de passe</label>'
      + '<input id="pw" type="password" autocomplete="new-password" class="portal-input" placeholder="8 caractères minimum">'
      + '<label class="block text-xs font-semibold text-gray-600 mb-1 mt-3" for="pw2">Confirmer</label>'
      + '<input id="pw2" type="password" autocomplete="new-password" class="portal-input" placeholder="Répétez le mot de passe">'
      + '<p class="text-[11px] text-slate-400 mt-2">Au moins 8 caractères, avec une lettre et un chiffre.</p>'
      + '<div id="invite-err" class="text-sm text-red-600 mt-2 hidden" role="alert"></div>'
      + '<button type="submit" id="invite-btn" class="portal-btn mt-3"><i class="fas fa-check mr-2"></i>'+(reset ? 'Enregistrer' : 'Activer mon accès')+'</button>'
      + '</form>'
      + '<p class="text-[11px] text-slate-400 text-center mt-3"><i class="fas fa-lock mr-1"></i>Ce lien ne fonctionne qu\\'une seule fois.</p>';
    document.getElementById('pw').focus();
    document.getElementById('invite-form').addEventListener('submit', function(e){
      e.preventDefault();
      var pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
      var err = document.getElementById('invite-err'), btn = document.getElementById('invite-btn');
      function show(m){ err.textContent = m; err.classList.remove('hidden'); }
      err.classList.add('hidden');
      if (pw.length < 8) return show('Le mot de passe doit contenir au moins 8 caractères.');
      if (pw !== pw2) return show('Les deux mots de passe ne correspondent pas.');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Activation…';
      post('/api/invite/'+encodeURIComponent(token), { password: pw, password2: pw2 }).then(function(r){
        if (!r.ok) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-2"></i>Réessayer'; return show(r.data.error || 'Activation impossible.'); }
        card.innerHTML = '<div class="text-center py-2">'
          + '<div class="w-14 h-14 mx-auto rounded-full bg-green-100 text-green-700 flex items-center justify-center text-2xl mb-3"><i class="fas fa-check"></i></div>'
          + '<h1 class="text-lg font-extrabold text-slate-800">'+(r.data.created ? 'Compte activé' : 'Mot de passe modifié')+'</h1>'
          + '<p class="text-sm text-slate-600 mt-2">Vous pouvez maintenant vous connecter avec <b>'+String(r.data.email).replace(/[<>&]/g,'')+'</b>.</p>'
          + '<a href="'+r.data.login_url+'" class="portal-btn mt-4"><i class="fas fa-right-to-bracket mr-2"></i>Se connecter</a></div>';
      }).catch(function(){ btn.disabled = false; btn.innerHTML = '<i class="fas fa-check mr-2"></i>Réessayer'; show('Réseau indisponible. Réessayez.'); });
    });
  }).catch(function(){ fail('Impossible de vérifier ce lien. Vérifiez votre connexion.'); });
})();
`

app.get('/invitation/:token', async (c) => {
  const token = c.req.param('token')
  if (!token || token.length < 20) return c.html(pageShell('Lien invalide', '<div class="text-center py-2"><h1 class="text-lg font-extrabold text-slate-800">Lien invalide</h1><p class="text-sm text-slate-600 mt-2">Ce lien est incomplet.</p><a href="/" class="portal-btn-ghost mt-4">Retour</a></div>'), 400)
  return c.html(pageShell('Activation de votre accès', '<div class="text-center py-6 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl"></i></div>'))
})

export default app
