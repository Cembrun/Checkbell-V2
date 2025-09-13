HOSTING - CheckBell (Kurz-Anleitung)

Ziel: schnelles Deployment der CheckBell-Applikation auf einem Online-Host (VPS, PaaS oder Container-Host).

Wichtigste Hinweise
- Setze in Produktion ein sicheres SESSION_SECRET (stark, >32 Zeichen). Ohne dieses die App beendet sich in production.
- Lege CLIENT_ORIGIN auf die öffentliche URL deiner Frontend-Hostinstanz fest (z. B. https://mein-checkbell.example.com).
- Wenn du einen Reverse-Proxy (z. B. nginx, Cloudflare, Heroku) einsetzt, setze TRUST_PROXY=1.
- Nutze in Produktion eine persistente Session-Store (Redis) statt In‑Memory Sessions.
- Speichere keine sensiblen Dateien (users.json, passwords) im Git-Repo.

Frontend (Vite/React)
1. Build lokal oder in CI:
   - npm install
   - npm run build
2. Deploy Optionen:
   - Static-Host (Vercel, Netlify): Lege `dist` als Build-Output fest.
   - Server (nginx): Kopiere `dist` ins /var/www/... und konfiguriere reverse proxy auf Backend.

Backend (Express)
1. Env-Variablen (mindestens):
   - NODE_ENV=production
   - SESSION_SECRET=<secure-secret>
   - CLIENT_ORIGIN=https://your-frontend.example.com
   - TRUST_PROXY=1 (falls hinter Proxy)
   - COOKIE_SAMESITE=Strict|Lax (optional)
2. Starten:
   - npm ci
   - NODE_ENV=production SESSION_SECRET=... CLIENT_ORIGIN=... node server.js
3. empfohlen: Containerize
   - Erstelle ein Dockerfile (vorhanden im `backend/`), baue Image und deploye mit Docker Compose oder Kubernetes.
   - Verwende ein Volume für `backend/uploads`.
   - Setze ein externes Redis-Container für Sessions.

Spezielle Hinweise
- Uploads: Der Ordner `backend/uploads` muss vom Host beschreibbar sein und idealerweise in ein persistentes Volume gelegt werden.
- Sessions: In production unbedingt Redis (connect-redis). Anpassung in `backend/server.js` siehe docs.
- Sicherheits-Checks: Stelle sicher, dass SESSION_SECRET gesetzt ist und `CLIENT_ORIGIN` nicht `*` ist.

Wiederherstellung aus Backup
- Entpacke das Archiv, kopiere `backend/uploads` ins Zielverzeichnis und setze die Umgebungsvariablen wie oben.

Support / Quick checklist
- [ ] SESSION_SECRET gesetzt
- [ ] CLIENT_ORIGIN gesetzt
- [ ] uploads Volume eingerichtet
- [ ] Redis für Sessions (optional aber empfohlen)
- [ ] Ebene: HTTPS (TLS)

Wenn du möchtest, kann ich dir ein fertiges `docker-compose.yml` und ein kurzes CI-Workflow (GitHub Actions) erzeugen, das Build + Push + Deploy automatisiert.
