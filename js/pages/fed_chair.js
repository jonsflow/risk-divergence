// js/pages/fed_chair.js — Fed Chair Transition Dashboard (ES module).
import { renderNav }       from '../components/Navigation.js';
import { fetchFredBundle, fetchCache } from '../core/api.js';
import { showLoadError }   from '../core/utils.js';
import { renderFedStrip } from '../components/FedStrip.js';
import { renderGlossary } from '../components/Glossary.js';
import {
  createFomcChart, fitWithRightPadding, addChartLegend, hexToRgba, colors,
} from '../core/chart-utils.js';

const LC = window.LightweightCharts;

const FEDCHAIR_SERIES = [
  'WALCL', 'TREAST', 'WSHOMCB',
  'WRESBAL', 'RRPONTSYD',
  'FEDFUNDS', 'EFFR',
  'PCEPILFE', 'CPILFESL',
  'T10YIE', 'T5YIE',
  'T10Y2Y',
];

// One window for every chart on this page so they can be read against each
// other. The page is about the current regime; two decades of history flattens
// nineteen months of it into a single step.
const CHART_START = '2025-01-01';

const ERA = {
  powellStart:    '2018-02-05',
  covidQE:        '2020-03-15',
  faitAdopted:    '2020-08-27',
  firstHike:      '2022-03-17',
  qtBegins:       '2022-06-01',
  firstCut:       '2024-09-19',
  faitAbandoned:  '2025-08-22',
  warshHearing:   '2026-04-21',
  powellLastFomc: '2026-04-29',
  warshConfirmed: '2026-05-13',
  warshFirstFomc: '2026-06-17',
};

// Page content (doctrine scorecard + policy timeline) lives in
// config/fed_chair.json so updating after a meeting is a data edit.
let content = { page: {}, eras: [], doctrine: [], timeline: [] };

const fedChairCharts = new Map();

function toChartPoints(points) {
  return points.map(p => ({ time: p.date, value: p.value }));
}

function computeMonthlyYoY(points) {
  return points.slice(12).map((p, i) => ({
    date:  p.date,
    value: +((p.value / points[i].value - 1) * 100).toFixed(2),
  }));
}

function destroyChart(id) {
  if (fedChairCharts.has(id)) {
    try { fedChairCharts.get(id).remove(); } catch (_) {}
    fedChairCharts.delete(id);
  }
}

function makeChart(containerId, height) {
  destroyChart(containerId);
  const el = document.getElementById(containerId);
  if (!el) return null;
  const chart = createFomcChart(el, height);
  fedChairCharts.set(containerId, chart);
  return chart;
}

// ------------------------------------------------------------------
// Era overlay — vertical region bands + line markers
// ------------------------------------------------------------------

