#!/usr/bin/env bash
set -euo pipefail

# Usage: scripts/csv-to-json.sh <input.csv> <output.json> <symbol>
if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <input.csv> <output.json> <symbol>" >&2
  exit 1
fi

in="$1"
out="$2"
symbol="$3"
updated="$(date +%s)"

to_epoch() {
  local d="$1"
  if date -u -d "$d" +%s >/dev/null 2>&1; then
    date -u -d "$d" +%s
  else
    # macOS/BSD date
    date -u -j -f "%Y-%m-%d" "$d" +%s
  fi
}

{
  printf '{"symbol":"%s","interval":"1d","updated":%s,"points":["$symbol" "$updated"]' >/dev/null 2>&1 || true
} >/dev/null

{
  printf '{"symbol":"%s","interval":"1d","updated":%s,"points":[' "$symbol" "$updated"
  first=1
  # Skip header line; read CSV rows
  while IFS=, read -r Date Open High Low Close Volume; do
    # Trim CR and whitespace from fields
    Date=${Date%$'\r'}; Close=${Close%$'\r'}
    if [ -z "$Date" ] || [ "$Date" = "Date" ] || [ -z "$Close" ] || [ "$Close" = "Close" ]; then
      continue
    fi
    epoch="$(to_epoch "$Date" 2>/dev/null || true)"
    if [ -z "$epoch" ]; then continue; fi
    if [ $first -eq 1 ]; then
      first=0
      printf '[%s,%s]' "$epoch" "$Close"
    else
      printf ',[%s,%s]' "$epoch" "$Close"
    fi
  done < <(tail -n +2 "$in")
  printf ']}'
} > "$out"

echo "Wrote $out: $symbol (interval 1d)"
