/**
 * js/review.js — Local review comment system
 *
 * Visible only when served from localhost / 127.0.0.1 / 0.0.0.0.
 * Adds a 💬 button to every .card element. Comments are stored in localStorage
 * and can be exported as JSON for batch hand-off to the dev.
 */

const LOCALHOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
const STORAGE_KEY = 'riskModelComments_v1';
const ARCHIVE_KEY = 'riskModelComments_archive_v1';

function isLocalDev() {
  return LOCALHOSTS.includes(window.location.hostname);
}

function pageKey() {
  // Use pathname so it works regardless of port / host
  return window.location.pathname;
}

// When served by scripts/dev_server.py the comments live in a file the dev can
// read directly, so nothing has to be exported by hand. Falls back to
// localStorage alone under `python3 -m http.server`, which has no POST.
const SYNC_URL = '/__review';
let syncAvailable = false;

async function pullFromServer() {
  try {
    const res = await fetch(SYNC_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    syncAvailable = true;
    return await res.json();
  } catch {
    return null;
  }
}

function pushToServer(store) {
  if (!syncAvailable) return;
  // Fire-and-forget: the local copy is already saved, and a failed sync must not
  // block the reviewer mid-comment.
  fetch(SYNC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(store),
  }).catch(() => {});
}

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  pushToServer(store);
}

function getComments(store, cardId) {
  return (store[pageKey()]?.[cardId]) || [];
}

function setComment(store, cardId, comments) {
  const pk = pageKey();
  if (!store[pk]) store[pk] = {};
  store[pk][cardId] = comments;
  saveStore(store);
}

/* ------------------------------------------------------------------ */
// Deterministic card id: nearest ancestor with an id, plus this card's index
// among the .card elements inside it.
//
// This used to be a global counter, which meant a card's id depended on how many
// cards had been seen before it. Any page that re-renders a container (the
// statement tracker rebuilds its stats on every change) minted fresh ids each
// pass, so comments anchored to the old ids were orphaned — present in storage
// with no card left to display them.
function ensureCardId(card) {
  if (card.id) return card.id;
  const host  = card.parentElement?.closest('[id]') || document.body;
  const scope = host.id || 'page';
  const idx   = [...host.querySelectorAll('.card')].indexOf(card);
  card.id = `review-${scope}-${idx}`;
  return card.id;
}

/* ------------------------------------------------------------------ */
// Styles injected once
function injectStyles() {
  if (document.getElementById('review-styles')) return;
  const style = document.createElement('style');
  style.id = 'review-styles';
  style.textContent = `
    .review-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: rgba(30, 35, 48, 0.9);
      border: 1px solid #374151;
      color: #e2e8f0;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 12px;
      cursor: pointer;
      z-index: 10;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: border-color 0.15s;
    }
    .review-btn:hover { border-color: #7aa2f7; }
    .review-btn.has-unresolved { border-color: #eab308; color: #eab308; }
    .review-btn .review-badge {
      background: #eab308;
      color: #111;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      font-size: 10px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .review-form {
      margin-top: 10px;
      padding: 10px;
      background: #1a1f2e;
      border: 1px solid #2f5a8c;
      border-radius: 6px;
    }
    .review-form textarea {
      width: 100%;
      min-height: 60px;
      background: #0f1117;
      border: 1px solid #374151;
      color: #e2e8f0;
      border-radius: 4px;
      padding: 6px;
      font-size: 13px;
      resize: vertical;
      box-sizing: border-box;
    }
    .review-form .review-actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      justify-content: flex-end;
    }
    .review-form button {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .review-save   { background: #2f5a8c; color: #e2e8f0; }
    .review-cancel { background: #374151; color: #a7a7ad; }

    .review-list {
      margin-top: 10px;
    }
    .review-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 8px;
      background: #151924;
      border-radius: 4px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .review-item.resolved { opacity: 0.5; text-decoration: line-through; }
    .review-item input[type="checkbox"] {
      margin-top: 2px;
      cursor: pointer;
    }
    .review-item .review-text {
      flex: 1;
      color: #d1d5db;
      word-break: break-word;
    }
    .review-item .review-delete {
      color: #ef4444;
      cursor: pointer;
      font-size: 10px;
      padding: 2px;
    }

    .card.review-highlight { border-left: 3px solid #eab308; }

    /* Export panel */
    .review-export-panel {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
      background: #1e2330;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 13px;
      color: #e2e8f0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 180px;
    }
    .review-export-panel .review-export-header {
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .review-export-panel button {
      border: none;
      border-radius: 4px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
    }
    .review-export-copy { background: #2f5a8c; color: #e2e8f0; }
    .review-export-count { color: #eab308; font-weight: bold; }
  `;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------ */
function renderCommentsList(card, cardId, store) {
  const existing = card.querySelector('.review-comments');
  if (existing) existing.remove();

  const comments = getComments(store, cardId);
  if (comments.length === 0) return;

  const list = document.createElement('div');
  list.className = 'review-list review-comments';

  comments.forEach((c, idx) => {
    const item = document.createElement('div');
    item.className = `review-item ${c.resolved ? 'resolved' : ''}`;
    item.innerHTML = `
      <input type="checkbox" title="Resolved" ${c.resolved ? 'checked' : ''}>
      <span class="review-text">${escapeHtml(c.text)}</span>
      <span class="review-delete" title="Delete">×</span>
    `;
    item.querySelector('input').addEventListener('change', (e) => {
      c.resolved = e.target.checked;
      item.classList.toggle('resolved', c.resolved);
      saveStore(store);
      updateCardHighlight(card, cardId, store);
      updateExportBadge();
    });
    item.querySelector('.review-delete').addEventListener('click', () => {
      comments.splice(idx, 1);
      setComment(store, cardId, comments);
      renderCommentsList(card, cardId, store);
      updateCardHighlight(card, cardId, store);
      updateExportBadge();
    });
    list.appendChild(item);
  });

  card.appendChild(list);
}

function updateCardHighlight(card, cardId, store) {
  const unresolved = getComments(store, cardId).filter(c => !c.resolved).length;
  card.classList.toggle('review-highlight', unresolved > 0);

  const btn = card.querySelector('.review-btn');
  if (btn) {
    btn.classList.toggle('has-unresolved', unresolved > 0);
    const badge = btn.querySelector('.review-badge');
    if (badge) badge.textContent = unresolved;
    badge.style.display = unresolved > 0 ? 'flex' : 'none';
  }
}

function attachCommentButton(card, store) {
  if (card.querySelector('.review-btn')) return; // already attached

  const cardId = ensureCardId(card);
  card.style.position = 'relative';

  const btn = document.createElement('button');
  btn.className = 'review-btn';
  btn.innerHTML = `💬 <span class="review-badge" style="display:none">0</span>`;
  btn.title = 'Add review comment';

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const existing = card.querySelector('.review-form');
    if (existing) {
      existing.remove();
      return;
    }
    renderCommentsList(card, cardId, store);
    showForm(card, cardId, store);
  });

  card.appendChild(btn);
  updateCardHighlight(card, cardId, store);
}

