// F76 : tests du runtime de délégation (public/static/delegation.js).
//
// Le fichier est un script navigateur (IIFE, aucune exportation). On l'évalue donc dans
// un contexte `node:vm` isolé, avec un faux `document` minimal. On teste le COMPORTEMENT
// réel (dispatch, preventDefault, arguments, repli d'image) et non une réécriture.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(join(ROOT, 'public/static/delegation.js'), 'utf8')

/** Élément minimal : attributs, parent, closest sur [data-act]. */
function makeEl(tag, attrs = {}, parent = null) {
  const a = { ...attrs }
  return {
    tagName: tag,
    style: {},
    parentNode: parent,
    getAttribute: k => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v) },
    closest(sel) {
      if (sel !== '[data-act]') return null
      let e = this
      while (e) {
        if (e.getAttribute('data-act')) return e
        e = e.parentNode
      }
      return null
    }
  }
}

/** Charge le script dans un contexte neuf et renvoie les outils de pilotage. */
function loadDelegation() {
  const listeners = []
  const warns = []
  const errors = []
  const doc = {
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture })
  }
  const ctx = {
    console: {
      warn: (...a) => warns.push(a.join(' ')),
      error: (...a) => errors.push(a.join(' '))
    },
    document: doc
  }
  ctx.window = ctx
  ctx.globalThis = ctx
  vm.createContext(ctx)
  vm.runInContext(SRC, ctx)

  /** Déclenche un événement (les écouteurs capture et bulle sont tous appelés). */
  const dispatch = (type, target) => {
    let prevented = false
    const ev = { type, target, preventDefault: () => { prevented = true } }
    for (const l of listeners.filter(l => l.type === type)) l.fn(ev)
    return { prevented }
  }
  return { win: ctx, dispatch, warns, errors, listeners }
}

describe('chargement', () => {
  it('expose les actions et l’API publique', () => {
    const { win } = loadDelegation()
    expect(typeof win.act).toBe('function')
    expect(typeof win.ACT).toBe('object')
  })

  it('écoute les 5 événements + error', () => {
    const { listeners } = loadDelegation()
    const types = listeners.map(l => l.type).sort()
    expect(types).toEqual(['change', 'click', 'error', 'input', 'keydown', 'submit'])
  })

  it('écoute error en capture (il ne bulle pas depuis <img>)', () => {
    const { listeners } = loadDelegation()
    const captures = listeners.filter(l => l.capture).map(l => l.type)
    // `error` est indispensable en capture : sans cela le repli d'image serait muet.
    expect(captures).toContain('error')
    // `submit` est aussi capturé volontairement : un `stopPropagation()` posé par un
    // autre script ne doit pas pouvoir empêcher l'annulation de la navigation.
    const submit = listeners.find(l => l.type === 'submit')
    expect(submit.capture).toBe(true)
    // Les autres restent en bulle (comportement DOM standard).
    for (const t of ['click', 'change', 'input', 'keydown']) {
      expect(listeners.find(l => l.type === t).capture).toBe(false)
    }
  })
})

