/* ============================================================
   FinTrack — Manajemen Finansial Pribadi
   Vanilla JS + localStorage. No external dependencies.
   Includes: core tracker, canvas charts, recap analytics,
             AI assistant (NLP parse + commands), voice I/O.
   ============================================================ */

/* ---------- STATE ---------- */
const STORE_KEY = 'fintrack_data_v1';   // kept identical → existing data preserved

const DEFAULT_CATEGORIES = {
  income: ['Gaji', 'Bonus', 'Freelance', 'Hadiah', 'Investasi', 'Penjualan', 'Lainnya'],
  expense: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan', 'Kesehatan', 'Pendidikan', 'Sewa/Kos', 'Pulsa/Internet', 'Lainnya']
};

// Keyword map for AI auto-categorization (Indonesian)
const CATEGORY_KEYWORDS = {
  'Makanan': ['makan','makanan','sarapan','siang','malam','jajan','snack','kopi','ngopi','minum','minuman','warteg','warung','resto','restoran','cafe','kafe','gofood','grabfood','nasi','ayam','bakso','mie','mi','soto','nasgor','martabak','gorengan','roti','kue','es','teh','boba','starbuck','mcd','kfc','pizza','burger','seblak','sate','padang','geprek','dimsum','sushi'],
  'Transportasi': ['transport','transportasi','bensin','bbm','pertalite','pertamax','solar','ojek','ojol','gojek','grab','maxim','taksi','taxi','angkot','bus','busway','krl','mrt','lrt','kereta','parkir','tol','e-toll','tap','isi bensin','service motor','ganti oli','tiket kereta'],
  'Belanja': ['belanja','beli','shopping','baju','celana','sepatu','sandal','tas','kaos','jaket','skincare','kosmetik','makeup','shopee','tokopedia','lazada','tiktok shop','olshop','online shop','indomaret','alfamart','supermarket','minimarket','groceries','sabun','shampo','detergen'],
  'Tagihan': ['tagihan','bayar','listrik','pln','token','air','pdam','wifi','indihome','gas','iuran','cicilan','pajak','bpjs','asuransi','sewa'],
  'Hiburan': ['hiburan','nonton','bioskop','cinema','xxi','cgv','netflix','spotify','youtube premium','disney','game','games','top up','topup','diamond','uc','vp','steam','karaoke','wisata','liburan','tiket konser','langganan'],
  'Kesehatan': ['kesehatan','obat','apotek','apotik','dokter','rumah sakit','rs','klinik','vitamin','periksa','medical','gym','fitness','olahraga'],
  'Pendidikan': ['pendidikan','sekolah','kuliah','kampus','spp','buku','kursus','les','bimbel','seminar','pelatihan','ujian','alat tulis','fotokopi','print','skripsi'],
  'Sewa/Kos': ['kos','kost','sewa','kontrakan','indekos','apartemen','asrama'],
  'Pulsa/Internet': ['pulsa','kuota','paket data','internet','telkomsel','xl','indosat','tri','axis','smartfren','by.u','byu','isi pulsa'],
  'Gaji': ['gaji','salary','upah','payroll'],
  'Bonus': ['bonus','thr','insentif','komisi'],
  'Freelance': ['freelance','proyek','project','honor','fee','job'],
  'Hadiah': ['hadiah','gift','kado','angpao','angpau'],
  'Investasi': ['investasi','dividen','bunga','saham','reksadana','crypto','profit','cuan'],
  'Penjualan': ['jual','penjualan','laku','omzet','dagang']
};

let state = {
  accounts: [],
  transactions: [],
  debts: [],
  budgets: [],
  goals: [],
  learnedTerms: {},   // { "teazzi": "Minuman", ... } — things the user taught the bot
  customCategories: [], // extra expense categories the user introduced while teaching
  auditLog: [],       // agent actions: {ts, userMessage, intent, action, toolCalls, result, confidence}
  settings: { voiceReply: true, botName: 'FinBot', voiceURI: '', rate: 0.98, pitch: 1.0, theme: 'light', autoConfirm: 'smart' }
};
const DEFAULT_SETTINGS = { voiceReply: true, botName: 'FinBot', voiceURI: '', rate: 0.98, pitch: 1.0, theme: 'light', autoConfirm: 'smart' };

let ui = {
  quickType: 'income',
  debtView: 'debt',
  budgetMonth: monthKey(new Date()),
  markPaidTargetId: null,
  recapPeriod: 'month',
  recapAnchor: new Date()   // reference date for the period being viewed
};

/* ---------- PERSISTENCE ---------- */
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function load() {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // merge to keep new fields (settings) without wiping old data
      state = Object.assign(state, parsed);
      // ensure all setting keys exist (backward compatible with older saves)
      state.settings = Object.assign({}, DEFAULT_SETTINGS, state.settings || {});
      if (!state.learnedTerms || typeof state.learnedTerms !== 'object') state.learnedTerms = {};
      if (!Array.isArray(state.customCategories)) state.customCategories = [];
      if (!Array.isArray(state.auditLog)) state.auditLog = [];
    } catch (e) { console.error('Load error', e); }
  }
}

/* ---------- HELPERS ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function dateStr(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function todayStr() { return dateStr(new Date()); }
function rp(n) {
  n = Number(n) || 0;
  const neg = n < 0;
  const s = 'Rp ' + Math.abs(Math.round(n)).toLocaleString('id-ID');
  return neg ? '−' + s : s;
}
function rpShort(n) {
  n = Math.abs(Number(n) || 0);
  if (n >= 1e9) return (n/1e9).toFixed(1).replace('.0','') + 'M';
  if (n >= 1e6) return (n/1e6).toFixed(1).replace('.0','') + 'jt';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'rb';
  return String(Math.round(n));
}
function fmtDate(str) { if (!str) return ''; return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtDateShort(str) { if (!str) return ''; return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }); }
function daysUntil(str) { if (!str) return null; const now = new Date(); now.setHours(0,0,0,0); return Math.round((new Date(str + 'T00:00:00') - now) / 86400000); }
function accountById(id) { return state.accounts.find(a => a.id === id); }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

const ACC_TYPE = {
  bank: { icon: '🏦', label: 'Bank' }, cash: { icon: '💵', label: 'Cash / Tunai' },
  ewallet: { icon: '📱', label: 'E-Wallet' }, investment: { icon: '📈', label: 'Investasi' }, other: { icon: '📦', label: 'Lainnya' }
};
const TX_META = {
  income: { icon: '↑', label: 'Pemasukan', sign: '+', cls: 'plus' },
  expense: { icon: '↓', label: 'Pengeluaran', sign: '−', cls: 'minus' },
  debt_payment: { icon: '↗', label: 'Bayar Hutang', sign: '−', cls: 'minus' },
  receivable_payment: { icon: '↙', label: 'Terima Piutang', sign: '+', cls: 'plus' }
};
const CHART_COLORS = ['#4f46e5','#0ea5e9','#059669','#d97706','#dc2626','#7c3aed','#db2777','#0891b2','#65a30d','#ea580c','#6366f1','#14b8a6'];
// theme-aware chart neutrals (axis text, gridlines, donut hole)
function chartInk() { return (state.settings && state.settings.theme === 'dark') ? '#94a3b8' : '#94a3b8'; }
function chartGrid() { return (state.settings && state.settings.theme === 'dark') ? '#223049' : '#eef0f5'; }
function chartHole() { return (state.settings && state.settings.theme === 'dark') ? '#121a2c' : '#ffffff'; }
function chartCenterInk() { return (state.settings && state.settings.theme === 'dark') ? '#f1f5f9' : '#0f172a'; }

/* ---------- CALCULATIONS ---------- */
function cleanBalance() { return state.accounts.reduce((s,a) => s + Number(a.balance||0), 0); }
function totalDebtActive() { return state.debts.filter(d => d.kind==='debt' && d.status==='active').reduce((s,d)=>s+Number(d.amount||0),0); }
function totalReceivableActive() { return state.debts.filter(d => d.kind==='receivable' && d.status==='active').reduce((s,d)=>s+Number(d.amount||0),0); }
function netBalance() { return cleanBalance() + totalReceivableActive() - totalDebtActive(); }
function monthlySum(type, mKey) { return state.transactions.filter(t => t.type===type && t.date.startsWith(mKey)).reduce((s,t)=>s+Number(t.amount||0),0); }
function sortByDateDesc(a,b){ if (a.date!==b.date) return a.date<b.date?1:-1; return (b.createdAt||0)-(a.createdAt||0); }

/* ---------- TOAST ---------- */
let toastTimer;
function toast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast ' + type; }, 2800);
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGE_INFO = {
  dashboard: ['Dashboard', 'Ringkasan keuangan Anda hari ini'],
  transactions: ['Transaksi', 'Semua riwayat pemasukan, pengeluaran, hutang & piutang'],
  recap: ['Rekap & Analitik', 'Analisa keuangan per hari, minggu, bulan, dan tahun'],
  debts: ['Hutang & Piutang', 'Kelola pinjaman dan tagihan Anda'],
  accounts: ['Akun & Saldo', 'Uang Anda di bank, cash, dan e-wallet'],
  budget: ['Anggaran & Tujuan', 'Kendalikan pengeluaran dan capai target']
};
function goToPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('pageTitle').textContent = PAGE_INFO[page][0];
  document.getElementById('pageSubtitle').textContent = PAGE_INFO[page][1];
  closeSidebar();
  renderAll();
  window.scrollTo(0, 0);
}
function openSidebar() { document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

/* ============================================================
   CANVAS CHART ENGINE (no dependencies)
   ============================================================ */
function setupCanvas(canvas) {
  if (!canvas || !canvas.parentElement) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  // Bail out if the panel is hidden / not laid out yet (zero size).
  if (!w || !h || w < 2 || h < 2) return null;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx || typeof ctx.setTransform !== 'function' || typeof ctx.createLinearGradient !== 'function') return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function drawLineChart(canvasId, labels, series) {
  // series: [{data:[], color, fill}]
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const cw = w - padL - padR, ch = h - padT - padB;
  let max = 0;
  series.forEach(s => s.data.forEach(v => { if (v > max) max = v; }));
  if (max === 0) max = 1;
  const niceMax = niceNumber(max);
  // grid + y labels
  ctx.font = '11px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = chartInk(); ctx.strokeStyle = chartGrid(); ctx.lineWidth = 1;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + ch - (ch * i / steps);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(rpShort(niceMax * i / steps), padL - 8, y);
  }
  // x labels
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = chartInk();
  const n = labels.length;
  const stepX = n > 1 ? cw / (n - 1) : 0;
  labels.forEach((lb, i) => { ctx.fillText(lb, padL + stepX * i, h - padB + 8); });
  // series lines
  series.forEach(s => {
    ctx.beginPath();
    s.data.forEach((v, i) => {
      const x = padL + stepX * i;
      const y = padT + ch - (ch * v / niceMax);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    if (s.fill) {
      let grad = null;
      try { grad = ctx.createLinearGradient(0, padT, 0, padT + ch); } catch (e) { grad = null; }
      if (grad && typeof grad.addColorStop === 'function') {
        grad.addColorStop(0, s.color + '33'); grad.addColorStop(1, s.color + '00');
        ctx.lineTo(padL + stepX * (n - 1), padT + ch); ctx.lineTo(padL, padT + ch); ctx.closePath();
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath();
        s.data.forEach((v, i) => { const x = padL + stepX * i, y = padT + ch - (ch * v / niceMax); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      }
    }
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    // dots
    s.data.forEach((v, i) => {
      const x = padL + stepX * i, y = padT + ch - (ch * v / niceMax);
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI*2); ctx.fillStyle = s.color; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
  });
}

function drawBarChart(canvasId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const cw = w - padL - padR, ch = h - padT - padB;
  let max = Math.max(...values, 0); if (max === 0) max = 1;
  const niceMax = niceNumber(max);
  ctx.font = '11px "Plus Jakarta Sans", sans-serif';
  ctx.strokeStyle = chartGrid(); ctx.fillStyle = chartInk();
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const y = padT + ch - (ch * i / steps);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(rpShort(niceMax * i / steps), padL - 8, y);
  }
  const n = values.length;
  const slot = cw / n; const bw = Math.min(slot * 0.6, 46);
  values.forEach((v, i) => {
    const x = padL + slot * i + (slot - bw) / 2;
    const bh = ch * v / niceMax;
    const y = padT + ch - bh;
    const col = (colors && colors[i]) || '#4f46e5';
    roundRect(ctx, x, y, bw, bh, 6); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = chartInk(); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(labels[i], padL + slot * i + slot / 2, h - padB + 8);
  });
}

function drawDonutChart(canvasId, data) {
  // data: [{label, value, color}]
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const setup = setupCanvas(canvas);
  if (!setup) return;
  const { ctx, w, h } = setup;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - 10; const inner = r * 0.62;
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.arc(cx, cy, inner, 0, Math.PI*2, true);
    ctx.fillStyle = chartGrid(); ctx.fill('evenodd');
    ctx.fillStyle = chartInk(); ctx.font = '13px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Belum ada data', cx, cy);
    return;
  }
  let start = -Math.PI / 2;
  data.forEach(d => {
    const ang = (d.value / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + ang); ctx.closePath();
    ctx.fillStyle = d.color; ctx.fill();
    start += ang;
  });
  // inner hole
  ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI*2); ctx.fillStyle = chartHole(); ctx.fill();
  // center text
  ctx.fillStyle = chartCenterInk(); ctx.font = '800 18px "Plus Jakarta Sans"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(rpShort(total), cx, cy - 6);
  ctx.fillStyle = chartInk(); ctx.font = '600 11px "Plus Jakarta Sans"';
  ctx.fillText('Total', cx, cy + 12);
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < r) r = h;
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, 0); ctx.arcTo(x, y + h, x, y, 0);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function niceNumber(max) {
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const frac = max / base;
  let nice;
  if (frac <= 1) nice = 1; else if (frac <= 2) nice = 2; else if (frac <= 2.5) nice = 2.5; else if (frac <= 5) nice = 5; else nice = 10;
  return nice * base;
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

  // accounts summary
  const cont = document.getElementById('accountsSummary');
  if (state.accounts.length === 0) {
    cont.innerHTML = '<div class="empty-hint">Belum ada akun. <span class="link" data-page="accounts">Tambah akun</span></div>';
  } else {
    cont.innerHTML = state.accounts.slice(0, 5).map(a => {
      const t = ACC_TYPE[a.type] || ACC_TYPE.other;
      return `<div class="acc-summary-item">
        <span class="acc-dot" style="background:${a.color||'#4f46e5'}"></span>
        <span class="acc-type-tag">${t.icon}</span>
        <div style="flex:1"><div class="acc-summary-name">${escapeHtml(a.name)}</div><div class="acc-summary-type">${t.label}</div></div>
        <span class="acc-summary-balance">${rp(a.balance)}</span></div>`;
    }).join('');
  }

  renderTxList('recentTxList', state.transactions.slice().sort(sortByDateDesc).slice(0, 6), false);
  safeRender('dashboard-charts', renderDashboardCharts);
}

function renderDashboardCharts() {
  // Cashflow last 6 months
  const now = new Date();
  const labels = [], incomeData = [], expenseData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = monthKey(d);
    labels.push(d.toLocaleDateString('id-ID', { month: 'short' }));
    incomeData.push(monthlySum('income', mk) + monthlySum('receivable_payment', mk));
    expenseData.push(monthlySum('expense', mk) + monthlySum('debt_payment', mk));
  }
  drawLineChart('dashCashflowChart', labels, [
    { data: incomeData, color: '#059669', fill: true },
    { data: expenseData, color: '#dc2626', fill: false }
  ]);

  // Category donut (this month expenses)
  const catData = categoryBreakdown(monthKey(now), 'month');
  const donut = catData.slice(0, 8).map((c, i) => ({ label: c.cat, value: c.total, color: CHART_COLORS[i % CHART_COLORS.length] }));
  drawDonutChart('dashCategoryChart', donut);
  renderLegend('dashCategoryLegend', donut);
}

function renderLegend(id, data) {
  const el = document.getElementById(id);
  if (!el) return;
  if (data.length === 0) { el.innerHTML = '<span class="empty-hint" style="padding:8px">Belum ada pengeluaran</span>'; return; }
  el.innerHTML = data.map(d => `<span class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${escapeHtml(d.label)} <span class="legend-val">${rp(d.value)}</span></span>`).join('');
}

/* ============================================================
   RENDER: TRANSACTIONS
   ============================================================ */
