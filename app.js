/* ============================================================
   FinTrack — Pencatat Finansial Harian
   Pure vanilla JS + localStorage. No dependencies.
   ============================================================ */

/* ---------- STATE ---------- */
const STORE_KEY = 'fintrack_data_v1';

const DEFAULT_CATEGORIES = {
  income: ['Gaji', 'Bonus', 'Freelance', 'Hadiah', 'Investasi', 'Penjualan', 'Lainnya'],
  expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Sewa/Kos', 'Pulsa/Internet', 'Lainnya']
};

let state = {
  accounts: [],
  transactions: [],
  debts: [],      // {id, kind:'debt'|'receivable', person, amount, date, due, interest, priority, note, status:'active'|'paid', paidDate, paidAccountId}
  budgets: [],    // {id, month:'YYYY-MM', category, limit}
  goals: []       // {id, name, target, saved, date}
};

/* ---------- UI STATE ---------- */
let ui = {
  quickType: 'income',
  debtView: 'debt',
  budgetMonth: monthKey(new Date()),
  markPaidTargetId: null
};

/* ---------- PERSISTENCE ---------- */
function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}
function load() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = Object.assign(state, parsed);
    } catch (e) { console.error('Load error', e); }
  }
}

/* ---------- HELPERS ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function rp(n) {
  n = Number(n) || 0;
  const neg = n < 0;
  const s = 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  return neg ? '−' + s : s;
}
function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
function daysUntil(str) {
  if (!str) return null;
  const now = new Date(); now.setHours(0,0,0,0);
  const d = new Date(str + 'T00:00:00');
  return Math.round((d - now) / 86400000);
}
function accountById(id) { return state.accounts.find(a => a.id === id); }

const ACC_TYPE = {
  bank: { icon: '🏦', label: 'Bank' },
  cash: { icon: '💵', label: 'Cash / Tunai' },
  ewallet: { icon: '📱', label: 'E-Wallet' },
  investment: { icon: '📈', label: 'Investasi' },
  other: { icon: '📦', label: 'Lainnya' }
};

/* ---------- CALCULATIONS ---------- */
// Saldo murni = jumlah saldo semua akun (belum termasuk hutang/piutang)
function cleanBalance() {
  return state.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
}
// Saldo bersih = saldo murni + piutang aktif - hutang aktif
function netBalance() {
  return cleanBalance() + totalReceivableActive() - totalDebtActive();
}
function totalDebtActive() {
  return state.debts.filter(d => d.kind === 'debt' && d.status === 'active')
    .reduce((s, d) => s + Number(d.amount || 0), 0);
}
function totalReceivableActive() {
  return state.debts.filter(d => d.kind === 'receivable' && d.status === 'active')
    .reduce((s, d) => s + Number(d.amount || 0), 0);
}
function monthlySum(type, mKey) {
  return state.transactions
    .filter(t => t.type === type && t.date.startsWith(mKey))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

/* ---------- TOAST ---------- */
let toastTimer;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + type; }, 2800);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  transactions: 'Transaksi',
  debts: 'Hutang & Piutang',
  accounts: 'Akun & Saldo',
  budget: 'Anggaran & Tujuan'
};

function goToPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page];
  closeSidebar();
  renderAll();
  window.scrollTo(0, 0);
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* ============================================================
   RENDER: DASHBOARD
   ============================================================ */
function renderDashboard() {
  document.getElementById('netBalance').textContent = rp(netBalance());
  document.getElementById('cleanBalance').textContent = rp(cleanBalance());
  const mk = monthKey(new Date());
  document.getElementById('monthlyIncome').textContent = rp(monthlySum('income', mk) + monthlySum('receivable_payment', mk));
  document.getElementById('monthlyExpense').textContent = rp(monthlySum('expense', mk) + monthlySum('debt_payment', mk));
  document.getElementById('totalDebt').textContent = rp(totalDebtActive());
  document.getElementById('totalReceivable').textContent = rp(totalReceivableActive());

  // Accounts summary (top 4)
  const cont = document.getElementById('accountsSummary');
  if (state.accounts.length === 0) {
    cont.innerHTML = '<div class="empty-hint">Belum ada akun. <span class="link" data-page="accounts">Tambah akun</span></div>';
  } else {
    cont.innerHTML = state.accounts.slice(0, 5).map(a => {
      const t = ACC_TYPE[a.type] || ACC_TYPE.other;
      return `<div class="acc-summary-item">
        <span class="acc-dot" style="background:${a.color || '#6366f1'}"></span>
        <span>${t.icon}</span>
        <div style="flex:1">
          <div class="acc-summary-name">${escapeHtml(a.name)}</div>
          <div class="acc-summary-type">${t.label}</div>
        </div>
        <span class="acc-summary-balance">${rp(a.balance)}</span>
      </div>`;
    }).join('');
  }

  // Recent transactions (last 6)
  renderTxList('recentTxList', state.transactions.slice().sort(sortByDateDesc).slice(0, 6), false);
}

