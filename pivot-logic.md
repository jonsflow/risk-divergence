# Swing High / Low & Market Structure Algorithm

Below is a clean algorithmic rule set that most systematic traders use to derive swing highs, swing lows, HH, HL, LH, LL, and structure breaks. The goal is to remove subjectivity so it can run on price data directly.

---

## 1. Step 1 — Detect Swing Highs and Swing Lows

The most common method is a fractal/pivot window.

Choose a lookback window N.

Example: N = 2

**Swing High rule**

Bar i is a swing high if:

```
High[i] > High[i-1]
High[i] > High[i-2]
High[i] > High[i+1]
High[i] > High[i+2]
```

**Swing Low rule**

```
Low[i] < Low[i-1]
Low[i] < Low[i-2]
Low[i] < Low[i+1]
Low[i] < Low[i+2]
```

This produces a clean sequence:

```
... SL → SH → SL → SH → SL ...
```

Where:
- `SH` = swing high
- `SL` = swing low

---

## 2. Step 2 — Maintain the Last Confirmed Swings

Track:

```
lastSwingHigh
lastSwingLow
trendState
```

Where:

```
trendState ∈ {UPTREND, DOWNTREND, NEUTRAL}
```

---

## 3. Step 3 — Detect Structure Breaks

**Uptrend confirmation**

If price breaks the last swing high:

```
Close > lastSwingHigh
```

Then:

```
trendState = UPTREND
HigherHigh = true
HigherLow = previous swing low
```

The swing low preceding the break becomes the confirmed HL.

---

**Downtrend confirmation**

If price breaks the last swing low:

```
Close < lastSwingLow
```

Then:

```
trendState = DOWNTREND
LowerLow = true
LowerHigh = previous swing high
```

The swing high preceding the break becomes the confirmed LH.

---

## 4. Step 4 — Validate the Trend

**Uptrend validation**

Protected level: `HigherLow`

Trend remains valid while:
```
Price > HigherLow
```

Trend fails when:
```
Close < HigherLow
```
That event is a structure break.

---

**Downtrend validation**

Protected level: `LowerHigh`

Trend remains valid while:
```
Price < LowerHigh
```

Trend fails when:
```
Close > LowerHigh
```

---

## 5. Complete Logic Flow

**Initial structure detection**

```
if Close > lastSwingHigh:
    trendState = UPTREND
    HL = previousSwingLow

if Close < lastSwingLow:
    trendState = DOWNTREND
    LH = previousSwingHigh
```

---

**Uptrend continuation**

```
if trendState == UPTREND:

    if newSwingHigh > previousSwingHigh:
        HH formed

    if Close < HL:
        trendState = NEUTRAL
```

---

**Downtrend continuation**

```
if trendState == DOWNTREND:

    if newSwingLow < previousSwingLow:
        LL formed

    if Close > LH:
        trendState = NEUTRAL
```

---

## 6. Practical Filters Most Systems Add

Pure fractals are noisy. Traders usually add:

**Minimum swing distance**

```
abs(newSwing - lastSwing) > ATR * k
```

Example: `k = 0.5`

---

**Close confirmation**

Instead of wicks:

```
Close > swingHigh
Close < swingLow
```

---

**Time filter**

Require minimum bars between pivots:

```
barsBetweenSwings >= M
```

---

## 7. Example Sequence (Algorithm View)

Raw swings detected:

```
SL1
SH1
SL2
SH2
SL3
```

Break occurs:

```
Close > SH1
```

So:

```
HL = SL2
HH = SH2
```

Protected level becomes:

```
HL = SL2
```

Trend fails if:

```
Close < SL2
```

---

## 8. Minimal Pseudocode

A compact structure engine:

```
for each bar:

    detectSwingHigh()
    detectSwingLow()

    if close > lastSwingHigh:
        trend = UP
        HL = previousSwingLow

    if close < lastSwingLow:
        trend = DOWN
        LH = previousSwingHigh

    if trend == UP and close < HL:
        trend = NEUTRAL

    if trend == DOWN and close > LH:
        trend = NEUTRAL
```

---

## 9. What Quant Systems Usually Do Differently

Professional systems often replace fractals with:
- ZigZag percentage moves
- ATR reversal thresholds
- Swing clustering
- Volume confirmation

Example zigzag rule:

```
swing reversal = 1.5 * ATR
```

This reduces micro swings.

---

## 10. Advanced (Institutional) Model

A more powerful version tracks:
- Internal vs external structure
- Liquidity sweeps
- Displacement moves
- True trend shifts

This model explains why markets often break a high, reverse, and trap traders.
