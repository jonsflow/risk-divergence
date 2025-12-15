// =============================================================================
// CONFIG
// =============================================================================

let LOOKBACK_DAYS = 20;   // number of days to analyze for divergence (configurable via dropdown)
const SWING_WINDOW = 5;   // days on each side to identify swing highs/lows (legacy, not currently used)

// Global data cache
let dataCache = {};

// =============================================================================
// UTILITIES
// =============================================================================

function toIso(epochSec) {
  return new Date(epochSec * 1000).toISOString().replace("T", " ").slice(0, 10);
}

function last(arr, n) {
  return arr.slice(Math.max(0, arr.length - n));
}

function fmt(x) {
  return Number.isFinite(x) ? x.toFixed(2) : "N/A";
}

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadCsvPoints(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) throw new Error(`Fetch failed ${r.status} for ${path}`);
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift(); // Date,Open,High,Low,Close,Volume
  const points = [];
  for (const line of lines) {
    const [date, , , , close] = line.split(",");
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
// SWING HIGH/LOW DETECTION
// =============================================================================

/**
 * Find ALL swing highs in the data, then return the N highest ones by price.
 *
 * @param {Array} points - Array of [timestamp, price] tuples
 * @param {Number} maxSwings - How many swing highs to return (default 2)
 * @param {Number} barsEachSide - How many bars on each side must be lower (default 1)
 * @returns {Array} Array of {idx, time, price} objects, sorted chronologically
 */
function findRecentSwingHighs(points, maxSwings = 2, barsEachSide = 1) {
  const swingHighs = [];

  // Scan through ALL bars to find every swing high
  for (let i = 0; i < points.length; i++) {
    const curr = points[i][1];
    let isSwingHigh = true;

    // Check bars BEFORE (as many as are available, up to barsEachSide)
    const checkBefore = Math.min(barsEachSide, i);
    for (let j = 1; j <= checkBefore; j++) {
      if (points[i - j][1] >= curr) {
        isSwingHigh = false;
        break;
      }
    }

    // Check bars AFTER (as many as are available, up to barsEachSide)
    if (isSwingHigh) {
      const checkAfter = Math.min(barsEachSide, points.length - 1 - i);
      for (let j = 1; j <= checkAfter; j++) {
        if (points[i + j][1] >= curr) {
          isSwingHigh = false;
          break;
        }
      }
    }

    if (isSwingHigh) {
      swingHighs.push({ idx: i, time: points[i][0], price: curr });
    }
  }

  // Sort by price (highest first) and take the top N
  swingHighs.sort((a, b) => b.price - a.price);
  const topN = swingHighs.slice(0, maxSwings);

  // Sort by time (chronological order) for drawing the line
  return topN.sort((a, b) => a.time - b.time);
}

// Legacy functions (not currently used, but kept for reference)
function findSwingHighs(points, window = 5) {
  const swings = [];
  for (let i = window; i < points.length - window; i++) {
    const price = points[i][1];
    let isHigh = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && points[j][1] >= price) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) swings.push({ idx: i, time: points[i][0], price });
  }
  return swings;
}

function findSwingLows(points, window = 5) {
  const swings = [];
  for (let i = window; i < points.length - window; i++) {
    const price = points[i][1];
    let isLow = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && points[j][1] <= price) {
        isLow = false;
        break;
      }
    }
    if (isLow) swings.push({ idx: i, time: points[i][0], price });
  }
  return swings;
}

function hasHigherHighs(swingHighs) {
  if (swingHighs.length < 2) return false;
  const recent = swingHighs.slice(-3);
  if (recent.length < 2) return false;
  let increasing = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].price > recent[i-1].price) increasing++;
  }
  return increasing >= recent.length - 1;
}

function hasLowerLows(swingLows) {
  if (swingLows.length < 2) return false;
  const recent = swingLows.slice(-3);
  if (recent.length < 2) return false;
  let decreasing = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].price < recent[i-1].price) decreasing++;
  }
  return decreasing >= recent.length - 1;
}

// =============================================================================
// CHART RENDERING
// =============================================================================

/**
 * Render a simple SVG line chart with optional swing high markers and trend line.
 *
 * @param {String} containerId - DOM element ID to render into
 * @param {Array} points - Array of [timestamp, price] tuples
 * @param {String} color - Line color (hex)
 * @param {String} label - Chart label (unused currently)
 * @param {Array} swingHighs - Optional array of swing highs to mark and connect
 */
