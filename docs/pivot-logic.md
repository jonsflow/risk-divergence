# Pivot Detection & Market Structure Labeling

This document describes the full pivot detection pipeline used in `generate_cache.py` to produce divergence signals. All logic runs in Python at cache generation time — the browser receives pre-labeled results and never recomputes structure.

---

## Overview

The algorithm runs in three stages:

```
Raw price series
      │
      ▼
[Stage 1] find_pivot_highs / find_pivot_lows
          Detect local extremes using a configurable bar window (N bars each side)
      │
      ▼
[Stage 2] classify_structure
          Walk every pivot chronologically; compare each to a running reference
          to assign one of four labels: HH · HL · LH · LL
      │
      ▼
[Stage 3] Divergence detection
          Compare the final labeled structure of two assets over the same window
          to classify the pair signal: Bearish / Bullish / Aligned / Neutral
```

---

## Stage 1 — Pivot Detection

### What is a pivot?

A **pivot high** is a local price peak: higher than all bars in a neighborhood on both sides.
A **pivot low** is a local price trough: lower than all bars in a neighborhood on both sides.

The neighborhood size is controlled by two parameters:
- `left_bars` — how many bars to the left must be lower (or higher)
- `right_bars` — how many bars to the right must be lower (or higher)

In the current implementation both are set to `N = swing_window` (auto-scaled from lookback or manually set via dropdown). The default at N=1 requires only one confirming bar on each side, producing many pivots. Larger N requires more confirming bars and produces only significant swings.

### Pseudocode — `find_pivot_highs(points, left_bars, right_bars)`

```
function find_pivot_highs(points, left_bars, right_bars):
    results = []

    for i from 1 to len(points) - 2:          # skip first and last bar
        curr = points[i].price
        is_pivot = true

        # Check left side — all left_bars neighbors must be strictly lower
        check_left = min(left_bars, i)         # clamp at series start
        for j from 1 to check_left:
            if points[i - j].price >= curr:
                is_pivot = false
                break

        if not is_pivot: continue

        # Check right side — all right_bars neighbors must be strictly lower
        check_right = min(right_bars, len(points) - 1 - i)  # clamp at series end
        for j from 1 to check_right:
            if points[i + j].price >= curr:
                is_pivot = false
                break

        if is_pivot:
            results.append({ idx: i, time: points[i].time, price: curr })

    return results
```

`find_pivot_lows` is the exact mirror — all `>=` comparisons become `<=`, reversing the direction.

### Key detail: strict inequality

The condition uses `>=` (not `>`). A bar that is **equal** to the candidate breaks the pivot. This prevents flat-top sequences from producing multiple pivot highs at the same level, which would over-generate signals. A true pivot must be uniquely higher (or lower) than its neighbors.

### Boundary handling

The loop skips `i=0` and `i=len-1`. The first and last bars cannot be confirmed pivots because they lack neighbors on one side. The `min(left_bars, i)` clamp ensures that near the start of the series, we only check as many bars as exist — the series is not zero-padded.

---

## Stage 2 — Market Structure Labeling

Once all pivot highs and lows are detected, they are merged into a single chronological list and each one is assigned a label: **HH**, **HL**, **LH**, or **LL**.

### The four labels

| Label | Full name | Meaning |
|-------|-----------|---------|
| `HH` | Higher High | This pivot high exceeds the prior running high — price is making progress upward |
| `LH` | Lower High | This pivot high is below the prior running high — upward momentum is fading |
| `LL` | Lower Low | This pivot low is below the prior running low — price is making new lows |
| `HL` | Higher Low | This pivot low is above the prior running low — buyers are defending higher levels |

### Seeding the reference

Before walking any pivots, both the running high and running low are initialized to `points[0].price` — the first bar of the window (not a pivot itself, just a price reference). This anchors labeling to the start of the lookback window so labels are always relative to conditions at the beginning of the observed period.

### Pseudocode — `classify_structure(points)`

```
function classify_structure(points):
    highs = find_pivot_highs(points, 1, 1)
    lows  = find_pivot_lows(points,  1, 1)

    # Merge into one list, sorted by bar index (chronological)
    pivots = sort_by_idx(highs + lows)

    if no pivots: return "Sideways"

    # Seed running extremes from window opening price
    running_high = points[0].price
    running_low  = points[0].price
    last_high = null
    last_low  = null

    for each pivot p in pivots (chronological order):

        if p is a HIGH:
            if p.price > running_high:
                label = "HH"
                running_high = p.price     ← advance reference
            else:
                label = "LH"
                                           ← running_high unchanged
            last_high = { label, price, time }

        if p is a LOW:
            if p.price < running_low:
                label = "LL"
                running_low = p.price      ← advance reference
            else:
                label = "HL"
                                           ← running_low unchanged
            last_low = { label, price, time }

    # Final structure = labels on the most recent high and most recent low
    return (last_high.label, last_low.label)
```

### The key rule — references only advance on HH / LL

`running_high` only updates on a **HH**. A LH does not reset the baseline — subsequent highs still compete against the true peak seen so far in the window.

Similarly, `running_low` only updates on a **LL**. A HL does not raise the floor.

This ensures that a single exceptional high early in the window does not get overwritten by a series of moderate highs that are all labeled LH. The running reference faithfully tracks the true extreme, not the most recent one.

**Example:**

