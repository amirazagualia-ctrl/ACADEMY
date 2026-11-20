/* ============================================================
   Rahma Academy — theme-palettes.js
   F67 — Palettes de couleurs « élargies » : à côté des 3 couleurs
   libres de l'établissement (Paramètres → Établissement), on propose
   des palettes prêtes à l'emploi, dont celle de رفيق المعلم
   (turquoise / menthe) et plusieurs autres familles.

   Principe
   --------
   - `BRAND.color_palette` = palette par défaut de l'établissement
     (choisie par l'administrateur, appliquée aux visiteurs).
   - `localStorage.ui_palette` = choix personnel de l'utilisateur qui
     écrase la palette de l'établissement (vidé = couleurs de l'école).
   - applyBrandTheme() (app.js) lit ces deux sources et injecte
     --brand-primary / --brand-accent / --brand-dark / --rz-royal.

   Aucune dépendance : simple script chargé après app.js.
   ============================================================ */
(function (w) {
  'use strict'

  var P = {
    rahma: {
      fr: 'Rahma Academy', ar: 'أكاديمية الرحمة', hint: 'bleu royal · doré',
      primary: '#1d4ed8', accent: '#f59e0b', dark: '#000612'
    },
    rafiq: {
      fr: 'Rafiq — turquoise', ar: 'رفيق المعلم', hint: 'تركواز · نعناع',
      primary: '#0f766e', accent: '#14b8a6', dark: '#07231f'
    },
    lagoon: {
      fr: 'Lagon', ar: 'لون البحيرة', hint: 'turquoise clair · sable',
      primary: '#0e7490', accent: '#22d3ee', dark: '#062a33'
    },
    mint: {
      fr: 'Menthe', ar: 'نعناع', hint: 'vert menthe · citron',
      primary: '#047857', accent: '#34d399', dark: '#04241b'
    },
    ocean: {
      fr: 'Océan', ar: 'المحيط', hint: 'bleu profond · ciel',
      primary: '#0369a1', accent: '#38bdf8', dark: '#082f49'
    },
    violet: {
      fr: 'Violet pédagogique', ar: 'بنفسجي', hint: 'violet · lavande',
      primary: '#6d28d9', accent: '#a78bfa', dark: '#1e1b4b'
    },
    rose: {
      fr: 'Rose', ar: 'وردي', hint: 'rose · corail',
      primary: '#be123c', accent: '#fb7185', dark: '#4c0519'
    },
    amber: {
      fr: 'Ambre', ar: 'عنبري', hint: 'ambre · or',
      primary: '#b45309', accent: '#fbbf24', dark: '#1c1207'
    },
    forest: {
      fr: 'Forêt', ar: 'غابة', hint: 'vert forêt · lime',
      primary: '#15803d', accent: '#84cc16', dark: '#052e16'
    },
    slate: {
      fr: 'Ardoise', ar: 'أردوازي', hint: 'gris bleu · acier',
      primary: '#334155', accent: '#94a3b8', dark: '#0b1220'
    }
  }

  function get(k) { return P[k] || null }
  function keys() { return Object.keys(P) }
  function brandDefault() {
    try { return (w.BRAND && w.BRAND.color_palette) || 'rahma' } catch (e) { return 'rahma' }
  }
  // Palette effective : choix personnel sinon palette de l'établissement.
  function current() {
    var own = null
    try { own = localStorage.getItem('ui_palette') } catch (e) {}
    var k = own || brandDefault()
    return P[k] ? k : 'rahma'
  }
  // Applique une palette : 'brand' (ou '') = retour aux couleurs de l'école.
  function set(k, opts) {
    opts = opts || {}
    try {
      if (!k || k === 'brand') localStorage.removeItem('ui_palette')
      else localStorage.setItem('ui_palette', k)
    } catch (e) {}
    if (typeof applyBrandTheme === 'function') applyBrandTheme()
    if (typeof applyTheme === 'function') applyTheme()
    if (!opts.silent && typeof toast === 'function') {
      var p = P[k]
      toast(p ? '<i class="fas fa-palette mr-1"></i> ' + p.ar + ' · ' + p.fr : '<i class="fas fa-rotate-left mr-1"></i> Couleurs de l\u2019établissement', 'info')
    }
    if (opts.rerender !== false && typeof render === 'function' && w.App && w.App.user) render()
  }

  function swatch(k) {
    var p = P[k]
    if (!p) return ''
    var on = current() === k
    return '<button type="button" onclick="setPalette(\'' + k + '\')" class="pal-card' + (on ? ' pal-on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="pal-bar" style="background:linear-gradient(135deg,' + p.dark + ',' + p.primary + ' 55%,' + p.accent + ')"></span>' +
      '<span class="min-w-0 text-right"><span class="block text-sm font-bold text-slate-800 truncate">' + p.ar + '</span>' +
      '<span class="block text-[11px] text-slate-500 truncate">' + p.fr + ' · ' + p.hint + '</span></span>' +
      (on ? '<i class="fas fa-circle-check text-teal-600 text-xs"></i>' : '') + '</button>'
  }

  function picker() {
    if (typeof openModal !== 'function') return
    var own = null
    try { own = localStorage.getItem('ui_palette') } catch (e) {}
    var brand = brandDefault()
    var bp = P[brand] || P.rahma
    var followsBrand = !own
    var head = '<p class="text-sm text-slate-600 mb-3" dir="rtl">اختر لون المنصة الذي يناسبك — <span class="text-slate-400">le choix est personnel, enregistré sur cet appareil.</span></p>' +
      '<button type="button" onclick="setPalette(\'brand\'); closeModal()" class="pal-card w-full mb-3' + (followsBrand ? ' pal-on' : '') + '">' +
      '<span class="pal-bar" style="background:linear-gradient(135deg,' + bp.dark + ',' + bp.primary + ' 55%,' + bp.accent + ')"></span>' +
      '<span class="min-w-0 text-right"><span class="block text-sm font-bold text-slate-800">Couleurs de l\u2019établissement</span>' +
      '<span class="block text-[11px] text-slate-500">ألوان المؤسسة — ' + bp.ar + ' · ' + bp.fr + '</span></span>' +
      (followsBrand ? '<i class="fas fa-circle-check text-teal-600 text-xs"></i>' : '') + '</button>'
    var grid = '<div class="grid sm:grid-cols-2 gap-2" dir="rtl">' + keys().map(function (k) {
      return '<div onclick="setPalette(\'' + k + '\'); closeModal()">' + swatch(k) + '</div>'
    }).join('') + '</div>' +
      '<p class="text-[11px] text-slate-400 mt-3"><i class="fas fa-circle-info mr-1"></i>Le mode clair / sombre reste indépendant (bouton ☀️ / 🌙 de la barre du haut).</p>'
    openModal('<i class="fas fa-palette text-teal-600 mr-2"></i>Palettes de couleurs', head + grid)
  }

  w.THEME_PALETTES = P
  w.paletteGet = get
  w.paletteKeys = keys
  w.paletteCurrent = current
  w.paletteBrandDefault = brandDefault
  w.setPalette = set
  w.openPalettePicker = picker

  // Le script est chargé après app.js : on réapplique la palette choisie dès l'arrivée.
  try { if (typeof applyBrandTheme === 'function') applyBrandTheme(); } catch (e) {}
})(window)
