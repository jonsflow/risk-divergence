"""
pipeline/fetchers/fred_fetcher.py — Fetch FRED series into SQLite + JSON bundle.

Sole source of FRED data: fetches into SQLite and writes the browser bundle.
Reads fred_config.json for series list.
Requires FRED_API_KEY env var (loaded from .env via python-dotenv).
"""

import datetime
import json
import os
import pathlib
from pathlib import Path

from dotenv import load_dotenv
from fredapi import Fred

from pipeline.base_fetcher import BaseFetcher

load_dotenv()

CONFIG_PATH = pathlib.Path("config/fred_config.json")
FRED_OUT_DIR = pathlib.Path("data/fred")
BUNDLE_PATH = FRED_OUT_DIR / "fred_cache.json"

# How far back to fetch. The deepest consumer is a 1260-trading-day percentile
# rank (gov_data's recession scoring on BAMLH0A0HYM2 and VIXCLS, and credit.js's
# 5-year option). 1260 trading days is almost exactly five calendar years, so a
# flat five-year cut would land on the boundary and lose the window to holidays.
# The extra quarter keeps it whole.
LOOKBACK_YEARS = 5
LOOKBACK_MARGIN_DAYS = 90


def _observation_start(today: datetime.date | None = None) -> datetime.date:
    today = today or datetime.date.today()
    # Feb 29 has no counterpart five years back; step to Feb 28 rather than raise.
    try:
        anchor = today.replace(year=today.year - LOOKBACK_YEARS)
    except ValueError:
        anchor = today.replace(year=today.year - LOOKBACK_YEARS, day=28)
    return anchor - datetime.timedelta(days=LOOKBACK_MARGIN_DAYS)


def _get_all_series(config: dict) -> list[dict]:
    if 'categories' in config:
        seen, series = set(), []
        for cat in config['categories']:
            for s in cat['series']:
                if s['id'] not in seen:
                    seen.add(s['id'])
                    series.append(s)
        return series
    return config.get('series', [])


class FREDFetcher(BaseFetcher):
    def fetch(self) -> None:
        api_key = os.environ.get("FRED_API_KEY")
        if not api_key:
            raise EnvironmentError("FRED_API_KEY environment variable not set.")

        fred = Fred(api_key=api_key)
        config = json.loads(CONFIG_PATH.read_text())
        FRED_OUT_DIR.mkdir(parents=True, exist_ok=True)

        start = _observation_start()
        print(f"Observation window: {start} → today")

        all_fetched: dict = {}

        for entry in _get_all_series(config):
            series_id = entry["id"]
            name = entry["name"]
            print(f"Fetching {series_id} ({name})...")
            try:
                s = fred.get_series(series_id, observation_start=start).dropna()
                rows = [(str(d.date()), float(v)) for d, v in s.items()]
                self.db.upsert_fred(series_id, rows)
                all_fetched[series_id] = rows
            except Exception as e:
                print(f"  WARNING: failed to fetch {series_id}: {e}")

        _write_bundle(all_fetched)


def _observed_at(all_series: dict, previous: dict) -> dict:
    """
    The date each series' newest observation first arrived.

    FRED stamps an observation with its reference period, not its release date: a
    CPI reading dated 2026-07-01 is the July print, published in mid-August. A
    reader wants to know whether a number is new — whether the market is still
    digesting it — and the reference period cannot answer that.

    We do not need to ask anyone when a print was published. If a series' newest
    observation changed between one run and the next, we received it on this run.
    The previous stamps are read back out of the committed bundle, which the
    workflow commits every run and is therefore the durable record.

    A series whose newest observation is unchanged keeps its existing stamp. One
    with no prior record is stamped with today, because that is what happened —
    the run it first appears in is the run we received it.
    """
    prev_series = previous.get("series") or {}
    prev_latest = {sid: rows[-1][0] for sid, rows in prev_series.items() if rows}
    prev_stamp = previous.get("observed_at") or {}
    today = datetime.date.today().isoformat()

    stamps = {}
    for sid, rows in all_series.items():
        if not rows:
            continue
        if sid not in prev_latest:
            stamps[sid] = today
        elif prev_latest[sid] != rows[-1][0]:
            stamps[sid] = today
        else:
            stamps[sid] = prev_stamp.get(sid)
    return stamps


def _read_existing_bundle() -> dict:
    if not BUNDLE_PATH.exists():
        return {}
    try:
        return json.loads(BUNDLE_PATH.read_text())
    except json.JSONDecodeError:
        return {}          # unreadable bundle: stamps restart rather than crash


def _write_bundle(all_series: dict) -> None:
    stamps = _observed_at(all_series, _read_existing_bundle())
    bundle = {
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "observed_at": stamps,
        "series": {sid: rows for sid, rows in all_series.items()},
    }
    with open(BUNDLE_PATH, 'w') as f:
        json.dump(bundle, f, separators=(",", ":"))
    size_kb = BUNDLE_PATH.stat().st_size / 1024
    print(f"  Bundle → {BUNDLE_PATH}  ({len(all_series)} series, {size_kb:.0f} KB)")
    fresh = sorted(sid for sid, d in stamps.items() if d == datetime.date.today().isoformat())
    if fresh:
        print(f"  New observations this run: {', '.join(fresh)}")


if __name__ == '__main__':
    FREDFetcher().run()
