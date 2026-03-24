// =============================================================================
// FOMC POLICY DASHBOARD — fomc_app.js
// Self-contained — does not import from gov_data_app.js
// =============================================================================

// Series fetched for this page (plus FEDFUNDS from growth category for pre-2016 history)
const FOMC_SERIES = [
  'DFEDTARU', 'DFEDTARL', 'EFFR', 'IORB', 'SOFR', 'SOFR30DAYAVG',
  'WALCL', 'FEDTARMD', 'RRPONTSYD', 'WRESBAL', 'TREAST', 'MBST',
  'FEDFUNDS', // in growth category but needed for pre-EFFR rate history
];

const fomcCharts = new Map();

// =============================================================================
// DATA LOADING
// =============================================================================

async function loadFredCsv(seriesId) {
  const path = `./data/fred/${seriesId}.csv`;
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Failed to fetch ${path}: ${r.status}`);
  const text = await r.text();
  const lines = text.trim().split(/\r?\n/);
  lines.shift();
  const points = [];
  for (const line of lines) {
    const [date, value] = line.split(',');
    if (!date || !value || date === 'Date') continue;
    const v = parseFloat(value);
    if (!isFinite(v)) continue;
    points.push({ date, value: v });
  }
  return points;
}

async function loadFomcData() {
  // Try bundle first — contains ALL fred series including FEDFUNDS
  try {
    const r = await fetch('./data/fred/fred_cache.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const bundle = await r.json();
    const results = {};
    for (const id of FOMC_SERIES) {
      if (bundle.series && bundle.series[id]) {
        results[id] = bundle.series[id].map(([date, value]) => ({ date, value }));
      }
    }
    console.log(`FOMC: loaded from fred_cache.json (fetched ${bundle.fetched_at})`);
    return results;
  } catch (e) {
    console.warn(`fred_cache.json unavailable (${e.message}), falling back to individual CSVs`);
  }

  const results = {};
  await Promise.all(
    FOMC_SERIES.map(async (id) => {
      try {
        results[id] = await loadFredCsv(id);
      } catch (err) {
        console.warn(`Could not load ${id}: ${err.message}`);
        results[id] = null;
      }
    })
  );
  return results;
}

// =============================================================================
// DECISION TIMELINE — derived from day-over-day DFEDTARU deltas
// =============================================================================

function buildDecisionTimeline(dfedtaru) {
  if (!dfedtaru || dfedtaru.length < 2) return [];
  const decisions = [];
  for (let i = 1; i < dfedtaru.length; i++) {
    const delta = Math.round((dfedtaru[i].value - dfedtaru[i - 1].value) * 100); // bps
    if (delta !== 0) {
      decisions.push({
        date: dfedtaru[i].date,
        bps: delta,
        type: delta > 0 ? 'Hike' : 'Cut',
        rateLower: +(dfedtaru[i].value - 0.25).toFixed(2),
        rateUpper: +dfedtaru[i].value.toFixed(2),
      });
    }
  }
  return decisions.reverse(); // most recent first
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// =============================================================================
// SUMMARY CARDS
// =============================================================================

function renderSummaryCards(data, decisions) {
  const dfedtaru = data['DFEDTARU'];
  const dfedtarl = data['DFEDTARL'];
  const fedtarmd = data['FEDTARMD'];
  const walcl    = data['WALCL'];

  if (dfedtarl?.length && dfedtaru?.length) {
    const lo = dfedtarl[dfedtarl.length - 1].value;
    const hi = dfedtaru[dfedtaru.length - 1].value;
    document.getElementById('card-rate').textContent = `${lo.toFixed(2)}–${hi.toFixed(2)}%`;
  }

  if (decisions.length > 0) {
    const last = decisions[0];
    const sign = last.bps > 0 ? '+' : '';
    const color = last.type === 'Hike' ? '#f87171' : '#34d399';
    const el = document.getElementById('card-last-move');
    el.textContent = `${sign}${last.bps}bps`;
    el.style.color = color;
    document.getElementById('card-last-move-date').textContent = formatDate(last.date);
  }

  if (fedtarmd?.length) {
    const v = fedtarmd[fedtarmd.length - 1].value;
    const date = fedtarmd[fedtarmd.length - 1].date;
    document.getElementById('card-sep').textContent = `${v.toFixed(2)}%`;
    document.querySelector('#card-sep + .muted').textContent = `As of ${formatDate(date)}`;
  }

  if (walcl?.length) {
    const v = walcl[walcl.length - 1].value;
    // WALCL in millions → trillions
    document.getElementById('card-bs').textContent = `$${(v / 1_000_000).toFixed(2)}T`;
  }
}

// =============================================================================
// CHART HELPERS
// =============================================================================

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function destroyChart(id) {
  if (fomcCharts.has(id)) {
    try { fomcCharts.get(id).remove(); } catch (_) {}
    fomcCharts.delete(id);
  }
}

function createBaseChart(containerId, height) {
  destroyChart(containerId);
  const el = document.getElementById(containerId);
  if (!el) return null;

  const chart = LightweightCharts.createChart(el, {
    width: el.clientWidth,
    height,
    layout: { background: { color: 'transparent' }, textColor: '#a7a7ad' },
    grid: { vertLines: { color: '#1e1e2e' }, horzLines: { color: '#1e1e2e' } },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    rightPriceScale: { borderColor: '#2a2a3e' },
    timeScale: { borderColor: '#2a2a3e', timeVisible: true },
    handleScroll: false,
    handleScale: false,
  });

  new ResizeObserver(() => chart.applyOptions({ width: el.clientWidth })).observe(el);
  fomcCharts.set(containerId, chart);
  return chart;
}

function toChartPoints(points) {
  return points.map(p => ({ time: p.date, value: p.value }));
}

// fitContent then extend right edge by a fraction of the visible range.
// rightOffset in bars is useless at full zoom-out (12 bars = ~1px over 70 years).
// This approach scales correctly at any zoom level.
function fitWithPadding(chart, rightPct = 0.06) {
  chart.timeScale().fitContent();
  const vr = chart.timeScale().getVisibleLogicalRange();
  if (vr) {
    chart.timeScale().setVisibleLogicalRange({
      from: vr.from,
      to: vr.to + (vr.to - vr.from) * rightPct,
    });
  }
}

function filterAfter(points, isoDate) {
  return points ? points.filter(p => p.date >= isoDate) : [];
}

function nYearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// CHART 1: Rate History — FEDFUNDS (monthly) spliced with EFFR (daily)
//   Annotated with hike/cut arrows from the decision timeline
// =============================================================================

function renderRateHistoryChart(data, decisions) {
  const fedfunds = data['FEDFUNDS'] || [];
  const effr     = data['EFFR']     || [];

  // Splice: use FEDFUNDS for dates before EFFR begins, then EFFR
  const effrStart = effr.length > 0 ? effr[0].date : '2099-01-01';
  const pre  = fedfunds.filter(p => p.date < effrStart).map(p => ({ time: p.date, value: p.value }));
  const post = toChartPoints(effr);
  const combined = [...pre, ...post];
  if (combined.length < 2) return;

  const chart = createBaseChart('chart-rate-history', 300);
  if (!chart) return;

  const area = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#f97316',
    topColor: hexToRgba('#f97316', 0.3),
    bottomColor: hexToRgba('#f97316', 0.02),
    lineWidth: 2,
    title: 'Fed Funds Rate',
    priceLineVisible: true,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: true,
  });
  area.setData(combined);

  // Decision markers — arrows above/below for hikes/cuts
  // decisions are newest-first; markers need ascending order
  const firstDate = combined[0].time;
  const markers = [...decisions]
    .reverse()
    .filter(d => d.date >= firstDate)
    .map(d => ({
      time: d.date,
      position: d.type === 'Hike' ? 'aboveBar' : 'belowBar',
      color: d.type === 'Hike' ? '#f87171' : '#34d399',
      shape: d.type === 'Hike' ? 'arrowUp' : 'arrowDown',
      text: `${d.bps > 0 ? '+' : ''}${d.bps}`,
      size: 0.8,
    }));
  LightweightCharts.createSeriesMarkers(area, markers);

  fitWithPadding(chart);
}

// =============================================================================
// CHART 2: Rate Corridor — last 2 years, all 5 rate series
//   At this zoom level the 25bp gap between target upper/lower is clearly visible
// =============================================================================

function renderRateCorridorChart(data) {
  const cutoff = nYearsAgo(2);
  const dfedtaru = filterAfter(data['DFEDTARU'], cutoff);
  const dfedtarl = filterAfter(data['DFEDTARL'], cutoff);
  const effr     = filterAfter(data['EFFR'],     cutoff);
  const iorb     = filterAfter(data['IORB'],     cutoff);
  const sofr     = filterAfter(data['SOFR'],     cutoff);

  if (dfedtaru.length < 2) return;

  const chart = createBaseChart('chart-rate-corridor', 240);
  if (!chart) return;

  // Upper target — orange dashed
  const upper = chart.addSeries(LightweightCharts.LineSeries, {
    color: '#f97316',
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    title: 'Target Upper',
    priceLineVisible: false,
    lastValueVisible: true,
  });
  upper.setData(toChartPoints(dfedtaru));

  // Lower target — orange dashed (lighter)
  const lower = chart.addSeries(LightweightCharts.LineSeries, {
    color: hexToRgba('#f97316', 0.6),
    lineWidth: 1,
    lineStyle: LightweightCharts.LineStyle.Dashed,
    title: 'Target Lower',
    priceLineVisible: false,
    lastValueVisible: true,
  });
  lower.setData(toChartPoints(dfedtarl));

  // EFFR — solid white (the actual overnight rate)
  if (effr.length >= 2) {
    const effrS = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#e2e2e8',
      lineWidth: 2,
      title: 'EFFR',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    effrS.setData(toChartPoints(effr));
  }

  // SOFR — blue (benchmark replacement for LIBOR)
  if (sofr.length >= 2) {
    const sofrS = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#7aa2f7',
      lineWidth: 1,
      title: 'SOFR',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    sofrS.setData(toChartPoints(sofr));
  }

  // IORB — teal dotted (interest on reserve balances — sets the floor)
  if (iorb.length >= 2) {
    const iorbS = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#2dd4bf',
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dotted,
      title: 'IORB',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    iorbS.setData(toChartPoints(iorb));
  }

  fitWithPadding(chart);
}

// =============================================================================
// DECISION TABLE
// =============================================================================

function renderDecisionTable(decisions) {
  const tbody = document.getElementById('decision-tbody');
  if (!tbody) return;

  const shown = decisions.slice(0, 30);
  if (shown.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="padding:12px 8px;text-align:center">No decisions found</td></tr>';
    return;
  }

  tbody.innerHTML = shown.map(d => {
    const color = d.type === 'Hike' ? '#f87171' : '#34d399';
    const sign  = d.bps > 0 ? '+' : '';
    return `
      <tr style="border-bottom:1px solid #1e1e2e">
        <td style="padding:7px 8px;color:#e2e2e8">${formatDate(d.date)}</td>
        <td style="padding:7px 8px;color:${color};font-weight:600">${d.type}</td>
        <td style="padding:7px 8px;text-align:right;color:${color}">${sign}${d.bps}bps</td>
        <td style="padding:7px 8px;text-align:right;color:#e2e2e8">${d.rateLower}–${d.rateUpper}%</td>
      </tr>`;
  }).join('');
}

// =============================================================================
// CHART 3: SEP Dot Plot — FEDTARMD quarterly projections as dots over time
//   Shows how the Fed's projected path has shifted meeting-by-meeting
// =============================================================================

function renderSepChart(data) {
  const fedtarmd = data['FEDTARMD'];
  if (!fedtarmd || fedtarmd.length < 2) return;

  const chart = createBaseChart('chart-sep', 220);
  if (!chart) return;

  // Thin connecting line
  const line = chart.addSeries(LightweightCharts.LineSeries, {
    color: hexToRgba('#f97316', 0.4),
    lineWidth: 1,
    title: 'SEP Median',
    priceLineVisible: true,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: true,
  });
  line.setData(toChartPoints(fedtarmd));

  // Large circle markers at each quarterly dot
  LightweightCharts.createSeriesMarkers(
    line,
    fedtarmd.map(p => ({
      time: p.date,
      position: 'inBar',
      color: '#f97316',
      shape: 'circle',
      size: 2,
      text: `${p.value.toFixed(2)}%`,
    }))
  );

  fitWithPadding(chart);
}

// =============================================================================
// CHART 4: Overnight Reverse Repo — RRPONTSYD
//   Excess cash parked at Fed; drain = liquidity re-entering markets
// =============================================================================

function renderReverseRepoChart(data) {
  const rrpo = data['RRPONTSYD'];
  if (!rrpo || rrpo.length < 2) return;

  const chart = createBaseChart('chart-rrpo', 220);
  if (!chart) return;

  const area = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#818cf8',
    topColor: hexToRgba('#818cf8', 0.35),
    bottomColor: hexToRgba('#818cf8', 0.02),
    lineWidth: 2,
    title: 'O/N RRP ($B)',
    priceLineVisible: true,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: true,
  });
  // RRPONTSYD is already in billions
  area.setData(toChartPoints(rrpo));
  fitWithPadding(chart);
}

// =============================================================================
// CHART 5: Balance Sheet Composition — WALCL total + TREAST + MBST breakdown
//   All three series in millions → convert to billions for display
// =============================================================================

function renderBalanceSheetChart(data) {
  const walcl  = data['WALCL'];
  const treast = data['TREAST'];
  const mbst   = data['MBST'];

  if (!walcl || walcl.length < 2) return;

  // WALCL, TREAST, MBST all in millions — convert to billions
  const toB = pts => pts.map(p => ({ time: p.date, value: +(p.value / 1000).toFixed(1) }));

  const chart = createBaseChart('chart-balance-sheet', 280);
  if (!chart) return;

  // Total assets — filled area (background context)
  const totalArea = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#a78bfa',
    topColor: hexToRgba('#a78bfa', 0.2),
    bottomColor: hexToRgba('#a78bfa', 0.0),
    lineWidth: 2,
    title: 'Total Assets',
    priceLineVisible: true,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: true,
  });
  totalArea.setData(toB(walcl));

  // Treasuries — blue line
  if (treast?.length >= 2) {
    const tLine = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#7aa2f7',
      lineWidth: 2,
      title: 'Treasuries',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    tLine.setData(toB(treast));
  }

  // MBS — amber line
  if (mbst?.length >= 2) {
    const mLine = chart.addSeries(LightweightCharts.LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      title: 'MBS',
      priceLineVisible: false,
      lastValueVisible: true,
    });
    mLine.setData(toB(mbst));
  }

  fitWithPadding(chart);
}

// =============================================================================
// CHART 6: Reserve Balances — WRESBAL
//   Banks' excess reserves held at Fed; falls when RRP drains or QT runs
// =============================================================================

function renderReserveBalancesChart(data) {
  const wresbal = data['WRESBAL'];
  if (!wresbal || wresbal.length < 2) return;

  const chart = createBaseChart('chart-wresbal', 220);
  if (!chart) return;

  const area = chart.addSeries(LightweightCharts.AreaSeries, {
    lineColor: '#34d399',
    topColor: hexToRgba('#34d399', 0.3),
    bottomColor: hexToRgba('#34d399', 0.02),
    lineWidth: 2,
    title: 'Reserve Balances ($B)',
    priceLineVisible: true,
    priceLineStyle: LightweightCharts.LineStyle.Dashed,
    lastValueVisible: true,
  });
  // WRESBAL is already in billions
  area.setData(toChartPoints(wresbal));
  fitWithPadding(chart);
}

// =============================================================================
// MAIN
// =============================================================================

async function init() {
  try {
    const data = await loadFomcData();
    const decisions = buildDecisionTimeline(data['DFEDTARU'] || []);

    renderSummaryCards(data, decisions);

    const dfedtaru = data['DFEDTARU'];
    if (dfedtaru?.length) {
      const lastDate = dfedtaru[dfedtaru.length - 1].date;
      document.getElementById('meta').textContent =
        `Last updated: ${lastDate} · ${decisions.length} rate decisions detected since 2008`;
    } else {
      document.getElementById('meta').textContent = 'Data loaded';
    }

    for (const [fn, args] of [
      [renderRateHistoryChart,    [data, decisions]],
      [renderRateCorridorChart,   [data]],
      [renderDecisionTable,       [decisions]],
      [renderSepChart,            [data]],
      [renderReverseRepoChart,    [data]],
      [renderBalanceSheetChart,   [data]],
      [renderReserveBalancesChart,[data]],
    ]) {
      try { fn(...args); } catch (e) { console.error(`${fn.name}:`, e); }
    }

  } catch (err) {
    console.error('FOMC init error:', err);
    document.getElementById('meta').textContent = `Error: ${err.message}`;
  }
}

init();
