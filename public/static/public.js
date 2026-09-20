/* ============================================================
   Rahma Academy - Page publique : accueil, connexion, inscription
   ============================================================ */

function renderPublic(app) {
  app.innerHTML = `
  <div class="min-h-screen bg-gradient-to-br from-[#000612] via-blue-950 to-blue-900 relative overflow-hidden">
    <canvas id="hero-particles" class="hero-particles" aria-hidden="true"></canvas>
    <header class="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-5 flex items-center justify-between gap-2 relative z-10" id="public-header">
      <h1 class="font-bold text-white flex items-center gap-2 sm:gap-3 min-w-0">
        <span class="header-logo flex-shrink-0"><img src="/static/logo-rahma.png" alt="Logo Rahma Academy" class="w-11 h-11 sm:w-14 sm:h-14 object-contain drop-shadow-lg"></span>
        <span class="flex flex-col leading-none">
          <span class="text-lg sm:text-2xl tracking-wide">Rahma</span>
          <span class="text-amber-400 text-sm sm:text-2xl tracking-[.18em] sm:tracking-wide uppercase sm:normal-case">Academy</span>
        </span>
      </h1>
      <nav class="flex gap-2 sm:gap-3 flex-shrink-0" aria-label="Accès membres">
        <button onclick="showLoginModal()" class="px-3 sm:px-4 py-2 rounded-lg bg-white text-blue-900 font-semibold text-sm hover:bg-blue-50 whitespace-nowrap" title="Connexion"><i class="fas fa-right-to-bracket sm:mr-1"></i><span class="hidden sm:inline"> Connexion</span></button>
        <button onclick="showSignupModal()" class="px-3 sm:px-4 py-2 rounded-lg bg-amber-400 text-blue-900 font-semibold text-sm hover:bg-amber-300 whitespace-nowrap" title="Créer un compte"><i class="fas fa-user-plus sm:mr-1"></i><span class="hidden sm:inline"> Créer un compte</span><span class="sm:hidden ml-1">Compte</span></button>
      </nav>
    </header>
    <main class="max-w-6xl mx-auto px-4 pt-12 pb-20 text-center relative z-10">
      <div id="hero-logo" class="hero-logo mx-auto mb-8">
        <span class="hero-logo-glow"></span>
        <span class="hero-logo-ring"></span>
        <span class="hero-logo-ring hero-logo-ring--2"></span>
        <span class="hero-logo-orbit"><i class="fas fa-star"></i></span>
        <span class="hero-logo-orbit hero-logo-orbit--2"><i class="fas fa-graduation-cap"></i></span>
        <span class="hero-logo-orbit hero-logo-orbit--3"><i class="fas fa-book"></i></span>
        <img src="/static/logo-rahma.png" alt="Logo Rahma Academy" class="hero-logo-img">
      </div>
      <h2 class="text-4xl md:text-6xl font-extrabold text-white leading-tight hero-fade tracking-wide" style="animation-delay:.15s">RAHMA <span class="text-amber-400">ACADEMY</span><br><span class="text-xl md:text-3xl font-semibold text-blue-100 hero-shimmer tracking-normal">Plateforme de gestion scolaire</span></h2>
      <p class="text-blue-200 mt-4 max-w-2xl mx-auto hero-fade" style="animation-delay:.35s">Gestion des élèves du primaire (1ère → 6ème année), de base (7ème → 9ème année) et du secondaire (1ère → 4ème année). Présence, notes, bulletins, frais, cours et notifications automatiques.</p>
      <div class="mt-8 flex justify-center gap-4 flex-wrap hero-fade" style="animation-delay:.55s">
        <button id="btn-register-student" onclick="showRegistrationModal()" class="px-6 py-3 rounded-xl bg-amber-400 text-blue-900 font-bold hover:bg-amber-300 shadow-lg hero-cta-pulse"><i class="fas fa-file-signature mr-2"></i>Inscrire un élève</button>
        <button onclick="showLoginModal()" class="px-6 py-3 rounded-xl bg-white/10 text-white font-bold border border-white/30 hover:bg-white/20"><i class="fas fa-right-to-bracket mr-2"></i>Espace membres</button>
        <button onclick="showInscriptionQR()" class="px-6 py-3 rounded-xl bg-white text-blue-900 font-bold hover:bg-blue-50 shadow-lg"><i class="fas fa-qrcode mr-2"></i>QR Code inscription</button>
      </div>
      <section id="stats-counters" class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-14 hero-fade" style="animation-delay:.75s" aria-label="Chiffres clés">
        ${[
          ['students','fa-user-graduate','Élèves inscrits','تلاميذ'],
          ['courses','fa-book-open','Cours & ressources','دروس'],
          ['teachers','fa-chalkboard-user','Enseignants','معلمون'],
          ['levels','fa-layer-group','Niveaux scolaires','مستويات']
        ].map(([k,i,l,ar]) => `
        <div class="stat-card bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10">
          <i class="fas ${i} text-amber-400 text-xl"></i>
          <div class="stat-value text-3xl md:text-4xl font-extrabold text-white mt-2" data-stat="${k}" data-target="0">0</div>
          <div class="text-blue-200 text-xs md:text-sm mt-1">${l} <span class="text-blue-300/70">· ${ar}</span></div>
        </div>`).join('')}
      </section>
      <section id="features-carousel" class="mt-16 text-left relative" aria-label="Fonctionnalités" onmouseenter="featPause(true)" onmouseleave="featPause(false)">
        <div class="flex items-center justify-between mb-4 px-1">
          <h3 class="text-white font-bold text-lg"><i class="fas fa-sparkles text-amber-400 mr-2"></i>Fonctionnalités de la plateforme</h3>
          <div class="flex gap-2">
            <button type="button" onclick="featStep(-1)" class="feat-nav" aria-label="Précédent"><i class="fas fa-chevron-left"></i></button>
            <button type="button" onclick="featStep(1)" class="feat-nav" aria-label="Suivant"><i class="fas fa-chevron-right"></i></button>
          </div>
        </div>
        <div class="feat-viewport" id="feat-viewport">
          <div class="feat-track" id="feat-track">
            ${FEATURES.map(([i,t,d,c]) => `
            <article class="feat-card">
              <div class="feat-icon" style="--c:${c}"><i class="fas ${i}"></i></div>
              <h3 class="text-white font-bold mt-4 text-lg">${t}</h3>
              <p class="text-blue-200 text-sm mt-1">${d}</p>
            </article>`).join('')}
          </div>
        </div>
        <div class="flex justify-center gap-2 mt-5" id="feat-dots">
          ${FEATURES.map((_,i)=>`<button type="button" onclick="featGo(${i})" class="feat-dot" aria-label="Carte ${i+1}"></button>`).join('')}
        </div>
      </section>
    </main>
    <footer class="text-center text-blue-300 text-xs pb-6 relative z-10">
      <p class="mb-1"><i class="fas fa-location-dot mr-1"></i>10 Av Imam Malik, Messadine 4013 &nbsp;•&nbsp; <i class="fas fa-phone mr-1"></i>+216 52 517 581</p>
      <p>© 2026 Rahma Academy</p>
    </footer>
  </div>`;
  startParticles();
  loadPublicStats();
  featInit();
}

