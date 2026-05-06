/* ============================================================
   COMMITLY v4 — app logic
   Single-user, localStorage, PWA-ready
============================================================ */

/* ---------- STORAGE ---------- */
const KEY = 'commitly_v4';
const SETTINGS_KEY = 'commitly_settings_v1';
const ACHIEVEMENTS_KEY = 'commitly_achievements_v1';

function loadState() {
  try {
    const v4 = localStorage.getItem(KEY);
    if (v4) return JSON.parse(v4);
    const v3 = localStorage.getItem('commitly_v3');
    if (v3) {
      const old = JSON.parse(v3);
      const migrated = {
        tasks: (old.tasks || []).map(t => ({
          ...t,
          subtasks: t.subtasks || [],
          recurring: t.recurring || 'none',
          pomodoroCount: t.pomodoroCount || 0,
          order: 0,
        })),
        nid: old.nid || 1,
      };
      return migrated;
    }
    return { tasks: [], nid: 1 };
  } catch {
    return { tasks: [], nid: 1 };
  }
}
function saveState() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }
function loadSettings() {
  try {
    return Object.assign({
      theme: 'dark', notifications: false, dailyReminder: false,
      pomoFocus: 25, pomoBreak: 5
    }, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {});
  } catch {
    return { theme: 'dark', notifications: false, dailyReminder: false, pomoFocus: 25, pomoBreak: 5 };
  }
}
function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function loadAch() { try { return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || []; } catch { return []; } }
function saveAch() { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(achUnlocked)); }

let S = loadState();
let settings = loadSettings();
let achUnlocked = loadAch();
let curTab = 'today';
let curFilter = 'all';
let heatView = 'year';
let viewMonth = new Date(); viewMonth.setDate(1);
let editingId = null;
let searchQuery = '';
let searchFrom = '';
let searchTo = '';
let chartInstance = null;
let recurringOn = false;
let pomoState = { taskId: null, remaining: 0, total: 0, phase: 'focus', running: false, timerId: null };
let deferredInstallPrompt = null;

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const tip = $('tip');

/* ---------- DATE UTILS ---------- */
const ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today = () => ds(new Date());
const fmtDate = s => new Date(s+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});
const fmtShort = s => new Date(s+'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'});
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
const level = n => n===0?0:n<=2?1:n<=5?2:n<=9?3:4;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------- UTILS ---------- */
function uid() { return S.nid++; }
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Burning oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Night owl';
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------- TOAST ---------- */
function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.achievement ? ' achievement' : '');
  el.innerHTML = `<i class="ph ${opts.icon || 'ph-check-circle'}"></i><span>${escapeHtml(msg)}</span>`;
  $('toastWrap').appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, opts.duration || 2600);
}

/* ---------- STATS ---------- */
function getOverdueTasks() {
  const t = today();
  return S.tasks.filter(x => !x.done && x.date < t);
}
function calcStats() {
  const t = today();
  const tTasks = S.tasks.filter(x => x.date === t);
  const tDone = tTasks.filter(x => x.done).length;
  const total = S.tasks.filter(x => x.done).length;
  const overdue = getOverdueTasks().length;

  const doneDays = new Set(S.tasks.filter(x => x.done).map(x => x.date));
  let streak = 0, c = new Date();
  if (!doneDays.has(ds(c))) c.setDate(c.getDate() - 1);
  while (doneDays.has(ds(c))) { streak++; c.setDate(c.getDate() - 1); }

  const sorted = [...doneDays].sort();
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    const dt = new Date(d + 'T00:00:00');
    run = prev && (dt - prev) / 86400000 === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = dt;
  }
  return { tDone, tTotal: tTasks.length, total, streak, best, overdue };
}
function renderStats() {
  const s = calcStats();
  $('sToday').textContent = s.tDone;
  $('sTodaySub').textContent = `of ${s.tTotal} task${s.tTotal !== 1 ? 's' : ''}`;
  $('sStreak').textContent = s.streak;
  $('sStreakSub').textContent = `day${s.streak !== 1 ? 's' : ''} in a row`;
  $('sTotal').textContent = s.total;
  $('sOverdue').textContent = s.overdue;

  const streakCard = document.querySelector('.stat.is-streak');
  streakCard.classList.toggle('has-fire', s.streak >= 3);
  const overdueCard = $('sOverdueCard');
  overdueCard.classList.toggle('zero', s.overdue === 0);

  const pct = s.tTotal === 0 ? 0 : Math.round(s.tDone / s.tTotal * 100);
  $('progFill').style.width = pct + '%';
  $('progPct').textContent = pct + '%';
  $('nPending').textContent = s.tTotal - s.tDone;
  $('nDone').textContent = s.tDone;

  // Tab counts
  $('countToday').textContent = s.tTotal;
  $('countAll').textContent = S.tasks.length;
}