function renderTxList(containerId, list, showDelete) {
  const cont = document.getElementById(containerId);
  if (list.length === 0) { cont.innerHTML = '<div class="empty-state">Belum ada transaksi.</div>'; return; }
  cont.innerHTML = list.map(t => {
    const m = TX_META[t.type] || TX_META.expense;
    const acc = accountById(t.accountId);
    const tags = [];
    if (acc) tags.push(`${(ACC_TYPE[acc.type]||ACC_TYPE.other).icon} ${escapeHtml(acc.name)}`);
    if (t.note) tags.push(escapeHtml(t.note));
    return `<div class="tx-item">
      <div class="tx-icon ${t.type}">${m.icon}</div>
      <div class="tx-info">
        <div class="tx-cat">${escapeHtml(t.category || m.label)}</div>
        <div class="tx-meta"><span>${fmtDateShort(t.date)}</span>${tags.map(x=>`<span class="tx-tag">${x}</span>`).join('')}</div>
      </div>
      <div class="tx-amount ${m.cls}">${m.sign} ${rp(t.amount)}</div>
      ${showDelete ? `<button class="tx-delete" data-del-tx="${t.id}" title="Hapus">🗑</button>` : ''}
    </div>`;
  }).join('');
}

function renderTransactionsPage() {
  const monthSel = document.getElementById('txFilterMonth');
  const months = [...new Set(state.transactions.map(t => t.date.slice(0,7)))].sort().reverse();
  const curMonth = monthKey(new Date());
  if (!months.includes(curMonth)) months.unshift(curMonth);
  const prevMonth = monthSel.value;
  monthSel.innerHTML = '<option value="">Semua Bulan</option>' + months.map(m => {
    const [y,mo] = m.split('-');
    return `<option value="${m}">${new Date(y,mo-1).toLocaleDateString('id-ID',{month:'long',year:'numeric'})}</option>`;
  }).join('');
  monthSel.value = prevMonth || '';

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
  let inc = 0, exp = 0;
  list.forEach(t => { TX_META[t.type].sign === '+' ? inc += Number(t.amount) : exp += Number(t.amount); });
  document.getElementById('txSumIncome').textContent = rp(inc);
  document.getElementById('txSumExpense').textContent = rp(exp);
  document.getElementById('txSumNet').textContent = rp(inc - exp);
  renderTxList('txFullList', list, true);
}

/* ============================================================
   RECAP / ANALYTICS
   ============================================================ */
function periodRange(period, anchor) {
  const a = new Date(anchor); a.setHours(0,0,0,0);
  let start, end, label;
  if (period === 'day') {
    start = new Date(a); end = new Date(a);
    label = a.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  } else if (period === 'week') {
    const dow = (a.getDay() + 6) % 7; // Monday=0
    start = new Date(a); start.setDate(a.getDate() - dow);
    end = new Date(start); end.setDate(start.getDate() + 6);
    label = `${start.toLocaleDateString('id-ID',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}`;
  } else if (period === 'month') {
    start = new Date(a.getFullYear(), a.getMonth(), 1);
    end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    label = a.toLocaleDateString('id-ID', { month:'long', year:'numeric' });
  } else { // year
    start = new Date(a.getFullYear(), 0, 1);
    end = new Date(a.getFullYear(), 11, 31);
    label = String(a.getFullYear());
  }
  return { start, end, label };
}
function inRange(ds, start, end) { const d = new Date(ds + 'T00:00:00'); return d >= start && d <= end; }

function txInPeriod(period, anchor) {
  const { start, end } = periodRange(period, anchor);
  return state.transactions.filter(t => inRange(t.date, start, end));
}

function categoryBreakdown(anchorKeyOrDate, period) {
  // returns [{cat, total}] sorted desc, only expense + debt_payment
  let list;
  if (period === 'month' && typeof anchorKeyOrDate === 'string') {
    list = state.transactions.filter(t => t.date.startsWith(anchorKeyOrDate));
  } else {
    list = txInPeriod(period, anchorKeyOrDate);
  }
  const map = {};
  list.filter(t => t.type === 'expense' || t.type === 'debt_payment').forEach(t => {
    const cat = t.type === 'debt_payment' ? 'Bayar Hutang' : (t.category || 'Lainnya');
    map[cat] = (map[cat] || 0) + Number(t.amount);
  });
  return Object.entries(map).map(([cat, total]) => ({ cat, total })).sort((a,b) => b.total - a.total);
}

function renderRecapPage() {
  // segment + label
  document.querySelectorAll('#recapPeriodSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.period === ui.recapPeriod));
  const { start, end, label } = periodRange(ui.recapPeriod, ui.recapAnchor);
  document.getElementById('recapPeriodLabel').textContent = label;

  const list = state.transactions.filter(t => inRange(t.date, start, end));
  let inc = 0, exp = 0;
  list.forEach(t => { TX_META[t.type].sign === '+' ? inc += Number(t.amount) : exp += Number(t.amount); });
  document.getElementById('recapIncome').textContent = rp(inc);
  document.getElementById('recapExpense').textContent = rp(exp);
  document.getElementById('recapNet').textContent = rp(inc - exp);
  document.getElementById('recapCount').textContent = list.length;

  // trend chart
  safeRender('recap-trend', () => renderRecapTrend(start, end));

  // donut + ranking
  const cats = categoryBreakdown(ui.recapAnchor, ui.recapPeriod);
  const donut = cats.slice(0, 8).map((c, i) => ({ label: c.cat, value: c.total, color: CHART_COLORS[i % CHART_COLORS.length] }));
  safeRender('recap-donut', () => { drawDonutChart('recapDonutChart', donut); renderLegend('recapDonutLegend', donut); });

  const totalExp = cats.reduce((s, c) => s + c.total, 0);
  const rank = document.getElementById('recapRanking');
  document.getElementById('recapTopHint').textContent = cats.length ? `${cats.length} kategori` : '';
  if (cats.length === 0) {
    rank.innerHTML = '<div class="empty-state">Belum ada pengeluaran pada periode ini.</div>';
  } else {
    rank.innerHTML = cats.map((c, i) => {
      const pct = totalExp ? (c.total / totalExp * 100) : 0;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      return `<div class="rank-item">
        <div class="rank-num">${i+1}</div>
        <div class="rank-body">
          <div class="rank-top"><span class="rank-cat">${escapeHtml(c.cat)}</span><span class="rank-amt">${rp(c.total)}</span></div>
          <div class="rank-bar"><div class="rank-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="rank-pct">${pct.toFixed(1)}% dari total pengeluaran</div>
        </div></div>`;
    }).join('');
  }

  renderRecapInsights(inc, exp, cats, totalExp, list.length);
}

function renderRecapTrend(start, end) {
  // build buckets depending on period
  const labels = [], values = [], colors = [];
  const period = ui.recapPeriod;
  const expenseOf = (s, e) => state.transactions.filter(t => (t.type==='expense'||t.type==='debt_payment') && inRange(t.date, s, e)).reduce((sum,t)=>sum+Number(t.amount),0);

  if (period === 'day') {
    // last 7 days ending at anchor
    for (let i = 6; i >= 0; i--) {
      const d = new Date(ui.recapAnchor); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      labels.push(d.toLocaleDateString('id-ID', { weekday: 'short' }));
      values.push(expenseOf(d, d));
      colors.push(i === 0 ? '#4f46e5' : '#c7d2fe');
    }
    drawBarChart('recapTrendChart', labels, values, colors);
  } else if (period === 'week') {
    // 7 days of the week
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      labels.push(d.toLocaleDateString('id-ID', { weekday: 'short' }));
      values.push(expenseOf(d, d));
      colors.push('#4f46e5');
    }
    drawBarChart('recapTrendChart', labels, values, colors);
  } else if (period === 'month') {
    // weeks of month
    const weeks = [];
    let ws = new Date(start);
    let idx = 1;
    while (ws <= end) {
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      const clampEnd = we > end ? end : we;
      weeks.push({ label: 'M' + idx, val: expenseOf(new Date(ws), new Date(clampEnd)) });
      ws.setDate(ws.getDate() + 7); idx++;
    }
    weeks.forEach(w => { labels.push(w.label); values.push(w.val); colors.push('#4f46e5'); });
    drawBarChart('recapTrendChart', labels, values, colors);
  } else {
    // year → 12 months line
    for (let m = 0; m < 12; m++) {
      const ms = new Date(ui.recapAnchor.getFullYear(), m, 1);
      const me = new Date(ui.recapAnchor.getFullYear(), m + 1, 0);
      labels.push(ms.toLocaleDateString('id-ID', { month: 'short' }));
      values.push(expenseOf(ms, me));
    }
    drawLineChart('recapTrendChart', labels, [{ data: values, color: '#dc2626', fill: true }]);
  }
}

function renderRecapInsights(inc, exp, cats, totalExp, count) {
  const el = document.getElementById('recapInsights');
  const items = [];
  if (count === 0) { el.innerHTML = '<div class="empty-state">Belum ada aktivitas untuk dianalisa.</div>'; return; }
  const net = inc - exp;
  items.push(`<div class="insight-item"><span class="insight-emoji">${net >= 0 ? '✅' : '⚠️'}</span><div>Arus kas periode ini <b>${net >= 0 ? 'surplus' : 'defisit'} ${rp(Math.abs(net))}</b> — pemasukan ${rp(inc)}, pengeluaran ${rp(exp)}.</div></div>`);
  if (cats.length) {
    const top = cats[0];
    const pct = totalExp ? (top.total / totalExp * 100).toFixed(0) : 0;
    items.push(`<div class="insight-item"><span class="insight-emoji">🏆</span><div>Pengeluaran terbesar di kategori <b>${escapeHtml(top.cat)}</b> sebesar <b>${rp(top.total)}</b> (${pct}% dari total).</div></div>`);
  }
  // avg per day for the period
  const { start, end } = periodRange(ui.recapPeriod, ui.recapAnchor);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  items.push(`<div class="insight-item"><span class="insight-emoji">📅</span><div>Rata-rata pengeluaran <b>${rp(exp / days)}</b> per hari selama periode ini.</div></div>`);
  if (inc > 0) {
    const rate = ((net) / inc * 100);
    items.push(`<div class="insight-item"><span class="insight-emoji">💰</span><div>Tingkat menabung Anda <b>${rate.toFixed(0)}%</b> dari pemasukan periode ini.</div></div>`);
  }
  el.innerHTML = items.join('');
}

/* ============================================================
   RENDER: DEBTS
   ============================================================ */
function renderDebtsPage() {
  const kind = ui.debtView;
  document.querySelectorAll('#debtSeg .seg-btn').forEach(t => t.classList.toggle('active', t.dataset.debt === kind));
  document.getElementById('addDebtTitle').textContent = kind === 'debt' ? 'Tambah Hutang Baru' : 'Tambah Piutang Baru';
  document.getElementById('debtPersonLabel').textContent = kind === 'debt' ? 'Nama Kreditur (yang meminjamkan ke Anda)' : 'Nama Debitur (yang berhutang ke Anda)';

  const list = state.debts.filter(d => d.kind === kind).sort((a,b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return (b.createdAt||0) - (a.createdAt||0);
  });
  const cont = document.getElementById('debtList');
  if (list.length === 0) { cont.innerHTML = `<div class="empty-state">${kind==='debt'?'Tidak ada hutang. 🎉':'Belum ada piutang.'}</div>`; return; }
  cont.innerHTML = list.map(d => {
    const isPaid = d.status === 'paid';
    const dLeft = daysUntil(d.due);
    const badges = [];
    if (isPaid) badges.push(`<span class="badge paid">Lunas ${fmtDateShort(d.paidDate)}</span>`);
    else {
      if (d.priority === 'high') badges.push('<span class="badge high">Prioritas Tinggi</span>');
      if (d.due) {
        if (dLeft < 0) badges.push(`<span class="badge overdue">Telat ${Math.abs(dLeft)} hari</span>`);
        else if (dLeft <= 7) badges.push(`<span class="badge due">${dLeft} hari lagi</span>`);
        else badges.push(`<span class="badge due">Tempo ${fmtDateShort(d.due)}</span>`);
      }
      if (d.interest && Number(d.interest) > 0) badges.push(`<span class="badge interest">${d.interest}%/bln</span>`);
    }
    const paidInfo = isPaid && d.paidAccountId ? `<div class="debt-progress-info">Via akun: ${escapeHtml((accountById(d.paidAccountId)||{name:'?'}).name)}</div>` : '';
    return `<div class="debt-card priority-${d.priority||'normal'} ${isPaid?'paid':''}">
      <div class="debt-top">
        <div><div class="debt-person">${escapeHtml(d.person)}</div><div class="debt-progress-info">Sejak ${fmtDate(d.date)}</div></div>
        <div class="debt-amount-big ${d.kind}">${rp(d.amount)}</div>
      </div>
      <div class="debt-badges">${badges.join('')}</div>
      ${d.note ? `<div class="debt-note">📝 ${escapeHtml(d.note)}</div>` : ''}
      ${paidInfo}
      <div class="debt-actions">
        ${!isPaid ? `<button class="debt-btn pay" data-pay="${d.id}">Tandai Lunas</button>` : ''}
        <button class="debt-btn edit" data-edit-debt="${d.id}">Edit</button>
        <button class="debt-btn delete" data-del-debt="${d.id}">Hapus</button>
      </div></div>`;
  }).join('');
}

/* ============================================================
   RENDER: ACCOUNTS
   ============================================================ */
function renderAccountsPage() {
  document.getElementById('totalAccountBalance').textContent = rp(cleanBalance());
  document.getElementById('totalAccountBalanceNet').textContent = rp(netBalance());
  const grid = document.getElementById('accountsGrid');
  if (state.accounts.length === 0) { grid.innerHTML = '<div class="empty-state">Belum ada akun. Tambahkan akun Anda di atas.</div>'; return; }
  grid.innerHTML = state.accounts.map(a => {
    const t = ACC_TYPE[a.type] || ACC_TYPE.other;
    return `<div class="account-card" style="--acc-color:${a.color||'#4f46e5'}">
      <div class="account-type-icon">${t.icon}</div>
      <div class="account-name">${escapeHtml(a.name)}</div>
      <div class="account-type-label">${t.label}</div>
      <div class="account-balance">${rp(a.balance)}</div>
      <div class="account-actions">
        <button class="edit" data-edit-acc="${a.id}">Edit</button>
        <button class="del" data-del-acc="${a.id}">Hapus</button>
      </div></div>`;
  }).join('');
}

/* ============================================================
   RENDER: BUDGET & GOALS
   ============================================================ */
