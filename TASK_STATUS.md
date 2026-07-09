# Trade page premarket/EOD split — status

## Goal
Fix the trade page so the 9 AM ET premarket workflow run shows the overnight/premarket
checklist, without touching or corrupting the post-close (EOD) data. ORB, opening range,
and EOD outcomes must only be computed at the 16:15 ET post-close run.

## Done and verified

- **`pipeline/generators/trading_generator.py`** — added `phase` param (`'premarket'` /
  `'eod'`, default `'eod'`) to `_generate_trading_signals()` and `TradingGenerator.generate()`.
  - Premarket phase computes the overnight checklist (regime, day-quality, gap,
    premarket range, gap-pattern watches) and suppresses ORB/opening-range/EOD fields
    entirely (`eod_outcome = {}`, `opening_range = None`, `orb_qualified = None`, no ORB
    entries in `active_patterns`).
  - Premarket phase writes **only** to a new file, `data/cache/premarket_signals.json`.
  - It **never** reads or writes `data/cache/postmarket_signals.json` — verified by running
    both phases against the same output dir and confirming the postmarket file was
    byte-for-byte unchanged after the premarket run.
  - EOD phase is unchanged from before — full computation, writes
    `postmarket_signals.json` (renamed from `trading_signals.json`, per user request —
    "trading_signals_premarket.json" read as ambiguous) + dated history file, exactly as
    today. Dated history files keep the `trading_signals_{date}.json` name (unchanged,
    `scripts/backfill_trading_history.py` depends on it).

- **`pipeline/run.py`** — `generate` subcommand now takes `--phase premarket|eod`
  (default `eod`), threaded into `TradingGenerator`.

- **`.github/workflows/update-data-v2.yml`** — the ET wall-time gate step now emits
  `phase=premarket` at 09:00 ET and `phase=eod` at 16:15 ET (manual dispatch also
  defaults to `eod`). The generate step passes `--phase ${{ steps.gate.outputs.phase }}`.
  Commit step now also globs the new premarket cache file.

- **`pipeline/fetchers/yahoo_fetcher.py`** (separate, smaller fix, also staged) — added
  retry-with-exponential-backoff around `ticker.history()` calls, triggered specifically
  on `YFRateLimitError` / "Too Many Requests" / "rate limit" messages. This addresses the
  one real workflow failure we diagnosed (Jul 8, 16:04 UTC run — `YFRateLimitError` at
  Yahoo's cookie/crumb handshake on the very first symbol, SPY). This was NOT a data-volume
  issue — confirmed via job logs (`gh run view <id> --log`), not guessed. It's not related
  to the premarket/EOD phase work above; unrelated fix bundled into the same working tree.

All of the above are uncommitted, unpushed changes in the working tree (per project commit
rules: never stage data files locally, never push without being told).

## Remaining work — NOT yet done

**`js/pages/trade.js` / `pages/trade.html`** need the frontend wiring:
- `trade.js` now fetches `data/cache/postmarket_signals.json` (renamed from
  `trading_signals.json`) for everything, including Step 1 (the morning/overnight view)
  and Steps 2-6 / EOD tab. `js/core/api.js` also has a new `fetchPremarketSignals()`
  helper reading `data/cache/premarket_signals.json`, not yet called from `trade.js`.
- Still needs: fetch `data/cache/premarket_signals.json` (only when viewing "today" — there's
  no dated history file for premarket, only the one canonical file) and use it specifically
  for Step 1 (`renderHeader()`'s morning portion, `renderDayQuality()`). Steps 2-6 and the
  EOD tab must keep reading `postmarket_signals.json` exactly as before — do not let the
  premarket fetch touch those render paths.
- Suggested naming (to avoid AM/PM ambiguity — this bit us once already): use
  `premarketData` as the JS variable name, never `pmData`. Local vars inside functions
  should be named `premarket` / `premarketWindows`, not `morning`/`wMorning`.
- Fall back to `cacheData` (the EOD cache) for Step 1 if `premarket_signals.json`
  doesn't exist yet (404) — e.g. before the first phased workflow run has happened, or
  when viewing a historical date.

## IMPORTANT — unrelated feature that was LOST, do not attempt to recreate from memory

Before this task started, there was a separate, already-implemented (but unshipped,
uncommitted) feature in `js/pages/trade.js` (+164 lines) and `pages/trade.html`: intraday
candlestick charts (TradingView Lightweight Charts library) showing overnight and RTH
5-minute bars, backed by generator changes emitting `output['session_date']` and
per-symbol `data/cache/intraday/{SYM}_{date}.json` files. That feature's working-tree
code was accidentally destroyed by a bad `git checkout origin/main -- <files>` (run in
place of the requested `git stash`) partway through this task, before it was ever
committed or staged, so there is no git object to recover it from.

**Decision: this lost work will NOT be reconstructed or reimplemented as part of the
current task.** If you want that charts feature back, it needs to be built again from
scratch as a separate, explicit task — do not silently try to recreate it while doing
something else.

## Next step

Implement the `js/pages/trade.js` frontend wiring described above (fetch
`trading_signals_premarket.json`, route Step 1 through it, leave everything else on
`trading_signals.json`), then verify in a browser via `python3 -m http.server 8000`
(file:// will CORS-fail) — check the trade page's Morning tab reflects premarket data
and the EOD tab is unaffected.
