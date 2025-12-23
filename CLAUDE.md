# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Risk Divergence Dashboard is a static GitHub Pages site that analyzes divergence signals across multiple asset pairs (equities, bonds, gold, crypto) entirely in the browser. The project uses GitHub Actions to fetch both hourly and daily CSV data from Yahoo Finance using the yfinance Python library, and the webpage performs client-side CSV parsing, pivot detection, and divergence analysis using vanilla JavaScript.

**Key insight**: This is a fully static site. GitHub Pages serves HTML, CSS, JS, and CSV files as static assets. The browser fetches and processes the CSV files entirely client-side - no backend server required.

## Architecture

### Data Pipeline
1. **GitHub Actions workflow** (`.github/workflows/update-data.yml`) runs once daily at 21:00 UTC (4 PM ET market close)
2. Uses Python with `yfinance` library to fetch data from Yahoo Finance
3. **Fetches TWO datasets per symbol**:
   - Hourly data: Last 1 month (~143 bars for stocks, ~700 for crypto) → `data/{symbol}_hourly.csv`
   - Daily data: Max available history (thousands of bars) → `data/{symbol}.csv`
4. Commits CSV files if changes are detected
5. GitHub Pages serves everything as static content (HTML + CSS + JS + CSV files)

### Symbols Fetched
- **SPY**: S&P 500 ETF
- **HYG**: High-yield corporate bond ETF
- **QQQ**: Nasdaq 100 ETF
- **TLT**: 20+ Year Treasury Bond ETF
- **GLD**: Gold ETF
- **IWM**: Russell 2000 Small Cap ETF
- **BTC**: Bitcoin (BTC-USD) - trades 24/7, so hourly data has ~700 bars

### Client-Side Processing
1. `index.html` contains HTML structure
2. `styles.css` contains all styling
3. `app.js` contains all logic (modular, configuration-based)
4. On page load:
   - Fetches both hourly and daily CSV files via `fetch()` with `cache: "no-store"`
   - Parses CSV client-side (no dependencies, pure JavaScript)
   - **Currently uses daily data for all lookback periods** (20/50/100 days)
   - Hourly data is loaded but not actively used (available for future enhancements)
5. Detects swing highs (pivot points) using configurable methods:
   - "Last 2 chronologically" (default)
   - "2 highest by price"
   - "Highest high → Last close"
6. Compares trends between paired assets to detect divergence

### Divergence Pairs (Modular Configuration)
Pairs are defined in `app.js` in the `PAIRS` array:
- **SPY ↔ HYG**: Equities vs high-yield bonds
- **QQQ ↔ TLT**: Tech vs treasuries
- **SPY ↔ GLD**: Equities vs gold
- **SPY ↔ IWM**: Large cap vs small cap
- **BTC ↔ SPY**: Crypto vs equities
- **BTC ↔ GLD**: Crypto vs gold

**Adding new pairs**: Just add one line to the `PAIRS` array - no HTML changes needed!

### Signal Logic
- **Bearish divergence**: Asset 1 makes higher highs while Asset 2 makes lower highs
- **Bullish divergence**: Asset 1 makes lower highs while Asset 2 makes higher highs
- **Aligned**: Both assets trending in the same direction (confirmation)

Default parameters (configurable via dropdown):
- `LOOKBACK_DAYS = 20`: Number of days to analyze (20, 50, or 100)
- `PIVOT_MODE = "recent"`: How to select pivot points ("recent", "highest", "highest-to-current")
- `SWING_WINDOW_DAYS = null`: Auto-scale or manual override for pivot detection window

## Development Commands

### Fetching Data Locally
```bash
# Install yfinance (one-time)
pip install yfinance

# Fetch both hourly and daily data for all symbols
python3 fetch_data.py

# This creates/updates files in data/:
#   - spy.csv, hyg.csv, qqq.csv, tlt.csv, gld.csv, iwm.csv, btc.csv (daily)
#   - spy_hourly.csv, hyg_hourly.csv, etc. (hourly)
```

### Triggering Data Updates (GitHub Actions)
The workflow can be manually triggered via GitHub Actions UI:
```bash
# Navigate to: Actions → "Update market data (Yahoo Finance → data/*.csv)" → Run workflow
```

Or commit and push changes to trigger a new deployment:
```bash
git add .
git commit -m "Update site"
git push
```

### Testing Locally
Since this is a static site that fetches CSV files, you need a local server to avoid CORS issues with the `file://` protocol:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

**Note**: Local testing requires the `data/` directory with CSV files to exist. Run `python3 fetch_data.py` first to generate them.

### Workflow Testing
To test workflow changes without waiting for the schedule:
1. Make changes to `.github/workflows/update-data.yml`
2. Push to `main`
3. Go to Actions tab and manually trigger "Update market data"

## File Structure

```
.
├── index.html                          # HTML structure (minimal, pairs generated dynamically)
├── styles.css                          # All CSS styling
├── app.js                              # All client-side logic (modular, config-driven)
├── fetch_data.py                       # Python script to fetch hourly + daily data from Yahoo Finance
├── data/                               # Generated by GitHub Actions (or locally via fetch_data.py)
│   ├── spy.csv, hyg.csv, etc.          # Daily OHLCV data (max history)
│   └── spy_hourly.csv, etc.            # Hourly OHLCV data (last 1 month)
├── .github/
│   └── workflows/
│       └── update-data.yml             # Scheduled data fetching workflow
├── CLAUDE.md                           # This file
└── README.md                           # Project documentation
```

## Important Technical Details