/* ============================================================
   RENDER: TRANSACTIONS
   ============================================================ */
function sortByDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.createdAt || 0) - (a.createdAt || 0);
}

const TX_META = {
  income: { icon: '⬆️', label: 'Pemasukan', sign: '+', cls: 'plus' },
  expense: { icon: '⬇️', label: 'Pengeluaran', sign: '−', cls: 'minus' },
  debt_payment: { icon: '📤', label: 'Bayar Hutang', sign: '−', cls: 'minus' },
  receivable_payment: { icon: '📥', label: 'Terima Piutang', sign: '+', cls: 'plus' }
};

function renderTxList(containerId, list, showDelete) {
  const cont = document.getElementById(containerId);
  if (list.length === 0) {
    cont.innerHTML = '<div class="empty-state">Belum ada transaksi.</div>';
    return;
  }
  cont.innerHTML = list.map(t => {
    const m = TX_META[t.type] || TX_META.expense;
    const acc = accountById(t.accountId);
    const tags = [];
    if (acc) tags.push(`<span class="tx-tag">${(ACC_TYPE[acc.type]||ACC_TYPE.other).icon} ${escapeHtml(acc.name)}</span>`);
    if (t.note) tags.push(escapeHtml(t.note));
    return `<div class="tx-item">
      <div class="tx-icon ${t.type}">${m.icon}</div>
      <div class="tx-info">
        <div class="tx-cat">${escapeHtml(t.category || m.label)}</div>
        <div class="tx-meta"><span>${fmtDateShort(t.date)}</span> ${tags.map(x=>`<span>${x}</span>`).join('')}</div>
      </div>
      <div class="tx-amount ${m.cls}">${m.sign} ${rp(t.amount).replace('Rp ','Rp ')}</div>
      ${showDelete ? `<button class="tx-delete" data-del-tx="${t.id}" title="Hapus">🗑️</button>` : ''}
    </div>`;
  }).join('');
}

function renderTransactionsPage() {
  // month filter options
  const monthSel = document.getElementById('txFilterMonth');
  const months = [...new Set(state.transactions.map(t => t.date.slice(0, 7)))].sort().reverse();
  const curMonth = monthKey(new Date());
  if (!months.includes(curMonth)) months.unshift(curMonth);
  const prevMonth = monthSel.value;
  monthSel.innerHTML = '<option value="">Semua Bulan</option>' + months.map(m => {
    const [y, mo] = m.split('-');
    const label = new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    return `<option value="${m}">${label}</option>`;
  }).join('');
  monthSel.value = prevMonth || '';

  // account filter
  const accSel = document.getElementById('txFilterAccount');
  const prevAcc = accSel.value;
  accSel.innerHTML = '<option value="">Semua Akun</option>' + state.accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
  accSel.value = prevAcc || '';

  applyTxFilter();
}

function applyTxFilter() {
  const m = document.getElementById('txFilterMonth').value;
  const type = document.getElementById('txFilterType').value;
  const accId = document.getElementById('txFilterAccount').value;

  let list = state.transactions.slice();
  if (m) list = list.filter(t => t.date.startsWith(m));
  if (type) list = list.filter(t => t.type === type);
  if (accId) list = list.filter(t => t.accountId === accId);
  list.sort(sortByDateDesc);

  // summary
  let inc = 0, exp = 0;
  list.forEach(t => {
    const sign = TX_META[t.type].sign;
    if (sign === '+') inc += Number(t.amount); else exp += Number(t.amount);
  });
  document.getElementById('txSumIncome').textContent = rp(inc);
  document.getElementById('txSumExpense').textContent = rp(exp);
  document.getElementById('txSumNet').textContent = rp(inc - exp);

  renderTxList('txFullList', list, true);
}

/* ============================================================
   RENDER: DEBTS & RECEIVABLES
   ============================================================ */
