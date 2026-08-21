# Portfolio Allocation & Paper Trade Tracking

**Status:** future work, not started. No code exists for this.

## What exists today

The trade page states *relative* size only, from two inputs in
`docs/trading-rules.md`:

| Input | Where | Values |
|-------|-------|--------|
| Day grade | Step 1, "Size Posture" | `A+`/`A` full · `B` half · `C`/`F` no trades |
| Confluence score | Step 4, per trade | `6+` 100% · `4–5` 75% · `3` 50% · `0–2` skip |

They multiply into an effective size, shown in Step 4 when the day scales it.

A position size calculator previously occupied Step 6 — account input, share
count, dollar risk, stop distance. It was removed: it duplicated the confluence
thresholds already in Step 4, and an account-size box with no persistence is not
a portfolio.

Nothing records what was actually taken, at what size, or how it resolved.
`eod_outcome` records how each *pattern* resolved, not whether it was traded.

## What this would be

A record of positions taken against the plan, sized as a real allocation rather
than a percentage of an unstated account, and scored over time.

Roughly:

- **Account state** — starting capital, current equity, open exposure. Persisted,
  not typed into a box each visit.
- **Position entries** — symbol, pattern, direction, entry, stop, targets, size
  taken, timestamp. Ideally opened from the Step 4/5 card that generated the
  signal, so the plan and the fill are linked.
- **Resolution** — exit price and reason (T1/T2/T3, stop, time), realized P/L.
  The generator already computes daily outcomes; a taken position needs its own
  exit, since a trade is rarely held to the pattern's theoretical resolution.
- **Portfolio view** — equity curve, win rate, average win vs. average loss,
  expectancy, max drawdown, exposure by symbol and pattern. `trading-rules.md`
  lines 586-589 already list the review metrics.
- **Rule adherence** — was the size taken the size the plan called for. This is
  the metric the current page cannot produce at all, and the one that says
  whether the framework is being followed or overridden.

## Open questions

- **Where state lives.** Every existing store is derived: `data/cache/` is
  regenerated each run and `risk_model.db` is rebuilt empty in CI. A trade record
  is user-authored and cannot be regenerated. This is the same durability
  question as `docs/fred-storage-refactor.md`, and the answers should probably
  match.
- **Entry mechanism.** The site is static — no backend, no auth. Options include
  a committed file edited by hand, browser-local storage, or the dev-server route
  used by the review tool (`scripts/dev_server.py` on `feat/review-comment-sync`),
  which accepts POSTs and writes a file, but only runs locally.
- **Whether sizing becomes absolute.** Real allocation implies real dollars and
  the 1%/2% risk rules from `trading-rules.md` lines 327-331. That reintroduces
  what Step 6 was removed for — the difference being a persisted account rather
  than a number typed into a box.
- **Paper vs. live.** Whether the record is explicitly hypothetical, and whether
  both could coexist.

## Related

- `docs/trading-rules.md` — sizing tables, risk constraints, review metrics
- `docs/fred-storage-refactor.md` — the same durable-state problem
- `docs/trade_quality.md`, `docs/day-quality-grading.md` — grading inputs
