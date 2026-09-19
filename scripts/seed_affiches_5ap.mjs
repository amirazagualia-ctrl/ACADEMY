// Cours interactifs 5AP dérivés des 5 affiches pédagogiques (style أنيستي ثريا) :
// 1. Grâce à / À cause de  2-3. Les métiers (masculin/féminin)  4. à la, au, chez  5. Parler Français
// Usage : node scripts/seed_affiches_5ap.mjs
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

// ═══════════ AFFICHE 1 : GRÂCE À / À CAUSE DE ═══════════

// 1. QUIZ : choisir la bonne expression (exercice 1 de l'affiche)
COURSES.push({
  title: 'Grâce à ou à cause de ? Je choisis la bonne expression', course_type: 'quiz', level: '5AP',
  description: "« Grâce à » exprime une cause positive (quelque chose de bien), « à cause de » exprime une cause négative. Complète chaque phrase avec la bonne expression (affiche « La différence entre grâce à et à cause de »).",
  questions: [
    q('_______ son courage, il a réussi son examen.', 'Grâce à', 'À cause de'),
    q('Le pique-nique a été annulé _______ mauvais temps.', 'à cause du', 'grâce au'),
    q("_______ tes conseils, j'ai compris ma leçon.", 'Grâce à', 'À cause de'),
    q("Elle est absente aujourd'hui _______ sa maladie.", 'à cause de', 'grâce à'),
    q('Les fleurs sont fanées _______ gel.', 'à cause du', 'grâce au'),
    q('_______ la pluie, le match a été annulé.', 'À cause de', 'Grâce à'),
    q('_______ la pluie, les plantes poussent.', 'Grâce à', 'À cause de'),
    q('_______ son retard, il a raté le bus.', 'À cause de', 'Grâce à'),
    q("_______ ton aide, nous avons terminé le projet.", 'Grâce à', 'À cause de'),
    q("_______ du bruit, je n'ai pas pu dormir.", 'À cause', 'Grâce'),
    q("_______ mon travail, j'ai eu une bonne note.", 'Grâce à', 'À cause de'),
  ]
});

// 2. QUIZ : cause positive (+) ou négative (−) ? (exercice 3 de l'affiche)
COURSES.push({
  title: 'Grâce à / À cause de — cause positive ou négative ?', course_type: 'quiz', level: '5AP',
  description: "Complète avec « grâce à » ou « à cause de », puis dis si la cause est positive (+) ou négative (−), comme dans l'exercice 3 de l'affiche.",
  questions: [
    q('« _______ son médecin, le patient va mieux. » La cause est…', 'Grâce à → positive (+)', 'À cause de → négative (−)'),
    q('« _______ la neige, les routes sont dangereuses. » La cause est…', 'À cause de → négative (−)', 'Grâce à → positive (+)'),
    q('« _______ sa persévérance, il a atteint son objectif. » La cause est…', 'Grâce à → positive (+)', 'À cause de → négative (−)'),
    q("« _______ son imprudence, il s'est blessé. » La cause est…", 'À cause de → négative (−)', 'Grâce à → positive (+)'),
    q("« _______ l'aide de ses amis, elle n'a pas abandonné. » La cause est…", 'Grâce à → positive (+)', 'À cause de → négative (−)'),
    q('« Grâce à » exprime toujours…', 'une cause positive (quelque chose de bien)', 'une cause négative (quelque chose de mauvais)'),
    q('« À cause de » exprime toujours…', 'une cause négative (quelque chose de mauvais)', 'une cause positive (quelque chose de bien)'),
  ]
});

// 3. TEXTE À TROUS : transformer les phrases (exercice 2 de l'affiche)
COURSES.push({
  title: 'Grâce à ↔ À cause de — je transforme les phrases', course_type: 'fillblank', level: '5AP',
  description: "Réécris chaque phrase en remplaçant l'expression par l'autre (grâce à ↔ à cause de), comme dans l'exercice 2 de l'affiche. Écris l'expression manquante.",
  content: { text: `Grâce à ses efforts, elle a gagné le concours. → [À cause de] ses erreurs, elle a perdu le concours.
À cause du vent, l'avion a eu du retard. → [Grâce au] beau temps, l'avion est arrivé à l'heure.
Grâce à votre soutien, j'ai pu avancer. → [À cause de] votre absence, je n'ai pas pu avancer.
À cause de la fatigue, il n'a pas pu participer. → [Grâce à] son énergie, il a pu participer.
Grâce à la pluie, les plantes poussent. → [À cause de] la pluie, le match a été annulé.` }
});

// ═══════════ AFFICHES 2-3 : LES MÉTIERS (MASCULIN / FÉMININ) ═══════════

