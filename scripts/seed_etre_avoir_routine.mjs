// Cours interactifs : « Le présent des verbes être et avoir » (fiche PDF)
// + « Ma routine matinale » (fiche expression écrite)
// Usage : node scripts/seed_etre_avoir_routine.mjs
import { readFileSync } from 'fs';

// Secrets lus depuis .dev.vars (jamais dans le code)
const envTxt = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const envGet = k => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const KEY = envGet('SUPABASE_SERVICE_KEY');
const SB = (envGet('SUPABASE_URL') || '').replace(/\/$/, '') + '/rest/v1';
if (!KEY || !SB.startsWith('http')) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans .dev.vars'); process.exit(1); }
const SUBJ_FR = 2; // Français

const q = (question, correctFirst, ...wrong) => {
  const options = [correctFirst, ...wrong];
  const pos = question.length % options.length;
  const arr = [...options];
  const [c] = arr.splice(0, 1);
  arr.splice(pos, 0, c);
  return { question, options: arr.concat(Array(Math.max(0, 4 - arr.length)).fill('')), correct: pos };
};
const fcCards = pairs => ({ cards: pairs.map(([front, back]) => ({ front, back })) });

const COURSES = [];

// ===== 1. QUIZ : être ou avoir ? (exercice 1 de la fiche) =====
COURSES.push({
  title: 'Être ou avoir ? Je reconnais le verbe', course_type: 'quiz', level: '2AP',
  description: "Dans chaque phrase, retrouve si le verbe conjugué est le verbe ÊTRE ou le verbe AVOIR (fiche « Le présent des verbes être et avoir »).",
  questions: [
    q('« Le chocolat est trop chaud. » Quel est le verbe ?', 'être', 'avoir'),
    q('« Nous avons une surprise pour toi. » Quel est le verbe ?', 'avoir', 'être'),
    q('« Vous avez de la chance de savoir nager. » Quel est le verbe ?', 'avoir', 'être'),
    q('« Les écureuils sont des animaux très mignons. » Quel est le verbe ?', 'être', 'avoir'),
    q('« Cette fille a les cheveux longs. » Quel est le verbe ?', 'avoir', 'être'),
    q('« Ce soir, mes parents ont des invités. » Quel est le verbe ?', 'avoir', 'être'),
    q('« En ce moment, nous sommes en vacances. » Quel est le verbe ?', 'être', 'avoir'),
    q('« Je suis très content de te voir. » Quel est le verbe ?', 'être', 'avoir'),
    q("« Tu as une jolie robe, aujourd'hui. » Quel est le verbe ?", 'avoir', 'être'),
    q('« Vous êtes vraiment trop bavards. » Quel est le verbe ?', 'être', 'avoir'),
    q("« Regarde, j'ai un nouveau stylo. » Quel est le verbe ?", 'avoir', 'être'),
    q('« Avec ce chapeau, tu es très drôle. » Quel est le verbe ?', 'être', 'avoir'),
  ]
});

// ===== 2. TEXTE À TROUS : conjuguer ÊTRE au présent (exercice 2) =====
COURSES.push({
  title: 'Je conjugue le verbe ÊTRE au présent', course_type: 'fillblank', level: '2AP',
  description: "Complète chaque phrase en conjuguant le verbe être au présent (je suis, tu es, il est, nous sommes, vous êtes, ils sont).",
  content: { text: `Je [suis] un bon cavalier.
Le lionceau [est] le petit du lion.
Les étoiles [sont] loin dans le ciel.
Nous [sommes] des jumelles.
Tu [es] meilleur que moi aux échecs.
Vous [êtes] perdu, Monsieur ?` }
});

// ===== 3. TEXTE À TROUS : conjuguer AVOIR au présent (exercice 3) =====
COURSES.push({
  title: 'Je conjugue le verbe AVOIR au présent', course_type: 'fillblank', level: '2AP',
  description: "Complète chaque phrase en conjuguant le verbe avoir au présent (j'ai, tu as, il a, nous avons, vous avez, ils ont).",
  content: { text: `J'[ai] un bouton sur la joue.
Vous [avez] une belle voiture rouge.
L'éléphant [a] des oreilles énormes.
Nous [avons] un train à prendre.
Les enfants [ont] peur du loup.
Tu [as] cinq ans aujourd'hui.` }
});

// ===== 4. QUIZ : quel pronom ? (exercice 4, page 2) =====
COURSES.push({
  title: 'Je trouve le pronom qui convient (être et avoir)', course_type: 'quiz', level: '2AP',
  description: "Choisis le pronom qui convient devant le verbe être ou avoir conjugué (je, j', tu, il, elle, nous, vous, ils, elles).",
  questions: [
    q('_______ êtes encore en train de jouer.', 'Vous', 'Nous', 'Ils'),
    q('_______ ont les yeux bleus.', 'Ils', 'Il', 'Vous'),
    q("_______ ai envie d'une glace.", "J'", 'Tu', 'Je'),
    q('_______ sommes dans la même classe.', 'Nous', 'Vous', 'Elles'),
    q('_______ as une bonne idée.', 'Tu', 'Je', 'Il'),
    q('_______ suis dans le jardin.', 'Je', "J'", 'Tu'),
    q('_______ sont chez le coiffeur.', 'Elles', 'Elle', 'Nous'),
    q('_______ avons encore faim.', 'Nous', 'Vous', 'Ils'),
    q('_______ es un bon musicien.', 'Tu', 'Je', 'Il'),
    q('_______ est plus rapide que moi.', 'Elle', 'Elles', 'Tu'),
    q('_______ avez du travail à terminer.', 'Vous', 'Nous', 'Elles'),
    q('_______ a un chat roux.', 'Il', 'Ils', 'Tu'),
  ]
});

