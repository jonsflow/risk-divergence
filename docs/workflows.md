# GitHub Actions Workflows

Every workflow in `.github/workflows/`, what it produces, and how to operate it.

---

## Overview

The site is static files committed to `main`. Actions keeps the data fresh — no
server, no hosted database. Three workflows:

| Workflow | File | Trigger | Writes |
|----------|------|---------|--------|
| Update market data v2 | `update-data-v2.yml` | 09:00 and 16:15 ET, weekdays | `data/cache/`, `data/fred/fred_cache.json`, `data/last_updated.txt` |
| Backfill Trading History | `backfill-trading-history.yml` | Manual only | `data/cache/` dated trading files |
| PR Validation | `pr-validation.yml` | Pull requests to `main` | Nothing (read-only) |

A single workflow now does fetch and generate in one job. The older split —
`update-data.yml`, `generate-cache.yml`, `update-fred.yml` chained by
`workflow_run` — is gone, along with the standalone scripts it drove.

---

## Data flow

```
        09:00 ET and 16:15 ET (weekdays)
                    │
          ┌─────────▼──────────┐
          │  update-data-v2    │
          │                    │
          │  seed     CSVs   → SQLite   (Yahoo daily/hourly only)
          │  fetch    Yahoo  → SQLite
          │           FRED   → SQLite
          │  generate SQLite → data/cache/*.json
          │                    data/fred/fred_cache.json
          └─────────┬──────────┘
                    │ commits to main
          ┌─────────▼──────────┐
          │  GitHub Pages      │  serves static files
          └────────────────────┘

  Pull requests:
    ┌──────────────────┐
    │  pr-validation   │  config structure · Python syntax
    └──────────────────┘
```

`risk_model.db` is gitignored, so CI starts from an empty database every run.
Both fetchers pull full history rather than increments, so a run is
self-sufficient — nothing carries over between runs except the committed JSON.

---

## 1. `update-data-v2.yml`

**Trigger:** `workflow_dispatch` plus two crons.

```yaml
- cron: "0 13 * * 1-5"    # 09:00 ET — pre-market
- cron: "15 20 * * 1-5"   # 16:15 ET — post-close
```

GitHub cron is UTC-only, so there is one cron per ET slot and both are edited by
hand at each DST changeover — currently set for EDT; shift to `14:00` / `21:15`
UTC when clocks go back. A multi-cron plus wall-time-gate version was tried and
removed as too complex.

**Runs fire late.** The 09:00 slot has committed as late as 11:10 ET. Never assume
a cache was written when its cron says.

**Steps:**

1. Checkout, Python 3.11, `pip install yfinance python-dotenv fredapi`
2. `git pull --rebase` — picks up anything pushed since checkout
3. `python3 -m pipeline.run seed` — Yahoo daily/hourly CSVs → SQLite
4. `python3 -m pipeline.run fetch` — Yahoo *and* FRED → SQLite
5. `python3 -m pipeline.run generate` — SQLite → all cache JSON
6. Commit and push, only if something changed

Two things about step 4 that the step name hides. It is labelled "Fetch Yahoo
Finance data → SQLite", but `cmd_fetch` runs `YahooFetcher` **and**
`FREDFetcher`; it is the only step that reaches the FRED API, and the only step
given `FRED_API_KEY`. And `cmd_fetch` catches `EnvironmentError` from the FRED
fetcher and prints "FRED fetch skipped" to stderr without failing — so a missing
key leaves the job green with no fresh FRED data.

**Committed paths** are listed explicitly, not by directory:

```
data/cache/*.json  data/cache/intraday/*.json  data/fred/fred_cache.json  data/last_updated.txt
```

Anything the pipeline writes outside that list exists only inside the runner and
is discarded. That is deliberate — but it means adding a new output requires
adding it here too, or it will silently never appear in the repo.

**Concurrency:** group `update-data-v2`, `cancel-in-progress: false`. Queued runs
wait rather than being dropped, so the two daily slots can never race on push.

---

## 2. `backfill-trading-history.yml`

**Trigger:** `workflow_dispatch` only.

| Input | Default | Meaning |
|-------|---------|---------|
| `days` | `30` | Calendar days back to backfill |
| `force` | `false` | Regenerate cache files that already exist |

Regenerates historical dated trading caches. Concurrency group
`backfill-trading`, separate from the scheduled run.

---

## 3. `pr-validation.yml`

**Trigger:** `pull_request` targeting `main`. Read-only; commits nothing.

1. `config/config.json` parses as JSON
2. Structure check — required keys (`symbols`, `pairs`, `defaults`), every pair
   references a symbol that exists, every `color1`/`color2` is `#RGB` or `#RRGGBB`
3. `py_compile scripts/fetch_data.py`, then imports it

Steps 1–2 guard the divergence page against a broken config edit.

Steps 3–4 are stale: `scripts/fetch_data.py` is a legacy v1 script that no
workflow calls. CI is syntax-checking code production does not run, while
`pipeline/` — which it does run — is not checked at all.

---

## Secrets

| Secret | Used by | Source |
|--------|---------|--------|
| `FRED_API_KEY` | `update-data-v2.yml`, fetch step | [fred.stlouisfed.org/docs/api/api_key.html](https://fred.stlouisfed.org/docs/api/api_key.html) — free |

`GITHUB_TOKEN` is provided automatically for `git push`.

---

## Running it locally

Same three steps as CI:

```bash
python3 -m pipeline.run seed       # CSVs → SQLite (idempotent)
python3 -m pipeline.run fetch      # Yahoo + FRED → SQLite
python3 -m pipeline.run generate   # SQLite → data/cache/*.json
```

`scripts/refresh.sh` wraps these and loads `FRED_API_KEY` from `.env`.

Never commit the results. `data/` is written by the workflow only.

---

## Adding a new series

**Yahoo symbol** — edit `config/config.json` or `config/macro_config.json`, then
run the three pipeline steps. PR validation checks `config.json` structure.

**FRED series** — add an entry to `config/fred_config.json` with `id`, `name`,
`units`, `display`, `freq`. Nothing else: `FREDFetcher` derives its fetch list
from the config, and the next scheduled run picks it up.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Page shows "Cache missing — run: python3 -m pipeline.run generate" | Cache JSON absent | Run generate locally, or wait for the next scheduled run |
| A page loads but a chart is empty | Series missing from the bundle | Check the series ID in `config/fred_config.json` matches FRED exactly |
| FRED data is stale but the run was green | `FRED_API_KEY` missing or the API failed | `cmd_fetch` swallows this — check the fetch step log for "FRED fetch skipped" or a per-series WARNING |
| New pipeline output never appears in the repo | Path not in the commit step's `git add` | Add it to the explicit list in `update-data-v2.yml` |
| Push fails with non-fast-forward | Race on `main` | Rerun; the job does `git pull --rebase` first |
| Cache timestamps lag the cron | Runs fire late | Normal — the 09:00 slot has landed as late as 11:10 ET |
