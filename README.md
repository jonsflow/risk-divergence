# Risk Divergence Dashboard

**Static GitHub Pages site** that analyzes divergence signals across multiple asset pairs (equities, bonds, gold, crypto) entirely in the browser.

Uses **GitHub Actions** to fetch both hourly and daily data from **Yahoo Finance** (via `yfinance`), and performs client-side pivot detection and divergence analysis using vanilla JavaScript.

🔗 **[Live Demo](https://jonsflow.github.io/risk-divergence/)**

---

## Features

✅ **6 Divergence Pairs**:
- SPY ↔ HYG (Equities vs High-Yield Bonds)
- QQQ ↔ TLT (Tech vs Treasuries)
- SPY ↔ GLD (Equities vs Gold)
- SPY ↔ IWM (Large Cap vs Small Cap)
- BTC ↔ SPY (Crypto vs Equities)
- BTC ↔ GLD (Crypto vs Gold)

✅ **Configurable Analysis**:
- Lookback periods: 20, 50, or 100 days
- Pivot detection modes: Last 2 chronologically, 2 highest by price, Highest high → Last close
- Auto-scaling or manual swing window

✅ **Hourly + Daily Data**:
- Hourly data: Last 1 month (~143 bars for stocks, ~700 for Bitcoin)
- Daily data: Max available history (thousands of bars)
- Currently uses daily data; hourly available for future enhancements

✅ **Fully Static**:
- No backend required
- Pure client-side JavaScript
- Deployed on GitHub Pages

---

## Quick Start

### 1. Enable GitHub Pages
Settings → Pages → Deploy from a branch → `main` → `/ (root)`

### 2. Trigger Data Fetch
Actions → "Update market data (Yahoo Finance → data/*.csv)" → Run workflow

### 3. Visit Your Site
After the workflow commits the CSV files, visit your GitHub Pages URL.

---

## Local Development

### Fetch Data Locally
```bash
# Install yfinance (one-time)
pip install yfinance

# Fetch both hourly and daily data
python3 fetch_data.py
```

### Run Local Server
```bash
# Python
python3 -m http.server 8000

# Node.js
npx http-server -p 8000
```

Then visit `http://localhost:8000`

---

## Adding New Pairs

Edit the `PAIRS` array in `app.js`:

```javascript
const PAIRS = [
  // ... existing pairs ...
  { id: "eth-btc", symbol1: "ETH", symbol2: "BTC", color1: "#627eea", color2: "#f7931a" }
];
```

Add symbols to `fetch_data.py`:

```python
SYMBOLS = ['SPY', 'HYG', 'QQQ', 'TLT', 'GLD', 'IWM', 'BTC', 'ETH']

TICKER_MAP = {
    'BTC': 'BTC-USD',
    'ETH': 'ETH-USD'
}
```

That's it! The UI is generated dynamically.

---

## Files

```
├── index.html          # HTML structure (minimal, pairs generated dynamically)
├── styles.css          # All styling
├── app.js              # Client-side logic (modular, config-driven)
├── fetch_data.py       # Python script to fetch data from Yahoo Finance
├── data/               # Generated CSV files (hourly + daily)
└── .github/workflows/  # Scheduled data fetching
```

---

## Tech Stack

- **Data**: Yahoo Finance (via `yfinance` Python library)
- **Hosting**: GitHub Pages
- **Automation**: GitHub Actions (runs daily at 4 PM ET market close)
- **Frontend**: Vanilla JavaScript (no frameworks)
- **Charts**: Custom SVG rendering

---

## Credits

- Data provided by [Yahoo Finance](https://finance.yahoo.com) via [yfinance](https://github.com/ranaroussi/yfinance)
- Inspired by [Trade Brigade](https://tradebrigade.co)
- Built with [Claude Code](https://claude.ai/code)

---

For detailed technical documentation, see [`CLAUDE.md`](./CLAUDE.md).
