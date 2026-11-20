// Routes pages
// Extrait de src/index.tsx (Palier 2) — comportement et URLs inchangés.
import { Hono } from 'hono'
import { getBrand } from '../lib/brand'
import type { Brand } from '../lib/brand'
import { receiptToken } from '../lib/notifications'
import { getSettings, sb } from '../lib/supabase'
import { currentTenant, loadTenant, resolveTenant, tenantCtx, tenantSlug } from '../lib/tenant'
import { escapeHtml, slugOk } from '../lib/utils'
import type { Bindings } from '../types/bindings'

const app = new Hono<{ Bindings: Bindings }>()

// ---------- Page principale ----------
// F62 : la page principale est rendue avec l'identité de l'établissement (titre, couleurs, favicon, données de marque injectées)
const mainPageFor = (b: Brand) => `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(b.name)} - ${escapeHtml(b.tagline)}</title>
  <meta name="description" content="${escapeHtml(b.name)} : élèves, présence, notes, bulletins, frais, cours et notifications.">
  <meta name="theme-color" content="${b.color_dark}">
  <script>window.__BRAND__ = ${JSON.stringify({ ...b, tenant_slug: tenantSlug(), tenant_status: currentTenant()?.status || 'active', tenant_default: !currentTenant() || currentTenant()!.isDefault }).replace(/</g, '\\u003c')};</script>
  <style>:root{--brand-primary:${b.color_primary};--brand-accent:${b.color_accent};--brand-dark:${b.color_dark};--rz-primary:${b.color_primary};--rz-accent:${b.color_accent}}</style>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" sizes="180x180" href="${escapeHtml(b.apple_touch_url || b.icon_192_url || b.logo_url)}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="application-name" content="${escapeHtml(b.short_name || b.name)}">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(b.short_name || b.name)}">
  <link rel="icon" type="image/png" sizes="192x192" href="${escapeHtml(b.icon_192_url || b.favicon_url || b.logo_url)}">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Kufi+Arabic:wght@400;600;700&display=swap" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
</head>
<body class="bg-gray-100">
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <script src="/static/app.js"></script>
  <script src="/static/public.js"></script>
  <script src="/static/views-core.js"></script>
  <script src="/static/pdf-fonts.js"></script>
  <script src="/static/views-academic.js"></script>
  <script src="/static/views-notebook.js"></script>
  <script src="/static/views-timetable.js"></script>
  <script src="/static/views-homework.js"></script>
  <script src="/static/views-certificates.js"></script>
  <script src="/static/views-import.js"></script>
  <script src="/static/views-progress.js"></script>
  <script src="/static/views-ai.js"></script>
  <script src="/static/views-eva-i18n.js"></script>
  <script src="/static/views-eva-editor.js"></script>
  <script src="/static/views-evaluations.js"></script>
  <script src="/static/views-bank.js"></script>
  <script src="/static/views-curriculum.js"></script>
  <script src="/static/views-tenants.js"></script>
  <script src="/static/views-tutor.js"></script>
  <script src="/static/situations-data-1.js"></script>
  <script src="/static/situations-data-2.js"></script>
  <script src="/static/situations-data-3.js"></script>
  <script src="/static/views-situations.js"></script>
  <script src="/static/views-math6.js"></script>
  <script src="/static/exercises-ar-data.js"></script>
  <script src="/static/views-exercises-ar.js"></script>
  <script src="/static/theme-palettes.js"></script>
  <script src="/static/views-rafiq-teacher.js"></script>
  <script src="/static/views-rafiq-catalog.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"></script>
  <script src="/static/views-admin.js"></script>
  <script src="/static/views-chat.js"></script>
</body>
</html>`