/* ---------- HEATMAP ---------- */
function heatData() {
  const m = {};
  S.tasks.filter(x => x.done).forEach(x => { m[x.date] = (m[x.date] || 0) + 1; });
  return m;
}
function renderYearHeat() {
  const cols = $('heatCols'); const months = $('monthRow');
  const data = heatData(); const now = new Date(); const todayS = today();
  cols.innerHTML = ''; months.innerHTML = '';
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  $('heatSub').textContent = `${total} contribution${total !== 1 ? 's' : ''} in the last year`;

  const start = new Date(now); start.setDate(start.getDate() - 364 - start.getDay());
  let lastM = -1, cur = new Date(start);
  while (cur <= now) {
    const col = document.createElement('div'); col.className = 'heat-col';
    const m = cur.getMonth();
    const ml = document.createElement('div'); ml.className = 'month-lbl';
    ml.textContent = m !== lastM ? MONTHS[m] : ''; months.appendChild(ml);
    if (m !== lastM) lastM = m;
    if (cols.children.length === 0) {
      for (let i = 0; i < cur.getDay(); i++) { const g = document.createElement('div'); g.style.cssText = 'width:14px;height:14px;'; col.appendChild(g); }
    }
    for (let d = 0; d < 7 && cur <= now; d++) {
      const dstr = ds(cur); const cnt = data[dstr] || 0;
      const cell = document.createElement('div');
      cell.className = 'cell' + (dstr === todayS ? ' is-today' : '');
      cell.id = 'hy-' + dstr;
      cell.dataset.l = level(cnt); cell.dataset.d = dstr; cell.dataset.n = cnt;
      cell.setAttribute('tabindex', '0'); cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `${cnt === 0 ? 'No tasks' : cnt + ' task' + (cnt !== 1 ? 's' : '')} on ${fmtDate(dstr)}`);
      cell.addEventListener('mouseenter', e => showTip(e, dstr, cnt));
      cell.addEventListener('mouseleave', hideTip);
      cell.addEventListener('click', () => { const p = dstr.split('-'); openRecap(new Date(+p[0], +p[1]-1, 1)); });
      cell.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); const p = dstr.split('-'); openRecap(new Date(+p[0], +p[1]-1, 1)); } });
      col.appendChild(cell);
      cur.setDate(cur.getDate() + 1);
    }
    cols.appendChild(col);
  }
  requestAnimationFrame(() => { const s = $('heatScroll'); if (s) s.scrollLeft = s.scrollWidth; });
}
function renderMonthHeat() {
  const grid = $('monthGrid'); const data = heatData(); const todayS = today();
  const yr = viewMonth.getFullYear(); const mo = viewMonth.getMonth();
  grid.innerHTML = '';
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const monthDone = Object.entries(data).filter(([k]) => k.startsWith(`${yr}-${String(mo+1).padStart(2,'0')}`)).reduce((a, [, v]) => a + v, 0);
  $('heatSub').textContent = `${monthDone} completed this month · ${total} total`;
  $('mnLabel').textContent = `${MONTHS_LONG[mo]} ${yr}`;
  const firstDay = new Date(yr, mo, 1).getDay();
  const dim = new Date(yr, mo+1, 0).getDate();
  for (let i = 0; i < firstDay; i++) { const e = document.createElement('div'); e.className = 'month-cell empty'; grid.appendChild(e); }
  for (let d = 1; d <= dim; d++) {
    const dstr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cnt = data[dstr] || 0; const lv = level(cnt); const future = dstr > todayS;
    const cell = document.createElement('div');
    cell.className = 'month-cell' + (dstr === todayS ? ' is-today' : '');
    cell.id = 'hm-' + dstr; cell.dataset.l = future ? 0 : lv;
    cell.innerHTML = `<div class="mc-day">${d}</div><div class="mc-n ${cnt === 0 ? 'zero' : ''}">${future ? '' : (cnt === 0 ? '—' : cnt)}</div>`;
    if (!future) {
      cell.setAttribute('tabindex', '0'); cell.setAttribute('role', 'button');
      cell.addEventListener('mouseenter', e => showTip(e, dstr, cnt));
      cell.addEventListener('mouseleave', hideTip);
      cell.addEventListener('click', () => { const p = dstr.split('-'); openRecap(new Date(+p[0], +p[1]-1, 1)); });
    } else { cell.style.opacity = '0.3'; cell.style.cursor = 'default'; }
    grid.appendChild(cell);
  }
}
function setHeatView(mode) {
  heatView = mode;
  $('btnYear').classList.toggle('active', mode === 'year');
  $('btnMonth').classList.toggle('active', mode === 'month');
  $('yearView').style.display = mode === 'year' ? '' : 'none';
  $('monthView').classList.toggle('show', mode === 'month');
  $('monthNav').classList.toggle('show', mode === 'month');
  if (mode === 'year') renderYearHeat(); else renderMonthHeat();
}
function refreshHeatCell(dstr) {
  const data = heatData();
  const cnt = data[dstr] || 0;
  const lv = level(cnt);
  const cy = $('hy-' + dstr); if (cy) { cy.dataset.l = lv; cy.dataset.n = cnt; }
  const cm = $('hm-' + dstr);
  if (cm) {
    cm.dataset.l = lv;
    const n = cm.querySelector('.mc-n'); if (n) { n.textContent = cnt === 0 ? '—' : cnt; n.className = 'mc-n' + (cnt === 0 ? ' zero' : ''); }
  }
  // Update subtitle
  if (heatView === 'year') {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    $('heatSub').textContent = `${total} contribution${total !== 1 ? 's' : ''} in the last year`;
  } else {
    const yr = viewMonth.getFullYear(); const mo = viewMonth.getMonth();
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const monthDone = Object.entries(data).filter(([k]) => k.startsWith(`${yr}-${String(mo+1).padStart(2,'0')}`)).reduce((a, [, v]) => a + v, 0);
    $('heatSub').textContent = `${monthDone} completed this month · ${total} total`;
  }
}
function pulseCell(dstr) {
  ['hy-' + dstr, 'hm-' + dstr].forEach(id => {
    const c = $(id); if (!c) return;
    c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse');
    setTimeout(() => c.classList.remove('pulse'), 800);
  });
}
function showTip(e, dstr, cnt) {
  tip.textContent = cnt === 0 ? `No tasks · ${fmtDate(dstr)}` : `${cnt} task${cnt > 1 ? 's' : ''} · ${fmtDate(dstr)}`;
  tip.classList.add('on');
}
function hideTip() { tip.classList.remove('on'); }
document.addEventListener('mousemove', e => {
  if (!tip.classList.contains('on')) return;
  tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + 'px';
  tip.style.top = (e.clientY - 38) + 'px';
});

/* ---------- LOGO ANIMATION ---------- */
function animateLogo() {
  const cells = $('brandMark').children;
  [...cells].forEach(c => c.classList.remove('lit'));
  [0,1,3,4,7,8].forEach((i, idx) => setTimeout(() => cells[i]?.classList.add('lit'), idx * 70));
}

/* ---------- TASK CRUD ---------- */
function addTask() {
  const inp = $('taskInput');
  const text = inp.value.trim(); if (!text) { inp.focus(); return; }
  const pri = $('priSel').value;
  const cat = $('catSel').value;
  const t = {
    id: uid(), text, date: today(),
    done: false, priority: pri, category: cat,
    details: '', createdAt: Date.now(), completedAt: null,
    subtasks: [], recurring: recurringOn ? 'daily' : 'none',
    pomodoroCount: 0, order: Date.now(),
  };
  S.tasks.unshift(t); saveState();
  inp.value = ''; $('priSel').value = 'none';
  animateLogo();
  renderAll();
  toast('Task added', { icon: 'ph-plus-circle' });
  inp.focus();
}

function toggleTask(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : null;
  saveState();

  if (t.done) {
    pulseCell(t.date);
    checkAchievements();
    // Recurring: spawn next instance after completion
    if (t.recurring === 'daily' || t.recurring === 'weekly') {
      spawnRecurring(t);
    }
  }
  refreshHeatCell(t.date);
  renderStats();
  renderCurrentTab();
}

