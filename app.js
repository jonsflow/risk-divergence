// =============================================================================
// CONFIG
// =============================================================================

let LOOKBACK_DAYS = 20;   // number of days to analyze for divergence (configurable via dropdown)
const SWING_WINDOW = 5;   // days on each side to identify swing highs/lows (legacy, not currently used)

// Global data cache
let spyPtsGlobal = [];
let hygPtsGlobal = [];

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

function analyzeAndRender() {
  const spyPts = spyPtsGlobal;
  const hygPts = hygPtsGlobal;

  // Get recent data for analysis
  const spyRecent = last(spyPts, LOOKBACK_DAYS);
  const hygRecent = last(hygPts, LOOKBACK_DAYS);

  // Find the first 2 swing highs scanning backwards from today
  // Scale bars required based on lookback period: 20d→2 bars, 50d→5 bars, 100d→10 bars
  const barsEachSide = Math.max(2, Math.floor(LOOKBACK_DAYS / 10));
  const spyTop2 = findRecentSwingHighs(spyRecent, 2, barsEachSide);
  const hygTop2 = findRecentSwingHighs(hygRecent, 2, barsEachSide);

  // Calculate trend based on the slope of the line we're drawing
  let spyTrend = "Sideways ↔";
  if (spyTop2.length >= 2) {
    // If 2nd swing high is higher than 1st = Higher Highs
    if (spyTop2[1].price > spyTop2[0].price) {
      spyTrend = "Higher Highs ↗";
    } else if (spyTop2[1].price < spyTop2[0].price) {
      spyTrend = "Lower Highs ↘";
    }
  }

  let hygTrend = "Sideways ↔";
  if (hygTop2.length >= 2) {
    // If 2nd swing high is higher than 1st = Higher Highs
    if (hygTop2[1].price > hygTop2[0].price) {
      hygTrend = "Higher Highs ↗";
    } else if (hygTop2[1].price < hygTop2[0].price) {
      hygTrend = "Lower Highs ↘";
    }
  }

  // Update display
  document.getElementById("spySlope").textContent = spyTrend;
  document.getElementById("hygSlope").textContent = hygTrend;

  const lastSpy = spyPts.length ? spyPts[spyPts.length - 1][0] : NaN;
  const lastHyg = hygPts.length ? hygPts[hygPts.length - 1][0] : NaN;
  const lastTs = Math.max(lastSpy || -Infinity, lastHyg || -Infinity);
  document.getElementById("meta").textContent =
    `Last updated: ${Number.isFinite(lastTs) ? toIso(lastTs) : "unknown"}`;

  // Determine divergence signal based on trend slopes
  let message = "⚖️ No clear divergence";

  if (spyTrend === "Higher Highs ↗" && hygTrend === "Lower Highs ↘") {
    message = "⚠️ BEARISH DIVERGENCE: SPY making higher highs while HYG making lower highs (equities strong, credit weak)";
  } else if (spyTrend === "Lower Highs ↘" && hygTrend === "Higher Highs ↗") {
    message = "⚠️ BULLISH DIVERGENCE: SPY making lower highs while HYG making higher highs (unusual pattern)";
  } else if (spyTrend === "Higher Highs ↗" && hygTrend === "Higher Highs ↗") {
    message = "✅ RISK-ON: Both SPY and HYG making higher highs (healthy bull market)";
  } else if (spyTrend === "Lower Highs ↘" && hygTrend === "Lower Highs ↘") {
    message = "🔴 RISK-OFF: Both SPY and HYG making lower highs (bear market)";
  }

  document.getElementById("signal").textContent = message;

  // Render charts with EXACTLY the lookback period
  const spyChart = spyRecent; // Use the same data we analyzed
  const hygChart = hygRecent; // Use the same data we analyzed

  renderChart("chartSpy", spyChart, "#4a9eff", "SPY", spyTop2);
  renderChart("chartHyg", hygChart, "#ff6b6b", "HYG", hygTop2);

  // Calculate and render ratio chart
  // Align timestamps and calculate SPY/HYG ratio
  const ratioPoints = [];
  const spyMap = new Map(spyChart.map(p => [p[0], p[1]]));
  const hygMap = new Map(hygChart.map(p => [p[0], p[1]]));

  for (const [time, spyPrice] of spyMap) {
    const hygPrice = hygMap.get(time);
    if (hygPrice && hygPrice !== 0) {
      ratioPoints.push([time, spyPrice / hygPrice]);
    }
  }

  // Find swing highs on the ratio chart
  const ratioTop2 = findRecentSwingHighs(ratioPoints, 2, barsEachSide);

  renderChart("chartRatio", ratioPoints, "#a78bfa", "SPY/HYG", ratioTop2);
}

// =============================================================================
// INITIALIZATION
// =============================================================================

(async function main() {
  try {
    // Load data once
    const [spyPts, hygPts] = await Promise.all([
      loadCsvPoints("./data/spy.csv"),
      loadCsvPoints("./data/hyg.csv"),
    ]);

    // Store globally
    spyPtsGlobal = spyPts;
    hygPtsGlobal = hygPts;

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
    document.getElementById("signal").textContent = String(err);
  }
})();