// ---------- Cartes fonctionnalités (carrousel) ----------
const FEATURES = [
  ['fa-user-graduate','Gestion des élèves','Fiches complètes avec photo, du 1AP au 4AS sur les 3 cycles.','#fbbf24'],
  ['fa-clipboard-check','Présence & Calendrier','Suivi quotidien de la présence, emploi du temps et calendrier scolaire.','#34d399'],
  ['fa-star','Notes & Bulletins PDF','Saisie des notes par trimestre, carnet de notation et bulletins téléchargeables.','#60a5fa'],
  ['fa-money-bill-wave',"Frais & Mensualités",'Suivi des paiements, quittances Telegram et relances automatiques.','#f97316'],
  ['fa-bell','Notifications ciblées','Parents, élèves et enseignants informés : cours, événements, examens, absences, notes.','#f472b6'],
  ['fa-book-open','Cours & Documents','PDF, Word, affiches pédagogiques et cours interactifs par niveau.','#a78bfa']
];

// ---------- Particules flottantes (canvas, léger) ----------
let _pAnim = null;
function startParticles() {
  const cv = document.getElementById('hero-particles');
  if (!cv) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { cv.remove(); return; }
  if (_pAnim) cancelAnimationFrame(_pAnim);
  const ctx = cv.getContext('2d');
  const glyphs = ['★', 'A', 'B', 'C', 'أ', 'ب', 'ت', 'é', 'è', '1', '2', '3', '✦', '•'];
  let W, H, parts = [];
  const isMobile = window.innerWidth < 640;
  const N = isMobile ? 28 : 55;
  function resize() {
    W = cv.width = cv.offsetWidth * devicePixelRatio;
    H = cv.height = cv.offsetHeight * devicePixelRatio;
  }
  function mk() {
    const glyph = Math.random() < 0.3 ? glyphs[Math.floor(Math.random()*glyphs.length)] : null;
    return { x: Math.random()*W, y: H + Math.random()*H*0.3, r: (glyph ? 8 : 1.5) + Math.random()*(glyph ? 10 : 3),
      vy: (0.15 + Math.random()*0.35) * devicePixelRatio, vx: (Math.random()-0.5)*0.25*devicePixelRatio,
      a: 0.15 + Math.random()*0.45, glyph, rot: Math.random()*Math.PI*2, vr: (Math.random()-0.5)*0.01,
      gold: Math.random() < 0.4 };
  }
  resize();
  for (let i=0;i<N;i++) { const p = mk(); p.y = Math.random()*H; parts.push(p); }
  window.addEventListener('resize', resize, { passive: true });
  function frame() {
    if (!document.getElementById('hero-particles')) { _pAnim = null; return; }
    ctx.clearRect(0,0,W,H);
    for (const p of parts) {
      p.y -= p.vy; p.x += p.vx; p.rot += p.vr;
      if (p.y < -30) Object.assign(p, mk());
      ctx.globalAlpha = p.a;
      const col = p.gold ? '#fbbf24' : '#ffffff';
      if (p.glyph) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = col; ctx.font = `bold ${p.r*devicePixelRatio}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(p.glyph, 0, 0); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r*devicePixelRatio, 0, Math.PI*2); ctx.fillStyle = col; ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    _pAnim = requestAnimationFrame(frame);
  }
  frame();
}

// ---------- Compteurs animés ----------
async function loadPublicStats() {
  try {
    const r = await fetch('/api/public/stats');
    const s = await r.json();
    document.querySelectorAll('#stats-counters [data-stat]').forEach(el => {
      const v = Number(s[el.dataset.stat] || 0);
      el.dataset.target = v;
    });
    const sec = document.getElementById('stats-counters');
    if (!sec) return;
    const run = () => document.querySelectorAll('#stats-counters [data-stat]').forEach(animateCounter);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { run(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(sec);
    } else run();
  } catch (e) { /* silencieux */ }
}
function animateCounter(el) {
  const target = Number(el.dataset.target || 0);
  const dur = 1600, t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(target * ease(p)).toLocaleString('fr-FR') + (p >= 1 && target > 0 ? '+' : '');
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------- Carrousel fonctionnalités ----------
const Feat = { idx: 0, timer: null, paused: false };
function featPerView() { return window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1; }
function featMax() { return Math.max(0, FEATURES.length - featPerView()); }
function featRender() {
  const track = document.getElementById('feat-track');
  if (!track) return;
  const pv = featPerView();
  const gap = 24;
  const vw = document.getElementById('feat-viewport').offsetWidth;
  const cardW = (vw - gap*(pv-1)) / pv;
  track.querySelectorAll('.feat-card').forEach(c => { c.style.width = cardW + 'px'; c.style.marginRight = gap + 'px'; });
  track.style.transform = `translateX(-${Feat.idx * (cardW + gap)}px)`;
  document.querySelectorAll('#feat-dots .feat-dot').forEach((d,i) => d.classList.toggle('active', i >= Feat.idx && i < Feat.idx + pv));
}
function featGo(i) { const m = featMax(); Feat.idx = i > m ? 0 : i < 0 ? m : i; featRender(); featRestart(); }
function featStep(d) { featGo(Feat.idx + d); }
function featPause(p) { Feat.paused = p; }
function featRestart() {
  clearInterval(Feat.timer);
  Feat.timer = setInterval(() => { if (!Feat.paused && document.getElementById('feat-track')) featGo(Feat.idx + 1); else if (!document.getElementById('feat-track')) clearInterval(Feat.timer); }, 4000);
}
function featInit() {
  Feat.idx = 0; featRender(); featRestart();
  window.addEventListener('resize', () => { Feat.idx = Math.min(Feat.idx, featMax()); featRender(); }, { passive: true });
  // Balayage tactile
  const vp = document.getElementById('feat-viewport');
  let x0 = null;
  vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; featPause(true); }, { passive: true });
  vp.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) featStep(dx < 0 ? 1 : -1); x0 = null; featPause(false); }, { passive: true });
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
    </form>
    <div id="google-auth-block" class="hidden">
      <div class="flex items-center gap-3 my-4"><hr class="flex-1 border-gray-200"><span class="text-xs text-gray-400">ou</span><hr class="flex-1 border-gray-200"></div>
      <a href="/api/auth/google" class="google-btn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4-13.5-9.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Continuer avec Google</a>
      <p class="text-[11px] text-gray-400 mt-2 text-center"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Un nouveau compte créé via Google est un compte <b>Parent</b> ; liez ensuite votre enfant avec son code élève.</p>
    </div>`);
  showGoogleIfEnabled();
}

// Le bouton Google n'apparaît que si le serveur est configuré (GOOGLE_CLIENT_ID/SECRET)
let _googleEnabled = null;
async function showGoogleIfEnabled() {
  if (_googleEnabled === null) { try { _googleEnabled = (await api.get('/auth/google/status')).data.enabled; } catch { _googleEnabled = false; } }
  if (_googleEnabled) document.querySelectorAll('#google-auth-block').forEach(el => el.classList.remove('hidden'));
}

// Retour de Google : /#gtoken=<jwt> (fragment, jamais envoyé au serveur) ou /?google_error=...
async function handleGoogleReturn() {
  const m = (location.hash || '').match(/^#gtoken=(.+)$/);
  const err = new URLSearchParams(location.search).get('google_error');
  if (err) { history.replaceState(null, '', '/'); setTimeout(() => toast('<i class="fas fa-triangle-exclamation mr-1"></i> ' + esc(err), 'error'), 400); return false; }
  if (!m) return false;
  App.token = m[1]; localStorage.setItem('edu_token', App.token);
  history.replaceState(null, '', '/');
  try { App.user = (await api.get('/auth/me')).data.user; await loadSchoolYears(); toast(`Bienvenue, ${esc(App.user.name)} !`); return true; }
  catch { App.token = null; localStorage.removeItem('edu_token'); return false; }
}

async function doLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const r = await api.post('/auth/login', { email: formVal('login-email'), password: document.getElementById('login-password').value });
    App.token = r.data.token; App.user = r.data.user;
    localStorage.setItem('edu_token', App.token);
    await loadSchoolYears();
    // Lien partagé en attente : ouvrir le cours interactif après connexion
    if (App.cache.icPendingId) { App.route = 'interactive'; App.cache.icOpenId = App.cache.icPendingId; App.cache.icPendingId = null; }
    closeModal(); render();
    toast(`Bienvenue, ${esc(App.user.name)} !`);
  } catch (err) {
    errEl.textContent = err.response?.data?.error || 'Erreur de connexion';
    errEl.classList.remove('hidden');
  }
}

