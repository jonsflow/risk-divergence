## Market Data Agent (GitHub Actions)

Role
- Fetch SPY and HYG daily OHLC from Stooq CSV endpoints and commit CSV under `data/`.
- The webpage parses CSV client‑side to compute signals (no conversion step).
- Commit only when data changes to avoid noisy history.

Where it lives
- Workflow file: `.github/workflows/update-data.yml`
- Build scripts: `scripts/csv-to-json.mjs`

Schedule & triggers
- Cron: `*/30 * * * 1-5` (every 30 minutes on weekdays, UTC).
- Manual: Actions → “Update market data (Yahoo → data/*.json)” → Run workflow.

Inputs → Outputs
- Inputs: Stooq endpoints
  - `https://stooq.com/q/d/l/?s=SPY.US&i=d`
  - `https://stooq.com/q/d/l/?s=HYG.US&i=d`
- Outputs: `data/spy.csv`, `data/hyg.csv`

Tunables
- Adjust UI lookback and return lag in `index.html` (`LOOKBACK`, `RETURN_LAG`).

Operational notes
- Cron runs in UTC. Align to market hours by adjusting the schedule.
- Stooq endpoints are public; check workflow logs if failures occur.
- No secrets or API keys required.

Local testing (optional)
1) Fetch CSV: `curl -sS "https://stooq.com/q/d/l/?s=SPY.US&i=d" -o data/spy.csv`
2) Fetch CSV: `curl -sS "https://stooq.com/q/d/l/?s=HYG.US&i=d" -o data/hyg.csv`
3) Open `index.html` with a local server and verify.