function addChartOverlay(chart, containerId, { regions = [], lines = [] } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  const existing = container.querySelector('.era-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'era-overlay';
  overlay.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;overflow:hidden;z-index:1';
  container.appendChild(overlay);

  function coordFor(ts, dateStr) {
    const c = ts.timeToCoordinate(dateStr);
    if (c !== null) return c;
    const base = new Date(dateStr);
    for (let d = 1; d <= 14; d++) {
      for (const sign of [1, -1]) {
        const t = new Date(base);
        t.setDate(t.getDate() + sign * d);
        const iso = t.toISOString().slice(0, 10);
        const v   = ts.timeToCoordinate(iso);
        if (v !== null) return v;
      }
    }
    return null;
  }

  function render() {
    const w = container.clientWidth;
    if (!w) return;
    overlay.innerHTML = '';
    const ts = chart.timeScale();

    for (const r of regions) {
      let x1 = coordFor(ts, r.from) ?? 0;
      let x2 = coordFor(ts, r.to)   ?? w;
      x1 = Math.max(0, Math.round(x1));
      x2 = Math.min(w, Math.round(x2));
      if (x2 <= x1) continue;
      const div = document.createElement('div');
      div.style.cssText = `position:absolute;top:0;bottom:0;left:${x1}px;width:${x2 - x1}px;background:${r.color}`;
      overlay.appendChild(div);

      // Label the band rather than the boundary — boundary labels collide when
      // two dates fall close together on a long axis.
      //
      // Anchored to the bottom, clear of the time axis (~34px): addChartLegend
      // occupies top:8px/left:8px, which a band starting at x=0 would sit under.
      if (r.label && x2 - x1 > 44) {
        const tag = document.createElement('div');
        tag.style.cssText = `position:absolute;bottom:40px;left:${x1 + 6}px;font-size:10px;`
          + `font-weight:600;color:${r.labelColor || '#a7a7ad'};white-space:nowrap;letter-spacing:0.04em`;
        tag.textContent = r.label;
        overlay.appendChild(tag);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const m  = lines[i];
      const x  = coordFor(ts, m.date);
      if (x === null || x < 0 || x > w) continue;
      const lx = Math.round(x);

      const line = document.createElement('div');
      line.style.cssText = `position:absolute;top:0;bottom:34px;left:${lx}px;width:1px;background:${m.color};opacity:0.7`;
      overlay.appendChild(line);

      const label = document.createElement('div');
      label.style.cssText = `position:absolute;bottom:20px;left:${lx}px;transform:translateX(-50%);font-size:10px;color:${m.color};white-space:nowrap;font-weight:600`;
      label.textContent = m.label;
      overlay.appendChild(label);
    }
  }

  chart.timeScale().subscribeVisibleTimeRangeChange(render);
  new ResizeObserver(() => requestAnimationFrame(render)).observe(container);
  requestAnimationFrame(render);   // initial paint; the events above may never fire
}

// ------------------------------------------------------------------
// Scorecard
// ------------------------------------------------------------------

function renderScorecard(data) {
  const walcl    = data['WALCL'];
  const pcepilfe = data['PCEPILFE'];
  const t10yie   = data['T10YIE'];
  const t10y2y   = data['T10Y2Y'];

  const pceYoY = pcepilfe?.length >= 13 ? computeMonthlyYoY(pcepilfe) : null;

  const metrics = [
    {
      // Total assets is on the shared strip; what this page adds is the distance
      // from the pre-COVID level Warsh treats as the floor.
      label: 'Gap to Pre-COVID',
      raw: walcl?.length ? walcl[walcl.length - 1].value : null,
      display: v => `+$${((v / 1_000_000) - 4.2).toFixed(2)}T`,
      warshTake: 'Pre-COVID level (~$4.2T) is the implicit floor — accelerating QT is his primary lever',
      status(v) {
        const t = v / 1_000_000;
        if (t > 7.5) return { text: 'Very Elevated', color: '#ef4444' };
        if (t > 6.0) return { text: 'Elevated',      color: '#f59e0b' };
        return              { text: 'Declining',      color: '#34d399' };
      },
    },
    {
      label: 'Core PCE (YoY%)',
      raw: pceYoY?.length ? pceYoY[pceYoY.length - 1].value : null,
      display: v => `${v.toFixed(1)}%`,
      warshTake: 'Strict 2% — no averaging, no overshoot tolerance',
      status(v) {
        if (v > 2.5) return { text: 'Above Target',   color: '#ef4444' };
        if (v > 2.0) return { text: 'Slightly Above', color: '#f59e0b' };
        return              { text: 'At Target',       color: '#34d399' };
      },
    },
    {
      label: '10Y Breakeven',
      raw: t10yie?.length ? t10yie[t10yie.length - 1].value : null,
      display: v => `${v.toFixed(2)}%`,
      warshTake: 'Must stay anchored at 2% — de-anchoring = policy failure',
      status(v) {
        if (v > 2.7) return { text: 'De-Anchored', color: '#ef4444' };
        if (v > 2.3) return { text: 'Elevated',    color: '#f59e0b' };
        return              { text: 'Anchored',     color: '#34d399' };
      },
    },
    {
      label: 'Yield Curve (10Y−2Y)',
      raw: t10y2y?.length ? t10y2y[t10y2y.length - 1].value : null,
      display: v => `${v.toFixed(2)}%`,
      warshTake: 'QT should steepen by unwinding QE-era term premium distortion',
      status(v) {
        if (v < -0.1) return { text: 'Inverted',     color: '#ef4444' };
        if (v < 0.3)  return { text: 'Flat',          color: '#f59e0b' };
        return               { text: 'Normal Slope', color: '#34d399' };
      },
    },
  ];

  const container = document.getElementById('scorecard-container');
  if (!container) return;

  container.innerHTML = metrics.map(m => {
    if (m.raw === null) return `
      <div class="card">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${m.label}</div>
        <div style="font-size:24px;font-weight:bold;margin-bottom:12px;color:#a7a7ad">—</div>
        <div class="muted" style="font-size:11px">${m.warshTake}</div>
      </div>`;
    const s = m.status(m.raw);
    return `
      <div class="card">
        <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">${m.label}</div>
        <div style="font-size:24px;font-weight:bold;margin-bottom:6px;color:${s.color}">${m.display(m.raw)}</div>
        <div style="display:inline-block;background:${s.color}22;color:${s.color};font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;margin-bottom:10px">${s.text}</div>
        <div class="muted" style="font-size:11px;line-height:1.5">Warsh: ${m.warshTake}</div>
      </div>`;
  }).join('');
}

function esc(v) {
  return String(v).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** {placeholder} substitution against the chair record from fomc_meetings.json. */
function fill(tpl, chair) {
  const longDate = iso => iso
    ? new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';
  const last = str => String(str || '').trim().split(/\s+/).pop();
  const vals = {
    ...chair,
    last:            last(chair.name),
    predecessor_last: last(chair.predecessor),
    confirmed_long:  longDate(chair.confirmed),
    sworn_in_long:   longDate(chair.sworn_in),
  };
  return String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => esc(vals[k] ?? ''));
}

function renderHeader(chair) {
  const page = content.page || {};
  const set = (id, tpl) => {
    const el = document.getElementById(id);
    if (el && tpl) el.textContent = fill(tpl, chair);
  };
  set('page-title', page.title);
  set('page-intro', page.intro);
  set('scorecard-title', page.sections?.scorecard);
  set('doctrine-sub',   page.sections?.doctrine_sub);
  set('timeline-title', page.sections?.timeline);

  for (const [key, tpl] of Object.entries(page.captions || {})) {
    set(`cap-${key.replace(/_/g, '-')}`, tpl);
  }

  if (page.doc_title) document.title = fill(page.doc_title, chair);
  const desc = document.querySelector('meta[name="description"]');
  if (desc && page.description) desc.setAttribute('content', fill(page.description, chair));
}

function renderEras() {
  const host = document.getElementById('eras-container');
  if (!host) return;
  host.innerHTML = content.eras.map(e => `
    <div class="card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div style="width:4px;height:44px;background:${esc(e.color)};border-radius:2px;flex-shrink:0"></div>
        <div>
          <div style="font-size:16px;font-weight:bold;color:${esc(e.color)}">${esc(e.name)}${e.period ? ` (${esc(e.period)})` : ''}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">${esc(e.subtitle || '')}</div>
        </div>
      </div>
      <ul style="margin:0;padding-left:18px;font-size:13px;line-height:2;color:#e9e9ea">
        ${(e.bullets || []).map(b => `<li>${esc(b)}</li>`).join('')}
      </ul>
      ${e.quote ? `<div style="margin-top:14px;padding:10px 12px;background:#1a1a2e;border-left:3px solid ${esc(e.color)};border-radius:0 4px 4px 0;font-size:12px;color:#a7a7ad;font-style:italic;line-height:1.6">
        "${esc(e.quote.text)}"
        <span style="display:block;margin-top:4px;font-style:normal;color:#6b7280">— ${esc(e.quote.attribution)}</span>
      </div>` : ''}
    </div>`).join('');
}

function renderDoctrine() {
  const container = document.getElementById('doctrine-container');
  if (!container) return;
  container.innerHTML = content.doctrine.map(d => `
    <div style="padding:12px;background:#1a1a2e;border-radius:6px;border:1px solid #2a2a3e">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;font-weight:700;color:#f97316;text-transform:uppercase;letter-spacing:0.05em">${d.label}</div>
        <div style="background:${d.status.color}22;color:${d.status.color};font-size:10px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap">${d.status.text}</div>
      </div>
      <div class="muted" style="font-size:12px;line-height:1.6;margin-bottom:8px"><strong style="color:#a7a7ad">Stated:</strong> ${d.stated}</div>
      <div style="font-size:13px;color:#e9e9ea;line-height:1.6"><strong style="color:#a7a7ad;font-size:12px">Record:</strong> ${d.record}</div>
      ${(d.sources || []).length ? `<div style="margin-top:8px;font-size:11px;line-height:1.8">
        ${d.sources.map(src => `<a href="${esc(src.url)}" target="_blank" rel="noopener" style="color:#7aa2f7;text-decoration:none">${esc(src.label)} &nearr;</a>`).join('<span style="color:#3a3a42"> · </span>')}
      </div>` : ''}
    </div>`).join('');
}

/**
 * Month-over-month change in a weekly stock series, in $B.
 * Compares each month's last observation with the previous month's last, so an
 * incomplete current month is dropped rather than shown as a partial move.
 */
function monthlyChange(points, months = 6) {
  if (!points?.length) return [];
  const byMonth = new Map();
  for (const p of points) byMonth.set(p.date.slice(0, 7), p);   // last wins
  const keys = [...byMonth.keys()].sort();

  const nowMonth = new Date().toISOString().slice(0, 7);
  const out = [];
  for (let i = 1; i < keys.length; i++) {
    if (keys[i] === nowMonth) continue;                          // partial month
    out.push({
      time:  byMonth.get(keys[i]).date,
      value: +((byMonth.get(keys[i]).value - byMonth.get(keys[i - 1]).value) / 1000).toFixed(1),
    });
  }
  return out.slice(-months);
}

/**
 * Pace of balance sheet change, not level. The doctrine card claims the purchase
 * rate is falling even though total assets rise; this is that claim, shown.
 *
 * Six monthly values do not need a financial chart — a labelled bar per month
 * reads faster and cannot be misread as a continuous series.
 */
function renderPace(data) {
  const host = document.getElementById('bs-pace');
  if (!host) return;

  const tsy = monthlyChange(data['TREAST']);
  const mbs = monthlyChange(data['WSHOMCB']);
  const net = monthlyChange(data['WALCL']);
  if (!tsy.length) { host.innerHTML = ''; return; }

  const byMonth = arr => Object.fromEntries(arr.map(p => [p.time.slice(0, 7), p.value]));
  const M = byMonth(mbs), N = byMonth(net);
  const peak = Math.max(...tsy.map(p => Math.abs(p.value)), 1);

  const monthName = ym => new Date(ym + '-02T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  const sign = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)}`);

  host.innerHTML = `
    <div class="pace-grid">
      <div class="pace-head">Month</div>
      <div class="pace-head" style="grid-column:span 2">Treasuries bought</div>
      <div class="pace-head pace-num">MBS</div>
      <div class="pace-head pace-num">Net</div>
      ${tsy.map(p => {
        const ym = p.time.slice(0, 7);
        return `
        <div class="pace-month">${monthName(ym)}</div>
        <div class="pace-barwrap">
          <div class="pace-bar" style="width:${(Math.abs(p.value) / peak * 100).toFixed(1)}%"></div>
        </div>
        <div class="pace-barval">+$${p.value.toFixed(0)}B</div>
        <div class="pace-num pace-mbs">${sign(M[ym])}</div>
        <div class="pace-num">${sign(N[ym])}</div>`;
      }).join('')}
    </div>
    ${paceVerdict(tsy)}`;
}

/**
 * State the trend rather than leaving it to be inferred from the bars.
 * Computed from the data so it cannot drift out of agreement with the chart.
 */
function paceVerdict(tsy) {
  if (tsy.length < 4) return '';
  const half = Math.floor(tsy.length / 2);
  const mean = arr => arr.reduce((s, p) => s + p.value, 0) / arr.length;
  const older = mean(tsy.slice(0, half));
  const newer = mean(tsy.slice(half));
  if (!older) return '';

  const pct = Math.round((newer - older) / Math.abs(older) * 100);
  const span = a => `${new Date(a[0].time + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}–${new Date(a[a.length - 1].time + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}`;

  const dir = pct < -5 ? { word: 'slowed',   color: '#34d399' }
            : pct >  5 ? { word: 'accelerated', color: '#ef4444' }
            :            { word: 'held steady', color: '#a7a7ad' };

  return `
    <div class="pace-verdict">
      Buying <strong style="color:${dir.color}">${dir.word}</strong>:
      <strong>$${older.toFixed(0)}B/mo</strong> across ${span(tsy.slice(0, half))}
      &rarr; <strong>$${newer.toFixed(0)}B/mo</strong> across ${span(tsy.slice(half))}${
        Math.abs(pct) > 5 ? `, ${Math.abs(pct)}% ${pct < 0 ? 'lower' : 'higher'}` : ''}.
    </div>`;
}

// How many timeline rows to show before the toggle. The list is newest-first and
// the recent entries are the ones being referenced; the rest is history.
const TIMELINE_VISIBLE = 7;
let timelineExpanded = false;

function renderTimeline() {
  const tbody = document.getElementById('timeline-tbody');
  if (!tbody) return;
  // Config keeps the timeline newest-last so new events are appended; the page
  // shows newest first.
  const all = [...content.timeline].reverse();
  const rows = timelineExpanded ? all : all.slice(0, TIMELINE_VISIBLE);

  tbody.innerHTML = rows.map(ev => {
    const isWarsh = ev.era === 'warsh';
    return `
      <tr style="border-bottom:1px solid #1e1e2e">
        <td style="padding:6px 8px;white-space:nowrap;color:${isWarsh ? '#f97316' : '#a7a7ad'};font-size:12px">${ev.date}</td>
        <td style="padding:6px 8px;color:${isWarsh ? '#f97316' : '#e9e9ea'}">${ev.event}</td>
        <td style="padding:6px 8px;color:#a7a7ad;font-size:12px">${ev.context}</td>
      </tr>`;
  }).join('');

  if (all.length > TIMELINE_VISIBLE) {
    const label = timelineExpanded
      ? 'Show recent only'
      : `Show all ${all.length} events`;
    tbody.insertAdjacentHTML('beforeend', `
      <tr><td colspan="3" style="padding:10px 8px">
        <button type="button" class="timeline-toggle">${label}</button>
      </td></tr>`);
    tbody.querySelector('.timeline-toggle').addEventListener('click', () => {
      timelineExpanded = !timelineExpanded;
      renderTimeline();
    });
  }
}

// ------------------------------------------------------------------
// Charts
// ------------------------------------------------------------------

function renderBalanceSheetChart(data) {
  const walcl = data['WALCL'];
  if (!walcl?.length) return;

  const toB = pts => pts.filter(p => p.date >= CHART_START).map(p => ({ time: p.date, value: +(p.value / 1000).toFixed(1) }));

  const chart = makeChart('chart-balance-sheet', 300);
  if (!chart) return;

  const area = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.balSheet,
    topColor:    hexToRgba(colors.balSheet, 0.25),
    bottomColor: hexToRgba(colors.balSheet, 0),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  area.setData(toB(walcl));

  const treast = data['TREAST'];
  const wshomcb = data['WSHOMCB'];
  const entries = [{ label: 'Total Assets', color: colors.balSheet, value: `$${(walcl[walcl.length-1].value/1000).toFixed(0)}B` }];
  if (treast?.length)  entries.push({ label: 'Treasuries', color: colors.sofr, value: `$${(treast[treast.length-1].value/1000).toFixed(0)}B` });
  if (wshomcb?.length) entries.push({ label: 'MBS',        color: colors.mbs,  value: `$${(wshomcb[wshomcb.length-1].value/1000).toFixed(0)}B` });
  addChartLegend('chart-balance-sheet', entries);
  fitWithRightPadding(chart, toB(walcl).length, 0.04);

  addChartOverlay(chart, 'chart-balance-sheet', {
    regions: [
      { from: CHART_START,     to: ERA.warshConfirmed, color: 'rgba(122,162,247,0.14)',
        label: 'Powell', labelColor: '#7aa2f7' },
      { from: ERA.warshConfirmed, to: '2030-01-01',       color: 'rgba(249,115,22,0.14)',
        label: 'Warsh',  labelColor: '#f97316' },
    ],
  });
}

function renderInflationChart(data) {
  const pcepilfe = data['PCEPILFE'];
  const cpilfesl = data['CPILFESL'];

  const pceYoY = pcepilfe?.length >= 13 ? computeMonthlyYoY(pcepilfe).filter(p => p.date >= CHART_START) : [];
  const cpiYoY = cpilfesl?.length >= 13 ? computeMonthlyYoY(cpilfesl).filter(p => p.date >= CHART_START) : [];
  if (!pceYoY.length && !cpiYoY.length) return;

  const chart = makeChart('chart-inflation', 260);
  if (!chart) return;

  const pceColor = '#7aa2f7';
  const cpiColor = '#34d399';

  if (pceYoY.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, { color: pceColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    s.setData(toChartPoints(pceYoY));
  }
  if (cpiYoY.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, { color: cpiColor, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    s.setData(toChartPoints(cpiYoY));
  }

  const refData = pceYoY.length ? pceYoY : cpiYoY;
  const target  = chart.addSeries(LC.LineSeries, {
    color: '#ef4444', lineWidth: 1, lineStyle: LC.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: false,
  });
  target.setData([{ time: refData[0].date, value: 2.0 }, { time: refData[refData.length - 1].date, value: 2.0 }]);

  const entries = [];
  if (pceYoY.length) entries.push({ label: 'Core PCE', color: pceColor, value: `${pceYoY[pceYoY.length-1].value.toFixed(1)}%` });
  if (cpiYoY.length) entries.push({ label: 'Core CPI', color: cpiColor, value: `${cpiYoY[cpiYoY.length-1].value.toFixed(1)}%` });
  entries.push({ label: 'Target', color: '#ef4444', value: '2.0%' });
  addChartLegend('chart-inflation', entries);
  fitWithRightPadding(chart, Math.max(pceYoY.length, cpiYoY.length), 0.04);

  addChartOverlay(chart, 'chart-inflation', {
    regions: [
      { from: CHART_START,        to: ERA.warshConfirmed, color: 'rgba(122,162,247,0.14)',
        label: 'Powell', labelColor: '#7aa2f7' },
      { from: ERA.warshConfirmed, to: '2030-01-01',       color: 'rgba(249,115,22,0.14)',
        label: 'Warsh',  labelColor: '#f97316' },
    ],
  });
}

function renderBreakevenChart(data) {
  const t10yie = (data['T10YIE'] || []).filter(p => p.date >= CHART_START);
  const t5yie  = (data['T5YIE']  || []).filter(p => p.date >= CHART_START);
  if (!t10yie.length) return;

  const chart = makeChart('chart-breakevens', 260);
  if (!chart) return;

  const c10 = '#7aa2f7';
  const c5  = '#2dd4bf';

  const s10 = chart.addSeries(LC.LineSeries, { color: c10, lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true });
  s10.setData(toChartPoints(t10yie));

  if (t5yie?.length >= 2) {
    const s5 = chart.addSeries(LC.LineSeries, { color: c5, lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
    s5.setData(toChartPoints(t5yie));
  }

  const anchor = chart.addSeries(LC.LineSeries, {
    color: '#ef4444', lineWidth: 1, lineStyle: LC.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: false,
  });
  anchor.setData([{ time: t10yie[0].date, value: 2.0 }, { time: t10yie[t10yie.length - 1].date, value: 2.0 }]);

  const entries = [{ label: '10Y BEI', color: c10, value: `${t10yie[t10yie.length-1].value.toFixed(2)}%` }];
  if (t5yie?.length) entries.push({ label: '5Y BEI', color: c5, value: `${t5yie[t5yie.length-1].value.toFixed(2)}%` });
  entries.push({ label: 'Anchor', color: '#ef4444', value: '2.0%' });
  addChartLegend('chart-breakevens', entries);
  fitWithRightPadding(chart, t10yie.length, 0.04);

  addChartOverlay(chart, 'chart-breakevens', {
    regions: [
      { from: CHART_START,        to: ERA.warshConfirmed, color: 'rgba(122,162,247,0.14)',
        label: 'Powell', labelColor: '#7aa2f7' },
      { from: ERA.warshConfirmed, to: '2030-01-01',       color: 'rgba(249,115,22,0.14)',
        label: 'Warsh',  labelColor: '#f97316' },
    ],
  });
}

function renderRateChart(data) {
  const fedfunds  = data['FEDFUNDS'] || [];
  const effr      = data['EFFR']     || [];
  const effrStart = effr.length ? effr[0].date : '2099-01-01';
  // FEDFUNDS only covers the window if it starts before EFFR does; at the current
  // window it never does, but the splice stays correct if the window moves back.
  const pre       = fedfunds.filter(p => p.date >= CHART_START && p.date < effrStart).map(p => ({ time: p.date, value: p.value }));
  const combined  = [...pre, ...toChartPoints(effr.filter(p => p.date >= CHART_START))];
  if (combined.length < 2) return;

  const chart = makeChart('chart-rates', 260);
  if (!chart) return;

  const area = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.rate,
    topColor:    hexToRgba(colors.rate, 0.3),
    bottomColor: hexToRgba(colors.rate, 0.02),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  area.setData(combined);

  addChartLegend('chart-rates', [
    { label: 'EFFR', color: colors.rate, value: `${combined[combined.length - 1].value.toFixed(2)}%` },
  ]);
  fitWithRightPadding(chart, combined.length, 0.04);

  addChartOverlay(chart, 'chart-rates', {
    regions: [
      { from: CHART_START,        to: ERA.warshConfirmed, color: 'rgba(122,162,247,0.14)',
        label: 'Powell', labelColor: '#7aa2f7' },
      { from: ERA.warshConfirmed, to: '2030-01-01',       color: 'rgba(249,115,22,0.14)',
        label: 'Warsh',  labelColor: '#f97316' },
    ],
  });
}

function renderReservesChart(data) {
  const wresbal   = data['WRESBAL'];
  const rrpontsyd = data['RRPONTSYD'];
  if (!wresbal?.length) return;

  const resFiltered = wresbal.filter(p => p.date >= CHART_START);
  const rrpFiltered = rrpontsyd?.filter(p => p.date >= CHART_START) ?? [];
  if (resFiltered.length < 2) return;

  const chart = makeChart('chart-reserves', 260);
  if (!chart) return;

  const resArea = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.reserves,
    topColor:    hexToRgba(colors.reserves, 0.3),
    bottomColor: hexToRgba(colors.reserves, 0.02),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  resArea.setData(toChartPoints(resFiltered));

  if (rrpFiltered.length >= 2) {
    const rrpLine = chart.addSeries(LC.LineSeries, {
      color: colors.rrp, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    });
    rrpLine.setData(toChartPoints(rrpFiltered));
  }

  const entries = [{ label: 'Reserve Balances', color: colors.reserves, value: `$${Math.round(resFiltered[resFiltered.length-1].value)}B` }];
  if (rrpFiltered.length) entries.push({ label: 'O/N RRP', color: colors.rrp, value: `$${Math.round(rrpFiltered[rrpFiltered.length-1].value)}B` });
  addChartLegend('chart-reserves', entries);
  fitWithRightPadding(chart, resFiltered.length, 0.04);

  addChartOverlay(chart, 'chart-reserves', {
    regions: [
      { from: CHART_START,        to: ERA.warshConfirmed, color: 'rgba(122,162,247,0.14)',
        label: 'Powell', labelColor: '#7aa2f7' },
      { from: ERA.warshConfirmed, to: '2030-01-01',       color: 'rgba(249,115,22,0.14)',
        label: 'Warsh',  labelColor: '#f97316' },
    ],
  });
}

// ------------------------------------------------------------------
// Init
// ------------------------------------------------------------------

async function init() {
  renderNav();
  renderFedStrip();
  renderGlossary();

  // Narrative content is independent of the FRED bundle; render it as soon as it
  // arrives rather than gating it behind the chart data.
  let chair = {};
  try {
    const [c, meetings] = await Promise.all([
      fetchCache('config/fed_chair.json'),
      fetchCache('config/fomc_meetings.json'),
    ]);
    content = c;
    chair   = meetings.chair || {};
  } catch (err) {
    console.error('Fed Chair content failed to load:', err);
  }
  renderHeader(chair);
  renderEras();
  renderDoctrine();
  renderTimeline();

  try {
    const bundle = await fetchFredBundle();
    const data   = {};
    for (const id of FEDCHAIR_SERIES) {
      if (bundle.series?.[id]) {
        data[id] = bundle.series[id].map(([date, value]) => ({ date, value }));
      }
    }

    const effr  = data['EFFR'];
    const walcl = data['WALCL'];
    const parts = [];
    if (effr?.length)  parts.push(`EFFR as of ${effr[effr.length - 1].date}`);
    if (walcl?.length) parts.push(`balance sheet as of ${walcl[walcl.length - 1].date}`);
    const metaEl = document.getElementById('meta');
    if (metaEl) metaEl.textContent = parts.length ? parts.join(' · ') : 'Data loaded';

    renderScorecard(data);

    for (const [fn, args] of [
      [renderBalanceSheetChart, [data]],
      [renderPace,              [data]],
      [renderInflationChart,    [data]],
      [renderBreakevenChart,    [data]],
      [renderRateChart,         [data]],
      [renderReservesChart,     [data]],
    ]) {
      try { fn(...args); } catch (e) { console.error(`${fn.name}:`, e); }
    }
  } catch (err) {
    showLoadError(err, 'Fed Chair');
  }
}

document.addEventListener('DOMContentLoaded', init);
