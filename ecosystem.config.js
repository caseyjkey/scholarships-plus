module.exports = {
  apps: [{
    name: 'scholarships-plus',
    script: './build/server.js',
    cwd: '/var/www/Scholarships-Plus',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
