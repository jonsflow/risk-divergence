# Cross-Asset Divergence — Application Guide

How the divergence taxonomy applies to correlated asset pairs (SPY/HYG,
QQQ/TLT, BTC/SPY, etc.) as implemented in this project.

See `docs/divergence-taxonomy.md` for the full type definitions.

---

## Why Cross-Asset Divergence Works

In single-asset divergence, the "confirming asset" is a momentum oscillator
derived from the same price series (RSI, MACD, Stochastic). In cross-asset
divergence, both sides are independent price series — no oscillator needed.

The correlated asset acts as a **proxy for the underlying momentum or risk
appetite** driving both assets.

### The Credit-Equity Lead-Lag Mechanism

HYG (high-yield corporate bonds) leads equities (SPY) at turning points because:

1. Credit markets are dominated by institutional investors with superior
   information processing and risk management mandates
2. Credit spreads widen (HYG weakens) before default risk materialises in
   equity prices — credit analysts price in deteriorating fundamentals first
3. HYG bottomed in **November 2008** — four months before SPY's March 2009 low
4. Credit spreads typically widen for weeks before equity bear markets begin

When SPY and HYG diverge, it is not just pattern-matching — it is credit markets
and equity markets disagreeing about the current risk environment. Credit's
institutional depth makes it the more reliable signal.

---

## Signal Definitions for This Project

### Pair Convention

For all pairs: **Asset 1** is the equity / risk-proxy (SPY, QQQ, BTC-USD, SPY).
**Asset 2** is the credit / macro proxy (HYG, TLT, SPY, GLD).

The pivot detection compares swing highs and swing lows across the two assets
over a configurable lookback window.

---

### Regular Bearish Divergence — Reversal Warning (Risk-Off)

```
Asset 1: Higher High   Asset 2: Lower High
```

Asset 1 is making new highs but Asset 2 is already weakening. The equity rally
is not supported by credit / macro conditions. Historically precedes drawdowns.

**Current implementation status**: ✅ Tracked

---

### Regular Bullish Divergence — Reversal Signal (Risk-On)

```
Asset 1: Lower Low   Asset 2: Higher Low
```

Asset 1 is making new lows but Asset 2 is already recovering. Selling pressure
in equities is exhausting while credit / macro is stabilising. Historically
precedes recoveries.

**Current implementation status**: ✅ Tracked

---

### Hidden Bearish Divergence — Downtrend Continuation

```
Asset 1: Lower High (within established downtrend)   Asset 2: Higher High
```

Asset 2 makes a higher high — this looks like recovery — but Asset 1's structure
shows it is still making lower highs. Asset 2's bounce is a bear trap; the
dominant trend in Asset 1 is reasserting. Do NOT interpret as a reversal.

**Current implementation status**: ❌ Not yet tracked

---

### Hidden Bullish Divergence — Uptrend Continuation

```
Asset 1: Higher Low (within established uptrend)   Asset 2: Lower Low
```

Asset 2 makes a lower low — this looks like deterioration — but Asset 1 holds
a higher low. Asset 2's dip is a bull trap; the dominant trend in Asset 1 is
intact. Do NOT interpret as a reversal.

**Current implementation status**: ❌ Not yet tracked

---

### Aligned Risk-On — Continuation

```
Asset 1: Higher High   Asset 2: Higher High
Asset 1: Higher Low    Asset 2: Higher Low
```

Both assets confirming. Risk appetite is coherent across equity and credit /
macro. Trend continuation signal — not just the *absence* of divergence.

**Current implementation status**: ✅ Labelled "Aligned" (but not surfaced as
a positive continuation signal)

---

### Aligned Risk-Off — Continuation

```
Asset 1: Lower High   Asset 2: Lower High
Asset 1: Lower Low    Asset 2: Lower Low
```

Both assets weakening together. Risk-off move is confirmed across the pair.
Continuation signal in the deterioration direction.