function renderBudgetPage() {
  const [y, mo] = ui.budgetMonth.split('-');
  document.getElementById('budgetMonthLabel').textContent = new Date(y, mo-1).toLocaleDateString('id-ID', { month:'long', year:'numeric' });
  const catSel = document.getElementById('budgetCategory');
  if (catSel.options.length === 0) catSel.innerHTML = DEFAULT_CATEGORIES.expense.map(c => `<option value="${c}">${c}</option>`).join('');

  const monthBudgets = state.budgets.filter(b => b.month === ui.budgetMonth);
  const totalLimit = monthBudgets.reduce((s,b)=>s+Number(b.limit),0);
  const totalSpent = state.transactions.filter(t => t.type==='expense' && t.date.startsWith(ui.budgetMonth)).reduce((s,t)=>s+Number(t.amount),0);
  const pct = totalLimit>0 ? Math.min(100, totalSpent/totalLimit*100) : 0;
  const overCls = totalLimit>0 && totalSpent>totalLimit ? 'over' : (pct>80 ? 'warn' : '');
  document.getElementById('budgetOverview').innerHTML = `
    <div class="budget-overview-top">
      <div><div class="stat-label">Total Terpakai</div><div class="budget-big-num" style="color:${totalSpent>totalLimit&&totalLimit>0?'var(--danger)':'var(--ink)'}">${rp(totalSpent)}</div></div>
      <div style="text-align:right"><div class="stat-label">Total Anggaran</div><div class="budget-big-num">${rp(totalLimit)}</div></div>
    </div>
    <div class="progress-bar"><div class="progress-fill ${overCls}" style="width:${pct}%"></div></div>
    <div class="debt-progress-info" style="margin-top:8px">${totalLimit>0 ? (totalSpent>totalLimit?`⚠️ Melebihi anggaran ${rp(totalSpent-totalLimit)}`:`Sisa ${rp(totalLimit-totalSpent)}`) : 'Belum ada anggaran diatur untuk bulan ini.'}</div>`;

  const cont = document.getElementById('budgetList');
  if (monthBudgets.length === 0) cont.innerHTML = '<div class="empty-state">Belum ada anggaran untuk bulan ini.</div>';
  else cont.innerHTML = monthBudgets.map(b => {
    const spent = state.transactions.filter(t => t.type==='expense' && t.category===b.category && t.date.startsWith(ui.budgetMonth)).reduce((s,t)=>s+Number(t.amount),0);
    const p = b.limit>0 ? Math.min(100, spent/b.limit*100) : 0;
    const oc = spent>b.limit ? 'over' : (p>80?'warn':'');
    return `<div class="budget-item">
      <div class="budget-item-top"><span class="budget-item-cat">${escapeHtml(b.category)}</span><span class="budget-item-nums">${rp(spent)} / ${rp(b.limit)} <button class="budget-del" data-del-budget="${b.id}">🗑</button></span></div>
      <div class="progress-bar"><div class="progress-fill ${oc}" style="width:${p}%"></div></div></div>`;
  }).join('');

  const gc = document.getElementById('goalsList');
  if (state.goals.length === 0) gc.innerHTML = '<div class="empty-state">Belum ada tujuan tabungan.</div>';
  else gc.innerHTML = state.goals.map(g => {
    const p = g.target>0 ? Math.min(100, g.saved/g.target*100) : 0;
    const done = g.saved >= g.target && g.target > 0;
    return `<div class="goal-card">
      <div class="goal-top"><span class="goal-name">${done?'🏆 ':''}${escapeHtml(g.name)}</span><span class="badge ${done?'paid':'due'}">${Math.round(p)}%</span></div>
      <div class="progress-bar"><div class="progress-fill ${done?'':'warn'}" style="width:${p}%"></div></div>
      <div class="goal-nums"><span>${rp(g.saved)} / ${rp(g.target)}</span><span>${g.date?'Target: '+fmtDateShort(g.date):''}</span></div>
      <div class="goal-actions"><button class="edit" data-add-saving="${g.id}">Tambah Tabungan</button><button class="del" data-del-goal="${g.id}">Hapus</button></div></div>`;
  }).join('');
}

/* ============================================================
   RENDER ALL
   ============================================================ */
// Run a render step in isolation so one failure never blanks out the others.
function safeRender(label, fn) {
  try { fn(); }
  catch (e) { console.error('[FinTrack] Gagal merender "' + label + '":', e); }
}
function renderAll() {
  safeRender('dashboard', renderDashboard);
  safeRender('transactions', renderTransactionsPage);
  safeRender('recap', renderRecapPage);
  safeRender('debts', renderDebtsPage);
  safeRender('accounts', renderAccountsPage);
  safeRender('budget', renderBudgetPage);
  safeRender('account-dropdowns', refreshAccountDropdowns);
  save();
}
function refreshAccountDropdowns() {
  const opts = '<option value="">— Pilih Akun —</option>' + state.accounts.map(a => `<option value="${a.id}">${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${escapeHtml(a.name)} (${rp(a.balance)})</option>`).join('');
  ['qAccount','markPaidAccount'].forEach(id => { const el = document.getElementById(id); const prev = el.value; el.innerHTML = opts; el.value = prev; });
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
    if (!confirm(`Saldo ${acc.name} tidak cukup (${rp(acc.balance)}). Tetap lanjutkan?`)) return;
  }
  state.transactions.push({ id: uid(), type: ui.quickType, amount, category, accountId, date, note, createdAt: Date.now() });
  acc.balance = Number(acc.balance) + (ui.quickType === 'income' ? amount : -amount);
  save(); renderAll();
  document.getElementById('qAmount').value = ''; document.getElementById('qNote').value = ''; document.getElementById('qCategory').value = '';
  toast('Transaksi tersimpan ✓', 'success');
}
function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const acc = accountById(tx.accountId);
  if (acc) { const sign = TX_META[tx.type].sign; acc.balance = Number(acc.balance) + (sign==='+'?-tx.amount:tx.amount); }
  // if linked to a debt, reactivate it
  if (tx.linkedDebtId) { const d = state.debts.find(x => x.id === tx.linkedDebtId); if (d) { d.status = 'active'; delete d.paidDate; delete d.paidAccountId; } }
  state.transactions = state.transactions.filter(t => t.id !== id);
  save(); renderAll(); toast('Transaksi dihapus', 'success');
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
  state.debts.push({ id: uid(), kind, person, amount, date, due, interest, priority, note, status: 'active', createdAt: Date.now() });
  save(); renderAll();
  ['debtPerson','debtAmount','debtDue','debtInterest','debtNote'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('debtDate').value = todayStr();
  toast((kind==='debt'?'Hutang':'Piutang') + ' ditambahkan ✓', 'success');
}
function openMarkPaid(id) {
  const d = state.debts.find(x => x.id === id); if (!d) return;
  ui.markPaidTargetId = id;
  const isDebt = d.kind === 'debt';
  document.getElementById('markPaidTitle').textContent = isDebt ? 'Lunasi Hutang' : 'Terima Pembayaran Piutang';
  document.getElementById('markPaidDesc').innerHTML = `${isDebt?'Anda akan membayar hutang':'Anda akan menerima pembayaran piutang'} ${isDebt?'ke':'dari'} <b>${escapeHtml(d.person)}</b> sebesar <b>${rp(d.amount)}</b>. Pilih akun ${isDebt?'sumber uang keluar':'tujuan uang masuk'}:`;
  document.getElementById('markPaidDirection').textContent = isDebt ? 'keluar' : 'masuk';
  document.getElementById('markPaidDate').value = todayStr();
  document.getElementById('markPaidNote').value = '';
  document.getElementById('markPaidAccount').value = '';
  refreshAccountDropdowns();
  document.getElementById('markPaidModal').classList.add('show');
}
function confirmMarkPaid() {
  const d = state.debts.find(x => x.id === ui.markPaidTargetId); if (!d) return;
  const accountId = document.getElementById('markPaidAccount').value;
  const date = document.getElementById('markPaidDate').value || todayStr();
  const note = document.getElementById('markPaidNote').value.trim();
  if (!accountId) return toast('Pilih akun terlebih dahulu', 'error');
  const acc = accountById(accountId); const isDebt = d.kind === 'debt';
  if (isDebt && Number(acc.balance) < d.amount) { if (!confirm(`Saldo ${acc.name} tidak cukup (${rp(acc.balance)}). Tetap lanjutkan?`)) return; }
  const txType = isDebt ? 'debt_payment' : 'receivable_payment';
  state.transactions.push({ id: uid(), type: txType, amount: d.amount, category: isDebt?`Pelunasan hutang ke ${d.person}`:`Pelunasan piutang dari ${d.person}`, accountId, date, note: note || d.note || '', createdAt: Date.now(), linkedDebtId: d.id });
  acc.balance = Number(acc.balance) + (isDebt ? -d.amount : d.amount);
  d.status = 'paid'; d.paidDate = date; d.paidAccountId = accountId;
  save(); renderAll();
  document.getElementById('markPaidModal').classList.remove('show');
  toast(isDebt?'Hutang lunas & tercatat ✓':'Piutang diterima & tercatat ✓', 'success');
}
function openEditDebt(id) {
  const d = state.debts.find(x => x.id === id); if (!d) return;
  document.getElementById('editDebtId').value = id;
  document.getElementById('editDebtTitle').textContent = d.kind==='debt'?'Edit Hutang':'Edit Piutang';
  document.getElementById('editDebtPersonLabel').textContent = d.kind==='debt'?'Nama Kreditur':'Nama Debitur';
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
  const d = state.debts.find(x => x.id === id); if (!d) return;
  const person = document.getElementById('editDebtPerson').value.trim();
  const amount = Number(document.getElementById('editDebtAmount').value);
  if (!person) return toast('Nama tidak boleh kosong', 'error');
  if (!amount || amount <= 0) return toast('Jumlah tidak valid', 'error');
  d.person = person; d.amount = amount;
  d.date = document.getElementById('editDebtDate').value || d.date;
  d.due = document.getElementById('editDebtDue').value;
  d.interest = Number(document.getElementById('editDebtInterest').value) || 0;
  d.priority = document.getElementById('editDebtPriority').value;
  d.note = document.getElementById('editDebtNote').value.trim();
  save(); renderAll();
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
    const a = accountById(editId); a.name = name; a.type = type; a.balance = balance; a.color = color;
    document.getElementById('editAccountId').value = ''; document.getElementById('saveAccountBtn').textContent = 'Simpan Akun';
    toast('Akun diperbarui ✓', 'success');
  } else {
    state.accounts.push({ id: uid(), name, type, balance, color, createdAt: Date.now() });
    toast('Akun ditambahkan ✓', 'success');
  }
  save(); renderAll();
  ['accName','accBalance'].forEach(id => document.getElementById(id).value = '');
}
function editAccount(id) {
  const a = accountById(id); if (!a) return;
  document.getElementById('accName').value = a.name;
  document.getElementById('accType').value = a.type;
  document.getElementById('accBalance').value = a.balance;
  document.getElementById('accColor').value = a.color || '#4f46e5';
  document.getElementById('editAccountId').value = id;
  document.getElementById('saveAccountBtn').textContent = 'Simpan Perubahan';
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
  const existing = state.budgets.find(b => b.month===ui.budgetMonth && b.category===category);
  if (existing) existing.limit = limit; else state.budgets.push({ id: uid(), month: ui.budgetMonth, category, limit });
  save(); renderBudgetPage();
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
  save(); renderBudgetPage();
  ['goalName','goalTarget','goalSaved','goalDate'].forEach(id => document.getElementById(id).value = '');
  toast('Tujuan ditambahkan ✓', 'success');
}
function addSaving(id) {
  const g = state.goals.find(x => x.id === id); if (!g) return;
  const val = prompt(`Berapa yang ingin ditambahkan ke "${g.name}"? (Rp)`);
  if (val === null) return;
  const num = Number(val);
  if (!num || num <= 0) return toast('Jumlah tidak valid', 'error');
  g.saved = Number(g.saved) + num; save(); renderBudgetPage(); toast('Tabungan ditambahkan ✓', 'success');
}

/* ============================================================
   DELETE HANDLER
   ============================================================ */
let deleteAction = null;
function openDelete(msg, action) {
  document.getElementById('deleteMsg').textContent = msg;
  deleteAction = action;
  document.getElementById('deleteModal').classList.add('show');
}

/* ============================================================
   AI ASSISTANT — NLP parsing, commands, voice
   ============================================================ */
const NUM_WORDS = { 'nol':0,'satu':1,'dua':2,'tiga':3,'empat':4,'lima':5,'enam':6,'tujuh':7,'delapan':8,'sembilan':9,'sepuluh':10,'sebelas':11,'seratus':100,'seribu':1000 };

/* ============================================================
   AGENT TOOL LAYER — the ONLY way the agent mutates data.
   Every tool has typed params, validation, audit log, and
   idempotency. The LLM/NLP layer never touches state directly.
   ============================================================ */
const recentToolKeys = new Map();   // idempotency: key -> timestamp
const IDEMPOTENCY_WINDOW_MS = 4000; // ignore identical write within this window

function auditRecord(entry) {
  try {
    state.auditLog.push(Object.assign({ ts: Date.now() }, entry));
    // keep last 500 to bound storage
    if (state.auditLog.length > 500) state.auditLog = state.auditLog.slice(-500);
  } catch (e) { /* non-fatal */ }
}

function toolError(msg) { return { ok: false, error: msg }; }
function toolOk(data) { return Object.assign({ ok: true }, data); }

const AgentTools = {
  /* ---------- READ tools ---------- */
  get_accounts() { return toolOk({ accounts: state.accounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: Number(a.balance) })) }); },
  get_categories() { return toolOk({ expense: allExpenseCategories(), income: DEFAULT_CATEGORIES.income.slice() }); },
  get_balances() { return toolOk({ clean: cleanBalance(), net: netBalance(), debt: totalDebtActive(), receivable: totalReceivableActive() }); },
  get_debts(p = {}) {
    let list = state.debts.filter(d => d.kind === 'debt');
    if (p.status) list = list.filter(d => d.status === p.status);
    if (p.person) list = list.filter(d => d.person.toLowerCase().includes(String(p.person).toLowerCase()));
    return toolOk({ debts: list });
  },
  get_receivables(p = {}) {
    let list = state.debts.filter(d => d.kind === 'receivable');
    if (p.status) list = list.filter(d => d.status === p.status);
    if (p.person) list = list.filter(d => d.person.toLowerCase().includes(String(p.person).toLowerCase()));
    return toolOk({ receivables: list });
  },
  search_transactions(p = {}) {
    let list = state.transactions.slice();
    if (p.type) list = list.filter(t => t.type === p.type);
    if (p.category) list = list.filter(t => (t.category || '').toLowerCase() === String(p.category).toLowerCase());
    if (p.accountId) list = list.filter(t => t.accountId === p.accountId);
    if (p.month) list = list.filter(t => t.date.startsWith(p.month));
    if (p.query) list = list.filter(t => ((t.note || '') + ' ' + (t.category || '')).toLowerCase().includes(String(p.query).toLowerCase()));
    list.sort(sortByDateDesc);
    if (p.limit) list = list.slice(0, p.limit);
    return toolOk({ transactions: list });
  },

  /* ---------- WRITE tools ---------- */
  // Create one expense/income transaction on an account.
  create_transaction(p = {}) {
    const amount = Number(p.amount);
    if (!amount || amount <= 0) return toolError('Jumlah tidak valid');
    if (!['income', 'expense'].includes(p.type)) return toolError('Jenis transaksi tidak valid');
    const acc = accountById(p.accountId);
    if (!acc) return toolError('Akun tidak ditemukan');

    // idempotency guard
    const key = `tx|${p.type}|${amount}|${p.accountId}|${p.category}|${p.note || ''}`;
    const now = Date.now();
    if (recentToolKeys.has(key) && now - recentToolKeys.get(key) < IDEMPOTENCY_WINDOW_MS)
      return toolError('__duplicate__');
    recentToolKeys.set(key, now);

    const tx = { id: uid(), type: p.type, amount, category: p.category || 'Lainnya', accountId: acc.id, date: p.date || todayStr(), note: p.note || '', createdAt: now };
    if (p.merchant) tx.merchant = p.merchant;
    state.transactions.push(tx);
    acc.balance = Number(acc.balance) + (p.type === 'income' ? amount : -amount);
    auditRecord({ tool: 'create_transaction', params: { type: p.type, amount, accountId: acc.id, category: tx.category }, result: tx.id });
    return toolOk({ id: tx.id, balanceAfter: acc.balance });
  },

  // Transfer between two accounts (net worth unchanged).
  transfer(p = {}) {
    const amount = Number(p.amount);
    if (!amount || amount <= 0) return toolError('Jumlah tidak valid');
    const from = accountById(p.fromId), to = accountById(p.toId);
    if (!from || !to) return toolError('Akun tidak ditemukan');
    if (from.id === to.id) return toolError('Akun asal dan tujuan sama');
    const key = `tf|${amount}|${from.id}|${to.id}`;
    const now = Date.now();
    if (recentToolKeys.has(key) && now - recentToolKeys.get(key) < IDEMPOTENCY_WINDOW_MS) return toolError('__duplicate__');
    recentToolKeys.set(key, now);

    const date = p.date || todayStr();
    const outTx = { id: uid(), type: 'expense', amount, category: 'Transfer', accountId: from.id, date, note: `Transfer ke ${to.name}`, createdAt: now, transfer: true };
    const inTx = { id: uid(), type: 'income', amount, category: 'Transfer', accountId: to.id, date, note: `Transfer dari ${from.name}`, createdAt: now + 1, transfer: true, transferPair: outTx.id };
    outTx.transferPair = inTx.id;
    state.transactions.push(outTx, inTx);
    from.balance = Number(from.balance) - amount;
    to.balance = Number(to.balance) + amount;
    auditRecord({ tool: 'transfer', params: { amount, fromId: from.id, toId: to.id }, result: [outTx.id, inTx.id] });
    return toolOk({ fromBalance: from.balance, toBalance: to.balance });
  },

  // Create a debt (payable = you owe) or receivable (you are owed).
  create_debt(p = {}) {
    const amount = Number(p.amount);
    if (!amount || amount <= 0) return toolError('Jumlah tidak valid');
    if (!['debt', 'receivable'].includes(p.kind)) return toolError('Jenis tidak valid');
    if (!p.person || !String(p.person).trim()) return toolError('Nama orang wajib diisi');
    const key = `debt|${p.kind}|${amount}|${String(p.person).toLowerCase()}`;
    const now = Date.now();
    if (recentToolKeys.has(key) && now - recentToolKeys.get(key) < IDEMPOTENCY_WINDOW_MS) return toolError('__duplicate__');
    recentToolKeys.set(key, now);

    const d = { id: uid(), kind: p.kind, person: String(p.person).trim(), amount, date: p.date || todayStr(), due: p.due || '', interest: 0, priority: 'normal', note: p.note || '', status: 'active', createdAt: now };
    state.debts.push(d);
    auditRecord({ tool: 'create_debt', params: { kind: p.kind, amount, person: d.person }, result: d.id });
    return toolOk({ id: d.id });
  },

  // Record a (possibly partial) repayment against an existing active debt/receivable.
  record_payment(p = {}) {
    const amount = Number(p.amount);
    if (!amount || amount <= 0) return toolError('Jumlah tidak valid');
    const d = state.debts.find(x => x.id === p.debtId && x.status === 'active');
    if (!d) return toolError('Hutang/piutang tidak ditemukan');
    const acc = accountById(p.accountId);
    if (!acc) return toolError('Akun tidak ditemukan');
    const pay = Math.min(amount, Number(d.amount));
    const isDebt = d.kind === 'debt';

    const tx = { id: uid(), type: isDebt ? 'debt_payment' : 'receivable_payment', amount: pay,
      category: isDebt ? `Pelunasan hutang ke ${d.person}` : `Pelunasan piutang dari ${d.person}`,
      accountId: acc.id, date: p.date || todayStr(), note: p.note || '', createdAt: Date.now(), linkedDebtId: d.id };
    state.transactions.push(tx);
    acc.balance = Number(acc.balance) + (isDebt ? -pay : pay);
    d.amount = Number(d.amount) - pay;
    if (d.amount <= 0) { d.status = 'paid'; d.paidDate = tx.date; d.paidAccountId = acc.id; d.amount = 0; }
    auditRecord({ tool: 'record_payment', params: { debtId: d.id, amount: pay, accountId: acc.id }, result: tx.id });
    return toolOk({ remaining: d.amount, cleared: d.status === 'paid' });
  },

  // Update the most recent transaction (used for corrections).
  update_last_transaction(p = {}) {
    const tx = [...state.transactions].filter(t => !t.transfer).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!tx) return toolError('Tidak ada transaksi untuk diubah');
    const acc = accountById(tx.accountId);
    if ('amount' in p) {
      const newAmt = Number(p.amount);
      if (!newAmt || newAmt <= 0) return toolError('Jumlah tidak valid');
      if (acc) { // reverse old, apply new
        const sign = TX_META[tx.type].sign === '+' ? 1 : -1;
        acc.balance = Number(acc.balance) - sign * Number(tx.amount) + sign * newAmt;
      }
      tx.amount = newAmt;
    }
    if (p.category) tx.category = p.category;
    if (p.accountId && p.accountId !== tx.accountId) {
      const newAcc = accountById(p.accountId);
      if (newAcc && acc) {
        const sign = TX_META[tx.type].sign === '+' ? 1 : -1;
        acc.balance = Number(acc.balance) - sign * Number(tx.amount);
        newAcc.balance = Number(newAcc.balance) + sign * Number(tx.amount);
        tx.accountId = newAcc.id;
      }
    }
    auditRecord({ tool: 'update_last_transaction', params: p, result: tx.id });
    return toolOk({ id: tx.id });
  },

  // Delete the most recent transaction (reverses balance; reactivates linked debt).
  delete_last_transaction() {
    const tx = [...state.transactions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!tx) return toolError('Tidak ada transaksi untuk dihapus');
    deleteTransaction(tx.id);   // reuses existing safe deletion (handles balance + linked debt)
    auditRecord({ tool: 'delete_last_transaction', params: {}, result: tx.id });
    return toolOk({ id: tx.id });
  }
};

