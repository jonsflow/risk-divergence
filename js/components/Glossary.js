// js/components/Glossary.js — Acronym glossary for the Federal Reserve pages.
//
// Collapsed by default: the terms are a reference for the occasional reader, not
// something a regular needs in the way every visit. Renders into #glossary, which
// sits above the attribution footer, and no-ops elsewhere.

import { fetchCache } from '../core/api.js';

function esc(s) {
  return String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Elements whose text must not be rewritten: controls, links, the glossary
// itself, and anything a chart library owns.
const SKIP = 'script,style,a,button,select,option,summary,textarea,input,'
           + '#glossary,.gloss,.tv-lightweight-charts,[id^="chart-"]';

let decorating = false;

/** Longest first, so "Core PCE" wins over a bare "PCE" if both were listed. */
function buildMatcher(terms) {
  const pairs = [];
  for (const t of terms) {
    for (const m of t.match || []) pairs.push([m, t]);
  }
  if (!pairs.length) return null;
  pairs.sort((a, b) => b[0].length - a[0].length);
  const escaped = pairs.map(([m]) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lookup = new Map(pairs.map(([m, t]) => [m.toLowerCase(), t]));
  // \b fails against a leading "/" in "O/N RRP", so bound on non-word chars.
  return {
    re: new RegExp(`(?<![\\w/])(${escaped.join('|')})(?![\\w/])`, 'g'),
    lookup,
  };
}

/**
 * Annotate glossary terms in page copy with a hover definition.
 *
 * Not links — the point is to explain a term in place, not to navigate away from
 * the thing being read. The glossary below carries the sources.
 */
export function decorateGlossary(terms, root = document.body) {
  const matcher = buildMatcher(terms);
  if (!matcher || decorating) return;
  decorating = true;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest(SKIP)) return NodeFilter.FILTER_REJECT;
      // .test() on a /g/ regex advances lastIndex, so consecutive calls
      // alternate; reset before each probe.
      matcher.re.lastIndex = 0;
      return matcher.re.test(node.nodeValue)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const targets = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n);

  for (const node of targets) {
    matcher.re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of node.nodeValue.matchAll(matcher.re)) {
      const t = matcher.lookup.get(m[0].toLowerCase());
      if (!t) continue;
      frag.append(node.nodeValue.slice(last, m.index));
      const el = document.createElement('abbr');
      el.className = 'gloss';
      el.textContent = m[0];
      el.dataset.def = t.note ? `${t.full} — ${t.note}` : t.full;
      frag.append(el);
      last = m.index + m[0].length;
    }
    frag.append(node.nodeValue.slice(last));
    node.parentNode.replaceChild(frag, node);
  }

  decorating = false;
}

export async function renderGlossary() {
  const host = document.getElementById('glossary');
  if (!host) return;

  let terms;
  try {
    ({ terms } = await fetchCache('config/glossary.json'));
  } catch (err) {
    host.remove();            // a missing glossary is not worth an error state
    console.error('Glossary failed to load:', err);
    return;
  }
  if (!terms?.length) { host.remove(); return; }

  decorateGlossary(terms);
  // Pages that re-render on interaction (the statement tracker rebuilds its
  // document on every control change) drop the annotations; re-apply to whatever
  // was added, guarded against our own insertions.
  new MutationObserver(muts => {
    if (decorating) return;
    const roots = muts.flatMap(m => [...m.addedNodes])
      .filter(n => n.nodeType === 1 && !n.closest?.(SKIP));
    if (roots.length) requestAnimationFrame(() => roots.forEach(r => {
      if (r.isConnected) decorateGlossary(terms, r);
    }));
  }).observe(document.body, { childList: true, subtree: true });

  host.innerHTML = `
    <details class="glossary">
      <summary class="glossary-summary">Glossary — ${terms.length} terms</summary>
      <dl class="glossary-list">
        ${terms.map(t => `
          <dt class="glossary-term">${
            t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.term)}</a>`
                  : esc(t.term)
          }</dt>
          <dd class="glossary-def">
            <span class="glossary-full">${esc(t.full)}</span>${
              t.note ? ` — ${esc(t.note)}` : ''
            }
          </dd>`).join('')}
      </dl>
    </details>`;
}
