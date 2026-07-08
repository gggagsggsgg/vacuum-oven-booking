// ===== 真空干燥箱预约系统（云数据版 · Supabase 直连）=====
// 预置实验室共享配置（如需更换，可在网页右上角「设置」内覆盖）
const DEFAULT_URL = 'https://utlkvouckmcmjvjasvdh.supabase.co';
const DEFAULT_KEY = 'sb_publishable_8hEMG-giGCO9_v79KhlyDg_4npHcZEd';
const LS_URL = 'vo_supabase_url';
const LS_KEY = 'vo_supabase_key';
let supabase = null;
let bookings = [];

const $ = (id) => document.getElementById(id);

// 给 Promise 加超时，避免连不上时一直“转圈/无反应”
function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

// ---- 配置加载 ----
function loadConfig() {
  const url = localStorage.getItem(LS_URL) || DEFAULT_URL;
  const key = localStorage.getItem(LS_KEY) || DEFAULT_KEY;
  if (url && key) {
    supabase = window.supabase.createClient(url, key);
    return true;
  }
  return false;
}

// ---- 初始化 ----
async function init() {
  setTodayDate();
  defaultTimes();
  await loadBookings();
  setInterval(loadBookings, 30000);
}

async function loadBookings() {
  if (!supabase) return;
  try {
    const { data, error } = await withTimeout(
      supabase.from('bookings').select('*').order('start_time', { ascending: true }),
      8000, '连接数据库超时（很可能是网络无法访问 supabase.co）'
    );
    if (error) { showFormMsg('加载失败：' + error.message, 'err'); return; }
    bookings = data || [];
    renderTimeline();
    renderList();
  } catch (e) {
    showFormMsg('加载失败：' + e.message, 'err');
  }
}

// ---- 工具函数 ----
function setTodayDate() {
  $('todayDate').textContent = new Date().toLocaleDateString('zh-CN',
    { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}
function defaultTimes() {
  const now = new Date();
  const later = new Date(now.getTime() + 2 * 3600 * 1000);
  $('start').value = toLocalInput(now);
  $('end').value = toLocalInput(later);
}
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmt(dt) {
  return new Date(dt).toLocaleString('zh-CN',
    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function overlaps(aS, aE, bS, bE) { return aS < bE && aE > bS; }
function statusOf(start, end) {
  const now = new Date();
  if (end <= now) return 'done';
  if (start <= now && now < end) return 'active';
  return 'upcoming';
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 今日时间轴 ----
function renderTimeline() {
  const tl = $('timeline');
  tl.innerHTML = '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayStart = today.getTime(), dayEnd = tomorrow.getTime(), span = dayEnd - dayStart;

  for (let h = 0; h <= 24; h += 2) {
    const lbl = document.createElement('div');
    lbl.className = 'tl-hour';
    lbl.style.top = (h / 24 * 100) + '%';
    lbl.textContent = String(h).padStart(2, '0') + ':00';
    tl.appendChild(lbl);
  }

  const todayBk = bookings.filter(b => {
    const s = new Date(b.start_time), e = new Date(b.end_time);
    return e > today && s < tomorrow;
  });

  if (todayBk.length === 0) {
    const em = document.createElement('div');
    em.className = 'tl-empty'; em.textContent = '今日暂无预约';
    tl.appendChild(em);
    return;
  }

  // 横向分车道，避免重叠块互相遮挡
  const lanes = [];
  todayBk.forEach(b => {
    const s = new Date(b.start_time).getTime(), e = new Date(b.end_time).getTime();
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] <= s) { b._lane = i; lanes[i] = e; placed = true; break; }
    }
    if (!placed) { b._lane = lanes.length; lanes.push(e); }
  });
  const laneCount = Math.max(lanes.length, 1);

  todayBk.forEach(b => {
    const s = new Date(b.start_time), e = new Date(b.end_time);
    const clipS = Math.max(s.getTime(), dayStart);
    const clipE = Math.min(e.getTime(), dayEnd);
    const top = (clipS - dayStart) / span * 100;
    const height = Math.max((clipE - clipS) / span * 100, 2.5);
    const block = document.createElement('div');
    block.className = 'tl-block status-' + statusOf(s, e);
    block.style.top = top + '%';
    block.style.height = height + '%';
    block.style.left = (b._lane / laneCount * 100 + 1) + '%';
    block.style.width = (100 / laneCount - 2) + '%';
    block.innerHTML = `<strong>${escapeHtml(b.name)}</strong><span>${fmt(b.start_time)}–${fmt(b.end_time)}</span>`;
    tl.appendChild(block);
  });
}

// ---- 预约列表 ----
function renderList() {
  const ul = $('bookingList');
  ul.innerHTML = '';
  if (bookings.length === 0) { ul.innerHTML = '<li class="muted">暂无预约记录</li>'; return; }
  bookings.forEach(b => {
    const s = new Date(b.start_time), e = new Date(b.end_time);
    const st = statusOf(s, e);
    const li = document.createElement('li');
    li.className = 'bk status-' + st;
    li.innerHTML = `
      <div class="bk-main">
        <span class="bk-name">${escapeHtml(b.name)}</span>
        <span class="bk-time">${fmt(b.start_time)} → ${fmt(b.end_time)}</span>
        <span class="bk-purpose">${escapeHtml(b.purpose || '')}</span>
      </div>
      <div class="bk-side">
        <span class="badge badge-${st}">${st === 'active' ? '进行中' : st === 'done' ? '已结束' : '待开始'}</span>
        <button class="del-btn" data-id="${b.id}">取消</button>
      </div>`;
    ul.appendChild(li);
  });
  ul.querySelectorAll('.del-btn').forEach(btn => {
    btn.onclick = () => cancelBooking(btn.dataset.id);
  });
}

// ---- 取消预约 ----
async function cancelBooking(id) {
  if (!confirm('确定取消该预约？')) return;
  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) { alert('取消失败：' + error.message); return; }
  await loadBookings();
}

// ---- 提交预约（绑定到按钮 onclick，避免原生表单提交刷新页面）----
function submitBooking() {
  if (!supabase) return showFormMsg('数据库未连接，请刷新页面后重试', 'err');

  const btn = $('submitBtn');
  const oldText = btn.textContent;
  const restoreBtn = () => { btn.disabled = false; btn.textContent = oldText; };
  btn.disabled = true;
  btn.textContent = '提交中…';

  const name = $('name').value.trim();
  const start = new Date($('start').value);
  const end = new Date($('end').value);
  const purpose = $('purpose').value.trim();

  if (!name) { showFormMsg('请填写申请人', 'err'); return restoreBtn(); }
  if (isNaN(start) || isNaN(end)) { showFormMsg('时间格式错误', 'err'); return restoreBtn(); }
  if (start >= end) { showFormMsg('结束时间必须晚于开始时间', 'err'); return restoreBtn(); }
  if (start < new Date()) { showFormMsg('不能预约过去的时间', 'err'); return restoreBtn(); }

  const conflict = bookings.find(b => overlaps(start, end, new Date(b.start_time), new Date(b.end_time)));
  if (conflict) {
    showFormMsg(`时间冲突！与 ${conflict.name} 的 ${fmt(conflict.start_time)}–${fmt(conflict.end_time)} 重叠`, 'err');
    return restoreBtn();
  }

  withTimeout(
    supabase.from('bookings').insert({ name, start_time: start.toISOString(), end_time: end.toISOString(), purpose }),
    8000, '提交超时，很可能是网络无法访问数据库服务器（supabase.co）'
  ).then(({ error }) => {
    if (error) return showFormMsg('提交失败：' + error.message, 'err');
    showFormMsg('预约成功 ✓', 'ok');
    $('purpose').value = '';   // 只清空用途，保留申请人/时间方便连续预约
    loadBookings();
  }).catch(err => showFormMsg('提交失败：' + err.message, 'err'))
    .finally(restoreBtn);
}

function showFormMsg(t, type) {
  const m = $('formMsg');
  m.textContent = t; m.className = 'form-msg ' + (type || '');
  setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 5000);
}

