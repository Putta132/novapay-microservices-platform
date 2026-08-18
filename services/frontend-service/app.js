/* ================================================================
   FILE: app.js
   PURPOSE: NovaPay Frontend — All API logic and UI interactivity
   NOTE: The API_BASE below points to gateway-service.
         Local:  http://localhost:3002
         AWS:    https://api.novapay.yourdomain.com (set via NGINX env)
   ================================================================ */

// ─── CONFIG ──────────────────────────────────────────────────────
// window.API_BASE is injected by NGINX from environment variable.
// Falls back to localhost for local development.
const API_BASE = '/api';

// ─── STATE ───────────────────────────────────────────────────────
let authToken = localStorage.getItem('novapay_token') || null;
let currentUser = JSON.parse(localStorage.getItem('novapay_user') || 'null');
let allTransactions = [];

// ─── UTILITY FUNCTIONS ────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  if (!name) return 'U';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showSection(sectionId) {
  // Update main content
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + sectionId).classList.add('active');
  // Update sidebar nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navMap = { 'overview': 'nav-overview', 'send-money': 'nav-send', 'transactions': 'nav-txn', 'notifications': 'nav-notif' };
  if (navMap[sectionId]) document.getElementById(navMap[sectionId]).classList.add('active');
  // Update topbar title
  const titles = { 'overview': 'Overview', 'send-money': 'Send Money', 'transactions': 'Transaction History', 'notifications': 'Notifications' };
  document.getElementById('topbar-title').textContent = titles[sectionId] || '';
  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
  // Load section data
  if (sectionId === 'transactions') renderFullTransactions();
  if (sectionId === 'notifications') loadNotifications();
}

// ─── API CALLS ────────────────────────────────────────────────────

async function apiCall(method, endpoint, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Request failed');
  return data;
}

// ─── AUTH: REGISTER ───────────────────────────────────────────────

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const errEl = document.getElementById('register-error');
  const okEl = document.getElementById('register-success');
  btn.disabled = true;
  document.getElementById('register-btn-text').classList.add('hidden');
  document.getElementById('register-spinner').classList.remove('hidden');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  try {
    await apiCall('POST', '/auth/register', {
      name: document.getElementById('reg-name').value,
      email: document.getElementById('reg-email').value,
      phone: document.getElementById('reg-phone').value,
      password: document.getElementById('reg-password').value
    });
    okEl.textContent = 'Account created! Please sign in.';
    okEl.classList.remove('hidden');
    setTimeout(() => showPage('login-page'), 1500);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    document.getElementById('register-btn-text').classList.remove('hidden');
    document.getElementById('register-spinner').classList.add('hidden');
  }
});

// ─── AUTH: LOGIN ──────────────────────────────────────────────────

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');
  btn.disabled = true;
  document.getElementById('login-btn-text').classList.add('hidden');
  document.getElementById('login-spinner').classList.remove('hidden');
  errEl.classList.add('hidden');
  try {
    const data = await apiCall('POST', '/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value
    });
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('novapay_token', authToken);
    localStorage.setItem('novapay_user', JSON.stringify(currentUser));
    initDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    document.getElementById('login-btn-text').classList.remove('hidden');
    document.getElementById('login-spinner').classList.add('hidden');
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────

document.getElementById('logout-btn').addEventListener('click', () => {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('novapay_token');
  localStorage.removeItem('novapay_user');
  showPage('login-page');
});

// ─── PAGE NAVIGATION ──────────────────────────────────────────────

document.getElementById('go-register').addEventListener('click', (e) => { e.preventDefault(); showPage('register-page'); });
document.getElementById('go-login').addEventListener('click', (e) => { e.preventDefault(); showPage('login-page'); });

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    showSection(item.dataset.section);
  });
});

document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderFullTransactions(btn.dataset.filter);
  });
});

// ─── CLOCK ───────────────────────────────────────────────────────

function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateClock, 1000);
updateClock();

// ─── DASHBOARD INIT ───────────────────────────────────────────────

async function initDashboard() {
  showPage('dashboard-page');
  // Set user info
  if (currentUser) {
    const initials = getInitials(currentUser.name);
    document.getElementById('user-name-side').textContent = currentUser.name || 'User';
    document.getElementById('user-avatar').textContent = initials;
    document.getElementById('topbar-avatar').textContent = initials;
  }
  showSection('overview');
  await refreshDashboard();
}

async function refreshDashboard() {
  await Promise.all([ loadBalance(), loadTransactions() ]);
}

// ─── LOAD BALANCE ─────────────────────────────────────────────────

async function loadBalance() {
  try {
    const data = await apiCall('GET', '/accounts');
    const accounts = data.accounts || [];
    if (accounts.length > 0) {
      const totalBalance = accounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
      document.getElementById('total-balance').textContent = formatCurrency(totalBalance);
      document.getElementById('account-number').textContent = 'Account: ' + accounts[0].account_number;
    } else {
      document.getElementById('total-balance').textContent = formatCurrency(0);
      document.getElementById('account-number').textContent = 'No account yet';
    }
  } catch (err) {
    document.getElementById('total-balance').textContent = '₹—';
    document.getElementById('account-number').textContent = 'Could not load';
  }
}

// ─── LOAD TRANSACTIONS ────────────────────────────────────────────

async function loadTransactions() {
  try {
    const data = await apiCall('GET', '/transactions/history?limit=50');
    allTransactions = data.transactions || [];
    renderRecentTransactions();
    computeStats();
  } catch (err) {
    document.getElementById('recent-txn-list').innerHTML = `<div class="empty-state">Could not load transactions.<br>${err.message}</div>`;
  }
}

