/**
 * PM2 ecosystem config for MMG-HR
 *
 * Start:   npm run start:prod
 * Monitor: pm2 monit
 * Logs:    pm2 logs mmg-hr-api
 * Reload:  pm2 reload mmg-hr-api --update-env
 * Stop:    pm2 stop mmg-hr-api
 * Delete:  pm2 delete mmg-hr-api
 *
 * Auto-start on reboot:
 *   pm2 startup
 *   pm2 save
 */

module.exports = {
  apps: [
    {
      name: 'mmg-hr-api',
      // Run the compiled JS output; build first with: npm run server:build
      script: './dist-server/index.js',
      instances: 1,          // Single instance is fine for a small company
      exec_mode: 'fork',
      autorestart: true,
      watch: false,           // Never watch in production
      max_memory_restart: '512M',

      // Environment variables loaded from .env file at the project root
      env_production: {
        NODE_ENV: 'production',
      },

      // Log configuration
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Graceful shutdown — wait up to 5 s for in-flight requests to finish
      kill_timeout: 5000,
      listen_timeout: 8000,

      // Restart delay after a crash (exponential backoff handled by PM2)
      restart_delay: 4000,
    },
  ],
};