// ---- 绑定 UI 事件（等 DOM 就绪后执行，确保元素已存在）----
function bindUI() {
  try {
    // 若 supabase 组件未加载（如本地库被缓存拦截），明确提示，避免点击无反应
    if (typeof window.supabase === 'undefined') {
      const b = $('configBanner');
      b.classList.remove('hidden');
      b.textContent = '⚠️ 数据库组件未能加载（请尝试强制刷新 Ctrl+Shift+R），若仍出现请告知。';
      return;
    }

    $('settingsBtn').onclick = () => $('settingsModal').classList.remove('hidden');
    $('closeSettings').onclick = () => $('settingsModal').classList.add('hidden');
    $('saveSettings').onclick = () => {
      try {
        const url = $('supaUrl').value.trim();
        const key = $('supaKey').value.trim();
        if (!url || !key) { alert('请填写完整'); return; }
        localStorage.setItem(LS_URL, url);
        localStorage.setItem(LS_KEY, key);
        supabase = window.supabase.createClient(url, key);
        $('settingsModal').classList.add('hidden');
        $('configBanner').classList.add('hidden');
        init();
      } catch (e) {
        showFormMsg('设置保存失败：' + e.message, 'err');
      }
    };

    // 关键修复：提交按钮改为 type=button，点击不会触发原生表单提交
    $('submitBtn').onclick = submitBooking;
    // 保险：即便在输入框按回车触发表单 submit，也拦截掉
    $('bookingForm').addEventListener('submit', (e) => e.preventDefault());

    // 检查预置配置或本地存储配置
    const hasConfig = loadConfig();
    if (hasConfig) {
      init();
    } else {
      $('configBanner').classList.remove('hidden');
    }
  } catch (err) {
    // JS 错误时在页面上直接显示，帮忙诊断
    const b = $('configBanner');
    b.classList.remove('hidden');
    b.textContent = '⚠️ 页面初始化出错：' + err.message + '（请告知此信息）';
    console.error('bindUI error:', err);
  }
}

// ---- 全局未捕获错误处理：把任何 JS 报错都显示在页面上，帮助诊断 ----
window.addEventListener('error', function(e) {
  const b = document.getElementById('configBanner');
  if (b) {
    b.classList.remove('hidden');
    b.textContent = '⚠️ JS 错误：' + e.message + '（请告知此信息）';
  }
  console.error('Uncaught error:', e);
});
window.addEventListener('unhandledrejection', function(e) {
  const b = document.getElementById('configBanner');
  if (b) {
    b.classList.remove('hidden');
    b.textContent = '⚠️ 异步错误：' + (e.reason && e.reason.message) + '（请告知此信息）';
  }
  console.error('Unhandled rejection:', e);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindUI);
} else {
  bindUI();
}