describe('dispatch', () => {
  it('appelle l’action avec (événement, élément, …args)', () => {
    const { win, dispatch } = loadDelegation()
    const seen = []
    win.act('maction', (...a) => seen.push(a))
    const el = makeEl('BUTTON', { 'data-act': 'maction', 'data-arg': 'rahma' })
    dispatch('click', el)
    expect(seen).toHaveLength(1)
    const [ev, target, slug] = seen[0]
    expect(ev.type).toBe('click')
    expect(target).toBe(el)
    expect(slug).toBe('rahma')
  })

  it('sans argument, ne transmet que (événement, élément)', () => {
    const { win, dispatch } = loadDelegation()
    let arity = -1
    win.act('sansArg', (...a) => { arity = a.length })
    dispatch('click', makeEl('BUTTON', { 'data-act': 'sansArg' }))
    expect(arity).toBe(2)
  })

  it('lit data-args comme un tableau JSON', () => {
    const { win, dispatch } = loadDelegation()
    let got = null
    win.act('multi', (_e, _el, ...args) => { got = args })
    dispatch('click', makeEl('BUTTON', { 'data-act': 'multi', 'data-args': '[12,"active",true]' }))
    expect(got).toEqual([12, 'active', true])
  })

  it('un data-args invalide ne lève pas et n’appelle pas avec des données inventées', () => {
    const { win, dispatch, warns } = loadDelegation()
    let got = null
    win.act('casse', (_e, _el, ...args) => { got = args })
    dispatch('click', makeEl('BUTTON', { 'data-act': 'casse', 'data-args': '{pas du json' }))
    expect(got).toEqual([])
    expect(warns.join(' ')).toContain('data-args')
  })

  it('data-arg absent ≠ data-arg vide (chaîne vide reste un argument)', () => {
    const { win, dispatch } = loadDelegation()
    let got = null
    win.act('vide', (_e, _el, ...args) => { got = args })
    dispatch('click', makeEl('BUTTON', { 'data-act': 'vide', 'data-arg': '' }))
    expect(got).toEqual([''])
  })

  it('annule l’envoi d’un formulaire (jamais de navigation complète)', () => {
    const { win, dispatch } = loadDelegation()
    let called = false
    win.act('envoyer', () => { called = true })
    const { prevented } = dispatch('submit', makeEl('FORM', { 'data-act': 'envoyer', 'data-on': 'submit' }))
    expect(prevented).toBe(true)
    expect(called).toBe(true)
  })

  it('un clic sur un bouton ne déclenche pas une action liée à submit', () => {
    const { win, dispatch } = loadDelegation()
    let n = 0
    win.act('uniquementSubmit', () => { n++ })
    dispatch('click', makeEl('FORM', { 'data-act': 'uniquementSubmit', 'data-on': 'submit' }))
    expect(n).toBe(0)
  })

  it('remonte depuis un enfant vers l’ancêtre porteur de data-act', () => {
    const { win, dispatch } = loadDelegation()
    let hit = null
    win.act('parent', (_e, el) => { hit = el })
    const bouton = makeEl('BUTTON', { 'data-act': 'parent' })
    const icone = makeEl('I', {}, bouton)
    dispatch('click', icone)
    expect(hit).toBe(bouton)
  })

  it('ignore une action inconnue en le signalant, sans casser la page', () => {
    const { dispatch, warns, errors } = loadDelegation()
    expect(() => dispatch('click', makeEl('BUTTON', { 'data-act': 'nexistePas' }))).not.toThrow()
    expect(warns.join(' ')).toContain('nexistePas')
    expect(errors).toEqual([])
  })

  it('un événement sur un nœud sans closest ne lève pas', () => {
    const { dispatch } = loadDelegation()
    expect(() => dispatch('click', {})).not.toThrow()
    expect(() => dispatch('click', { closest: () => null })).not.toThrow()
  })

  it('une exception dans l’action est contenue (pas de page cassée)', () => {
    const { win, dispatch, errors } = loadDelegation()
    win.act('boum', () => { throw new Error('échec prévu') })
    expect(() => dispatch('click', makeEl('BUTTON', { 'data-act': 'boum' }))).not.toThrow()
    expect(errors.join(' ')).toContain('boum')
  })

  it('retombe sur la fonction globale historique (compatibilité écrans non convertis)', () => {
    const { win, dispatch } = loadDelegation()
    let n = 0
    win.portalReset = () => { n++ } // global historique, hors registre ACT
    dispatch('click', makeEl('BUTTON', { 'data-act': 'portalReset' }))
    expect(n).toBe(1)
  })

  it('le registre ACT est prioritaire sur le global du même nom', () => {
    const { win, dispatch } = loadDelegation()
    const order = []
    win.toto = () => order.push('global')
    win.act('toto', () => order.push('registre'))
    dispatch('click', makeEl('BUTTON', { 'data-act': 'toto' }))
    expect(order).toEqual(['registre'])
  })
})

describe('repli d’image', () => {
  it('remplace src par data-img-fallback', () => {
    const { dispatch } = loadDelegation()
    const img = makeEl('IMG', { 'data-img-fallback': '/static/logo-rahma.png' })
    dispatch('error', img)
    expect(img.getAttribute('src')).toBe('/static/logo-rahma.png')
  })

  it('masque l’image quand le repli est « hide »', () => {
    const { dispatch } = loadDelegation()
    const img = makeEl('IMG', { 'data-img-fallback': 'hide' })
    dispatch('error', img)
    expect(img.style.display).toBe('none')
  })

  it('ne boucle pas si le repli échoue lui aussi', () => {
    const { dispatch } = loadDelegation()
    const img = makeEl('IMG', { 'data-img-fallback': '/a.png' })
    dispatch('error', img)
    img.setAttribute('src', '/a.png')
    dispatch('error', img) // le repli échoue : on ne doit pas rappeler setAttribute
    expect(img.getAttribute('data-fallback-done')).toBe('1')
  })

  it('ignore une image sans repli déclaré', () => {
    const { dispatch } = loadDelegation()
    const img = makeEl('IMG', {})
    dispatch('error', img)
    expect(img.getAttribute('src')).toBeNull()
  })

  it('ignore un nœud qui n’est pas une image', () => {
    const { dispatch } = loadDelegation()
    const div = makeEl('DIV', { 'data-img-fallback': '/a.png' })
    dispatch('error', div)
    expect(div.getAttribute('src')).toBeNull()
  })
})
