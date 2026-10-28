// Génère src/install-sql.ts : SQL complet (schema.sql + migrations, sauf 0019 réservée à la base maître) à exécuter dans le SQL Editor du Supabase d'un nouvel établissement.
import fs from 'fs'
const parts = ['-- ============================================================', '-- Rahma Academy Platform — installation complète d\'une base ÉTABLISSEMENT', '-- Collez ce script dans Supabase → SQL Editor → Run (idempotent : IF NOT EXISTS).', '-- ============================================================', '', fs.readFileSync('schema.sql', 'utf8')]
for (const f of fs.readdirSync('migrations').filter(f => f.endsWith('.sql') && !f.startsWith('0019')).sort()) parts.push(`\n-- ---------- migrations/${f} ----------\n` + fs.readFileSync('migrations/' + f, 'utf8'))
parts.push(`\n-- ---------- Buckets de stockage (photos, cours, devoirs) ----------\nINSERT INTO storage.buckets (id, name, public) VALUES ('photos','photos',true), ('courses','courses',true), ('homeworks','homeworks',true) ON CONFLICT (id) DO NOTHING;\n`)
const sql = parts.join('\n')
fs.writeFileSync('src/install-sql.ts', `// Fichier GÉNÉRÉ par scripts_gen_install_sql.mjs — ne pas éditer à la main (npm run gen:sql)\nexport const INSTALL_SQL = ${JSON.stringify(sql)}\n`)
console.log('install-sql.ts', sql.length, 'chars')
