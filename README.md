# Promotion Simulator

A multi-user internal web app for connecting a Google Sheet, validating the promotion configuration, and calculating fast promotion results on demand.

## What it does

- Uses Google sign-in and reads sheets with the signed-in user's own access.
- Accepts a Google Sheets URL or spreadsheet ID.
- Validates required tabs and headers using normalized matching.
- Blocks simulation for missing tabs, missing headers, and fatal config problems.
- Runs deterministic logic for sequential promotions and Monte Carlo logic for weighted promotions.
- Shows promotion summary metrics, per-offer results, slope, bundle attribution, progress-bar value, and inline reward distributions.

## Required environment variables

Copy `.env.example` to `.env` and fill in:

- `APP_URL`
- `DATA_DIR`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

## Run locally

```powershell
npm run typecheck
npm run build
npm run dev
```

## Notes

- The app uses the runtime's built-in SQLite support and stores local state in `.data/promotion-simulator.sqlite`.
- Recent sheets are stored per user.
- Sheet refresh is manual by design so designers can edit freely and recompute only when ready.

## Deploy on Railway with GitHub CI

1. Push this repository to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Add a volume to the web service and mount it at `/app/.data`.
4. In Railway service variables, set:
   - `APP_URL=https://your-railway-domain`
   - `DATA_DIR=/app/.data`
   - `GOOGLE_CLIENT_ID=...`
   - `GOOGLE_CLIENT_SECRET=...`
5. In Railway service settings, enable `Wait for CI` so Railway only deploys after the GitHub workflow passes.
6. After Railway gives you the real hosted URL, add this redirect URI in Google OAuth:
   - `https://your-railway-domain/api/auth/callback`
7. Redeploy or restart the service after saving the variables and OAuth redirect.

### GitHub workflow

This repository includes `.github/workflows/ci.yml`, which runs:

- install
- typecheck
- production build

That workflow is what Railway should wait for before deploying.
