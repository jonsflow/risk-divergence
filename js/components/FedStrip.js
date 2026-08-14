// js/components/FedStrip.js — Shared policy-rate strip for the Federal Reserve pages.
// These four readings are identical across FOMC / Statements / Fed Chair, so they
// render once above the tab bar rather than as per-page cards.

import { fetchFredBundle } from '../core/api.js';
import { seriesPoints, buildDecisionTimeline, fedDate, sepMedian } from '../core/fed-data.js';
import { colors } from '../core/chart-utils.js';

function item(label, value, sub, color) {
  return `
    <div class="fed-strip-item">
      <span class="fed-strip-label">${label}</span>
      <span class="fed-strip-value"${color ? ` style="color:${color}"` : ''}>${value}</span>
      <span class="fed-strip-sub">${sub}</span>
    </div>`;
}

/**
 * Insert the strip above the tab bar. Safe to call on any page — it no-ops if
 * Navigation.js did not render a tab bar, and it renders placeholders
 * immediately so the layout does not jump when the bundle resolves.
 */
export async function renderFedStrip() {
  const tabBar = document.querySelector('.tab-bar');
  if (!tabBar) return;

  const strip = document.createElement('div');
  strip.className = 'fed-strip';
  strip.innerHTML = item('Target Rate', '—', 'Fed funds band')
                  + item('Last Move', '—', '—')
                  + item('SEP Median', '—', 'Dot-plot median')
                  + item('Balance Sheet', '—', 'Total assets');
  tabBar.insertAdjacentElement('beforebegin', strip);

  let bundle;
  try {
    bundle = await fetchFredBundle();
  } catch (err) {
    strip.remove();                       // no data is better than four em dashes
    console.error('Fed rate strip failed to load:', err);
    return;
  }

  const upper    = seriesPoints(bundle, 'DFEDTARU');
  const lower    = seriesPoints(bundle, 'DFEDTARL');
  const fedtarmd = seriesPoints(bundle, 'FEDTARMD');
  const walcl    = seriesPoints(bundle, 'WALCL');
  const last     = arr => (arr.length ? arr[arr.length - 1] : null);

  const hi = last(upper), lo = last(lower);
  const range = hi && lo ? `${lo.value.toFixed(2)}–${hi.value.toFixed(2)}%`
              : hi       ? `${hi.value.toFixed(2)}%` : '—';

  const move = buildDecisionTimeline(upper, lower)[0];
  const sep  = sepMedian(fedtarmd);
  const bs   = last(walcl);

  strip.innerHTML =
      item('Target Rate', range, 'Fed funds band')
    + item('Last Move',
           move ? `${move.bps > 0 ? '+' : ''}${move.bps}bps` : '—',
           move ? fedDate(move.date) : '—',
           move ? (move.type === 'Hike' ? colors.hike : colors.cut) : null)
    + item('SEP Median',
           sep ? `${sep.value.toFixed(2)}%` : '—',
           sep ? `Year-end ${sep.year}` : 'Dot-plot median')
    + item('Balance Sheet',
           bs ? `$${(bs.value / 1_000_000).toFixed(2)}T` : '—',
           'Total assets');
}
