// PM2 ecosystem configuration for the STARR Research Worker
// Usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs starr-worker          # view real-time logs
//   pm2 logs starr-worker --lines 500  # last 500 lines
//   pm2 flush starr-worker         # clear old logs

const fs = require('fs');
const path = require('path');

// Ensure logs directory exists before PM2 tries to open log files
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

module.exports = {
  apps: [
    {
      name: 'starr-worker',
      script: 'dist/index.js',
      cwd: __dirname,

      // Logging (logs/ directory is created above when this config is loaded)
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      log_file: './logs/worker-combined.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS',

      // Log rotation (requires pm2-logrotate: pm2 install pm2-logrotate)
      // Default rotation: 10MB per file, 30 files retained, compressed
      // Configure via: pm2 set pm2-logrotate:max_size 10M
      //                pm2 set pm2-logrotate:retain 30
      //                pm2 set pm2-logrotate:compress true

      // Environment
      env: {
        NODE_ENV: 'production',
        PORT: 3100,
      },

      // Process management
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '1G',

      // Graceful shutdown
      kill_timeout: 10000,
      listen_timeout: 10000,

      // Watch (disabled in production — enable for dev)
      watch: false,
    },
  ],
};