// Pages HTML : la marque affichée est celle de l'établissement résolu (cookie / /e/<slug>) ; /e/<slug> fixe le cookie
async function brandedPage(c: any) {
  const t = await resolveTenant(c)
  return tenantCtx.run(t, async () => c.html(mainPageFor(await getBrand(c.env))))
}
app.get('/', brandedPage)
app.get('/e/:slug', async (c) => {
  const slug = c.req.param('slug')
  if (!slugOk(slug)) return c.redirect('/')
  const t = await loadTenant(c.env, slug)
  if (!t) return c.html(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Établissement introuvable</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 min-h-screen flex items-center justify-center p-6"><main class="bg-white rounded-2xl shadow p-8 max-w-md text-center"><p class="text-5xl mb-3">🏫</p><h1 class="text-xl font-bold text-slate-800 mb-2">Établissement introuvable</h1><p class="text-sm text-slate-500 mb-5">Aucun établissement ne correspond à « ${escapeHtml(slug)} ». Vérifiez le lien fourni par votre école.</p><a href="/" class="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">Choisir un établissement</a></main></body></html>`, 404)
  c.header('Set-Cookie', `tenant=${t.slug}; Path=/; Max-Age=31536000; SameSite=Lax`)
  return tenantCtx.run(t, async () => c.html(mainPageFor(await getBrand(c.env))))
})
// Accès rapide via QR Code : ouvre directement le formulaire d'inscription élève
app.get('/inscription', brandedPage)

// ---------- Quittance publique (lien sécurisé par token, sans connexion) ----------
app.get('/api/public/receipt/:id', async (c) => {
  const id = c.req.param('id')
  const t = c.req.query('t') || ''
  if (!/^\d+$/.test(id) || t !== await receiptToken(c.env, id)) return c.json({ error: 'Lien invalide' }, 403)
  const r = await sb(c.env, `fees?id=eq.${id}&select=*,students(first_name,last_name,level,class_name,parent_name)`)
  const fee = r.data?.[0]
  if (!fee) return c.json({ error: 'Quittance introuvable' }, 404)
  if (fee.status !== 'paid') return c.json({ error: 'Ce frais n\'est pas encore payé' }, 400)
  const school = await getSettings(c.env, 'school')
  return c.json({ fee, school })
})

// F60 : page publique d'authentification d'un document (code imprimé en pied de page ou fichier à vérifier)
// F61 : page d'aide rapide (accessible depuis la barre supérieure)
app.get('/aide', async (c) => { const B = await tenantCtx.run(await resolveTenant(c), () => getBrand(c.env)); return c.html(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Aide — ${escapeHtml(B.name)}</title><script src="https://cdn.tailwindcss.com"></script><link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"></head>
<body class="bg-slate-50 min-h-screen"><main class="max-w-3xl mx-auto p-6">
<header class="flex items-center gap-3 mb-6"><img src="${B.logo_url}" class="w-14 h-14 object-contain" alt="${escapeHtml(B.name)}"><div><h1 class="text-2xl font-black text-blue-950">Centre d'aide</h1><p class="text-sm text-slate-500" dir="rtl">مركز المساعدة</p></div></header>
<section class="grid md:grid-cols-2 gap-4 text-sm">
${[['fa-house','Navigation','Le menu de gauche est regroupé par familles (Accueil, Élèves, Pédagogie, Suivi, Communication, Administration). Le bouton ☰ en haut le réduit en icônes. Sur mobile, la barre du bas donne accès aux 5 écrans essentiels.'],
['fa-magnifying-glass','Recherche globale','Cliquez sur « Rechercher… » ou appuyez sur <kbd class="border rounded px-1 bg-white">Ctrl</kbd> + <kbd class="border rounded px-1 bg-white">K</kbd> pour trouver un élève, un enseignant, une classe, un cours ou une inscription.'],
['fa-plus','Bouton Ajouter','En haut à droite, le bouton « + » propose l\'action principale de la page (ajouter un élève, une note, un cours…).'],
['fa-user-lock','Périmètre enseignant','Un enseignant ne note et n\'observe que sa matière et ses élèves affectés par l\'administration (fiche enseignant → Matières / Élèves).'],
['fa-shield-halved','Documents sécurisés','Chaque fichier déposé est filigrané (logo, auteur, ©) et reçoit un code d\'authentification vérifiable sur <a href="/verifier" class="text-blue-700 underline">/verifier</a>.'],
['fa-trash-can','Corbeille','Les suppressions sont réversibles pendant 30 jours : Paramètres → Corbeille → Restaurer.'],
['fa-calendar-check','Année scolaire','Changez d\'année depuis le menu utilisateur (avatar en haut à droite). Une année clôturée est en lecture seule.'],
['fa-envelope','Support','Un problème ? Écrivez à l\'administration de l\'école ou utilisez Discussions dans l\'application.']].map(([i,t,d]) => `<article class="bg-white rounded-xl border border-slate-200 p-4"><h2 class="font-bold text-slate-800 mb-1"><i class="fas ${i} text-blue-600 mr-2"></i>${t}</h2><p class="text-slate-600">${d}</p></article>`).join('')}
</section><p class="text-center text-xs text-slate-400 mt-8"><a href="/" class="underline">← Retour à l'application</a></p></main></body></html>`) })
app.get('/verifier/:code?', async (c) => { const B = await tenantCtx.run(await resolveTenant(c), () => getBrand(c.env)); return c.html(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Vérifier un document — ${escapeHtml(B.name)}</title><script src="https://cdn.tailwindcss.com"></script><link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"></head>
<body class="bg-gradient-to-br from-blue-50 to-white min-h-screen"><main class="max-w-xl mx-auto p-6">
<header class="text-center mb-6"><img src="${B.logo_url}" alt="${escapeHtml(B.name)}" class="w-20 h-20 mx-auto mb-2 object-contain"><h1 class="text-2xl font-black text-blue-900">Authentification de document</h1><p class="text-sm text-gray-500" dir="rtl">التحقق من أصالة الوثيقة</p></header>
<section class="bg-white rounded-2xl shadow p-5 space-y-3">
  <label class="block text-xs font-bold text-gray-500 uppercase">Code imprimé sur le document</label>
  <div class="flex gap-2"><input id="code" class="flex-1 border rounded-lg px-3 py-2 font-mono tracking-widest uppercase" placeholder="XXXX-XXXX-XXXX" value="${(c.req.param('code') || '').replace(/[^A-Za-z0-9-]/g, '')}"><button onclick="check()" class="px-4 py-2 rounded-lg bg-blue-700 text-white font-bold"><i class="fas fa-magnifying-glass"></i></button></div>
  <p class="text-center text-xs text-gray-400">— ou —</p>
  <label class="block text-xs font-bold text-gray-500 uppercase">Vérifier un fichier (empreinte SHA-256 calculée dans votre navigateur, rien n'est envoyé)</label>
  <input type="file" id="file" class="text-sm" onchange="checkFile(this.files[0])">
  <div id="res" class="pt-2"></div>
</section>
<p class="text-center text-[11px] text-gray-400 mt-6">© ${escapeHtml(B.name)} — Tous les documents publiés sont filigranés, horodatés et enregistrés dans un registre d'authenticité. Toute reproduction sans autorisation est interdite.</p></main>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
async function show(q) {
  const res = document.getElementById('res'); res.innerHTML = '<p class="text-sm text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>Vérification…</p>';
  try { const d = await fetch('/api/public/verify/' + encodeURIComponent(q)).then(r => r.json());
    if (d.error) { res.innerHTML = '<div class="rounded-xl border border-amber-300 bg-amber-50 text-amber-800 p-3 text-sm">' + esc(d.error) + '</div>'; return; }
    if (!d.valid) { res.innerHTML = '<div class="rounded-xl border-2 border-red-300 bg-red-50 text-red-800 p-4"><p class="font-black text-lg"><i class="fas fa-circle-xmark mr-1"></i>Document NON reconnu</p><p class="text-sm">Aucun document correspondant dans le registre de ${escapeHtml(B.name)}. Le document peut avoir été modifié, falsifié ou ne pas provenir de notre établissement.</p></div>'; return; }
    res.innerHTML = '<div class="rounded-xl border-2 border-green-300 bg-green-50 text-green-900 p-4 space-y-1 text-sm"><p class="font-black text-lg"><i class="fas fa-circle-check mr-1"></i>Document authentique</p>' +
      '<p><b>Code :</b> <span class="font-mono">' + esc(d.code) + '</span></p><p><b>Fichier :</b> ' + esc(d.filename) + ' (' + Math.round((d.size_bytes||0)/1024) + ' Ko)</p>' +
      '<p><b>Auteur / propriétaire :</b> ' + esc(d.owner_name) + '</p><p><b>Publié le :</b> ' + new Date(d.created_at).toLocaleString('fr-FR') + (d.school_year ? ' · année ' + esc(d.school_year) : '') + '</p>' +
      '<p><b>Filigrane :</b> ' + (d.watermarked ? 'appliqué ✓' : 'non appliqué') + '</p><p><b>Licence :</b> ' + esc(d.license) + '</p>' +
      '<p class="text-[11px] text-green-800/70 break-all"><b>SHA-256 :</b> ' + esc(d.sha256) + '</p></div>';
  } catch (e) { res.innerHTML = '<p class="text-sm text-red-600">Erreur réseau.</p>'; }
}
function check() { const v = document.getElementById('code').value.trim().toUpperCase(); if (v) show(v); }
async function checkFile(f) { if (!f) return; const h = await crypto.subtle.digest('SHA-256', await f.arrayBuffer()); show([...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('')); }
if (document.getElementById('code').value) check();
</script></body></html>`) })

app.get('/quittance/:id', async (c) => { const B = await tenantCtx.run(await resolveTenant(c), () => getBrand(c.env)); return c.html(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quittance de paiement — ${escapeHtml(B.name)}</title>
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/dayjs@1.11.10/dayjs.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <img src="${B.logo_url}" alt="${escapeHtml(B.name)}" class="w-28 h-28 mx-auto mb-4 object-contain">
    <h1 class="text-xl font-bold mb-1" style="color:${B.color_primary}">${escapeHtml(B.name)}</h1>
    <p class="text-gray-500 text-sm mb-6">Quittance de paiement</p>
    <div id="info" class="text-left text-sm bg-blue-50 rounded-lg p-4 mb-6 hidden"></div>
    <div id="status" class="text-gray-600 mb-4">Chargement…</div>
    <button id="dl-btn" onclick="genPDF()" class="hidden w-full bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-xl transition">
      📄 Télécharger la quittance (PDF)
    </button>
  </main>
  <script src="/static/pdf-fonts.js"></script>
  <script>window.__BRAND__ = ${JSON.stringify(B).replace(/</g, '\\u003c')};</script>
  <script src="/static/receipt-public.js"></script>
</body>
</html>`) })

app.get('/paiement/retour', async (c) => { const B = await tenantCtx.run(await resolveTenant(c), () => getBrand(c.env)); return c.html(`<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Paiement — ${escapeHtml(B.name)}</title>
<link rel="icon" type="image/png" href="/static/icons/favicon.png"><script src="https://cdn.tailwindcss.com"></script><link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet"></head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4"><main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
<img src="${B.logo_url}" class="w-24 h-24 mx-auto mb-3 object-contain" alt=""><h1 class="text-xl font-bold mb-1" style="color:${B.color_primary}">${escapeHtml(B.name)}</h1><p class="text-gray-500 text-sm mb-5">Paiement en ligne</p>
<div id="st" class="text-gray-600"><i class="fas fa-spinner fa-spin mr-1"></i>Vérification du paiement…</div>
<a href="/" class="inline-block mt-6 bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-xl">Retour à mon espace</a></main>
<script>(async()=>{const q=new URLSearchParams(location.search);const el=document.getElementById('st');const tok=localStorage.getItem('edu_token');const ref=q.get('payment_ref');
try{if(!tok){el.innerHTML=q.get('ok')==='1'?'<div class="bg-green-50 border border-green-300 text-green-800 rounded-xl p-4"><i class="fas fa-circle-check text-3xl mb-2"></i><br><b>Paiement transmis</b><br><span class="text-sm">Connectez-vous pour voir la quittance.</span></div>':'<div class="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4"><b>Paiement non finalisé</b></div>';return;}
const r=await fetch('/api/payments/verify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify({payment_ref:ref||undefined,fee_id:q.get('fee')})});const d=await r.json();
if(d.status==='completed')el.innerHTML='<div class="bg-green-50 border border-green-300 text-green-800 rounded-xl p-4"><i class="fas fa-circle-check text-3xl mb-2"></i><br><b>Paiement confirmé ✅</b><br><span class="text-sm">Le frais est marqué payé. La quittance est disponible dans <b>Frais</b>.</span></div>';
else if(d.status==='pending')el.innerHTML='<div class="bg-blue-50 border border-blue-300 text-blue-800 rounded-xl p-4"><i class="fas fa-hourglass-half text-3xl mb-2"></i><br><b>Paiement en cours de confirmation</b><br><span class="text-sm">Il sera validé automatiquement dans quelques instants.</span></div>';
else el.innerHTML='<div class="bg-red-50 border border-red-300 text-red-700 rounded-xl p-4"><i class="fas fa-circle-xmark text-3xl mb-2"></i><br><b>Paiement non abouti</b><br><span class="text-sm">'+(d.error||d.status||'')+' — vous pouvez réessayer depuis <b>Frais</b>.</span></div>';}catch(e){el.textContent='Erreur de vérification';}})();</script></body></html>`) })

app.get('/verifier/:number', async (c) => { const B = await tenantCtx.run(await resolveTenant(c), () => getBrand(c.env)); return c.html(`<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vérification de document — ${escapeHtml(B.name)}</title>
  <link rel="icon" type="image/png" href="/static/icons/favicon.png">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-100 min-h-screen flex items-center justify-center p-4">
  <main class="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
    <img src="${B.logo_url}" alt="${escapeHtml(B.name)}" class="w-24 h-24 mx-auto mb-3 object-contain">
    <h1 class="text-xl font-bold mb-1" style="color:${B.color_primary}">${escapeHtml(B.name)}</h1>
    <p class="text-gray-500 text-sm mb-5">Vérification d\u2019authenticité de document · التحقق من صحة الوثيقة</p>
    <div id="status" class="text-gray-600">Vérification en cours…</div>
  </main>
  <script>
    (async () => {
      const el = document.getElementById('status');
      const number = location.pathname.split('/').pop(); const t = new URLSearchParams(location.search).get('t') || '';
      try {
        const r = await fetch('/api/public/verify/' + encodeURIComponent(number) + '?t=' + encodeURIComponent(t)); const d = await r.json();
        const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
        if (!r.ok) { el.innerHTML = '<div class="bg-red-50 border border-red-300 text-red-700 rounded-xl p-4"><i class="fas fa-circle-xmark text-3xl mb-2"></i><br><b>Document non reconnu</b><br><span class="text-sm">' + esc(d.error || '') + '</span></div>'; return; }
        const ok = d.valid;
        el.innerHTML = '<div class="' + (ok ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-800') + ' border rounded-xl p-4 mb-4"><i class="fas ' + (ok ? 'fa-circle-check' : 'fa-triangle-exclamation') + ' text-3xl mb-2"></i><br><b>' + (ok ? 'Document authentique' : 'Document révoqué') + '</b>' + (ok ? '' : '<br><span class="text-sm">' + esc(d.revoked_reason || '') + '</span>') + '</div>'
          + '<div class="text-left text-sm bg-blue-50 rounded-lg p-4 space-y-1">'
          + '<div><span class="text-gray-500">Document :</span> <b>' + esc(d.title) + '</b></div>'
          + '<div><span class="text-gray-500">N° :</span> <b>' + esc(d.number) + '</b></div>'
          + '<div><span class="text-gray-500">Élève :</span> <b>' + esc(d.student) + '</b> — ' + esc(d.level) + '</div>'
          + '<div><span class="text-gray-500">Année scolaire :</span> ' + esc(d.school_year) + '</div>'
          + '<div><span class="text-gray-500">Délivré le :</span> ' + new Date(d.issued_at).toLocaleDateString('fr-FR') + (d.issued_by ? ' par ' + esc(d.issued_by) : '') + '</div>'
          + '<div class="text-[10px] text-gray-400 break-all pt-1">Empreinte ' + esc(d.fingerprint) + '</div></div>'
          + '<p class="text-xs text-gray-400 mt-4">Comparez ces informations avec le document papier. En cas de doute, contactez l\u2019établissement.</p>';
      } catch (e) { el.innerHTML = '<span class="text-red-600">Erreur de vérification</span>'; }
    })();
  </script>
</body>
</html>`) })

export default app
