import csv
from pathlib import Path

# Load last 20 days of SPY
rows = []
with open('data/spy.csv') as f:
    for row in csv.DictReader(f):
        rows.append({'date': row['Date'], 'close': float(row['Close'])})

pts = rows[-20:]

print("=== 20-day window ===")
for i, p in enumerate(pts):
    print(f"  [{i:2d}] {p['date']}  {p['close']:.2f}")

# Find N=1 pivots (skip first and last)
pivots = []
for i in range(1, len(pts) - 1):
    curr = pts[i]['close']
    prev = pts[i-1]['close']
    nxt  = pts[i+1]['close']
    if curr > prev and curr > nxt:
        pivots.append({'date': pts[i]['date'], 'close': curr, 'type': 'high', 'i': i})
    elif curr < prev and curr < nxt:
        pivots.append({'date': pts[i]['date'], 'close': curr, 'type': 'low',  'i': i})

print("\n=== Pivots ===")
for p in pivots:
    print(f"  [{p['i']:2d}] {p['date']}  {p['close']:.2f}  {p['type']}")

# Classify
highs = [p for p in pivots if p['type'] == 'high']
lows  = [p for p in pivots if p['type'] == 'low']

hh = max(highs, key=lambda x: x['close']) if highs else None
ll = min(lows,  key=lambda x: x['close']) if lows  else None

# LH: highest pivot high below HH, but must come AFTER HH
lh_list = [h for h in highs if h['close'] < hh['close'] and h['i'] > hh['i']] if hh else []
lh = max(lh_list, key=lambda x: x['close']) if lh_list else None

# HL: next pivot HIGH after LL
hl_list = [h for h in highs if h['i'] > ll['i']] if ll else []
hl = min(hl_list, key=lambda x: x['i']) if hl_list else None

print("\n=== Structure ===")
print(f"  HH: {hh['date']}  {hh['close']:.2f}" if hh else "  HH: None")
print(f"  LH: {lh['date']}  {lh['close']:.2f}" if lh else "  LH: None")
print(f"  LL: {ll['date']}  {ll['close']:.2f}" if ll else "  LL: None")
print(f"  HL: {hl['date']}  {hl['close']:.2f}" if hl else "  HL: None")
