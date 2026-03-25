# Divergence Taxonomy — Complete Reference

Covers all named divergence types used in technical analysis, with definitions,
signal interpretations, and the full cross-asset combination matrix.

---

## Foundational Vocabulary

| Term | Definition |
|---|---|
| **Swing High / Pivot High** | A local price peak — the bar's high exceeds N bars on each side |
| **Swing Low / Pivot Low** | A local price trough — the bar's low is below N bars on each side |
| **Higher High (HH)** | Current swing high exceeds the prior swing high |
| **Lower High (LH)** | Current swing high is below the prior swing high |
| **Higher Low (HL)** | Current swing low exceeds the prior swing low |
| **Lower Low (LL)** | Current swing low is below the prior swing low |

---

## 1. Regular (Classic) Divergence — Reversal Signal

The prevailing trend is losing momentum; a **reversal** is likely.

The price makes a new extreme but the confirming asset (or oscillator) does not —
revealing that fewer and fewer participants are driving the new extreme.

| Type | Asset A (price / SPY-side) | Asset B (momentum / HYG-side) | Signal |
|---|---|---|---|
| **Regular Bearish** | Higher High (HH) | Lower High (LH) | Downward reversal — buying pressure fading at new highs |
| **Regular Bullish** | Lower Low (LL) | Higher Low (HL) | Upward reversal — selling pressure fading at new lows |

**Reliability**: Highest of all divergence types. This is the "Class A" variant.

---

## 2. Hidden Divergence — Continuation Signal

The prevailing trend is healthy and likely to **continue**. Appears during
pullbacks within an established trend.

The *confirming asset* (or oscillator) appears to recover more strongly than
Asset A — but Asset A's price structure reveals the dominant trend is reasserting.

| Type | Asset A | Asset B | Signal |
|---|---|---|---|
| **Hidden Bearish** | Lower High (LH) — within downtrend | Higher High (HH) | Downtrend continues — Asset B's bounce is a bear trap |
| **Hidden Bullish** | Higher Low (HL) — within uptrend | Lower Low (LL) | Uptrend continues — Asset B's dip is a bull trap |

**Key distinction from regular**: In regular divergence, Asset A makes a new
extreme but B does not. In hidden divergence, Asset B makes a new extreme but
A does not — and A's structure is the tell.

---

## 3. Class A / B / C — Signal Strength Classification

A ranking system for divergence quality (Constance Brown, among others).

| Class | Asset A | Asset B | Reliability |
|---|---|---|---|
| **Class A** (strongest) | Clear new high or new low | Fails to confirm | Highest — sharp sustained reversal likely |
| **Class B** (moderate) | Double top / double bottom (equal) | Lower second top / higher second bottom | Moderate |
| **Class C** (weakest) | Clear new high or new low | Flat (double top/bottom on B) | Lowest — stagnation, neither side in control |

Regular divergence as described above maps to **Class A**.

---

## 4. Exaggerated Divergence

Price forms **equal highs or lows** (not a new extreme) while the confirming
asset shows a discrepancy. Equivalent to Class B.

| Type | Asset A | Asset B | Signal |
|---|---|---|---|
| **Exaggerated Bearish** | Equal highs (double top) | Lower high | Weak bearish |
| **Exaggerated Bullish** | Equal lows (double bottom) | Higher low | Weak bullish |

---

## 5. Extended Divergence

Divergence that builds across **three or more swing points** rather than a
single two-point comparison. More pronounced reversals; more common on higher
timeframes. Treated as stronger confirmation but requires patience.

---

## 6. Full Cross-Asset Combination Matrix

For a **positively correlated** pair (e.g., SPY and HYG — both risk-on assets).

### High-to-High Comparisons

| Asset A (SPY) | Asset B (HYG) | Type | Signal |
|---|---|---|---|
| Higher High | Higher High | Aligned | Risk-on continuation |
| **Higher High** | **Lower High** | **Regular Bearish** | **Reversal down** |
| Lower High | Higher High | Hidden Bearish | Downtrend continues |
| Lower High | Lower High | Aligned | Risk-off continuation |

### Low-to-Low Comparisons

| Asset A (SPY) | Asset B (HYG) | Type | Signal |
|---|---|---|---|
| Lower Low | Lower Low | Aligned | Risk-off continuation |
| **Lower Low** | **Higher Low** | **Regular Bullish** | **Reversal up** |
| Higher Low | Lower Low | Hidden Bullish | Uptrend continues |
| Higher Low | Higher Low | Aligned | Risk-on continuation |

### Full Trend Structure (Highs + Lows Combined)

| Asset A Trend | Asset B Trend | Classification | Signal |
|---|---|---|---|
| HH + HL (uptrend) | HH + HL (uptrend) | Fully Aligned Risk-On | Strong continuation |
| HH + HL (uptrend) | LH + HL (weakening) | Partial Bearish Divergence | Warning — highs not confirmed |
| HH + HL (uptrend) | LH + LL (downtrend) | Full Bearish Divergence | Strong reversal signal |
| LH + LL (downtrend) | LH + LL (downtrend) | Fully Aligned Risk-Off | Strong continuation |
| LH + LL (downtrend) | LH + HL (recovering) | Partial Bullish Divergence | Warning — lows not confirmed |
| LH + LL (downtrend) | HH + HL (uptrend) | Full Bullish Divergence | Strong reversal signal |

---

## 7. Terminology Note: "Positive" vs. "Bearish"

Two conventions exist in the literature:

**Convention 1 — Signal direction** (John Murphy, most intermarket analysts):
- "Positive divergence" = bullish signal
- "Negative divergence" = bearish signal

**Convention 2 — Correlation context**:
- "Positive divergence" = two positively correlated assets diverging from each other

**Recommendation**: Use **bullish/bearish** rather than positive/negative to avoid ambiguity.

---

## Sources

- Constance Brown — *Technical Analysis for the Trading Professional*
- John Murphy — *Intermarket Analysis*
- [FXOpen — Regular vs Hidden Divergence](https://fxopen.com/blog/en/what-is-the-difference-between-regular-and-hidden-divergence/)
- [LuxAlgo — Divergence in Technical Analysis](https://www.luxalgo.com/blog/divergence-in-technical-analysis-an-overview/)
- [QuantVue — 3 Types of Divergence](https://www.quantvue.io/post/3-types-of-divergence)
- [MQL5 — Classic and Hidden Divergence](https://www.mql5.com/en/articles/3686)
- [XS.com — Divergence Cheat Sheet](https://www.xs.com/en/blog/divergence-cheat-sheet/)