// Dispatch a tool with a uniform verify + audit wrapper.
function runTool(name, params) {
  const fn = AgentTools[name];
  if (!fn) return toolError('Tool tidak dikenal: ' + name);
  let res;
  try { res = fn(params || {}); }
  catch (e) { console.error('[FinTrack] tool error', name, e); return toolError('Terjadi kesalahan internal'); }
  return res;
}

// When the bot has parsed a transaction but is waiting for the user to pick an account
let pendingTx = null;   // { items:[...], isIncome:bool }

function openAssistant() {
  document.getElementById('assistant').classList.add('open');
  document.getElementById('assistantOverlay').classList.add('show');
  document.getElementById('assistantInput').focus();
  if (document.getElementById('assistantMessages').children.length === 0) greetAssistant();
}
function closeAssistant() {
  document.getElementById('assistant').classList.remove('open');
  document.getElementById('assistantOverlay').classList.remove('show');
  stopListening();
}
function greetAssistant() {
  botSay(`Halo! 👋 Saya ${botName()}, asisten keuangan Anda. Bicara natural saja — saya paham dan langsung bertindak:\n\n• Catat transaksi: "beli kopi 20rb" (bisa banyak sekaligus)\n• Transfer: "transfer 500rb dari BCA ke GoPay"\n• Hutang/piutang: "aku pinjam 1jt dari Budi", "Budi bayar 300rb"\n• Koreksi: "eh salah, harusnya 30rb" / "hapus transaksi tadi"\n• Analisis: "kenapa bulan ini boros?", "bandingkan bulan ini vs lalu"\n• Latih saya: "teazzi adalah minuman" 🧠\n\nTekan ⚙️ untuk nama & suara. Coba ketik atau ucapkan sesuatu!`, false);
  renderSuggestions(['beli kopi 20rb', 'kenapa bulan ini boros?', 'aku pinjam 1jt dari Budi', 'Berapa saldo saya?']);
}
function renderSuggestions(arr) {
  // items can be plain strings, or { label, account: id } for account-pick chips
  document.getElementById('assistantSuggestions').innerHTML = arr.map(s => {
    if (typeof s === 'string') return `<button class="suggestion-chip">${escapeHtml(s)}</button>`;
    if (s.account) return `<button class="suggestion-chip acc-chip" data-account="${escapeHtml(s.account)}">${escapeHtml(s.label)}</button>`;
    return `<button class="suggestion-chip">${escapeHtml(s.label)}</button>`;
  }).join('');
}
function addMessage(text, who, html) {
  const cont = document.getElementById('assistantMessages');
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  if (html) div.innerHTML = html; else div.textContent = text;
  cont.appendChild(div);
  cont.scrollTop = cont.scrollHeight;
  return div;
}
function botSay(text, speak, html) {
  addMessage(text, 'bot', html);
  if (speak !== false && state.settings.voiceReply) speakText(stripForSpeech(html ? text : text));
}
function showTyping() {
  const cont = document.getElementById('assistantMessages');
  const div = document.createElement('div');
  div.className = 'msg bot typing'; div.id = 'typingIndicator';
  div.innerHTML = '<span></span><span></span><span></span>';
  cont.appendChild(div); cont.scrollTop = cont.scrollHeight;
}
function hideTyping() { const t = document.getElementById('typingIndicator'); if (t) t.remove(); }

function handleUserMessage(text) {
  text = text.trim(); if (!text) return;
  addMessage(text, 'user');
  document.getElementById('assistantInput').value = '';
  showTyping();
  setTimeout(() => { hideTyping(); processCommand(text); }, 350);
}

/* ---- number parsing: "15rb", "15 ribu", "1.5jt", "20000" ---- */
function parseAmount(raw) {
  if (!raw) return null;
  let s = raw.toLowerCase().replace(/rp/g,'').trim();
  // handle jt/juta and rb/ribu/k
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(jt|juta|m)?\s*(rb|ribu|k)?/);
  if (!m) return null;
  let num = parseFloat(m[1].replace(',', '.'));
  if (isNaN(num)) return null;
  if (m[2]) num *= 1e6;            // juta
  else if (m[3]) num *= 1e3;       // ribu
  else {
    // plain number: if it had thousand separators like 15.000 → treat dots as thousands
    if (/^\d{1,3}(\.\d{3})+$/.test(raw.trim())) num = parseInt(raw.replace(/\./g,''), 10);
  }
  return Math.round(num);
}

function autoCategory(text, isIncome) {
  const low = ' ' + text.toLowerCase() + ' ';

  // 1) USER-TAUGHT TERMS take top priority (e.g. "teazzi" → "Minuman")
  let bestLearned = null, bestLearnedLen = 0;
  for (const [term, cat] of Object.entries(state.learnedTerms || {})) {
    if (!term) continue;
    const catIsIncome = isIncomeCategory(cat);
    if (isIncome === true && !catIsIncome) continue;
    if (isIncome === false && catIsIncome) continue;
    const re = new RegExp('(^|\\W)' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\W|$)', 'i');
    if (re.test(low) && term.length > bestLearnedLen) { bestLearned = cat; bestLearnedLen = term.length; }
  }
  if (bestLearned) return bestLearned;

  // 2) Built-in keyword map
  let best = null, bestScore = 0;
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const catIsIncome = DEFAULT_CATEGORIES.income.includes(cat);
    if (isIncome === true && !catIsIncome) continue;
    if (isIncome === false && catIsIncome) continue;
    for (const kw of kws) {
      const re = new RegExp('(^|\\W)' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\W|$)');
      if (re.test(low) && kw.length > bestScore) { best = cat; bestScore = kw.length; }
    }
  }
  return best || 'Lainnya';
}
function isIncomeCategory(cat) { return DEFAULT_CATEGORIES.income.includes(cat); }
// All expense categories = built-ins + user's custom ones
function allExpenseCategories() {
  return [...DEFAULT_CATEGORIES.expense.filter(c => c !== 'Lainnya'), ...(state.customCategories || []), 'Lainnya'];
}
// Normalize a category name the user typed (case-insensitive match to existing)
function normalizeCategory(input) {
  const t = input.trim();
  const all = [...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income, ...(state.customCategories || [])];
  const hit = all.find(c => c.toLowerCase() === t.toLowerCase());
  if (hit) return hit;
  // Title-case a new custom category
  return t.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/* ---- pick the best amount token from a segment ----
   Prefers tokens that carry a unit (rb/ribu/k/jt/juta) or thousand separators,
   so a leading list marker like "1 untuk ... 15rb" resolves to 15.000, not 1. */
function extractAmount(segment) {
  const re = /(rp\s*)?(\d[\d.,]*)\s*(jt|juta|m|rb|ribu|k)?/gi;
  let m, candidates = [];
  while ((m = re.exec(segment)) !== null) {
    if (!m[2]) continue;
    const token = m[0].trim();
    const hasUnit = !!m[3];
    const hasSep = /\d\.\d{3}/.test(m[2]) || /\d,\d{3}/.test(m[2]);
    const val = parseAmount(token);
    if (!val || val <= 0) continue;
    candidates.push({ token, val, hasUnit, hasSep, index: m.index });
  }
  if (candidates.length === 0) return null;
  // priority: unit > separator > largest value
  candidates.sort((a, b) => {
    if (a.hasUnit !== b.hasUnit) return a.hasUnit ? -1 : 1;
    if (a.hasSep !== b.hasSep) return a.hasSep ? -1 : 1;
    return b.val - a.val;
  });
  return candidates[0];
}

/* ---- parse multiple expense/income items from one sentence ---- */
function parseTransactions(text) {
  const low = ' ' + text.toLowerCase() + ' ';
  const isIncome = /(pemasukan|pendapatan|\bmasuk\b|terima|dapat|gajian|digaji|dibayar|income)/.test(low) && !/(keluar|pengeluaran|belanja|beli|spend)/.test(low);
  // remove intro words / labels
  let body = text.replace(/^\s*(hari ini|tadi|kemarin|barusan|catat(kan)?|tolong catat(kan)?|note)\s*/i, '');
  body = body.replace(/(pengeluaran|pemasukan|pendapatan)\s*(saya|ku|hari ini)?/gi, ' ');
  // split by separators; also split before "N." / "N)" list markers
  const segments = body.split(/[,;]|\bdan\b|\byaitu\b|\bterus\b|\blalu\b|\bkemudian\b|\n|(?=\s\d+\s*[\.\)]\s)/i)
    .map(s => s.trim()).filter(Boolean);
  const items = [];
  segments.forEach(seg => {
    // strip leading list markers "1.", "2)", "-", "•"
    let s = seg.replace(/^\s*\d+\s*[\.\)]\s*/, '').replace(/^[-•]\s*/, '').trim();
    const amt = extractAmount(s);
    if (!amt) return;
    // description = remaining text minus the amount token & filler words
    let desc = s.replace(amt.token, ' ')
      .replace(/\b(untuk|buat|bayar|beli|sebesar|sejumlah|senilai|utk|ke|dari|habis|abis|pakai|dari|di|sebanyak)\b/gi, ' ')
      .replace(/^\s*\d+\s+/, ' ')  // drop leftover leading list digit
      .replace(/\s+/g, ' ').trim();
    const category = autoCategory(desc || s, isIncome);
    items.push({ amount: amt.val, desc: desc || category, category, isIncome });
  });
  return { items, isIncome };
}

function pickDefaultAccount() {
  if (state.accounts.length === 0) return null;
  // prefer cash, else first
  return state.accounts.find(a => a.type === 'cash') || state.accounts[0];
}

/* ============================================================
   AGENT PIPELINE — Intent detection → Entity extraction →
   Confidence → Structured action. Deterministic, fast, free.
   ============================================================ */

// Intent priority order matters: more specific intents first.
function detectIntent(text) {
  const low = ' ' + text.toLowerCase().trim() + ' ';

  // corrections referencing a previous action
  if (/(salah|keliru|maksud(ku|nya)?|harusnya|seharusnya|bukan|ganti jadi|ubah jadi|koreksi|revisi|eh )/.test(low)
      && /(tadi|itu|terakhir|barusan|\d)/.test(low)) return { intent: 'correct_last', conf: 0.8 };
  if (/(hapus|batalkan|delete|buang).*(transaksi|tadi|terakhir|barusan|itu)/.test(low)
      || /^(hapus|batalkan) (yang )?(tadi|terakhir|barusan|itu)/.test(low.trim())) return { intent: 'delete_last', conf: 0.85 };

  // transfer between own accounts
  if (/(transfer|pindah(kan)?|mutasi|kirim).*(dari|ke).*(rekening|akun|bca|mandiri|gopay|ovo|dana|cash|tunai|bank|e-?wallet|dompet)/.test(low)
      || /\btransfer\b.*\bke\b/.test(low) || /\bpindah(kan)?\b.*\bke\b/.test(low)) return { intent: 'transfer', conf: 0.75 };

  // debt repayment / receivable collection (existing debt)
  if (/(bayar|lunasi|cicil|nyicil).*(hutang|utang)/.test(low)
      || /(bayar|lunasi).*(ke|kepada)\s+\w+/.test(low)) return { intent: 'pay_debt', conf: 0.7 };
  if (/(balikin|kembaliin|mengembalikan|bayar(in)?|lunasin|nyaur|nyicil).*(hutang(nya)?|piutang|pinjaman)/.test(low)
      || /\b(\w+)\s+(sudah|udah|udh)?\s*(bayar|balikin|kembaliin|lunas)/.test(low)) return { intent: 'collect_receivable', conf: 0.65 };

  // new debt / receivable
  if (/(aku|saya)\s+(pinjam|minjam|ngutang|hutang|utang)\s+(uang\s+)?(dari|ke|sama)\s+/.test(low)
      || /(pinjam|minjam)\s+(uang\s+)?(dari|ke|sama)\s+\w+/.test(low)) return { intent: 'new_debt', conf: 0.75 };
  if (/(aku|saya)\s+(hutangin|piutangin|minjemin|minjamin|pinjamin|talangin|bayarin|talangi)\s+/.test(low)
      || /(minjemin|minjamin|pinjamin|talangin|bayarin)\s+\w+/.test(low)) return { intent: 'new_receivable', conf: 0.7 };

  // analysis questions
  if (/(kenapa|mengapa|napa).*(boros|besar|naik|banyak|habis|turun)/.test(low)) return { intent: 'analyze_why', conf: 0.8 };
  if (/(bandingkan|banding|dibanding|compare|vs|versus)/.test(low)) return { intent: 'analyze_compare', conf: 0.8 };
  if (/(paling banyak|terbesar|boros|terbanyak).*(spend|keluar|habis|belanja|pengeluaran)|kategori.*(banyak|besar|terbesar)/.test(low)) return { intent: 'analyze_top', conf: 0.75 };
  if (/(analisa|analisis|pola|insight|kebiasaan|ringkas.*keuangan)/.test(low)) return { intent: 'analyze_overview', conf: 0.7 };

  // recap
  if (/(rekap|ringkas|laporan|summary|recap|rangkuman)/.test(low)) return { intent: 'recap', conf: 0.85 };

  // balance / debt / receivable questions
  if (/(saldo|uang saya|kekayaan|net worth|berapa uang|total uang)/.test(low)) return { intent: 'ask_balance', conf: 0.85 };
  // receivable check must come BEFORE debt: "siapa yang hutang ke aku", "piutang"
  if (/(piutang|yang berhutang (ke|sama) (aku|saya)|hutang (ke|sama) (aku|saya)|siapa.*(hutang|utang))/.test(low) && !/catat|tambah/.test(low)) return { intent: 'ask_receivable', conf: 0.72 };
  if (/(hutang|utang|pinjaman)/.test(low) && !/catat|bayar|tambah|pinjam|minjam/.test(low)) return { intent: 'ask_debt', conf: 0.75 };

  // teaching
  if (/(daftar|lihat|apa saja|list).*(pelajaran|istilah|kata)|apa.*(kamu|km).*(pelajari|ingat|hafal)/.test(low)) return { intent: 'list_learned', conf: 0.8 };
  if (/^(lupakan|hapus istilah|forget|buang istilah)\s+/.test(low.trim())) return { intent: 'forget_term', conf: 0.8 };

  // help
  if (/(bantuan|help|apa yang bisa|fitur|cara pakai|apa saja yang bisa)/.test(low)) return { intent: 'help', conf: 0.7 };

  // record transaction (has a money amount → likely a record)
  if (extractAmount(text)) return { intent: 'record_tx', conf: 0.6 };

  return { intent: 'unknown', conf: 0.2 };
}