function spawnRecurring(source) {
  const next = new Date();
  next.setHours(0,0,0,0);
  if (source.recurring === 'daily') next.setDate(next.getDate() + 1);
  else if (source.recurring === 'weekly') next.setDate(next.getDate() + 7);
  const nextDate = ds(next);
  // Avoid duplicate: skip if same (text, nextDate, recurring) already exists
  const exists = S.tasks.some(t => t.text === source.text && t.date === nextDate && t.recurring === source.recurring);
  if (exists) return;
  S.tasks.unshift({
    id: uid(), text: source.text, date: nextDate,
    done: false, priority: source.priority, category: source.category,
    details: source.details || '', createdAt: Date.now(), completedAt: null,
    subtasks: (source.subtasks || []).map(s => ({ id: Math.random().toString(36).slice(2,9), text: s.text, done: false })),
    recurring: source.recurring, pomodoroCount: 0, order: Date.now(),
  });
  saveState();
}

function deleteTask(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  if (pomoState.taskId === id) stopPomo();
  S.tasks = S.tasks.filter(x => x.id !== id);
  saveState();
  refreshHeatCell(t.date);
  renderStats(); renderCurrentTab();
  toast('Task deleted', { icon: 'ph-trash' });
}

function rescheduleOverdueToToday() {
  const t = today();
  let n = 0;
  S.tasks.forEach(x => { if (!x.done && x.date < t) { x.date = t; n++; } });
  if (n) { saveState(); renderAll(); toast(`${n} task${n>1?'s':''} moved to today`, { icon: 'ph-calendar-check' }); }
}

/* ---------- SUBTASKS ---------- */
function addSubtask(taskId, text) {
  const t = S.tasks.find(x => x.id === taskId); if (!t || !text.trim()) return;
  t.subtasks = t.subtasks || [];
  t.subtasks.push({ id: Math.random().toString(36).slice(2,9), text: text.trim(), done: false });
  saveState(); renderCurrentTab();
}
function toggleSubtask(taskId, sid) {
  const t = S.tasks.find(x => x.id === taskId); if (!t) return;
  const st = t.subtasks.find(s => s.id === sid); if (!st) return;
  st.done = !st.done;
  saveState(); renderCurrentTab();
}
function deleteSubtask(taskId, sid) {
  const t = S.tasks.find(x => x.id === taskId); if (!t) return;
  t.subtasks = t.subtasks.filter(s => s.id !== sid);
  saveState(); renderCurrentTab();
}

/* ---------- POMODORO ---------- */
function startPomo(taskId) {
  if (pomoState.taskId && pomoState.taskId !== taskId) {
    toast('Another pomodoro is running', { icon: 'ph-warning' });
    return;
  }
  if (pomoState.taskId === taskId && pomoState.running) return;
  const t = S.tasks.find(x => x.id === taskId); if (!t) return;
  if (!pomoState.taskId) {
    pomoState = {
      taskId, remaining: settings.pomoFocus * 60,
      total: settings.pomoFocus * 60, phase: 'focus',
      running: true, timerId: null
    };
  } else {
    pomoState.running = true;
  }
  runPomoTick();
  renderCurrentTab();
}
function pausePomo() {
  pomoState.running = false;
  if (pomoState.timerId) clearTimeout(pomoState.timerId);
  renderCurrentTab();
}
function stopPomo() {
  if (pomoState.timerId) clearTimeout(pomoState.timerId);
  pomoState = { taskId: null, remaining: 0, total: 0, phase: 'focus', running: false, timerId: null };
  renderCurrentTab();
}
function runPomoTick() {
  if (!pomoState.running) return;
  if (pomoState.remaining <= 0) {
    // Phase complete
    const t = S.tasks.find(x => x.id === pomoState.taskId);
    if (pomoState.phase === 'focus' && t) {
      t.pomodoroCount = (t.pomodoroCount || 0) + 1;
      saveState();
      notify('Focus complete! 🎯', { body: `Session done on "${t.text}". Time for a break.` });
      toast('Focus complete. Break time!', { icon: 'ph-coffee' });
      pomoState.phase = 'break';
      pomoState.total = settings.pomoBreak * 60;
      pomoState.remaining = pomoState.total;
    } else {
      notify('Break over! ⚡', { body: `Back to "${t?.text || 'your task'}".` });
      toast('Break done — refocus!', { icon: 'ph-lightning' });
      stopPomo();
      return;
    }
  } else {
    pomoState.remaining--;
  }
  updatePomoDisplay();
  pomoState.timerId = setTimeout(runPomoTick, 1000);
}
function updatePomoDisplay() {
  const el = document.querySelector(`#t-${pomoState.taskId} .pomo-time`);
  if (!el) return;
  const m = Math.floor(pomoState.remaining / 60);
  const s = pomoState.remaining % 60;
  el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  const phaseEl = document.querySelector(`#t-${pomoState.taskId} .pomo-phase`);
  if (phaseEl) phaseEl.textContent = pomoState.phase;
}

/* ---------- NOTIFICATIONS ---------- */
function askNotifPermission() {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  if (Notification.permission === 'denied') return Promise.resolve('denied');
  return Notification.requestPermission();
}
function notify(title, opts = {}) {
  if (!settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body: opts.body || '',
      icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="%230A0A0A"/><rect x="10" y="10" width="14" height="14" fill="%23FF4F00"/><rect x="26" y="10" width="14" height="14" fill="%23FF4F00"/><rect x="10" y="26" width="14" height="14" fill="%23FF4F00"/><rect x="42" y="42" width="12" height="12" fill="%23FF4F00"/></svg>',
      tag: opts.tag || 'commitly',
    });
  } catch (e) { console.warn(e); }
}
function checkDailyReminder() {
  if (!settings.dailyReminder) return;
  const now = new Date();
  const t = today();
  const doneToday = S.tasks.some(x => x.done && x.date === t);
  // Trigger only if past 8pm and nothing done
  if (now.getHours() >= 20 && !doneToday) {
    const lastKey = 'commitly_lastDailyPing';
    if (localStorage.getItem(lastKey) !== t) {
      notify('Your streak is waiting ⚡', { body: 'Commit at least one task to keep the streak alive.' });
      localStorage.setItem(lastKey, t);
    }
  }
}

