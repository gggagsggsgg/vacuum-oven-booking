// ===== 真空干燥箱预约系统（云数据版 · Supabase 直连）=====
// 预置实验室共享配置（如需更换，可在网页右上角「设置」内覆盖）
const DEFAULT_URL = 'https://utlkvouckmcmjvjasvdh.supabase.co';
const DEFAULT_KEY = 'sb_publishable_8hEMG-giGCO9_v79KhlyDg_4npHcZEd';
const LS_URL = 'vo_supabase_url';
const LS_KEY = 'vo_supabase_key';
let supabase = null;
let bookings = [];

const $ = (id) => document.getElementById(id);

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

// ---- 设置弹窗 ----
$('settingsBtn').onclick = () => $('settingsModal').classList.remove('hidden');
$('closeSettings').onclick = () => $('settingsModal').classList.add('hidden');
$('saveSettings').onclick = () => {
  const url = $('supaUrl').value.trim();
  const key = $('supaKey').value.trim();
  if (!url || !key) { alert('请填写完整'); return; }
  localStorage.setItem(LS_URL, url);
  localStorage.setItem(LS_KEY, key);
  supabase = window.supabase.createClient(url, key);
  $('settingsModal').classList.add('hidden');
  $('configBanner').classList.add('hidden');
  init();
};

// ---- 初始化 ----
async function init() {
  setTodayDate();
  defaultTimes();
  await loadBookings();
  setInterval(loadBookings, 30000);
}

async function loadBookings() {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('start_time', { ascending: true });
  if (error) { showFormMsg('加载失败：' + error.message, 'err'); return; }
  bookings = data || [];
  renderTimeline();
  renderList();
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

// ---- 提交预约 ----
$('bookingForm').onsubmit = async (ev) => {
  ev.preventDefault();
  const name = $('name').value.trim();
  const start = new Date($('start').value);
  const end = new Date($('end').value);
  const purpose = $('purpose').value.trim();

  if (!name) return showFormMsg('请填写申请人', 'err');
  if (isNaN(start) || isNaN(end)) return showFormMsg('时间格式错误', 'err');
  if (start >= end) return showFormMsg('结束时间必须晚于开始时间', 'err');
  if (start < new Date()) return showFormMsg('不能预约过去的时间', 'err');

  const conflict = bookings.find(b => overlaps(start, end, new Date(b.start_time), new Date(b.end_time)));
  if (conflict) {
    return showFormMsg(`时间冲突！与 ${conflict.name} 的 ${fmt(conflict.start_time)}–${fmt(conflict.end_time)} 重叠`, 'err');
  }

  const { error } = await supabase.from('bookings').insert({
    name, start_time: start.toISOString(), end_time: end.toISOString(), purpose
  });
  if (error) return showFormMsg('提交失败：' + error.message, 'err');

  showFormMsg('预约成功 ✓', 'ok');
  $('purpose').value = '';
  await loadBookings();
};

function showFormMsg(t, type) {
  const m = $('formMsg');
  m.textContent = t; m.className = 'form-msg ' + (type || '');
  setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 5000);
}

// ---- 启动 ----
if (loadConfig()) init();
else $('configBanner').classList.remove('hidden');