// Extract a person name after common debt keywords.
function extractPerson(text) {
  const m = text.match(/\b(?:dari|ke|kepada|sama|si|buat)\s+([A-Z][\p{L}]+(?:\s+[A-Z][\p{L}]+)?)/u)
         || text.match(/\b(?:hutangin|piutangin|minjemin|minjamin|pinjamin|talangin|bayarin|pinjam|minjam)\s+(?:uang\s+)?(?:dari|ke|sama)?\s*([\p{L}]+)/iu)
         || text.match(/^([\p{L}]+)\s+(?:sudah|udah|udh|bayar|balikin|kembaliin|lunas)/iu);
  if (m) {
    let name = m[1].trim().replace(/\s+/g, ' ');
    // strip trailing filler
    name = name.replace(/\s+(uang|duit|sebesar|sejumlah).*$/i, '').trim();
    if (name && name.length >= 2 && !/^(uang|duit|dari|ke|sama)$/i.test(name)) {
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  return null;
}

// Find which of the user's accounts are mentioned in the text (for transfers).
function extractMentionedAccounts(text) {
  const low = text.toLowerCase();
  const hits = [];
  state.accounts.forEach(a => { if (low.includes(a.name.toLowerCase())) hits.push({ acc: a, at: low.indexOf(a.name.toLowerCase()) }); });
  // also type keywords
  const typeKw = [['cash', /\b(cash|tunai|kontan)\b/], ['bank', /\b(bank|rekening)\b/], ['ewallet', /\b(e-?wallet|dompet|dana|ovo|gopay|shopeepay)\b/]];
  typeKw.forEach(([type, re]) => { const m = low.match(re); if (m) { const a = state.accounts.find(x => x.type === type); if (a && !hits.some(h => h.acc.id === a.id)) hits.push({ acc: a, at: m.index }); } });
  return hits.sort((x, y) => x.at - y.at).map(h => h.acc);
}

// Find an active debt/receivable matching a person mentioned in text.
function findDebtByText(text, kind) {
  const person = extractPerson(text);
  const cands = state.debts.filter(d => d.kind === kind && d.status === 'active');
  if (person) { const hit = cands.find(d => d.person.toLowerCase().includes(person.toLowerCase()) || person.toLowerCase().includes(d.person.toLowerCase())); if (hit) return { debt: hit, person }; }
  // fallback: any name token matches
  const low = text.toLowerCase();
  const hit = cands.find(d => low.includes(d.person.toLowerCase()));
  return { debt: hit || null, person: person || (hit ? hit.person : null) };
}

/* ---- main command processor (agent router) ---- */
function processCommand(text) {
  const low = text.toLowerCase();

  // -1) Waiting for the user to pick an account for a pending transaction?
  if (pendingTx) {
    if (/(batal|cancel|gak jadi|ga jadi|nggak jadi|tidak jadi|stop)/.test(low)) {
      pendingTx = null;
      renderSuggestions(defaultSuggestions());
      return botSay('Oke, dibatalkan. Tidak ada yang saya catat. 👍', true);
    }
    const acc = resolveAccountFromText(text);
    if (acc) return commitTransactions(acc.id);
    botSay('Maaf, akun mana ya? Silakan pilih salah satu di bawah, atau sebut nama akunnya. 🙂', true);
    const chips = state.accounts.map(a => ({ label: `${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${a.name} · ${rp(a.balance)}`, account: a.id }));
    chips.push({ label: '✕ Batal' });
    renderSuggestions(chips);
    return;
  }

  // -0.5) Waiting for an account to record a debt/receivable payment?
  if (pendingPayment) {
    if (/(batal|cancel|gak jadi|ga jadi|tidak jadi|stop)/.test(low)) {
      pendingPayment = null; renderSuggestions(defaultSuggestions());
      return botSay('Oke, dibatalkan. 👍', true);
    }
    const acc = resolveAccountFromText(text);
    if (acc) { const c = pendingPayment.commit; pendingPayment = null; return c(acc.id); }
    botSay('Akun mana ya? Pilih di bawah atau sebut namanya. 🙂', true);
    const chips = state.accounts.map(a => ({ label: `${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${a.name} · ${rp(a.balance)}`, account: '__pay__' + a.id }));
    chips.push({ label: '✕ Batal' });
    renderSuggestions(chips);
    return;
  }

  // 0) TEACHING — check before intents so "teazzi adalah minuman" isn't a transaction
  const taught = parseTeaching(text);
  if (taught) return botLearnTerm(taught.term, taught.category);

  // ===== AGENT PIPELINE: intent detection → route to handler =====
  const { intent, conf } = detectIntent(text);
  auditRecord({ userMessage: text, intent, confidence: conf, phase: 'detect' });

  switch (intent) {
    case 'list_learned':   return botListLearned();
    case 'forget_term': {
      const f = text.match(/(?:lupakan|hapus istilah|forget|buang istilah)\s+["']?([\p{L}\p{N}\s]+?)["']?$/iu);
      return botForgetTerm(f ? f[1].trim() : text.replace(/^(lupakan|hapus istilah|forget|buang istilah)\s+/i, '').trim());
    }
    case 'delete_last':      return agentDeleteLast();
    case 'correct_last':     return agentCorrectLast(text);
    case 'transfer':         return agentTransfer(text);
    case 'new_debt':         return agentNewDebt(text, 'debt');
    case 'new_receivable':   return agentNewDebt(text, 'receivable');
    case 'pay_debt':         return agentPayDebt(text, 'debt');
    case 'collect_receivable': return agentPayDebt(text, 'receivable');
    case 'analyze_why':      return analyzeWhy();
    case 'analyze_compare':  return analyzeCompare();
    case 'analyze_top':      return analyzeTop();
    case 'analyze_overview': return analyzeOverview();
    case 'recap': {
      let period = 'month';
      if (/hari|harian|today|day/.test(low)) period = 'day';
      else if (/minggu|mingguan|pekan|week/.test(low)) period = 'week';
      else if (/tahun|tahunan|year/.test(low)) period = 'year';
      return botRecap(period);
    }
    case 'ask_balance': {
      const b = runTool('get_balances');
      return botSay(`Ringkasan saldo Anda:\n• Saldo likuid (murni): ${rp(b.clean)}\n• Kekayaan bersih (termasuk hutang & piutang): ${rp(b.net)}\n• Total hutang aktif: ${rp(b.debt)}\n• Total piutang aktif: ${rp(b.receivable)}`, true);
    }
    case 'ask_debt': {
      const debts = runTool('get_debts', { status: 'active' }).debts;
      if (!debts.length) return botSay('Anda tidak punya hutang aktif saat ini. 🎉', true);
      let msg = `Anda punya ${debts.length} hutang aktif, total ${rp(totalDebtActive())}:\n`;
      debts.forEach(d => { msg += `• ${d.person}: ${rp(d.amount)}${d.due ? ` (tempo ${fmtDateShort(d.due)})` : ''}\n`; });
      return botSay(msg, true);
    }
    case 'ask_receivable': {
      const recs = runTool('get_receivables', { status: 'active' }).receivables;
      if (!recs.length) return botSay('Tidak ada piutang aktif saat ini.', true);
      let msg = `${recs.length} orang masih berhutang ke Anda, total ${rp(totalReceivableActive())}:\n`;
      recs.forEach(d => { msg += `• ${d.person}: ${rp(d.amount)}\n`; });
      return botSay(msg, true);
    }
    case 'help':
      return botSay("Saya asisten keuangan Anda. Yang bisa saya lakukan:\n\n1. Catat transaksi — \"beli kopi 20rb\", atau beberapa sekaligus \"makan 30k, grab 25k\"\n2. Transfer — \"transfer 500rb dari BCA ke GoPay\"\n3. Hutang & piutang — \"aku pinjam 1jt dari Budi\", \"Budi bayar 300rb\"\n4. Koreksi — \"eh salah, harusnya 30rb\" atau \"hapus transaksi tadi\"\n5. Analisis — \"kenapa bulan ini boros?\", \"bandingkan bulan ini vs lalu\"\n6. Rekap & saldo — \"rekap mingguan\", \"berapa saldo saya?\"\n7. Latih saya — \"teazzi adalah minuman\"\n\nAnda juga bisa bicara lewat tombol mik 🎤.", false);
    case 'record_tx': {
      const { items, isIncome } = parseTransactions(text);
      if (items.length > 0) return botAddTransactions(items, isIncome);
      break; // fall through to chit-chat/fallback
    }
  }

  // Conversational / small talk
  if (chitChat(text)) return;

  // Low-confidence fallback — friendly, not a dead-end
  const tips = [
    `Hmm, saya belum yakin menangkap maksudnya. 🤔 Coba misalnya "beli kopi 20rb", "transfer 100rb dari BCA ke Cash", atau tanya "berapa saldo saya?"`,
    `Boleh diulang? Misalnya "catat 50rb belanja", "aku pinjam 1jt dari Budi", atau "kenapa bulan ini boros?" 😊`,
    `Saya di sini untuk bantu keuangan Anda — mencatat, transfer, hutang/piutang, koreksi, rekap, dan analisis. Coba sebutkan salah satu.`
  ];
  botSay(pick(tips), true);
}

/* ============================================================
   AGENT INTENT HANDLERS — transfer, debt/receivable, corrections
   ============================================================ */
let pendingPayment = null;   // { commit(accountId) } while awaiting account for a payment

function agentTransfer(text) {
  if (state.accounts.length < 2) return botSay('Untuk transfer, Anda perlu minimal 2 akun. Tambahkan akun dulu di menu "Akun & Saldo". 🙂', true);
  const amt = extractAmount(text);
  const accs = extractMentionedAccounts(text);
  if (!amt) return botSay('Berapa jumlah yang mau ditransfer? Contoh: "transfer 200rb dari BCA ke GoPay".', true);
  if (accs.length < 2) return botSay(`Transfer ${rp(amt.val)} dari akun mana ke akun mana? Sebutkan keduanya, contoh: "dari BCA ke GoPay".`, true);
  const [from, to] = accs;
  const res = runTool('transfer', { amount: amt.val, fromId: from.id, toId: to.id });
  if (!res.ok) { if (res.error === '__duplicate__') return; return botSay('Maaf, transfer gagal: ' + res.error, true); }
  save(); renderAll();
  const html = `<b>🔄 Transfer berhasil</b><div class="msg-table"><div class="msg-table-row"><span>${escapeHtml(from.name)} → ${escapeHtml(to.name)}</span><span>${rp(amt.val)}</span></div><div class="msg-table-row"><span>Sisa ${escapeHtml(from.name)}</span><span>${rp(res.fromBalance)}</span></div><div class="msg-table-row"><span>Sisa ${escapeHtml(to.name)}</span><span>${rp(res.toBalance)}</span></div></div>`;
  botSay(`Transfer ${rpSpeech(amt.val)} dari ${from.name} ke ${to.name} berhasil.`, false, html);
  if (state.settings.voiceReply) speakText(`Transfer ${rpSpeech(amt.val)} dari ${from.name} ke ${to.name} berhasil.`);
  renderSuggestions(defaultSuggestions());
}

function agentNewDebt(text, kind) {
  const amt = extractAmount(text);
  const person = extractPerson(text);
  if (!amt) return botSay(kind === 'debt' ? 'Berapa jumlah yang Anda pinjam? Contoh: "aku pinjam 1jt dari Budi".' : 'Berapa jumlah yang Anda pinjamkan? Contoh: "aku minjemin Budi 500rb".', true);
  if (!person) return botSay(kind === 'debt' ? `Anda pinjam ${rp(amt.val)} dari siapa?` : `Anda pinjamkan ${rp(amt.val)} ke siapa?`, true);
  const res = runTool('create_debt', { kind, amount: amt.val, person });
  if (!res.ok) { if (res.error === '__duplicate__') return; return botSay('Maaf, gagal mencatat: ' + res.error, true); }
  save(); renderAll();
  const label = kind === 'debt' ? 'Hutang' : 'Piutang';
  const line = kind === 'debt' ? `Anda berhutang ${rp(amt.val)} kepada ${person}` : `${person} berhutang ${rp(amt.val)} kepada Anda`;
  const html = `<b>🤝 ${label} tercatat</b><div class="msg-table"><div class="msg-table-row"><span>${escapeHtml(person)}</span><span>${rp(amt.val)}</span></div></div><div style="margin-top:6px;color:var(--muted);font-size:12px">${escapeHtml(line)}.</div>`;
  botSay(`${label} tercatat. ${line}.`, false, html);
  if (state.settings.voiceReply) speakText(`${label} tercatat. ${line}.`);
  renderSuggestions(['Hutang saya berapa?', 'Siapa yang hutang ke saya?', 'Rekap bulan ini']);
}

// Repayment (kind='debt') or collection (kind='receivable') against existing record.
function agentPayDebt(text, kind) {
  const amt = extractAmount(text);
  const { debt } = findDebtByText(text, kind);
  const activeList = state.debts.filter(d => d.kind === kind && d.status === 'active');
  if (activeList.length === 0) return botSay(kind === 'debt' ? 'Anda tidak punya hutang aktif untuk dibayar. 🎉' : 'Tidak ada piutang aktif untuk ditagih.', true);
  if (!debt) {
    const names = activeList.map(d => d.person).join(', ');
    return botSay(kind === 'debt' ? `Bayar hutang ke siapa? Yang aktif: ${names}.` : `Siapa yang membayar? Yang berhutang: ${names}.`, true);
  }
  if (!amt) return botSay(kind === 'debt' ? `Berapa yang dibayarkan ke ${debt.person}? (sisa ${rp(debt.amount)})` : `Berapa yang ${debt.person} bayarkan? (sisa ${rp(debt.amount)})`, true);
  if (state.accounts.length === 0) return botSay('Anda belum punya akun. Tambahkan dulu di menu "Akun & Saldo".', true);

  const payAmt = amt.val;
  const commit = (accId) => {
    const res = runTool('record_payment', { debtId: debt.id, amount: payAmt, accountId: accId });
    if (!res.ok) { if (res.error === '__duplicate__') return; return botSay('Maaf, gagal: ' + res.error, true); }
    save(); renderAll();
    const acc = accountById(accId);
    const verb = kind === 'debt' ? 'Anda membayar' : `${debt.person} membayar`;
    const remainTxt = res.cleared ? 'LUNAS 🎉' : `sisa ${rp(res.remaining)}`;
    const html = `<b>✅ Pembayaran tercatat</b><div class="msg-table"><div class="msg-table-row"><span>${escapeHtml(debt.person)}</span><span>${rp(payAmt)}</span></div><div class="msg-table-row total"><span>Status</span><span>${remainTxt}</span></div><div class="msg-table-row"><span>Via akun</span><span>${escapeHtml(acc.name)}</span></div></div>`;
    const speak = `${verb} ${rpSpeech(payAmt)}. ${res.cleared ? 'Sudah lunas.' : 'Sisa ' + rpSpeech(res.remaining) + '.'}`;
    botSay(speak, false, html);
    if (state.settings.voiceReply) speakText(speak);
    renderSuggestions(defaultSuggestions());
  };
  if (state.accounts.length === 1) return commit(state.accounts[0].id);
  pendingPayment = { commit };
  const dir = kind === 'debt' ? 'diambil dari' : 'masuk ke';
  botSay(`${rp(payAmt)} untuk ${debt.person}. Uang ${dir} akun mana?`, true);
  const chips = state.accounts.map(a => ({ label: `${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${a.name} · ${rp(a.balance)}`, account: '__pay__' + a.id }));
  chips.push({ label: '✕ Batal' });
  renderSuggestions(chips);
}

function agentDeleteLast() {
  const tx = [...state.transactions].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (!tx) return botSay('Belum ada transaksi yang bisa dihapus.', true);
  const desc = `${TX_META[tx.type].label} ${rp(tx.amount)}${tx.category ? ' · ' + tx.category : ''}`;
  const res = runTool('delete_last_transaction');
  if (!res.ok) return botSay('Maaf, gagal menghapus: ' + res.error, true);
  botSay(`Transaksi terakhir dihapus: ${desc}. Saldo sudah dikembalikan. 👍`, true);
  renderSuggestions(defaultSuggestions());
}

function agentCorrectLast(text) {
  const tx = [...state.transactions].filter(t => !t.transfer).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (!tx) return botSay('Belum ada transaksi untuk dikoreksi.', true);
  const amt = extractAmount(text);
  const newAccs = extractMentionedAccounts(text);
  const params = {};
  if (amt) params.amount = amt.val;
  if (newAccs.length) params.accountId = newAccs[0].id;
  const catM = text.match(/(?:harusnya|seharusnya|masuk(?:in|kan)?|kategori(?:nya)?|jadi)\s+([\p{L}\/&\s]+)$/iu);
  if (catM) { const c = normalizeCategory(catM[1].trim()); if (c) params.category = c; }
  if (!('amount' in params) && !params.accountId && !params.category)
    return botSay('Apa yang mau dikoreksi dari transaksi terakhir? Sebutkan jumlah, kategori, atau akun. Contoh: "harusnya 30rb".', true);
  const res = runTool('update_last_transaction', params);
  if (!res.ok) return botSay('Maaf, gagal mengoreksi: ' + res.error, true);
  save(); renderAll();
  const updated = state.transactions.find(t => t.id === res.id);
  const acc = accountById(updated.accountId);
  const html = `<b>✏️ Transaksi terakhir dikoreksi</b><div class="msg-table"><div class="msg-table-row"><span>${escapeHtml(updated.category)}${updated.note ? ' · ' + escapeHtml(updated.note) : ''}</span><span>${rp(updated.amount)}</span></div><div class="msg-table-row"><span>Akun</span><span>${escapeHtml(acc ? acc.name : '-')}</span></div></div>`;
  botSay('Sudah saya koreksi transaksi terakhir. 👍', false, html);
  if (state.settings.voiceReply) speakText('Sudah saya koreksi transaksi terakhir.');
  renderSuggestions(defaultSuggestions());
}

/* ============================================================
   FINANCIAL ANALYSIS — real numbers from the database only.
   Never fabricates figures.
   ============================================================ */
function monthExpense(mKey) { return monthlySum('expense', mKey) + monthlySum('debt_payment', mKey); }
function monthIncome(mKey) { return monthlySum('income', mKey) + monthlySum('receivable_payment', mKey); }

function analyzeTop() {
  const cats = categoryBreakdown(monthKey(new Date()), 'month');
  if (!cats.length) return botSay('Belum ada pengeluaran bulan ini, jadi belum ada yang bisa dianalisa. 🙂', true);
  const total = cats.reduce((s, c) => s + c.total, 0);
  const top = cats.slice(0, 5);
  let html = `<b>🏆 Kategori pengeluaran terbesar bulan ini</b><div class="msg-table">`;
  top.forEach((c, i) => { html += `<div class="msg-table-row"><span>${i+1}. ${escapeHtml(c.cat)}</span><span>${rp(c.total)} · ${Math.round(c.total/total*100)}%</span></div>`; });
  html += `<div class="msg-table-row total"><span>Total</span><span>${rp(total)}</span></div></div>`;
  const speak = `Pengeluaran terbesar bulan ini di ${cats[0].cat}, ${rpSpeech(cats[0].total)}, sekitar ${Math.round(cats[0].total/total*100)} persen dari total.`;
  botSay(speak, false, html);
  if (state.settings.voiceReply) speakText(speak);
  renderSuggestions(['Bandingkan dengan bulan lalu', 'Kenapa bulan ini boros?', 'Rekap bulan ini']);
}

function analyzeCompare() {
  const now = new Date();
  const curKey = monthKey(now);
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const curExp = monthExpense(curKey), prevExp = monthExpense(prevKey);
  const curInc = monthIncome(curKey), prevInc = monthIncome(prevKey);
  const diff = curExp - prevExp;
  const arrow = diff > 0 ? 'naik' : (diff < 0 ? 'turun' : 'sama');
  // category deltas
  const curCats = Object.fromEntries(categoryBreakdown(curKey, 'month').map(c => [c.cat, c.total]));
  const prevCats = Object.fromEntries(categoryBreakdown(prevKey, 'month').map(c => [c.cat, c.total]));
  const allCats = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);
  const deltas = [...allCats].map(c => ({ cat: c, delta: (curCats[c] || 0) - (prevCats[c] || 0) })).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
  let html = `<b>📊 Bulan ini vs bulan lalu</b><div class="msg-table">`;
  html += `<div class="msg-table-row"><span>Pengeluaran bulan ini</span><span>${rp(curExp)}</span></div>`;
  html += `<div class="msg-table-row"><span>Pengeluaran bulan lalu</span><span>${rp(prevExp)}</span></div>`;
  html += `<div class="msg-table-row total"><span>Selisih</span><span style="color:${diff>0?'var(--danger)':'var(--success)'}">${diff>0?'+':''}${rp(diff)} (${arrow})</span></div></div>`;
  if (deltas.length && deltas[0].delta !== 0) {
    html += `<div class="msg-table"><div style="font-weight:700;margin-bottom:4px">Perubahan terbesar per kategori:</div>`;
    deltas.forEach(d => { if (d.delta !== 0) html += `<div class="msg-table-row"><span>${escapeHtml(d.cat)}</span><span style="color:${d.delta>0?'var(--danger)':'var(--success)'}">${d.delta>0?'+':''}${rp(d.delta)}</span></div>`; });
    html += `</div>`;
  }
  const speak = `Pengeluaran bulan ini ${rpSpeech(curExp)}, ${arrow} ${rpSpeech(Math.abs(diff))} dibanding bulan lalu.`;
  botSay(speak, false, html);
  if (state.settings.voiceReply) speakText(speak);
  renderSuggestions(['Kategori terbesar apa?', 'Rekap bulan ini', 'Berapa saldo saya?']);
}

function analyzeWhy() {
  const now = new Date();
  const curKey = monthKey(now);
  const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const curExp = monthExpense(curKey), prevExp = monthExpense(prevKey);
  if (curExp === 0) return botSay('Belum ada pengeluaran tercatat bulan ini. 🙂', true);
  const diff = curExp - prevExp;
  const curCats = Object.fromEntries(categoryBreakdown(curKey, 'month').map(c => [c.cat, c.total]));
  const prevCats = Object.fromEntries(categoryBreakdown(prevKey, 'month').map(c => [c.cat, c.total]));
  const allCats = new Set([...Object.keys(curCats), ...Object.keys(prevCats)]);
  const risers = [...allCats].map(c => ({ cat: c, delta: (curCats[c] || 0) - (prevCats[c] || 0) })).filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3);

  let msg;
  if (prevExp === 0) {
    const top = categoryBreakdown(curKey, 'month').slice(0, 3);
    msg = `Bulan ini Anda mengeluarkan ${rp(curExp)}. Terbesar: ` + top.map(c => `${c.cat} (${rp(c.total)})`).join(', ') + '.';
  } else if (diff <= 0) {
    msg = `Kabar baik — bulan ini justru ${diff === 0 ? 'sama saja' : 'lebih hemat ' + rp(-diff)} dibanding bulan lalu (${rp(curExp)} vs ${rp(prevExp)}). 👍`;
  } else {
    msg = `Pengeluaran bulan ini ${rp(curExp)}, naik ${rp(diff)} dari bulan lalu (${rp(prevExp)}). `;
    if (risers.length) msg += 'Kenaikan terbesar dari: ' + risers.map(r => `${r.cat} (+${rp(r.delta)})`).join(', ') + '.';
  }
  botSay(msg, true);
  renderSuggestions(['Bandingkan detailnya', 'Kategori terbesar apa?', 'Rekap bulan ini']);
}

function analyzeOverview() {
  const now = new Date();
  const curKey = monthKey(now);
  const inc = monthIncome(curKey), exp = monthExpense(curKey);
  const net = inc - exp;
  const rate = inc > 0 ? Math.round(net / inc * 100) : 0;
  const cats = categoryBreakdown(curKey, 'month');
  const txCount = state.transactions.filter(t => t.date.startsWith(curKey)).length;
  let html = `<b>🧭 Ringkasan keuangan bulan ini</b><div class="msg-table">`;
  html += `<div class="msg-table-row"><span>Pemasukan</span><span style="color:var(--success)">${rp(inc)}</span></div>`;
  html += `<div class="msg-table-row"><span>Pengeluaran</span><span style="color:var(--danger)">${rp(exp)}</span></div>`;
  html += `<div class="msg-table-row total"><span>Arus kas bersih</span><span>${rp(net)}</span></div>`;
  html += `<div class="msg-table-row"><span>Tingkat menabung</span><span>${rate}%</span></div>`;
  html += `<div class="msg-table-row"><span>Jumlah transaksi</span><span>${txCount}</span></div></div>`;
  if (cats.length) html += `<div style="margin-top:6px;color:var(--muted);font-size:12px">Kategori terbesar: ${escapeHtml(cats[0].cat)} (${rp(cats[0].total)}).</div>`;
  const speak = `Bulan ini pemasukan ${rpSpeech(inc)}, pengeluaran ${rpSpeech(exp)}, arus kas bersih ${rpSpeech(net)}. Tingkat menabung ${rate} persen.`;
  botSay(speak, false, html);
  if (state.settings.voiceReply) speakText(speak);
  renderSuggestions(['Kenapa bulan ini boros?', 'Bandingkan dengan bulan lalu', 'Kategori terbesar apa?']);
}

/* ---- pick a random variant so replies don't feel robotic ---- */
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* ============================================================
   TRAINING — teach the bot custom term → category mappings
   ============================================================ */
// Recognizes patterns like:
//   "teazzi adalah minuman"           → term=teazzi, category=Minuman
//   "teazzi itu kategori minuman"
//   "teazzi termasuk minuman"
//   "kalau (beli) teazzi masukin ke minuman"
//   "anggap teazzi sebagai minuman"
function parseTeaching(text) {
  const t = text.trim();
  // Guard: don't treat sentences containing amounts as teaching
  if (/\d/.test(t) && /(rb|ribu|jt|juta|k\b|\d{3,})/i.test(t)) return null;

  const patterns = [
    /^(?:kalau|kalo|jika|klo)?\s*(?:beli|membeli)?\s*["']?([\p{L}\p{N}\s'.-]+?)["']?\s+(?:itu|adalah|termasuk|masuk(?:in|kan)?(?:\s+ke)?|sebagai|masuk\s+kategori|kategori(?:nya)?|anggap\s+sebagai)\s+(?:kategori\s+)?["']?([\p{L}\s'&\/-]+?)["']?$/iu,
    /^anggap\s+["']?([\p{L}\p{N}\s'.-]+?)["']?\s+(?:sebagai|itu|adalah)\s+(?:kategori\s+)?["']?([\p{L}\s'&\/-]+?)["']?$/iu
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      let term = m[1].trim().toLowerCase().replace(/\s+/g, ' ');
      let cat = normalizeCategory(m[2].trim());
      // strip common filler that shouldn't be a term
      if (!term || term.length < 2 || term.length > 40) return null;
      if (!cat || cat.length < 2) return null;
      // avoid capturing verbs as terms
      if (/^(saya|aku|ini|itu|dia|kamu)$/i.test(term)) return null;
      return { term, category: cat };
    }
  }
  return null;
}

function botLearnTerm(term, category) {
  const isNewCat = ![...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income, ...(state.customCategories||[])]
    .some(c => c.toLowerCase() === category.toLowerCase());
  if (isNewCat) {
    state.customCategories.push(category);
    refreshCategoryDropdown();
  }
  const existed = state.learnedTerms[term];
  state.learnedTerms[term] = category;
  save();
  const extra = isNewCat ? `\n\nSaya juga menambahkan "${category}" sebagai kategori baru.` : '';
  const verb = existed ? `Diperbarui! Sekarang` : `Siap, sudah saya catat!`;
  botSay(`${verb} setiap kali Anda menyebut "${term}", otomatis saya masukkan ke kategori ${category}. 🧠${extra}\n\nCoba ketik: "beli ${term} 20rb" — nanti saya kategorikan sendiri.`, true);
}

function botForgetTerm(term) {
  const key = Object.keys(state.learnedTerms).find(k => k.toLowerCase() === term.toLowerCase());
  if (!key) return botSay(`Saya belum pernah mempelajari istilah "${term}". 🤔`, true);
  const cat = state.learnedTerms[key];
  delete state.learnedTerms[key];
  save();
  botSay(`Oke, saya lupakan bahwa "${key}" itu kategori ${cat}. 👍`, true);
}

function botListLearned() {
  const entries = Object.entries(state.learnedTerms || {});
  if (entries.length === 0) {
    return botSay(`Saya belum mempelajari istilah khusus apa pun. 😊\n\nAjari saya dengan mengetik, misalnya:\n"teazzi adalah minuman"\n\nNanti setiap kali Anda menyebut "teazzi", saya otomatis masukkan ke kategori Minuman.`, false);
  }
  let html = `<b>🧠 ${entries.length} istilah yang sudah saya pelajari:</b><div class="msg-table">`;
  entries.forEach(([term, cat]) => { html += `<div class="msg-table-row"><span>"${escapeHtml(term)}"</span><span>${escapeHtml(cat)}</span></div>`; });
  html += `</div><div style="margin-top:6px;color:var(--muted);font-size:12px">Untuk menghapus: ketik "lupakan &lt;istilah&gt;".</div>`;
  botSay(`Berikut ${entries.length} istilah yang sudah saya pelajari.`, false, html);
}

/* ---- conversational layer: greetings, small talk, identity, thanks ---- */
function chitChat(text) {
  const low = ' ' + text.toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const name = botName();
  const hour = new Date().getHours();
  const greetTime = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  // Greeting (halo / hi / hey / pagi / assalamualaikum / calling the bot's name)
  if (/\b(halo|hallo|hai|hi|hey|hei|helo|woy|oi|p)\b/.test(low)
      || low.includes(name.toLowerCase())
      || /\b(pagi|siang|sore|malam)\b/.test(low)
      || /assalam/.test(low)) {
    return botSay(pick([
      `${greetTime}! 👋 Saya ${name}, siap membantu keuangan Anda. Ada yang bisa saya bantu hari ini?`,
      `Halo juga! 😊 ${name} di sini. Mau catat transaksi, lihat rekap, atau cek saldo?`,
      `Hai! Senang Anda menyapa. Ada yang ingin dicatat atau ditanyakan soal keuangan Anda?`
    ]), true), true;
  }

  // How are you
  if (/(apa kabar|gimana kabar|how are you|kabarnya|sehat)/.test(low)) {
    return botSay(pick([
      `Saya baik, terima kasih sudah bertanya! 😄 Yang penting keuangan Anda juga sehat. Mau saya bantu cek rekap hari ini?`,
      `Selalu semangat membantu Anda! 💪 Bagaimana dengan Anda? Ada pengeluaran yang mau dicatat?`
    ]), true), true;
  }

  // Identity / who are you / your name
  if (/(siapa kamu|siapa km|kamu siapa|nama kamu|namamu|kamu ini apa|who are you|kenalan)/.test(low)) {
    return botSay(`Saya ${name}, asisten keuangan pribadi Anda di FinTrack. 😊 Saya bisa mencatat pemasukan & pengeluaran, memberi rekap harian sampai tahunan, dan menjawab pertanyaan soal saldo, hutang, atau piutang Anda. Anda bisa ketik atau bicara langsung ke saya.`, true), true;
  }

  // What can you do
  if (/(bisa apa|kemampuan|fungsi kamu|kegunaan)/.test(low)) {
    return botSay(`Banyak yang bisa saya bantu! 💡\n• Mencatat transaksi ("catat 20rb kopi")\n• Rekap keuangan ("rekap bulan ini")\n• Cek saldo ("berapa saldo saya?")\n• Info hutang & piutang\n\nCukup katakan saja, saya yang urus.`, true), true;
  }

  // Thanks
  if (/(makasih|terima kasih|thanks|thank you|thx|tengkyu|mksh|nuhun|suwun)/.test(low)) {
    return botSay(pick([
      `Sama-sama! 😊 Senang bisa membantu. Kalau ada lagi, panggil saja saya.`,
      `Dengan senang hati! 🙌 Semoga keuangan Anda makin teratur ya.`,
      `Kapan saja, itu tugas saya. 😄`
    ]), true), true;
  }

  // Goodbye
  if (/(bye|dadah|dah|sampai jumpa|udahan|selesai|makasih ya)/.test(low)) {
    return botSay(pick([
      `Sampai jumpa lagi! 👋 Jangan lupa catat pengeluaran hari ini ya.`,
      `Oke, saya tunggu kapan pun Anda butuh. Semangat! 😊`
    ]), true), true;
  }

  // Praise / affirmation
  if (/(hebat|keren|pintar|pinter|bagus|mantap|good|nice|top)\b/.test(low)) {
    return botSay(pick([`Terima kasih! 😄 Saya akan terus berusaha membantu Anda sebaik mungkin.`, `Senang mendengarnya! 🙌 Ada lagi yang bisa saya bantu?`]), true), true;
  }

  // Yes/OK short affirmations → gently prompt
  if (/^(ya|iya|oke|ok|baik|siap|lanjut|boleh)$/.test(text.toLowerCase().trim())) {
    return botSay(`Siap! 😊 Silakan katakan apa yang ingin Anda catat atau tanyakan.`, true), true;
  }

  return false; // not chit-chat → let caller run fallback
}

function botAddTransactions(items, isIncome) {
  if (state.accounts.length === 0) {
    return botSay('Anda belum punya akun. Silakan tambahkan akun dulu di menu "Akun & Saldo", lalu saya bisa mencatat transaksi Anda. 😊', true);
  }
  // Only one account? No need to ask — record straight away.
  if (state.accounts.length === 1) {
    return commitTransactions(state.accounts[0].id, items, isIncome);
  }
  // Otherwise, ask which account to use, showing balances.
  pendingTx = { items, isIncome };
  const total = items.reduce((s, it) => s + it.amount, 0);
  const kindTxt = isIncome ? 'pemasukan' : 'pengeluaran';
  const dir = isIncome ? 'masuk ke' : 'diambil dari';

  // summary of the parsed items
  let html = `<b>Siap mencatat ${items.length} ${kindTxt}</b> (total ${rp(total)}):<div class="msg-table">`;
  items.forEach(it => { html += `<div class="msg-table-row"><span>${escapeHtml(it.desc)} <i style="color:var(--faint)">· ${escapeHtml(it.category)}</i></span><span>${rp(it.amount)}</span></div>`; });
  html += `</div><div style="margin-top:8px">Uang ini ${dir} akun mana?</div>`;
  botSay(`Siap mencatat ${items.length} ${kindTxt}, total ${rpSpeech(total)}. Uang ini ${dir} akun mana?`, false, html);
  if (state.settings.voiceReply) speakText(`Baik. Uang ini ${dir} akun mana?`);

  // account chips with live balances
  const chips = state.accounts.map(a => ({
    label: `${(ACC_TYPE[a.type]||ACC_TYPE.other).icon} ${a.name} · ${rp(a.balance)}`,
    account: a.id
  }));
  chips.push({ label: '✕ Batal' });
  renderSuggestions(chips);
}

// Commit the pending (or given) transactions to a chosen account
function commitTransactions(accountId, items, isIncome) {
  if (!items && pendingTx) { items = pendingTx.items; isIncome = pendingTx.isIncome; }
  pendingTx = null;
  const acc = accountById(accountId);
  if (!acc || !items) { renderSuggestions(defaultSuggestions()); return; }

  let total = 0;
  const rows = [];
  let dupCount = 0;
  items.forEach(it => {
    const type = isIncome ? 'income' : 'expense';
    let category = it.category;
    if (isIncome && !isIncomeCategory(category)) category = 'Lainnya';
    // Route through the idempotent, audited tool.
    const res = runTool('create_transaction', { type, amount: it.amount, category, accountId: acc.id, note: it.desc, merchant: it.merchant });
    if (!res.ok) { if (res.error === '__duplicate__') dupCount++; return; }
    total += it.amount;
    rows.push({ desc: it.desc, category, amount: it.amount });
  });
  save(); renderAll();

  if (rows.length === 0) {
    renderSuggestions(defaultSuggestions());
    return botSay(dupCount ? 'Sepertinya transaksi itu baru saja tercatat, jadi tidak saya duplikasi. 🙂' : 'Tidak ada transaksi yang tercatat.', true);
  }

  const kindTxt = isIncome ? 'pemasukan' : 'pengeluaran';
  let html = `<b>✅ ${rows.length} ${kindTxt} tercatat</b> (akun: ${escapeHtml(acc.name)})<div class="msg-table">`;
  rows.forEach(r => { html += `<div class="msg-table-row"><span>${escapeHtml(r.desc)} <i style="color:var(--faint)">· ${escapeHtml(r.category)}</i></span><span>${rp(r.amount)}</span></div>`; });
  html += `<div class="msg-table-row total"><span>Total</span><span>${rp(total)}</span></div>`;
  html += `<div class="msg-table-row"><span>Sisa saldo ${escapeHtml(acc.name)}</span><span>${rp(acc.balance)}</span></div></div>`;
  const speak = `${rows.length} ${kindTxt} berhasil dicatat di ${acc.name}, total ${rpSpeech(total)}. Sisa saldo ${acc.name} ${rpSpeech(acc.balance)}.`;
  botSay(speak, false, html);
  if (state.settings.voiceReply) speakText(speak);
  renderSuggestions(defaultSuggestions());
}

function defaultSuggestions() { return ['Rekap hari ini', 'Berapa saldo saya?', 'Rekap bulan ini']; }

// Try to resolve a typed/spoken reply into one of the user's accounts.
function resolveAccountFromText(text) {
  const low = text.toLowerCase().trim();
  // exact / contains match on account name
  let hit = state.accounts.find(a => low === a.name.toLowerCase());
  if (!hit) hit = state.accounts.find(a => low.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(low));
  // match by type keyword (bank, cash/tunai, ewallet/e-wallet/dompet)
  if (!hit) {
    if (/(cash|tunai|kontan)/.test(low)) hit = state.accounts.find(a => a.type === 'cash');
    else if (/(bank|rekening)/.test(low)) hit = state.accounts.find(a => a.type === 'bank');
    else if (/(wallet|e-wallet|ewallet|dompet|dana|ovo|gopay|shopeepay)/.test(low)) hit = state.accounts.find(a => a.type === 'ewallet');
  }
  // match by order number "1", "2", ...
  if (!hit) { const n = parseInt(low, 10); if (n >= 1 && n <= state.accounts.length) hit = state.accounts[n - 1]; }
  return hit || null;
}

function botRecap(period) {
  const oldP = ui.recapPeriod, oldA = ui.recapAnchor;
  ui.recapPeriod = period; ui.recapAnchor = new Date();
  const { start, end, label } = periodRange(period, ui.recapAnchor);
  const list = state.transactions.filter(t => inRange(t.date, start, end));
  let inc = 0, exp = 0;
  list.forEach(t => { TX_META[t.type].sign === '+' ? inc += Number(t.amount) : exp += Number(t.amount); });
  const cats = categoryBreakdown(ui.recapAnchor, period);
  const periodName = { day:'hari ini', week:'minggu ini', month:'bulan ini', year:'tahun ini' }[period];

  let html = `<b>📊 Rekap ${escapeHtml(period==='day'?'Harian':period==='week'?'Mingguan':period==='month'?'Bulanan':'Tahunan')}</b><br><span style="color:var(--muted);font-size:12px">${escapeHtml(label)}</span><div class="msg-table">`;
  html += `<div class="msg-table-row"><span>Pemasukan</span><span style="color:var(--success)">${rp(inc)}</span></div>`;
  html += `<div class="msg-table-row"><span>Pengeluaran</span><span style="color:var(--danger)">${rp(exp)}</span></div>`;
  html += `<div class="msg-table-row total"><span>Selisih</span><span>${rp(inc-exp)}</span></div></div>`;
  if (cats.length) {
    html += `<div class="msg-table"><div style="font-weight:700;margin-bottom:4px">Top kategori pengeluaran:</div>`;
    cats.slice(0,3).forEach((c,i) => { html += `<div class="msg-table-row"><span>${i+1}. ${escapeHtml(c.cat)}</span><span>${rp(c.total)}</span></div>`; });
    html += `</div>`;
  }
  html += `<div style="margin-top:8px"><span class="link" data-page="recap">Buka halaman Rekap untuk grafik lengkap →</span></div>`;

  let speak = `Rekap ${periodName}. Pemasukan ${rpSpeech(inc)}, pengeluaran ${rpSpeech(exp)}, selisih ${rpSpeech(inc-exp)}.`;
  if (cats.length) speak += ` Pengeluaran terbesar di ${cats[0].cat} sebesar ${rpSpeech(cats[0].total)}.`;
  if (list.length === 0) { const empty = `Belum ada transaksi ${periodName}.`; botSay(empty, true); }
  else botSay(speak, false, html);
  if (list.length > 0 && state.settings.voiceReply) speakText(speak);

  // keep recap page synced to what was asked
  renderRecapPage();
  renderSuggestions(['Rekap harian', 'Rekap mingguan', 'Rekap tahunan', 'Berapa saldo saya?']);
}

/* ---- speech helpers ---- */
function rpSpeech(n) {
  n = Math.round(Math.abs(Number(n)||0));
  return (n<0?'minus ':'') + n.toLocaleString('id-ID') + ' rupiah';
}
function stripForSpeech(t) { return String(t).replace(/[•*#_>]/g,'').replace(/\n+/g,'. '); }

/* ============================================================
   VOICE — Web Speech API (recognition + synthesis)
   Tuned for a natural, human-sounding delivery.
   ============================================================ */
let recognition = null, isListening = false;
let allVoices = [];        // all voices available in the browser
let selectedVoice = null;  // the chosen voice object
// --- patient listening state ---
let silenceTimer = null;           // fires after the user stays quiet
let voiceFinalTranscript = '';     // accumulated finalized speech during a session
let manualStop = false;            // true when the user taps the mic to stop
const SILENCE_MS = 3000;           // wait 3s of silence before responding

// Names that indicate high-quality / neural / natural voices per platform
const GOOD_VOICE_HINTS = ['natural','neural','online','google','microsoft','premium','enhanced','wavenet','journey','damayanti','andika','arif','gadis'];

// Detect mobile — Web Speech behaves very differently there.
const IS_MOBILE = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent || '');
let restartAttempts = 0;             // guard against rapid restart loops on mobile
let lastSpeechAt = 0;                // timestamp of last recognized speech

function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    recognition = new SR();
    recognition.lang = 'id-ID';
    // On mobile, continuous mode is unreliable (engine stops after each phrase).
    // We keep it non-continuous there and rebuild continuity via smart restart.
    recognition.continuous = !IS_MOBILE;
    recognition.interimResults = true;   // needed to show live feedback & detect speech
    recognition.maxAlternatives = 3;     // more candidates → better accuracy

    recognition.onstart = () => {
      isListening = true; manualStop = false;
      restartAttempts = 0;
      document.getElementById('micBtn').classList.add('listening');
      setStatus(IS_MOBILE ? 'Mendengarkan… bicara sekarang' : 'Mendengarkan… (bicara santai, saya menunggu)');
    };

    recognition.onspeechstart = () => { lastSpeechAt = Date.now(); };

    recognition.onresult = (e) => {
      lastSpeechAt = Date.now();
      restartAttempts = 0; // real speech arrived → reset restart guard
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          // choose the best non-empty alternative
          let chosen = res[0].transcript;
          for (let a = 0; a < res.length; a++) { if (res[a].transcript && res[a].transcript.trim()) { chosen = res[a].transcript; break; } }
          voiceFinalTranscript += chosen + ' ';
        } else {
          interim += res[0].transcript;
        }
      }
      const preview = (voiceFinalTranscript + interim).trim();
      if (preview) setStatus('Saya dengar: "' + (preview.length > 40 ? preview.slice(0, 40) + '…' : preview) + '"');
      scheduleSilenceFinalize();
    };

    recognition.onerror = (e) => {
      // Non-fatal errors on mobile — keep going.
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'network') { setStatus('Koneksi lemah, mencoba lagi…'); return; }
      clearTimeout(silenceTimer);
      isListening = false;
      document.getElementById('micBtn').classList.remove('listening'); setStatus('Siap membantu');
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        botSay('Sepertinya izin mikrofon belum aktif. 🎤\n\nDi HP: buka pengaturan situs di browser (ikon 🔒 di address bar) → izinkan Mikrofon, lalu coba lagi. Pastikan juga membuka lewat HTTPS.', false);
      }
    };

    recognition.onend = () => {
      // If the user didn't tap stop and we're still supposed to listen,
      // restart the engine (with a small guard to avoid tight loops on mobile).
      if (isListening && !manualStop) {
        const quietFor = Date.now() - lastSpeechAt;
        // If they've been silent past the threshold, finalize instead of restarting.
        if (lastSpeechAt && quietFor >= SILENCE_MS) { finalizeVoiceInput(false); return; }
        if (restartAttempts < 8) {
          restartAttempts++;
          setTimeout(() => { try { recognition.start(); } catch (e) {} }, IS_MOBILE ? 250 : 100);
          return;
        }
      }
      isListening = false; clearTimeout(silenceTimer);
      document.getElementById('micBtn').classList.remove('listening'); setStatus('Siap membantu');
    };
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function scoreVoice(v) {
  // Higher = more natural / more preferred. Prioritise Indonesian, then quality hints.
  let score = 0;
  const name = (v.name || '').toLowerCase();
  const lang = (v.lang || '').toLowerCase();
  if (/id[-_]?id/.test(lang) || /indonesia/.test(name)) score += 100;
  else if (lang.startsWith('id')) score += 80;
  else if (lang.startsWith('en')) score += 10; // fallback readable
  GOOD_VOICE_HINTS.forEach(h => { if (name.includes(h)) score += 12; });
  if (name.includes('natural') || name.includes('neural') || name.includes('wavenet')) score += 25;
  if (v.localService === false) score += 8; // cloud voices usually higher quality
  // de-prioritise obviously robotic built-ins
  if (name.includes('espeak') || name.includes('compact')) score -= 30;
  return score;
}

function loadVoices() {
  allVoices = (speechSynthesis.getVoices() || []).slice();
  // pick user-selected voice if still available, else the best-scoring one
  if (state.settings.voiceURI) {
    selectedVoice = allVoices.find(v => v.voiceURI === state.settings.voiceURI) || null;
  }
  if (!selectedVoice && allVoices.length) {
    selectedVoice = allVoices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
  }
  populateVoiceSelect();
}

function populateVoiceSelect() {
  const sel = document.getElementById('voiceSelect');
  if (!sel) return;
  // sort: Indonesian & high-quality first
  const sorted = allVoices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a));
  sel.innerHTML = '<option value="">Otomatis (pilih terbaik)</option>' + sorted.map(v => {
    const flag = /id/i.test(v.lang) ? '🇮🇩 ' : '';
    const quality = GOOD_VOICE_HINTS.some(h => (v.name||'').toLowerCase().includes(h)) ? ' ⭐' : '';
    return `<option value="${escapeHtml(v.voiceURI)}">${flag}${escapeHtml(v.name)} (${escapeHtml(v.lang)})${quality}</option>`;
  }).join('');
  sel.value = state.settings.voiceURI || '';
}