// 4. CARTES MÉMOIRE : métiers masculin → féminin (affiche 3 parties)
COURSES.push({
  title: 'Cartes mémoire : les métiers au féminin (1)', course_type: 'flashcards', level: '5AP',
  description: "Je mémorise la forme féminine des métiers : en général on ajoute -e au masculin, mais parfois la forme change complètement (affiche « Les métiers — le masculin et le féminin »).",
  content: fcCards([
    ['un maître → une …', 'une maîtresse'],
    ['un médecin → une …', 'une médecin'],
    ['un pompier → une …', 'une pompière'],
    ['un policier → une …', 'une policière'],
    ['un boulanger → une …', 'une boulangère'],
    ['un infirmier → une …', 'une infirmière'],
    ['un dentiste → une …', 'une dentiste'],
    ['un ingénieur → une …', 'une ingénieure'],
    ['un architecte → une …', 'une architecte'],
    ['un caissier → une …', 'une caissière'],
    ['⭐ Règle générale', 'On ajoute -e à la fin du masculin pour former le féminin. Parfois, la forme change complètement.'],
  ])
});

// 5. CARTES MÉMOIRE : métiers du grand tableau
COURSES.push({
  title: 'Cartes mémoire : les métiers au féminin (2)', course_type: 'flashcards', level: '5AP',
  description: "Je mémorise d'autres métiers au masculin et au féminin (affiche « Les métiers — grand tableau »). Attention à l'exception : un ami → une amie.",
  content: fcCards([
    ['un professeur → une …', 'une professeure'],
    ['un pharmacien → une …', 'une pharmacienne'],
    ['un vétérinaire → une …', 'une vétérinaire'],
    ['un boucher → une …', 'une bouchère'],
    ['un pâtissier → une …', 'une pâtissière'],
    ['un poissonnier → une …', 'une poissonnière'],
    ['un pilote → une …', 'une pilote'],
    ['un chanteur → une …', 'une chanteuse'],
    ['un acteur → une …', 'une actrice'],
    ['un journaliste → une …', 'une journaliste'],
    ['un coiffeur → une …', 'une coiffeuse'],
    ['un jardinier → une …', 'une jardinière'],
    ['un serveur → une …', 'une serveuse'],
    ['⭐ Rappelle-toi !', 'La plupart des féminins se forment en ajoutant -e au masculin. Exception : un ami → une amie.'],
  ])
});

// 6. QUIZ : la forme féminine (exercice 1 des affiches)
COURSES.push({
  title: 'Les métiers — je trouve la forme féminine', course_type: 'quiz', level: '5AP',
  description: "Choisis la forme féminine correcte de chaque métier (exercices des affiches « Les métiers »).",
  questions: [
    q('un maître → une …', 'maîtresse', 'maître', 'maîtrise'),
    q('un docteur → une …', 'docteure', 'doctrice', 'docteuse'),
    q('un chanteur → une …', 'chanteuse', 'chanteure', 'chantrice'),
    q('un boulanger → une …', 'boulangère', 'boulangeuse', 'boulangeure'),
    q('un acteur → une …', 'actrice', 'acteuse', 'acteure'),
    q('un ingénieur → une …', 'ingénieure', 'ingénieuse', 'ingénieurse'),
    q('un coiffeur → une …', 'coiffeuse', 'coiffeure', 'coiffrice'),
    q('un serveur → une …', 'serveuse', 'serveure', 'servrice'),
    q('un danseur → une …', 'danseuse', 'danseure', 'dansrice'),
    q('un pharmacien → une …', 'pharmacienne', 'pharmaciene', 'pharmacière'),
    q('un pâtissier → une …', 'pâtissière', 'pâtisseuse', 'pâtissienne'),
    q('un pilote → une …', 'pilote', 'pilotesse', 'pilotrice'),
  ]
});

// 7. QUIZ : la forme masculine (exercice 2 des affiches)
COURSES.push({
  title: 'Les métiers — je trouve la forme masculine', course_type: 'quiz', level: '5AP',
  description: "Choisis la forme masculine correcte de chaque métier (exercices des affiches « Les métiers »).",
  questions: [
    q('une maîtresse → un …', 'maître', 'maîtresseur', 'maîtrier'),
    q('une dentiste → un …', 'dentiste', 'dentisteur', 'dentistier'),
    q('une infirmière → un …', 'infirmier', 'infirmeur', 'infirmiste'),
    q('une policière → un …', 'policier', 'policeur', 'policien'),
    q('une boulangère → un …', 'boulanger', 'boulangeur', 'boulangier'),
    q('une pompière → un …', 'pompier', 'pompeur', 'pompiste'),
    q('une architecte → un …', 'architecte', 'architecteur', 'architectier'),
    q('une caissière → un …', 'caissier', 'caisseur', 'caissien'),
    q('une chanteuse → un …', 'chanteur', 'chanteux', 'chantier'),
    q('une actrice → un …', 'acteur', 'acteure', 'acteux'),
    q('une coiffeuse → un …', 'coiffeur', 'coiffier', 'coiffeux'),
    q('une jardinière → un …', 'jardinier', 'jardineur', 'jardiniste'),
  ]
});

// ═══════════ AFFICHE 4 : À LA, AU, CHEZ ═══════════

