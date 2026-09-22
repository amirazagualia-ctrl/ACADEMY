// ---- Feature 47 : Progression par matière (graphes trimestre par trimestre, comparaison niveau) ----
const PROG_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4b5563', '#65a30d'];
let _progCharts = [];
function progDestroy() { _progCharts.forEach(c => { try { c.destroy(); } catch {} }); _progCharts = []; }

async function showProgress(sid) {
  let d;
  try { d = (await api.get(`/progress/${sid}`)).data; } catch (e) { return toast(e.response?.data?.error || 'Erreur', 'error'); }
  progDestroy();
  const st = d.student;
  const hasData = d.subjects.length > 0;
  const trendIcon = t => t === null ? '<span class="text-gray-400">—</span>' : t > 0.5 ? `<span class="text-green-600 font-bold"><i class="fas fa-arrow-trend-up"></i> +${t}</span>` : t < -0.5 ? `<span class="text-red-600 font-bold"><i class="fas fa-arrow-trend-down"></i> ${t}</span>` : `<span class="text-gray-500"><i class="fas fa-arrows-left-right"></i> ${t > 0 ? '+' : ''}${t}</span>`;
  const gen = d.general;
  const lastGen = [...gen].reverse().find(g => g.average !== null);
  openModal(`<i class="fas fa-chart-line text-blue-600 mr-2"></i>Progression <span class="text-gray-400 text-sm font-normal">${esc(st.level)}${st.class_name ? ' · ' + esc(st.class_name) : ''} · ${esc(d.school_year || '')}</span><br><span dir="auto" class="text-base">${esc(st.first_name)} ${esc(st.last_name)}</span>`, !hasData ? '<p class="text-gray-400 text-sm py-8 text-center">Aucune note enregistrée pour cette année scolaire.</p>' : `
    <div class="grid md:grid-cols-3 gap-3 mb-4">
      ${gen.map(g => `<div class="rounded-xl p-3 ${g.average === null ? 'bg-gray-50 text-gray-400' : g.average >= 10 ? 'bg-green-50' : 'bg-red-50'}">
        <div class="text-xs text-gray-500 font-semibold">Trimestre ${g.trimester}</div>
        <div class="text-2xl font-bold ${g.average === null ? '' : g.average >= 10 ? 'text-green-700' : 'text-red-700'}">${g.average === null ? '—' : g.average.toFixed(2)}<span class="text-sm font-normal text-gray-400">/20</span></div>
        ${g.average !== null ? `<div class="text-xs text-gray-600">Moy. du niveau : <b>${g.class_average ?? '—'}</b>${g.rank ? ` · rang <b>${g.rank}</b>/${g.class_size}` : ''}</div>` : '<div class="text-xs">Pas encore de notes</div>'}
      </div>`).join('')}
    </div>
    <div class="grid lg:grid-cols-2 gap-4 mb-4">
      <section class="bg-white border rounded-xl p-3">
        <h4 class="font-bold text-sm text-gray-700 mb-2"><i class="fas fa-chart-line text-blue-600 mr-1"></i>Moyenne par matière et par trimestre</h4>
        <canvas id="prog-lines" height="230"></canvas>
      </section>
      <section class="bg-white border rounded-xl p-3">
        <h4 class="font-bold text-sm text-gray-700 mb-2"><i class="fas fa-bullseye text-purple-600 mr-1"></i>Profil par matière (dernier trimestre noté) vs niveau</h4>
        <canvas id="prog-radar" height="230"></canvas>
      </section>
    </div>
    <section class="bg-white border rounded-xl p-3 mb-4">
      <h4 class="font-bold text-sm text-gray-700 mb-2"><i class="fas fa-table text-gray-600 mr-1"></i>Détail par matière <span class="text-gray-400 font-normal">· تفاصيل حسب المادة</span></h4>
      <div class="overflow-x-auto"><table class="data-table w-full text-sm"><thead><tr><th>Matière</th><th>Coef</th><th>T1</th><th>T2</th><th>T3</th><th>Tendance</th><th>Niveau (dernier T)</th><th>Rang</th></tr></thead><tbody>
        ${d.subjects.map(s => { const last = [...s.trimesters].reverse().find(t => t.average !== null); return `<tr>
          <td class="font-semibold">${esc(s.name)}</td><td class="text-gray-500">${s.coefficient}</td>
          ${s.trimesters.map(t => `<td>${t.average === null ? '<span class="text-gray-300">—</span>' : `<b class="${t.average >= 10 ? 'text-green-700' : 'text-red-600'}">${t.average.toFixed(2)}</b>`}</td>`).join('')}
          <td>${trendIcon(s.trend)}</td>
          <td class="text-gray-600">${last?.class_average ?? '—'}</td>
          <td class="text-gray-600">${last?.rank ? `${last.rank}/${last.class_size}` : '—'}</td>
        </tr>`; }).join('')}
      </tbody></table></div>
    </section>
    <div class="grid lg:grid-cols-2 gap-4">
      <section class="bg-white border rounded-xl p-3">
        <h4 class="font-bold text-sm text-gray-700 mb-2"><i class="fas fa-clipboard-check text-green-600 mr-1"></i>Assiduité par trimestre</h4>
        <canvas id="prog-att" height="170"></canvas>
      </section>
      <section class="bg-white border rounded-xl p-3">
        <h4 class="font-bold text-sm text-gray-700 mb-2"><i class="fas fa-timeline text-amber-600 mr-1"></i>Historique pluriannuel (moyenne générale)</h4>
        ${d.history.length > 1 ? '<canvas id="prog-hist" height="170"></canvas>' : `<p class="text-xs text-gray-400 py-6 text-center">L'historique s'enrichira à partir de la prochaine année scolaire.<br>Moyenne ${esc(d.school_year || '')} : ${d.history[0]?.trimesters.map((v, i) => `T${i + 1} ${v ?? '—'}`).join(' · ') || '—'}</p>`}
      </section>
    </div>
    ${lastGen ? `<div class="mt-4 text-xs text-gray-500 bg-gray-50 rounded-lg p-3"><i class="fas fa-lightbulb text-amber-400 mr-1"></i>${progAdvice(d)}</div>` : ''}
    <div class="flex justify-end gap-2 mt-4"><button onclick="exportProgressExcel()" class="${btnSecondary} text-sm"><i class="fas fa-file-excel text-green-600 mr-1"></i> Export Excel</button><button onclick="closeModal(); progDestroy()" class="${btnSecondary}">Fermer</button></div>`, { wide: true });
  App.cache.progress = d;
  if (!hasData) return;
  setTimeout(() => progDraw(d), 50);
}
function progAdvice(d) {
  const weak = d.subjects.filter(s => { const l = [...s.trimesters].reverse().find(t => t.average !== null); return l && l.average < 10; }).map(s => s.name);
  const down = d.subjects.filter(s => s.trend !== null && s.trend <= -2).map(s => s.name);
  const up = d.subjects.filter(s => s.trend !== null && s.trend >= 2).map(s => s.name);
  const parts = [];
  if (weak.length) parts.push(`Matière(s) sous la moyenne : <b>${weak.map(esc).join(', ')}</b> — un soutien ciblé est conseillé.`);
  if (down.length) parts.push(`Baisse sensible en <b>${down.map(esc).join(', ')}</b> par rapport au trimestre précédent.`);
  if (up.length) parts.push(`Belle progression en <b>${up.map(esc).join(', ')}</b> 👏`);
  const att = d.attendance.filter(a => a.days > 0); const lastAtt = att[att.length - 1];
  if (lastAtt && lastAtt.rate !== null && lastAtt.rate < 90) parts.push(`Taux de présence T${lastAtt.trimester} : <b>${lastAtt.rate} %</b> — l'assiduité influe directement sur les résultats.`);
  return parts.length ? parts.join(' ') : 'Résultats réguliers et au-dessus de la moyenne dans toutes les matières. Continuez ainsi !';
}
function progDraw(d) {
  const labels = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
  const opts = (max = 20) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { min: 0, max, ticks: { stepSize: max === 20 ? 5 : 25 } } } });
  const el1 = document.getElementById('prog-lines');
  const notedTrims = d.general.filter(g => g.average !== null).length;
  if (el1 && notedTrims <= 1) {
    // Un seul trimestre noté : barres groupées par matière (une courbe n'aurait qu'un point)
    el1.parentElement.style.height = '250px';
    const t = d.general.findIndex(g => g.average !== null); const ti = t < 0 ? 0 : t;
    _progCharts.push(new Chart(el1, { type: 'bar', data: { labels: d.subjects.map(s => s.name), datasets: [
      { label: `${d.student.first_name} — T${ti + 1}`, data: d.subjects.map(s => s.trimesters[ti].average), backgroundColor: '#2563eb' },
      { label: 'Moyenne du niveau', data: d.subjects.map(s => s.trimesters[ti].class_average), backgroundColor: '#9ca3af' }
    ] }, options: opts() }));
  } else if (el1) {
    el1.parentElement.style.height = '250px';
    _progCharts.push(new Chart(el1, { type: 'line', data: { labels, datasets: [
      ...d.subjects.map((s, i) => ({ label: s.name, data: s.trimesters.map(t => t.average), borderColor: PROG_COLORS[i % PROG_COLORS.length], backgroundColor: PROG_COLORS[i % PROG_COLORS.length], tension: 0.3, spanGaps: true, pointRadius: 4 })),
      { label: 'Moyenne générale', data: d.general.map(g => g.average), borderColor: '#111827', borderWidth: 3, borderDash: [6, 4], pointStyle: 'rectRot', pointRadius: 6, tension: 0.3, spanGaps: true },
      { label: 'Moyenne du niveau', data: d.general.map(g => g.class_average), borderColor: '#9ca3af', borderWidth: 2, borderDash: [2, 3], pointRadius: 3, tension: 0.3, spanGaps: true }
    ] }, options: opts() }));
  }
  const el2 = document.getElementById('prog-radar');
  if (el2) {
    el2.parentElement.style.height = '250px';
    const lastOf = s => [...s.trimesters].reverse().find(t => t.average !== null) || {};
    _progCharts.push(new Chart(el2, { type: 'radar', data: { labels: d.subjects.map(s => s.name), datasets: [
      { label: `${d.student.first_name}`, data: d.subjects.map(s => lastOf(s).average ?? 0), borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.25)', pointRadius: 3 },
      { label: 'Moyenne du niveau', data: d.subjects.map(s => lastOf(s).class_average ?? 0), borderColor: '#9ca3af', backgroundColor: 'rgba(156,163,175,0.15)', borderDash: [4, 3], pointRadius: 2 }
    ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { r: { min: 0, max: 20, ticks: { stepSize: 5, font: { size: 9 } }, pointLabels: { font: { size: 10 } } } } } }));
  }
  const el3 = document.getElementById('prog-att');
  if (el3) {
    el3.parentElement.style.height = '190px';
    _progCharts.push(new Chart(el3, { type: 'bar', data: { labels, datasets: [
      { label: 'Présence (%)', data: d.attendance.map(a => a.rate), backgroundColor: '#16a34a', yAxisID: 'y' },
      { label: 'Absences', data: d.attendance.map(a => a.absences), backgroundColor: '#dc2626', yAxisID: 'y1' },
      { label: 'Retards', data: d.attendance.map(a => a.lates), backgroundColor: '#f59e0b', yAxisID: 'y1' }
    ] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { min: 0, max: 100, position: 'left', title: { display: true, text: '%' } }, y1: { min: 0, position: 'right', grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } } } } }));
  }
  const el4 = document.getElementById('prog-hist');
  if (el4) {
    el4.parentElement.style.height = '190px';
    _progCharts.push(new Chart(el4, { type: 'bar', data: { labels: d.history.map(h => h.school_year), datasets: [1, 2, 3].map((t, i) => ({ label: `T${t}`, data: d.history.map(h => h.trimesters[i]), backgroundColor: PROG_COLORS[i] })) }, options: opts() }));
  }
}
function exportProgressExcel() {
  const d = App.cache.progress; if (!d) return;
  const rows = d.subjects.map(s => ({ 'Matière': s.name, 'Coef': s.coefficient, 'T1': s.trimesters[0].average ?? '', 'T2': s.trimesters[1].average ?? '', 'T3': s.trimesters[2].average ?? '', 'Tendance': s.trend ?? '', 'Moy. niveau T1': s.trimesters[0].class_average ?? '', 'Moy. niveau T2': s.trimesters[1].class_average ?? '', 'Moy. niveau T3': s.trimesters[2].class_average ?? '' }));
  rows.push({ 'Matière': 'MOYENNE GÉNÉRALE', 'Coef': '', 'T1': d.general[0].average ?? '', 'T2': d.general[1].average ?? '', 'T3': d.general[2].average ?? '', 'Tendance': '', 'Moy. niveau T1': d.general[0].class_average ?? '', 'Moy. niveau T2': d.general[1].class_average ?? '', 'Moy. niveau T3': d.general[2].class_average ?? '' });
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Progression');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.attendance.map(a => ({ Trimestre: a.trimester, Jours: a.days, Absences: a.absences, Retards: a.lates, 'Présence %': a.rate ?? '' }))), 'Assiduité');
  XLSX.writeFile(wb, `progression_${d.student.last_name}_${d.student.first_name}_${d.school_year || ''}.xlsx`);
}