/* ---------- ACHIEVEMENTS ---------- */
const ACHIEVEMENTS = [
  { id: 'first-commit',   title: 'First Commit',    sub: 'Complete 1 task',        icon: 'ph-seedling',       check: s => s.total >= 1 },
  { id: 'ten-commits',    title: 'Getting Started', sub: '10 tasks done',          icon: 'ph-rocket',          check: s => s.total >= 10 },
  { id: 'fifty-commits',  title: 'Productive',      sub: '50 tasks done',          icon: 'ph-target',          check: s => s.total >= 50 },
  { id: 'hundred-commits',title: 'Centurion',       sub: '100 tasks done',         icon: 'ph-crown',           check: s => s.total >= 100 },
  { id: 'five-hundred',   title: 'Machine',         sub: '500 tasks done',         icon: 'ph-lightning',       check: s => s.total >= 500 },
  { id: 'streak-3',       title: 'Warming Up',      sub: '3-day streak',           icon: 'ph-flame',           check: s => s.streak >= 3 || s.best >= 3 },
  { id: 'streak-7',       title: 'On Fire',         sub: '7-day streak',           icon: 'ph-fire',            check: s => s.streak >= 7 || s.best >= 7 },
  { id: 'streak-30',      title: 'Unstoppable',     sub: '30-day streak',          icon: 'ph-medal-military',  check: s => s.streak >= 30 || s.best >= 30 },
  { id: 'streak-100',     title: 'Legendary',       sub: '100-day streak',         icon: 'ph-trophy',          check: s => s.streak >= 100 || s.best >= 100 },
  { id: 'polymath',       title: 'Polymath',        sub: 'All 6 categories',       icon: 'ph-palette',
    check: () => new Set(S.tasks.filter(x => x.done).map(x => x.category)).size >= 6 },
  { id: 'early-bird',     title: 'Early Bird',      sub: 'Complete before 9 AM',   icon: 'ph-sun-horizon',
    check: () => S.tasks.some(x => x.done && x.completedAt && new Date(x.completedAt).getHours() < 9) },
  { id: 'night-owl',      title: 'Night Owl',       sub: 'Complete after 11 PM',   icon: 'ph-moon-stars',
    check: () => S.tasks.some(x => x.done && x.completedAt && new Date(x.completedAt).getHours() >= 23) },
  { id: 'pomodoro-lover', title: 'Focused Mind',    sub: '10 pomodoro sessions',   icon: 'ph-timer',
    check: () => S.tasks.reduce((a, t) => a + (t.pomodoroCount || 0), 0) >= 10 },
  { id: 'perfect-day',    title: 'Perfect Day',     sub: '5+ tasks in one day',    icon: 'ph-star',
    check: () => { const m = {}; S.tasks.filter(x => x.done).forEach(x => { m[x.date] = (m[x.date]||0)+1; }); return Object.values(m).some(v => v >= 5); }},
];
function checkAchievements() {
  const s = calcStats();
  let newAch = [];
  ACHIEVEMENTS.forEach(a => {
    if (!achUnlocked.includes(a.id) && a.check(s)) {
      achUnlocked.push(a.id);
      newAch.push(a);
    }
  });
  if (newAch.length) {
    saveAch();
    newAch.forEach((a, i) => {
      setTimeout(() => toast(`Badge unlocked — ${a.title}`, { achievement: true, icon: a.icon, duration: 3500 }), i * 1200);
    });
    renderAchievements();
    $('countAchieve').textContent = achUnlocked.length;
  }
}
function renderAchievements() {
  const g = $('achieveGrid'); g.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const unlocked = achUnlocked.includes(a.id);
    const d = document.createElement('div');
    d.className = 'achieve-card' + (unlocked ? ' unlocked' : '');
    d.dataset.testid = 'achievement-' + a.id;
    d.innerHTML = `<div class="achieve-hex"><i class="ph ${a.icon}"></i></div>
                   <div class="achieve-title">${escapeHtml(a.title)}</div>
                   <div class="achieve-sub">${escapeHtml(a.sub)}</div>`;
    g.appendChild(d);
  });
  $('achievementSub').textContent = `${achUnlocked.length} of ${ACHIEVEMENTS.length} earned`;
  $('countAchieve').textContent = achUnlocked.length;
}

