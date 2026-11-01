// PM2 — Rahma Academy (sandbox / développement)
// Durci après l'incident « core dump de 590 Mo commité » :
//  - ulimit -c 0 : aucun core dump quel que soit le plantage de workerd/wrangler
//  - redémarrage automatique borné (exp backoff), plafond mémoire, journal rotatif
//  - script bin/serve.sh : nettoie le port, supprime d'éventuels core*, vérifie dist/ avant de lancer
module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'bash',
      args: 'bin/serve.sh',
      cwd: '/home/user/webapp',
      env: { NODE_ENV: 'development', PORT: 3000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      restart_delay: 2000,
      exp_backoff_restart_delay: 500,
      max_memory_restart: '900M',
      kill_timeout: 5000,
      out_file: '/home/user/.pm2/logs/webapp-out.log',
      error_file: '/home/user/.pm2/logs/webapp-err.log',
      merge_logs: true,
      time: true
    },
    {
      // Gardien : toutes les 60 s, vérifie /api/health ; relance webapp s'il ne répond plus,
      // supprime tout core dump, et alerte dans les logs. Léger (bash + curl).
      name: 'webapp-guard',
      script: 'bash',
      args: 'bin/guard.sh',
      cwd: '/home/user/webapp',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '50M',
      time: true
    }
  ]
}
