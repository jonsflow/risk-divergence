"""
One-time migration: stamp `keys` + `regime_match` onto dated trading signal
caches that predate those fields, and add `regime.favored`.

Why this exists
---------------
`trading_generator.py` now emits, for every pattern, the component `keys` it
composed and a boolean `regime_match`. Dated history files written before that
change lack both. Regenerating them is not an option: they depend on 5-minute
bars, and Yahoo only serves ~60 days of those, so anything older would come back
stripped of its ORB levels and intraday outcomes. Those files are the only
surviving record of those sessions.

So we map the pattern name to keys instead of recomputing from bars. That is
string parsing, which is precisely what caused the `Engulfing at S/R` bug this
work removed — acceptable here only because:

  * it runs against a closed, enumerated set of names (PATTERN_KEYS below),
  * an unrecognised name is a hard failure, not a silent miss, and
  * it runs once and is then never part of the live code path.

Do not import this mapping anywhere else. The generator knows its own keys.

The legacy `Gap` name predates the Gap Fill / Gap Continuation split and carries
both `fill_target` and `t1_continuation` levels, so it maps to both keys — that
setup genuinely offered both plays.

Usage:
  python3 scripts/migrate_legacy_pattern_keys.py [--dry-run]

Idempotent: files that already have the fields are left untouched.
"""
import argparse
import json
from pathlib import Path

CACHE_DIR = Path("data/cache")
CONFIG_PATH = Path("config/trading_config.json")

# Closed set. Anything not listed here aborts the run.
PATTERN_KEYS = {
    'ORB':                     ['orb'],
    'ORB + Gap Fill':          ['orb', 'gap_fill'],
    'ORB + Gap Continuation':  ['orb', 'gap_continuation'],
    'Gap Fill':                ['gap_fill'],
    'Gap Continuation':        ['gap_continuation'],
    'Gap':                     ['gap_fill', 'gap_continuation'],
    'Engulfing':               ['engulfing'],
    'Outside Day':             ['outside_day'],
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true',
                        help='Report what would change without writing')
    args = parser.parse_args()

    regimes = json.loads(CONFIG_PATH.read_text()).get('regimes')
    if not regimes:
        raise SystemExit("config/trading_config.json has no `regimes` block")

    files = sorted(CACHE_DIR.glob('trading_signals_*.json'))
    if not files:
        raise SystemExit(f"No dated cache files in {CACHE_DIR}")

    unknown, migrated, skipped = [], [], 0

    for path in files:
        data = json.loads(path.read_text())
        regime = data.get('regime', {})
        label = regime.get('label')
        patterns = data.get('active_patterns', [])

        needs = (not regime.get('favored')) or any(
            'keys' not in p or not isinstance(p.get('regime_match'), bool)
            for p in patterns
        )
        if not needs:
            skipped += 1
            continue

        # Collect every unrecognised name before writing anything.
        for p in patterns:
            if p['pattern'] not in PATTERN_KEYS:
                unknown.append((path.name, p['pattern']))
        if unknown:
            continue

        favored = regimes.get(label)
        if favored is None:
            raise SystemExit(f"{path.name}: regime label {label!r} not in config")

        regime['favored'] = {'patterns': list(favored['patterns']),
                             'note': favored['note']}
        favored_set = set(favored['patterns'])
        for p in patterns:
            keys = PATTERN_KEYS[p['pattern']]
            p['keys'] = list(keys)
            p['regime_match'] = bool(set(keys) & favored_set)

        migrated.append(path.name)
        if not args.dry_run:
            path.write_text(json.dumps(data, indent=2))

    if unknown:
        print(f"ABORTED — {len(unknown)} unrecognised pattern name(s), nothing written:")
        for name, pat in unknown[:20]:
            print(f"  {name}: {pat!r}")
        raise SystemExit(1)

    verb = "would migrate" if args.dry_run else "migrated"
    print(f"{verb}: {len(migrated)} file(s) · already current: {skipped} · total: {len(files)}")
    if migrated:
        print(f"  range: {migrated[0]} -> {migrated[-1]}")


if __name__ == '__main__':
    main()