/* ---------- TASK RENDERING ---------- */
function makeTaskEl(t, opts = {}) {
  const showDate = opts.showDate || false;
  const isOverdue = opts.isOverdue || false;

  const wrap = document.createElement('div');
  wrap.className = 'task-wrap';
  wrap.id = 'tw-' + t.id;
  wrap.dataset.testid = 'task-' + t.id;
  wrap.dataset.id = t.id;

  const bgDel = document.createElement('div'); bgDel.className = 'swipe-bg swipe-bg-del';
  bgDel.innerHTML = '<i class="ph ph-trash"></i>Delete';
  wrap.appendChild(bgDel);
  const bgEdit = document.createElement('div'); bgEdit.className = 'swipe-bg swipe-bg-edit';
  bgEdit.innerHTML = 'Edit<i class="ph ph-pencil-simple"></i>';
  wrap.appendChild(bgEdit);

  const el = document.createElement('div');
  el.className = 'task-item' + (t.done ? ' is-done' : '') + (isOverdue ? ' is-overdue' : '') + (pomoState.taskId === t.id ? ' is-active-pomo has-pomo-open' : '');
  el.id = 't-' + t.id;

  // drag handle
  const dh = document.createElement('span'); dh.className = 't-drag drag-handle';
  dh.innerHTML = '<i class="ph ph-dots-six-vertical"></i>';
  dh.title = 'Drag to reorder';
  el.appendChild(dh);

  // checkbox
  const cb = document.createElement('div');
  cb.className = 't-cb' + (t.done ? ' checked' : '');
  cb.setAttribute('role', 'checkbox'); cb.setAttribute('tabindex', '0');
  cb.setAttribute('aria-checked', t.done ? 'true' : 'false');
  cb.dataset.testid = 'task-checkbox-' + t.id;
  cb.innerHTML = '<i class="ph ph-check"></i>';
  cb.addEventListener('click', (e) => { e.stopPropagation(); toggleTask(t.id); });
  cb.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleTask(t.id); } });
  el.appendChild(cb);

  // body
  const body = document.createElement('div'); body.className = 't-body';
  const txt = document.createElement('div'); txt.className = 't-text';
  txt.textContent = t.text;
  txt.setAttribute('data-testid', 'task-text-' + t.id);
  // Double-click to inline edit
  txt.addEventListener('dblclick', () => startInlineEdit(t.id, txt));
  body.appendChild(txt);

  if (t.details) {
    const d = document.createElement('div'); d.className = 't-details';
    d.textContent = t.details;
    body.appendChild(d);
  }

  // meta
  const meta = document.createElement('div'); meta.className = 't-meta';
  if (t.priority && t.priority !== 'none') {
    const p = document.createElement('span'); p.className = 't-tag pri-' + t.priority;
    p.innerHTML = `<i class="ph ph-flag-pennant"></i>${t.priority}`;
    meta.appendChild(p);
  }
  if (t.category && t.category !== 'general') {
    const c = document.createElement('span'); c.className = 't-tag cat';
    c.textContent = t.category;
    meta.appendChild(c);
  }
  if (t.recurring && t.recurring !== 'none') {
    const r = document.createElement('span'); r.className = 't-tag recurring';
    r.innerHTML = `<i class="ph ph-repeat"></i>${t.recurring}`;
    meta.appendChild(r);
  }
  if (t.pomodoroCount > 0) {
    const pm = document.createElement('span'); pm.className = 't-tag';
    pm.innerHTML = `<i class="ph ph-timer"></i>${t.pomodoroCount}×`;
    pm.title = `${t.pomodoroCount} focus session${t.pomodoroCount!==1?'s':''}`;
    meta.appendChild(pm);
  }
  if ((t.subtasks || []).length > 0) {
    const doneCount = t.subtasks.filter(s => s.done).length;
    const sp = document.createElement('span'); sp.className = 'subtask-progress';
    sp.textContent = `${doneCount}/${t.subtasks.length}`;
    meta.appendChild(sp);
  }
  if (showDate) {
    const dt = document.createElement('span'); dt.className = 't-tag time';
    dt.textContent = fmtShort(t.date);
    meta.appendChild(dt);
  }
  if (t.done && t.completedAt) {
    const ct = document.createElement('span'); ct.className = 't-tag time';
    ct.innerHTML = `<i class="ph ph-check" style="font-size:10px"></i> ${fmtTime(t.completedAt)}`;
    meta.appendChild(ct);
  }
  if (meta.childElementCount) body.appendChild(meta);

  // subtasks
  if ((t.subtasks || []).length > 0 || opts.expandedSub) {
    const sts = document.createElement('div'); sts.className = 'subtasks';
    (t.subtasks || []).forEach(s => {
      const row = document.createElement('div'); row.className = 'subtask';
      row.innerHTML = `<div class="subtask-cb ${s.done ? 'done' : ''}" data-sid="${s.id}"><i class="ph ph-check"></i></div>
                       <span class="subtask-text ${s.done ? 'done' : ''}" data-sid="${s.id}">${escapeHtml(s.text)}</span>
                       <button class="subtask-del" data-sid="${s.id}" aria-label="Remove"><i class="ph ph-x"></i></button>`;
      row.querySelector('.subtask-cb').addEventListener('click', () => toggleSubtask(t.id, s.id));
      row.querySelector('.subtask-del').addEventListener('click', () => deleteSubtask(t.id, s.id));
      sts.appendChild(row);
    });
    const addSt = document.createElement('div'); addSt.className = 'subtask-add';
    addSt.innerHTML = `<input type="text" placeholder="+ Add subtask…" data-testid="subtask-input-${t.id}" />`;
    const stInput = addSt.querySelector('input');
    stInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const v = stInput.value; stInput.value = ''; if (v.trim()) addSubtask(t.id, v); }
    });
    sts.appendChild(addSt);
    body.appendChild(sts);
  }

  el.appendChild(body);

  // actions
  const acts = document.createElement('div'); acts.className = 't-actions';
  // Pomodoro button
  const pmBtn = document.createElement('button');
  pmBtn.className = 't-act' + (pomoState.taskId === t.id && pomoState.running ? ' is-running' : '');
  pmBtn.setAttribute('aria-label', 'Start pomodoro');
  pmBtn.dataset.testid = 'btn-pomo-' + t.id;
  pmBtn.innerHTML = '<i class="ph ph-timer"></i>';
  pmBtn.addEventListener('click', () => {
    if (pomoState.taskId === t.id) {
      if (pomoState.running) pausePomo(); else startPomo(t.id);
    } else {
      startPomo(t.id);
    }
  });
  acts.appendChild(pmBtn);

  // Subtask add
  const stBtn = document.createElement('button');
  stBtn.className = 't-act'; stBtn.setAttribute('aria-label', 'Add subtask');
  stBtn.innerHTML = '<i class="ph ph-list-checks"></i>';
  stBtn.addEventListener('click', () => {
    t.subtasks = t.subtasks || [];
    if (t.subtasks.length === 0) t.subtasks.push({ id: Math.random().toString(36).slice(2,9), text: '', done: false });
    saveState(); renderCurrentTab();
    setTimeout(() => {
      const wrap = document.querySelector(`#t-${t.id} .subtasks`);
      if (wrap && t.subtasks.every(s => s.text)) {
        const inp = wrap.querySelector('.subtask-add input'); inp?.focus();
      } else if (wrap) {
        // focus the empty subtask text
        const emptyText = wrap.querySelector('.subtask-text');
        if (emptyText && !emptyText.textContent.trim()) {
          emptyText.contentEditable = 'true'; emptyText.focus();
        }
      }
    }, 20);
  });
  acts.appendChild(stBtn);

  // Edit button
  const edBtn = document.createElement('button');
  edBtn.className = 't-act'; edBtn.setAttribute('aria-label', 'Edit');
  edBtn.dataset.testid = 'btn-edit-' + t.id;
  edBtn.innerHTML = '<i class="ph ph-pencil-simple"></i>';
  edBtn.addEventListener('click', () => openEdit(t.id));
  acts.appendChild(edBtn);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 't-act danger'; delBtn.setAttribute('aria-label', 'Delete');
  delBtn.dataset.testid = 'btn-delete-' + t.id;
  delBtn.innerHTML = '<i class="ph ph-trash"></i>';
  delBtn.addEventListener('click', () => { if (confirm('Delete this task?')) deleteTask(t.id); });
  acts.appendChild(delBtn);
  el.appendChild(acts);

  // Pomodoro bar
  if (pomoState.taskId === t.id) {
    const pb = document.createElement('div'); pb.className = 'pomodoro-bar';
    const m = Math.floor(pomoState.remaining / 60);
    const s = pomoState.remaining % 60;
    pb.innerHTML = `<div class="pomo-time">${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</div><div class="pomo-info"><span class="pomo-phase">${pomoState.phase}</span> · ${t.pomodoroCount || 0}× completed</div><div class="pomo-ctrls"><button class="pomo-btn primary" id="pomoToggle-${t.id}" aria-label="${pomoState.running ? 'Pause' : 'Start'}"><i class="ph ${pomoState.running ? 'ph-pause' : 'ph-play'}"></i></button><button class="pomo-btn" id="pomoStop-${t.id}" aria-label="Stop"><i class="ph ph-stop"></i></button></div>`;
    body.appendChild(pb);
    setTimeout(() => {
      document.getElementById('pomoToggle-' + t.id)?.addEventListener('click', () => { pomoState.running ? pausePomo() : startPomo(t.id); });
      document.getElementById('pomoStop-' + t.id)?.addEventListener('click', stopPomo);
    }, 0);
  }

  wrap.appendChild(el);

  // Swipe gesture
  attachSwipe(wrap, el, t);

  return wrap;
}