### Data Source
- **Yahoo Finance** via `yfinance` Python library
- No API key required (free, public data)
- Fetches both hourly (`interval='1h', period='1mo'`) and daily (`interval='1d', period='max'`)
- Bitcoin uses ticker `BTC-USD`, all others use standard symbols (SPY, HYG, etc.)

### CSV Format
**Daily data** (`spy.csv`):
```
Date,Open,High,Low,Close,Volume
2024-01-01,450.00,452.00,449.00,451.50,1000000
```

**Hourly data** (`spy_hourly.csv`):
```
Date,Time,Open,High,Low,Close,Volume
2024-01-01,09:30:00,450.00,451.00,449.50,450.25,500000
```

### Client-Side Calculations (app.js)
- **loadCsvPoints()** (`app.js:32`): Parses daily CSV, extracts Date and Close columns
- **loadHourlyData()** (`app.js:65`): Parses hourly CSV with Date, Time, Close
- **findPivotHighs()** (`app.js:117`): ThinkScript-style pivot detection
- **findRecentPivotHighs()** (`app.js:164`): Configurable pivot selection (highest/recent/highest-to-current)
- **renderChart()** (`app.js:289`): SVG chart rendering with pivot markers and trend lines
- **analyzePair()** (`app.js:423`): Analyzes divergence for a symbol pair

### Modular Architecture
- **PAIRS array** (`app.js:13-20`): Configuration for all divergence pairs
- **generatePairHTML()** (`app.js:528`): Dynamically generates HTML for each pair
- **renderPairColumns()** (`app.js:565`): Injects pair UI into DOM on page load
- **analyzeAndRender()** (`app.js:572`): Loops through PAIRS config and analyzes each

### GitHub Actions Concurrency
The workflow uses `concurrency.cancel-in-progress: false` to prevent overlapping runs from stomping on each other during git operations. This is critical for data integrity.

## Adding New Divergence Pairs

To add a new pair, simply edit the `PAIRS` array in `app.js`:

```javascript
const PAIRS = [
  { id: "spy-hyg", symbol1: "SPY", symbol2: "HYG", color1: "#4a9eff", color2: "#ff6b6b" },
  // ... existing pairs ...

  // Add your new pair:
  { id: "eth-btc", symbol1: "ETH", symbol2: "BTC", color1: "#627eea", color2: "#f7931a" }
];
```

Then add the symbols to `fetch_data.py`:

```python
SYMBOLS = ['SPY', 'HYG', 'QQQ', 'TLT', 'GLD', 'IWM', 'BTC', 'ETH']

# If needed, map to Yahoo Finance ticker:
TICKER_MAP = {
    'BTC': 'BTC-USD',
    'ETH': 'ETH-USD'
}
```

That's it! No HTML changes needed - the UI is generated dynamically.

## Modifying the Divergence Logic

Parameters are configurable via dropdowns in the UI:
- **Lookback Period**: 20, 50, or 100 days (edit `index.html` to add more options)
- **Pivot Selection**: "Last 2 chronologically", "2 highest by price", "HH → Last Close"
- **Swing Window**: Auto-scale or manual (2, 3, 5, 7, 10 days)

To change defaults, edit the config at the top of `app.js`:

```javascript
let LOOKBACK_DAYS = 20;   // default lookback
let PIVOT_MODE = "recent";  // default pivot mode
let SWING_WINDOW_DAYS = null;  // default swing window (null = auto)
```

## GitHub Pages Setup

Required settings (Settings → Pages):
- Source: Deploy from a branch
- Branch: `main`
- Folder: `/ (root)`

The site will be available at `https://<username>.github.io/<repo-name>/`

## Common Gotchas

1. **CORS errors during local development**: Must use a local HTTP server, not `file://` protocol. On GitHub Pages this is not an issue.
2. **Missing data files locally**: Run `python3 fetch_data.py` first to generate CSV files in the `data/` directory
3. **Stale data in browser**: CSV files are fetched with `cache: "no-store"`, but browser DevTools may override this
4. **Workflow schedule is UTC**: The cron `0 21 * * 1-5` runs at 21:00 UTC on weekdays (4 PM ET during EST, 5 PM ET during EDT)
5. **Data not appearing**: Ensure the workflow has run at least once (check Actions tab for green checkmark)
6. **Bitcoin has 24/7 data**: BTC trades around the clock, so hourly data has ~700 bars vs ~143 for stocks
7. **Yahoo Finance rate limits**: If fetching fails, wait a few minutes and retry. The free tier is generally reliable for this use case.
8. **Adding new symbols**: Must update BOTH `fetch_data.py` and `app.js` PAIRS array, plus add symbol to data loader in `app.js` main()

## Using Hourly Data (Future Enhancement)

Hourly data is currently fetched but not actively used. To enable hourly analysis for the 20-day lookback:

1. Change `analyzePair()` in `app.js` line ~424:
```javascript
// Change from:
const pts1 = dataCache[symbol1.toLowerCase()];

// To:
const useHourly = LOOKBACK_DAYS === 20;
const pts1 = dataCache[symbol1.toLowerCase() + (useHourly ? '_hourly' : '')];
const pts2 = dataCache[symbol2.toLowerCase() + (useHourly ? '_hourly' : '')];
```

2. Update the data selection to use all hourly bars:
```javascript
const recent1 = useHourly ? pts1 : last(pts1, LOOKBACK_DAYS);
const recent2 = useHourly ? pts2 : last(pts2, LOOKBACK_DAYS);
```

This will use hourly granularity for 20-day analysis while keeping daily data for 50/100-day lookbacks.
