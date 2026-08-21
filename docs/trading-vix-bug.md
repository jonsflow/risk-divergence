# Trading Generator: VIX Is Always Null

**Status:** open, not fixed. Recorded during the FRED five-year window work.

## What is broken

`pipeline/generators/trading_generator.py` reads VIX off a CSV that no longer
exists:

```python
def _load_vix() -> dict:
    path = DATA_DIR / 'fred' / 'VIXCLS.csv'
    if not path.exists():
        return None
```

`data/fred/` now contains only `fred_cache.json` — the 32 per-series CSVs were
deleted once it was established that nothing read them and the workflow never
committed them. So `path.exists()` is false on every run, `_load_vix()` returns
`None`, and `output['vix']` in `trading_signals.json` is null every time.

It fails silently. There is no warning in the fetch or generate logs, and the
generator completes successfully.

The read is guarded by `path.exists()`, so it fails silently rather than raising.

## Fix options

**FRED bundle.** `VIXCLS` is already fetched every run and present in
`data/fred/fred_cache.json`. Swap the CSV read for a bundle read. VIX lags one day
— FRED publishes the prior session's close.

**Yahoo.** `yfinance` serves `^VIX`. Values match FRED exactly (both 15.19 on
2026-08-17) and Yahoo runs a day ahead (15.84 on 2026-08-18, when FRED's latest was
08-17).

The Yahoo route is not purely additive: `config/config.json`'s `symbols` list is
also referenced by `pairs` and `trend_assets`, and the divergence, correlation, and
macro generators iterate it. Adding `{"symbol": "VIX", "ticker": "^VIX"}` surfaces
VIX on those pages. Fetching outside `symbols`, or filtering it out downstream, is
a separate decision.

## Verifying a fix

`output['vix']` in `data/cache/trading_signals.json` should be non-null after a
`generate` run. It is null on every currently committed copy.
