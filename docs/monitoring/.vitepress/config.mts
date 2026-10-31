// VitePress — documentation Observabilité Rahma Academy
//   npx vitepress dev docs/monitoring   ·   npx vitepress build docs/monitoring
// (Docusaurus : les pages Markdown sont compatibles telles quelles — placer dans docs/ et reprendre la sidebar ci-dessous.)
import { defineConfig } from 'vitepress'
export default defineConfig({
  lang: 'fr-FR',
  title: 'Rahma Academy — Observabilité',
  description: 'Logs structurés, métriques, alertes, SLO/SLI, coûts Cloudflare, tracing distribué',
  base: '/docs/monitoring/',
  lastUpdated: true,
  themeConfig: {
    logo: '/static/logo-rahma.png',
    search: { provider: 'local', options: { locales: { root: { translations: { button: { buttonText: 'Rechercher', buttonAriaLabel: 'Rechercher' }, modal: { noResultsText: 'Aucun résultat', resetButtonTitle: 'Effacer', footer: { selectText: 'ouvrir', navigateText: 'naviguer', closeText: 'fermer' } } } } } } },
    nav: [
      { text: 'Guide', link: '/' },
      { text: 'SLO / SLI', link: '/slo-sli' },
      { text: 'Alertes', link: '/alertes' },
      { text: 'Dépannage & FAQ', link: '/faq' }
    ],
    sidebar: [
      { text: 'Démarrer', items: [
        { text: 'Vue d\u2019ensemble & architecture', link: '/' },
        { text: 'Démarrage rapide', link: '/demarrage' },
        { text: 'Configuration (variables, secrets)', link: '/configuration' }
      ] },
      { text: 'Composants', items: [
        { text: 'Logs structurés (RouteLogger)', link: '/logs' },
        { text: 'Métriques (MetricsManager)', link: '/metriques' },
        { text: 'Alertes (AlertManager)', link: '/alertes' },
        { text: 'Sentry sur Cloudflare Workers', link: '/sentry' },
        { text: 'API d\u2019administration', link: '/api' }
      ] },
      { text: 'Exploitation', items: [
        { text: 'SLO / SLI & budget d\u2019erreur', link: '/slo-sli' },
        { text: 'Analyse des logs (wrangler tail)', link: '/analyse-logs' },
        { text: 'Tableaux de bord Grafana', link: '/grafana' },
        { text: 'Monitoring des coûts Cloudflare', link: '/couts' },
        { text: 'Distributed Tracing', link: '/tracing' },
        { text: 'Procédures d\u2019incident', link: '/incidents' }
      ] },
      { text: 'Aide', items: [
        { text: 'Dépannage & FAQ', link: '/faq' },
        { text: 'Bonnes pratiques', link: '/bonnes-pratiques' }
      ] }
    ],
    outline: { label: 'Sur cette page', level: [2, 3] },
    docFooter: { prev: 'Page précédente', next: 'Page suivante' },
    footer: { message: 'Rahma Academy Platform — documentation technique', copyright: '© 2026 Rahma Academy' }
  },
  markdown: { lineNumbers: true }
})