function toggleListening() {
  if (!recognition) { botSay('Maaf, browser Anda belum mendukung input suara. Coba gunakan Google Chrome terbaru (atau Safari di iPhone). Anda tetap bisa mengetik dengan nyaman. 🙂', false); return; }
  if (isListening) { finalizeVoiceInput(true); return; }   // tapping mic while active = finish now
  // Starting fresh: stop any ongoing TTS so the mic doesn't hear the bot itself.
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) {} }
  voiceFinalTranscript = '';
  manualStop = false;
  restartAttempts = 0;
  lastSpeechAt = 0;
  try { recognition.start(); }
  catch (e) {
    // Some engines throw if start() is called too soon after a previous stop.
    setTimeout(() => { try { recognition.start(); } catch (e2) {} }, 300);
  }
}
function stopListening() {
  manualStop = true;
  clearTimeout(silenceTimer);
  if (recognition && isListening) { try { recognition.stop(); } catch(e){} }
  isListening = false;
  const mic = document.getElementById('micBtn'); if (mic) mic.classList.remove('listening');
}

// After the user goes quiet for SILENCE_MS, treat their speech as complete.
function scheduleSilenceFinalize() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => finalizeVoiceInput(true), SILENCE_MS);
}

// Send whatever was captured, then stop the mic. `byUser` = user tapped stop.
function finalizeVoiceInput(byUser) {
  clearTimeout(silenceTimer);
  const text = voiceFinalTranscript.trim();
  manualStop = true;
  if (recognition) { try { recognition.stop(); } catch (e) {} }
  isListening = false;
  const mic = document.getElementById('micBtn'); if (mic) mic.classList.remove('listening');
  setStatus('Siap membantu');
  voiceFinalTranscript = '';
  if (text) handleUserMessage(text);
}