/* Inline edit */
function startInlineEdit(id, el) {
  el.contentEditable = 'true'; el.classList.add('editing'); el.focus();
  // Select all text
  const range = document.createRange(); range.selectNodeContents(el);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  function commit() {
    el.contentEditable = 'false'; el.classList.remove('editing');
    const t = S.tasks.find(x => x.id === id);
    if (t && el.textContent.trim()) {
      t.text = el.textContent.trim(); saveState();
    } else if (t) {
      el.textContent = t.text;
    }
  }
  el.addEventListener('blur', commit, { once: true });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') { const t = S.tasks.find(x => x.id === id); if (t) el.textContent = t.text; el.blur(); }
  });
}

/* Swipe */
function attachSwipe(wrap, item, t) {
  let startX = 0, currentX = 0, dragging = false;
  const threshold = 70, maxOffset = 100;
  item.addEventListener('touchstart', e => {
    if (e.target.closest('.t-cb, .t-act, .subtask, .pomodoro-bar, .t-drag')) return;
    startX = e.touches[0].clientX; dragging = true; item.style.transition = 'none';
  }, { passive: true });
  item.addEventListener('touchmove', e => {
    if (!dragging) return;
    currentX = e.touches[0].clientX - startX;
    const offset = Math.max(-maxOffset, Math.min(maxOffset, currentX));
    item.style.transform = `translateX(${offset}px)`;
  }, { passive: true });
  item.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false; item.style.transition = 'transform 0.3s var(--ease-spring)';
    if (currentX < -threshold) { if (confirm('Delete this task?')) { deleteTask(t.id); return; } }
    else if (currentX > threshold) { openEdit(t.id); }
    item.style.transform = 'translateX(0)';
    currentX = 0;
  });
  item.addEventListener('touchcancel', () => { dragging = false; item.style.transform = 'translateX(0)'; });
}

/* ---------- TAB RENDERING ---------- */
function taskPassesFilter(t, filter) {
  if (filter === 'all') return true;
  if (['high','medium','low'].includes(filter)) return t.priority === filter;
  if (filter === 'recurring') return t.recurring && t.recurring !== 'none';
  return t.category === filter;
}
function taskPassesSearch(t) {
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    if (!t.text.toLowerCase().includes(q) && !(t.details || '').toLowerCase().includes(q)) return false;
  }
  if (searchFrom && t.date < searchFrom) return false;
  if (searchTo && t.date > searchTo) return false;
  return true;
}

