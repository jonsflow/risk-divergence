# SPY–HYG Divergence (GitHub Pages)

Static site that computes a simple SPY vs HYG divergence signal in the browser. A GitHub Actions workflow fetches daily CSV from Stooq on a schedule and stores them in `data/*.csv`. The webpage parses CSV client‑side — no Node required.

Quick start
- Enable GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- Trigger the workflow: Actions → “Update market data (Yahoo → data/*.json)” → Run workflow.
- After it commits `data/spy.json` and `data/hyg.json`, visit your Pages URL.

Files
- `index.html`: Minimal UI and client-side CSV parsing + divergence calculation.
- `.github/workflows/update-data.yml`: Scheduled workflow to fetch and commit CSV.
- `data/`: CSV outputs written by the workflow.

For detailed setup and notes, see `AGENT.md`.
