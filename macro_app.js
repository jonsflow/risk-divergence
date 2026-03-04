// =============================================================================
// CONFIG
// =============================================================================

let LOOKBACK_DAYS = 20;
let MA_PERIOD = 50;

// Global state
let dataCache = {};
let MACRO_CATEGORIES = [];
let SYMBOLS = [];

// =============================================================================
// UTILITIES
// =============================================================================

async function loadLastUpdated() {
  try {
    const r = await fetch('./data/last_updated.txt', { cache: "no-store" });
    if (!r.ok) return "unknown";
    const utcString = await r.text();
    const utcDate = new Date(utcString.replace(' UTC', 'Z').replace(' ', 'T'));
    return utcDate.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch (err) {
    return "unknown";
  }
}

function last(arr, n) {
  return arr.slice(Math.max(0, arr.length - n));
}

// =============================================================================
// CONFIG LOADING
// =============================================================================

async function loadConfig() {
  const r = await fetch('./macro_config.json', { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to load macro_config.json: ${r.status}`);
  const config = await r.json();

  MACRO_CATEGORIES = config.macro_categories || [];

  // Derive unique symbols from all category assets
  const seen = new Set();
  for (const cat of MACRO_CATEGORIES) {
    for (const asset of cat.assets) {
      seen.add(asset.symbol.toLowerCase());
    }
  }
  SYMBOLS = [...seen];

  console.log(`Loaded macro config: ${SYMBOLS.length} symbols, ${MACRO_CATEGORIES.length} categories`);
  return config;
}

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadCsvPoints(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${path}`);
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/);
  lines.shift(); // remove header
  const points = [];
  for (const line of lines) {
    const parts = line.split(",");
    if (parts.length < 5) continue;

    const hasTime = parts.length >= 7 && parts[1].includes(":");
    let date, close;
    if (hasTime) {
      [date, , , , , close] = parts;
    } else {
      [date, , , , close] = parts;
    }

    if (!date || !close || date === "Date" || close === "Close") continue;
    const t = Math.floor(new Date(date + "T00:00:00Z").getTime() / 1000);
    const c = Number(close);
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue;
    points.push([t, c]);
  }
  points.sort((a, b) => a[0] - b[0]);
  return points;
}

// =============================================================================
// MA CALCULATION
// =============================================================================

function calculateMA(points, period) {
  const maPoints = [];
  for (let i = period - 1; i < points.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += points[i - j][1];
    }
    maPoints.push([points[i][0], sum / period]);
  }
  return maPoints;
}

// =============================================================================
// ASSET ANALYSIS
// =============================================================================

/**
 * Analyze a single asset: get current price, pct change, and MA signal
 * @returns {{ price, prevPrice, pctChange, currentMA, aboveMA, signal }}
 */
function analyzeAsset(symbol) {
  const pts = dataCache[symbol.toLowerCase()];

  if (!pts || pts.length < 2) {
    return { price: null, prevPrice: null, pctChange: null, currentMA: null, aboveMA: null, signal: 'neutral' };
  }

  // Use full history for MA calc, recent window for sparkline display
  const maPoints = calculateMA(pts, MA_PERIOD);

  if (maPoints.length === 0) {
    return { price: pts[pts.length - 1][1], prevPrice: null, pctChange: null, currentMA: null, aboveMA: null, signal: 'neutral' };
  }

  const currentPrice = pts[pts.length - 1][1];
  const prevPrice = pts[pts.length - 2][1];
  const pctChange = ((currentPrice - prevPrice) / prevPrice) * 100;
  const currentMA = maPoints[maPoints.length - 1][1];
  const aboveMA = currentPrice > currentMA;

  return {
    price: currentPrice,
    prevPrice,
    pctChange,
    currentMA,
    aboveMA,
    signal: aboveMA ? 'above' : 'below'
  };
}

// =============================================================================
// SPARKLINE RENDERING
// =============================================================================

/**
 * Render a sparkline SVG with price line and MA overlay
 * @param {SVGElement} svgEl - SVG DOM element to draw into
 * @param {Array} pts - all [timestamp, price] data points
 * @param {Array} maPoints - all [timestamp, ma] points
 * @param {String} color - price line color
 */
