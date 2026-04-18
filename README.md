# Film Set Floor Plan Layout App

Web application for planning film/TV set construction. Upload a PDF blueprint, calibrate scale, drag rooms/walls/doors/windows onto a 2D canvas, then tour the layout in 3D walk-through mode.

- **Live**: http://16.54.34.31:3080
- **Repo**: `digitalcanaries/floorplan-app`
- **Local dev path**: `C:\Projects\floorplan-app`

## Stack

React 19 + Vite 7 (plain JSX), Fabric.js 7 (2D canvas), Three.js + @react-three/fiber (3D), Zustand 5 (state), Tailwind 4, Express 5 + better-sqlite3 (backend), JWT auth, Docker on AWS Lightsail.

## Commands

```bash
npm install
npm run dev        # Vite dev server
npm run build      # Production build into dist/
npm start          # Express server (serves dist/ + API)
```

## Deploy

```bash
npm run build
git add <files> && git commit -m "..." && git push origin main
scp -i ~/keypairs/devkey.pem -r src server public package.json package-lock.json vite.config.js Dockerfile docker-compose.yml ubuntu@16.54.34.31:/opt/apps/floorplan-app/
ssh -i ~/keypairs/devkey.pem ubuntu@16.54.34.31 "cd /opt/apps/floorplan-app && docker compose down && docker compose up -d --build"
```

Do NOT include `Co-Authored-By` in commit messages.

## Docs

- [CLAUDE.md](CLAUDE.md) — project brief for Claude Code
- [summary.md](summary.md) — detailed handoff (data model, 3D rendering, feature inventory)
