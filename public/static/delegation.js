/* ============================================================
   F76 — Délégation d'événements (remplace les attributs inline)
   ------------------------------------------------------------
   Pourquoi : `onclick="…"` exécute une chaîne JavaScript évaluée
   par le navigateur. Deux conséquences qu'on veut perdre :
     1. toute valeur interpolée dans l'attribut devient du CODE
        (un nom d'établissement contenant une apostrophe casse ou
        exécute — c'est la faille des 874 attributs) ;
     2. aucun outillage ne peut analyser statiquement ces appels.
   Avec `data-act`, l'attribut ne porte plus qu'un NOM et des
   DONNÉES : la valeur ne peut plus devenir du code.

   ⚠️ Honnêteté sur le gain de sécurité : un attribut `data-act`
   reste soumis à `script-src 'unsafe-inline'` tant que d'autres
   fichiers gardent des attributs inline. Ce module ne permet donc
   PAS de retirer 'unsafe-inline' tout de suite — il supprime la
   surface d'injection par attribut, écran par écran.

   Convention d'appel (uniforme, alignée sur `onclick="fn(event)"`) :
       fn(événement, élément, …arguments)
   Les arguments viennent de `data-arg` (une chaîne) ou de
   `data-args` (tableau JSON, pour plusieurs arguments).
   Cas « this.value » des anciens attributs : `élément.value`.

   Usage :
       <button data-act="portalReset">Retour</button>
       <form data-on="submit" data-act="doLogin">…</form>
       <button data-act="portalPick" data-arg="rahma">…</button>
       <img src="…" data-img-fallback="/static/logo-rahma.png">
   ============================================================ */
(function () {
  'use strict';

  var ACT = (window.ACT = window.ACT || {});
  var EVENTS = ['click', 'submit', 'change', 'input', 'keydown'];

  /** Lit la spécification d'un élément, ou null s'il n'est pas piloté. */
  function specOf(el) {
    var name = el.getAttribute('data-act');
    if (!name) return null;
    var on = el.getAttribute('data-on') || 'click';
    if (EVENTS.indexOf(on) < 0) return null;
    return { on: on, name: name };
  }

  /** Arguments explicites (jamais évalués comme du code). */
  function argsOf(el) {
    var raw = el.getAttribute('data-args');
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        if (window.console) console.warn('[delegation] data-args JSON invalide', raw);
        return [];
      }
    }
    var one = el.getAttribute('data-arg');
    return one === null ? [] : [one];
  }

  /** Résout une action : registre explicite d'abord, puis globale historique. */
  function resolve(name) {
    if (typeof ACT[name] === 'function') return ACT[name];
    // Compatibilité : les écrans non encore convertis exposent des fonctions globales.
    if (typeof window[name] === 'function') return window[name];
    return null;
  }

  function run(el, ev) {
    var spec = specOf(el);
    if (!spec) return;
    var fn = resolve(spec.name);
    if (!fn) {
      if (window.console) console.warn('[delegation] action inconnue : ' + spec.name);
      return;
    }
    // Un formulaire piloté ne doit jamais partir en navigation complète.
    if (spec.on === 'submit') {
      try { ev.preventDefault(); } catch (e) { /* événement déjà annulé */ }
    }
    try {
      fn.apply(el, [ev, el].concat(argsOf(el)));
    } catch (e) {
      if (window.console) console.error('[delegation] ' + spec.name, e);
    }
  }

  EVENTS.forEach(function (type) {
    // Capture pour `submit` (l'événement ne remonte pas depuis un formulaire
    // dont le bouton est dans un shadow-less sous-arbre) ; bulle sinon.
    document.addEventListener(type, function (ev) {
      var target = ev.target;
      if (!target || typeof target.closest !== 'function') return;
      var el = target.closest('[data-act]');
      if (!el) return;
      var spec = specOf(el);
      if (!spec || spec.on !== type) return;
      run(el, ev);
    }, type === 'submit');
  });

  // `error` sur <img> ne bulle pas : on écoute en capture.
  document.addEventListener('error', function (ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'IMG') return;
    var fallback = el.getAttribute('data-img-fallback');
    if (!fallback) return;
    if (el.getAttribute('data-fallback-done')) return; // pas de boucle si le repli échoue aussi
    el.setAttribute('data-fallback-done', '1');
    if (fallback === 'hide') el.style.display = 'none';
    else el.setAttribute('src', fallback);
  }, true);

  /** Enregistre une action nommée (API publique pour les écrans convertis). */
  window.act = function act(name, fn) {
    if (typeof name === 'string' && typeof fn === 'function') ACT[name] = fn;
  };
})();