// 8. QUIZ : à la, au ou chez ? (exercices 1-3 de l'affiche)
COURSES.push({
  title: 'À la, au ou chez ? Les prépositions de lieu', course_type: 'quiz', level: '5AP',
  description: "« à la » + nom féminin, « au » + nom masculin, « chez » + nom de personne ou de famille. Choisis la bonne préposition (affiche « à la, au et chez »).",
  questions: [
    q('Elle va _______ pharmacie.', 'à la', 'au', 'chez'),
    q('Nous allons _______ jardin.', 'au', 'à la', 'chez'),
    q('Tu vas _______ cinéma.', 'au', 'à la', 'chez'),
    q('Il va _______ musée.', 'au', 'à la', 'chez'),
    q('Je vais _______ boulangerie.', 'à la', 'au', 'chez'),
    q('Nous allons _______ marché.', 'au', 'à la', 'chez'),
    q('Elle va _______ bibliothèque.', 'à la', 'au', 'chez'),
    q('Je vais _______ mon cousin.', 'chez', 'au', 'à la'),
    q('Elle va _______ sa tante.', 'chez', 'à la', 'au'),
    q('Tu vas _______ le dentiste.', 'chez', 'au', 'à la'),
    q('Il va _______ son grand-père.', 'chez', 'au', 'à la'),
    q('Nous allons _______ stade le samedi.', 'au', 'à la', 'chez'),
    q('Elles vont _______ médecin.', 'chez le', 'au', 'à la'),
    q('Je vais _______ maison de mon ami.', 'à la', 'au', 'chez'),
  ]
});

// 9. TEXTE À TROUS : compléter avec à la / au / chez
COURSES.push({
  title: 'Je complète avec à la, au ou chez', course_type: 'fillblank', level: '5AP',
  description: "Complète chaque phrase avec la bonne préposition de lieu : « à la » (nom féminin), « au » (nom masculin) ou « chez » (personne / famille).",
  content: { text: `Je vais [chez] mon ami pour jouer.
Elle va [chez] sa grand-mère chaque dimanche.
Nous allons [chez] nos amis ce soir.
Tu vas [chez] le dentiste demain matin.
Il est [au] parc avec son frère.
Je vais [à la] boulangerie acheter du pain.
Nous allons [au] stade pour le match.
Elle est [à la] maison avec ses parents.
Elles vont [chez] leur voisine.
Nous allons [à la] bibliothèque pour lire.` }
});

// ═══════════ AFFICHE 5 : PARLER FRANÇAIS (au, à la, à l', aux, du, de la, de l') ═══════════

// 10. CARTES MÉMOIRE : les articles contractés
COURSES.push({
  title: "Cartes mémoire : au, à la, à l', aux, du, de la, de l'", course_type: 'flashcards', level: '5AP',
  description: "Je mémorise les règles de l'affiche « Parler Français » : quel petit mot utiliser devant un nom masculin, féminin, à voyelle ou au pluriel.",
  content: fcCards([
    ['au + nom … ?', 'masculin → Je parle au professeur. Je pense au futur.'],
    ['à la + nom … ?', 'féminin → Je parle à la fille. Je pense à la liberté.'],
    ["à l' + nom … ?", "qui commence par une voyelle → Je parle à l'élève. Je pense à l'avenir."],
    ['aux + nom … ?', 'pluriel → Je parle aux amis. Je pense aux idées.'],
    ['du + nom … ?', 'masculin → Je parle du livre. Je parle du courage.'],
    ['de la + nom … ?', 'féminin → Je parle de la musique. Je parle de la patience.'],
    ["de l' + nom … ?", "qui commence par une voyelle → Je parle de l'art. Je parle de l'amitié."],
  ])
});

// 11. QUIZ : Parler Français — je choisis le bon mot
COURSES.push({
  title: "Parler Français — au, à la, à l', aux, du, de la ou de l' ?", course_type: 'quiz', level: '5AP',
  description: "Choisis le bon article contracté pour compléter chaque phrase (affiche « Parler Français »).",
  questions: [
    q('Je parle _______ professeur.', 'au', 'à la', "à l'", 'aux'),
    q('Je pense _______ futur.', 'au', 'à la', 'aux', "à l'"),
    q('Je parle _______ fille.', 'à la', 'au', 'aux', "à l'"),
    q('Je pense _______ liberté.', 'à la', 'au', "à l'", 'aux'),
    q('Je parle _______ élève.', "à l'", 'à la', 'au', 'aux'),
    q('Je pense _______ avenir.', "à l'", 'au', 'à la', 'aux'),
    q('Je parle _______ amis.', 'aux', 'au', 'à la', "à l'"),
    q('Je pense _______ idées.', 'aux', 'à la', 'au', "à l'"),
    q('Je parle _______ livre.', 'du', 'de la', "de l'", 'des'),
    q('Je parle _______ musique.', 'de la', 'du', "de l'", 'des'),
    q("Je parle _______ art.", "de l'", 'du', 'de la', 'des'),
    q("Je parle _______ amitié.", "de l'", 'de la', 'du', 'des'),
    q('Je parle _______ courage.', 'du', 'de la', "de l'", 'des'),
    q('Je parle _______ patience.', 'de la', 'du', "de l'", 'des'),
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
