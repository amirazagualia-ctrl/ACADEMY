// Import des cours interactifs à partir du cahier de vacances "Français"
// Usage : node scripts/seed_interactive_cahier.mjs
import { readFileSync } from 'fs';

// Secrets lus depuis .dev.vars (jamais dans le code)
const envTxt = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8');
const envGet = k => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim();
const KEY = envGet('SUPABASE_SERVICE_KEY');
const SB = (envGet('SUPABASE_URL') || '').replace(/\/$/, '') + '/rest/v1';
if (!KEY || !SB.startsWith('http')) { console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY manquants dans .dev.vars'); process.exit(1); }
const SUBJ_FR = 2; // Français

const q = (question, correctFirst, ...wrong) => {
  // Mélange déterministe simple : bonne réponse à une position variable
  const options = [correctFirst, ...wrong];
  const pos = question.length % options.length;
  const arr = [...options];
  const [c] = arr.splice(0, 1);
  arr.splice(pos, 0, c);
  return { question, options: arr.concat(Array(Math.max(0, 4 - arr.length)).fill('')), correct: pos };
};

const COURSES = [];

// ============ QUIZ DE LECTURE / COMPRÉHENSION ============
COURSES.push({
  title: 'Lecture 1 : Le petit jardin', course_type: 'quiz', level: '2AP',
  description: `Lina aime le jardin de son grand-père.
Chaque matin, elle arrose les fleurs avec un petit arrosoir.
Elle regarde les papillons qui volent de fleur en fleur.
Dans le jardin, il y a aussi un grand arbre.
Un petit oiseau chante sur une branche.
Lina est très heureuse dans ce joli jardin.`,
  questions: [
    q("Comment s'appelle la petite fille ?", 'Lina', 'Léa', 'Sara'),
    q('Que fait Lina chaque matin ?', 'Elle arrose les fleurs', 'Elle regarde la télévision', 'Elle joue au ballon'),
    q('Que regarde-t-elle dans le jardin ?', 'Les papillons', 'Les voitures', 'Les avions'),
    q('Qui chante sur une branche ?', 'Un petit oiseau', 'Un chat', 'Un coq'),
    q('Vrai ou Faux : il y a un poisson dans le jardin.', 'Faux', 'Vrai'),
    q('Je trouve le titre du texte :', 'Le petit jardin', 'Le petit chat', 'Le petit bateau'),
  ]
});

COURSES.push({
  title: 'Lecture 2 : Le chat de Sami', course_type: 'quiz', level: '2AP',
  description: `Sami a un petit chat. Il s'appelle Mimi.
Mimi a les poils doux. Il est gris et blanc.
Chaque soir, Mimi joue avec une pelote de laine.
Il court, saute et se cache sous le canapé.
Sami aime beaucoup son chat.
Il lui donne du lait et des croquettes.
Mimi est son meilleur ami.`,
  questions: [
    q('Qui a un petit chat ?', 'Sami', 'Lina', 'Noé'),
    q("Comment s'appelle le chat ?", 'Mimi', 'Max', 'Minou'),
    q('Mimi est :', 'gris et blanc', 'noir et blanc', 'marron et blanc'),
    q('Chaque soir, Mimi :', 'joue avec une pelote', 'dort', 'mange'),
    q('Sami donne à Mimi :', 'du lait et des croquettes', "de l'eau", 'des bonbons'),
    q('Vrai ou Faux : Sami a un chien.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 3 : Une journée à la plage', course_type: 'quiz', level: '2AP',
  description: `Aujourd'hui, c'est dimanche.
Noé et sa famille vont à la plage.
Le soleil brille dans le ciel bleu.
Noé porte un chapeau et des lunettes.
Il joue dans le sable et construit un beau château.
Sa sœur Léa ramasse des coquillages.
Le papa nage dans la mer.
La maman lit un livre sous le parasol.
Le pique-nique est délicieux !
Noé adore les journées à la plage avec sa famille.`,
  questions: [
    q('Quel jour est-ce ?', 'Dimanche', 'Lundi', 'Samedi'),
    q('Que construit Noé dans le sable ?', 'Un château', 'Un avion', 'Une maison'),
    q('Que fait sa sœur Léa ?', 'Elle ramasse des coquillages', 'Elle nage', 'Elle lit un livre'),
    q('Où nage le papa ?', 'Dans la mer', 'Dans la piscine', 'Dans le lac'),
    q('Que fait la maman ?', 'Elle lit un livre sous le parasol', 'Elle nage', 'Elle dort'),
    q('Vrai ou Faux : Noé et sa famille vont à la montagne.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 4 : Le petit écureuil', course_type: 'quiz', level: '3AP',
  description: `Dans la forêt, vit un petit écureuil roux.
Il s'appelle Noisette.
Noisette a une grande queue et deux petites oreilles.
Chaque matin, il cherche des noisettes et des glands.
Il les cache sous les feuilles pour l'hiver.
Noisette grimpe aux arbres très vite.
Il saute de branche en branche avec agilité.
Le soir, il rentre dans son nid douillet.
Noisette est très malin et très rapide !`,
  questions: [
    q('Noisette est un écureuil :', 'roux', 'gris', 'noir'),
    q('Que cherche Noisette chaque matin ?', 'des noisettes et des glands', 'des pommes', 'des bonbons'),
    q('Où cache-t-il ses noisettes ?', 'sous les feuilles', 'sous les pierres', 'dans la rivière'),
    q('Comment grimpe-t-il aux arbres ?', 'très vite', 'lentement', 'en marchant'),
    q('Le soir, il rentre dans :', 'son nid douillet', 'sa niche', 'sa maison'),
    q('Vrai ou Faux : Noisette est un écureuil gris.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 5 : Le petit chien Max', course_type: 'quiz', level: '3AP',
  description: `Max est un petit chien très joueur.
Il a un pelage blanc avec des taches marron.
Max aime courir après sa balle rouge.
Chaque après-midi, son maître Léo le sort au parc.
Max rencontre ses amis : Rocky le chien noir et Bella la chienne blanche.
Ils jouent ensemble et s'amusent beaucoup.
Le soir, Max est fatigué et dort dans son panier douillet.
Léo adore son petit chien Max.`,
  questions: [
    q('Que fait Max ?', 'Il court après sa balle', 'Il lit un livre', 'Il regarde la télévision'),
    q('Qui sort Max au parc ?', 'Léo', 'Son papa', 'Sa maman'),
    q('Avec qui joue Max au parc ?', 'Avec Rocky et Bella', 'Avec un chat et un lapin', 'Avec des oiseaux'),
    q('De quelle couleur est la balle de Max ?', 'Rouge', 'Bleue', 'Verte'),
    q('Le soir, Max dort dans :', 'son panier douillet', 'sa niche', 'le lit de Léo'),
    q('Vrai ou Faux : Max est un chat.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: "Lecture 6 : La fête de l'école", course_type: 'quiz', level: '3AP',
  description: `Aujourd'hui, c'est la fête de l'école.
Les enfants sont très contents.
Ils ont préparé des chansons, des poésies et des danses.
Lina récite un joli poème sur la nature.
Amine chante une belle chanson avec ses amis.
Les élèves dansent sur la scène.
Le maître présente le spectacle.
Les parents applaudissent et prennent des photos.
À la fin, il y a des gâteaux et des jus pour tout le monde.
C'est une belle journée que les enfants n'oublieront pas !`,
  questions: [
    q('Que préparent les enfants ?', 'des chansons, des poésies et des danses', 'des gâteaux', 'des cadeaux'),
    q('Qui présente le spectacle ?', 'Le maître', 'Lina', 'Les parents'),
    q('Que prennent les parents ?', 'des photos', 'des livres', 'des ballons'),
    q('Que récite Lina ?', 'un joli poème sur la nature', 'une chanson', 'une histoire'),
    q("Qu'y a-t-il à la fin de la fête ?", 'des gâteaux et des jus', 'des cadeaux', 'des livres'),
    q('Vrai ou Faux : Amine joue au football.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 7 : Le marché du village', course_type: 'quiz', level: '3AP',
  description: `Chaque samedi matin, le village s'anime.
Les habitants vont au marché.
On y trouve des fruits, des légumes, du pain, du fromage et du miel.
Le marchand de fruits vend des oranges, des pommes et des bananes.
La maraîchère propose des tomates, des carottes et des salades.
Le boulanger vend du pain chaud et de délicieuses pâtisseries.
Les enfants aiment beaucoup aller au marché avec leurs parents.
Ils découvrent de bonnes odeurs, des couleurs et des saveurs.
Le marché est un lieu de rencontre et de bonheur !`,
  questions: [
    q('Quel jour a lieu le marché ?', 'Le samedi', 'Le vendredi', 'Le lundi'),
    q('Que vend le marchand de fruits ?', 'Des oranges, des pommes et des bananes', 'Du pain', 'Du fromage'),
    q('Que propose la maraîchère ?', 'Des tomates, des carottes et des salades', 'Du miel', 'Des pâtisseries'),
    q('Que vend le boulanger ?', 'Du pain chaud et des pâtisseries', 'Du poisson', 'Des fruits'),
    q('Pourquoi les enfants aiment-ils aller au marché ?', "Parce qu'ils découvrent des couleurs et des odeurs", "Parce qu'ils s'ennuient", "Parce qu'ils doivent acheter des livres"),
    q('Vrai ou Faux : le boulanger vend du poisson.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 9 : Le chaton perdu', course_type: 'quiz', level: '3AP',
  description: `Un petit chaton gris s'est perdu dans la rue.
Il miaule doucement et cherche sa maman.
Lina le voit près d'un arbre.
Elle s'approche et le prend avec douceur dans ses bras.
Elle lui donne du lait et un peu de nourriture.
Le chaton mange et se calme.
Lina affiche une annonce pour retrouver le propriétaire du chaton.
Le lendemain matin, une petite fille vient chez Lina.
C'est sa chatte Minou ! Elle remercie Lina avec joie.
Le chaton retrouve sa maison et tout le monde est heureux.`,
  questions: [
    q("Où s'est perdu le chaton ?", 'Dans la rue', 'Dans le jardin', 'Dans la forêt'),
    q('Qui trouve le chaton ?', 'Lina', 'Une dame', 'Le policier'),
    q('Que donne Lina au chaton ?', 'Du lait et de la nourriture', 'Des bonbons', "De l'herbe"),
    q('Que fait Lina pour retrouver le propriétaire ?', 'Elle affiche une annonce', 'Elle demande aux voisins', 'Elle cherche sur Internet'),
    q('Qui vient le lendemain matin ?', 'La petite fille', 'Le voisin', 'Le policier'),
    q('Vrai ou Faux : le chaton est noir.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 10 : Le petit jardinier', course_type: 'quiz', level: '4AP',
  description: `Yassine est un petit garçon qui aime la nature.
Il rêve d'avoir un joli jardin.
Un jour, son grand-père lui offre des graines de fleurs et de légumes.
Yassine prépare la terre avec soin. Il creuse, retourne la terre et enlève les cailloux.
Il plante les graines une à une, puis il arrose avec précaution.
Chaque jour, il prend soin de son jardin avec patience et amour.
Quelques semaines plus tard, les graines poussent et deviennent de belles plantes vertes.
Des fleurs colorées s'ouvrent et des légumes délicieux grandissent.
Yassine est très fier de son jardin.
Il comprend que le travail et la patience apportent toujours de beaux résultats.`,
  questions: [
    q("Que fait Yassine au début de l'histoire ?", "Il rêve d'avoir un joli jardin", 'Il joue au ballon', 'Il prépare un gâteau'),
    q("Qu'est-ce que son grand-père lui offre ?", 'Des graines', 'Des livres', 'Des jouets'),
    q('Comment arrose-t-il les graines ?', 'Avec précaution', 'Très rapidement', 'Jamais'),
    q('Que fait Yassine pour préparer la terre ?', 'Il creuse et enlève les cailloux', 'Il plante un arbre', 'Il construit un mur'),
    q("Que comprend Yassine à la fin de l'histoire ?", 'Le travail et la patience apportent de beaux résultats', "Il faut jouer tous les jours", "Les jardins poussent tout seuls"),
    q('Vrai ou Faux : Yassine arrose ses plantes sans précaution.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 11 : Une journée à la plage (vacances)', course_type: 'quiz', level: '4AP',
  description: `C'est le début des vacances !
Yassine, Lina et leurs parents partent à la plage. Ils arrivent le matin.
Le soleil brille et le ciel est bleu. Les enfants sont très contents !
Ils installent le parasol et étalent la grande nappe sur le sable.
Le papa prépare un délicieux pique-nique.
La maman sort les jus de fruits et les sandwichs.
Après le repas, Yassine et Lina jouent au ballon.
Ils construisent aussi un grand château de sable.
Puis, ils vont se baigner. L'eau est fraîche et agréable.
En fin d'après-midi, ils se promènent au bord de la mer et ramassent des coquillages et des petits cailloux.
Le soir, ils rentrent à la maison, fatigués mais heureux.
C'était une magnifique journée !`,
  questions: [
    q("Quelle est la saison de l'histoire ?", "L'été", "L'hiver", 'Le printemps'),
    q("Que font-ils d'abord à la plage ?", 'Ils installent le parasol', 'Ils se baignent', 'Ils jouent au ballon'),
    q('Que fait la maman ?', 'Elle sort les jus et les sandwichs', 'Elle prend des photos', 'Elle lit un livre'),
    q("Comment est l'eau ?", 'Fraîche et agréable', 'Chaude et salée', 'Froide'),
    q("Que ramassent-ils en fin d'après-midi ?", 'Des coquillages et des cailloux', 'Des fleurs', 'Des feuilles'),
    q('Vrai ou Faux : ils arrivent à la plage le soir.', 'Faux', 'Vrai'),
  ]
});

COURSES.push({
  title: 'Lecture 12 : Le petit scientifique', course_type: 'quiz', level: '4AP',
  description: `Rami est un petit garçon curieux et passionné.
Il aime poser des questions et chercher des réponses.
Un jour, il décide de réaliser une expérience simple : comment faire pousser une plante ?
Il prend un pot, de la terre et une petite graine de haricot.
Il arrose la graine avec un peu d'eau et place le pot près de la fenêtre.
Chaque jour, Rami observe. Il note ce qu'il voit dans son petit carnet :
« Jour 1 : rien ne change. Jour 3 : la graine gonfle. Jour 5 : une petite pousse ! »
Rami est heureux et fier quand la plante grandit.
Il comprend que la patience et le soin donnent de beaux résultats.
Plus tard, il veut devenir un grand scientifique pour découvrir encore plus de secrets de la nature.`,
  questions: [
    q('Que veut faire Rami ?', 'Faire pousser une plante', 'Construire une fusée', 'Élever un animal'),
    q('Que met-il dans le pot ?', 'De la terre et une graine', 'Du sable et une graine', 'Des pierres et du sable'),
    q('Que voit-il au jour 5 ?', 'Une petite pousse', 'Rien ne change', 'La plante meurt'),
    q('Où place-t-il le pot ?', 'Près de la fenêtre', 'Sous le lit', 'Dans le garage'),
    q('Que veut devenir Rami plus tard ?', 'Un grand scientifique', 'Un footballeur', 'Un chanteur'),
    q('Vrai ou Faux : Rami arrose la graine avec beaucoup d\'eau.', 'Faux', 'Vrai'),
  ]
});

// ============ QUIZ DE GRAMMAIRE ============
COURSES.push({
  title: 'Grammaire : Le nom et le déterminant', course_type: 'quiz', level: '3AP',
  description: "Le nom désigne une personne, un animal ou une chose. Le déterminant accompagne le nom (le, la, l', un, une, des).",
  questions: [
    q('……… éléphant marche lentement.', "L'", 'Le', 'La'),
    q("J'ai ……… frère et ……… sœur.", 'un – une', 'une – un', 'des – des'),
    q('Regarde ……… beaux oiseaux !', 'les', 'le', 'la'),
    q('……… chien est fidèle à son maître.', 'Le', 'Des', 'Un'),
    q('……… pomme est rouge et sucrée.', 'La', 'Le', 'Les'),
    q('……… école est grande.', "L'", 'La', 'Le'),
  ]
});

COURSES.push({
  title: 'Grammaire : Le verbe et le sujet', course_type: 'quiz', level: '3AP',
  description: "Le verbe dit ce que fait le sujet. Le sujet est la personne, l'animal ou la chose qui fait l'action. On le trouve en posant la question : « Qui est-ce qui ? »",
  questions: [
    q('Le chat ……… sur le coussin. (verbe qui convient)', 'dort', 'mange', 'dessine'),
    q('Le garçon ……… dans le parc.', 'joue', 'dort', 'coud'),
    q('Nous ……… un beau dessin.', 'dessinons', 'dormons', 'courons'),
    q("L'oiseau ……… des graines.", 'mange', 'joue', 'dessine'),
    q('Quel est le sujet : « La voiture roule vite sur la route. »', 'La voiture', 'roule', 'la route'),
    q('Quel est le sujet : « Les élèves écoutent le maître. »', 'Les élèves', 'écoutent', 'le maître'),
  ]
});

COURSES.push({
  title: 'Grammaire : Le singulier et le pluriel', course_type: 'quiz', level: '3AP',
  description: "Le singulier désigne une seule personne ou chose (un livre). Le pluriel en désigne plusieurs (des livres).",
  questions: [
    q('« des oiseaux » est au :', 'pluriel', 'singulier'),
    q('« un chat » est au :', 'singulier', 'pluriel'),
    q('Le pluriel de « une fleur » est :', 'des fleurs', 'des fleur', 'une fleurs'),
    q('Le singulier de « des voitures » est :', 'une voiture', 'des voiture', 'un voitures'),
    q('Le jardinier arrose les ……… (fleur)', 'fleurs', 'fleur'),
    q('Les élèves ……… une chanson.', 'chantent', 'chante'),
  ]
});

COURSES.push({
  title: 'Grammaire : Le masculin et le féminin', course_type: 'quiz', level: '4AP',
  description: "Le masculin : un garçon, un chien, un roi. Le féminin : une fille, une chienne, une reine.",
  questions: [
    q('Le féminin de « un prince » est :', 'une princesse', 'une prince', 'une princière'),
    q('Le féminin de « un lion » est :', 'une lionne', 'une lion', 'une lione'),
    q('Le féminin de « un acteur » est :', 'une actrice', 'une acteure', 'une acteuse'),
    q('Le masculin de « une chanteuse » est :', 'un chanteur', 'un chanteux', 'un chantant'),
    q('Le féminin de « un cheval » est :', 'une jument', 'une chevale', 'une chevaline'),
    q('Le masculin de « une poule » est :', 'un coq', 'un poulet', 'un poul'),
  ]
});

COURSES.push({
  title: 'Grammaire : Les adjectifs', course_type: 'quiz', level: '4AP',
  description: "L'adjectif donne des informations sur le nom : la taille, la couleur, la forme, le goût, la qualité…",
  questions: [
    q('Elle porte une robe ……… .', 'bleue', 'bleu', 'bleus'),
    q("C'est un chat ……… .", 'blanc', 'blanche', 'blancs'),
    q('Nous avons visité un château ……… .', 'ancien', 'ancienne', 'anciens'),
    q("J'aime les pommes ……… .", 'vertes', 'vert', 'verte'),
    q('Le petit garçon a des yeux ……… .', 'marron', 'marrons', 'marronne'),
    q('Quel est l\'adjectif : « Le petit chat noir dort sur le tapis. »', 'petit et noir', 'chat', 'tapis'),
  ]
});

COURSES.push({
  title: 'Jeu de mots : je remets la phrase en ordre', course_type: 'quiz', level: '2AP',
  description: 'Remets les mots dans le bon ordre pour former une phrase correcte.',
  questions: [
    q('chat / Le / dort / . / sur / le / tapis', 'Le chat dort sur le tapis.', 'Le tapis dort sur le chat.', 'Dort le chat sur le tapis.'),
    q('mange / La / pomme / . / fille / une', 'La fille mange une pomme.', 'La pomme mange une fille.', 'Une fille la pomme mange.'),
    q("à / école / Lina / . / va / l'", "Lina va à l'école.", "L'école va à Lina.", "Va Lina à l'école."),
    q('joue / Le / ballon / . / au / garçon', 'Le garçon joue au ballon.', 'Le ballon joue au garçon.', 'Au ballon le garçon joue.'),
    q('lisent / Les / livre / . / un / enfants', 'Les enfants lisent un livre.', 'Un livre lisent les enfants.', 'Les livre lisent un enfants.'),
    q('brille / soleil / . / Le', 'Le soleil brille.', 'Brille le soleil.', 'Le brille soleil.'),
  ]
});

// ============ FLASHCARDS DE VOCABULAIRE ============
const fcCards = pairs => ({ cards: pairs.map(([front, back]) => ({ front, back })) });

COURSES.push({
  title: 'Vocabulaire : Les couleurs et les saisons', course_type: 'flashcards', level: '2AP',
  description: 'Cartes mémoire pour réviser les couleurs et les saisons.',
  content: fcCards([
    ['🔴 Cette couleur est…', 'rouge'], ['🔵 Cette couleur est…', 'bleu'], ['🟡 Cette couleur est…', 'jaune'],
    ['🟢 Cette couleur est…', 'vert'], ['🟠 Cette couleur est…', 'orange'], ['🟣 Cette couleur est…', 'violet'],
    ['⚫ Cette couleur est…', 'noir'], ['⚪ Cette couleur est…', 'blanc'],
    ['Il fait doux, les fleurs poussent. Quelle saison ?', 'Le printemps 🌸'],
    ['Il fait chaud, on va à la plage. Quelle saison ?', "L'été ☀️"],
    ['Il fait frais, les feuilles tombent. Quelle saison ?', "L'automne 🍂"],
    ['Il fait froid, il neige. Quelle saison ?', "L'hiver ⛄"],
  ])
});

COURSES.push({
  title: 'Vocabulaire : Les animaux et leurs petits', course_type: 'flashcards', level: '2AP',
  description: 'Je relie chaque animal à son petit et je nomme les animaux.',
  content: fcCards([
    ['Le petit de la vache est…', 'le veau 🐄'], ['Le petit de la brebis est…', "l'agneau 🐑"],
    ['Le petit de la chatte est…', 'le chaton 🐱'], ['Le petit de la chienne est…', 'le chiot 🐶'],
    ['Le petit de la lapine est…', 'le lapereau 🐰'], ['Le petit de la poule est…', 'le poussin 🐤'],
    ["L'oiseau a des…", 'plumes 🐦'], ['Le lapin a des poils très…', 'doux 🐰'],
    ['Le poisson a des…', 'écailles 🐟'], ['Le lion a une…', 'fourrure 🦁'],
  ])
});

COURSES.push({
  title: 'Vocabulaire : Les fruits et les légumes', course_type: 'flashcards', level: '2AP',
  description: 'Je nomme les fruits et les légumes et leurs couleurs.',
  content: fcCards([
    ['🍎 Ce fruit est…', 'la pomme (rouge)'], ['🍌 Ce fruit est…', 'la banane (jaune)'],
    ['🍊 Ce fruit est…', "l'orange"], ['🍓 Ce fruit est…', 'la fraise'],
    ['🍇 Ce fruit est…', 'le raisin'], ['🍉 Ce fruit est…', 'la pastèque'],
    ['🥕 Ce légume est…', 'la carotte (orange)'], ['🍅 Ce légume est…', 'la tomate (rouge)'],
    ['🥒 Ce légume est…', 'le concombre'], ['🍆 Ce légume est…', "l'aubergine"],
    ['🥬 Ce légume est…', 'la laitue (verte)'],
  ])
});

COURSES.push({
  title: 'Vocabulaire : Les vêtements et les transports', course_type: 'flashcards', level: '3AP',
  description: 'Je nomme les vêtements et les moyens de transport.',
  content: fcCards([
    ['👕 Ce vêtement est…', 'le t-shirt'], ['🧥 Ce vêtement est…', 'la veste'],
    ['👖 Ce vêtement est…', 'le pantalon'], ['👗 Ce vêtement est…', 'la robe'],
    ['👟 Ce sont…', 'les chaussures'], ['🧦 Ce sont…', 'les chaussettes'],
    ['🚗 Ce moyen de transport est…', 'la voiture (sur la route)'],
    ['🚲 Ce moyen de transport est…', 'le vélo'], ['🚆 Il roule sur les rails :', 'le train'],
    ['✈️ Il se déplace dans les airs :', "l'avion"], ["⛵ Il se déplace sur l'eau :", 'le bateau'],
    ['🚌 Je prends le ……… pour aller à l\'école.', 'bus'],
  ])
});

COURSES.push({
  title: 'Vocabulaire : La famille et la maison', course_type: 'flashcards', level: '3AP',
  description: 'Je nomme les membres de la famille et les pièces de la maison.',
  content: fcCards([
    ['Le papa de mon papa est mon…', 'grand-père 👴'], ['La maman de ma maman est ma…', 'grand-mère 👵'],
    ['Le fils de mes parents est mon…', 'frère 👦'], ['La fille de mes parents est ma…', 'sœur 👧'],
    ['Je dors dans…', 'la chambre 🛏️'], ['Je prends le bain dans…', 'la salle de bain 🛁'],
    ['Je regarde la télévision dans…', 'le salon 🛋️'], ['Je cuisine dans…', 'la cuisine 🍳'],
  ])
});

COURSES.push({
  title: "Vocabulaire : L'école et les métiers", course_type: 'flashcards', level: '3AP',
  description: "Je nomme les objets de l'école et je relie chaque métier à ce que fait la personne.",
  content: fcCards([
    ["J'écris avec…", 'le crayon ✏️'], ['Je gomme avec…', 'la gomme'], ['Je mesure avec…', 'la règle 📏'],
    ['Je range mes affaires dans…', 'le cartable 🎒'], ["J'écris mes leçons au…", 'tableau'],
    ['Il soigne les malades :', 'le médecin 👨‍⚕️'], ['Il assure la sécurité :', 'le policier 👮'],
    ['Il enseigne aux élèves :', "l'enseignant 👨‍🏫"], ['Il fabrique le pain :', 'le boulanger 👨‍🍳'],
    ['Il éteint les incendies :', 'le pompier 👨‍🚒'], ['Il coupe les cheveux :', 'le coiffeur 💇'],
  ])
});

COURSES.push({
  title: 'Conjugaison : Être et Avoir au présent', course_type: 'flashcards', level: '4AP',
  description: 'Je révise les verbes ÊTRE et AVOIR au présent avec des cartes mémoire.',
  content: fcCards([
    ['Je … (être)', 'Je suis'], ['Tu … (être)', 'Tu es'], ['Il / Elle … (être)', 'Il est / Elle est'],
    ['Nous … (être)', 'Nous sommes'], ['Vous … (être)', 'Vous êtes'], ['Ils / Elles … (être)', 'Ils sont / Elles sont'],
    ["J'… (avoir)", "J'ai"], ['Tu … (avoir)', 'Tu as'], ['Il / Elle … (avoir)', 'Il a / Elle a'],
    ['Nous … (avoir)', 'Nous avons'], ['Vous … (avoir)', 'Vous avez'], ['Ils / Elles … (avoir)', 'Ils ont / Elles ont'],
  ])
});

// ============ TEXTES À TROUS ============
COURSES.push({
  title: 'Je complète : Le petit jardin', course_type: 'fillblank', level: '2AP',
  description: 'Complète le texte de la Lecture 1 avec les mots qui manquent.',
  content: { text: `Lina aime le jardin de son grand-père.
Chaque matin, elle arrose les [fleurs] avec un petit arrosoir.
Le petit [oiseau] chante sur une branche.
Il y a un grand [arbre] dans le jardin.
Le jardin est très [joli].` }
});

COURSES.push({
  title: 'Je complète : Le chat de Sami', course_type: 'fillblank', level: '2AP',
  description: 'Complète le texte de la Lecture 2 avec les mots qui manquent.',
  content: { text: `Sami a un petit [chat].
Le chat s'appelle [Mimi].
Mimi a les poils [doux].
Il joue avec une pelote de [laine].
Sami donne du [lait] et des [croquettes] à Mimi.` }
});

COURSES.push({
  title: 'Je complète : Une journée à la plage', course_type: 'fillblank', level: '2AP',
  description: 'Complète le texte de la Lecture 3 avec les mots qui manquent.',
  content: { text: `Noé et sa famille vont à la [plage].
Noé construit un beau [château].
Léa ramasse des [coquillages].
Le papa nage dans la [mer].
La maman lit un [livre] sous le parasol.
Le pique-nique est [délicieux].` }
});

COURSES.push({
  title: 'Je complète : Le petit écureuil', course_type: 'fillblank', level: '3AP',
  description: 'Complète le texte de la Lecture 4 avec les mots qui manquent.',
  content: { text: `Noisette est un petit écureuil [roux].
Il a une grande [queue].
Chaque matin, il cherche des [noisettes] et des [glands].
Il cache ses noisettes sous les [feuilles].
Le soir, il rentre dans son nid [douillet].` }
});

COURSES.push({
  title: 'Conjugaison : les verbes du 1er groupe', course_type: 'fillblank', level: '4AP',
  description: "Conjugue les verbes entre parenthèses au présent (terminaisons : -e, -es, -e, -ons, -ez, -ent).",
  content: { text: `Je (chanter) [chante] une chanson.
Tu (aimer) [aimes] les animaux.
Il (jouer) [joue] au football.
Nous (parler) [parlons] doucement.
Vous (regarder) [regardez] la télévision.
Elles (danser) [dansent] avec joie.
Je (dessiner) [dessine] un beau paysage.` }
});

COURSES.push({
  title: 'Orthographe : les sons [s], [z] et [g]', course_type: 'fillblank', level: '4AP',
  description: "Complète avec la bonne lettre : s, ss, c, ç, z ou g/gu.",
  content: { text: `Le [s]corpion vit dans le désert.
Le gar[ç]on joue au ballon dans la cour.
Le [z]èbre a des rayures noires et blanches.
Nous avons visité le [z]oo du parc.
La mai[s]on est grande et blanche.
La [gu]itare joue une jolie mélodie.
Le [g]âteau d'anniversaire est délicieux.` }
});

COURSES.push({
  title: 'Orthographe : les sons [an] et [on]', course_type: 'fillblank', level: '4AP',
  description: 'Complète avec : an, en, am, em, on ou om.',
  content: { text: `Le petit élép[han]t joue dans le jardin.
Elle porte un ch[an]dail et un pull.
La m[ai]son de mon oncle est grande.
Le ciel est gris et s[om]bre.
Nous chantons une chans[on].
Le jamb[on] n'est pas un légume.` }
});

COURSES.push({
  title: 'Bilan : Être, Avoir et les mots outils', course_type: 'fillblank', level: '4AP',
  description: "Complète avec le verbe être ou avoir, puis avec le bon mot outil (et, sur, dans, chez, avec).",
  content: { text: `Je [suis] à la maison.
Tu [es] mon ami.
Il [est] très gentil.
Nous [sommes] à l'école.
J'[ai] un sac à dos.
Ils [ont] un ballon.
Le chien [et] le chat jouent ensemble.
Le livre est [dans] le sac.
Le cahier est [sur] la table.
Nous allons [chez] papi et mamie.` }
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

