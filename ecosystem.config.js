module.exports = {
  apps: [{
    name: 'papalegua',
    script: '/opt/papalegua-backend/server.js',
    cwd: '/opt/papalegua-backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