function renderToday() {
  const t = today();
  const todayTasks = S.tasks.filter(x => x.date === t && taskPassesSearch(x));
  const overdue = getOverdueTasks();

  // Overdue banner
  const ov = $('overdueSection'); ov.innerHTML = '';
  if (overdue.length > 0) {
    const b = document.createElement('div'); b.className = 'overdue-banner fade-up';
    b.innerHTML = `<i class="ph ph-warning-circle"></i>
      <div class="overdue-banner-text"><strong>${overdue.length}</strong> overdue task${overdue.length>1?'s':''}. Reschedule to today?</div>
      <button class="overdue-banner-btn" id="btnRescheduleAll" data-testid="btn-reschedule-all">Move all to today</button>`;
    ov.appendChild(b);
    $('btnRescheduleAll').addEventListener('click', rescheduleOverdueToToday);
  }

  const pending = todayTasks.filter(x => !x.done).sort((a, b) => (a.order || 0) - (b.order || 0));
  const done = todayTasks.filter(x => x.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  const lp = $('listPending'); lp.innerHTML = '';
  if (pending.length === 0) {
    lp.innerHTML = `<div class="empty-box" data-testid="empty-pending">
      <div class="empty-ico"><i class="ph ph-seedling"></i></div>
      <div class="empty-title">${searchQuery ? 'No matches' : 'No tasks yet today'}</div>
      <div class="empty-desc">${searchQuery ? 'Try a different keyword.' : 'Add your first task above and start the streak.'}</div>
    </div>`;
  } else {
    pending.forEach(tt => lp.appendChild(makeTaskEl(tt)));
  }
  const ld = $('listDone'); ld.innerHTML = '';
  done.forEach(tt => ld.appendChild(makeTaskEl(tt)));

  // SortableJS on pending
  if (window.Sortable && pending.length > 1) {
    if (lp._sortable) lp._sortable.destroy();
    lp._sortable = new Sortable(lp, {
      animation: 180, handle: '.drag-handle', ghostClass: 'is-drag-ghost', chosenClass: 'is-chosen',
      onEnd: () => {
        const ids = [...lp.querySelectorAll('.task-wrap')].map(w => parseInt(w.dataset.id));
        ids.forEach((id, i) => { const task = S.tasks.find(x => x.id === id); if (task) task.order = i; });
        saveState();
      }
    });
  }
}
function renderAll() {
  renderStats();
  if (heatView === 'year') renderYearHeat(); else renderMonthHeat();
  renderCurrentTab();
  renderAchievements();
}
function renderCurrentTab() {
  if (curTab === 'today') renderToday();
  else if (curTab === 'all') renderAllPanel();
  else if (curTab === 'history') renderHistory();
  else if (curTab === 'achievements') renderAchievements();
}
function renderAllPanel() {
  const list = $('listAll'); list.innerHTML = '';
  let filtered = S.tasks.filter(t => taskPassesFilter(t, curFilter) && taskPassesSearch(t));
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (b.date > a.date ? 1 : b.date < a.date ? -1 : 0);
  });
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-box">
      <div class="empty-ico"><i class="ph ph-list-magnifying-glass"></i></div>
      <div class="empty-title">No tasks found</div>
      <div class="empty-desc">Try another filter or search term.</div></div>`;
    return;
  }
  filtered.forEach(t => list.appendChild(makeTaskEl(t, { showDate: true })));
}
function renderHistory() {
  const list = $('listHistory'); list.innerHTML = '';
  const completed = S.tasks.filter(x => x.done && taskPassesSearch(x)).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  if (completed.length === 0) {
    list.innerHTML = `<div class="empty-box">
      <div class="empty-ico"><i class="ph ph-clock-counter-clockwise"></i></div>
      <div class="empty-title">No history yet</div>
      <div class="empty-desc">Complete tasks to see your journey unfold.</div></div>`;
    return;
  }
  // Group by date
  const groups = {};
  completed.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  dates.forEach(d => {
    const group = document.createElement('div'); group.className = 'history-group';
    const label = d === today() ? 'Today' : fmtShort(d);
    group.innerHTML = `<div class="history-date">
      <span class="history-date-lbl">${label}</span>
      <span class="history-date-line"></span>
      <span class="history-date-count">${groups[d].length} done</span>
    </div>`;
    const ul = document.createElement('div'); ul.className = 'task-list';
    groups[d].forEach(t => ul.appendChild(makeTaskEl(t)));
    group.appendChild(ul);
    list.appendChild(group);
  });
}

function setTab(name) {
  curTab = name;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  $('panel' + name.charAt(0).toUpperCase() + name.slice(1)).style.display = '';
  renderCurrentTab();
}
function setFilter(f, btn) {
  curFilter = f;
  document.querySelectorAll('.fpill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderAllPanel();
}

/* ---------- EDIT MODAL ---------- */
function openEdit(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  editingId = id;
  $('edText').value = t.text;
  $('edDetails').value = t.details || '';
  $('edPri').value = t.priority || 'none';
  $('edCat').value = t.category || 'general';
  $('edDate').value = t.date;
  document.querySelectorAll('#edRecSeg button').forEach(b => b.classList.toggle('active', b.dataset.rec === (t.recurring || 'none')));
  $('editOv').classList.add('open');
  setTimeout(() => $('edText').focus(), 100);
}
function closeEdit() { $('editOv').classList.remove('open'); editingId = null; }
function saveEdit() {
  if (!editingId) return;
  const t = S.tasks.find(x => x.id === editingId); if (!t) return;
  const oldDate = t.date;
  t.text = $('edText').value.trim() || t.text;
  t.details = $('edDetails').value.trim();
  t.priority = $('edPri').value;
  t.category = $('edCat').value;
  const newDate = $('edDate').value; if (newDate) t.date = newDate;
  const rec = document.querySelector('#edRecSeg button.active')?.dataset.rec || 'none';
  t.recurring = rec;
  saveState();
  refreshHeatCell(oldDate); refreshHeatCell(t.date);
  renderAll();
  closeEdit();
  toast('Task updated', { icon: 'ph-check-circle' });
}
function deleteFromEdit() {
  if (!editingId) return;
  if (!confirm('Delete this task?')) return;
  deleteTask(editingId); closeEdit();
}

/* ---------- RECAP ---------- */
function openRecap(dateObj) {
  const yr = dateObj.getFullYear(); const mo = dateObj.getMonth();
  $('recapTitle').textContent = `${MONTHS_LONG[mo]} ${yr} Recap`;
  const data = heatData();
  const monthKeys = Object.keys(data).filter(k => k.startsWith(`${yr}-${String(mo+1).padStart(2,'0')}`));
  const total = monthKeys.reduce((a, k) => a + data[k], 0);
  const active = monthKeys.length;
  const best = monthKeys.length ? Math.max(...monthKeys.map(k => data[k])) : 0;
  $('rTotal').textContent = total; $('rActive').textContent = active; $('rBest').textContent = best;

  $('recapOv').classList.add('open');
  setTimeout(() => drawRecapChart(dateObj, data), 120);
}
function closeRecap() { $('recapOv').classList.remove('open'); if (chartInstance) { chartInstance.destroy(); chartInstance = null; } }
function drawRecapChart(dateObj, data) {
  if (!window.Chart) { setTimeout(() => drawRecapChart(dateObj, data), 200); return; }
  const yr = dateObj.getFullYear(); const mo = dateObj.getMonth();
  const dim = new Date(yr, mo+1, 0).getDate();
  const labels = []; const values = [];
  for (let d = 1; d <= dim; d++) {
    const k = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    labels.push(d); values.push(data[k] || 0);
  }
  const ctx = $('recapChart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#A3A3A3' : '#525252';
  const gridColor = isDark ? '#262626' : '#E5E5E5';
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Tasks', data: values, backgroundColor: '#FF4F00', borderRadius: 0, barThickness: 8 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { backgroundColor: isDark ? '#FAFAFA' : '#0A0A0A', titleColor: isDark ? '#0A0A0A' : '#FFF', bodyColor: isDark ? '#0A0A0A' : '#FFF' } },
      scales: {
        x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Space Mono', size: 9 } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Space Mono', size: 9 }, stepSize: 1, precision: 0 }, beginAtZero: true }
      }
    }
  });
}

/* ---------- THEME ---------- */
function setTheme(mode) {
  settings.theme = mode;
  document.documentElement.setAttribute('data-theme', mode);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', mode === 'dark' ? '#0A0A0A' : '#FAFAFA');
  $('themeIcon').className = mode === 'dark' ? 'ph ph-sun' : 'ph ph-moon';
  const tg = $('tgDark'); if (tg) tg.classList.toggle('on', mode === 'dark');
  saveSettings();
  // Redraw chart if open
  if (chartInstance && $('recapOv').classList.contains('open')) drawRecapChart(viewMonth, heatData());
}

/* ---------- SETTINGS DRAWER ---------- */
function openDrawer() {
  $('drawer').classList.add('open');
  $('drawerOv').classList.add('open');
  $('drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  $('drawer').classList.remove('open');
  $('drawerOv').classList.remove('open');
  $('drawer').setAttribute('aria-hidden', 'true');
}

/* ---------- IMPORT / EXPORT ---------- */
function exportData() {
  const payload = {
    version: 4, exportedAt: new Date().toISOString(),
    state: S, settings, achievements: achUnlocked,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `commitly-backup-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
  toast('Backup downloaded', { icon: 'ph-download-simple' });
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.state || !Array.isArray(data.state.tasks)) throw new Error('Invalid format');
      if (!confirm('This will replace your current data. Continue?')) return;
      S = data.state; saveState();
      if (data.settings) { settings = Object.assign(settings, data.settings); saveSettings(); applySettingsUI(); setTheme(settings.theme); }
      if (Array.isArray(data.achievements)) { achUnlocked = data.achievements; saveAch(); }
      renderAll();
      toast('Data imported successfully', { icon: 'ph-upload-simple' });
    } catch (err) {
      toast('Import failed: invalid file', { icon: 'ph-x-circle' });
    }
  };
  reader.readAsText(file);
}
function wipeAll() {
  if (!confirm('Reset ALL data? This cannot be undone.')) return;
  if (!confirm('Final confirmation — really wipe everything?')) return;
  localStorage.removeItem(KEY); localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(ACHIEVEMENTS_KEY); localStorage.removeItem('commitly_v3');
  S = { tasks: [], nid: 1 }; achUnlocked = []; settings = loadSettings();
  saveState(); saveAch(); saveSettings();
  applySettingsUI(); renderAll(); closeDrawer();
  toast('All data cleared', { icon: 'ph-trash' });
}