function renderChart(containerId, points, color = "#4a9eff", label = "", swingHighs = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const width = container.clientWidth;
  const height = container.clientHeight;
  const padding = { top: 10, right: 10, bottom: 25, left: 50 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  if (points.length === 0) {
    container.innerHTML = '<div style="padding:20px;color:#666">No data</div>';
    return;
  }

  // Extract values
  const times = points.map(p => p[0]);
  const values = points.map(p => p[1]);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const minTime = times[0];
  const maxTime = times[times.length - 1];

  // Scale functions
  const xScale = (t) => padding.left + ((t - minTime) / (maxTime - minTime)) * chartWidth;
  const yScale = (v) => padding.top + chartHeight - ((v - minVal) / (maxVal - minVal)) * chartHeight;

  // Build path
  let path = points.map((p, i) => {
    const x = xScale(p[0]);
    const y = yScale(p[1]);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  // Build trend line or markers from swing highs
  let trendLine = '';
  if (swingHighs && swingHighs.length >= 2) {
    const recentHighs = swingHighs.slice(-2); // Get last 2 swing highs
    const x1 = xScale(recentHighs[0].time);
    const y1 = yScale(recentHighs[0].price);
    const x2 = xScale(recentHighs[1].time);
    const y2 = yScale(recentHighs[1].price);

    trendLine = `
      <!-- Trend line (connecting 2 most recent swing highs) -->
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
            stroke="#ffd700" stroke-width="2" stroke-dasharray="4,4" opacity="0.8"/>
      <!-- Swing high markers -->
      <circle cx="${x1}" cy="${y1}" r="4" fill="#ffd700" opacity="0.9"/>
      <circle cx="${x2}" cy="${y2}" r="4" fill="#ffd700" opacity="0.9"/>
    `;
  } else if (swingHighs && swingHighs.length === 1) {
    // Just show the single highest point
    const x = xScale(swingHighs[0].time);
    const y = yScale(swingHighs[0].price);
    trendLine = `
      <!-- Single highest point -->
      <circle cx="${x}" cy="${y}" r="5" fill="#ffd700" opacity="0.9"/>
    `;
  }

  // Format dates for axis
  const startDate = new Date(minTime * 1000).toISOString().slice(0, 10);
  const endDate = new Date(maxTime * 1000).toISOString().slice(0, 10);

  container.innerHTML = `
    <svg width="${width}" height="${height}" style="display:block">
      <!-- Grid lines -->
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"
            stroke="#333" stroke-width="1"/>
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"
            stroke="#333" stroke-width="1"/>

      <!-- Chart line -->
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" />

      ${trendLine}

      <!-- Y-axis labels -->
      <text x="${padding.left - 5}" y="${padding.top + 5}" text-anchor="end" fill="#a7a7ad" font-size="11">${maxVal.toFixed(2)}</text>
      <text x="${padding.left - 5}" y="${height - padding.bottom + 5}" text-anchor="end" fill="#a7a7ad" font-size="11">${minVal.toFixed(2)}</text>

      <!-- X-axis labels -->
      <text x="${padding.left}" y="${height - padding.bottom + 18}" text-anchor="start" fill="#a7a7ad" font-size="11">${startDate}</text>
      <text x="${width - padding.right}" y="${height - padding.bottom + 18}" text-anchor="end" fill="#a7a7ad" font-size="11">${endDate}</text>
    </svg>
  `;
}

// =============================================================================
// ANALYSIS & RENDERING
// =============================================================================

/**
 * Analyze a single divergence pair and update the UI
 */
function analyzePair(pairId, symbol1, symbol2, color1, color2) {
  const pts1 = dataCache[symbol1.toLowerCase()];
  const pts2 = dataCache[symbol2.toLowerCase()];

  if (!pts1 || !pts2 || pts1.length === 0 || pts2.length === 0) {
    console.warn(`Missing data for ${symbol1} or ${symbol2}`);
    // Show "no data" message in the signal element
    const elSignal = document.getElementById(`${pairId}-signal`);
    if (elSignal) elSignal.textContent = "⏳ No data available yet";
    return;
  }

  // Get recent data for analysis
  const recent1 = last(pts1, LOOKBACK_DAYS);
  const recent2 = last(pts2, LOOKBACK_DAYS);

  // Scale bars required based on lookback period: 20d→2 bars, 50d→5 bars, 100d→10 bars
  const barsEachSide = Math.max(2, Math.floor(LOOKBACK_DAYS / 10));
  const top2_1 = findRecentSwingHighs(recent1, 2, barsEachSide);
  const top2_2 = findRecentSwingHighs(recent2, 2, barsEachSide);

  // Calculate trends
  const trend1 = calculateTrend(top2_1);
  const trend2 = calculateTrend(top2_2);

  // Update trend displays
  const el1 = document.getElementById(`${pairId}-${symbol1.toLowerCase()}-trend`);
  const el2 = document.getElementById(`${pairId}-${symbol2.toLowerCase()}-trend`);
  if (el1) el1.textContent = trend1;
  if (el2) el2.textContent = trend2;

  // Determine divergence signal
  const signal = getDivergenceSignal(trend1, trend2, symbol1, symbol2);
  const elSignal = document.getElementById(`${pairId}-signal`);
  if (elSignal) elSignal.textContent = signal;

  // Render charts
  renderChart(`chart-${pairId}-${symbol1.toLowerCase()}`, recent1, color1, symbol1, top2_1);
  renderChart(`chart-${pairId}-${symbol2.toLowerCase()}`, recent2, color2, symbol2, top2_2);

  // Calculate and render ratio chart
  const ratioPoints = calculateRatio(recent1, recent2);
  const ratioTop2 = findRecentSwingHighs(ratioPoints, 2, barsEachSide);
  renderChart(`chart-${pairId}-ratio`, ratioPoints, "#a78bfa", `${symbol1}/${symbol2}`, ratioTop2);
}

function calculateTrend(swingHighs) {
  if (swingHighs.length < 2) return "Sideways ↔";
  if (swingHighs[1].price > swingHighs[0].price) return "Higher Highs ↗";
  if (swingHighs[1].price < swingHighs[0].price) return "Lower Highs ↘";
  return "Sideways ↔";
}

function getDivergenceSignal(trend1, trend2, name1, name2) {
  const up = "Higher Highs ↗";
  const down = "Lower Highs ↘";

  if (trend1 === up && trend2 === down) {
    return `⚠️ BEARISH: ${name1} higher highs, ${name2} lower highs`;
  } else if (trend1 === down && trend2 === up) {
    return `⚠️ BULLISH: ${name1} lower highs, ${name2} higher highs`;
  } else if (trend1 === up && trend2 === up) {
    return `✅ ALIGNED: Both making higher highs`;
  } else if (trend1 === down && trend2 === down) {
    return `🔴 ALIGNED: Both making lower highs`;
  }
  return "⚖️ No clear divergence";
}

function calculateRatio(pts1, pts2) {
  const ratioPoints = [];
  const map1 = new Map(pts1.map(p => [p[0], p[1]]));
  const map2 = new Map(pts2.map(p => [p[0], p[1]]));

  for (const [time, price1] of map1) {
    const price2 = map2.get(time);
    if (price2 && price2 !== 0) {
      ratioPoints.push([time, price1 / price2]);
    }
  }
  return ratioPoints;
}

function analyzeAndRender() {
  // Update last updated timestamp
  let maxTime = -Infinity;
  for (const symbol in dataCache) {
    const pts = dataCache[symbol];
    if (pts.length) {
      maxTime = Math.max(maxTime, pts[pts.length - 1][0]);
    }
  }
  document.getElementById("meta").textContent =
    `Last updated: ${Number.isFinite(maxTime) ? toIso(maxTime) : "unknown"}`;

  // Analyze each pair
  analyzePair("spy-hyg", "SPY", "HYG", "#4a9eff", "#ff6b6b");
  analyzePair("qqq-tlt", "QQQ", "TLT", "#10b981", "#f59e0b");
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(async function main() {
  try {
    // Load all symbols (gracefully handle missing files)
    const symbols = ["spy", "hyg", "qqq", "tlt"];

    for (const sym of symbols) {
      try {
        dataCache[sym] = await loadCsvPoints(`./data/${sym}.csv`);
        console.log(`Loaded ${sym}: ${dataCache[sym].length} points`);
      } catch (err) {
        console.warn(`Could not load ${sym}:`, err.message);
        dataCache[sym] = []; // Empty array for missing data
      }
    }

    // Set up dropdown listener
    const lookbackSelect = document.getElementById("lookbackSelect");
    lookbackSelect.addEventListener("change", (e) => {
      LOOKBACK_DAYS = parseInt(e.target.value, 10);
      analyzeAndRender();
    });

    // Initial render
    analyzeAndRender();
  } catch (err) {
    document.getElementById("meta").textContent = "Error loading data.";
    console.error(err);
  }
})();