/* Split text into natural clauses so the synthesizer breathes between them
   instead of reading one long flat monotone line. */
function splitSpeechChunks(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?,:;])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function speakText(text) {
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function' || !state.settings.voiceReply) return;
  try { speechSynthesis.cancel(); } catch (e) {}
  if (!selectedVoice) loadVoices();
  const rate = Number(state.settings.rate) || 0.98;
  const pitch = Number(state.settings.pitch) || 1.0;
  try {
    const chunks = splitSpeechChunks(text);
    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (selectedVoice) { u.voice = selectedVoice; u.lang = selectedVoice.lang; }
      else u.lang = 'id-ID';
      // slight, human-like variation in pace & pitch per clause
      u.rate = Math.max(0.6, Math.min(1.4, rate + (i % 2 === 0 ? 0 : -0.02)));
      u.pitch = Math.max(0.5, Math.min(1.5, pitch + (Math.sin(i) * 0.03)));
      u.volume = 1;
      speechSynthesis.speak(u);
    });
  } catch (e) { console.error('[FinTrack] speak gagal:', e); }
}

/* ---- Theme (light / dark) ---- */
function applyTheme() {
  const dark = state.settings.theme === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.textContent = dark ? '☀️' : '🌙';
  const btn = document.getElementById('themeToggle');
  if (btn) btn.title = dark ? 'Beralih ke tema terang' : 'Beralih ke tema gelap';
}
function toggleTheme() {
  state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
  save();
  applyTheme();
  // redraw charts so their text/colors match the new theme
  safeRender('dashboard-charts', renderDashboardCharts);
  safeRender('recap', renderRecapPage);
}