function renderSparkline(svgEl, pts, maPoints, color) {
  const W = svgEl.clientWidth || svgEl.getBoundingClientRect().width || 220;
  const H = 52;
  const PAD = { top: 3, right: 3, bottom: 3, left: 3 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  // Use recent window for display
  const recentPts = last(pts, LOOKBACK_DAYS);
  if (recentPts.length < 2) {
    svgEl.innerHTML = '';
    return;
  }

  // Filter MA to the display window
  const windowStart = recentPts[0][0];
  const recentMA = maPoints.filter(p => p[0] >= windowStart);

  // Combined price + MA values for unified y-scale
  const allValues = [
    ...recentPts.map(p => p[1]),
    ...recentMA.map(p => p[1])
  ];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const valRange = maxVal - minVal || 1;

  const times = recentPts.map(p => p[0]);
  const minTime = times[0];
  const maxTime = times[times.length - 1];
  const timeRange = maxTime - minTime || 1;

  const xS = t => PAD.left + ((t - minTime) / timeRange) * cw;
  const yS = v => PAD.top + ch - ((v - minVal) / valRange) * ch;
  const topY    = PAD.top;
  const bottomY = PAD.top + ch;

  // Price line path
  const pricePath = recentPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xS(p[0]).toFixed(1)} ${yS(p[1]).toFixed(1)}`).join(' ');

  // Price area polygon (closed at the bottom)
  const x0 = xS(recentPts[0][0]).toFixed(1);
  const xN = xS(recentPts[recentPts.length - 1][0]).toFixed(1);
  const priceArea = `${pricePath} L ${xN} ${bottomY} L ${x0} ${bottomY} Z`;

  // MA path + area-based clip paths for green/red shading
  let maPath = '';
  let areaSVG = '';

  if (recentMA.length >= 2) {
    maPath = recentMA.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xS(p[0]).toFixed(1)} ${yS(p[1]).toFixed(1)}`).join(' ');

    const mX0 = xS(recentMA[0][0]).toFixed(1);
    const mXN = xS(recentMA[recentMA.length - 1][0]).toFixed(1);

    // "Above MA" clip: MA line closed up to the top edge
    const aboveClip = `${maPath} L ${mXN} ${topY} L ${mX0} ${topY} Z`;
    // "Below MA" clip: MA line closed down to the bottom edge
    const belowClip = `${maPath} L ${mXN} ${bottomY} L ${mX0} ${bottomY} Z`;

    const uid = svgEl.id;
    areaSVG = `
      <defs>
        <clipPath id="cp-above-${uid}"><path d="${aboveClip}"/></clipPath>
        <clipPath id="cp-below-${uid}"><path d="${belowClip}"/></clipPath>
      </defs>
      <path d="${priceArea}" fill="rgba(16,185,129,0.18)" clip-path="url(#cp-above-${uid})"/>
      <path d="${priceArea}" fill="rgba(239,68,68,0.18)"  clip-path="url(#cp-below-${uid})"/>
    `;
  }

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.innerHTML = `
    ${areaSVG}
    <path d="${pricePath}" fill="none" stroke="${color}" stroke-width="1.5"/>
    ${maPath ? `<path d="${maPath}" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="3,2" opacity="0.8"/>` : ''}
  `;
}

// =============================================================================
// CARD RENDERING
// =============================================================================

function renderAssetCard(asset, color) {
  const { symbol, name } = asset;
  const analysis = analyzeAsset(symbol);
  const pts = dataCache[symbol.toLowerCase()] || [];
  const maPoints = pts.length >= MA_PERIOD ? calculateMA(pts, MA_PERIOD) : [];

  // Format price
  const priceStr = analysis.price != null ? `$${analysis.price.toFixed(2)}` : 'N/A';

  // Format pct change
  let changeHTML = '';
  if (analysis.pctChange != null) {
    const sign = analysis.pctChange >= 0 ? '+' : '';
    const cls = analysis.pctChange >= 0 ? 'positive' : 'negative';
    changeHTML = `<span class="asset-change ${cls}">${sign}${analysis.pctChange.toFixed(2)}%</span>`;
  }

  // Signal label
  let signalLabel = 'NO DATA';
  let signalClass = 'neutral';
  if (analysis.aboveMA === true) {
    signalLabel = `ABOVE ${MA_PERIOD}-DAY MA`;
    signalClass = 'above';
  } else if (analysis.aboveMA === false) {
    signalLabel = `BELOW ${MA_PERIOD}-DAY MA`;
    signalClass = 'below';
  }

  const cardId = `asset-card-${symbol.toLowerCase()}`;

  const card = document.createElement('div');
  card.className = 'asset-card';
  card.id = cardId;
  card.innerHTML = `
    <div class="asset-header">
      <span class="asset-symbol">${symbol}</span>
      <span class="asset-name">${name}</span>
    </div>
    <div class="asset-price-row">
      <span class="asset-price">${priceStr}</span>
      ${changeHTML}
    </div>
    <svg class="asset-sparkline" id="sparkline-${symbol.toLowerCase()}" height="52"></svg>
    <div class="asset-signal ${signalClass}">${signalLabel}</div>
  `;

  // Render sparkline after element is in DOM
  requestAnimationFrame(() => {
    const svgEl = document.getElementById(`sparkline-${symbol.toLowerCase()}`);
    if (svgEl && pts.length >= 2) {
      renderSparkline(svgEl, pts, maPoints, color);
    }
  });

  return card;
}

function renderCategory(category) {
  const section = document.createElement('section');
  section.className = 'category';
  section.id = `category-${category.id}`;

  section.innerHTML = `
    <div class="category-header">
      <div class="category-dot" style="background:${category.color}"></div>
      <h2>${category.name}</h2>
    </div>
    <div class="assets-grid" id="assets-${category.id}"></div>
  `;

  return section;
}

