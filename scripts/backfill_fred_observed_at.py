#!/usr/bin/env python3
"""
backfill_fred_observed_at.py — seed `observed_at` in the FRED bundle from git.

FREDFetcher records the date each series' newest observation first arrived, but it
can only do so going forward: it compares each run against the previous bundle, so
the first run after that change ships has nothing to compare against and leaves
every stamp unknown.

The information is not lost, though — the workflow has been committing the bundle
twice a day for months, so the run that first carried any given observation is
recoverable from git history. This walks that history once and writes the stamps
into the current bundle, after which FREDFetcher maintains them.

Run once, from the repo root:
    python3 scripts/backfill_fred_observed_at.py [--write]

Without --write it reports what it would do and changes nothing.
"""

import json
import pathlib
import subprocess
import sys

BUNDLE = pathlib.Path("data/fred/fred_cache.json")


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def main() -> int:
    write = "--write" in sys.argv
    if not BUNDLE.exists():
        print(f"{BUNDLE} not found — run the pipeline first", file=sys.stderr)
        return 1

    current = json.loads(BUNDLE.read_text())
    latest = {sid: rows[-1][0] for sid, rows in current["series"].items() if rows}

    # Oldest first, so the first commit carrying an observation wins.
    commits = _git("log", "--format=%H %ad", "--date=short", "--reverse",
                   "--", str(BUNDLE)).split("\n")
    stamps: dict[str, str] = {}
    for line in commits:
        if not line.strip():
            continue
        sha, date = line.split()
        try:
            blob = _git("show", f"{sha}:{BUNDLE}")
            series = json.loads(blob).get("series", {})
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue
        for sid, target in latest.items():
            if sid in stamps:
                continue
            rows = series.get(sid)
            if rows and rows[-1][0] == target:
                stamps[sid] = date

    found = {k: v for k, v in stamps.items() if v}
    print(f"resolved {len(found)} of {len(latest)} series from {len(commits)} commits")
    for sid in sorted(found):
        print(f"  {sid:12} latest {latest[sid]}  first seen {found[sid]}")
    missing = sorted(set(latest) - set(found))
    if missing:
        print(f"  unresolved (observation predates the bundle history): {', '.join(missing)}")

    if not write:
        print("\ndry run — pass --write to update the bundle")
        return 0

    current["observed_at"] = {sid: found.get(sid) for sid in latest}
    BUNDLE.write_text(json.dumps(current, separators=(",", ":")))
    print(f"\nwrote observed_at for {len(latest)} series → {BUNDLE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
