// js/pages/fomc.js — FOMC Policy Dashboard page (ES module).
import { renderNav }                  from '../components/Navigation.js';
import { fetchFredBundle, fetchCache } from '../core/api.js';
import { showLoadError }              from '../core/utils.js';
import { renderFedStrip }             from '../components/FedStrip.js';
import { buildDecisionTimeline, fedDate } from '../core/fed-data.js';
import {
  createFomcChart, fitWithRightPadding, addChartLegend, addZoomControls, hexToRgba, colors,
} from '../core/chart-utils.js';

const LC = window.LightweightCharts;

const FOMC_SERIES = [
  'DFEDTARU', 'DFEDTARL', 'EFFR', 'IORB', 'SOFR', 'SOFR30DAYAVG',
  'WALCL', 'FEDTARMD', 'RRPONTSYD', 'WRESBAL', 'TREAST', 'WSHOMCB',
  'FEDFUNDS',
];

const fomcCharts = new Map();

function toChartPoints(points) {
  return points.map(p => ({ time: p.date, value: p.value }));
}

function filterAfter(points, isoDate) {
  return points ? points.filter(p => p.date >= isoDate) : [];
}

function nYearsAgo(n) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return d.toISOString().slice(0, 10);
}

function destroyChart(id) {
  if (fomcCharts.has(id)) {
    try { fomcCharts.get(id).remove(); } catch (_) {}
    fomcCharts.delete(id);
  }
}

function createBaseChart(containerId, height, overrides) {
  destroyChart(containerId);
  const el = document.getElementById(containerId);
  if (!el) return null;
  const chart = createFomcChart(el, height, overrides);
  fomcCharts.set(containerId, chart);
  return chart;
}

/** Fill the decision table. Newest first, matching the chart markers. */
function renderDecisionTable(decisions) {
  const tbody = document.getElementById('decision-tbody');
  if (!tbody) return;

  if (!decisions.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="muted" style="padding:12px 8px;text-align:center">No rate decisions in range</td></tr>';
    return;
  }

  tbody.innerHTML = decisions.map(d => {
    const color = d.type === 'Hike' ? colors.hike : colors.cut;
    const sign  = d.bps > 0 ? '+' : '';
    return `
      <tr style="border-bottom:1px solid #2a2a3e">
        <td style="padding:6px 8px;white-space:nowrap">${fedDate(d.date)}</td>
        <td style="padding:6px 8px;color:${color};font-weight:600">${d.type}</td>
        <td style="padding:6px 8px;text-align:right;color:${color};font-variant-numeric:tabular-nums">${sign}${d.bps}bps</td>
        <td style="padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums">${d.rangeAfter}</td>
      </tr>`;
  }).join('');
}

function renderRateHistoryChart(data, decisions) {
  const fedfunds  = data['FEDFUNDS'] || [];
  const effr      = data['EFFR']     || [];
  const effrStart = effr.length > 0 ? effr[0].date : '2099-01-01';
  const pre       = fedfunds.filter(p => p.date < effrStart).map(p => ({ time: p.date, value: p.value }));
  const combined  = [...pre, ...toChartPoints(effr)];
  if (combined.length < 2) return;

  const chart = createBaseChart('chart-rate-history', 300);
  if (!chart) return;

  const area = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.rate,
    topColor:    hexToRgba(colors.rate, 0.3),
    bottomColor: hexToRgba(colors.rate, 0.02),
    lineWidth: 2, priceLineVisible: true,
    priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
    autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 7 } }),
  });
  area.setData(combined);

  addChartLegend('chart-rate-history', [
    { label: 'EFFR', color: colors.rate, value: `${combined[combined.length - 1].value.toFixed(2)}%` },
  ]);

  const firstDate = combined[0].time;
  const markers = [...decisions].reverse()
    .filter(d => d.date >= firstDate)
    .map(d => ({
      time: d.date,
      position: d.type === 'Hike' ? 'aboveBar' : 'belowBar',
      color: d.type === 'Hike' ? colors.hike : colors.cut,
      shape: d.type === 'Hike' ? 'arrowUp' : 'arrowDown',
      text: `${d.bps > 0 ? '+' : ''}${d.bps}`, size: 0.8,
    }));
  markers.push({ time: '2026-06-17', position: 'aboveBar', color: '#f97316', shape: 'circle', text: 'Warsh', size: 0.8 });
  markers.sort((a, b) => (a.time < b.time ? -1 : 1));
  LC.createSeriesMarkers(area, markers);

  fitWithRightPadding(chart, combined.length, 0.05);
  addZoomControls(chart, 'chart-rate-history', [
    { label: '5Y', years: 5 }, { label: '10Y', years: 10 }, { label: 'Max', years: null },
  ]);
}