// =============================================================================
// CATEGORY BREADTH BAR
// =============================================================================

function buildBreadthBar(symbols) {
  let aboveCount = 0;
  let validCount = 0;

  for (const sym of symbols) {
    const { aboveMA } = analyzeAsset(sym);
    if (aboveMA !== null) {
      validCount++;
      if (aboveMA) aboveCount++;
    }
  }

  if (validCount === 0) return null;

  const pct = aboveCount / validCount;
  let barColor;
  if      (pct >= 0.70) barColor = '#10b981';
  else if (pct >= 0.50) barColor = '#84cc16';
  else if (pct >= 0.30) barColor = '#f59e0b';
  else                  barColor = '#ef4444';

  const el = document.createElement('div');
  el.className = 'breadth-score-bar';
  el.innerHTML = `
    <div class="breadth-score-label">
      <span>${aboveCount} / ${validCount} above ${MA_PERIOD}-day MA</span>
      <span style="color:${barColor};font-weight:600">${Math.round(pct * 100)}%</span>
    </div>
    <div class="breadth-bar-track">
      <div class="breadth-bar-fill" style="width:${Math.round(pct * 100)}%;background:${barColor}"></div>
    </div>
  `;
  return el;
}

// =============================================================================
// MACRO REGIME SCORE
// =============================================================================

function renderMacroScore() {
  let aboveCount = 0;
  let totalCount = 0;

  for (const cat of MACRO_CATEGORIES) {
    for (const asset of cat.assets) {
      const analysis = analyzeAsset(asset.symbol);
      if (analysis.aboveMA !== null) {
        totalCount++;
        // Inverted categories (e.g. volatility): above MA = risk-off, so flip
        const countsAsAbove = cat.invert ? !analysis.aboveMA : analysis.aboveMA;
        if (countsAsAbove) aboveCount++;
      }
    }
  }

  if (totalCount === 0) {
    document.getElementById('macro-regime').textContent = 'No data';
    document.getElementById('macro-score-sub').textContent = 'Waiting for data…';
    return;
  }

  const pct = aboveCount / totalCount;
  let regime, color;

  if (pct >= 0.70) {
    regime = '🟢 STRONG RISK ON';
    color = '#10b981';
  } else if (pct >= 0.55) {
    regime = '🟡 RISK ON';
    color = '#84cc16';
  } else if (pct >= 0.45) {
    regime = '⚪ NEUTRAL';
    color = '#a7a7ad';
  } else if (pct >= 0.25) {
    regime = '🟠 RISK OFF';
    color = '#f59e0b';
  } else {
    regime = '🔴 STRONG RISK OFF';
    color = '#ef4444';
  }

  const regimeEl = document.getElementById('macro-regime');
  const subEl = document.getElementById('macro-score-sub');

  regimeEl.textContent = regime;
  regimeEl.style.color = color;
  subEl.textContent = `${aboveCount} of ${totalCount} assets above ${MA_PERIOD}-day MA (${Math.round(pct * 100)}%)`;
}

// =============================================================================
// FULL RE-RENDER
// =============================================================================

function renderAll() {
  const grid = document.getElementById('categories-grid');
  grid.innerHTML = '';

  for (const category of MACRO_CATEGORIES) {
    const section = renderCategory(category);
    grid.appendChild(section);

    // Prepend a breadth bar for every category
    const bar = buildBreadthBar(category.assets.map(a => a.symbol));
    if (bar) section.insertBefore(bar, section.querySelector(`#assets-${category.id}`));

    const assetsGrid = section.querySelector(`#assets-${category.id}`);
    for (const asset of category.assets) {
      const card = renderAssetCard(asset, category.color);
      assetsGrid.appendChild(card);
    }
  }

  renderMacroScore();
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(async function main() {
  try {
    await loadConfig();

    // Load all daily CSV data
    for (const sym of SYMBOLS) {
      try {
        dataCache[sym] = await loadCsvPoints(`./data/${sym}.csv`);
        console.log(`Loaded ${sym}: ${dataCache[sym].length} points`);
      } catch (err) {
        console.warn(`Could not load ${sym}:`, err.message);
        dataCache[sym] = [];
      }
    }

    // Display last updated
    const lastUpdated = await loadLastUpdated();
    document.getElementById('meta').textContent = `Last updated: ${lastUpdated}`;

    // Initial render
    renderAll();

    // Dropdown listeners
    document.getElementById('lookbackSelect').addEventListener('change', (e) => {
      LOOKBACK_DAYS = parseInt(e.target.value, 10);
      renderAll();
    });

    document.getElementById('maPeriodSelect').addEventListener('change', (e) => {
      MA_PERIOD = parseInt(e.target.value, 10);
      renderAll();
    });

  } catch (err) {
    document.getElementById('meta').textContent = 'Error loading data.';
    console.error(err);
  }
})();
