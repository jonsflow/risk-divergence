# Regime Card: Research & Design Plan

## Asset Universe

From `macro_config.json` we have 8 categories spanning 40+ assets — an excellent regime detection toolkit.

---

## Part 1: Regime Framework

The most actionable model is a **2-axis, 4-regime quadrant** based on **Growth** and **Inflation**:

```
                    INFLATION HIGH
                          │
    STAGFLATION           │         INFLATIONARY BOOM
    (worst for stocks      │         (commodities, energy,
     and bonds)            │          TIPS, real assets)
                           │
 ───────────────────────────────────────────────────
                           │
    RECESSION /            │         GOLDILOCKS
    DEFLATION              │         (equities, credit —
    (long bonds, gold,     │          best broad environment)
     defensive equities)   │
                          │
                    INFLATION LOW
```

Each asset in the macro model maps cleanly onto one or both axes.

---

## Part 2: Regime Signals From Our Universe

### Growth Axis — are markets pricing expansion or contraction?

| Signal | Asset | Above MA = |
|--------|-------|------------|
| Credit health | HYG | Growth positive (tight spreads) |
| Small cap risk appetite | IWM | Growth positive (leads in expansion) |
| Broad market | SPY | Growth positive |
| International demand | EEM | Growth positive |
| Consumer behavior | XLY vs XLP | XLY > XLP = expansion |
| EM debt stress | EMB | Growth positive |

**HYG is the most reliable single growth proxy** — credit spreads lead equities by 2–4 weeks.

### Inflation Axis — are real assets and inflation expectations rising?

| Signal | Asset | Above MA = |
|--------|-------|------------|
| Direct inflation pricing | TIP | Inflation rising |
| Real asset demand | GLD | Inflation + risk-off |
| Oil | USO | Inflation / supply shock |
| Broad commodities | DBC | Inflation |
| Bond yields (inverse) | TLT | Below MA = yields rising = inflation |
| Energy sector | XLE | Inflation + supply pressure |

**TIP/TLT divergence is the cleanest inflation signal** — TIP above MA + TLT below MA = market pricing inflation.

### Risk-Off Flags — warning lights regardless of regime

| Signal | Asset | Trigger |
|--------|-------|---------|
| Yen carry unwind | FXY | Above MA (yen strengthening → deleveraging) |
| Volatility spike | VIX/VIXY | Above MA (inverted category handles this) |
| Safe haven demand | GLD | Above MA while SPY below MA |
| Credit stress | HYG | Rapid move below MA |
| Dollar flight | UUP | Above MA in risk-off |
| China stress | FXI | Below MA while EEM holds (China-specific, not global) |

---

## Part 3: Defensiveness Classification

### Defensive — outperform in recession/deflation and late-cycle

- **XLP** — Consumer Staples. Non-discretionary demand. Most reliable defensive sector.
- **XLV** — Healthcare. Non-cyclical demand. Outperforms in slowdowns.
- **XLU** — Utilities. Regulated earnings, dividend yield. Rate-sensitive (hurts in stagflation).
- **GLD** — Safe haven. Outperforms in recession AND inflation (dual role).
- **TLT / IEF / SHY** — Treasuries. Flight-to-quality in deflation/recession. Hurt in stagflation.
- **TIP** — TIPS. Defensive against inflation specifically. Best in stagflation.
- **FXY** — Yen. Safe-haven currency. Strengthens when carry unwinds.

### Cyclical / Growth — outperform in goldilocks/boom

- **XLY** — Consumer Discretionary. Most economically sensitive sector. Pure growth.
- **XLK** — Technology. High duration, rate-sensitive, growth-dependent. AI-concentrated.
- **XLF** — Financials. Benefits from rising rates + economic activity.
- **XLI** — Industrials. Capex and manufacturing recovery.
- **IWM** — Small cap. High beta, leading indicator in expansions.
- **HYG** — High yield credit. Leading indicator of risk appetite.
- **BTC / ETH** — Highest beta risk assets. Pure risk-on.

### Inflation Beneficiaries — outperform in inflationary boom / stagflation

- **XLE** — Energy. Direct oil/gas exposure.
- **XLB** — Materials. Commodity demand.
- **USO** — Oil. Most direct inflation play.
- **DBC / CPER / SLV** — Commodity basket, copper (industrial), silver (industrial/monetary).
- **GLD** — Also an inflation hedge (dual role with safe haven).

### Rate-Sensitive Hybrids — defensive income, hurt when rates rise

- **XLRE** — Real Estate. Defensive income but severely hurt by rising rates.
- **XLU** — Utilities. Same dynamic. Rate cuts = strong outperformance.

---

## Part 4: Current Risk Environment (March 2026)

These are macro narratives that pressure-test any regime reading right now. **For context only — not to be coded into the app.**

### 1. Iran / Middle East Conflict

- Creates an **oil spike risk** that mimics an inflationary signal without actual demand inflation
- USO, UNG, XLE would go above MA for supply reasons, not growth
- Gold and FXY (yen) would spike as safe havens
- This is a *regime-dislocating* event — it can push readings toward "inflationary boom" while the underlying economy is actually slowing
- **Key distortion**: GLD + USO above MA simultaneously with IWM + HYG below MA = geopolitical shock, not genuine inflation

