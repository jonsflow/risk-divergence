/**
 * js/review.js — Local review comment system
 *
 * Visible only when served from localhost / 127.0.0.1 / 0.0.0.0.
 * Adds a 💬 button to every .card element. Comments are stored in localStorage
 * and can be exported as JSON for batch hand-off to the dev.
 */

const LOCALHOSTS = ['localhost', '127.0.0.1', '0.0.0.0'];
const STORAGE_KEY = 'riskModelComments_v1';

function isLocalDev() {
  return LOCALHOSTS.includes(window.location.hostname);
}

function pageKey() {
  // Use pathname so it works regardless of port / host
  return window.location.pathname;
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
// Unique ID generator for cards without an id
let _idCounter = 0;
function ensureCardId(card) {
  if (!card.id) {
    card.id = `review-card-${_idCounter++}`;
  }
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
    .review-export-clear { background: #374151; color: #a7a7ad; }
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
    <button class="review-export-copy">📋 Export comments</button>
    <button class="review-export-clear">🗑 Clear resolved</button>
  `;

  panel.querySelector('.review-export-copy').addEventListener('click', () => {
    const store = loadStore();
    const payload = { exportedAt: new Date().toISOString(), comments: store };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      const btn = panel.querySelector('.review-export-copy');
      const old = btn.textContent;
      btn.textContent = '✅ Copied!';
      setTimeout(() => btn.textContent = old, 1500);
    });
  });

  panel.querySelector('.review-export-clear').addEventListener('click', () => {
    const store = loadStore();
    Object.keys(store).forEach(page => {
      Object.keys(store[page]).forEach(cardId => {
        store[page][cardId] = store[page][cardId].filter(c => !c.resolved);
        if (store[page][cardId].length === 0) delete store[page][cardId];
      });
      if (Object.keys(store[page]).length === 0) delete store[page];
    });
    saveStore(store);
    document.querySelectorAll('.card').forEach(card => {
      const existing = card.querySelector('.review-comments');
      if (existing) existing.remove();
      const cardId = ensureCardId(card);
      updateCardHighlight(card, cardId, store);
    });
    updateExportBadge();
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
function init() {
  if (!isLocalDev()) return;
  const store = loadStore();
  injectStyles();
  attachToAllCards(store);
  buildExportPanel();
  observeDynamicCards(store);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