function renderRateCorridorChart(data) {
  const cutoff   = nYearsAgo(2);
  const dfedtaru = filterAfter(data['DFEDTARU'], cutoff);
  const dfedtarl = filterAfter(data['DFEDTARL'], cutoff);
  const effr     = filterAfter(data['EFFR'],     cutoff);
  if (dfedtaru.length < 2) return;

  const chart = createBaseChart('chart-rate-corridor', 240);
  if (!chart) return;

  const upper = chart.addSeries(LC.LineSeries, {
    color: colors.rate, lineWidth: 1, lineStyle: LC.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: true,
  });
  upper.setData(toChartPoints(dfedtaru));

  const lower = chart.addSeries(LC.LineSeries, {
    color: hexToRgba(colors.rate, 0.6), lineWidth: 1, lineStyle: LC.LineStyle.Dashed,
    priceLineVisible: false, lastValueVisible: true,
  });
  lower.setData(toChartPoints(dfedtarl));

  if (effr.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, {
      color: colors.effr, lineWidth: 2,
      priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
    });
    s.setData(toChartPoints(effr));
  }

  // SOFR and IORB sit inside the band with EFFR; the three together are what
  // makes this a corridor chart rather than a target-range chart.
  const sofr = filterAfter(data['SOFR'], cutoff);
  if (sofr.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, {
      color: colors.sofr, lineWidth: 1, priceLineVisible: false, lastValueVisible: true,
    });
    s.setData(toChartPoints(sofr));
  }

  const iorb = filterAfter(data['IORB'], cutoff);
  if (iorb.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, {
      color: colors.iorb, lineWidth: 1, lineStyle: LC.LineStyle.Dotted,
      priceLineVisible: false, lastValueVisible: true,
    });
    s.setData(toChartPoints(iorb));
  }

  addChartLegend('chart-rate-corridor', [
    { label: 'Target Upper', color: colors.rate,                  value: `${dfedtaru[dfedtaru.length-1].value.toFixed(2)}%` },
    { label: 'Target Lower', color: hexToRgba(colors.rate, 0.6), value: `${dfedtarl[dfedtarl.length-1].value.toFixed(2)}%` },
    ...(effr.length ? [{ label: 'EFFR', color: colors.effr,      value: `${effr[effr.length-1].value.toFixed(2)}%` }] : []),
    ...(sofr.length ? [{ label: 'SOFR', color: colors.sofr,      value: `${sofr[sofr.length-1].value.toFixed(2)}%` }] : []),
    ...(iorb.length ? [{ label: 'IORB', color: colors.iorb,      value: `${iorb[iorb.length-1].value.toFixed(2)}%` }] : []),
  ]);
  fitWithRightPadding(chart, dfedtaru.length);
  addZoomControls(chart, 'chart-rate-corridor', [
    { label: '1Y', years: 1 }, { label: '2Y', years: 2 },
  ], 1);
}