```
Window prices (simplified): 100, 105, 103, 108, 106

Seed: running_high = 100, running_low = 100

Pivot at 105 (high):  105 > 100 → HH, running_high = 105
Pivot at 103 (low):   103 > 100 → HL, running_low unchanged (100)
Pivot at 108 (high):  108 > 105 → HH, running_high = 108
Pivot at 106 (low):   106 > 100 → HL, running_low unchanged

Result: last_high = HH, last_low = HL → "HH + HL ↗" (uptrend)
```

---

## Stage 3 — Structure-to-Trend Label

After classification, the `(last_high.label, last_low.label)` pair maps to a human-readable trend label:

| Last High | Last Low | Trend Label | Direction |
|-----------|----------|-------------|-----------|
| HH | HL | `HH + HL ↗` | Uptrend — both sides confirm |
| LH | LL | `LL + LH ↘` | Downtrend — both sides confirm |
| LH | HL | `LH + HL ↔` | Sideways — mixed signals |
| HH | LL | `HH + LL ↔` | Expanding range — no clean trend |
| HH | — | `HH only ↗` | Highs rising, no confirmed low pivot |
| — | LL | `LL only ↘` | Lows falling, no confirmed high pivot |
| — | — | `Sideways ↔` | No pivots found in window |

### Marker colors on the chart

| Label | Color | Hex |
|-------|-------|-----|
| HH | Teal | `#14b8a6` |
| HL | Green | `#4ade80` |
| LH | Orange | `#f97316` |
| LL | Red | `#ff4d4d` |

---

## Stage 4 — Divergence Detection (Cross-Asset)

The same `classify_structure` runs over the same lookback window for both assets in a pair. The two resulting structures are then compared:

```
Asset 1 final high label × Asset 2 final high label → signal
```

| Asset 1 | Asset 2 | Signal | Interpretation |
|---------|---------|--------|----------------|
| HH | LH | **Bearish divergence** | Asset 1 making new highs, Asset 2 failing to follow — leadership is weakening |
| LL | HL | **Bullish divergence** | Asset 1 making new lows, Asset 2 holding up — selling pressure is not broad |
| HH | HH | Aligned up | Both assets confirming the trend |
| LL | LL | Aligned down | Both assets confirming the decline |
| LH | LH | Neutral | Both deteriorating but no divergence |
| HL | HL | Neutral | Both recovering but no divergence |

---

## Pivot Selection Modes

Beyond the basic N=1 pivot detection used in structure labeling, the divergence page supports three configurable **pivot selection modes** controlled by the "Pivot Mode" dropdown. These affect which pivots are drawn as trend lines on the chart (not the structure label itself):

### `recent` (default)

Takes the **N most recent** pivot highs from the window. Emphasizes current price action; ignores older spikes.

```
all_pivots = find_pivot_highs(points, N, N)
return all_pivots[-max_pivots:]    # last N chronologically
```

### `highest`

Takes the **N highest-priced** pivot highs regardless of when they occurred. Useful for identifying significant resistance levels that may be historically important.

```
all_pivots = find_pivot_highs(points, N, N)
all_pivots.sort(by price, descending)
return top_N sorted back into chronological order
```

### `highest-to-current`

Takes the **single highest** pivot high in the historical window and draws a trend line to the **current bar** (most recent price). This creates a 2-point line from the key resistance peak down to now — useful for measuring how much price has retreated from the major high.

```
historical = points[:-N-1]          # exclude recent bars that can't form confirmed pivots
all_pivots = find_pivot_highs(historical, N, N)
highest = max(all_pivots, by price)
return [highest, { time: today, price: current_price }]
```

---

## Swing Window Parameter

The `swing_window` (N bars each side) controls how significant a pivot must be to be detected:

| N | Effect | Use case |
|---|--------|----------|
| 1 | Detects any local high/low with just 1 confirming bar — high sensitivity | Short lookbacks (20d), fast markets |
| 3–5 | Requires 3–5 bars of confirmation — medium sensitivity | 50d lookback |
| 7–10 | Only major swings qualify — low sensitivity, fewer false pivots | 100d lookback |

When set to **auto**, the swing window is scaled proportionally from the lookback period. Manual override via the dropdown overrides this scaling.

---

## Future Extensions

The current implementation is intentionally minimal — N=1 symmetric detection. Planned extensions:

### Asymmetric windows (`left_bars ≠ right_bars`)

Allow different confirmation requirements on each side. For example, `left=3, right=1` finds pivots that formed decisively but confirms quickly — useful for higher-frequency data where right-side lag matters.

### Range / body-based pivots

Instead of a single bar comparison, define a pivot as a bar whose **range** (high−low) or **body** (open−close) exceeds a threshold relative to surrounding bars. Filters out narrow doji pivots that technically pass the bar test but have little structural significance.

### Multi-timeframe pivot confluence

Run the detection on multiple timeframes (e.g., daily and weekly). A pivot that appears on both timeframes is weighted more heavily for divergence scoring.

### Pivot strength scoring

Assign a numeric score to each pivot based on:
- How many bars of confirmation it has (more → stronger)
- The magnitude of the move to/from the pivot vs. ATR
- Whether it aligns with a key moving average level

Use the strength score to filter low-confidence pivots before divergence comparison.

### Volumetric pivots

Weight pivot significance by volume at the pivot bar. A high-volume pivot high carries more resistance significance than one on thin trading. Requires hourly or daily volume data (available in the current CSV schema).