function setStatus(s) { document.getElementById('assistantStatus').textContent = s; }
function updateVoiceToggle() {
  const btn = document.getElementById('voiceReplyToggle');
  btn.textContent = state.settings.voiceReply ? '🔊' : '🔇';
  btn.classList.toggle('muted', !state.settings.voiceReply);
  btn.title = state.settings.voiceReply ? 'Balasan suara: AKTIF' : 'Balasan suara: MATI';
}

/* ---- Bot name + settings panel ---- */
function botName() { return (state.settings.botName || 'FinBot').trim() || 'FinBot'; }
function applyBotIdentity() {
  const name = botName();
  const nameEl = document.getElementById('assistantNameLabel');
  if (nameEl) nameEl.textContent = name;
  const avatar = document.getElementById('assistantAvatar');
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
  const launch = document.querySelector('#assistantLaunch .al-text strong');
  if (launch) launch.textContent = name;
}
function openBotSettings() {
  document.getElementById('botNameInput').value = state.settings.botName || '';
  document.getElementById('rateSlider').value = state.settings.rate || 0.98;
  document.getElementById('pitchSlider').value = state.settings.pitch || 1.0;
  document.getElementById('rateValue').textContent = (Number(state.settings.rate)||0.98).toFixed(2) + '×';
  document.getElementById('pitchValue').textContent = (Number(state.settings.pitch)||1.0).toFixed(2);
  populateVoiceSelect();
  document.getElementById('assistantSettings').classList.toggle('open');
}
function saveBotSettings() {
  const name = document.getElementById('botNameInput').value.trim();
  state.settings.botName = name || 'FinBot';
  state.settings.voiceURI = document.getElementById('voiceSelect').value;
  state.settings.rate = Number(document.getElementById('rateSlider').value);
  state.settings.pitch = Number(document.getElementById('pitchSlider').value);
  selectedVoice = state.settings.voiceURI ? (allVoices.find(v => v.voiceURI === state.settings.voiceURI) || selectedVoice) : allVoices.slice().sort((a,b)=>scoreVoice(b)-scoreVoice(a))[0];
  save();
  applyBotIdentity();
  document.getElementById('assistantSettings').classList.remove('open');
  toast('Pengaturan asisten disimpan ✓', 'success');
  botSay(`Baik, mulai sekarang panggil saya ${botName()}. Ada yang bisa saya bantu? 😊`, true);
}

/* ============================================================
   INIT / EVENT WIRING
   ============================================================ */
function init() {
  load();
  document.getElementById('qDate').value = todayStr();
  document.getElementById('debtDate').value = todayStr();
  const now = new Date();
  const dstr = now.toLocaleDateString('id-ID', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('todayBadge').textContent = dstr;
  document.getElementById('sidebarDate').textContent = '📅 ' + dstr;
  refreshCategoryDropdown();
  updateVoiceToggle();
  applyBotIdentity();
  applyTheme();
  initSpeech();

  // Navigation (event delegation for dynamic [data-page] too)
  document.body.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-page]');
    if (nav) { e.preventDefault(); goToPage(nav.dataset.page); if (document.getElementById('assistant').classList.contains('open') && window.innerWidth < 768) closeAssistant(); }
  });

  document.getElementById('menuBtn').addEventListener('click', openSidebar);
  document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
  document.getElementById('overlay').addEventListener('click', closeSidebar);
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Quick add tabs
  document.querySelectorAll('.qtab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.qtab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active'); ui.quickType = tab.dataset.type; refreshCategoryDropdown();
  }));
  document.getElementById('qAddBtn').addEventListener('click', addQuickTransaction);

  // Transaction filters
  ['txFilterMonth','txFilterType','txFilterAccount'].forEach(id => document.getElementById(id).addEventListener('change', applyTxFilter));
  document.getElementById('txFullList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-tx]');
    if (btn) openDelete('Hapus transaksi ini? Saldo akun akan disesuaikan kembali.', () => deleteTransaction(btn.dataset.delTx));
  });

  // Recap controls
  document.querySelectorAll('#recapPeriodSeg .seg-btn').forEach(b => b.addEventListener('click', () => { ui.recapPeriod = b.dataset.period; ui.recapAnchor = new Date(); renderRecapPage(); }));
  document.getElementById('recapPrev').addEventListener('click', () => shiftRecap(-1));
  document.getElementById('recapNext').addEventListener('click', () => shiftRecap(1));

  // Debt
  document.querySelectorAll('#debtSeg .seg-btn').forEach(tab => tab.addEventListener('click', () => { ui.debtView = tab.dataset.debt; renderDebtsPage(); }));
  document.getElementById('addDebtBtn').addEventListener('click', addDebt);
  document.getElementById('debtList').addEventListener('click', (e) => {
    const pay = e.target.closest('[data-pay]'), edit = e.target.closest('[data-edit-debt]'), del = e.target.closest('[data-del-debt]');
    if (pay) openMarkPaid(pay.dataset.pay);
    else if (edit) openEditDebt(edit.dataset.editDebt);
    else if (del) openDelete('Hapus catatan hutang/piutang ini secara permanen?', () => { state.debts = state.debts.filter(x => x.id !== del.dataset.delDebt); save(); renderAll(); toast('Data dihapus', 'success'); });
  });
  document.getElementById('confirmMarkPaid').addEventListener('click', confirmMarkPaid);
  document.getElementById('cancelMarkPaid').addEventListener('click', () => document.getElementById('markPaidModal').classList.remove('show'));
  document.getElementById('closeMarkPaid').addEventListener('click', () => document.getElementById('markPaidModal').classList.remove('show'));
  document.getElementById('confirmEditDebt').addEventListener('click', confirmEditDebt);
  document.getElementById('cancelEditDebt').addEventListener('click', () => document.getElementById('editDebtModal').classList.remove('show'));
  document.getElementById('closeEditDebt').addEventListener('click', () => document.getElementById('editDebtModal').classList.remove('show'));

  // Accounts
  document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);
  document.getElementById('accountsGrid').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit-acc]'), del = e.target.closest('[data-del-acc]');
    if (edit) editAccount(edit.dataset.editAcc);
    else if (del) {
      const id = del.dataset.delAcc;
      const hasTx = state.transactions.some(t => t.accountId === id);
      openDelete(hasTx ? 'Akun ini punya riwayat transaksi. Hapus akun? (Transaksi tetap tersimpan tanpa label akun)' : 'Hapus akun ini?', () => { state.accounts = state.accounts.filter(a => a.id !== id); save(); renderAll(); toast('Akun dihapus', 'success'); });
    }
  });

  // Budget & goals
  document.getElementById('saveBudgetBtn').addEventListener('click', saveBudget);
  document.getElementById('budgetPrevMonth').addEventListener('click', () => shiftBudgetMonth(-1));
  document.getElementById('budgetNextMonth').addEventListener('click', () => shiftBudgetMonth(1));
  document.getElementById('budgetList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del-budget]');
    if (del) { state.budgets = state.budgets.filter(b => b.id !== del.dataset.delBudget); save(); renderBudgetPage(); toast('Anggaran dihapus', 'success'); }
  });
  document.getElementById('addGoalBtn').addEventListener('click', addGoal);
  document.getElementById('goalsList').addEventListener('click', (e) => {
    const addS = e.target.closest('[data-add-saving]'), del = e.target.closest('[data-del-goal]');
    if (addS) addSaving(addS.dataset.addSaving);
    else if (del) openDelete('Hapus tujuan tabungan ini?', () => { state.goals = state.goals.filter(g => g.id !== del.dataset.delGoal); save(); renderBudgetPage(); toast('Tujuan dihapus', 'success'); });
  });

  // Delete modal
  document.getElementById('confirmDelete').addEventListener('click', () => { if (deleteAction) deleteAction(); deleteAction = null; document.getElementById('deleteModal').classList.remove('show'); });
  document.getElementById('cancelDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('show'));
  document.getElementById('closeDelete').addEventListener('click', () => document.getElementById('deleteModal').classList.remove('show'));

  // Collapsible forms
  ['addDebt','addAccount','addBudget','addGoal'].forEach(p => setupCollapse(p + 'Header', p + 'Body'));

  // Modal overlay click-close
  document.querySelectorAll('.modal-overlay').forEach(ov => ov.addEventListener('click', (e) => { if (e.target === ov) ov.classList.remove('show'); }));

  // AI Assistant
  document.getElementById('assistantLaunch').addEventListener('click', openAssistant);
  document.getElementById('topbarAiBtn').addEventListener('click', openAssistant);
  document.getElementById('assistantClose').addEventListener('click', closeAssistant);
  document.getElementById('assistantBack').addEventListener('click', () => { closeAssistant(); goToPage('dashboard'); });
  document.getElementById('assistantOverlay').addEventListener('click', closeAssistant);
  document.getElementById('assistantSend').addEventListener('click', () => handleUserMessage(document.getElementById('assistantInput').value));
  document.getElementById('assistantInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleUserMessage(e.target.value); });
  document.getElementById('micBtn').addEventListener('click', toggleListening);
  document.getElementById('voiceReplyToggle').addEventListener('click', () => { state.settings.voiceReply = !state.settings.voiceReply; save(); updateVoiceToggle(); if (!state.settings.voiceReply && 'speechSynthesis' in window) speechSynthesis.cancel(); });
  document.getElementById('assistantSuggestions').addEventListener('click', (e) => {
    const chip = e.target.closest('.suggestion-chip');
    if (!chip) return;
    // Guard against double-processing the same click (event can re-fire when the
    // container is re-rendered mid-handler).
    if (chip.dataset.handled === '1') return;
    chip.dataset.handled = '1';
    const accData = chip.dataset.account || '';
    // Payment account-pick chip (debt/receivable) → commit via pendingPayment
    if (accData.startsWith('__pay__') && pendingPayment) {
      const id = accData.slice(7);
      const acc = accountById(id);
      addMessage(acc ? acc.name : chip.textContent, 'user');
      renderSuggestions([]);
      const c = pendingPayment.commit; pendingPayment = null;
      return c(id);
    }
    // Account-pick chip → commit the pending transaction to that account
    if (accData && !accData.startsWith('__pay__') && pendingTx) {
      const acc = accountById(accData);
      addMessage(acc ? acc.name : chip.textContent, 'user');
      renderSuggestions([]);
      return commitTransactions(accData);
    }
    // "Batal" chip while something is pending
    if ((pendingTx || pendingPayment) && /batal/i.test(chip.textContent)) {
      addMessage(chip.textContent, 'user');
      pendingTx = null; pendingPayment = null; renderSuggestions(defaultSuggestions());
      return botSay('Oke, dibatalkan. Tidak ada yang saya catat. 👍', true);
    }
    handleUserMessage(chip.textContent);
  });

  // Assistant settings (name + voice)
  document.getElementById('assistantSettingsBtn').addEventListener('click', openBotSettings);
  document.getElementById('saveBotSettings').addEventListener('click', saveBotSettings);
  document.getElementById('rateSlider').addEventListener('input', (e) => { document.getElementById('rateValue').textContent = Number(e.target.value).toFixed(2) + '×'; });
  document.getElementById('pitchSlider').addEventListener('input', (e) => { document.getElementById('pitchValue').textContent = Number(e.target.value).toFixed(2); });
  document.getElementById('voiceSelect').addEventListener('change', (e) => { selectedVoice = allVoices.find(v => v.voiceURI === e.target.value) || selectedVoice; });
  document.getElementById('testVoiceBtn').addEventListener('click', () => {
    // apply current (unsaved) slider/voice values for the preview
    const prevRate = state.settings.rate, prevPitch = state.settings.pitch, prevReply = state.settings.voiceReply;
    state.settings.rate = Number(document.getElementById('rateSlider').value);
    state.settings.pitch = Number(document.getElementById('pitchSlider').value);
    state.settings.voiceReply = true;
    selectedVoice = allVoices.find(v => v.voiceURI === document.getElementById('voiceSelect').value) || selectedVoice;
    const testName = document.getElementById('botNameInput').value.trim() || botName();
    speakText(`Halo, saya ${testName}. Beginilah suara saya membacakan laporan keuangan Anda.`);
    state.settings.rate = prevRate; state.settings.pitch = prevPitch; state.settings.voiceReply = prevReply;
  });

  // Re-render charts on resize
  let rzTimer;
  window.addEventListener('resize', () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { renderDashboardCharts(); renderRecapPage(); }, 200); });

  renderAll();
}

function setupCollapse(headerId, bodyId) {
  const header = document.getElementById(headerId), body = document.getElementById(bodyId);
  const btn = header.querySelector('.toggle-form-btn');
  header.addEventListener('click', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    body.classList.toggle('collapsed');
    if (btn) btn.style.transform = body.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0)';
  });
}
function shiftBudgetMonth(delta) { const [y,m] = ui.budgetMonth.split('-').map(Number); ui.budgetMonth = monthKey(new Date(y, m-1+delta, 1)); renderBudgetPage(); }
function shiftRecap(delta) {
  const a = new Date(ui.recapAnchor);
  if (ui.recapPeriod === 'day') a.setDate(a.getDate() + delta);
  else if (ui.recapPeriod === 'week') a.setDate(a.getDate() + delta * 7);
  else if (ui.recapPeriod === 'month') a.setMonth(a.getMonth() + delta);
  else a.setFullYear(a.getFullYear() + delta);
  ui.recapAnchor = a; renderRecapPage();
}

document.addEventListener('DOMContentLoaded', init);