**Current implementation status**: ✅ Labelled "Aligned"

---

## Signal Strength — Partial vs. Full Divergence

| Divergence Scope | Definition | Strength |
|---|---|---|
| **Single-swing** | Divergence on highs only OR lows only | Moderate — warning |
| **Full divergence** | Divergence confirmed on both highs AND lows simultaneously | Strong — high-confidence signal |

Example: SPY makes HH while HYG makes LH (bearish, highs only) → moderate warning.
If simultaneously SPY makes HL while HYG makes LL → full divergence confirmed → strong reversal signal.

---

## Complete Signal Matrix — All Combinations

| Asset 1 (SPY-side) | Asset 2 (HYG-side) | Type | Signal | Status |
|---|---|---|---|---|
| HH | HH | Aligned Risk-On | Continuation up | ✅ |
| LH | LH | Aligned Risk-Off | Continuation down | ✅ |
| **HH** | **LH** | **Regular Bearish** | **Reversal down** | ✅ |
| **LL** | **HL** | **Regular Bullish** | **Reversal up** | ✅ |
| LH | HH | Hidden Bearish | Downtrend continues | ❌ |
| HL | LL | Hidden Bullish | Uptrend continues | ❌ |
| Equal highs | LH | Exaggerated Bearish | Weak bearish | ❌ |
| Equal lows | HL | Exaggerated Bullish | Weak bullish | ❌ |

---

## Pair-Specific Notes

### SPY ↔ HYG
Primary risk indicator pair. HYG is the most liquid high-yield bond ETF.
Divergence has the strongest predictive track record. HYG leads by days to weeks.
Credit spreads widen before equity selloffs, compress before equity recoveries.

### QQQ ↔ TLT
Growth vs. duration. When QQQ makes new highs but TLT also rallies (flight to
safety persisting), it signals the equity move may not have broad risk-appetite
support. TLT is a macro proxy here — rising TLT = bond market pricing in
slowing growth.

### SPY ↔ GLD
Risk vs. safe-haven. SPY HH + GLD HH (both rising) is a risk-on regime.
SPY HH + GLD LH is the classic divergence. SPY weakening while GLD strengthens
is a traditional risk-off rotation signal.

### SPY ↔ IWM
Risk quality divergence within equities. Large-cap (SPY) vs. small-cap (IWM).
When SPY makes new highs but IWM makes lower highs, participation is narrowing —
the rally is concentrated in mega-caps, not broad. Strong leading indicator of
topping.

### BTC ↔ SPY
Cross-asset risk appetite. BTC often leads risk-on / risk-off turns because
crypto markets are 24/7 and more reflexive to liquidity conditions. BTC-to-SPY
divergence can signal a regime shift before equity markets fully price it in.

### BTC ↔ GLD
Monetary regime proxy. Both are scarce, non-sovereign stores of value. When
they diverge, it often reflects a shift in the dominant narrative between
"digital gold" demand and traditional inflation-hedge demand.

---

## Sources

- John Murphy — *Intermarket Analysis* (Wiley, 2004)
- [ICT SMT Divergence Guide](https://innercircletrader.net/tutorials/ict-smt-divergence-smart-money-technique/)
- [FXOpen — SMT Divergence](https://fxopen.com/blog/en/what-is-smt-divergence-and-how-can-you-use-it-in-trading/)
- [See It Market — HYG/SPY Divergence as Warning](https://www.seeitmarket.com/high-yield-divergence-subtle-warning-us-equities-13892/)
- [EasyLanguage Mastery — Intermarket Divergence](https://easylanguagemastery.com/building-strategies/intermarket-divergence-robust-method-signal-generation/)
- [StockCharts — Intermarket Analysis](https://chartschool.stockcharts.com/table-of-contents/market-analysis/intermarket-analysis)
- [Resonanz Capital — Credit vs. Equity Lead-Lag](https://resonanzcapital.com/insights/capital-structure-arbitrage-a-practitioners-primer)