async function showSignupModal() {
  openModal('<i class="fas fa-user-plus text-blue-600 mr-2"></i>Créer un compte', `
    <form onsubmit="doSignup(event)">
      <label class="${lblCls}">Nom complet</label>
      <input id="su-name" required class="${inputCls} mb-3">
      <label class="${lblCls}">Email</label>
      <input id="su-email" type="email" required class="${inputCls} mb-3">
      <label class="${lblCls}">Téléphone</label>
      <input id="su-phone" class="${inputCls} mb-3" placeholder="+216 ...">
      <label class="${lblCls}">Mot de passe</label>
      <input id="su-password" type="password" required minlength="8" class="${inputCls} mb-3" placeholder="8 caractères minimum">
      <label class="${lblCls}">Rôle</label>
      <select id="su-role" class="${inputCls} mb-3" onchange="document.getElementById('su-link-wrap').style.display = ['parent','student'].includes(this.value) ? 'block' : 'none'; document.getElementById('su-subject-wrap').style.display = this.value==='teacher' ? 'block' : 'none';">
        <option value="parent">Parent / Tuteur</option>
        <option value="student">Élève</option>
        <option value="teacher">Enseignant</option>
      </select>
      <p class="text-xs text-gray-400 -mt-2 mb-3"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Les comptes enseignants sont activés par l'administration après vérification.</p>
      <div id="su-subject-wrap" style="display:none">
        <label class="${lblCls}">Matière enseignée <span class="text-red-500">*</span></label>
        <input id="su-subject" class="${inputCls} mb-1" placeholder="ex : Français, Mathématiques...">
        <p class="text-xs text-gray-400 mb-3"><i class="fas fa-book mr-1"></i>Obligatoire pour tout enseignant — elle sera mentionnée sur votre fiche.</p>
      </div>
      <div id="su-link-wrap">
        <label class="${lblCls}">Code élève <span class="text-gray-400 font-normal">(fourni par l'école, ex : RCF-12-ABCD)</span></label>
        <input id="su-student-code" class="${inputCls} mb-1 uppercase" placeholder="RCF-12-ABCD" autocomplete="off">
        <p class="text-xs text-gray-400 mb-3"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Ce code sécurisé vous a été communiqué par l'école (Telegram, email ou sur place). Laissez vide si vous ne l'avez pas encore — vous pourrez lier l'élève plus tard.</p>
      </div>
      <div id="su-error" class="text-red-600 text-sm mb-3 hidden"></div>
      <button type="submit" class="${btnPrimary} w-full"><i class="fas fa-user-plus mr-1"></i> Créer mon compte</button>
    </form>
    <div id="google-auth-block" class="hidden">
      <div class="flex items-center gap-3 my-4"><hr class="flex-1 border-gray-200"><span class="text-xs text-gray-400">ou</span><hr class="flex-1 border-gray-200"></div>
      <a href="/api/auth/google" class="google-btn"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.3 0 11.7-2.1 15.6-5.7l-7.5-5.8c-2.1 1.4-4.8 2.3-8.1 2.3-6.3 0-11.6-4-13.5-9.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Continuer avec Google</a>
      <p class="text-[11px] text-gray-400 mt-2 text-center"><i class="fas fa-shield-halved text-green-500 mr-1"></i>Un nouveau compte créé via Google est un compte <b>Parent</b> ; liez ensuite votre enfant avec son code élève.</p>
    </div>`);
  showGoogleIfEnabled();
}

