module.exports = {
  apps: [
    {
      name: 'yuihime',
      script: 'dist/server.cjs',
      cwd: '/home/userland/YuiHime',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      error_file: '/home/userland/.yuihime/data/logs/pm2-error.log',
      out_file: '/home/userland/.yuihime/data/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      exp_backoff_restart_delay: 100,
    },
  ],
}
