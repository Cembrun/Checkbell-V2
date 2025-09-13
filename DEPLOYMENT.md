Deployment notes

Recommended quick setup (Vercel frontend + Render backend):

1) Frontend (Vercel)
- Ensure repo is pushed to GitHub.
- In Vercel, New Project -> select this repo -> Build: `npm run build` -> Output: `dist`
- Set Environment Variable: `VITE_API_URL` = `https://<your-backend-url>`

2) Backend (Render)
- In Render, New -> Web Service -> connect the repository and select `backend/` as the root (or use Dockerfile)
- If using Dockerfile, Render will build the image automatically.
- Set environment variables on Render:
  - `SESSION_SECRET` (strong random string)
  - `FRONTEND_URLS` or `FRONTEND_URL` = `https://<your-frontend-url>`
  - (optional) `ADMIN_DEFAULT_PASSWORD`
  - `TRUST_PROXY=1` if running behind a reverse-proxy (enables secure cookie handling)
  - Note: In production `SESSION_SECRET` is mandatory. The server will refuse to start without it.
- Add a Persistent Disk and mount it to `/app/data` and `/app/uploads` (so JSON files and uploads persist)

3) Local Docker (alternative)
- Build: `docker build -t checkbell-backend:latest backend/`
- Run: `docker run -p 4000:4000 -e SESSION_SECRET=secret -v /path/on/host/data:/app/data -v /path/on/host/uploads:/app/uploads checkbell-backend:latest`

4) After deploying
- Update `VITE_API_URL` in frontend deployment to point to the backend public URL.
- Ensure CORS: the backend reads allowed FRONTEND_URLS from the `FRONTEND_URLS` env var or `FRONTEND_URL`.

Notes:
- For production readiness consider moving JSON files to a proper DB or S3 for uploads.
- Keep `SESSION_SECRET` secret and rotate if leaked.
 - Do NOT commit `backend/users.json` into public repositories. Create admin users manually in production and rotate any default passwords.
 - The server will ignore the `x-user` header in production; use proper auth sessions.