### 2. AI Capex / Software Risk

- Mega-cap tech (in QQQ) absorbing enormous capex → margin pressure if ROI is delayed
- QQQ vs QQQE (equal-weight QQQ, now in divergence app) divergence directly measures this: if QQQE lags QQQ, mega-cap is carrying the index while breadth deteriorates
- Software displacement risk → XLK breadth below average while headline QQQ holds (a few AI winners masking broader software weakness)
- **Key distortion**: QQQ above MA but XLK breadth weak = index being held up by 3–5 names

### 3. Inflation Rising

- If TIP above MA + TLT below MA + DBC rising: genuine re-inflation
- This would push regime reading toward "Inflationary Boom" (if growth holds) or "Stagflation" (if growth slows)
- Rate-sensitive sectors (XLRE, XLU) would be below MA
- TIPS outperforming TLT confirms the market is pricing inflation risk

### 4. USD/JPY Carry Trade

- FXY above MA = yen is strengthening = carry is unwinding
- One of the most dangerous cascade risk signals: BOJ hikes → yen rallies → leveraged investors sell global assets to repay yen loans → simultaneous selling of equities, EM, crypto
- The Aug 2024 episode: Nikkei −12% in a day, VIX spike to 65, crypto −15%. Reversed in 3 days but brutal for leveraged positions
- **In our model**: FXY above MA + VIX/VIXY above MA + EEM below MA + BTC below MA *simultaneously* = carry unwind in progress, not just normal risk-off

### 5. China / US Treasuries

- China reducing Treasury holdings: TLT/IEF/SHY all selling off even in risk-off (unusual — normally Treasuries rally when equities fall)
- FXI below MA while EEM broadly holds = China-specific vs global EM
- **Unusual signal**: TLT below MA + SPY below MA simultaneously = bond vigilante / foreign selling, not just inflation
- **In our model**: both equities AND bonds below MA at the same time is the tell

### 6. High Put/Call Ratio

- VIXY/UVXY above MA = options market pricing elevated downside
- Dual interpretation: contrarian bullish (everyone hedged = short squeeze fuel) vs genuine institutional protection-buying
- At extreme readings (UVXY far above MA), the first bounce tends to be sharp
- **In our model**: Volatility category (inverted) all below MA = everyone hedged = potential contrarian buy signal; all above MA = panic not yet peaked

---

## Part 5: Regime Card Design

The card displays three layers:

### Layer 1 — Quadrant Label

Computed from Growth Score + Inflation Score:

- 🟢 **GOLDILOCKS** — Growth ↑, Inflation ↓
- 🟡 **INFLATIONARY BOOM** — Growth ↑, Inflation ↑
- 🔵 **RECESSION** — Growth ↓, Inflation ↓
- 🔴 **STAGFLATION** — Growth ↓, Inflation ↑

### Layer 2 — Signal Gauges (4 bars)

```
Growth     ████████░░  80%   ↑
Inflation  ████░░░░░░  40%   ↓
Risk-Off   ██░░░░░░░░  20%   Low
Volatility ███░░░░░░░  30%   Normal
```

### Layer 3 — Active Warning Flags

Small inline badges that light up when specific risk signals trigger:

| Badge | Trigger |
|-------|---------|
| `⚡ CARRY RISK` | FXY above MA |
| `📈 INFLATION` | TIP above MA + TLT below MA |
| `💥 CREDIT STRESS` | HYG breaking below MA |
| `🌐 CHINA` | FXI below MA while EEM holds |
| `📊 VOL SPIKE` | VIXY above MA (inverted category) |

---

## Part 6: Implementation Approach

### Python (`generate_cache.py`)

- Compute Growth Score: weighted sum of growth assets above MA
- Compute Inflation Score: weighted sum of inflation assets above MA
- Derive regime quadrant from score intersection
- Identify active warning flags
- Cache as `data/cache/regime_{lookback}_{ma}.json`

### JS (`macro_app.js`)

- Render the card from cache — no computation, pure display
- The regime card is additive to the existing macro score card, not a replacement

### Suggested Weighting

```
Growth:    HYG ×2, IWM ×1.5, SPY ×1, XLY/XLP ratio ×1, EEM ×1
Inflation: TIP ×2, TLT (inverted) ×1.5, GLD ×1, USO ×1, DBC ×1
Risk-Off:  FXY ×2, VIX (inverted) ×2, GLD+SPY divergence ×2, HYG rapid drop ×2
```

### Regime Score Matrix

| Growth Score | Inflation Score | Regime |
|---|---|---|
| High (≥3) | Low (<2) | Goldilocks / Recovery |
| High (≥3) | High (≥3) | Inflationary Boom |
| Low (<3) | Low (<2) | Recession / Deflation |
| Low (<3) | High (≥3) | Stagflation |

---

## Key Insight

The existing breadth model already captures most of this data. The regime card is an **interpretation layer** on top — grouping signals into a narrative that tells you not just "how many assets are above MA" but **what the pattern means for where we are in the cycle**.
