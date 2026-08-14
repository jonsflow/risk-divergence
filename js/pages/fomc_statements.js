// js/pages/fomc_statements.js — FOMC Statement Tracker (ES module).
// Word-level redline between any two FOMC statements. Text corpus lives in
// config/fomc_meetings.json; the diff is computed here at render time so
// adding a meeting is a one-file edit.

import { renderNav } from '../components/Navigation.js';
import { fetchCache } from '../core/api.js';
import { showLoadError }   from '../core/utils.js';
import { renderFedStrip } from '../components/FedStrip.js';

// Word-diff is only attempted on paragraphs at least this similar; below the
// threshold a del/ins pair reads better as a wholesale replacement.
const PAIR_SIMILARITY = 0.4;

const state = {
  data: null,
  baseDate: null,
  compareDate: null,
  doc: 'statement',   // 'statement' | 'implementation'
  view: 'redline',    // 'redline' | 'new' | 'base'
};

/* ------------------------------------------------------------------ diff -- */

/**
 * Longest-common-subsequence opcodes over two arrays.
 * @returns {Array<{type:'equal'|'del'|'ins', a?:*, b?:*}>}
 */
function lcsOps(a, b, eq = (x, y) => x === y) {
  const n = a.length, m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:]
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j]))            { ops.push({ type: 'equal', a: a[i], b: b[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', a: a[i] }); i++; }
    else                            { ops.push({ type: 'ins', b: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: 'del', a: a[i++] });
  while (j < m) ops.push({ type: 'ins', b: b[j++] });
  return ops;
}

/** Split into words, keeping each word's trailing whitespace attached. */
function tokenize(text) {
  return text.match(/\S+\s*/g) || [];
}

function similarity(x, y) {
  const ax = tokenize(x), by = tokenize(y);
  if (!ax.length && !by.length) return 1;
  const common = lcsOps(ax, by, (p, q) => p.trim() === q.trim())
    .filter(o => o.type === 'equal').length;
  return (2 * common) / (ax.length + by.length);
}

/** Word-level redline of one paragraph pair → HTML. */
function wordRedline(oldText, newText) {
  const ops = lcsOps(tokenize(oldText), tokenize(newText), (p, q) => p.trim() === q.trim());
  let html = '';
  let run = null; // batch adjacent del/ins so each gets one wrapper

  const flush = () => {
    if (!run) return;
    const tag = run.type === 'del' ? 'del' : 'ins';
    html += `<${tag}>${esc(run.text.trimEnd())}</${tag}>${/\s$/.test(run.text) ? ' ' : ''}`;
    run = null;
  };

  for (const op of ops) {
    if (op.type === 'equal') { flush(); html += esc(op.b); continue; }
    const text = op.type === 'del' ? op.a : op.b;
    if (run && run.type === op.type) run.text += text;
    else { flush(); run = { type: op.type, text }; }
  }
  flush();
  return html;
}

/**
 * Diff two paragraph arrays.
 * @returns {{blocks: Array, changes: number}}
 */
function diffParagraphs(oldParas, newParas) {
  const ops = lcsOps(oldParas, newParas);
  const blocks = [];
  let changes = 0;

  // The LCS walk emits a run of deletions and a run of insertions between two
  // equal paragraphs, not interleaved — so pairing has to happen per run, not
  // by adjacency. Within a run, the nth deletion is the nth insertion's former
  // self if they are recognizably the same paragraph; that pair becomes one
  // word-level redline. Anything left over is a genuine add or remove.
  let dels = [], inss = [];

  const flushRun = () => {
    const paired = Math.min(dels.length, inss.length);
    let i = 0;
    for (; i < paired; i++) {
      if (similarity(dels[i], inss[i]) < PAIR_SIMILARITY) break;
      blocks.push({ changed: true, text: inss[i], html: wordRedline(dels[i], inss[i]) });
      changes++;
    }
    // Wholly added/removed paragraphs. Flagged so the single-version views can
    // drop them rather than render an empty line.
    for (let d = i; d < dels.length; d++) {
      blocks.push({ changed: true, only: 'del', text: dels[d], html: `<del>${esc(dels[d])}</del>` });
      changes++;
    }
    for (let n = i; n < inss.length; n++) {
      blocks.push({ changed: true, only: 'ins', text: inss[n], html: `<ins>${esc(inss[n])}</ins>` });
      changes++;
    }
    dels = []; inss = [];
  };

  for (const op of ops) {
    if (op.type === 'del') { dels.push(op.a); continue; }
    if (op.type === 'ins') { inss.push(op.b); continue; }
    flushRun();
    blocks.push({ changed: false, text: op.a, html: esc(op.a) });
  }
  flushRun();

  return { blocks, changes };
}

function esc(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function wordCount(paras) {
  return paras.join(' ').trim().split(/\s+/).filter(Boolean).length;
}

/* ---------------------------------------------------------------- render -- */

function meetingByDate(date) {
  return state.data.meetings.find(m => m.date === date);
}

/** Populate the meeting selects once; render() only syncs their value. */
function buildSelects() {
  const opts = state.data.meetings
    .map(m => `<option value="${m.date}">${esc(m.label)}</option>`).join('');
  document.getElementById('sel-base').innerHTML = opts;
  document.getElementById('sel-compare').innerHTML = opts;
}

function renderControls() {
  document.getElementById('sel-base').value = state.baseDate;
  document.getElementById('sel-compare').value = state.compareDate;

  document.querySelectorAll('[data-doc]').forEach(b =>
    b.classList.toggle('active', b.dataset.doc === state.doc));
  document.querySelectorAll('[data-view]').forEach(b =>
    b.classList.toggle('active', b.dataset.view === state.view));

  document.getElementById('diff-key').style.visibility =
    state.view === 'redline' ? 'visible' : 'hidden';
}

function renderCards(base, compare, changes) {
  const wcBase = wordCount(base[state.doc]);
  const wcComp = wordCount(compare[state.doc]);

  const was = (oldV, newV) => oldV === newV
    ? esc(newV)
    : `<span class="stmt-was">${esc(oldV)}</span>${esc(newV)}`;

  // Target range is deliberately absent — the shared Fed strip above the tab bar
  // carries the current band. Everything here is specific to the two documents
  // being compared.
  const cards = [
    ['Vote',          was(base.vote, compare.vote),                 `${esc(compare.chair)} chair`],
    ['Dissents',      was(String(base.dissent_count), String(compare.dissent_count)),
                      compare.dissent_direction ? `for a ${esc(compare.dissent_direction)}` : 'unanimous'],
    ['Word Count',    was(String(wcBase), String(wcComp)),          state.doc === 'statement' ? 'Statement text' : 'Implementation note'],
    ['Changes',       String(changes),                              changes === 1 ? 'edit in this document' : 'edits in this document'],
  ];

  document.getElementById('stmt-cards').innerHTML = cards.map(([label, value, sub]) => `
    <div class="card">
      <div class="muted stmt-card-label">${label}</div>
      <div class="stmt-card-value">${value}</div>
      <div class="muted stmt-card-sub">${sub}</div>
    </div>`).join('');
}

/**
 * The implementation note's Desk directive is a nested list in the original —
 * the paragraphs between "…directs the Desk to:" and "In a related action…".
 * Identified by content rather than index so inserted or removed paragraphs
 * can't shift the indent onto the wrong lines.
 */
function directiveText(meetings) {
  const set = new Set();
  for (const m of meetings) {
    const paras = m.implementation || [];
    const start = paras.findIndex(p => /directs the Desk to:\s*$/.test(p));
    if (start === -1) continue;
    const end = paras.findIndex((p, i) => i > start && /^In a related action/.test(p));
    paras.slice(start + 1, end === -1 ? paras.length : end).forEach(p => set.add(p));
  }
  return set;
}

function renderDoc(base, compare) {
  const { blocks, changes } = diffParagraphs(base[state.doc], compare[state.doc]);

  const directives = state.doc === 'implementation'
    ? directiveText([base, compare])
    : new Set();

  document.getElementById('stmt-body').innerHTML = blocks.map(b => `
    <p class="stmt-para${b.changed ? ' changed' : ''}${directives.has(b.text) ? ' directive' : ''}${b.only ? ' ' + b.only + '-only' : ''}">${b.html}</p>
  `).join('');

  document.getElementById('stmt-release').innerHTML = `
    <span>${state.doc === 'statement' ? 'For release at 2:00 p.m. EDT' : 'Decisions Regarding Monetary Policy Implementation'}</span>
    <span><span class="stmt-was">${esc(base.label)}</span>${esc(compare.label)}</span>`;

  return changes;
}

function renderNotes(base, compare) {
  const notes = (state.data.redlines || {})[`${base.date}|${compare.date}`];
  const el = document.getElementById('stmt-notes');
  if (!notes || !notes.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.innerHTML = `
    <h2 class="stmt-notes-title">What the redline says</h2>
    ${notes.map(n => `<p class="stmt-note">${n}</p>`).join('')}`;
}

function renderSources(base, compare) {
  const row = (m) => `
    <div class="stmt-src-row">
      <span class="stmt-src-date">${esc(m.label)}</span>
      <a href="${m.sources.statement}" target="_blank" rel="noopener">Statement</a> ·
      <a href="${m.sources.implementation}" target="_blank" rel="noopener">Implementation note</a> ·
      <a href="${m.sources.pdf}" target="_blank" rel="noopener">PDF</a>
    </div>`;
  document.getElementById('stmt-sources').innerHTML = row(compare) + row(base);
}

function render() {
  const base = meetingByDate(state.baseDate);
  const compare = meetingByDate(state.compareDate);
  if (!base || !compare) return;

  const doc = document.getElementById('stmt-doc');
  doc.className = `stmt-doc view-${state.view}`;

  const changes = renderDoc(base, compare);
  renderCards(base, compare, changes);
  renderNotes(base, compare);
  renderSources(base, compare);
  renderControls();

  document.getElementById('meta').textContent = base.date === compare.date
    ? `${compare.label} — no comparison selected`
    : `${base.label} → ${compare.label} · ${changes} ${changes === 1 ? 'change' : 'changes'} in the ${state.doc === 'statement' ? 'statement' : 'implementation note'}`;
}

/* ------------------------------------------------------------------ init -- */

function wire() {
  document.getElementById('sel-base').addEventListener('change', (e) => {
    state.baseDate = e.target.value; render();
  });
  document.getElementById('sel-compare').addEventListener('change', (e) => {
    state.compareDate = e.target.value; render();
  });
  document.querySelectorAll('[data-doc]').forEach(b =>
    b.addEventListener('click', () => { state.doc = b.dataset.doc; render(); }));
  document.querySelectorAll('[data-view]').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; render(); }));
}

async function init() {
  renderNav();
  renderFedStrip();
  try {
    state.data = await fetchCache('config/fomc_meetings.json');
  } catch (err) {
    showLoadError(err, 'Statement tracker');
    return;
  }
  const ms = state.data.meetings;
  if (ms.length < 2) {
    document.getElementById('meta').textContent = 'Need at least two statements to diff.';
    return;
  }
  state.compareDate = ms[0].date;   // newest
  state.baseDate    = ms[1].date;   // prior
  buildSelects();
  wire();
  render();
}

document.addEventListener('DOMContentLoaded', init);