function applySettingsUI() {
  $('tgDark').classList.toggle('on', settings.theme === 'dark');
  $('tgNotif').classList.toggle('on', settings.notifications);
  $('tgDaily').classList.toggle('on', settings.dailyReminder);
  $('pomoFocus').value = settings.pomoFocus;
  $('pomoBreak').value = settings.pomoBreak;
}

/* ---------- WIRE UP ---------- */
function bindAll() {
  // Add task
  $('addBtn').addEventListener('click', addTask);
  $('taskInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });
  $('recurringBtn').addEventListener('click', () => {
    recurringOn = !recurringOn;
    $('recurringBtn').classList.toggle('on', recurringOn);
    $('recurringBtn').title = recurringOn ? 'Recurring daily (ON)' : 'Toggle recurring daily';
    toast(recurringOn ? 'Next task will repeat daily' : 'Recurring off', { icon: 'ph-repeat' });
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // Filters
  document.querySelectorAll('.fpill').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.filter, b)));

  // Heatmap
  $('btnYear').addEventListener('click', () => setHeatView('year'));
  $('btnMonth').addEventListener('click', () => setHeatView('month'));
  $('prevMonth').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderMonthHeat(); });
  $('nextMonth').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderMonthHeat(); });
  $('mnLabel').addEventListener('click', () => openRecap(viewMonth));
  $('mnLabel').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRecap(viewMonth); } });

  // Theme
  $('btnThemeToggle').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));
  $('tgDark').addEventListener('click', () => setTheme(settings.theme === 'dark' ? 'light' : 'dark'));

  // Search
  $('btnSearchToggle').addEventListener('click', () => {
    const r = $('searchRow'); const show = r.style.display === 'none';
    r.style.display = show ? 'flex' : 'none';
    if (show) $('searchInput').focus();
    else { $('searchInput').value = ''; $('searchFrom').value = ''; $('searchTo').value = ''; searchQuery = searchFrom = searchTo = ''; renderCurrentTab(); }
  });
  $('searchInput').addEventListener('input', e => { searchQuery = e.target.value; renderCurrentTab(); });
  $('searchClear').addEventListener('click', () => { $('searchInput').value = ''; searchQuery = ''; renderCurrentTab(); $('searchInput').focus(); });
  $('searchFrom').addEventListener('change', e => { searchFrom = e.target.value; renderCurrentTab(); });
  $('searchTo').addEventListener('change', e => { searchTo = e.target.value; renderCurrentTab(); });

  // Settings drawer
  $('btnSettings').addEventListener('click', openDrawer);
  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerOv').addEventListener('click', closeDrawer);
  $('tgNotif').addEventListener('click', async () => {
    if (!settings.notifications) {
      const r = await askNotifPermission();
      if (r !== 'granted') { toast('Notification permission denied', { icon: 'ph-bell-slash' }); return; }
      settings.notifications = true;
      notify('Notifications enabled ✓', { body: 'You\'ll receive pomodoro alerts.' });
    } else { settings.notifications = false; }
    saveSettings(); applySettingsUI();
  });
  $('tgDaily').addEventListener('click', async () => {
    if (!settings.dailyReminder) {
      if (!settings.notifications) {
        const r = await askNotifPermission();
        if (r !== 'granted') { toast('Enable browser notifications first', { icon: 'ph-bell-slash' }); return; }
        settings.notifications = true;
      }
      settings.dailyReminder = true;
    } else { settings.dailyReminder = false; }
    saveSettings(); applySettingsUI();
  });
  $('pomoFocus').addEventListener('change', e => { const v = Math.max(1, Math.min(120, parseInt(e.target.value) || 25)); settings.pomoFocus = v; e.target.value = v; saveSettings(); });
  $('pomoBreak').addEventListener('change', e => { const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 5)); settings.pomoBreak = v; e.target.value = v; saveSettings(); });

  // Import / Export / Wipe
  $('btnExport').addEventListener('click', exportData);
  $('btnImport').addEventListener('click', () => $('fileImport').click());
  $('fileImport').addEventListener('change', e => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });
  $('btnWipe').addEventListener('click', wipeAll);

  // Install
  $('btnInstall').addEventListener('click', triggerInstall);
  $('installYes').addEventListener('click', triggerInstall);
  $('installNo').addEventListener('click', () => { $('installBanner').classList.remove('show'); localStorage.setItem('commitly_install_dismissed', '1'); });

  // Edit modal
  $('editClose').addEventListener('click', closeEdit);
  $('edCancel').addEventListener('click', closeEdit);
  $('edSave').addEventListener('click', saveEdit);
  $('edDelete').addEventListener('click', deleteFromEdit);
  $('editOv').addEventListener('click', e => { if (e.target.id === 'editOv') closeEdit(); });
  document.querySelectorAll('#edRecSeg button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#edRecSeg button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
  }));

  // Recap modal
  $('recapClose').addEventListener('click', closeRecap);
  $('recapOv').addEventListener('click', e => { if (e.target.id === 'recapOv') closeRecap(); });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if ($('editOv').classList.contains('open')) closeEdit();
      else if ($('recapOv').classList.contains('open')) closeRecap();
      else if ($('drawer').classList.contains('open')) closeDrawer();
    }
    // Cmd/Ctrl+K to focus search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const r = $('searchRow'); if (r.style.display === 'none') r.style.display = 'flex';
      $('searchInput').focus();
    }
    // Cmd/Ctrl+N to focus add
    if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); $('taskInput').focus(); }
  });
}

/* ---------- PWA INSTALL ---------- */
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('btnInstall').disabled = false;
  if (!localStorage.getItem('commitly_install_dismissed') && !window.matchMedia('(display-mode: standalone)').matches) {
    setTimeout(() => $('installBanner').classList.add('show'), 4000);
  }
});
async function triggerInstall() {
  if (!deferredInstallPrompt) {
    toast('Use your browser menu to install', { icon: 'ph-info' });
    return;
  }
  $('installBanner').classList.remove('show');
  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;
  if (result.outcome === 'accepted') toast('Commitly installed ✓', { icon: 'ph-check-circle' });
  deferredInstallPrompt = null;
  $('btnInstall').disabled = true;
}

/* ---------- INIT ---------- */
function initHero() {
  $('heroDate').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  $('heroGreeting').textContent = greeting();
}

function init() {
  setTheme(settings.theme);
  applySettingsUI();
  initHero();
  animateLogo();
  bindAll();
  setHeatView('year');
  renderAll();
  checkAchievements();
  checkDailyReminder();
  // Recurring daily reminder interval check every 5 minutes
  setInterval(checkDailyReminder, 5 * 60 * 1000);
  // Update hero date/greeting once per minute
  setInterval(() => { initHero(); const curToday = today(); }, 60000);
}

// Wait for DOM and scripts
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
