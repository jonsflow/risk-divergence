// js/core/fed-data.js — Shared derivations over the FRED bundle for Fed pages.
// Single source of truth: pages/fomc.html renders the full decision table and
// chart markers from this, the shared rate strip renders only the newest entry.

/** Reshape a fred_cache series into {date, value} points. */
export function seriesPoints(bundle, id) {
  const raw = bundle?.series?.[id];
  return raw ? raw.map(([date, value]) => ({ date, value })) : [];
}

/**
 * Every change in the upper target bound, newest first.
 *
 * The resulting band comes from DFEDTARL looked up by date rather than by
 * index — the two series share dates but not always length, so positional
 * pairing would silently misalign the band with the decision.
 *
 * @returns {Array<{date, bps, type:'Hike'|'Cut', rangeAfter}>}
 */
export function buildDecisionTimeline(dfedtaru, dfedtarl) {
  if (!dfedtaru || dfedtaru.length < 2) return [];
  const lowerByDate = new Map((dfedtarl || []).map(p => [p.date, p.value]));
  const decisions = [];
  for (let i = 1; i < dfedtaru.length; i++) {
    const delta = Math.round((dfedtaru[i].value - dfedtaru[i - 1].value) * 100);
    if (delta !== 0) {
      const hi = dfedtaru[i].value;
      const lo = lowerByDate.get(dfedtaru[i].date);
      decisions.push({
        date: dfedtaru[i].date,
        bps: delta,
        type: delta > 0 ? 'Hike' : 'Cut',
        rangeAfter: lo == null ? `${hi.toFixed(2)}%` : `${lo.toFixed(2)}–${hi.toFixed(2)}%`,
      });
    }
  }
  return decisions.reverse();
}

/**
 * The SEP median for a given horizon.
 *
 * FEDTARMD is dated by the year the projection is *for*, not the day it was
 * made — 2026-01-01 is the year-end 2026 median. Taking the last point
 * therefore returns the furthest-out horizon, which is not "the latest".
 *
 * @param {Array<{date,value}>} points
 * @param {number} [year] - defaults to the current calendar year
 * @returns {{value:number, year:number}|null}
 */
export function sepMedian(points, year = new Date().getFullYear()) {
  if (!points?.length) return null;
  const byYear = points.map(p => ({ ...p, year: Number(p.date.slice(0, 4)) }));
  const exact = byYear.find(p => p.year === year);
  // Before the first projection year is published, fall back to the nearest
  // horizon at or after `year`; if every horizon is past, use the last one.
  const hit = exact
    || byYear.find(p => p.year >= year)
    || byYear[byYear.length - 1];
  return { value: hit.value, year: hit.year };
}

/** Short date for chart markers and table rows. */
export function fedDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00')
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
