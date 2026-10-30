// Génère src/install-sql.ts : SQL complet (schema.sql + migrations, sauf 0019 réservée à la base maître) à exécuter dans le SQL Editor du Supabase d'un nouvel établissement.
// Différences avec schema.sql (base Rahma) :
//  - pas de DROP TABLE initial (ré-exécution sans risque sur une base déjà remplie)
//  - pas de données d'exemple (élèves / enseignants / classes / frais / événements), pas de compte admin générique
//    → l'établissement démarre VIDE ; le compte administrateur est créé par l'assistant d'inscription.
//  - on conserve : matières par cycle + paramètres de notifications par défaut.
import fs from 'fs'

let schema = fs.readFileSync('schema.sql', 'utf8')

// 1) Retirer le bloc DROP TABLE ... CASCADE;
schema = schema.replace(/-- Suppression des anciennes tables[^\n]*\nDROP TABLE IF EXISTS[\s\S]*?CASCADE;\n/, '')

// 2) Couper la section "DONNÉES INITIALES" et ne garder que les matières
const idx = schema.indexOf('-- DONNÉES INITIALES')
if (idx < 0) throw new Error('Marqueur DONNÉES INITIALES introuvable dans schema.sql')
const structure = schema.slice(0, schema.lastIndexOf('-- ====', idx))
const seedSrc = schema.slice(idx)
const subjects = (seedSrc.match(/-- Matières par cycle\nINSERT INTO subjects[\s\S]*?;\n/) || [''])[0]
if (!subjects) throw new Error('Bloc matières introuvable dans schema.sql')

const tenantSeed = `-- ============================================================
-- DONNÉES INITIALES (établissement) — aucune donnée de démonstration
-- ============================================================

${subjects}
-- Paramètres de notifications par défaut (les infos de l'établissement sont écrites par l'assistant d'inscription)
INSERT INTO settings (key, value) VALUES
 ('notifications', '{"email_absence":true,"email_frais":true,"email_note":true,"sms_absence":false,"sms_frais":false,"sms_note":false}')
ON CONFLICT (key) DO NOTHING;
`

const parts = ['-- ============================================================', '-- Rahma Academy Platform — installation complète d\'une base ÉTABLISSEMENT', '-- Collez ce script dans Supabase → SQL Editor → Run (idempotent : IF NOT EXISTS, aucune donnée de démonstration).', '-- ============================================================', '', structure, tenantSeed]
for (const f of fs.readdirSync('migrations').filter(f => f.endsWith('.sql') && !f.startsWith('0019')).sort()) parts.push(`\n-- ---------- migrations/${f} ----------\n` + fs.readFileSync('migrations/' + f, 'utf8'))
parts.push(`\n-- ---------- Buckets de stockage (photos, cours, devoirs) ----------\nINSERT INTO storage.buckets (id, name, public) VALUES ('photos','photos',true), ('courses','courses',true), ('homeworks','homeworks',true) ON CONFLICT (id) DO NOTHING;\n`)
const sql = parts.join('\n')
if (/Youssef|admin@rahma-ecole\.tn|DROP TABLE/.test(sql)) throw new Error('Le SQL établissement contient encore des données de démonstration / DROP TABLE')
fs.writeFileSync('src/install-sql.ts', `// Fichier GÉNÉRÉ par scripts_gen_install_sql.mjs — ne pas éditer à la main (npm run gen:sql)\nexport const INSTALL_SQL = ${JSON.stringify(sql)}\n`)
console.log('install-sql.ts', sql.length, 'chars')
