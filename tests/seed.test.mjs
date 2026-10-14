// Tests du seed du référentiel : node tests/seed.test.mjs
import fs from 'fs';
const J = n => JSON.parse(fs.readFileSync(new URL(`../seed/${n}.json`, import.meta.url), 'utf8'));
const cycles = J('cycles'), levels = J('levels'), sections = J('sections'), subjects = J('subjects'), ls = J('level_subjects'), domains = J('domains'), etypes = J('exercise_types'), chapters = J('chapters');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('✗', m); } };
const uniq = (arr, k, name) => { const s = new Set(); for (const x of arr) { ok(!s.has(x[k]), `${name}: doublon ${k}=${x[k]}`); s.add(x[k]); } };
const tri = (arr, name) => arr.forEach(x => ok(x.name_ar && x.name_fr && x.name_en, `${name} ${x.code}: 3 langues requises`));
uniq(cycles, 'code', 'cycles'); uniq(levels, 'code', 'levels'); uniq(levels, 'legacy_code', 'levels'); uniq(sections, 'code', 'sections'); uniq(subjects, 'code', 'subjects'); uniq(domains, 'code', 'domains'); uniq(etypes, 'code', 'exercise_types'); uniq(chapters, 'code', 'chapters');
[cycles, levels, sections, subjects, domains, etypes, chapters].forEach((a, i) => tri(a, ['cycles', 'levels', 'sections', 'subjects', 'domains', 'etypes', 'chapters'][i]));
const C = new Set(cycles.map(c => c.code)), L = new Set(levels.map(l => l.code)), S = new Set(sections.map(s => s.code)), U = new Set(subjects.map(s => s.code));
levels.forEach(l => ok(C.has(l.cycle), `level ${l.code}: cycle inconnu ${l.cycle}`));
sections.forEach(s => s.levels.forEach(lv => ok(L.has(lv), `section ${s.code}: niveau inconnu ${lv}`)));
const seen = new Set();
ls.forEach(r => { ok(L.has(r.level), `ls: niveau inconnu ${r.level}`); ok(U.has(r.subject), `ls: matière inconnue ${r.subject}`); if (r.section) { ok(S.has(r.section), `ls: section inconnue ${r.section}`); ok(sections.find(s => s.code === r.section).levels.includes(r.level), `ls: section ${r.section} non applicable au niveau ${r.level}`); } const k = `${r.level}|${r.section || ''}|${r.subject}`; ok(!seen.has(k), `ls: doublon ${k}`); seen.add(k); if (r.default_lang) ok(['ar', 'fr', 'en'].includes(r.default_lang), `ls ${k}: langue invalide`); });
subjects.forEach(s => ok(['ar', 'fr', 'en'].includes(s.default_lang), `subject ${s.code}: langue invalide`));
domains.forEach(d => ok(U.has(d.subject), `domain ${d.code}: matière inconnue`));
etypes.forEach(t => { ok(['mcq', 'truefalse', 'match', 'strike', 'fill', 'conjug', 'quote', 'open'].includes(t.base_type), `etype ${t.code}: base_type invalide`); t.subject_codes.forEach(c => ok(U.has(c), `etype ${t.code}: matière inconnue ${c}`)); });
chapters.forEach(ch => { ok(L.has(ch.level) && U.has(ch.subject), `chapter ${ch.code}: niveau/matière inconnu`); ok(seen.has(`${ch.level}|${ch.section || ''}|${ch.subject}`), `chapter ${ch.code}: aucun level_subject correspondant`); ok([0, 1, 2, 3].includes(ch.trimester), `chapter ${ch.code}: trimestre invalide`); const nc = new Set(); (ch.notions || []).forEach(n => { ok(n.name_ar && n.name_fr && n.name_en, `notion ${n.code}: 3 langues`); ok(!nc.has(n.code), `notion doublon ${n.code}`); nc.add(n.code); }); });
// Règles métier validées (A4, A8)
ok(ls.find(r => r.level === 'P6' && r.subject === 'maths').default_lang === 'ar', 'A4: maths P6 doit être en arabe');
ok(ls.find(r => r.level === 'S3' && r.section === 'sciences_exp' && r.subject === 'svt').default_lang === 'fr', 'A4: SVT S3 doit être en français');
ok(levels.find(l => l.code === 'S4').duration_default === 180 && levels.find(l => l.code === 'P1').duration_default === 60, 'A8: durées par défaut');
ok(ls.filter(r => r.level === 'C7' && ['arts', 'musique'].includes(r.subject)).length === 2, 'A3: arts ET musique au collège');
ok(!ls.find(r => r.level === 'P2' && r.subject === 'francais') && ls.find(r => r.level === 'P3' && r.subject === 'francais')?.needs_verification, 'Français dès P3 (needs_verification)');
ok(ls.filter(r => r.level === 'S3' && r.section === 'lettres' && r.subject === 'hist_geo').length === 1 && ls.filter(r => r.level === 'S3' && r.section === 'maths' && r.subject === 'hist_geo').length === 1, 'hist_geo présent partout (programme propre lettres/éco)');
console.log(`Seed : ${cycles.length} cycles, ${levels.length} niveaux, ${sections.length} sections, ${subjects.length} matières, ${ls.length} level_subjects, ${domains.length} domaines, ${etypes.length} types, ${chapters.length} chapitres — ${fails ? fails + ' ÉCHEC(S)' : 'OK ✓'}`);
process.exit(fails ? 1 : 0);