function renderSepChart(data) {
  const fedtarmd = data['FEDTARMD'];
  if (!fedtarmd || fedtarmd.length < 2) return;

  const chart = createBaseChart('chart-sep', 220);
  if (!chart) return;

  const line = chart.addSeries(LC.LineSeries, {
    color: hexToRgba(colors.rate, 0.4), lineWidth: 1,
    priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  line.setData(toChartPoints(fedtarmd));
  addChartLegend('chart-sep', [
    { label: 'SEP Median', color: colors.rate, value: `${fedtarmd[fedtarmd.length-1].value.toFixed(2)}%` },
  ]);
  LC.createSeriesMarkers(line, fedtarmd.map(p => ({
    time: p.date, position: 'inBar', color: colors.rate, shape: 'circle',
    size: 2, text: `${p.value.toFixed(2)}%`,
  })));
  fitWithRightPadding(chart, fedtarmd.length, 0.005);
  addZoomControls(chart, 'chart-sep', [
    { label: '5Y', years: 5 }, { label: 'Max', years: null },
  ]);
}

function renderReverseRepoChart(data) {
  const rrpo = data['RRPONTSYD'];
  if (!rrpo || rrpo.length < 2) return;

  const chart = createBaseChart('chart-rrpo', 220);
  if (!chart) return;

  const area = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.rrp,
    topColor:    hexToRgba(colors.rrp, 0.35),
    bottomColor: hexToRgba(colors.rrp, 0.02),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  area.setData(toChartPoints(rrpo));
  addChartLegend('chart-rrpo', [
    { label: 'O/N RRP', color: colors.rrp, value: `$${rrpo[rrpo.length-1].value.toFixed(0)}B` },
  ]);
  fitWithRightPadding(chart, rrpo.length, 0.04);
  addZoomControls(chart, 'chart-rrpo', [
    { label: '3Y', years: 3 }, { label: '5Y', years: 5 }, { label: 'Max', years: null },
  ]);
}

function renderBalanceSheetChart(data) {
  const walcl  = data['WALCL'];
  const treast = data['TREAST'];
  const wshomcb = data['WSHOMCB'];
  if (!walcl || walcl.length < 2) return;

  const toB = pts => pts.map(p => ({ time: p.date, value: +(p.value / 1000).toFixed(1) }));

  const chart = createBaseChart('chart-balance-sheet', 280);
  if (!chart) return;

  const totalArea = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.balSheet,
    topColor:    hexToRgba(colors.balSheet, 0.2),
    bottomColor: hexToRgba(colors.balSheet, 0),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  totalArea.setData(toB(walcl));

  if (treast?.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, {
      color: colors.sofr, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    });
    s.setData(toB(treast));
  }
  if (wshomcb?.length >= 2) {
    const s = chart.addSeries(LC.LineSeries, {
      color: colors.mbs, lineWidth: 2, priceLineVisible: false, lastValueVisible: true,
    });
    s.setData(toB(wshomcb));
  }

  const entries = [
    { label: 'Total Assets', color: colors.balSheet, value: `$${(walcl[walcl.length-1].value/1000).toFixed(0)}B` },
  ];
  if (treast?.length)   entries.push({ label: 'Treasuries', color: colors.sofr, value: `$${(treast[treast.length-1].value/1000).toFixed(0)}B` });
  if (wshomcb?.length)  entries.push({ label: 'MBS',        color: colors.mbs,  value: `$${(wshomcb[wshomcb.length-1].value/1000).toFixed(0)}B` });
  addChartLegend('chart-balance-sheet', entries);
  fitWithRightPadding(chart, walcl.length);
  addZoomControls(chart, 'chart-balance-sheet', [
    { label: '5Y', years: 5 }, { label: '10Y', years: 10 }, { label: 'Max', years: null },
  ]);
}

function renderReserveBalancesChart(data) {
  const wresbal = data['WRESBAL'];
  if (!wresbal || wresbal.length < 2) return;

  const chart = createBaseChart('chart-wresbal', 220);
  if (!chart) return;

  const area = chart.addSeries(LC.AreaSeries, {
    lineColor: colors.reserves,
    topColor:    hexToRgba(colors.reserves, 0.3),
    bottomColor: hexToRgba(colors.reserves, 0.02),
    lineWidth: 2, priceLineVisible: true, priceLineStyle: LC.LineStyle.Dashed, lastValueVisible: true,
  });
  area.setData(toChartPoints(wresbal));
  addChartLegend('chart-wresbal', [
    { label: 'Reserves', color: colors.reserves, value: `$${wresbal[wresbal.length-1].value.toFixed(0)}B` },
  ]);
  fitWithRightPadding(chart, wresbal.length, 0.03);
  addZoomControls(chart, 'chart-wresbal', [
    { label: '3Y', years: 3 }, { label: '5Y', years: 5 }, { label: 'Max', years: null },
  ]);
}

function esc(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth'];

function ordinal(n) {
  return ORDINALS[n] || `${n}th`;
}

/** Human decision sentence, generated from the meeting's numeric fields. */
function decisionSentence(m) {
  const range = esc(m.target_range);
  if (m.decision === 'hold') {
    const streak = m.consecutive_holds > 1
      ? ` — the ${ordinal(m.consecutive_holds)} consecutive hold`
      : '';
    return `Target range held at ${range}${streak}.`;
  }
  const verb = m.bps > 0 ? 'Raised' : 'Lowered';
  return `${verb} ${Math.abs(m.bps)}bps to ${range}.`;
}

function decisionBadge(m) {
  if (m.decision === 'hold') return { text: 'HOLD', color: '#a7a7ad' };
  return m.bps > 0
    ? { text: `+${m.bps}BPS`, color: colors.hike }
    : { text: `${m.bps}BPS`,  color: colors.cut  };
}

/**
 * Latest meeting card, rendered from config/fomc_meetings.json. Adding a meeting
 * to that file is the only edit needed here after an FOMC — no page copy changes.
 */
function renderLatestMeeting(cfg) {
  const host = document.getElementById('latest-meeting');
  if (!host) return;

  const m = cfg?.meetings?.[0];
  if (!m) { host.style.display = 'none'; return; }

  const badge = decisionBadge(m);
  const dissenters = m.dissenters || [];

  const dissentBody = dissenters.length
    ? dissenters.map(d => `
        <div style="margin-bottom:10px">
          <div><strong>${esc(d.name)}</strong> <span class="muted">(${esc(d.bank)})</span> — preferred a ${esc(d.preferred)}.</div>
          ${d.quote ? `<div class="muted" style="font-style:italic;border-left:2px solid #2a2a3e;padding-left:8px;margin-top:4px;font-size:12px">"${esc(d.quote)}"</div>` : ''}
        </div>`).join('')
    : '<div>Unanimous. No dissents.</div>';

  const next = cfg.next_meeting
    ? ` · Next meeting <strong style="color:#e9e9ea">${esc(cfg.next_meeting.label)}</strong>${cfg.next_meeting.sep_meeting ? ' (SEP)' : ''}`
    : '';

  host.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <h2 style="font-size:16px;margin:0;color:#f97316">Latest Meeting — ${esc(m.label)}</h2>
      <span style="background:${badge.color}22;color:${badge.color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.05em">${badge.text}</span>
    </div>
    <div class="two-col-grid" style="gap:12px;margin-top:0">
      <div style="padding:12px;background:#1a1a2e;border-radius:6px;border:1px solid #2a2a3e">
        <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Decision</div>
        <div style="font-size:13px;color:#e9e9ea;line-height:1.6">${decisionSentence(m)}</div>
        ${m.note ? `<div class="muted" style="font-size:12px;line-height:1.6;margin-top:8px">${esc(m.note)}</div>` : ''}
      </div>
      <div style="padding:12px;background:#1a1a2e;border-radius:6px;border:1px solid #2a2a3e">
        <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Vote — ${esc(m.vote)}</div>
        <div style="font-size:13px;color:#e9e9ea;line-height:1.6">${dissentBody}</div>
        ${m.dissent_note ? `<div class="muted" style="font-size:12px;line-height:1.6;margin-top:6px">${esc(m.dissent_note)}</div>` : ''}
      </div>
    </div>
    ${(m.points || []).length ? `<ul style="margin:12px 0 0 0;padding-left:18px;font-size:13px;color:#a7a7ad;line-height:1.7">
      ${m.points.map(p => `<li>${esc(p)}</li>`).join('')}
    </ul>` : ''}
    <div class="muted" style="font-size:13px;margin-top:12px">
      Statement and implementation note, redlined against the prior meeting:
      <a href="pages/fomc_statements.html" style="color:#7aa2f7;text-decoration:none">Statement Tracker →</a>${next}
    </div>`;

  renderSepCaption(cfg);
}

/** SEP caption names a specific meeting, so it comes from config too. */
function renderSepCaption(cfg) {
  const el = document.getElementById('sep-caption');
  if (!el) return;
  const latestSep = (cfg.meetings || []).find(m => m.sep_meeting);
  const base = cfg.captions?.sep || '';
  const parts = [base];
  if (latestSep) {
    parts.push(`${esc(latestSep.label)} is the latest${latestSep.sep_note ? ': ' + esc(latestSep.sep_note) : '.'}`);
  }
  if (cfg.next_meeting?.sep_meeting) {
    parts.push(`Next projection due at the ${esc(cfg.next_meeting.label)} FOMC.`);
  }
  el.innerHTML = parts.filter(Boolean).join(' ');
}

async function init() {
  renderNav();
  renderFedStrip();

  // Meeting narrative is independent of the FRED bundle; a failure in one should
  // not blank the other.
  fetchCache('config/fomc_meetings.json')
    .then(renderLatestMeeting)
    .catch(err => console.error('FOMC meetings config failed to load:', err));

  try {
    const bundle = await fetchFredBundle();
    const data   = {};
    for (const id of FOMC_SERIES) {
      if (bundle.series?.[id]) {
        data[id] = bundle.series[id].map(([date, value]) => ({ date, value }));
      }
    }

    const decisions = buildDecisionTimeline(data['DFEDTARU'] || [], data['DFEDTARL'] || []);
    renderDecisionTable(decisions);

    const dfedtaru = data['DFEDTARU'];
    const metaEl   = document.getElementById('meta');
    if (dfedtaru?.length) {
      const lastDate = dfedtaru[dfedtaru.length - 1].date;
      metaEl.textContent = `Last updated: ${lastDate} · ${decisions.length} rate decisions detected since 2008`;
    } else {
      metaEl.textContent = 'Data loaded';
    }

    for (const [fn, args] of [
      [renderRateHistoryChart,    [data, decisions]],
      [renderRateCorridorChart,   [data]],
      [renderSepChart,            [data]],
      [renderReverseRepoChart,    [data]],
      [renderBalanceSheetChart,   [data]],
      [renderReserveBalancesChart,[data]],
    ]) {
      try { fn(...args); } catch (e) { console.error(`${fn.name}:`, e); }
    }
  } catch (err) {
    showLoadError(err, 'FOMC dashboard');
  }
}

document.addEventListener('DOMContentLoaded', init);