// ===== 5. TEXTE À TROUS : accorder le verbe avec son sujet (exercice 5) =====
COURSES.push({
  title: "J'accorde être et avoir avec le sujet", course_type: 'fillblank', level: '3AP',
  description: "Observe la première phrase, puis transforme : accorde le verbe être ou avoir avec le nouveau sujet.",
  content: { text: `Ces livres sont passionnants. → Cette histoire [est] passionnante.
La colombe a un plumage blanc. → Les pigeons [ont] un plumage gris.
Mes copains et moi, nous sommes à la piscine. → Tes copains et toi, vous [êtes] à la piscine.
Aujourd'hui, je suis de bonne humeur. → Aujourd'hui, tu [es] de mauvaise humeur.
Parfois, j'ai peur de me tromper. → Parfois, nous [avons] peur de nous tromper.
Maintenant, vous avez le droit de jouer. → Maintenant, tu [as] le droit de jouer.` }
});

// ===== 6. CARTES MÉMOIRE : conjugaison être & avoir =====
COURSES.push({
  title: 'Cartes mémoire : être et avoir au présent', course_type: 'flashcards', level: '2AP',
  description: "Je mémorise la conjugaison complète des verbes être et avoir au présent de l'indicatif.",
  content: fcCards([
    ['ÊTRE → je …', 'je suis'], ['ÊTRE → tu …', 'tu es'], ['ÊTRE → il / elle …', 'il est / elle est'],
    ['ÊTRE → nous …', 'nous sommes'], ['ÊTRE → vous …', 'vous êtes'], ['ÊTRE → ils / elles …', 'ils sont / elles sont'],
    ['AVOIR → je …', "j'ai"], ['AVOIR → tu …', 'tu as'], ['AVOIR → il / elle …', 'il a / elle a'],
    ['AVOIR → nous …', 'nous avons'], ['AVOIR → vous …', 'vous avez'], ['AVOIR → ils / elles …', 'ils ont / elles ont'],
    ['⭐ Astuce : « est » ou « a » ?', '« est » = être (il est grand) · « a » = avoir (il a faim)'],
  ])
});

// ===== 7. TEXTE À TROUS : Ma routine matinale (expression écrite) =====
COURSES.push({
  title: 'Ma routine matinale — je complète le texte', course_type: 'fillblank', level: '2AP',
  description: "Complète le texte qui raconte la routine du matin, comme sur la fiche illustrée « Ma routine matinale » (4 images : la toilette, le cartable, le petit-déjeuner, l'école).",
  content: { text: `1. Le matin, je me [lave] le visage et je me brosse les [dents] devant le miroir.
2. Ensuite, je prépare mon [cartable] : je range mes livres et mes [cahiers].
3. Puis, je prends mon petit-[déjeuner] dans la cuisine : je bois un jus d'[orange].
4. Enfin, je vais à l'[école] et je salue mes [amis] dans la cour.` }
});

// ===== 8. QUIZ : Ma routine matinale — remettre dans l'ordre =====
COURSES.push({
  title: 'Ma routine matinale — je remets dans l\'ordre', course_type: 'quiz', level: '2AP',
  description: "Réponds aux questions sur l'ordre des actions du matin (fiche « Ma routine matinale »).",
  questions: [
    q('Que fait-on en PREMIER le matin ?', 'Se laver le visage et se brosser les dents', "Aller à l'école", 'Prendre le petit-déjeuner'),
    q('Après la toilette, que fait le garçon sur la fiche ?', 'Il prépare son cartable', 'Il regarde la télévision', 'Il va dormir'),
    q('Que prend-on AVANT de partir à l\'école ?', 'Le petit-déjeuner', 'Le dîner', 'Le goûter'),
    q('Que fait-on en DERNIER sur la fiche ?', "On va à l'école et on salue ses amis", 'On se brosse les dents', 'On prépare son cartable'),
    q('Le matin, on se brosse…', 'les dents', 'les cheveux du chat', 'les chaussures'),
    q('Dans le cartable, on range…', 'les livres et les cahiers', 'les jouets', 'la nourriture'),
    q('Vrai ou Faux : on prend le petit-déjeuner le soir.', 'Faux', 'Vrai'),
  ]
});

// ============ INSERTION EN BASE ============
const rows = COURSES.map(c => ({
  title: c.title,
  description: c.description || null,
  level: c.level,
  cycle: 'primaire',
  subject_id: SUBJ_FR,
  questions: c.questions || [],
  course_type: c.course_type,
  content: c.content || {},
  external_url: c.external_url || null
}));

const res = await fetch(`${SB}/interactive_courses`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(rows)
});
const data = await res.json();
if (!res.ok) { console.error('ERREUR', JSON.stringify(data)); process.exit(1); }
console.log(`✅ ${data.length} cours interactifs créés :`);
for (const r of data) console.log(`  #${r.id} [${r.course_type}] ${r.title} (${r.level})`);