async function doSignup(e) {
  e.preventDefault();
  const errEl = document.getElementById('su-error');
  errEl.classList.add('hidden');
  const role = formVal('su-role');
  const code = (formVal('su-student-code') || '').trim();
  const subject = (formVal('su-subject') || '').trim();
  if (role === 'teacher' && !subject) {
    errEl.textContent = 'La matière enseignée est obligatoire pour un compte enseignant.';
    errEl.classList.remove('hidden');
    return;
  }
  try {
    const r = await api.post('/auth/signup', {
      name: formVal('su-name'), email: formVal('su-email'), phone: formVal('su-phone'),
      password: document.getElementById('su-password').value, role,
      student_code: code || null,
      subject: role === 'teacher' ? subject : null
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
    dir: 'rtl', title: 'مطلب تسجيل تلميذ',
    fn: 'اسم التلميذ', ln: 'لقب التلميذ', bd: 'تاريخ الولادة', gender: 'الجنس',
    nid: 'رقم تعريف التلميذ (12 رقماً)', nidHint: 'الرقم الوطني للتلميذ — يمنع التسجيل المزدوج', nidErr: 'رقم التعريف يجب أن يتكون من 12 رقماً',
    boy: 'ذكر', girl: 'أنثى', level: 'المستوى الدراسي المطلوب',
    pname: 'اسم الولي', pphone: 'رقم الهاتف', pemail: 'البريد الإلكتروني للولي',
    address: 'العنوان', notes: 'ملاحظات', submit: 'إرسال المطلب',
    feeLabel: 'معلوم التسجيل', feeNote: 'يُدفع عند قبول المطلب لدى إدارة المدرسة',
    fee: `${REGISTRATION_FEE_DT} دينار تونسي`
  },
  fr: {
    dir: 'ltr', title: "Demande d'inscription d'un élève",
    fn: "Prénom de l'élève", ln: "Nom de l'élève", bd: 'Date de naissance', gender: 'Genre',
    nid: "Identifiant de l'élève (12 chiffres)", nidHint: "Identifiant national unique — empêche le double enregistrement", nidErr: "L'identifiant doit comporter exactement 12 chiffres",
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

  openModal(`<i class="fas fa-file-signature text-blue-600 mx-2"></i>${t.title}`, `
    <div dir="${t.dir}">
      <div class="flex justify-center gap-2 mb-4" dir="ltr">
        <button type="button" onclick="showRegistrationModal('ar')" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 transition ${lang==='ar' ? 'border-blue-600 bg-blue-50 text-blue-800 shadow' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}">
          <img src="https://flagcdn.com/w40/tn.png" alt="تونس" class="w-6 h-4 rounded-sm object-cover shadow-sm"> العربية
        </button>
        <button type="button" onclick="showRegistrationModal('fr')" class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold border-2 transition ${lang==='fr' ? 'border-blue-600 bg-blue-50 text-blue-800 shadow' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}">
          <img src="https://flagcdn.com/w40/fr.png" alt="France" class="w-6 h-4 rounded-sm object-cover shadow-sm"> Français
        </button>
      </div>
      <form onsubmit="doPublicRegistration(event)">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2"><label class="${lblCls}">${t.nid} <span class="text-red-500">*</span></label><input id="reg-nid" required inputmode="numeric" maxlength="12" pattern="\\d{12}" oninput="this.value=this.value.replace(/\\D/g,'').slice(0,12)" class="${inputCls}" dir="ltr" placeholder="000000000000"><p class="text-xs text-gray-500 mt-1">${t.nidHint}</p></div>
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
  const nid = (formVal('reg-nid') || '').trim();
  if (!/^\d{12}$/.test(nid)) { toast(REG_I18N[regLang].nidErr, 'error'); return; }
  try {
    await api.post('/db/registrations', {
      national_id: nid,
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
  w.document.write(`<!DOCTYPE html><html><head><title>QR Inscription - Rahma Academy</title>
    <style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}h1{color:#1e3a8a}img.qr{width:320px;height:320px;margin:24px 0}img.logo{width:110px;height:110px}p{color:#555}</style>
    </head><body>
    <img class="logo" src="${location.origin}/static/logo-rahma-full.png" alt="Logo" style="background:#000612;border-radius:16px;padding:10px">
    <h1>Rahma Academy</h1>
    <h2>Inscrivez votre élève en 1 minute !</h2>
    <img class="qr" src="${img}" alt="QR Code inscription">
    <p>Scannez ce code avec l'appareil photo de votre smartphone<br>pour ouvrir le formulaire d'inscription.</p>
    <script>window.onload = () => window.print();<\/script>
    </body></html>`);
  w.document.close();
}

// Ouverture automatique du formulaire d'inscription :
// - UNIQUEMENT sur /inscription (arrivée via QR code)
// - sur la page d'accueil /, le formulaire s'ouvre seulement au clic sur « Inscrire un élève »
window.addEventListener('DOMContentLoaded', () => {
  if (location.pathname === '/inscription') {
    setTimeout(() => { if (typeof App === 'undefined' || !App.user) showRegistrationModal(); }, 300);
  }
});