function showForm(card, cardId, store) {
  const form = document.createElement('div');
  form.className = 'review-form review-comments';
  form.innerHTML = `
    <textarea placeholder="What's wrong or what should change?"></textarea>
    <div class="review-actions">
      <button class="review-cancel">Cancel</button>
      <button class="review-save">Save comment</button>
    </div>
  `;

  const textarea = form.querySelector('textarea');
  form.querySelector('.review-cancel').addEventListener('click', () => form.remove());
  form.querySelector('.review-save').addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) return;
    const comments = getComments(store, cardId);
    comments.push({ text, ts: new Date().toISOString(), resolved: false });
    setComment(store, cardId, comments);
    form.remove();
    renderCommentsList(card, cardId, store);
    updateCardHighlight(card, cardId, store);
    updateExportBadge();
  });

  card.appendChild(form);
  textarea.focus();
}

function flash(btn, msg, ms = 1800) {
  const old = btn.dataset.label || btn.textContent;
  btn.dataset.label = old;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = btn.dataset.label; }, ms);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
function attachToAllCards(store) {
  document.querySelectorAll('.card').forEach(card => attachCommentButton(card, store));
}

/* ------------------------------------------------------------------ */
function buildExportPanel() {
  if (document.getElementById('review-export-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'review-export-panel';
  panel.className = 'review-export-panel';
  panel.innerHTML = `
    <div class="review-export-header">
      <span>📝 Review</span>
      <span id="review-export-count" class="review-export-count">0</span>
    </div>
    <button class="review-export-copy">📋 Export &amp; clear</button>
  `;

  const refresh = (store) => {
    document.querySelectorAll('.card').forEach(card => {
      const existing = card.querySelector('.review-comments');
      if (existing) existing.remove();
      updateCardHighlight(card, ensureCardId(card), store);
    });
    updateExportBadge();
  };

  // Exporting is the hand-off: once the JSON is on the clipboard the comments have
  // served their purpose, so they clear in the same action rather than leaving the
  // reviewer to tick boxes afterwards. The payload is archived first, so an export
  // that never reaches anyone is still recoverable from localStorage.
  panel.querySelector('.review-export-copy').addEventListener('click', async () => {
    const store = loadStore();
    const total = Object.values(store)
      .reduce((sum, page) => sum + Object.values(page).reduce((n, l) => n + l.length, 0), 0);
    const btn = panel.querySelector('.review-export-copy');

    if (!total) { flash(btn, 'Nothing to export'); return; }

    const payload = { exportedAt: new Date().toISOString(), comments: store };
    const text = JSON.stringify(payload, null, 2);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard can be blocked; keep the comments rather than lose them silently.
      flash(btn, '⚠ Copy failed — not cleared');
      return;
    }

    try {
      const archive = JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]');
      archive.push(payload);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(-20)));
    } catch { /* archive is a convenience, not a requirement */ }

    saveStore({});
    refresh({});
    flash(btn, `✅ Copied ${total} — cleared`);
  });

  document.body.appendChild(panel);
  updateExportBadge();
}

function updateExportBadge() {
  const store = loadStore();
  let total = 0;
  Object.values(store).forEach(page => {
    Object.values(page).forEach(list => {
      total += list.filter(c => !c.resolved).length;
    });
  });
  const el = document.getElementById('review-export-count');
  if (el) el.textContent = total;
}

/* ------------------------------------------------------------------ */
// MutationObserver catches dynamically rendered cards (pairs, trade cards, etc.)
function observeDynamicCards(store) {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.classList?.contains('card') || node.querySelector?.('.card')) {
            shouldScan = true;
          }
        }
      }
    }
    if (shouldScan) attachToAllCards(store);
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ------------------------------------------------------------------ */
async function init() {
  if (!isLocalDev()) return;

  // The sync endpoint is the switch. Comments are only useful if the dev can read
  // them, which means scripts/dev_server.py is serving; under `python3 -m
  // http.server` the endpoint 404s and the tool would just add buttons nobody can
  // act on. GitHub Pages never reaches here — isLocalDev already refuses — but
  // this makes the gate about capability rather than hostname.
  const remote = await pullFromServer();
  if (remote === null) return;

  injectStyles();

  // The file is the source of truth: emptying it clears the browser on next load,
  // so addressed comments disappear without the reviewer doing anything.
  const store = remote;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));

  attachToAllCards(store);
  buildExportPanel();
  observeDynamicCards(store);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
