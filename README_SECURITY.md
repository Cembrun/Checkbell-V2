Security checklist for deploying CheckBell

Essentials (required before production):

1) Set environment variables (do not commit .env with secrets):
   - SESSION_SECRET: a long random secret (e.g. 32+ chars). Required in production.
   - NODE_ENV=production
   - ALLOW_SEED=false (default)
   - CLIENT_ORIGIN=https://your-frontend.example.com
   - REDIS_URL (optional): redis://user:pass@host:6379 if you want persistent sessions

2) Start the app in production mode behind TLS
   - Use a reverse proxy (NGINX/Traefik) or cloud load balancer with TLS termination
   - Ensure cookie secure=true (server enforces when NODE_ENV=production)

3) Backups
   - Regularly backup `backend/data/*.json` and the `uploads/` folder.
   - Store backups off‑site and verify restore procedures.

4) Optional but recommended
   - Use Redis for sessions (set REDIS_URL and restart)
   - Migrate data to a real DB (SQLite quick step; Postgres recommended)
   - Move uploads to object storage (S3/MinIO) and scan for malware
   - Add monitoring/logging (Sentry/pino + Prometheus)

Quick start (PowerShell):

# set env vars for session
$env:SESSION_SECRET = 'your-very-long-secret'
$env:NODE_ENV = 'production'
# start
node backend/server.js

Notes:
- Do not set ALLOW_SEED=true in production unless you understand the risks. It will allow overwriting data via /api/seed.
- Rotate SESSION_SECRET if you suspect compromise (invalidates existing sessions).