function computeStats() {
  let sent = 0, received = 0;
  allTransactions.forEach(t => {
    if (t.type === 'debit') sent += Number(t.amount);
    else received += Number(t.amount);
  });
  document.getElementById('total-sent').textContent = formatCurrency(sent);
  document.getElementById('total-received').textContent = formatCurrency(received);
  document.getElementById('txn-count').textContent = allTransactions.length;
}

function buildTxnItem(txn) {
  const isCredit = txn.type === 'credit';
  const icon = isCredit ? '↓' : '↑';
  const amount = isCredit ? `+${formatCurrency(txn.amount)}` : `-${formatCurrency(txn.amount)}`;
  const who = isCredit ? (txn.senderEmail || 'Unknown Sender') : (txn.recipientEmail || 'Unknown Recipient');
  const status = txn.status || 'completed';
  return `
    <div class="txn-item">
      <div class="txn-icon ${txn.type}">${icon}</div>
      <div class="txn-details">
        <div class="txn-who">${who}</div>
        <div class="txn-when">${txn.description || (isCredit ? 'Money Received' : 'Money Sent')} · ${formatDate(txn.createdAt)}</div>
      </div>
      <div class="txn-amount ${txn.type}">${amount}</div>
      <span class="txn-status ${status}">${status}</span>
    </div>`;
}

function renderRecentTransactions() {
  const list = document.getElementById('recent-txn-list');
  const recent = allTransactions.slice(0, 5);
  if (!recent.length) { list.innerHTML = '<div class="empty-state">No transactions yet. Send money to get started!</div>'; return; }
  list.innerHTML = recent.map(buildTxnItem).join('');
}

function renderFullTransactions(filter = 'all') {
  const list = document.getElementById('full-txn-list');
  let txns = allTransactions;
  if (filter === 'credit') txns = txns.filter(t => t.type === 'credit');
  if (filter === 'debit') txns = txns.filter(t => t.type === 'debit');
  if (!txns.length) { list.innerHTML = '<div class="empty-state">No transactions found.</div>'; return; }
  list.innerHTML = txns.map(buildTxnItem).join('');
}

// ─── LOAD NOTIFICATIONS ───────────────────────────────────────────

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  try {
    const data = await apiCall('GET', '/notifications');
    const notifs = data.notifications || [];
    document.getElementById('notif-badge').textContent = notifs.filter(n => !n.read).length;
    document.getElementById('notif-badge').setAttribute('data-count', notifs.filter(n => !n.read).length);
    if (!notifs.length) { list.innerHTML = '<div class="empty-state">No notifications yet.</div>'; return; }
    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-dot"></div>
        <div>
          <div class="notif-text">${n.message || n.title || 'Notification'}</div>
          <div class="notif-time">${formatDate(n.createdAt)}</div>
        </div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Could not load notifications.</div>`;
  }
}

// ─── SEND MONEY ───────────────────────────────────────────────────

function setPipelineStep(stepId, state) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.className = 'pipe-step ' + state;
  const statusEl = step.querySelector('.pipe-status');
  const statusMap = { active: 'Processing...', done: 'Done ✓', error: 'Failed ✗', '': 'Ready' };
  if (statusEl) statusEl.textContent = statusMap[state] || 'Ready';
}

function resetPipeline() {
  ['pipe-gateway','pipe-auth','pipe-payment','pipe-kafka','pipe-notify'].forEach(id => setPipelineStep(id, ''));
}

async function animatePipeline() {
  const steps = ['pipe-gateway','pipe-auth','pipe-payment','pipe-kafka','pipe-notify'];
  for (let i = 0; i < steps.length; i++) {
    setPipelineStep(steps[i], 'active');
    await new Promise(r => setTimeout(r, 600));
    setPipelineStep(steps[i], 'done');
  }
}

document.getElementById('payment-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('pay-btn');
  const errEl = document.getElementById('payment-error');
  const okEl = document.getElementById('payment-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');
  btn.disabled = true;
  document.getElementById('pay-btn-text').classList.add('hidden');
  document.getElementById('pay-spinner').classList.remove('hidden');
  resetPipeline();

  const recipient = document.getElementById('recipient-email').value;
  const amount = parseFloat(document.getElementById('payment-amount').value);
  const note = document.getElementById('payment-note').value;

  // Animate pipeline in parallel
  const pipelineAnim = animatePipeline();

  try {
    const data = await apiCall('POST', '/payments/initiate', { recipientEmail: recipient, amount, description: note || 'NovaPay Transfer' });
    await pipelineAnim;
    okEl.textContent = `✓ Payment of ${formatCurrency(amount)} to ${recipient} initiated successfully!`;
    okEl.classList.remove('hidden');
    showToast(`Sent ${formatCurrency(amount)} to ${recipient}`, 'success');
    document.getElementById('payment-form').reset();
    // Refresh dashboard data
    await refreshDashboard();
  } catch (err) {
    await pipelineAnim;
    ['pipe-gateway','pipe-auth','pipe-payment','pipe-kafka','pipe-notify'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.classList.contains('active')) setPipelineStep(id, 'error');
    });
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    document.getElementById('pay-btn-text').classList.remove('hidden');
    document.getElementById('pay-spinner').classList.add('hidden');
  }
});

// ─── AUTO LOGIN (if token exists) ────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  if (authToken && currentUser) {
    initDashboard();
  } else {
    showPage('login-page');
  }
});