function renderDebtsPage() {
  const kind = ui.debtView;
  document.querySelectorAll('.dtab').forEach(t => t.classList.toggle('active', t.dataset.debt === kind));

  // update form labels
  if (kind === 'debt') {
    document.getElementById('addDebtTitle').textContent = '➕ Tambah Hutang Baru';
    document.getElementById('debtPersonLabel').textContent = 'Nama Kreditur (yang meminjamkan ke Anda)';
  } else {
    document.getElementById('addDebtTitle').textContent = '➕ Tambah Piutang Baru';
    document.getElementById('debtPersonLabel').textContent = 'Nama Debitur (yang berhutang ke Anda)';
  }

  const list = state.debts.filter(d => d.kind === kind).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const cont = document.getElementById('debtList');
  if (list.length === 0) {
    cont.innerHTML = `<div class="empty-state">${kind === 'debt' ? 'Tidak ada hutang. 🎉' : 'Belum ada piutang.'}</div>`;
    return;
  }

  cont.innerHTML = list.map(d => {
    const isPaid = d.status === 'paid';
    const dLeft = daysUntil(d.due);
    const badges = [];
    if (isPaid) {
      badges.push(`<span class="badge paid">✅ Lunas ${fmtDateShort(d.paidDate)}</span>`);
    } else {
      if (d.priority === 'high') badges.push('<span class="badge high">🔥 Prioritas Tinggi</span>');
      if (d.due) {
        if (dLeft < 0) badges.push(`<span class="badge overdue">⚠️ Telat ${Math.abs(dLeft)} hari</span>`);
        else if (dLeft <= 7) badges.push(`<span class="badge due">⏰ ${dLeft} hari lagi</span>`);
        else badges.push(`<span class="badge due">Jatuh tempo ${fmtDateShort(d.due)}</span>`);
      }
      if (d.interest && Number(d.interest) > 0) badges.push(`<span class="badge interest">💹 ${d.interest}%/bln</span>`);
    }

    const paidInfo = isPaid && d.paidAccountId ? `<div class="debt-progress-info">Via akun: ${escapeHtml((accountById(d.paidAccountId)||{name:'?'}).name)}</div>` : '';

    return `<div class="debt-card priority-${d.priority || 'normal'} ${isPaid ? 'paid' : ''}">
      <div class="debt-top">
        <div>
          <div class="debt-person">${escapeHtml(d.person)}</div>
          <div class="debt-progress-info">Sejak ${fmtDate(d.date)}</div>
        </div>
        <div class="debt-amount-big ${d.kind}">${rp(d.amount)}</div>
      </div>
      <div class="debt-badges">${badges.join('')}</div>
      ${d.note ? `<div class="debt-note">📝 ${escapeHtml(d.note)}</div>` : ''}
      ${paidInfo}
      <div class="debt-actions">
        ${!isPaid ? `<button class="debt-btn pay" data-pay="${d.id}">✅ Tandai Lunas</button>` : ''}
        <button class="debt-btn edit" data-edit-debt="${d.id}">✏️ Edit</button>
        <button class="debt-btn delete" data-del-debt="${d.id}">🗑️ Hapus</button>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   RENDER: ACCOUNTS
   ============================================================ */
function renderAccountsPage() {
  document.getElementById('totalAccountBalance').textContent = rp(cleanBalance());
  document.getElementById('totalAccountBalanceNet').textContent = rp(netBalance());

  const grid = document.getElementById('accountsGrid');
  if (state.accounts.length === 0) {
    grid.innerHTML = '<div class="empty-state">Belum ada akun. Tambahkan akun Anda di atas.</div>';
    return;
  }
  grid.innerHTML = state.accounts.map(a => {
    const t = ACC_TYPE[a.type] || ACC_TYPE.other;
    return `<div class="account-card" style="--acc-color:${a.color || '#6366f1'}">
      <div class="account-type-icon">${t.icon}</div>
      <div class="account-name">${escapeHtml(a.name)}</div>
      <div class="account-type-label">${t.label}</div>
      <div class="account-balance">${rp(a.balance)}</div>
      <div class="account-actions">
        <button class="edit" data-edit-acc="${a.id}">✏️ Edit</button>
        <button class="del" data-del-acc="${a.id}">🗑️ Hapus</button>
      </div>
    </div>`;
  }).join('');
}

/* ============================================================
   RENDER: BUDGET & GOALS
   ============================================================ */
function renderBudgetPage() {
  const [y, mo] = ui.budgetMonth.split('-');
  document.getElementById('budgetMonthLabel').textContent =
    new Date(y, mo - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // budget category dropdown
  const catSel = document.getElementById('budgetCategory');
  if (catSel.options.length === 0) {
    catSel.innerHTML = DEFAULT_CATEGORIES.expense.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  const monthBudgets = state.budgets.filter(b => b.month === ui.budgetMonth);
  const totalLimit = monthBudgets.reduce((s, b) => s + Number(b.limit), 0);
  const totalSpent = state.transactions
    .filter(t => t.type === 'expense' && t.date.startsWith(ui.budgetMonth))
    .reduce((s, t) => s + Number(t.amount), 0);

  // overview
  const pct = totalLimit > 0 ? Math.min(100, (totalSpent / totalLimit) * 100) : 0;
  const overCls = totalLimit > 0 && totalSpent > totalLimit ? 'over' : (pct > 80 ? 'warn' : '');
  document.getElementById('budgetOverview').innerHTML = `
    <div class="budget-overview-top">
      <div>
        <div class="stat-label">Total Terpakai</div>
        <div class="budget-big-num" style="color:${totalSpent > totalLimit && totalLimit>0 ? 'var(--danger)':'var(--text)'}">${rp(totalSpent)}</div>
      </div>
      <div style="text-align:right">
        <div class="stat-label">Total Anggaran</div>
        <div class="budget-big-num">${rp(totalLimit)}</div>
      </div>
    </div>
    <div class="progress-bar"><div class="progress-fill ${overCls}" style="width:${pct}%"></div></div>
    <div class="debt-progress-info" style="margin-top:8px">${totalLimit > 0 ? (totalSpent > totalLimit ? `⚠️ Melebihi anggaran ${rp(totalSpent - totalLimit)}` : `Sisa ${rp(totalLimit - totalSpent)}`) : 'Belum ada anggaran diatur untuk bulan ini.'}</div>`;

  // detail per category
  const cont = document.getElementById('budgetList');
  if (monthBudgets.length === 0) {
    cont.innerHTML = '<div class="empty-state">Belum ada anggaran untuk bulan ini.</div>';
  } else {
    cont.innerHTML = monthBudgets.map(b => {
      const spent = state.transactions
        .filter(t => t.type === 'expense' && t.category === b.category && t.date.startsWith(ui.budgetMonth))
        .reduce((s, t) => s + Number(t.amount), 0);
      const p = b.limit > 0 ? Math.min(100, (spent / b.limit) * 100) : 0;
      const oc = spent > b.limit ? 'over' : (p > 80 ? 'warn' : '');
      return `<div class="budget-item">
        <div class="budget-item-top">
          <span class="budget-item-cat">${escapeHtml(b.category)}</span>
          <span class="budget-item-nums">${rp(spent)} / ${rp(b.limit)} <button class="budget-del" data-del-budget="${b.id}">🗑️</button></span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${oc}" style="width:${p}%"></div></div>
      </div>`;
    }).join('');
  }

  // goals
  const gc = document.getElementById('goalsList');
  if (state.goals.length === 0) {
    gc.innerHTML = '<div class="empty-state">Belum ada tujuan tabungan.</div>';
  } else {
    gc.innerHTML = state.goals.map(g => {
      const p = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
      const done = g.saved >= g.target && g.target > 0;
      return `<div class="goal-card">
        <div class="goal-top">
          <span class="goal-name">${done ? '🏆 ' : ''}${escapeHtml(g.name)}</span>
          <span class="badge ${done ? 'paid' : 'due'}">${Math.round(p)}%</span>
        </div>
        <div class="progress-bar"><div class="progress-fill ${done ? '' : 'warn'}" style="width:${p}%"></div></div>
        <div class="goal-nums">
          <span>${rp(g.saved)} / ${rp(g.target)}</span>
          <span>${g.date ? 'Target: ' + fmtDateShort(g.date) : ''}</span>
        </div>
        <div class="goal-actions">
          <button class="edit" data-add-saving="${g.id}">➕ Tambah Tabungan</button>
          <button class="del" data-del-goal="${g.id}">🗑️ Hapus</button>
        </div>
      </div>`;
    }).join('');
  }
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll() {
  renderDashboard();
  renderTransactionsPage();
  renderDebtsPage();
  renderAccountsPage();
  renderBudgetPage();
  refreshAccountDropdowns();
  save();
}

function refreshAccountDropdowns() {
  const opts = '<option value="">— Pilih Akun —</option>' +
    state.accounts.map(a => `<option value="${a.id}">${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${escapeHtml(a.name)} (${rp(a.balance)})</option>`).join('');
  ['qAccount', 'markPaidAccount'].forEach(id => {
    const el = document.getElementById(id);
    const prev = el.value;
    el.innerHTML = opts;
    el.value = prev;
  });
}

function refreshCategoryDropdown() {
  const sel = document.getElementById('qCategory');
  const cats = DEFAULT_CATEGORIES[ui.quickType] || [];
  sel.innerHTML = '<option value="">— Pilih Kategori —</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

/* ============================================================
   ACTIONS: TRANSACTIONS
   ============================================================ */
function addQuickTransaction() {
  const amount = Number(document.getElementById('qAmount').value);
  const category = document.getElementById('qCategory').value;
  const accountId = document.getElementById('qAccount').value;
  const date = document.getElementById('qDate').value || todayStr();
  const note = document.getElementById('qNote').value.trim();

  if (!amount || amount <= 0) return toast('Masukkan jumlah yang valid', 'error');
  if (!accountId) return toast('Pilih akun terlebih dahulu', 'error');
  if (!category) return toast('Pilih kategori', 'error');

  const acc = accountById(accountId);
  if (ui.quickType === 'expense' && Number(acc.balance) < amount) {
    if (!confirm(`Saldo ${acc.name} tidak cukup (${rp(acc.balance)}). Tetap lanjutkan? Saldo akan menjadi minus.`)) return;
  }

  const tx = {
    id: uid(), type: ui.quickType, amount, category, accountId, date, note,
    createdAt: Date.now()
  };
  state.transactions.push(tx);
  // adjust account balance
  acc.balance = Number(acc.balance) + (ui.quickType === 'income' ? amount : -amount);

  save();
  renderAll();
  // reset form
  document.getElementById('qAmount').value = '';
  document.getElementById('qNote').value = '';
  document.getElementById('qCategory').value = '';
  toast('Transaksi tersimpan ✓', 'success');
}

function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  // reverse balance effect
  const acc = accountById(tx.accountId);
  if (acc) {
    const sign = TX_META[tx.type].sign;
    acc.balance = Number(acc.balance) + (sign === '+' ? -tx.amount : tx.amount);
  }
  state.transactions = state.transactions.filter(t => t.id !== id);
  save();
  renderAll();
  toast('Transaksi dihapus', 'success');
}

/* ============================================================
   ACTIONS: DEBTS
   ============================================================ */
function addDebt() {
  const kind = ui.debtView;
  const person = document.getElementById('debtPerson').value.trim();
  const amount = Number(document.getElementById('debtAmount').value);
  const date = document.getElementById('debtDate').value || todayStr();
  const due = document.getElementById('debtDue').value;
  const interest = Number(document.getElementById('debtInterest').value) || 0;
  const priority = document.getElementById('debtPriority').value;
  const note = document.getElementById('debtNote').value.trim();

  if (!person) return toast('Masukkan nama', 'error');
  if (!amount || amount <= 0) return toast('Masukkan jumlah yang valid', 'error');

  state.debts.push({
    id: uid(), kind, person, amount, date, due, interest, priority, note,
    status: 'active', createdAt: Date.now()
  });
  save();
  renderAll();
  // reset
  ['debtPerson', 'debtAmount', 'debtDue', 'debtInterest', 'debtNote'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('debtDate').value = todayStr();
  toast((kind === 'debt' ? 'Hutang' : 'Piutang') + ' ditambahkan ✓', 'success');
}

function openMarkPaid(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  ui.markPaidTargetId = id;
  const isDebt = d.kind === 'debt';
  document.getElementById('markPaidTitle').textContent = isDebt ? 'Lunasi Hutang' : 'Terima Pembayaran Piutang';
  document.getElementById('markPaidDesc').innerHTML =
    `${isDebt ? 'Anda akan membayar hutang' : 'Anda akan menerima pembayaran piutang'} ke <strong>${escapeHtml(d.person)}</strong> sebesar <strong>${rp(d.amount)}</strong>. Pilih akun ${isDebt ? 'sumber uang keluar' : 'tujuan uang masuk'}:`;
  document.getElementById('markPaidDirection').textContent = isDebt ? 'keluar' : 'masuk';
  document.getElementById('markPaidDate').value = todayStr();
  document.getElementById('markPaidNote').value = '';
  document.getElementById('markPaidAccount').value = '';
  refreshAccountDropdowns();
  document.getElementById('markPaidModal').classList.add('show');
}

function confirmMarkPaid() {
  const d = state.debts.find(x => x.id === ui.markPaidTargetId);
  if (!d) return;
  const accountId = document.getElementById('markPaidAccount').value;
  const date = document.getElementById('markPaidDate').value || todayStr();
  const note = document.getElementById('markPaidNote').value.trim();

  if (!accountId) return toast('Pilih akun terlebih dahulu', 'error');
  const acc = accountById(accountId);
  const isDebt = d.kind === 'debt';

  if (isDebt && Number(acc.balance) < d.amount) {
    if (!confirm(`Saldo ${acc.name} tidak cukup (${rp(acc.balance)}). Tetap lanjutkan?`)) return;
  }

  // create transaction record in history
  const txType = isDebt ? 'debt_payment' : 'receivable_payment';
  state.transactions.push({
    id: uid(),
    type: txType,
    amount: d.amount,
    category: isDebt ? `Pelunasan hutang ke ${d.person}` : `Pelunasan piutang dari ${d.person}`,
    accountId,
    date,
    note: note || d.note || '',
    createdAt: Date.now(),
    linkedDebtId: d.id
  });

  // adjust balance
  acc.balance = Number(acc.balance) + (isDebt ? -d.amount : d.amount);

  // mark debt paid
  d.status = 'paid';
  d.paidDate = date;
  d.paidAccountId = accountId;

  save();
  renderAll();
  document.getElementById('markPaidModal').classList.remove('show');
  toast(isDebt ? 'Hutang lunas & tercatat di transaksi ✓' : 'Piutang diterima & tercatat ✓', 'success');
}

function openEditDebt(id) {
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  document.getElementById('editDebtId').value = id;
  document.getElementById('editDebtTitle').textContent = d.kind === 'debt' ? 'Edit Hutang' : 'Edit Piutang';
  document.getElementById('editDebtPersonLabel').textContent = d.kind === 'debt' ? 'Nama Kreditur' : 'Nama Debitur';
  document.getElementById('editDebtPerson').value = d.person;
  document.getElementById('editDebtAmount').value = d.amount;
  document.getElementById('editDebtDate').value = d.date;
  document.getElementById('editDebtDue').value = d.due || '';
  document.getElementById('editDebtInterest').value = d.interest || '';
  document.getElementById('editDebtPriority').value = d.priority || 'normal';
  document.getElementById('editDebtNote').value = d.note || '';
  document.getElementById('editDebtModal').classList.add('show');
}

function confirmEditDebt() {
  const id = document.getElementById('editDebtId').value;
  const d = state.debts.find(x => x.id === id);
  if (!d) return;
  const person = document.getElementById('editDebtPerson').value.trim();
  const amount = Number(document.getElementById('editDebtAmount').value);
  if (!person) return toast('Nama tidak boleh kosong', 'error');
  if (!amount || amount <= 0) return toast('Jumlah tidak valid', 'error');

  d.person = person;
  d.amount = amount;
  d.date = document.getElementById('editDebtDate').value || d.date;
  d.due = document.getElementById('editDebtDue').value;
  d.interest = Number(document.getElementById('editDebtInterest').value) || 0;
  d.priority = document.getElementById('editDebtPriority').value;
  d.note = document.getElementById('editDebtNote').value.trim();

  save();
  renderAll();
  document.getElementById('editDebtModal').classList.remove('show');
  toast('Perubahan disimpan ✓', 'success');
}

/* ============================================================
   ACTIONS: ACCOUNTS
   ============================================================ */
function saveAccount() {
  const name = document.getElementById('accName').value.trim();
  const type = document.getElementById('accType').value;
  const balance = Number(document.getElementById('accBalance').value) || 0;
  const color = document.getElementById('accColor').value;
  const editId = document.getElementById('editAccountId').value;

  if (!name) return toast('Masukkan nama akun', 'error');

  if (editId) {
    const a = accountById(editId);
    a.name = name; a.type = type; a.balance = balance; a.color = color;
    document.getElementById('editAccountId').value = '';
    document.getElementById('saveAccountBtn').textContent = '+ Simpan Akun';
    toast('Akun diperbarui ✓', 'success');
  } else {
    state.accounts.push({ id: uid(), name, type, balance, color, createdAt: Date.now() });
    toast('Akun ditambahkan ✓', 'success');
  }
  save();
  renderAll();
  ['accName', 'accBalance'].forEach(id => document.getElementById(id).value = '');
}

function editAccount(id) {
  const a = accountById(id);
  if (!a) return;
  document.getElementById('accName').value = a.name;
  document.getElementById('accType').value = a.type;
  document.getElementById('accBalance').value = a.balance;
  document.getElementById('accColor').value = a.color || '#6366f1';
  document.getElementById('editAccountId').value = id;
  document.getElementById('saveAccountBtn').textContent = '💾 Simpan Perubahan';
  document.getElementById('addAccountBody').classList.remove('collapsed');
  document.getElementById('accName').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ============================================================
   ACTIONS: BUDGET & GOALS
   ============================================================ */
function saveBudget() {
  const category = document.getElementById('budgetCategory').value;
  const limit = Number(document.getElementById('budgetLimit').value);
  if (!limit || limit <= 0) return toast('Masukkan limit yang valid', 'error');

  const existing = state.budgets.find(b => b.month === ui.budgetMonth && b.category === category);
  if (existing) existing.limit = limit;
  else state.budgets.push({ id: uid(), month: ui.budgetMonth, category, limit });

  save();
  renderBudgetPage();
  document.getElementById('budgetLimit').value = '';
  toast('Anggaran disimpan ✓', 'success');
}

function addGoal() {
  const name = document.getElementById('goalName').value.trim();
  const target = Number(document.getElementById('goalTarget').value);
  const saved = Number(document.getElementById('goalSaved').value) || 0;
  const date = document.getElementById('goalDate').value;
  if (!name) return toast('Masukkan nama tujuan', 'error');
  if (!target || target <= 0) return toast('Masukkan target yang valid', 'error');

  state.goals.push({ id: uid(), name, target, saved, date });
  save();
  renderBudgetPage();
  ['goalName', 'goalTarget', 'goalSaved', 'goalDate'].forEach(id => document.getElementById(id).value = '');
  toast('Tujuan ditambahkan ✓', 'success');
}

function addSaving(id) {
  const g = state.goals.find(x => x.id === id);
  if (!g) return;
  const val = prompt(`Berapa yang ingin ditambahkan ke "${g.name}"? (Rp)`);
  if (val === null) return;
  const num = Number(val);
  if (!num || num <= 0) return toast('Jumlah tidak valid', 'error');
  g.saved = Number(g.saved) + num;
  save();
  renderBudgetPage();
  toast('Tabungan ditambahkan ✓', 'success');
}

/* ============================================================
   DELETE HANDLER (generic modal)
   ============================================================ */
let deleteAction = null;
function openDelete(msg, action) {
  document.getElementById('deleteMsg').textContent = msg;
  deleteAction = action;
  document.getElementById('deleteModal').classList.add('show');
}

/* ============================================================
   ESCAPE HTML
   ============================================================ */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ============================================================
   EVENT WIRING
   ============================================================ */
function init() {
  load();

  // set dates
  document.getElementById('qDate').value = todayStr();
  document.getElementById('debtDate').value = todayStr();

  // header date
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('todayBadge').textContent = dateStr;
  document.getElementById('sidebarDate').textContent = '📅 ' + dateStr;

  refreshCategoryDropdown();

  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); goToPage(el.dataset.page); });
  });

  // Sidebar mobile
  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('overlay').addEventListener('click', closeSidebar);

  // Quick add tabs
  document.querySelectorAll('.qtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.qtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      ui.quickType = tab.dataset.type;
      refreshCategoryDropdown();
    });
  });
  document.getElementById('qAddBtn').addEventListener('click', addQuickTransaction);

  // Transaction filters
  ['txFilterMonth', 'txFilterType', 'txFilterAccount'].forEach(id => {
    document.getElementById(id).addEventListener('change', applyTxFilter);
  });

  // Tx list delete (delegation)
  document.getElementById('txFullList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-tx]');
    if (btn) {
      const id = btn.dataset.delTx;
      openDelete('Hapus transaksi ini? Saldo akun akan disesuaikan kembali.', () => deleteTransaction(id));
    }
  });

  // Debt tabs
  document.querySelectorAll('.dtab').forEach(tab => {
    tab.addEventListener('click', () => { ui.debtView = tab.dataset.debt; renderDebtsPage(); });
  });
  document.getElementById('addDebtBtn').addEventListener('click', addDebt);

  // Debt list actions (delegation)
  document.getElementById('debtList').addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]');
    const edit = e.target.closest('[data-edit-debt]');
    const del = e.target.closest('[data-del-debt]');
    if (pay) openMarkPaid(pay.dataset.pay);
    else if (edit) openEditDebt(edit.dataset.editDebt);
    else if (del) {
      const id = del.dataset.delDebt;
      openDelete('Hapus catatan hutang/piutang ini secara permanen?', () => {
        state.debts = state.debts.filter(x => x.id !== id);
        save(); renderAll(); toast('Data dihapus', 'success');
      });
    }
  });

  // Mark paid modal
  document.getElementById('confirmMarkPaid').addEventListener('click', confirmMarkPaid);
  document.getElementById('cancelMarkPaid').addEventListener('click', () => document.getElementById('markPaidModal').classList.remove('show'));
  document.getElementById('closeMarkPaid').addEventListener('click', () => document.getElementById('markPaidModal').classList.remove('show'));

  // Edit debt modal
  document.getElementById('confirmEditDebt').addEventListener('click', confirmEditDebt);
  document.getElementById('cancelEditDebt').addEventListener('click', () => document.getElementById('editDebtModal').classList.remove('show'));
  document.getElementById('closeEditDebt').addEventListener('click', () => document.getElementById('editDebtModal').classList.remove('show'));

  // Accounts
  document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);
  document.getElementById('accountsGrid').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-acc]');
    const del = e.target.closest('[data-del-acc]');
    if (edit) editAccount(edit.dataset.editAcc);
    else if (del) {
      const id = del.dataset.delAcc;
      const hasTx = state.transactions.some(t => t.accountId === id);
      openDelete(hasTx ? 'Akun ini punya riwayat transaksi. Hapus akun? (Transaksi tetap tersimpan tapi tanpa label akun)' : 'Hapus akun ini?', () => {
        state.accounts = state.accounts.filter(a => a.id !== id);
        save(); renderAll(); toast('Akun dihapus', 'success');
      });
    }
  });

  // Budget
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('budgetPrevMonth').addEventListener('click', () => shiftBudgetMonth(-1));
  document.getElementById('budgetNextMonth').addEventListener('click', () => shiftBudgetMonth(1));
  document.getElementById('budgetList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-budget]');
    if (del) {
      const id = del.dataset.delBudget;
      state.budgets = state.budgets.filter(b => b.id !== id);
      save(); renderBudgetPage(); toast('Anggaran dihapus', 'success');
    }
  });

  // Goals
  document.getElementById('addGoalBtn').addEventListener('click', addGoal);
  document.getElementById('goalsList').addEventListener('click', (e) => {
    const addS = e.target.closest('[data-add-saving]');
    const del = e.target.closest('[data-del-goal]');
    if (addS) addSaving(addS.dataset.addSaving);
    else if (del) {
      const id = del.dataset.delGoal;
      openDelete('Hapus tujuan tabungan ini?', () => {
        state.goals = state.goals.filter(g => g.id !== id);
        save(); renderBudgetPage(); toast('Tujuan dihapus', 'success');
      });
    }
  });

  // Generic delete modal
  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (deleteAction) deleteAction();
    deleteAction = null;
    document.getElementById('deleteModal').classList.remove('show');
  });
  document.getElementById('cancelDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('show'));
  document.getElementById('closeDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('show'));

  // Collapsible forms
  setupCollapse('addDebtHeader', 'addDebtBody');
  setupCollapse('addAccountHeader', 'addAccountBody');
  setupCollapse('addBudgetHeader', 'addBudgetBody');
  setupCollapse('addGoalHeader', 'addGoalBody');

  // Close modals on overlay click
  document.querySelectorAll('.modal-overlay').forEach(ov => {
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); });
  });

  renderAll();
}

function setupCollapse(headerId, bodyId) {
  const header = document.getElementById(headerId);
  const body = document.getElementById(bodyId);
  const btn = header.querySelector('.toggle-form-btn');
  header.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    body.classList.toggle('collapsed');
    if (btn) btn.style.transform = body.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
  });
}

function shiftBudgetMonth(delta) {
  const [y, m] = ui.budgetMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  ui.budgetMonth = monthKey(d);
  renderBudgetPage();
}

/* ---------- START ---------- */
document.addEventListener('DOMContentLoaded', init);
