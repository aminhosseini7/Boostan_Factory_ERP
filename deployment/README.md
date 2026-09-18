# Deployment

For the current no-cost workflow, run locally and keep source on GitHub. Supabase can remain on its free plan while usage fits its current limits.

## Local

Backend: `npm install && npm start` in `backend/`.
Frontend: `npm install && npm run dev` in `frontend/`.

## Docker (optional)

From `deployment/`: `docker compose up --build`.

For any public deployment, set real secrets and HTTPS, and never commit `.env`.
