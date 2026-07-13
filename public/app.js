/* ============================================================
   CONSTANTS
   ============================================================ */
const STORAGE_KEY = 'homeschool_v1';
const POMO_WORK = 25 * 60;
const POMO_BREAK = 5 * 60;
const DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const RING_LEN = 2 * Math.PI * 88; // circumference for r=88

/* ============================================================
   STATE
   ============================================================ */
let state = {
  page: 'home',
  calendar: {
    year: new Date().getFullYear(),
    month: new Date().getMonth()
  },
  timer: {
    isRunning: false,
    theme: 'rain',
    mode: 'free',       // 'free' | 'pomodoro'
    customMinutes: 25,
    totalSecs: 25 * 60,
    remainingSecs: 25 * 60,
    pomodoroPhase: 'work',
    pomodoroCount: 0,
    soundOn: false,
    focusAcc: 0          // 집중 초 누적 (60초마다 1분 기록)
  },
  schedule: {
    items: [],
    aiResponse: null,
    isLoading: false
  },
  checklist: {
    items: []
  }
};

let timerInterval = null;
const soundEngine = new AmbientSoundEngine();
let particles = null;
let currentPopupDate = null;
let editingScheduleId = null;
let editingPopupId = null;

/* ============================================================
   시간대 구분 (아침/오후/저녁) 설정
   ============================================================ */
const PERIOD_ENABLED_KEY = 'hs_period_enabled';
const PERIOD_LABELS = { morning: '🌅 아침', afternoon: '☀️ 오후', evening: '🌙 저녁' };
const PERIOD_ORDER = ['morning', 'afternoon', 'evening'];

function isPeriodEnabled() {
  return localStorage.getItem(PERIOD_ENABLED_KEY) === '1';
}

/* ============================================================
   대한민국 공휴일 (2025~2027)
   ============================================================ */
const HOLIDAYS_KR = {
  '2025-1-1': '신정', '2025-1-27': '임시공휴일', '2025-1-28': '설날', '2025-1-29': '설날', '2025-1-30': '설날',
  '2025-3-1': '삼일절', '2025-3-3': '대체공휴일', '2025-5-5': '어린이날·부처님오신날', '2025-5-6': '대체공휴일',
  '2025-6-6': '현충일', '2025-8-15': '광복절', '2025-10-3': '개천절', '2025-10-5': '추석', '2025-10-6': '추석',
  '2025-10-7': '추석', '2025-10-8': '대체공휴일', '2025-10-9': '한글날', '2025-12-25': '성탄절',

  '2026-1-1': '신정', '2026-2-16': '설날', '2026-2-17': '설날', '2026-2-18': '설날',
  '2026-3-1': '삼일절', '2026-3-2': '대체공휴일', '2026-5-5': '어린이날', '2026-5-24': '부처님오신날',
  '2026-5-25': '대체공휴일', '2026-6-6': '현충일', '2026-8-15': '광복절', '2026-8-17': '대체공휴일',
  '2026-9-24': '추석', '2026-9-25': '추석', '2026-9-26': '추석', '2026-10-3': '개천절', '2026-10-5': '대체공휴일',
  '2026-10-9': '한글날', '2026-12-25': '성탄절',

  '2027-1-1': '신정', '2027-2-6': '설날', '2027-2-7': '설날', '2027-2-8': '설날', '2027-2-9': '대체공휴일',
  '2027-3-1': '삼일절', '2027-5-5': '어린이날', '2027-5-13': '부처님오신날', '2027-6-6': '현충일',
  '2027-8-15': '광복절', '2027-9-14': '추석', '2027-9-15': '추석', '2027-9-16': '추석',
  '2027-10-3': '개천절', '2027-10-9': '한글날', '2027-12-25': '성탄절'
};

/* ============================================================
   INIT
   ============================================================ */
const OPENAI_KEY_STORAGE  = 'hs_openai_key';
const YOUTUBE_KEY_STORAGE = 'hs_youtube_key';
const VS_HISTORY_KEY      = 'hs_vs_history';
const CAL_SCHEDULES_KEY   = 'hs_schedules_v2';

// API 키는 사이드바 ⚙️ 설정에서 직접 입력하세요.

document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  carryOverYesterdaySchedule();
  particles = new ParticleSystem();
  setupNavigation();
  renderHome();
  initTimerPage();
  renderScheduleDate();
  renderScheduleItems();
  renderChecklistItems();
  updateChecklistProgress();
  updateHomeStats();
  updateTimerTodayHint();
  fcInit();

  musicPlayer.init();
  initMemo();
  // API 키는 ⚙️ 설정 모달에서 입력 (localStorage에만 저장)
});

/* ============================================================
   NAVIGATION
   ============================================================ */
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });
}

function navigate(page) {
  if (state.page === 'timer' && page !== 'timer') stopTimerBg();
  if (state.page === 'games' && page !== 'games') { ffPause(); ppPause(); }
  if (page === 'timer' && state.page !== 'timer') setTimeout(initTimerBg, 100);
  if (state.page === 'study' && page !== 'study') backToStudyList();

  // Home theme canvas: start when entering home, stop when leaving
  if (state.page === 'home' && page !== 'home') stopHomeThemeBg();
  if (page === 'home' && state.page !== 'home') {
    const t = localStorage.getItem('hs_app_theme') || 'default';
    if (t === 'sunset') setTimeout(startSunsetHomeBg, 80);
    else if (t === 'moonlit') setTimeout(startMoonlitHomeBg, 80);
  }

  state.page = page;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`page-${page}`).classList.add('active');
  document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

  if (page === 'home') { renderHome(); updateHomeStats(); }
  if (page === 'schedule') renderScheduleDate();
  if (page === 'study') renderStudyPage();
  if (page === 'video') renderVsChips();
  if (page === 'games') {
    ensureBballInit();
    if (activeGame === 'firefly') { ensureFireflyInit(); ffResume(); }
    if (activeGame === 'paper')   { ensurePaperInit();   ppResume(); }
  }
  if (page === 'stats') renderStats();
  if (page === 'cards') fcRenderDecks();
  if (page === 'timer') updateTimerTodayHint();

  updateMemoStarVisibility(page);
}

/* ============================================================
   HOME PAGE
   ============================================================ */
const STUDY_QUOTES = [
  { text: '공부는 우리가 원하는 것을 얻는 데 쓰는 가장 강력한 무기다.', author: '— 넬슨 만델라' },
  { text: '오늘 걷지 않으면 내일은 뛰어야 한다.', author: '— 작자 미상' },
  { text: '지식에 투자하는 것이 가장 이윤이 높은 투자다.', author: '— 벤자민 프랭클린' },
  { text: '천천히 가도 괜찮아. 멈추지만 않으면 돼.', author: '— 공자' },
  { text: '어제보다 1%만 나아지면 돼. 그게 쌓이면 인생이 바뀐다.', author: '— 제임스 클리어' },
  { text: '모든 전문가는 한때 초보자였다.', author: '— 헬렌 헤이스' },
  { text: '성공은 매일 반복한 작은 노력의 합계다.', author: '— 로버트 콜리어' },
  { text: '고통은 일시적이다. 포기는 영원하다.', author: '— 랜스 암스트롱' },
  { text: '배움의 끝은 없다. 매일이 새로운 시작이다.', author: '— 작자 미상' },
  { text: '꿈꾸는 것을 멈추지 마라. 꿈꾸는 자만이 이룰 수 있다.', author: '— 빅토르 위고' },
  { text: '지금 이 순간이 남은 인생에서 가장 젊은 때다.', author: '— 작자 미상' },
  { text: '어려운 일을 하기 때문에 성장하는 것이다.', author: '— 앤서니 로빈스' },
  { text: '한 번에 한 걸음씩. 그게 산을 오르는 방법이다.', author: '— 작자 미상' },
  { text: '오늘의 나는 어제의 내가 만들었다. 내일의 나는 오늘의 내가 만든다.', author: '— 작자 미상' },
  { text: '포기하고 싶을 때가 가장 성장하는 순간이다.', author: '— 작자 미상' },
];

function renderHome() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const day = now.getDate();

  document.getElementById('home-date').textContent = `${y}년 ${m}월 ${day}일 ${DAYS_FULL[now.getDay()]}`;
  document.getElementById('home-greeting').textContent = getGreeting();

  const q = STUDY_QUOTES[Math.floor(Math.random() * STUDY_QUOTES.length)];
  const textEl = document.getElementById('hq-text');
  const authorEl = document.getElementById('hq-author');
  if (textEl) textEl.textContent = q.text;
  if (authorEl) authorEl.textContent = q.author;

  renderCalendar();
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 6)  return '밤새 공부하는 건가요? 잠깐 쉬어가도 돼요 🌙';
  if (h < 11) return '좋은 아침이에요! 오늘도 멋진 하루 시작해봐요 ☀️';
  if (h < 14) return '오전 공부 잘 하고 있나요? 파이팅! 🌟';
  if (h < 18) return '오후도 꾸준히! 조금만 더 힘내봐요 ✨';
  if (h < 21) return '저녁에도 열심히네요. 오늘 하루 수고했어요 🌙';
  return '늦은 밤까지 고생했어요. 이제 좀 쉬어요 💤';
}

/* ============================================================
   CALENDAR
   ============================================================ */
function dateKey(year, month, day) {
  return `${year}-${month + 1}-${day}`;
}

function renderCalendar() {
  const { year, month } = state.calendar;
  const today = new Date();
  const allSchedules = getAllSchedules();

  document.getElementById('cal-title').textContent = `${year}년 ${month + 1}월`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear  = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear  = month === 11 ? year + 1 : year;

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  for (let i = firstDay - 1; i >= 0; i--) {
    grid.appendChild(createDayCell(prevYear, prevMonth, prevDays - i, true, allSchedules));
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    grid.appendChild(createDayCell(year, month, d, false, allSchedules, isToday));
  }

  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    grid.appendChild(createDayCell(nextYear, nextMonth, d, true, allSchedules));
  }

  document.getElementById('cal-prev').onclick = () => {
    state.calendar.month--;
    if (state.calendar.month < 0) { state.calendar.month = 11; state.calendar.year--; }
    renderCalendar();
  };
  document.getElementById('cal-next').onclick = () => {
    state.calendar.month++;
    if (state.calendar.month > 11) { state.calendar.month = 0; state.calendar.year++; }
    renderCalendar();
  };
}

function createDayCell(year, month, day, otherMonth, allSchedules, isToday) {
  const cell = document.createElement('div');
  cell.className = 'cal-day';
  if (otherMonth) cell.classList.add('other-month');
  if (isToday) cell.classList.add('today');

  const dow = new Date(year, month, day).getDay();
  if (dow === 0) cell.classList.add('sunday');
  if (dow === 6) cell.classList.add('saturday');

  const key = dateKey(year, month, day);
  const holidayName = HOLIDAYS_KR[key];
  if (holidayName) cell.classList.add('holiday');

  const numEl = document.createElement('span');
  numEl.className = 'cal-day-num';
  numEl.textContent = day;
  cell.appendChild(numEl);

  if (holidayName) {
    const hEl = document.createElement('div');
    hEl.className = 'cal-holiday-label';
    hEl.textContent = holidayName;
    hEl.title = holidayName;
    cell.appendChild(hEl);
  }

  if (!otherMonth) {
    const items = (allSchedules && allSchedules[key]) || [];
    items.slice(0, 2).forEach(item => {
      const chip = document.createElement('div');
      chip.className = 'cal-event-chip' + (item.done ? ' cal-event-done' : '');
      chip.style.cssText = `background:${item.color}22;border-left:2px solid ${item.color};color:${item.color}`;
      chip.textContent = (item.done ? '✓ ' : '') + item.subject;
      cell.appendChild(chip);
    });
    if (items.length > 2) {
      const more = document.createElement('div');
      more.className = 'cal-event-more';
      more.textContent = `+${items.length - 2}`;
      cell.appendChild(more);
    }
    cell.addEventListener('click', () => openDatePopup(year, month, day, key));
  }

  return cell;
}

/* ============================================================
   TIMER PAGE — INIT
   ============================================================ */
function initTimerPage() {
  updateTimerDisplay();
  renderPomodoroDots();
  updateTimerThemeUI();
  updateModeUI();

  // Theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      state.timer.theme = theme;
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('timer-wrapper').className = `timer-wrapper theme-${theme}`;
      stopTimerBg();
      setTimeout(initTimerBg, 100);
      if (state.timer.soundOn) {
        soundEngine.stop();
        soundEngine.start(theme);
      }
      updateRingColor();
    });
  });

  if (state.page === 'timer') initTimerBg();
}

/* ============================================================
   TIMER — CONTROLS
   ============================================================ */
function toggleTimer() {
  if (state.timer.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  // 끝난 타이머에서 다시 ▶를 누르면 처음부터 재시작
  if (state.timer.remainingSecs <= 0) {
    if (state.timer.mode === 'pomodoro') {
      state.timer.remainingSecs = state.timer.pomodoroPhase === 'work' ? POMO_WORK : POMO_BREAK;
      state.timer.totalSecs = state.timer.remainingSecs;
    } else {
      state.timer.remainingSecs = state.timer.customMinutes * 60;
      state.timer.totalSecs = state.timer.remainingSecs;
    }
    updateTimerDisplay();
  }

  state.timer.isRunning = true;
  document.getElementById('btn-start').textContent = '⏸';
  document.getElementById('btn-start').classList.add('running');
  document.getElementById('timer-phase-label').textContent =
    state.timer.mode === 'pomodoro'
      ? (state.timer.pomodoroPhase === 'work' ? '집중 중 🍅' : '휴식 중 ☕')
      : '집중 중 ✨';

  timerInterval = setInterval(timerTick, 1000);
  // 타이머가 음악을 멈춘 경우에만 같이 재개
  if (musicPlayer._pausedByTimer) {
    musicPlayer._pausedByTimer = false;
    musicPlayer.resume();
  }
}

function pauseTimer() {
  state.timer.isRunning = false;
  clearInterval(timerInterval);
  document.getElementById('btn-start').textContent = '▶';
  document.getElementById('btn-start').classList.remove('running');
  document.getElementById('timer-phase-label').textContent = '일시정지';
  // 음악이 재생 중이면 같이 일시정지
  if (musicPlayer.isPlaying) {
    musicPlayer._pausedByTimer = true;
    musicPlayer.pause();
  }
}

function resetTimer() {
  pauseTimer();
  if (state.timer.mode === 'pomodoro') {
    state.timer.pomodoroPhase = 'work';
    state.timer.remainingSecs = POMO_WORK;
    state.timer.totalSecs = POMO_WORK;
  } else {
    state.timer.remainingSecs = state.timer.customMinutes * 60;
    state.timer.totalSecs = state.timer.customMinutes * 60;
  }
  document.getElementById('timer-phase-label').textContent = '준비';
  updateTimerDisplay();
  renderPomodoroDots();
}

function timerTick() {
  if (state.timer.remainingSecs <= 0) {
    onTimerEnd();
    return;
  }
  state.timer.remainingSecs--;

  // 집중 시간 기록 (뽀모도로 휴식 시간은 제외)
  const isFocus = state.timer.mode !== 'pomodoro' || state.timer.pomodoroPhase === 'work';
  if (isFocus) {
    state.timer.focusAcc++;
    if (state.timer.focusAcc >= 60) {
      state.timer.focusAcc -= 60;
      bumpLog(FOCUS_LOG_KEY, todayStr(), 1);
      updateTimerTodayHint();
      updateHomeStats();
    }
  }

  updateTimerDisplay();
}

function onTimerEnd() {
  clearInterval(timerInterval);
  state.timer.isRunning = false;
  document.getElementById('btn-start').textContent = '▶';
  document.getElementById('btn-start').classList.remove('running');

  if (state.timer.mode === 'pomodoro') {
    if (state.timer.pomodoroPhase === 'work') {
      state.timer.pomodoroCount++;
      state.timer.pomodoroPhase = 'break';
      state.timer.remainingSecs = POMO_BREAK;
      state.timer.totalSecs = POMO_BREAK;
      document.getElementById('timer-phase-label').textContent = '휴식 시간! ☕';
      renderPomodoroDots();
      setTimeout(startTimer, 1500);
    } else {
      state.timer.pomodoroPhase = 'work';
      state.timer.remainingSecs = POMO_WORK;
      state.timer.totalSecs = POMO_WORK;
      document.getElementById('timer-phase-label').textContent = '다음 집중 준비 🍅';
      renderPomodoroDots();
    }
  } else {
    state.timer.remainingSecs = 0;
    document.getElementById('timer-phase-label').textContent = '완료! 🎉';
  }

  updateTimerDisplay();
  playCompletionPing();

  // 집중 세션 완료 축하
  const wasFocus = state.timer.mode !== 'pomodoro' || state.timer.pomodoroPhase === 'break';
  if (wasFocus) {
    showToast(`집중 완료! 오늘 총 ${getTodayFocusMin()}분 집중했어요`, '🔥');
    if (particles) particles.burst(window.innerWidth * 0.5, window.innerHeight * 0.4);
  }
}

function updateTimerDisplay() {
  const secs = state.timer.remainingSecs;
  document.getElementById('timer-time').textContent = formatTime(secs);

  const ratio = state.timer.totalSecs > 0 ? secs / state.timer.totalSecs : 1;
  const offset = RING_LEN * (1 - ratio);
  const ring = document.getElementById('ring-fill');
  if (ring) {
    ring.style.strokeDasharray = RING_LEN;
    ring.style.strokeDashoffset = offset;
  }
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function renderPomodoroDots() {
  const el = document.getElementById('pomodoro-dots');
  if (state.timer.mode !== 'pomodoro') { el.innerHTML = ''; return; }
  el.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const dot = document.createElement('div');
    dot.className = 'pomo-dot' + (i < state.timer.pomodoroCount ? ' done' : '');
    el.appendChild(dot);
  }
}

function togglePomodoroMode() {
  const btn = document.getElementById('btn-pomo');
  const isPomodoro = state.timer.mode === 'pomodoro';

  if (isPomodoro) {
    state.timer.mode = 'free';
    btn.classList.remove('active');
    state.timer.remainingSecs = state.timer.customMinutes * 60;
    state.timer.totalSecs = state.timer.customMinutes * 60;
    state.timer.pomodoroCount = 0;
  } else {
    state.timer.mode = 'pomodoro';
    btn.classList.add('active');
    state.timer.pomodoroPhase = 'work';
    state.timer.pomodoroCount = 0;
    state.timer.remainingSecs = POMO_WORK;
    state.timer.totalSecs = POMO_WORK;
  }

  if (state.timer.isRunning) pauseTimer();
  document.getElementById('timer-phase-label').textContent = '준비';
  updateModeUI();
  updateTimerDisplay();
  renderPomodoroDots();
}

function updateModeUI() {
  const badge = document.getElementById('mode-badge');
  const sliderWrap = document.getElementById('time-slider-wrap');
  if (state.timer.mode === 'pomodoro') {
    badge.textContent = '뽀모도로 모드  25분 집중 + 5분 휴식';
    sliderWrap.style.display = 'none';
  } else {
    badge.textContent = '자유 모드';
    sliderWrap.style.display = 'flex';
  }
}

function updateCustomTime(val) {
  state.timer.customMinutes = parseInt(val);
  document.getElementById('slider-value').textContent = `${val}분`;
  if (!state.timer.isRunning) {
    state.timer.remainingSecs = state.timer.customMinutes * 60;
    state.timer.totalSecs = state.timer.customMinutes * 60;
    updateTimerDisplay();
  }
}

function updateTimerThemeUI() {
  const wrapper = document.getElementById('timer-wrapper');
  wrapper.className = `timer-wrapper theme-${state.timer.theme}`;
  document.querySelectorAll('.theme-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === state.timer.theme);
  });
}

function updateRingColor() {
  // ring fill color is handled by CSS class on .timer-wrapper
}

/* ============================================================
   SOUND
   ============================================================ */
function toggleSound() {
  state.timer.soundOn = !state.timer.soundOn;
  const btn      = document.getElementById('sound-btn');
  const icon     = document.getElementById('sound-icon');
  const label    = document.getElementById('sound-label');
  const volRow   = document.getElementById('sound-volume-row');

  if (state.timer.soundOn) {
    const vol = (document.getElementById('sound-volume-slider')?.value ?? 50) / 100;
    soundEngine.start(state.timer.theme);
    // Apply current slider volume right after start
    setTimeout(() => soundEngine.setVolume(vol), 200);
    btn.classList.add('on');
    icon.textContent  = '🔊';
    label.textContent = '소리 끄기';
    if (volRow) volRow.style.display = 'flex';
  } else {
    soundEngine.stop();
    btn.classList.remove('on');
    icon.textContent  = '🔇';
    label.textContent = '소리 켜기';
    if (volRow) volRow.style.display = 'none';
  }
}

function setSoundVolume(value) {
  soundEngine.setVolume(value / 100);
}

function playCompletionPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch (_) {}
}

/* ============================================================
   TIMER BACKGROUND ANIMATIONS
   ============================================================ */
let bgAnimFrame = null;
let bgCanvas = null;
let bgCtx = null;
let bgParticles = [];

function initTimerBg() {
  bgCanvas = document.getElementById('timer-bg-canvas');
  if (!bgCanvas) return;
  bgCanvas.width = bgCanvas.offsetWidth || window.innerWidth - 220;
  bgCanvas.height = bgCanvas.offsetHeight || window.innerHeight;
  bgCtx = bgCanvas.getContext('2d');
  bgParticles = [];

  switch (state.timer.theme) {
    case 'rain':    startRainBg(); break;
    case 'library': startLibraryBg(); break;
    case 'forest':  startForestBg(); break;
    case 'space':   startSpaceBg(); break;
    case 'moonlit': startTimerMoonlitBg(); break;
  }
}

function stopTimerBg() {
  if (bgAnimFrame) { cancelAnimationFrame(bgAnimFrame); bgAnimFrame = null; }
  if (bgCtx && bgCanvas) bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
  bgParticles = [];
}

/* Rain */
function startRainBg() {
  const w = bgCanvas.width, h = bgCanvas.height;
  for (let i = 0; i < 140; i++) {
    bgParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      len: Math.random() * 18 + 8,
      spd: Math.random() * 5 + 9,
      op: Math.random() * 0.35 + 0.08
    });
  }
  function frame() {
    bgCtx.clearRect(0, 0, w, h);
    bgParticles.forEach(p => {
      bgCtx.beginPath();
      bgCtx.strokeStyle = `rgba(180,210,255,${p.op})`;
      bgCtx.lineWidth = 0.7;
      bgCtx.moveTo(p.x, p.y);
      bgCtx.lineTo(p.x - 2.5, p.y + p.len);
      bgCtx.stroke();
      p.y += p.spd; p.x -= 1.2;
      if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * w; }
    });
    bgAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* Library — twinkling stars */
function startLibraryBg() {
  const w = bgCanvas.width, h = bgCanvas.height;
  for (let i = 0; i < 90; i++) {
    bgParticles.push({
      x: Math.random() * w, y: Math.random() * h * 0.8,
      r: Math.random() * 1.4 + 0.4,
      phase: Math.random() * Math.PI * 2,
      spd: Math.random() * 0.015 + 0.004
    });
  }
  let t = 0;
  function frame() {
    bgCtx.clearRect(0, 0, w, h);
    t += 0.01;
    bgParticles.forEach(p => {
      const op = 0.2 + 0.7 * Math.abs(Math.sin(t * p.spd * 60 + p.phase));
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(255,240,200,${op})`;
      bgCtx.fill();
    });
    bgAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* Forest — floating motes */
function startForestBg() {
  const w = bgCanvas.width, h = bgCanvas.height;
  for (let i = 0; i < 50; i++) {
    bgParticles.push({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 2.5 + 1,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -(Math.random() * 0.4 + 0.1),
      op: Math.random() * 0.25 + 0.05,
      wobble: Math.random() * Math.PI * 2,
      wSpd: Math.random() * 0.02 + 0.005
    });
  }
  function frame() {
    bgCtx.clearRect(0, 0, w, h);
    bgParticles.forEach(p => {
      p.wobble += p.wSpd;
      p.x += p.vx + Math.sin(p.wobble) * 0.25;
      p.y += p.vy;
      if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(140,210,140,${p.op})`;
      bgCtx.fill();
    });
    bgAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* Space — cinematic universe theme */
function startSpaceBg() {
  const w = bgCanvas.width, h = bgCanvas.height;
  const pr = Math.min(w, h);

  /* ---- Stars: 3 layers ---- */
  const bgStars = [];   // distant, static
  const midStars = [];  // mid-field, subtle twinkle
  const heroStars = []; // bright, with halos & cross-flare

  for (let i = 0; i < 420; i++) bgStars.push({
    x: Math.random() * w, y: Math.random() * h,
    r: Math.random() * 0.45 + 0.12,
    op: Math.random() * 0.35 + 0.08
  });
  for (let i = 0; i < 130; i++) midStars.push({
    x: Math.random() * w, y: Math.random() * h,
    r: Math.random() * 0.85 + 0.45,
    phase: Math.random() * Math.PI * 2,
    spd: Math.random() * 0.004 + 0.0015,
    hue: 195 + Math.random() * 75
  });
  for (let i = 0; i < 14; i++) heroStars.push({
    x: Math.random() * w * 0.85, y: Math.random() * h * 0.65,
    r: Math.random() * 1.6 + 1.4,
    phase: Math.random() * Math.PI * 2,
    spd: Math.random() * 0.002 + 0.0008,
    hue: 200 + Math.random() * 70
  });

  /* ---- Shooting stars ---- */
  const shooters = [];
  let fc = 0, nextShoot = 200 + Math.floor(Math.random() * 260);

  let t = 0;
  function frame() {
    bgCtx.clearRect(0, 0, w, h);
    t += 0.010;
    fc++;

    /* Nebula layers — deep, layered colour fog */
    [
      [w*0.20, h*0.20, w*0.60, 'rgba(110,15,230,0.065)'],
      [w*0.72, h*0.28, w*0.46, 'rgba(12,45,210,0.058)'],
      [w*0.42, h*0.55, w*0.55, 'rgba(190,20,70,0.042)'],
      [w*0.88, h*0.52, w*0.40, 'rgba(55,8,170,0.050)'],
      [w*0.28, h*0.80, w*0.44, 'rgba(15,70,200,0.040)'],
    ].forEach(([nx, ny, nr, col]) => {
      const n = bgCtx.createRadialGradient(nx, ny, 0, nx, ny, nr);
      n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)');
      bgCtx.fillStyle = n; bgCtx.fillRect(0, 0, w, h);
    });

    /* Background stars */
    bgStars.forEach(s => {
      bgCtx.beginPath(); bgCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      bgCtx.fillStyle = `rgba(205,215,255,${s.op})`; bgCtx.fill();
    });

    /* Mid stars — gentle twinkle */
    midStars.forEach(s => {
      const op = 0.28 + 0.62 * Math.abs(Math.sin(t * s.spd * 55 + s.phase));
      bgCtx.beginPath(); bgCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      bgCtx.fillStyle = `hsla(${s.hue},50%,93%,${op})`; bgCtx.fill();
    });

    /* Hero stars — halo + 4-point flare */
    heroStars.forEach(s => {
      const op = 0.55 + 0.45 * Math.abs(Math.sin(t * s.spd * 55 + s.phase));
      // soft halo
      bgCtx.fillStyle = radGrad(s.x, s.y, 0, s.r*6, [
        [0,   `hsla(${s.hue},60%,95%,${op*0.38})`],
        [0.5, `hsla(${s.hue},50%,90%,${op*0.08})`],
        [1,   'rgba(0,0,0,0)']
      ]);
      bgCtx.fillRect(s.x - s.r*6, s.y - s.r*6, s.r*12, s.r*12);
      // core
      bgCtx.beginPath(); bgCtx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      bgCtx.fillStyle = `hsla(${s.hue},55%,97%,${op})`; bgCtx.fill();
      // 4-point flare
      bgCtx.strokeStyle = `hsla(${s.hue},50%,97%,${op*0.45})`;
      bgCtx.lineWidth = 0.7;
      bgCtx.beginPath();
      bgCtx.moveTo(s.x - s.r*5, s.y); bgCtx.lineTo(s.x + s.r*5, s.y);
      bgCtx.moveTo(s.x, s.y - s.r*5); bgCtx.lineTo(s.x, s.y + s.r*5);
      bgCtx.stroke();
    });

    /* Shooting stars */
    if (fc >= nextShoot) {
      fc = 0; nextShoot = 190 + Math.floor(Math.random() * 280);
      const ang = 0.15 + Math.random() * 0.28;
      const spd = 7 + Math.random() * 7;
      shooters.push({
        x: Math.random() * w * 0.58, y: Math.random() * h * 0.52,
        vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
        len: 100 + Math.random() * 90, life: 1.0,
        decay: 0.013 + Math.random() * 0.009
      });
    }
    for (let i = shooters.length - 1; i >= 0; i--) {
      const sh = shooters[i];
      sh.x += sh.vx; sh.y += sh.vy; sh.life -= sh.decay;
      if (sh.life <= 0) { shooters.splice(i, 1); continue; }
      const sp = Math.sqrt(sh.vx*sh.vx + sh.vy*sh.vy);
      const tx = sh.x - sh.vx*sh.len/sp, ty = sh.y - sh.vy*sh.len/sp;
      const sg = bgCtx.createLinearGradient(sh.x, sh.y, tx, ty);
      sg.addColorStop(0,    `rgba(255,255,255,${sh.life})`);
      sg.addColorStop(0.22, `rgba(210,222,255,${sh.life*0.60})`);
      sg.addColorStop(1,    'rgba(210,222,255,0)');
      bgCtx.beginPath(); bgCtx.moveTo(sh.x, sh.y); bgCtx.lineTo(tx, ty);
      bgCtx.strokeStyle = sg; bgCtx.lineWidth = 2.2; bgCtx.stroke();
    }

    bgAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* ---- Timer: Moonlit background ---- */
function startTimerMoonlitBg() {
  const w = bgCanvas.width, h = bgCanvas.height;

  const dust = Array.from({length: 36}, () => ({
    rx: Math.random(), ry: Math.random(),
    r: Math.random() * 1.1 + 0.3,
    vx: (Math.random()-0.5) * 0.0016,
    vy: -(Math.random() * 0.0028 + 0.0005),
    op: Math.random() * 0.44 + 0.12,
    phase: Math.random() * Math.PI * 2
  }));

  let t = 0;

  function frame() {
    t += 0.01;
    bgCtx.clearRect(0, 0, w, h);

    // Dark room walls
    const room = bgCtx.createLinearGradient(0, 0, 0, h);
    room.addColorStop(0,   '#030410');
    room.addColorStop(0.5, '#060818');
    room.addColorStop(1,   '#080b1c');
    bgCtx.fillStyle = room;
    bgCtx.fillRect(0, 0, w, h);

    // Window: tall rectangle, upper-center
    const winW = Math.min(w * 0.38, 280);
    const winH = Math.min(h * 0.44, 300);
    const winX = (w - winW) / 2;
    const winY = h * 0.06;
    const fW   = 7; // frame thickness

    // Clip to window interior and draw night sky
    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.rect(winX, winY, winW, winH);
    bgCtx.clip();

    const winSky = bgCtx.createLinearGradient(0, winY, 0, winY + winH);
    winSky.addColorStop(0, '#050c1c');
    winSky.addColorStop(1, '#0a1530');
    bgCtx.fillStyle = winSky;
    bgCtx.fillRect(winX, winY, winW, winH);

    // Stars inside window
    const starData = [
      [0.08,0.05],[0.22,0.11],[0.40,0.04],[0.58,0.09],[0.74,0.05],[0.90,0.14],
      [0.14,0.25],[0.34,0.30],[0.50,0.20],[0.67,0.28],[0.84,0.22],
      [0.06,0.44],[0.26,0.50],[0.44,0.40],[0.62,0.47],[0.80,0.42],[0.94,0.07]
    ];
    starData.forEach(([rx, ry], i) => {
      const sx = winX + rx * winW;
      const sy = winY + ry * winH;
      const pulse = 0.5 + 0.5 * Math.sin(t * (0.65 + i * 0.12) + i * 0.85);
      bgCtx.beginPath();
      bgCtx.arc(sx, sy, 0.65 + pulse * 0.55, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(200,222,255,${0.40 + pulse * 0.48})`;
      bgCtx.fill();
    });

    // Moon (upper-right quadrant of window)
    const moonX = winX + winW * 0.75;
    const moonY = winY + winH * 0.22;
    const moonR = Math.min(winW, winH) * 0.115;

    const moonGlow = bgCtx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 5);
    moonGlow.addColorStop(0,   'rgba(210,230,255,0.24)');
    moonGlow.addColorStop(0.4, 'rgba(165,200,255,0.11)');
    moonGlow.addColorStop(1,   'rgba(80,130,255,0)');
    bgCtx.fillStyle = moonGlow;
    bgCtx.fillRect(winX, winY, winW, winH);

    const moonCore = bgCtx.createRadialGradient(moonX - moonR * 0.22, moonY - moonR * 0.22, 0, moonX, moonY, moonR);
    moonCore.addColorStop(0,   'rgba(255,255,250,0.98)');
    moonCore.addColorStop(0.55,'rgba(225,238,255,0.92)');
    moonCore.addColorStop(1,   'rgba(185,212,255,0.78)');
    bgCtx.beginPath();
    bgCtx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    bgCtx.fillStyle = moonCore;
    bgCtx.fill();

    // Moon craters
    [[0.28,0.22,0.09],[0.62,0.55,0.06],[0.18,0.64,0.05],[0.72,0.32,0.04]].forEach(([rx,ry,rs]) => {
      bgCtx.beginPath();
      bgCtx.arc(moonX+(rx-0.5)*moonR*2, moonY+(ry-0.5)*moonR*2, moonR*rs, 0, Math.PI*2);
      bgCtx.fillStyle = 'rgba(165,192,228,0.28)';
      bgCtx.fill();
    });

    bgCtx.restore(); // end window clip

    // Window frame (wood/dark)
    bgCtx.fillStyle = '#15110e';
    bgCtx.fillRect(winX - fW,   winY - fW,   winW + fW*2, fW);  // top
    bgCtx.fillRect(winX - fW,   winY + winH, winW + fW*2, fW);  // bottom
    bgCtx.fillRect(winX - fW,   winY - fW,   fW, winH + fW*2);  // left
    bgCtx.fillRect(winX + winW, winY - fW,   fW, winH + fW*2);  // right
    bgCtx.fillRect(winX, winY + winH * 0.5 - 2.5, winW, 5);     // horizontal bar
    bgCtx.fillRect(winX + winW * 0.5 - 2.5, winY, 5, winH);     // vertical bar

    // Moonlight beam (trapezoid falling from window bottom)
    const bL  = winX + fW;
    const bR  = winX + winW - fW;
    const flY = h * 0.82;
    const sp  = winW * 0.14; // how much beam spreads

    bgCtx.save();
    bgCtx.beginPath();
    bgCtx.moveTo(bL,      winY + winH + fW);
    bgCtx.lineTo(bR,      winY + winH + fW);
    bgCtx.lineTo(bR + sp, flY);
    bgCtx.lineTo(bL - sp, flY);
    bgCtx.closePath();
    const beamGrad = bgCtx.createLinearGradient(0, winY + winH, 0, flY);
    beamGrad.addColorStop(0,   'rgba(162,196,245,0.22)');
    beamGrad.addColorStop(0.5, 'rgba(145,178,235,0.12)');
    beamGrad.addColorStop(1,   'rgba(120,158,220,0.04)');
    bgCtx.fillStyle = beamGrad;
    bgCtx.fill();
    bgCtx.restore();

    // Window bar shadows cast into beam (gentle sway)
    const sway = Math.sin(t * 0.36) * (winW * 0.014);
    const beamH = flY - (winY + winH + fW);

    bgCtx.save();
    bgCtx.globalAlpha = 0.13;
    bgCtx.fillStyle = '#020308';

    // Vertical bar shadow
    const vmX = (bL + bR) / 2 + sway;
    bgCtx.beginPath();
    bgCtx.moveTo(vmX - 3, winY + winH + fW);
    bgCtx.lineTo(vmX + 3, winY + winH + fW);
    bgCtx.lineTo(vmX + 5 + sway * 0.18, flY);
    bgCtx.lineTo(vmX - 5 + sway * 0.18, flY);
    bgCtx.closePath();
    bgCtx.fill();

    // Horizontal bar shadow
    const hBarY = winY + winH + fW + beamH * 0.5;
    bgCtx.fillRect(bL - sp * 0.5 + sway, hBarY - 2.5, (bR - bL) + sp + sway * 0.2, 5);
    bgCtx.restore();

    // Dust motes drifting upward in beam
    dust.forEach(d => {
      d.rx += d.vx; d.ry += d.vy;
      if (d.ry < -0.05) d.ry = 1.05;
      if (d.rx < -0.05 || d.rx > 1.05) d.rx = Math.random();
      const dBL = bL - sp * d.ry;
      const dBW = (bR - bL) + 2 * sp * d.ry;
      const px  = dBL + d.rx * dBW;
      const py  = (winY + winH + fW) + d.ry * beamH;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.75 + d.phase);
      bgCtx.beginPath();
      bgCtx.arc(px, py, d.r, 0, Math.PI * 2);
      bgCtx.fillStyle = `rgba(196,218,255,${d.op * pulse})`;
      bgCtx.fill();
    });

    // Floor line
    bgCtx.beginPath();
    bgCtx.moveTo(0, flY);
    bgCtx.lineTo(w, flY);
    bgCtx.strokeStyle = 'rgba(70,100,155,0.18)';
    bgCtx.lineWidth = 1;
    bgCtx.stroke();

    // Floor reflection
    const flRefl = bgCtx.createLinearGradient(0, flY, 0, flY + h * 0.12);
    flRefl.addColorStop(0, 'rgba(125,160,220,0.07)');
    flRefl.addColorStop(1, 'rgba(125,160,220,0)');
    bgCtx.fillStyle = flRefl;
    bgCtx.fillRect(bL - sp, flY, (bR + sp) - (bL - sp) + sp * 0.5, h * 0.12);

    bgAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* ============================================================
   MUSIC PLAYER
   ============================================================ */

const MUSIC_META_KEY = 'hs_music_meta_v2';

// C major pentatonic melody  [semitone_from_C4, duration_sec]  (-1 = rest)
const PIANO_MELODY = [
  [0,1.6],[4,0.8],[7,0.8],[9,1.6],[7,0.8],[4,0.8],[0,2.4],[-1,0.8],
  [7,1.6],[9,0.8],[12,0.8],[9,1.6],[7,0.8],[4,0.8],[2,1.6],[-1,0.8],
  [4,1.6],[7,0.8],[9,0.8],[12,1.6],[14,0.8],[12,0.8],[9,3.2],[-1,1.2],
  [0,1.6],[2,0.8],[4,0.8],[7,1.6],[9,0.8],[12,0.8],[7,1.6],[-1,0.8],
  [9,1.6],[7,0.8],[4,0.8],[2,1.6],[0,3.2],[-1,2.0],
];

/* ---- IndexedDB: stores raw ArrayBuffer for each file ---- */
const musicDB = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    // file:// 환경에서 Chrome이 IndexedDB를 자동 삭제하지 않도록 영구 보존 요청
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
    return new Promise((res, rej) => {
      const r = indexedDB.open('hs_music_db', 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore('files', { keyPath: 'id' });
      r.onsuccess = e => { this._db = e.target.result; res(this._db); };
      r.onerror = rej;
    });
  },
  _toBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },
  _fromBase64(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  },
  async save(id, buf) {
    const db = await this.open();
    await new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id, data: buf });
      tx.oncomplete = res; tx.onerror = rej;
    });
    // IndexedDB가 지워지더라도 복구 가능하도록 localStorage에 base64 백업
    try {
      localStorage.setItem('hs_mf_' + id, this._toBase64(buf));
    } catch(e) { /* 용량 초과 시 백업 생략 */ }
  },
  async load(id) {
    // IndexedDB에서 먼저 시도
    try {
      const db = await this.open();
      const result = await new Promise((res, rej) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(id);
        req.onsuccess = () => res(req.result ? req.result.data : null);
        req.onerror = rej;
      });
      if (result) return result;
    } catch(e) { /* localStorage 백업으로 낙하 */ }
    // IndexedDB가 비워진 경우 localStorage base64 백업에서 복구
    const b64 = localStorage.getItem('hs_mf_' + id);
    if (!b64) return null;
    const buf = this._fromBase64(b64);
    // 복구된 데이터를 IndexedDB에 다시 저장
    try {
      const db = await this.open();
      await new Promise((res, rej) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ id, data: buf });
        tx.oncomplete = res; tx.onerror = rej;
      });
    } catch(e) {}
    return buf;
  },
  async remove(id) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').delete(id);
        tx.oncomplete = res; tx.onerror = rej;
      });
    } catch(e) {}
    localStorage.removeItem('hs_mf_' + id);
  }
};

/* ---- Main music player ---- */
const musicPlayer = {
  tracks: [],           // { id, name, type:'generated'|'file' }
  currentIndex: 0,
  isPlaying: false,
  _paused: false,        // true = 일시정지 상태 (stop과 구분)
  _pausedByTimer: false, // 타이머가 음악을 멈춘 경우 true
  _ytMsgHandler: null,   // YouTube postMessage 오류 리스너

  // Generated piano — Web Audio API
  ctx: null, masterGain: null, reverb: null,
  melodyStep: 0, nextNoteTime: 0, scheduleTimer: null,

  // File playback — HTML5 Audio (reliable from file://)
  audio: null,
  blobUrl: null,

  _builtinTracks() {
    return [
      { id: '__yt_ALcBRrr2Qj8__', name: '🎧 지윤이의 플레이리스트', type: 'youtube', ytId: 'ALcBRrr2Qj8', builtin: true },
    ];
  },

  init() {
    try {
      const raw = localStorage.getItem(MUSIC_META_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        const userTracks = (saved.tracks || []).filter(t => t.type === 'file' || (t.type === 'youtube' && !t.builtin));
        this.tracks = [...this._builtinTracks(), ...userTracks];
        this.currentIndex = Math.min(saved.currentIndex || 0, this.tracks.length - 1);
      } else {
        this.tracks = this._builtinTracks();
      }
    } catch(_) {
      this.tracks = this._builtinTracks();
    }
    this.renderPanel();
    this.updateUI();
  },

  saveMeta() {
    const userTracks = this.tracks.filter(t => t.type === 'file' || t.type === 'youtube');
    localStorage.setItem(MUSIC_META_KEY, JSON.stringify({ tracks: userTracks, currentIndex: this.currentIndex }));
  },

  async play() {
    this.isPlaying = true;  // must be true before _scheduleLoop
    this.updateUI();

    const track = this.tracks[this.currentIndex];
    if (track.type === 'youtube') {
      this._playYouTube(track.ytId, track.name, track.playlist);
      return;
    }
    if (track.type === 'generated') {
      await this._playGenerated();
    } else {
      const ok = await this._playFile(track.id);
      if (!ok) { this.isPlaying = false; this.updateUI(); }
    }
  },

  stop() {
    // Stop YouTube mini player
    this._stopYouTube();

    // Stop Web Audio piano
    if (this.scheduleTimer) { clearTimeout(this.scheduleTimer); this.scheduleTimer = null; }
    if (this.masterGain && this.ctx) {
      try { this.masterGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3); } catch(_) {}
    }
    const old = this.ctx;
    setTimeout(() => { if (old) try { old.close(); } catch(_) {} }, 450);
    this.ctx = null;

    // Stop HTML5 audio
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }

    this.isPlaying = false;
    this._paused = false;
    this._hideSeekbar();
    this.updateUI();
  },

  pause() {
    if (!this.isPlaying) return;
    const track = this.tracks[this.currentIndex];
    if (track.type === 'file' && this.audio) {
      this.audio.pause();
    } else if (track.type === 'generated' && this.ctx) {
      if (this.scheduleTimer) { clearTimeout(this.scheduleTimer); this.scheduleTimer = null; }
      this.ctx.suspend();
    }
    // YouTube는 iframe 제약으로 일시정지 불가 — 그대로 둠
    this.isPlaying = false;
    this._paused = true;
    this._updateSeekbar();
    this.updateUI();
    this.renderPanel();
  },

  async resume() {
    if (this.isPlaying) return;
    if (!this._paused) { await this.play(); return; }
    const track = this.tracks[this.currentIndex];
    if (track.type === 'file' && this.audio) {
      await this.audio.play();
    } else if (track.type === 'generated' && this.ctx) {
      await this.ctx.resume();
      this._scheduleLoop();
    } else {
      // 상태가 없으면 처음부터 재생
      this._paused = false;
      await this.play();
      return;
    }
    this.isPlaying = true;
    this._paused = false;
    this._updateSeekbar();
    this.updateUI();
    this.renderPanel();
  },

  async selectTrack(index) {
    const wasPlaying = this.isPlaying;
    if (this.isPlaying || this._paused) this.stop();
    this._pausedByTimer = false;
    this.currentIndex = index;
    this.saveMeta();
    if (wasPlaying) {
      await new Promise(r => setTimeout(r, 500));
      await this.play();
    } else {
      this.renderPanel();
      this.updateUI();
    }
  },

  async next() { await this.selectTrack((this.currentIndex + 1) % this.tracks.length); },
  async prev() { await this.selectTrack((this.currentIndex - 1 + this.tracks.length) % this.tracks.length); },

  async addFiles(files) {
    for (const f of files) {
      const id = 'usr_' + genId();
      await musicDB.save(id, await f.arrayBuffer());
      this.tracks.push({ id, name: f.name.replace(/\.[^.]+$/, ''), type: 'file' });
    }
    this.saveMeta();
    this.renderPanel();
  },

  addYouTube(ytId, name, playlist) {
    const id = 'yt_' + genId();
    const track = { id, name, type: 'youtube', ytId };
    if (playlist) track.playlist = playlist;
    this.tracks.push(track);
    this.saveMeta();
    this.renderPanel();
  },

  async removeTrack(id) {
    const target = this.tracks.find(t => t.id === id);
    if (!target || target.builtin) return;
    const idx = this.tracks.findIndex(t => t.id === id);
    if (idx === -1) return;
    if (idx === this.currentIndex && this.isPlaying) this.stop();
    const t = this.tracks[idx];
    if (t.type === 'file') await musicDB.remove(id);
    this.tracks.splice(idx, 1);
    if (this.tracks.length === 0) {
      this.tracks = this._builtinTracks();
    }
    this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.tracks.length - 1));
    this.saveMeta();
    this.renderPanel();
    this.updateUI();
  },

  // ── YouTube (direct iframe embed, no API needed) ─────────
  _playYouTube(ytId, name, playlist) {
    const player  = document.getElementById('yt-mini-player');
    const iframe  = document.getElementById('yt-iframe');
    const titleEl = document.getElementById('yt-mini-title');
    const wrap    = document.getElementById('yt-iframe-wrap');
    const toggleBtn = document.getElementById('yt-toggle-btn');

    if (titleEl) titleEl.textContent = name || '유튜브 음악';
    if (wrap)    { wrap.classList.remove('minimized'); }
    if (toggleBtn) toggleBtn.textContent = '⊟';
    // list 파라미터 사용 안 함 — 재생목록은 playlist 파라미터로 영상 ID 직접 지정
    const params = 'autoplay=1&rel=0&enablejsapi=1' + (playlist ? '&playlist=' + playlist : '');
    if (iframe)  iframe.src = `https://www.youtube.com/embed/${ytId}?${params}`;
    if (player)  player.style.display = 'flex';

    // YouTube 플레이어 오류 감지 (임베드 제한 영상 안내)
    if (this._ytMsgHandler) window.removeEventListener('message', this._ytMsgHandler);
    this._ytMsgHandler = (e) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const d = JSON.parse(e.data);
        if (d.event === 'onError') {
          const go = confirm(`이 영상은 외부 재생이 제한된 영상이에요.\nYouTube에서 직접 열까요?`);
          if (go) window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank');
        }
      } catch(_) {}
    };
    window.addEventListener('message', this._ytMsgHandler);
  },

  _stopYouTube() {
    if (this._ytMsgHandler) {
      window.removeEventListener('message', this._ytMsgHandler);
      this._ytMsgHandler = null;
    }
    const iframe = document.getElementById('yt-iframe');
    const player = document.getElementById('yt-mini-player');
    if (iframe)  iframe.src = '';
    if (player)  player.style.display = 'none';
  },

  // ── Generated piano ──────────────────────────────────────
  async _playGenerated() {
    if (this.ctx) { try { await this.ctx.close(); } catch(_) {} }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(0.6, this.ctx.currentTime + 1.2);
    this.masterGain.connect(this.ctx.destination);
    this.reverb = this._makeReverb();
    this.melodyStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.3;
    this._scheduleLoop();
  },

  _makeReverb() {
    if (!this.ctx) return null;
    const len = Math.floor(this.ctx.sampleRate * 2.8);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.5);
    }
    const conv = this.ctx.createConvolver();
    conv.buffer = buf;
    const rg = this.ctx.createGain(); rg.gain.value = 0.3;
    conv.connect(rg); rg.connect(this.masterGain);
    return conv;
  },

  _playNote(freq, t, dur, vol = 0.25) {
    if (!this.ctx) return;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vol * 0.35, t + 0.2);
    g.gain.exponentialRampToValueAtTime(vol * 0.08, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    [[1, 1.0], [2, 0.25], [3, 0.08], [4, 0.03]].forEach(([m, hv]) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine'; o.frequency.value = freq * m;
      const hg = this.ctx.createGain(); hg.gain.value = hv;
      o.connect(hg); hg.connect(g);
      o.start(t); o.stop(t + dur + 0.1);
    });
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2000;
    g.connect(lp); lp.connect(this.masterGain);
    if (this.reverb) lp.connect(this.reverb);
  },

  _scheduleLoop() {
    if (!this.ctx) return;
    while (this.nextNoteTime < this.ctx.currentTime + 0.6) {
      const [st, dur] = PIANO_MELODY[this.melodyStep % PIANO_MELODY.length];
      if (st >= 0) this._playNote(261.63 * Math.pow(2, st / 12), this.nextNoteTime, dur);
      this.nextNoteTime += dur;
      this.melodyStep++;
    }
    this.scheduleTimer = setTimeout(() => { if (this.isPlaying) this._scheduleLoop(); }, 100);
  },

  // ── Seekbar ──────────────────────────────────────────────
  _isSeeking: false,

  _fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  },

  _updateSeekbar() {
    const bar   = document.getElementById('music-seekbar');
    const input = document.getElementById('music-seek-input');
    const cur   = document.getElementById('music-time-cur');
    const total = document.getElementById('music-time-total');
    if (!bar) return;
    const track = this.tracks[this.currentIndex];
    if (!track || track.type !== 'file' || !this.audio) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const duration = this.audio.duration || 0;
    const now = this.audio.currentTime || 0;
    if (input && !this._isSeeking) {
      input.max   = Math.floor(duration) || 100;
      input.value = Math.floor(now);
    }
    if (cur)   cur.textContent   = this._fmtTime(now);
    if (total) total.textContent = this._fmtTime(duration);
  },

  _hideSeekbar() {
    const bar = document.getElementById('music-seekbar');
    if (bar) bar.style.display = 'none';
  },

  // ── File playback via HTML5 Audio + blob URL ─────────────
  async _playFile(id) {
    try {
      const ab = await musicDB.load(id);
      if (!ab) { alert('파일을 찾을 수 없어요. 다시 추가해주세요.'); return false; }

      // Revoke previous blob URL
      if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }

      const blob = new Blob([ab]);
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.loop = true;
      audio.volume = 0.7;
      audio.src = url;

      audio.addEventListener('timeupdate',    () => { if (!this._isSeeking) this._updateSeekbar(); });
      audio.addEventListener('loadedmetadata', () => this._updateSeekbar());

      await audio.play();
      this.audio = audio;
      this.blobUrl = url;
      this._updateSeekbar();
      return true;
    } catch(e) {
      console.error('Music file error:', e);
      alert('재생 오류가 발생했어요.\n지원 형식: MP3, WAV, OGG, M4A\n\n오류: ' + (e.message || e));
      return false;
    }
  },

  // ── UI ───────────────────────────────────────────────────
  renderPanel() {
    const list = document.getElementById('music-track-list');
    if (!list) return;
    const icons = { generated: '🎹', file: '🎵', youtube: '▶' };
    let html = this.tracks.map((t, i) => {
      const active = i === this.currentIndex;
      const icon = icons[t.type] || '🎵';
      const canDelete = !t.builtin;
      return `
        <li class="music-track-item ${active ? 'active' : ''}" onclick="musicPlayer.selectTrack(${i})">
          <span class="track-item-icon">${active && this.isPlaying ? '♫' : icon}</span>
          <span class="track-item-name">${escHtml(t.name)}</span>
          ${canDelete ? `<button class="track-delete-btn"
            onclick="event.stopPropagation();musicPlayer.removeTrack('${t.id}')">✕</button>` : ''}
        </li>`;
    }).join('');
    if (this.tracks.every(t => t.builtin)) {
      html += `<li class="track-empty-hint">유튜브 URL이나 MP3 파일로<br>나만의 음악을 추가할 수 있어요 🎧</li>`;
    }
    list.innerHTML = html;
  },

  updateUI() {
    const mainBtn = document.getElementById('music-main-btn');
    const icon    = document.getElementById('music-icon');
    const label   = document.getElementById('music-label');
    const nowEl   = document.getElementById('music-now-playing');
    const nameEl  = document.getElementById('music-track-name-display');
    const prevBtn = document.getElementById('music-prev-btn');
    const nextBtn = document.getElementById('music-next-btn');
    if (!mainBtn) return;

    const multi = this.tracks.length > 1;
    if (prevBtn) prevBtn.style.display = multi ? '' : 'none';
    if (nextBtn) nextBtn.style.display = multi ? '' : 'none';

    const track = this.tracks[this.currentIndex];
    if (this.isPlaying) {
      mainBtn.classList.add('on');
      icon.textContent  = '⏸';
      label.textContent = '음악 끄기';
      if (nowEl)  nowEl.style.display = 'flex';
      if (nameEl) nameEl.textContent = track?.name || '';
    } else if (this._paused) {
      mainBtn.classList.add('on');
      icon.textContent  = '▶';
      label.textContent = '음악 재개';
      if (nowEl)  nowEl.style.display = 'flex';
      if (nameEl) nameEl.textContent = '⏸ ' + (track?.name || '');
    } else {
      mainBtn.classList.remove('on');
      icon.textContent  = '🎵';
      label.textContent = '음악 켜기';
      if (nowEl) nowEl.style.display = 'none';
    }
    this.renderPanel();
  }
};

function musicSeekInput(val) {
  // 드래그 중 시간 표시만 업데이트
  musicPlayer._isSeeking = true;
  const cur = document.getElementById('music-time-cur');
  if (cur) cur.textContent = musicPlayer._fmtTime(parseFloat(val));
}

function musicSeekChange(val) {
  // 손 뗐을 때 실제로 이동
  if (musicPlayer.audio) musicPlayer.audio.currentTime = parseFloat(val);
  musicPlayer._isSeeking = false;
  musicPlayer._updateSeekbar();
}

function toggleMusic() {
  if (musicPlayer.isPlaying) {
    musicPlayer._pausedByTimer = false; // 사용자가 직접 끈 것
    musicPlayer.pause();
  } else {
    musicPlayer._pausedByTimer = false;
    musicPlayer.resume(); // _paused면 이어서, 아니면 처음부터 play
  }
}

function toggleMusicPanel() {
  const p = document.getElementById('music-panel');
  if (!p) return;
  const open = p.style.display === 'none';
  p.style.display = open ? 'flex' : 'none';
  if (open) p.style.flexDirection = 'column';
}

function closeMusicPanel() {
  const p = document.getElementById('music-panel');
  if (p) p.style.display = 'none';
}

async function addMusicFiles(input) {
  if (!input.files.length) return;
  await musicPlayer.addFiles(Array.from(input.files));
  input.value = '';
}

let _musicSearchResults = [];

async function searchMusicTracks() {
  const input      = document.getElementById('music-search-input');
  const btn        = document.getElementById('music-search-btn');
  const resultsEl  = document.getElementById('music-search-results');
  const query      = input.value.trim();
  if (!query) { input.focus(); return; }

  const apiKey = localStorage.getItem(YOUTUBE_KEY_STORAGE);
  if (!apiKey) {
    alert('음악 검색을 위해 YouTube API 키가 필요해요.\n사이드바 ⚙️ 버튼에서 등록해주세요.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '검색 중...';
  resultsEl.innerHTML = '<div class="music-search-hint">검색 중...</div>';

  try {
    const searchParams = new URLSearchParams({
      part:            'snippet',
      q:                query,
      type:            'video',
      videoEmbeddable: 'true',
      videoCategoryId: '10', // Music
      maxResults:      '10',
      key:              apiKey
    });
    const searchRes  = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
    const searchData = await searchRes.json();
    if (searchData.error) throw new Error(searchData.error.message);

    const items = searchData.items || [];
    const videoIds = items.map(i => i.id.videoId).filter(Boolean);
    if (!videoIds.length) {
      resultsEl.innerHTML = '<div class="music-search-hint">검색 결과가 없어요.</div>';
      return;
    }

    // videos 엔드포인트로 실제 임베드 가능 여부(embeddable) 재확인
    const videosParams = new URLSearchParams({
      part: 'status',
      id:    videoIds.join(','),
      key:   apiKey
    });
    const videosRes  = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams}`);
    const videosData = await videosRes.json();
    if (videosData.error) throw new Error(videosData.error.message);

    const embeddableIds = new Set(
      (videosData.items || []).filter(v => v.status?.embeddable).map(v => v.id)
    );

    const filtered = items
      .filter(i => embeddableIds.has(i.id.videoId))
      .slice(0, 5);

    if (!filtered.length) {
      resultsEl.innerHTML = '<div class="music-search-hint">임베드 가능한 영상이 없어요.\n다른 검색어로 시도해보세요.</div>';
      return;
    }

    _musicSearchResults = filtered.map(item => ({
      id:    item.id.videoId,
      title: htmlDecode(item.snippet.title)
    }));

    resultsEl.innerHTML = filtered.map((item, idx) => {
      const title   = escHtml(htmlDecode(item.snippet.title));
      const channel = escHtml(htmlDecode(item.snippet.channelTitle));
      const thumb   = item.snippet.thumbnails.default?.url || item.snippet.thumbnails.medium?.url || '';
      return `
        <button class="music-search-item" onclick="addSearchedMusicTrack(${idx})" title="${title}">
          <img class="music-search-thumb" src="${thumb}" alt="" loading="lazy">
          <span class="music-search-info">
            <span class="music-search-title">${title}</span>
            <span class="music-search-channel">📺 ${channel}</span>
          </span>
        </button>`;
    }).join('');

  } catch (e) {
    resultsEl.innerHTML = `<div class="music-search-hint">검색 중 오류가 발생했어요.\n${escHtml(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '검색';
  }
}

async function addSearchedMusicTrack(idx) {
  const track = _musicSearchResults[idx];
  if (!track) return;

  musicPlayer.addYouTube(track.id, '▶ ' + track.title);

  document.getElementById('music-search-input').value = '';
  document.getElementById('music-search-results').innerHTML = '';
  _musicSearchResults = [];

  // 추가 즉시 해당 트랙으로 전환하고 재생
  const newIndex = musicPlayer.tracks.length - 1;
  if (musicPlayer.isPlaying || musicPlayer._paused) {
    musicPlayer.stop();
    await new Promise(r => setTimeout(r, 250));
  }
  musicPlayer.currentIndex = newIndex;
  musicPlayer.saveMeta();
  musicPlayer.renderPanel();
  await musicPlayer.play();
}

function toggleYTView() {
  const wrap = document.getElementById('yt-iframe-wrap');
  const btn  = document.getElementById('yt-toggle-btn');
  if (!wrap) return;
  const isMin = wrap.classList.contains('minimized');
  wrap.classList.toggle('minimized');
  btn.textContent = isMin ? '⊟' : '⊞';
}

function stopYTAndClose() {
  musicPlayer.stop();
}

/* ============================================================
   AMBIENT SOUND ENGINE
   ============================================================ */
function AmbientSoundEngine() {
  this.ctx = null;
  this.master = null;
  this.sources = [];
  this.active = false;
  this.birdTimer = null;

  this.start = (theme) => {
    if (this.active) this.stop();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.setValueAtTime(0, this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(0.75, this.ctx.currentTime + 1.5);
    this.master.connect(this.ctx.destination);
    this.active = true;
    if (theme === 'rain')    this._rain();
    if (theme === 'library') this._library();
    if (theme === 'forest')  this._forest();
    if (theme === 'space')   this._space();
    if (theme === 'moonlit') this._moonlit();
  };

  this.setVolume = (value) => {  // value: 0~1
    if (this.master) {
      try { this.master.gain.setTargetAtTime(value * 0.9, this.ctx.currentTime, 0.05); } catch(_) {}
    }
  };

  this.stop = () => {
    if (!this.active || !this.ctx) return;
    try {
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
    } catch(_) {}
    if (this.birdTimer) clearTimeout(this.birdTimer);
    const ctx = this.ctx;
    setTimeout(() => { try { ctx.close(); } catch(_) {} }, 1000);
    this.ctx = null; this.sources = []; this.active = false;
  };

  this._noise = (type, dur = 6) => {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(2, sr * dur, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      if (type === 'white') {
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } else if (type === 'pink') {
        let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random()*2-1;
          b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
          b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
          b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
          d[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
        }
      } else if (type === 'brown') {
        let last=0;
        for (let i = 0; i < d.length; i++) {
          const w=Math.random()*2-1;
          d[i]=(last+(0.02*w))/1.02; last=d[i]; d[i]*=3.5;
        }
      }
    }
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = true; this.sources.push(s); return s;
  };

  this._rain = () => {
    const rain = this._noise('white');
    const g = this.ctx.createGain(); g.gain.value = 0.55;
    const hp = this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=380;
    const bp = this.ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1100; bp.Q.value=0.6;
    rain.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.master);

    const rum = this._noise('brown');
    const rg = this.ctx.createGain(); rg.gain.value=0.22;
    const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=140;
    rum.connect(lp); lp.connect(rg); rg.connect(this.master);

    rain.start(); rum.start();
  };

  this._library = () => {
    const noise = this._noise('pink');
    const g = this.ctx.createGain(); g.gain.value=0.07;
    const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=280;
    noise.connect(lp); lp.connect(g); g.connect(this.master);
    noise.start();

    const osc = this.ctx.createOscillator(); osc.type='sine'; osc.frequency.value=50;
    const og = this.ctx.createGain(); og.gain.value=0.015;
    osc.connect(og); og.connect(this.master); osc.start(); this.sources.push(osc);
  };

  this._forest = () => {
    const wind = this._noise('pink');
    const g = this.ctx.createGain(); g.gain.value=0.18;
    const bp = this.ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=480; bp.Q.value=0.35;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value=0.07;
    const lg = this.ctx.createGain(); lg.gain.value=0.1;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); this.sources.push(lfo);
    wind.connect(bp); bp.connect(g); g.connect(this.master); wind.start();
    this._scheduleBird();
  };

  this._space = () => {
    /* deep cosmic drone — 55 Hz */
    const d1 = this.ctx.createOscillator(); d1.type = 'sine'; d1.frequency.value = 55;
    const g1 = this.ctx.createGain(); g1.gain.value = 0.22;
    d1.connect(g1); g1.connect(this.master); d1.start(); this.sources.push(d1);

    /* second harmonic — slightly detuned for depth */
    const d2 = this.ctx.createOscillator(); d2.type = 'sine'; d2.frequency.value = 82.5;
    const g2 = this.ctx.createGain(); g2.gain.value = 0.10;
    d2.connect(g2); g2.connect(this.master); d2.start(); this.sources.push(d2);

    /* high cosmic shimmer */
    const ns = this._noise('pink');
    const ng = this.ctx.createGain(); ng.gain.value = 0.022;
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = 0.38;
    ns.connect(bp); bp.connect(ng); ng.connect(this.master); ns.start();

    /* slow LFO pulsing on the main drone */
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.042;
    const lg = this.ctx.createGain(); lg.gain.value = 0.075;
    lfo.connect(lg); lg.connect(g1.gain); lfo.start(); this.sources.push(lfo);
  };

  this._moonlit = () => {
    /* ── 바람 몸통: 핑크노이즈 → 밴드패스 (350~600Hz) ── */
    const wind = this._noise('pink');
    const windG = this.ctx.createGain(); windG.gain.value = 0.38;
    const bp1 = this.ctx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 420; bp1.Q.value = 0.55;
    const bp2 = this.ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 600; bp2.Q.value = 0.42;
    wind.connect(bp1); bp1.connect(bp2); bp2.connect(windG); windG.connect(this.master); wind.start();

    /* ── 바람 숨결: 고역 화이트노이즈 → 하이패스 (1800Hz) — 얇고 시원한 씨이 소리 ── */
    const hiss = this._noise('white');
    const hissG = this.ctx.createGain(); hissG.gain.value = 0.055;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800; hp.Q.value = 0.4;
    const sh = this.ctx.createBiquadFilter(); sh.type = 'lowpass'; sh.frequency.value = 5500;
    hiss.connect(hp); hp.connect(sh); sh.connect(hissG); hissG.connect(this.master); hiss.start();

    /* ── 먼 바람: 브라운노이즈 → 로우패스 (120Hz) — 낮고 잔잔한 깔림음 ── */
    const rumble = this._noise('brown');
    const rumG = this.ctx.createGain(); rumG.gain.value = 0.18;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
    rumble.connect(lp); lp.connect(rumG); rumG.connect(this.master); rumble.start();

    /* ── LFO1: 바람 강도 천천히 물결치게 (0.07Hz) ── */
    const lfo1 = this.ctx.createOscillator(); lfo1.type = 'sine'; lfo1.frequency.value = 0.07;
    const lg1 = this.ctx.createGain(); lg1.gain.value = 0.13;
    lfo1.connect(lg1); lg1.connect(windG.gain); lfo1.start(); this.sources.push(lfo1);

    /* ── LFO2: 숨결 강도 살짝 다른 주기로 (0.11Hz) ── */
    const lfo2 = this.ctx.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.11;
    const lg2 = this.ctx.createGain(); lg2.gain.value = 0.022;
    lfo2.connect(lg2); lg2.connect(hissG.gain); lfo2.start(); this.sources.push(lfo2);

    /* ── LFO3: 밴드패스 주파수 미세 이동 — 바람 음색 자연스럽게 변화 ── */
    const lfo3 = this.ctx.createOscillator(); lfo3.type = 'sine'; lfo3.frequency.value = 0.045;
    const lg3 = this.ctx.createGain(); lg3.gain.value = 60;
    lfo3.connect(lg3); lg3.connect(bp1.frequency); lfo3.start(); this.sources.push(lfo3);
  };

  this._scheduleBird = () => {
    if (!this.active) return;
    this.birdTimer = setTimeout(() => {
      if (this.active && this.ctx) { this._chirp(); this._scheduleBird(); }
    }, Math.random() * 5000 + 2500);
  };

  this._chirp = () => {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = 1400 + Math.random() * 900;
    const osc = this.ctx.createOscillator(); osc.type='sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.linearRampToValueAtTime(freq*1.35, now+0.1);
    osc.frequency.linearRampToValueAtTime(freq*0.9, now+0.28);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.055, now+0.05);
    g.gain.linearRampToValueAtTime(0, now+0.32);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(now); osc.stop(now+0.35);
  };
}

/* ============================================================
   SCHEDULE PAGE
   ============================================================ */
function renderScheduleDate() {
  const now = new Date();
  const el = document.getElementById('schedule-date-label');
  if (el) {
    el.textContent = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 ${DAYS_FULL[now.getDay()]}`;
  }
  updateSchedulePeriodUI();
}

function updateSchedulePeriodUI() {
  const wrap = document.getElementById('schedule-period-wrap');
  if (wrap) wrap.style.display = isPeriodEnabled() ? 'block' : 'none';
}

function updatePopupPeriodUI() {
  const wrap = document.getElementById('date-popup-period-wrap');
  if (wrap) wrap.style.display = isPeriodEnabled() ? 'block' : 'none';
}

function addScheduleItem() {
  const subjectEl = document.getElementById('subject-input');
  const descEl = document.getElementById('desc-input');
  const periodEl = document.getElementById('schedule-period-select');
  const subject = subjectEl.value.trim();
  const desc = descEl.value.trim();

  if (!subject) {
    subjectEl.focus();
    subjectEl.style.borderColor = '#D45C5C';
    setTimeout(() => subjectEl.style.borderColor = '', 1200);
    return;
  }

  const colors = ['#C8956C','#8B7BD4','#6BAF6B','#D45C5C','#5C8BD4','#D4A05C'];
  const scheduleId = genId();
  state.schedule.items.push({
    id: scheduleId,
    subject,
    desc,
    color: colors[state.schedule.items.length % colors.length],
    done: false,
    period: isPeriodEnabled() ? (periodEl ? periodEl.value : 'afternoon') : undefined
  });

  // 체크리스트에도 자동 등록 (📋 일정 배지)
  state.checklist.items.push({
    id: genId(),
    text: desc ? `${subject} — ${desc}` : subject,
    done: false,
    fromSchedule: true,
    scheduleId
  });

  subjectEl.value = '';
  descEl.value = '';
  subjectEl.focus();

  saveStorage();
  renderScheduleItems();
  renderChecklistItems();
  updateChecklistProgress();
  showToast(`「${subject}」 일정이 추가됐어요`, '🗓️');
}

function removeScheduleItem(id) {
  state.schedule.items = state.schedule.items.filter(i => i.id !== id);
  // Remove linked checklist item only if not yet done
  state.checklist.items = state.checklist.items.filter(i => !(i.scheduleId === id && !i.done));
  if (editingScheduleId === id) editingScheduleId = null;
  saveStorage();
  renderScheduleItems();
  renderChecklistItems();
  updateChecklistProgress();
  if (state.schedule.items.length === 0) resetAIPanel();
}

function editScheduleItem(id) {
  editingScheduleId = id;
  renderScheduleItems();
}

function cancelEditSchedule() {
  editingScheduleId = null;
  renderScheduleItems();
}

function saveEditSchedule(id) {
  const subjectEl = document.getElementById(`edit-subject-${id}`);
  const descEl = document.getElementById(`edit-desc-${id}`);
  const periodEl = document.getElementById(`edit-period-${id}`);
  const subject = subjectEl.value.trim();
  const desc = descEl.value.trim();

  if (!subject) {
    subjectEl.focus();
    subjectEl.style.borderColor = '#D45C5C';
    setTimeout(() => subjectEl.style.borderColor = '', 1200);
    return;
  }

  const item = state.schedule.items.find(i => i.id === id);
  if (item) {
    item.subject = subject;
    item.desc = desc;
    if (periodEl) item.period = periodEl.value;

    const linked = state.checklist.items.find(c => c.scheduleId === id);
    if (linked) linked.text = desc ? `${subject} — ${desc}` : subject;
  }

  editingScheduleId = null;
  saveStorage();
  renderScheduleItems();
  renderChecklistItems();
  renderCalendar();
  showToast('일정을 수정했어요', '✏️');
}

function scheduleItemCardHtml(item, opts) {
  const editing = opts.editingId === item.id;
  const editFnPrefix = opts.editFnPrefix;

  if (editing) {
    const periodSelectHtml = isPeriodEnabled() ? `
        <select id="edit-period-${item.id}" class="form-input" style="margin-bottom:6px">
          ${PERIOD_ORDER.map(p => `<option value="${p}" ${item.period === p ? 'selected' : ''}>${PERIOD_LABELS[p]}</option>`).join('')}
        </select>` : '';
    return `
      <li class="schedule-item schedule-item-editing">
        <div class="schedule-item-color" style="background:${item.color}"></div>
        <div class="schedule-item-body">
          <input type="text" id="edit-subject-${item.id}" class="form-input" value="${escHtml(item.subject)}" style="margin-bottom:6px">
          ${periodSelectHtml}
          <textarea id="edit-desc-${item.id}" class="form-textarea" rows="2" style="margin-bottom:8px">${escHtml(item.desc || '')}</textarea>
          <div class="schedule-edit-actions">
            <button class="btn-primary" onclick="${editFnPrefix}Save('${item.id}')">저장</button>
            <button class="modal-cancel" onclick="${editFnPrefix}Cancel()">취소</button>
          </div>
        </div>
      </li>`;
  }

  return `
    <li class="schedule-item">
      <div class="schedule-item-color" style="background:${item.color}"></div>
      <div class="schedule-item-body">
        <div class="schedule-item-subject">${escHtml(item.subject)}${item.carriedOver ? ' <span class="carried-tag">❗ 못한 일정</span>' : ''}</div>
        ${item.desc ? `<div class="schedule-item-desc">${escHtml(item.desc)}</div>` : ''}
      </div>
      <button class="schedule-item-edit" onclick="${editFnPrefix}Edit('${item.id}')">✎</button>
      <button class="schedule-item-delete" onclick="${opts.removeFn}('${item.id}')">✕</button>
    </li>`;
}

function renderScheduleItems() {
  const list = document.getElementById('schedule-list');
  const empty = document.getElementById('schedule-empty');
  const aiBtn = document.getElementById('ai-btn');

  if (!list) return;

  if (state.schedule.items.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (aiBtn) aiBtn.disabled = true;
    return;
  }

  if (empty) empty.style.display = 'none';
  if (aiBtn) aiBtn.disabled = false;

  const opts = { editingId: editingScheduleId, editFnPrefix: 'schedule', removeFn: 'removeScheduleItem' };

  if (isPeriodEnabled()) {
    list.innerHTML = PERIOD_ORDER.map(period => {
      const items = state.schedule.items.filter(i => (i.period || 'afternoon') === period);
      if (items.length === 0) return '';
      return `
        <li class="schedule-period-header">${PERIOD_LABELS[period]}</li>
        ${items.map(item => scheduleItemCardHtml(item, opts)).join('')}
      `;
    }).join('');
  } else {
    list.innerHTML = state.schedule.items.map(item => scheduleItemCardHtml(item, opts)).join('');
  }
}

window.scheduleEdit = editScheduleItem;
window.scheduleSave = saveEditSchedule;
window.scheduleCancel = cancelEditSchedule;

async function fetchAIFeedback() {
  if (state.schedule.items.length === 0) return;
  if (state.schedule.isLoading) return;

  const apiKey = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (!apiKey) {
    showSettingsModal();
    return;
  }

  state.schedule.isLoading = true;
  showAILoading();

  const scheduleText = state.schedule.items
    .map(i => `- ${i.subject}${i.desc ? ': ' + i.desc : ''}`)
    .join('\n');

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '당신은 홈스쿨러를 진심으로 응원하는 따뜻한 학습 코치입니다. 항상 유효한 JSON만 반환합니다.'
          },
          {
            role: 'user',
            content: `오늘의 공부 일정:\n${scheduleText}\n\n위 일정을 분석해서 아래 JSON 형식으로만 응답해주세요.\n{\n  "tips": [\n    {"subject": "과목명 그대로", "tip": "이 과목에 딱 맞는 구체적이고 실용적인 공부 팁 1-2문장"},\n    ...\n  ],\n  "motivation": "이 학생이 지금 당장 책상에 앉고 싶어지는 따뜻하고 강력한 동기부여 메시지 2-3문장. 오늘 일정의 내용을 반영해서 개인화해주세요."\n}`
          }
        ]
      })
    });

    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);

    const content = json.choices[0].message.content;
    const data = JSON.parse(content);
    state.schedule.aiResponse = data;
    showAIResult(data);
  } catch (err) {
    showAIError(err.message);
  } finally {
    state.schedule.isLoading = false;
  }
}

function showAILoading() {
  document.getElementById('ai-welcome').style.display = 'none';
  document.getElementById('ai-loading').style.display = 'block';
  document.getElementById('ai-result').style.display = 'none';
}

function showAIResult(data) {
  document.getElementById('ai-loading').style.display = 'none';
  document.getElementById('ai-result').style.display = 'block';

  const tipsEl = document.getElementById('ai-tips');
  tipsEl.innerHTML = (data.tips || []).map((t, i) => `
    <div class="ai-tip-item" style="animation-delay:${i * 0.12}s">
      <div class="ai-tip-subject">📌 ${escHtml(t.subject)}</div>
      <div class="ai-tip-text">${escHtml(t.tip)}</div>
    </div>
  `).join('');

  const motEl = document.getElementById('ai-motivation');
  motEl.textContent = data.motivation || '';
}

function showAIError(msg) {
  document.getElementById('ai-loading').style.display = 'none';
  document.getElementById('ai-welcome').style.display = 'block';
  document.getElementById('ai-welcome').innerHTML = `
    <div class="ai-avatar">⚠️</div>
    <h3>오류가 발생했어요</h3>
    <p style="color:#D45C5C;font-size:13px">${escHtml(msg)}</p>
    <p style="margin-top:10px;font-size:13px">잠시 후 다시 시도해보세요.</p>
  `;
}

function resetAIPanel() {
  document.getElementById('ai-welcome').style.display = 'block';
  document.getElementById('ai-welcome').innerHTML = `
    <div class="ai-avatar">🤖</div>
    <h3>AI 공부 코치</h3>
    <p>과목을 추가하고<br><b>「일정 완성」</b> 버튼을 누르면<br>맞춤 공부 팁과 동기부여 메시지를 드릴게요!</p>
  `;
  document.getElementById('ai-loading').style.display = 'none';
  document.getElementById('ai-result').style.display = 'none';
}

/* ============================================================
   CHECKLIST PAGE
   ============================================================ */
function addChecklistItem() {
  const input = document.getElementById('checklist-input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }

  const colors = ['#C8956C','#8B7BD4','#6BAF6B','#D45C5C','#5C8BD4','#D4A05C'];
  const scheduleId = genId();
  state.schedule.items.push({
    id: scheduleId,
    subject: text,
    desc: '',
    color: colors[state.schedule.items.length % colors.length],
    done: false
  });

  state.checklist.items.push({ id: genId(), text, done: false, fromSchedule: true, scheduleId });
  input.value = '';
  input.focus();

  saveStorage();
  renderChecklistItems();
  updateChecklistProgress();
  renderCalendar();
}

function toggleChecklistItem(id) {
  const item = state.checklist.items.find(i => i.id === id);
  if (!item) return;

  item.done = !item.done;

  // 일정에서 온 항목이면 일정 완료 상태도 함께 동기화
  if (item.scheduleId) {
    const sched = state.schedule.items.find(s => s.id === item.scheduleId);
    if (sched) sched.done = item.done;
  }

  // 공부 기록(포인트/잔디)에 반영: 할 일 1개 = 5P
  bumpLog(TASKS_LOG_KEY, todayStr(), item.done ? 1 : -1);

  if (item.done) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el) {
      el.classList.add('completing');
      const circle = el.querySelector('.check-circle');
      if (circle && particles) {
        const rect = circle.getBoundingClientRect();
        particles.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
      setTimeout(() => el.classList.remove('completing'), 400);
    }
  }

  saveStorage();
  renderChecklistItems();
  updateChecklistProgress();

  // 100% 달성 시 한 번 더 축하
  const total = state.checklist.items.length;
  const done  = state.checklist.items.filter(i => i.done).length;
  if (item.done && total > 0 && done === total && particles) {
    setTimeout(() => {
      particles.burst(window.innerWidth * 0.5, window.innerHeight * 0.35);
      showToast('오늘 할 일 전부 완료! 정말 대단해요', '🎉');
    }, 250);
  }
}

function removeChecklistItem(id) {
  const item = state.checklist.items.find(i => i.id === id);
  state.checklist.items = state.checklist.items.filter(i => i.id !== id);
  if (item && item.scheduleId) {
    state.schedule.items = state.schedule.items.filter(s => s.id !== item.scheduleId);
    renderScheduleItems();
  }
  saveStorage();
  renderChecklistItems();
  updateChecklistProgress();
  renderCalendar();
}

function renderChecklistItems() {
  const container = document.getElementById('checklist-items');
  if (!container) return;

  const active = state.checklist.items.filter(i => !i.done);
  const done   = state.checklist.items.filter(i => i.done);
  const ordered = [...active, ...done];

  if (state.checklist.items.length === 0) {
    // innerHTML 덮어쓰기로 기존 empty div가 사라졌을 수 있으므로 항상 다시 생성
    container.innerHTML = `
      <div class="empty-state-check" id="checklist-empty">
        <span class="empty-icon">🌟</span>
        <p>할 일을 추가하면<br>하나씩 완성해나갈 수 있어요!</p>
      </div>`;
    return;
  }

  container.innerHTML = ordered.map(item => `
    <div class="checklist-item ${item.done ? 'done' : ''}" data-id="${item.id}">
      <div class="check-circle ${item.done ? 'checked' : ''}"
           onclick="toggleChecklistItem('${item.id}')"></div>
      <span class="checklist-text">${escHtml(item.text)}</span>
      ${item.fromSchedule ? '<span class="from-schedule-tag">📋 일정</span>' : ''}
      <button class="check-delete" onclick="removeChecklistItem('${item.id}')">✕</button>
    </div>
  `).join('');
}

function updateChecklistProgress() {
  const total = state.checklist.items.length;
  const done  = state.checklist.items.filter(i => i.done).length;

  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  const banner = document.getElementById('all-done-banner');

  if (fill) fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
  if (text) text.textContent = `${done} / ${total} 완료`;
  if (banner) banner.style.display = (total > 0 && done === total) ? 'flex' : 'none';

  updateHomeStats();
  if (state.page === 'stats') renderStats();
}

/* ============================================================
   PARTICLE SYSTEM
   ============================================================ */
function ParticleSystem() {
  const canvas = document.getElementById('particle-canvas');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let running = false;

  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);

  this.burst = (x, y) => {
    if (PREFERS_REDUCED_MOTION) return; // 모션 최소화 설정 존중
    const colors = ['#C8956C','#E8A87C','#F4C97A','#E86B3C','#D4884A','#FFD700','#FF9F43','#EE5A24'];
    const count = 42;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i / count) + Math.random() * 0.6;
      const spd = Math.random() * 9 + 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * spd * (0.5 + Math.random()),
        vy: Math.sin(angle) * spd * (0.5 + Math.random()) - Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 9 + 4,
        life: 1,
        decay: Math.random() * 0.022 + 0.014,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 0.18,
        shape: Math.random() < 0.6 ? 'rect' : (Math.random() < 0.5 ? 'circle' : 'star')
      });
    }
    if (!running) animate();
  };

  function drawStar(c, r) {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a  = (Math.PI * 2 * i / 5) - Math.PI / 2;
      const bi = a + Math.PI / 5;
      if (i === 0) c.moveTo(r * Math.cos(a), r * Math.sin(a));
      else         c.lineTo(r * Math.cos(a), r * Math.sin(a));
      c.lineTo((r/2.2) * Math.cos(bi), (r/2.2) * Math.sin(bi));
    }
    c.closePath(); c.fill();
  }

  function animate() {
    running = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.life > 0.02);

    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.28; p.vx *= 0.985;
      p.life -= p.decay; p.rot += p.rotSpd;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);

      if (p.shape === 'rect') {
        ctx.fillRect(-p.size/2, -p.size/2 * 0.6, p.size, p.size * 0.6);
      } else if (p.shape === 'circle') {
        ctx.beginPath(); ctx.arc(0, 0, p.size/2, 0, Math.PI*2); ctx.fill();
      } else {
        drawStar(ctx, p.size / 2);
      }
      ctx.restore();
    });

    if (particles.length > 0) {
      requestAnimationFrame(animate);
    } else {
      running = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
}

/* ============================================================
   STORAGE
   ============================================================ */
function getAllSchedules() {
  try { return JSON.parse(localStorage.getItem(CAL_SCHEDULES_KEY)) || {}; } catch(_) { return {}; }
}

function saveAllSchedules(all) {
  try { localStorage.setItem(CAL_SCHEDULES_KEY, JSON.stringify(all)); } catch(_) {}
}

function getScheduleForDate(dateStr) {
  return getAllSchedules()[dateStr] || [];
}

function addScheduleToDate(dateStr, subject, desc, period) {
  const all = getAllSchedules();
  if (!all[dateStr]) all[dateStr] = [];
  const colors = ['#C8956C','#8B7BD4','#6BAF6B','#D45C5C','#5C8BD4','#D4A05C'];
  all[dateStr].push({ id: genId(), subject, desc, color: colors[all[dateStr].length % colors.length], done: false, period });
  saveAllSchedules(all);
}

function removeScheduleFromDate(dateStr, id) {
  const all = getAllSchedules();
  if (!all[dateStr]) return;
  all[dateStr] = all[dateStr].filter(i => i.id !== id);
  if (all[dateStr].length === 0) delete all[dateStr];
  saveAllSchedules(all);
}

function saveStorage() {
  const today = todayStr();
  // Sync today's schedule to multi-date store
  const all = getAllSchedules();
  all[today] = state.schedule.items;
  saveAllSchedules(all);
  // Save checklist to legacy store
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      date: today,
      schedule: state.schedule.items,
      checklist: state.checklist.items
    }));
  } catch(_) {}
}

function loadStorage() {
  const today = todayStr();
  // Load today's schedule from multi-date store
  state.schedule.items = getScheduleForDate(today);
  // Load checklist from legacy store
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.date === today) {
        state.checklist.items = data.checklist || [];
        // Migrate old schedule data if multi-date store is empty for today
        if (state.schedule.items.length === 0 && data.schedule && data.schedule.length > 0) {
          state.schedule.items = data.schedule;
          const all = getAllSchedules();
          all[today] = data.schedule;
          saveAllSchedules(all);
        }
      }
    }
  } catch(_) {}
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

const CARRYOVER_FLAG_KEY = 'hs_carryover_flag';

function carryOverYesterdaySchedule() {
  const today = todayStr();
  if (localStorage.getItem(CARRYOVER_FLAG_KEY) === today) return;
  localStorage.setItem(CARRYOVER_FLAG_KEY, today);

  const all = getAllSchedules();
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);

  // Pull undone items from every past date (not just yesterday), so a gap
  // of several unopened days doesn't leave older missed items stranded.
  const undone = [];
  Object.keys(all).forEach(dateStr => {
    if (dateStr === today) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const dObj = new Date(y, m - 1, d);
    if (dObj >= todayDate) return;
    const remaining = [];
    (all[dateStr] || []).forEach(item => {
      if (!item.done) undone.push(item);
      else remaining.push(item);
    });
    all[dateStr] = remaining;
  });
  if (undone.length === 0) return;
  saveAllSchedules(all);

  undone.forEach(orig => {
    const scheduleId = genId();
    state.schedule.items.push({
      id: scheduleId,
      subject: orig.subject,
      desc: orig.desc,
      color: orig.color,
      done: false,
      period: orig.period,
      carriedOver: true
    });
    state.checklist.items.push({
      id: genId(),
      text: orig.desc ? `${orig.subject} — ${orig.desc}` : orig.subject,
      done: false,
      fromSchedule: true,
      scheduleId
    });
  });

  saveStorage();
  showToast(`전에 못한 일정 ${undone.length}개를 오늘로 가져왔어요`, '❗');
}

/* ============================================================
   UTILS
   ============================================================ */
function genId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

/* ============================================================
   DATE POPUP
   ============================================================ */
function openDatePopup(year, month, day, key) {
  currentPopupDate = key;
  editingPopupId = null;
  const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
  const dow = new Date(year, month, day).getDay();
  const holidayName = HOLIDAYS_KR[key];
  document.getElementById('date-popup-title').textContent =
    `📅 ${month + 1}월 ${day}일 (${dayLabels[dow]})` + (holidayName ? ` · 🎌 ${holidayName}` : '');
  document.getElementById('date-popup-subject').value = '';
  document.getElementById('date-popup-desc').value = '';
  updatePopupPeriodUI();

  renderDatePopupItems();
  document.getElementById('date-popup-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('date-popup-subject').focus(), 80);
}

function closeDatePopup(e) {
  if (e && e.target.id !== 'date-popup-overlay') return;
  document.getElementById('date-popup-overlay').style.display = 'none';
  currentPopupDate = null;
  editingPopupId = null;
}

function editDatePopupItem(id) {
  editingPopupId = id;
  renderDatePopupItems();
}

function cancelEditDatePopup() {
  editingPopupId = null;
  renderDatePopupItems();
}

function saveEditDatePopup(id) {
  const subjectEl = document.getElementById(`popup-edit-subject-${id}`);
  const descEl = document.getElementById(`popup-edit-desc-${id}`);
  const periodEl = document.getElementById(`popup-edit-period-${id}`);
  const subject = subjectEl.value.trim();
  const desc = descEl.value.trim();

  if (!subject) {
    subjectEl.focus();
    subjectEl.style.borderColor = '#D45C5C';
    setTimeout(() => subjectEl.style.borderColor = '', 1200);
    return;
  }

  const isToday = currentPopupDate === todayStr();
  if (isToday) {
    const item = state.schedule.items.find(i => i.id === id);
    if (item) {
      item.subject = subject;
      item.desc = desc;
      if (periodEl) item.period = periodEl.value;
      const linked = state.checklist.items.find(c => c.scheduleId === id);
      if (linked) linked.text = desc ? `${subject} — ${desc}` : subject;
    }
    saveStorage();
    renderChecklistItems();
  } else {
    const all = getAllSchedules();
    const item = (all[currentPopupDate] || []).find(i => i.id === id);
    if (item) {
      item.subject = subject;
      item.desc = desc;
      if (periodEl) item.period = periodEl.value;
      saveAllSchedules(all);
    }
  }

  editingPopupId = null;
  renderDatePopupItems();
  renderCalendar();
  showToast('일정을 수정했어요', '✏️');
}

window.popupEdit = editDatePopupItem;
window.popupSave = saveEditDatePopup;
window.popupCancel = cancelEditDatePopup;

function renderDatePopupItems() {
  if (!currentPopupDate) return;
  const isToday = currentPopupDate === todayStr();
  const items = isToday ? state.schedule.items : getScheduleForDate(currentPopupDate);
  const body = document.getElementById('date-popup-body');
  const countEl = document.getElementById('date-popup-count');

  const done = items.filter(i => i.done).length;
  if (countEl) countEl.textContent = items.length > 0 ? `${done}/${items.length}` : '';

  if (items.length === 0) {
    body.innerHTML = '<p class="popup-empty">아직 일정이 없어요<br>아래에서 추가해보세요 ✏️</p>';
    return;
  }

  const renderItem = (item) => {
    if (editingPopupId === item.id) {
      const periodSelectHtml = isPeriodEnabled() ? `
        <select id="popup-edit-period-${item.id}" class="form-input" style="margin-bottom:6px">
          ${PERIOD_ORDER.map(p => `<option value="${p}" ${item.period === p ? 'selected' : ''}>${PERIOD_LABELS[p]}</option>`).join('')}
        </select>` : '';
      return `
        <div class="popup-item popup-sched-item-editing">
          <input type="text" id="popup-edit-subject-${item.id}" class="form-input" value="${escHtml(item.subject)}" style="margin-bottom:6px">
          ${periodSelectHtml}
          <input type="text" id="popup-edit-desc-${item.id}" class="form-input" value="${escHtml(item.desc || '')}" style="margin-bottom:8px">
          <div class="schedule-edit-actions">
            <button class="btn-primary" onclick="popupSave('${item.id}')">저장</button>
            <button class="modal-cancel" onclick="popupCancel()">취소</button>
          </div>
        </div>`;
    }
    return `
    <div class="popup-item popup-sched-item ${item.done ? 'sched-done' : ''}" onclick="toggleScheduleItemDone(event,'${item.id}')">
      <div class="popup-sched-check ${item.done ? 'checked' : ''}" style="border-color:${item.color}">
        ${item.done ? `<span style="color:${item.color}">✓</span>` : ''}
      </div>
      <div class="popup-sched-text">
        <div class="popup-sched-subject">${escHtml(item.subject)}${item.carriedOver ? ' <span class="carried-tag">❗ 못한 일정</span>' : ''}</div>
        ${item.desc ? `<div class="popup-sched-desc">${escHtml(item.desc)}</div>` : ''}
      </div>
      <button class="popup-item-edit" onclick="event.stopPropagation();popupEdit('${item.id}')">✎</button>
      <button class="popup-item-del" onclick="event.stopPropagation();deleteFromDatePopup('${item.id}')">✕</button>
    </div>`;
  };

  if (isPeriodEnabled()) {
    body.innerHTML = PERIOD_ORDER.map(period => {
      const pItems = items.filter(i => (i.period || 'afternoon') === period);
      if (pItems.length === 0) return '';
      return `<div class="schedule-period-header popup-period-header">${PERIOD_LABELS[period]}</div>${pItems.map(renderItem).join('')}`;
    }).join('');
  } else {
    body.innerHTML = items.map(renderItem).join('');
  }
}

function toggleScheduleItemDone(e, id) {
  const checkEl = e.currentTarget.querySelector('.popup-sched-check');

  const isToday = currentPopupDate === todayStr();
  let willBeDone = false;
  if (isToday) {
    const item = state.schedule.items.find(i => i.id === id);
    if (item) {
      item.done = !item.done;
      willBeDone = item.done;
      // 연결된 체크리스트 항목도 함께 동기화
      const linked = state.checklist.items.find(c => c.scheduleId === id);
      if (linked && linked.done !== item.done) {
        linked.done = item.done;
        bumpLog(TASKS_LOG_KEY, todayStr(), item.done ? 1 : -1);
        renderChecklistItems();
        updateChecklistProgress();
      }
      saveStorage();
    }
  } else {
    const all = getAllSchedules();
    const item = (all[currentPopupDate] || []).find(i => i.id === id);
    if (item) { item.done = !item.done; willBeDone = item.done; saveAllSchedules(all); }
  }

  if (willBeDone && particles && checkEl) {
    const rect = checkEl.getBoundingClientRect();
    particles.burst(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  renderDatePopupItems();
  renderCalendar();
}

function addToDatePopup() {
  const subject = document.getElementById('date-popup-subject').value.trim();
  const desc    = document.getElementById('date-popup-desc').value.trim();
  const periodEl = document.getElementById('date-popup-period');
  const period = isPeriodEnabled() ? (periodEl ? periodEl.value : 'afternoon') : undefined;
  if (!subject || !currentPopupDate) {
    const el = document.getElementById('date-popup-subject');
    if (el) { el.focus(); el.style.borderColor = '#D45C5C'; setTimeout(() => el.style.borderColor = '', 1200); }
    return;
  }

  const isToday = currentPopupDate === todayStr();
  if (isToday) {
    const colors = ['#C8956C','#8B7BD4','#6BAF6B','#D45C5C','#5C8BD4','#D4A05C'];
    const scheduleId = genId();
    state.schedule.items.push({ id: scheduleId, subject, desc, color: colors[state.schedule.items.length % colors.length], done: false, period });
    state.checklist.items.push({
      id: genId(),
      text: desc ? `${subject} — ${desc}` : subject,
      done: false,
      fromSchedule: true,
      scheduleId
    });
    saveStorage();
    renderScheduleItems();
    renderChecklistItems();
    updateChecklistProgress();
  } else {
    addScheduleToDate(currentPopupDate, subject, desc, period);
  }

  document.getElementById('date-popup-subject').value = '';
  document.getElementById('date-popup-desc').value = '';
  document.getElementById('date-popup-subject').focus();
  renderDatePopupItems();
  renderCalendar();
}

function deleteFromDatePopup(id) {
  if (editingPopupId === id) editingPopupId = null;
  const isToday = currentPopupDate === todayStr();
  if (isToday) {
    removeScheduleItem(id);
  } else {
    removeScheduleFromDate(currentPopupDate, id);
  }
  renderDatePopupItems();
  renderCalendar();
}

/* ============================================================
   API KEY MODAL
   ============================================================ */
function showSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const input = document.getElementById('api-key-input');
  const stored = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (stored) input.value = stored;
  // 현재 테마 반영
  const cur = localStorage.getItem('hs_app_theme') || 'default';
  document.querySelectorAll('.theme-pick-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === cur);
  });
  // 시간대 구분 토글 반영
  const periodToggle = document.getElementById('period-toggle-input');
  if (periodToggle) periodToggle.checked = isPeriodEnabled();
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 100);
}

function togglePeriodSetting(checked) {
  localStorage.setItem(PERIOD_ENABLED_KEY, checked ? '1' : '0');
  updateSchedulePeriodUI();
  updatePopupPeriodUI();
  renderScheduleItems();
  if (currentPopupDate) renderDatePopupItems();
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveAPIKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (key) localStorage.setItem(OPENAI_KEY_STORAGE, key);
  const ytKey = document.getElementById('yt-api-key-input').value.trim();
  if (ytKey) localStorage.setItem(YOUTUBE_KEY_STORAGE, ytKey);
  closeSettingsModal();
  if (key || ytKey) showToast('설정을 저장했어요', '✅');
}

// Close modal on overlay click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('settings-modal').addEventListener('click', (e) => {
    if (e.target.id === 'settings-modal') closeSettingsModal();
  });
  const k = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (k) document.getElementById('api-key-input').value = k;
  const yk = localStorage.getItem(YOUTUBE_KEY_STORAGE);
  if (yk) document.getElementById('yt-api-key-input').value = yk;
});

/* ============================================================
   THEME SYSTEM
   ============================================================ */
function setAppTheme(name) {
  document.body.classList.remove('sunset-theme', 'moonlit-theme');
  localStorage.setItem('hs_app_theme', name);

  stopHomeThemeBg();

  document.querySelectorAll('.theme-pick-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.theme === name);
  });

  if (name === 'sunset') {
    document.body.classList.add('sunset-theme');
    if (state.page === 'home') setTimeout(startSunsetHomeBg, 50);
  } else if (name === 'moonlit') {
    document.body.classList.add('moonlit-theme');
    if (state.page === 'home') setTimeout(startMoonlitHomeBg, 50);
  }
  // default: nothing extra needed
}

/* ============================================================
   HOME BG CANVAS — shared canvas for sunset & moonlit
   ============================================================ */
let homeThemeAnimFrame = null;
let homeThemeCanvas = null;
let homeThemeCtx = null;

function stopHomeThemeBg() {
  if (homeThemeAnimFrame) { cancelAnimationFrame(homeThemeAnimFrame); homeThemeAnimFrame = null; }
  if (homeThemeCtx && homeThemeCanvas) homeThemeCtx.clearRect(0, 0, homeThemeCanvas.width, homeThemeCanvas.height);
}

/* ---- Sunset ---- */
function startSunsetHomeBg() {
  homeThemeCanvas = document.getElementById('home-theme-canvas');
  if (!homeThemeCanvas) return;
  homeThemeCanvas.width  = homeThemeCanvas.offsetWidth  || (window.innerWidth - 220);
  homeThemeCanvas.height = homeThemeCanvas.offsetHeight || window.innerHeight;
  homeThemeCtx = homeThemeCanvas.getContext('2d');
  const canvas = homeThemeCanvas, ctx = homeThemeCtx;

  // Cirrus wisps that drift slowly
  const wisps = Array.from({length: 7}, (_, i) => ({
    x: Math.random(),
    y: 0.04 + Math.random() * 0.32,
    len: 0.10 + Math.random() * 0.18,
    op: 0.06 + Math.random() * 0.09,
    spd: 0.00008 + Math.random() * 0.00012,
    curve: (Math.random() - 0.5) * 0.018
  }));

  let fc = 0;

  function frame() {
    const w = canvas.width, h = canvas.height;
    fc++;

    // Deep twilight sky gradient — pure atmospheric, no silhouettes
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0,    '#08021a');
    sky.addColorStop(0.14, '#2e0848');
    sky.addColorStop(0.30, '#7a1040');
    sky.addColorStop(0.46, '#c43018');
    sky.addColorStop(0.60, '#e86010');
    sky.addColorStop(0.73, '#f09820');
    sky.addColorStop(0.85, '#f8c838');
    sky.addColorStop(1.0,  '#e88010');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Atmospheric haze bands — wide horizontal colour bleeds
    const hazeColors = [
      [0.25, 'rgba(180,40,60,0.08)'],
      [0.42, 'rgba(230,80,20,0.10)'],
      [0.58, 'rgba(255,148,30,0.08)'],
      [0.72, 'rgba(255,200,50,0.07)'],
    ];
    hazeColors.forEach(([yr, col]) => {
      const hg = ctx.createLinearGradient(0, h*(yr-0.06), 0, h*(yr+0.06));
      hg.addColorStop(0,   'rgba(0,0,0,0)');
      hg.addColorStop(0.5, col);
      hg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, h*(yr-0.06), w, h*0.12);
    });

    // Sun — positioned just above lower quarter, half-set effect
    const sunX = w * 0.50;
    const sunY = h * 0.78 + Math.sin(fc * 0.002) * 0.6;
    const sunR = Math.min(w, h) * 0.038;

    // Outer corona
    const corona = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.50);
    corona.addColorStop(0,    'rgba(255,248,200,0.55)');
    corona.addColorStop(0.06, 'rgba(255,215,80,0.32)');
    corona.addColorStop(0.18, 'rgba(255,145,30,0.16)');
    corona.addColorStop(0.40, 'rgba(210,70,0,0.07)');
    corona.addColorStop(1,    'rgba(120,10,0,0)');
    ctx.fillStyle = corona;
    ctx.fillRect(0, 0, w, h);

    // Crepuscular rays (subtle, from sun centre, upper half only)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let r = 0; r < 14; r++) {
      const ang = -Math.PI/2 + (r / 14) * Math.PI * 2;
      if (Math.sin(ang) > 0.12) continue; // only upward-ish rays
      const flicker = 0.028 + 0.016 * Math.sin(fc * 0.022 + r * 1.1);
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(
        sunX + Math.cos(ang) * w * 0.85,
        sunY + Math.sin(ang) * h * 0.85
      );
      ctx.strokeStyle = `rgba(255,195,70,${flicker})`;
      ctx.lineWidth = 1.5 + Math.sin(fc * 0.018 + r) * 0.8;
      ctx.stroke();
    }
    ctx.restore();

    // Sun disk
    const disk = ctx.createRadialGradient(sunX - sunR*0.2, sunY - sunR*0.2, 0, sunX, sunY, sunR);
    disk.addColorStop(0,   'rgba(255,255,230,0.98)');
    disk.addColorStop(0.5, 'rgba(255,218,80,0.92)');
    disk.addColorStop(1,   'rgba(255,130,20,0.72)');
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = disk;
    ctx.fill();

    // Cirrus high-altitude wisps
    wisps.forEach(w_ => {
      w_.x += w_.spd;
      if (w_.x - w_.len / 2 > 1.0) w_.x = -w_.len / 2;
      ctx.save();
      ctx.globalAlpha = w_.op + 0.02 * Math.sin(fc * 0.03 + w_.x * 8);
      ctx.strokeStyle = 'rgba(255,235,210,1)';
      ctx.lineWidth = 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const x0 = w_.x * w - w_.len * w / 2;
      const x1 = w_.x * w + w_.len * w / 2;
      const y0 = w_.y * h;
      const cpY = y0 + w_.curve * h;
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, cpY, x1, y0);
      ctx.stroke();
      ctx.restore();
    });

    homeThemeAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

/* ---- Moonlit ---- */
function startMoonlitHomeBg() {
  homeThemeCanvas = document.getElementById('home-theme-canvas');
  if (!homeThemeCanvas) return;
  homeThemeCanvas.width  = homeThemeCanvas.offsetWidth  || (window.innerWidth - 220);
  homeThemeCanvas.height = homeThemeCanvas.offsetHeight || window.innerHeight;
  homeThemeCtx = homeThemeCanvas.getContext('2d');
  const canvas = homeThemeCanvas, ctx = homeThemeCtx;

  const dust = Array.from({length: 38}, () => ({
    rx: Math.random(),
    ry: Math.random(),
    r:  Math.random() * 1.2 + 0.3,
    vx: (Math.random()-0.5) * 0.0018,
    vy: -(Math.random() * 0.003 + 0.0006),
    op: Math.random() * 0.48 + 0.14,
    phase: Math.random() * Math.PI * 2
  }));

  let t = 0;

  function frame() {
    const w = canvas.width, h = canvas.height;
    t += 0.01;

    const roomGrad = ctx.createLinearGradient(0, 0, 0, h);
    roomGrad.addColorStop(0,   '#030410');
    roomGrad.addColorStop(0.5, '#06081a');
    roomGrad.addColorStop(1,   '#090c1e');
    ctx.fillStyle = roomGrad;
    ctx.fillRect(0, 0, w, h);

    const winW = Math.min(w * 0.42, 310);
    const winH = Math.min(h * 0.46, 310);
    const winX = (w - winW) / 2;
    const winY = h * 0.07;
    const fW = 6;

    ctx.save();
    ctx.beginPath();
    ctx.rect(winX, winY, winW, winH);
    ctx.clip();

    const winSky = ctx.createLinearGradient(0, winY, 0, winY+winH);
    winSky.addColorStop(0, '#050c1c');
    winSky.addColorStop(1, '#0a1428');
    ctx.fillStyle = winSky;
    ctx.fillRect(winX, winY, winW, winH);

    const starData = [
      [0.08,0.06],[0.20,0.12],[0.38,0.04],[0.55,0.10],[0.72,0.06],[0.88,0.15],
      [0.12,0.28],[0.32,0.32],[0.48,0.22],[0.65,0.30],[0.82,0.24],
      [0.05,0.45],[0.25,0.50],[0.43,0.42],[0.60,0.48],[0.80,0.44],[0.93,0.08]
    ];
    starData.forEach(([rx, ry], i) => {
      const sx = winX + rx*winW, sy = winY + ry*winH;
      const pulse = 0.5 + 0.5*Math.sin(t*(0.7+i*0.13) + i*0.8);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + pulse*0.5, 0, Math.PI*2);
      ctx.fillStyle = `rgba(200,220,255,${0.44+pulse*0.46})`;
      ctx.fill();
    });

    const moonX = winX + winW*0.76;
    const moonY = winY + winH*0.24;
    const moonR = Math.min(winW, winH) * 0.12;

    const moonGlow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR*5);
    moonGlow.addColorStop(0,   'rgba(208,228,255,0.22)');
    moonGlow.addColorStop(0.4, 'rgba(165,198,255,0.10)');
    moonGlow.addColorStop(1,   'rgba(90,140,255,0)');
    ctx.fillStyle = moonGlow;
    ctx.fillRect(winX, winY, winW, winH);

    const moonCore = ctx.createRadialGradient(moonX-moonR*0.25, moonY-moonR*0.25, 0, moonX, moonY, moonR);
    moonCore.addColorStop(0,   'rgba(255,255,248,0.97)');
    moonCore.addColorStop(0.6, 'rgba(226,238,255,0.92)');
    moonCore.addColorStop(1,   'rgba(188,212,255,0.78)');
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI*2);
    ctx.fillStyle = moonCore;
    ctx.fill();

    [[0.28,0.22,0.09],[0.60,0.55,0.06],[0.18,0.62,0.05],[0.72,0.30,0.04]].forEach(([rx,ry,rs]) => {
      ctx.beginPath();
      ctx.arc(moonX+(rx-0.5)*moonR*2, moonY+(ry-0.5)*moonR*2, moonR*rs, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(168,192,228,0.28)';
      ctx.fill();
    });

    ctx.restore();

    ctx.fillStyle = '#181210';
    ctx.fillRect(winX-fW,   winY-fW,   winW+fW*2, fW);
    ctx.fillRect(winX-fW,   winY+winH, winW+fW*2, fW);
    ctx.fillRect(winX-fW,   winY-fW,   fW, winH+fW*2);
    ctx.fillRect(winX+winW, winY-fW,   fW, winH+fW*2);
    ctx.fillRect(winX, winY+winH*0.5-2, winW, 4);
    ctx.fillRect(winX+winW*0.5-2, winY, 4, winH);

    const bL  = winX + fW;
    const bR  = winX + winW - fW;
    const flY = h * 0.80;
    const sp  = winW * 0.13;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bL, winY+winH+fW);
    ctx.lineTo(bR, winY+winH+fW);
    ctx.lineTo(bR+sp, flY);
    ctx.lineTo(bL-sp, flY);
    ctx.closePath();
    const beamGrad = ctx.createLinearGradient(0, winY+winH, 0, flY);
    beamGrad.addColorStop(0,   'rgba(165,196,240,0.20)');
    beamGrad.addColorStop(0.5, 'rgba(148,178,232,0.12)');
    beamGrad.addColorStop(1,   'rgba(128,162,220,0.05)');
    ctx.fillStyle = beamGrad;
    ctx.fill();
    ctx.restore();

    const sway = Math.sin(t * 0.38) * (winW * 0.015);
    const beamHeight = flY - (winY+winH+fW);

    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#020308';
    const vmX = (bL + bR) / 2 + sway;
    ctx.beginPath();
    ctx.moveTo(vmX-3, winY+winH+fW);
    ctx.lineTo(vmX+3, winY+winH+fW);
    ctx.lineTo(vmX+5+sway*0.2, flY);
    ctx.lineTo(vmX-5+sway*0.2, flY);
    ctx.closePath();
    ctx.fill();
    const hBarY = winY+winH+fW + beamHeight*0.5;
    ctx.fillRect(bL-sp*0.5+sway, hBarY-2.5, (bR+sp*0.5)-(bL-sp*0.5), 5);
    ctx.restore();

    dust.forEach(d => {
      d.rx += d.vx; d.ry += d.vy;
      if (d.ry < -0.05) d.ry = 1.05;
      if (d.rx < -0.05 || d.rx > 1.05) d.rx = Math.random();
      const dBL = bL - sp*d.ry;
      const dBW = (bR - bL) + 2*sp*d.ry;
      const px  = dBL + d.rx * dBW;
      const py  = (winY+winH+fW) + d.ry * beamHeight;
      const pulse = 0.5 + 0.5*Math.sin(t*1.8 + d.phase);
      ctx.beginPath();
      ctx.arc(px, py, d.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(198,218,255,${d.op*pulse})`;
      ctx.fill();
    });

    ctx.beginPath();
    ctx.moveTo(0, flY);
    ctx.lineTo(w, flY);
    ctx.strokeStyle = 'rgba(75,105,158,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const flRefl = ctx.createLinearGradient(0, flY, 0, flY + h*0.14);
    flRefl.addColorStop(0, 'rgba(128,162,220,0.07)');
    flRefl.addColorStop(1, 'rgba(128,162,220,0)');
    ctx.fillStyle = flRefl;
    ctx.fillRect(bL-sp, flY, (bR+sp)-(bL-sp)+sp*0.5, h*0.14);

    homeThemeAnimFrame = requestAnimationFrame(frame);
  }
  frame();
}

// 앱 시작 시 저장된 테마 적용
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('hs_app_theme') || 'default';
  if (saved !== 'default') setAppTheme(saved);
});

/* ============================================================
   MEMO PANEL
   ============================================================ */
const MEMO_STORAGE_KEY = 'hs_notepad_memo';

function initMemo() {
  const btn = document.getElementById('memo-star-btn');
  btn.style.display = 'flex';
  const cloverBtn = document.getElementById('clover-btn');
  if (cloverBtn) cloverBtn.style.display = 'flex';

  const textarea = document.getElementById('memo-textarea');
  textarea.value = localStorage.getItem(MEMO_STORAGE_KEY) || '';
  updateMemoCharCount(textarea.value.length);
}

function toggleMemoPanel() {
  const panel = document.getElementById('memo-panel');
  const btn = document.getElementById('memo-star-btn');
  const isOpen = panel.style.display !== 'none';

  if (isOpen) {
    panel.style.display = 'none';
    btn.classList.remove('open');
  } else {
    panel.style.display = 'flex';
    btn.classList.add('open');
    const textarea = document.getElementById('memo-textarea');
    textarea.value = localStorage.getItem(MEMO_STORAGE_KEY) || '';
    updateMemoCharCount(textarea.value.length);
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }
}

function saveMemo(value) {
  localStorage.setItem(MEMO_STORAGE_KEY, value);
  updateMemoCharCount(value.length);
}

function updateMemoCharCount(len) {
  const el = document.getElementById('memo-char-count');
  if (el) el.textContent = `${len.toLocaleString()}자`;
}

function updateMemoStarVisibility(page) {
  const btn = document.getElementById('memo-star-btn');
  const cloverBtn = document.getElementById('clover-btn');
  if (!btn) return;
  if (page === 'home') {
    btn.style.display = 'flex';
    if (cloverBtn) cloverBtn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
    const panel = document.getElementById('memo-panel');
    if (panel) panel.style.display = 'none';
    btn.classList.remove('open');
    if (cloverBtn) cloverBtn.style.display = 'none';
    closeCloverModal();
  }
}

/* ============================================================
   VIDEO SEARCH — 강의 영상 찾기
   ============================================================ */
function vsShow(id, show) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!show) { el.style.display = 'none'; return; }
  el.style.display = (id === 'vs-results-wrap') ? 'block' : 'flex';
}

function renderVsChips() {
  const history = JSON.parse(localStorage.getItem(VS_HISTORY_KEY) || '[]');
  const wrap = document.getElementById('vs-chips');
  if (!wrap) return;
  if (!history.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = '<span class="vs-chip-label">최근 검색:</span>' +
    history.slice(0, 5).map((q, i) => `
      <span class="vs-chip" onclick="vsFromChip('${q.replace(/'/g,"\\'")}')">
        🕐 ${q}
        <span class="vs-chip-x" onclick="vsRemoveChip(event,${i})">✕</span>
      </span>`).join('');
}

function vsAddHistory(query) {
  let h = JSON.parse(localStorage.getItem(VS_HISTORY_KEY) || '[]');
  h = [query, ...h.filter(q => q !== query)].slice(0, 8);
  localStorage.setItem(VS_HISTORY_KEY, JSON.stringify(h));
  renderVsChips();
}

function vsFromChip(query) {
  // Split stored "교재 § 번호" format back
  const [book, prob] = query.split(' § ');
  document.getElementById('vs-book').value = book || query;
  document.getElementById('vs-problem').value = prob || '';
  searchLectureVideos();
}

function vsRemoveChip(e, idx) {
  e.stopPropagation();
  let h = JSON.parse(localStorage.getItem(VS_HISTORY_KEY) || '[]');
  h.splice(idx, 1);
  localStorage.setItem(VS_HISTORY_KEY, JSON.stringify(h));
  renderVsChips();
}

async function searchLectureVideos() {
  const book    = document.getElementById('vs-book').value.trim();
  const problem = document.getElementById('vs-problem').value.trim();
  if (!book) { document.getElementById('vs-book').focus(); return; }

  const query = problem ? `${book} ${problem} 풀이 강의` : `${book} 풀이 강의`;
  const histKey = problem ? `${book} § ${problem}` : book;

  // UI state: loading
  vsShow('vs-loading', true);
  vsShow('vs-results-wrap', false);
  vsShow('vs-empty', false);
  const errEl = document.getElementById('vs-error');
  if (errEl) errEl.remove();

  const btn = document.getElementById('vs-search-btn');
  btn.disabled = true;

  const apiKey = localStorage.getItem(YOUTUBE_KEY_STORAGE);
  const params = new URLSearchParams({
    part:              'snippet',
    q:                 query,
    type:              'video',
    order:             'relevance',
    maxResults:        '8',
    relevanceLanguage: 'ko',
    videoEmbeddable:   'true',
    videoCategoryId:   '27',   // Education
    key:               apiKey
  });

  try {
    const res  = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await res.json();

    if (data.error) throw new Error(data.error.message);

    vsShow('vs-loading', false);
    btn.disabled = false;

    const items = data.items || [];
    if (!items.length) {
      vsShow('vs-empty', true);
      return;
    }

    vsAddHistory(histKey);

    document.getElementById('vs-results-label').textContent =
      `"${book}${problem ? ' ' + problem : ''}" 강의 검색 결과`;
    document.getElementById('vs-results-count').textContent = `${items.length}개`;

    document.getElementById('vs-results-grid').innerHTML = items.map(item => {
      const vid     = item.id.videoId;
      const title   = escHtml(htmlDecode(item.snippet.title));
      const channel = escHtml(htmlDecode(item.snippet.channelTitle));
      const thumb   = item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url || '';
      const url     = `https://www.youtube.com/watch?v=${vid}`;
      return `
        <a class="vs-card" href="${url}" target="_blank" rel="noopener" title="${title}">
          <div class="vs-thumb-wrap">
            <img src="${thumb}" alt="" loading="lazy">
            <div class="vs-play-overlay">
              <div class="vs-play-icon">▶</div>
            </div>
          </div>
          <div class="vs-info">
            <div class="vs-video-title">${title}</div>
            <div class="vs-channel">📺 ${channel}</div>
            <div class="vs-meta">
              <span class="vs-yt-badge">▶ YouTube</span>
              <span class="vs-open-hint">클릭하면 유튜브로 이동해요</span>
            </div>
          </div>
        </a>`;
    }).join('');

    vsShow('vs-results-wrap', true);

  } catch (err) {
    vsShow('vs-loading', false);
    btn.disabled = false;
    const wrap = document.querySelector('.vs-hero');
    const errDiv = document.createElement('div');
    errDiv.id = 'vs-error';
    errDiv.className = 'vs-error';
    errDiv.textContent = `검색 중 오류가 발생했어요: ${err.message}`;
    document.getElementById('page-video').insertBefore(errDiv, document.querySelector('.vs-results-wrap'));
  }
}

// Enter key on inputs triggers search
document.addEventListener('DOMContentLoaded', () => {
  ['vs-book','vs-problem'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') searchLectureVideos(); });
  });
  renderVsChips();
});

/* ============================================================
   CLOVER MOTIVATION
   ============================================================ */
function openCloverModal() {
  resetCloverModal();
  document.getElementById('clover-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('clover-textarea').focus(), 100);
}

function closeCloverModal() {
  const modal = document.getElementById('clover-modal');
  if (modal) modal.style.display = 'none';
}

function cloverModalBgClick(e) {
  if (e.target.id === 'clover-modal') closeCloverModal();
}

function resetCloverModal() {
  document.getElementById('clover-textarea').value = '';
  document.getElementById('clover-input-area').style.display = 'block';
  document.getElementById('clover-loading').style.display = 'none';
  document.getElementById('clover-result').style.display = 'none';
}

async function fetchCloverMotivation() {
  const text = document.getElementById('clover-textarea').value.trim();
  if (!text) {
    const ta = document.getElementById('clover-textarea');
    ta.style.borderColor = '#D45C5C';
    ta.focus();
    setTimeout(() => ta.style.borderColor = '', 1200);
    return;
  }

  const apiKey = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (!apiKey) { showSettingsModal(); return; }

  document.getElementById('clover-input-area').style.display = 'none';
  document.getElementById('clover-loading').style.display = 'block';
  document.getElementById('clover-result').style.display = 'none';

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 400,
        messages: [
          {
            role: 'system',
            content: '당신은 홈스쿨러 한지윤의 가장 따뜻한 응원자입니다. 학생이 적은 내용을 읽고, 진심 어린 공감과 강력한 동기부여 메시지를 3~4문장으로 전해주세요. 네잎클로버처럼 행운과 희망을 전하는 톤으로, 따뜻하고 구체적으로 응원해주세요. 학생의 말을 직접 언급하며 개인화해주세요.'
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);

    const reply = json.choices[0].message.content;
    document.getElementById('clover-loading').style.display = 'none';
    document.getElementById('clover-result').style.display = 'block';
    document.getElementById('clover-result-text').textContent = reply;
  } catch (err) {
    document.getElementById('clover-loading').style.display = 'none';
    document.getElementById('clover-input-area').style.display = 'block';
    const ta = document.getElementById('clover-textarea');
    ta.style.borderColor = '#D45C5C';
    setTimeout(() => ta.style.borderColor = '', 1200);
    alert('오류가 발생했어요: ' + escHtml(err.message));
  }
}

/* ============================================================
   STUDY PAGE
   ============================================================ */
const studyState = {
  activeSubject: null,  // { id, subject, desc, color, roleInfo }
  messages: [],         // [{ role: 'user'|'ai', content }]
  isLoading: false
};

function getSubjectRole(subject) {
  const s = subject.toLowerCase();
  const roles = [
    { keys: ['수학', 'math'], role: '수학 선생님', emoji: '📐',
      prompt: '당신은 열정적인 수학 선생님입니다. 공식과 원리를 단계별로 쉽게 설명하고, 학생이 스스로 풀도록 유도해주세요.' },
    { keys: ['영어', 'english'], role: '영어 선생님', emoji: '🌍',
      prompt: '당신은 친절한 영어 선생님입니다. 문법, 독해, 단어, 회화를 재미있게 설명하고, 틀린 영어 표현이 있으면 부드럽게 교정해주세요.' },
    { keys: ['물리'], role: '물리 선생님', emoji: '⚡',
      prompt: '당신은 물리 선생님입니다. 물리 현상과 공식을 실생활 예시와 함께 설명하세요.' },
    { keys: ['화학'], role: '화학 선생님', emoji: '🧪',
      prompt: '당신은 화학 선생님입니다. 원소, 반응, 결합 등을 시각적으로 상상하기 쉽게 설명하세요.' },
    { keys: ['생물', '생명과학'], role: '생물 선생님', emoji: '🌱',
      prompt: '당신은 생물 선생님입니다. 생명 현상과 원리를 재미있는 예시와 함께 설명하세요.' },
    { keys: ['과학'], role: '과학 선생님', emoji: '🔬',
      prompt: '당신은 과학 선생님입니다. 과학 원리를 탐구 정신으로 흥미롭게 설명하세요.' },
    { keys: ['한국사', '국사'], role: '한국사 선생님', emoji: '🏯',
      prompt: '당신은 한국사 선생님입니다. 역사적 사건과 흐름을 이야기처럼 생생하게 들려주세요.' },
    { keys: ['세계사', '역사'], role: '역사 선생님', emoji: '📜',
      prompt: '당신은 역사 선생님입니다. 역사적 사건, 인물, 시대 배경을 스토리텔링으로 설명하세요.' },
    { keys: ['국어', '문학', '작문', '독서'], role: '국어 선생님', emoji: '📝',
      prompt: '당신은 국어 선생님입니다. 문학 작품 해석, 글쓰기, 문법을 학생의 감수성에 맞게 안내하세요.' },
    { keys: ['사회', '지리', '경제', '정치'], role: '사회 선생님', emoji: '🌏',
      prompt: '당신은 사회 선생님입니다. 사회 현상, 지리, 경제를 현실적 사례와 함께 설명하세요.' },
    { keys: ['음악'], role: '음악 선생님', emoji: '🎵',
      prompt: '당신은 음악 선생님입니다. 음악 이론, 악기, 악보 읽기, 음악사를 쉽게 가르쳐주세요.' },
    { keys: ['미술'], role: '미술 선생님', emoji: '🎨',
      prompt: '당신은 미술 선생님입니다. 그림 기법, 색채 이론, 미술사, 창작을 재미있게 안내하세요.' },
    { keys: ['코딩', '프로그래밍', '컴퓨터'], role: '코딩 선생님', emoji: '💻',
      prompt: '당신은 코딩 선생님입니다. 프로그래밍 개념, 알고리즘, 코드 디버깅을 단계별로 친절히 설명하세요.' },
    { keys: ['체육', '스포츠'], role: '체육 선생님', emoji: '⚽',
      prompt: '당신은 체육 선생님입니다. 운동 기술, 스포츠 규칙, 건강 관리를 활기차게 알려주세요.' },
  ];

  for (const r of roles) {
    if (r.keys.some(k => s.includes(k))) {
      return { role: r.role, emoji: r.emoji, prompt: r.prompt };
    }
  }
  return {
    role: '전담 선생님',
    emoji: '🧑‍🏫',
    prompt: `당신은 ${subject} 전담 선생님입니다. 친절하고 열정적으로, 학생 수준에 맞게 설명해주세요.`
  };
}

function renderStudyPage() {
  const container = document.getElementById('study-subject-list');
  if (!container) return;

  if (state.schedule.items.length === 0) {
    // empty div가 innerHTML 덮어쓰기로 사라졌을 수 있으므로 항상 다시 생성
    container.innerHTML = `
      <div class="empty-state-check" id="study-empty">
        <span class="empty-icon">📚</span>
        <p>먼저 「오늘 일정」에서 과목을 추가해주세요!<br>과목마다 전담 AI 선생님이 기다리고 있어요.</p>
        <button class="study-goto-schedule-btn" onclick="navigate('schedule')">일정 추가하러 가기 →</button>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="study-subject-grid">
      ${state.schedule.items.map(item => {
        const r = getSubjectRole(item.subject);
        return `
          <div class="study-subject-card">
            <div class="study-subject-card-color" style="background:${item.color}"></div>
            <div class="study-subject-card-body">
              <div class="study-subject-card-name">${r.emoji} ${escHtml(item.subject)}</div>
              ${item.desc ? `<div class="study-subject-card-desc">${escHtml(item.desc)}</div>` : ''}
            </div>
            <div class="study-subject-card-right">
              <span class="study-subject-role-tag">${r.role}</span>
              <button class="study-start-btn" onclick="startStudySession('${item.id}')">학습 시작하기 →</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function startStudySession(scheduleId) {
  const item = state.schedule.items.find(i => i.id === scheduleId);
  if (!item) return;

  const roleInfo = getSubjectRole(item.subject);
  studyState.activeSubject = { ...item, roleInfo };
  studyState.messages = [];
  studyState.isLoading = false;

  document.getElementById('study-list-view').style.display = 'none';
  const chatView = document.getElementById('study-chat-view');
  chatView.style.display = 'flex';
  document.getElementById('page-study').classList.add('chat-active');

  document.getElementById('study-chat-emoji').textContent = roleInfo.emoji;
  document.getElementById('study-chat-subject-name').textContent = item.subject;
  const descEl = document.getElementById('study-chat-desc');
  descEl.textContent = item.desc ? `오늘 학습: ${item.desc}` : '';
  document.getElementById('study-role-badge').textContent = roleInfo.role;
  document.getElementById('study-chat-messages').innerHTML = '';

  const welcomeMsg = item.desc
    ? `안녕하세요, 지윤이! ${roleInfo.emoji} 저는 ${roleInfo.role}이에요.\n\n오늘은 **${item.subject}** — "${item.desc}"를 공부하는군요, 멋져요! 👍\n\n어디서부터 시작할까요? 모르는 개념, 문제 풀이, 설명이 필요한 부분 뭐든 편하게 물어봐요!`
    : `안녕하세요, 지윤이! ${roleInfo.emoji} 저는 ${roleInfo.role}이에요.\n\n오늘 **${item.subject}** 공부를 도와드릴게요. 궁금한 것, 어려운 것 뭐든 편하게 물어봐요! 😊`;

  appendStudyMsg('ai', welcomeMsg);

  setTimeout(() => {
    const input = document.getElementById('study-chat-input');
    if (input) input.focus();
  }, 100);
}

function backToStudyList() {
  studyState.activeSubject = null;
  studyState.messages = [];

  const chatView = document.getElementById('study-chat-view');
  if (chatView) chatView.style.display = 'none';
  const listView = document.getElementById('study-list-view');
  if (listView) listView.style.display = 'block';
  const pageEl = document.getElementById('page-study');
  if (pageEl) pageEl.classList.remove('chat-active');
}

function appendStudyMsg(role, content) {
  studyState.messages.push({ role, content });

  const container = document.getElementById('study-chat-messages');
  if (!container) return;

  const isUser = role === 'user';
  const avatar = isUser ? '🧑' : (studyState.activeSubject?.roleInfo?.emoji || '🤖');

  const formatted = escHtml(content)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');

  const el = document.createElement('div');
  el.className = `study-msg ${isUser ? 'user' : 'ai'}`;
  el.innerHTML = `
    <div class="study-msg-avatar">${avatar}</div>
    <div class="study-msg-bubble">${formatted}</div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function showStudyTyping() {
  const container = document.getElementById('study-chat-messages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'study-msg ai';
  el.id = 'study-typing';
  el.innerHTML = `
    <div class="study-msg-avatar">${studyState.activeSubject?.roleInfo?.emoji || '🤖'}</div>
    <div class="study-typing-bubble">
      <div class="study-typing-dot"></div>
      <div class="study-typing-dot"></div>
      <div class="study-typing-dot"></div>
    </div>
  `;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function removeStudyTyping() {
  const el = document.getElementById('study-typing');
  if (el) el.remove();
}

async function sendStudyMessage() {
  if (studyState.isLoading) return;

  const input   = document.getElementById('study-chat-input');
  const sendBtn = document.getElementById('study-send-btn');
  const text = input.value.trim();
  if (!text) return;

  const apiKey = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (!apiKey) { showSettingsModal(); return; }

  input.value = '';
  input.style.height = 'auto';

  appendStudyMsg('user', text);

  studyState.isLoading = true;
  if (sendBtn) sendBtn.disabled = true;
  showStudyTyping();

  const item     = studyState.activeSubject;
  const roleInfo = item.roleInfo;

  const systemContent =
    `${roleInfo.prompt}\n\n` +
    `학생: 홈스쿨러 한지윤\n` +
    `과목: ${item.subject}` +
    (item.desc ? `\n오늘 학습 목표: ${item.desc}` : '') +
    `\n\n지시: 한국어로 대화하세요. 친절하고 따뜻하게, 어려운 내용은 단계별로 쉽게 설명하고, ` +
    `격려를 아끼지 마세요. 수식이나 예시가 도움이 될 때는 적극 활용하세요.`;

  // 최근 14개 메시지를 히스토리로 (마지막 user 메시지는 제외, API에서 직접 전달)
  const history = studyState.messages
    .slice(0, -1)
    .slice(-14)
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 1200,
        messages: [
          { role: 'system', content: systemContent },
          ...history,
          { role: 'user', content: text }
        ]
      })
    });

    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);

    const reply = json.choices[0].message.content;
    removeStudyTyping();
    appendStudyMsg('ai', reply);
  } catch (err) {
    removeStudyTyping();
    appendStudyMsg('ai', `⚠️ 오류가 발생했어요: ${escHtml(err.message)}\n잠시 후 다시 시도해봐요.`);
  } finally {
    studyState.isLoading = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

/* ============================================================
   BASKETBALL GAME
   ============================================================ */
const GRAV      = 0.46;
const MAX_PULL  = 140;
const MAX_SPD   = 20;

const BB = {
  canvas: null, ctx: null, initialized: false,
  score: 0, shots: 0, streak: 0,
  phase: 'idle',   // idle | aiming | flying | scored
  ball: { x: 0, y: 0, vx: 0, vy: 0, r: 17, spin: 0, spinV: 0, bounces: 0 },
  hoop: { x: 0, y: 0, targetY: 0, hw: 32 },
  drag: { active: false, x: 0, y: 0 },
  net: Array.from({length: 8}, (_, i) => ({ sway: 0, vel: 0 })),
  popup: null,
  t: 0,
  resetTimer: null,
  scoreFlash: 0,
  missFlash: 0
};

function ensureBballInit() {
  if (BB.initialized) return;
  BB.initialized = true;
  const c = document.getElementById('bball-canvas');
  if (!c) return;
  BB.canvas = c;
  BB.ctx = c.getContext('2d');
  _bbResize();
  window.addEventListener('resize', _bbResize);
  c.addEventListener('mousedown', bbDown);
  document.addEventListener('mousemove', bbMove);
  document.addEventListener('mouseup',   bbUp);
  c.addEventListener('touchstart', e => { e.preventDefault(); bbDown(e.touches[0]); }, { passive: false });
  c.addEventListener('touchmove',  e => { e.preventDefault(); bbMove(e.touches[0]); }, { passive: false });
  c.addEventListener('touchend',   e => { e.preventDefault(); bbUp(e.changedTouches[0]); }, { passive: false });
  requestAnimationFrame(bbTick);
}

function _bbResize() {
  const c = BB.canvas;
  if (!c) return;
  c.width  = c.offsetWidth  || 640;
  c.height = c.offsetHeight || 420;
  _bbInitPositions();
}

function _bbInitPositions() {
  const W = BB.canvas.width, H = BB.canvas.height;
  const floorY = Math.round(H * 0.64);
  BB.ball.x = Math.round(W * 0.13);
  BB.ball.y = floorY - BB.ball.r - 1;
  BB.ball.spin = 0; BB.ball.spinV = 0;
  BB.hoop.x = W - 66;  // back of rim flush against right-wall backboard
  BB.hoop.y = BB.hoop.targetY = Math.round(H * 0.33);
}

function _bbGetPos(e) {
  const r = BB.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (BB.canvas.width  / r.width),
    y: (e.clientY - r.top)  * (BB.canvas.height / r.height)
  };
}

function bbDown(e) {
  if (BB.phase !== 'idle') return;
  const p = _bbGetPos(e);
  BB.drag.active = true;
  BB.drag.x = p.x; BB.drag.y = p.y;
  BB.phase = 'aiming';
}

function bbMove(e) {
  if (!BB.drag.active) return;
  const p = _bbGetPos(e);
  BB.drag.x = p.x; BB.drag.y = p.y;
}

function bbUp(e) {
  if (!BB.drag.active || BB.phase !== 'aiming') {
    BB.drag.active = false;
    if (BB.phase === 'aiming') BB.phase = 'idle';
    return;
  }
  const b = BB.ball;
  const dx = b.x - BB.drag.x;
  const dy = b.y - BB.drag.y;
  const dist = Math.min(Math.hypot(dx, dy), MAX_PULL);
  if (dist < 8) { BB.drag.active = false; BB.phase = 'idle'; return; }
  const power = (dist / MAX_PULL) * MAX_SPD;
  const len   = Math.hypot(dx, dy);
  b.vx = (dx / len) * power;
  b.vy = (dy / len) * power;
  b.spinV = b.vx * 0.07;
  b.bounces = 0;
  BB.drag.active = false;
  BB.phase = 'flying';
  BB.shots++;
  document.getElementById('bball-shots').textContent = BB.shots;
}

function resetBball() {
  clearTimeout(BB.resetTimer);
  BB.score = 0; BB.shots = 0; BB.streak = 0;
  BB.phase = 'idle'; BB.drag.active = false;
  BB.popup = null; BB.scoreFlash = 0; BB.missFlash = 0;
  BB.net.forEach(s => { s.sway = 0; s.vel = 0; });
  if (BB.canvas) {
    BB.hoop.y = BB.hoop.targetY = Math.round(BB.canvas.height * 0.33);
    _bbInitPositions();
  }
  document.getElementById('bball-score').textContent = '0';
  document.getElementById('bball-shots').textContent = '0';
  const sw = document.getElementById('bball-streak-stat');
  if (sw) sw.style.display = 'none';
}

function bbTick() {
  if (!BB.ctx) { requestAnimationFrame(bbTick); return; }
  const { canvas, ctx, ball: b, hoop, drag } = BB;
  const W = canvas.width, H = canvas.height;
  const floorY = Math.round(H * 0.64);
  BB.t++;

  // Lerp hoop to target
  hoop.y += (hoop.targetY - hoop.y) * 0.055;

  // Net spring
  BB.net.forEach(s => {
    s.vel += -s.sway * 0.22;
    s.vel *= 0.80;
    s.sway += s.vel;
  });

  // Decrement flashes
  if (BB.scoreFlash > 0) BB.scoreFlash--;
  if (BB.missFlash  > 0) BB.missFlash--;
  if (BB.popup) { BB.popup.life--; if (BB.popup.life <= 0) BB.popup = null; }

  // Ball physics
  if (BB.phase === 'flying' || BB.phase === 'scored') {
    b.vy += GRAV;
    b.x  += b.vx;
    b.y  += b.vy;
    b.spin += b.spinV;
    b.spinV *= 0.985;

    // Wall bounces
    if (b.x - b.r < 0)   { b.x = b.r;   b.vx =  Math.abs(b.vx) * 0.58; b.spinV *= -0.6; }
    if (b.x + b.r > W)   { b.x = W-b.r; b.vx = -Math.abs(b.vx) * 0.58; b.spinV *= -0.6; }
    // Ceiling: no interaction — ball can fly above canvas and fall back down

    // Floor
    if (b.y + b.r >= floorY) {
      b.y = floorY - b.r;
      b.vy *= -0.42;
      b.vx *= 0.75;
      b.spinV *= 0.6;
      b.bounces++;
      const settled = Math.abs(b.vy) < 1.5 || b.bounces >= 3;
      if (settled && BB.phase === 'flying') {
        BB.missFlash = 30; BB.streak = 0;
        _bbUpdateStreak();
        BB.phase = 'idle';
        _bbInitPositions();
      } else if (settled && BB.phase === 'scored') {
        BB.phase = 'idle';
        _bbInitPositions();
      }
    }

    // Rim collision
    if (BB.phase === 'flying') {
      const frontX = hoop.x - hoop.hw;
      const backX  = hoop.x + hoop.hw;
      const rimY   = hoop.y;

      // Front rim hit
      if (Math.hypot(b.x - frontX, b.y - rimY) < b.r + 5 && Math.abs(b.vy) > 0.3) {
        const ang = Math.atan2(b.y - rimY, b.x - frontX);
        const spd = Math.hypot(b.vx, b.vy) * 0.52;
        b.vx = Math.cos(ang) * spd;
        b.vy = Math.sin(ang) * spd - 0.5;
        b.spinV *= -0.7;
      }
      // Back rim hit
      if (Math.hypot(b.x - backX, b.y - rimY) < b.r + 5 && Math.abs(b.vy) > 0.3) {
        const ang = Math.atan2(b.y - rimY, b.x - backX);
        const spd = Math.hypot(b.vx, b.vy) * 0.52;
        b.vx = Math.cos(ang) * spd;
        b.vy = Math.sin(ang) * spd - 0.5;
        b.spinV *= -0.7;
      }

      // Score detection
      const inXWindow = b.x > frontX + b.r * 0.65 && b.x < backX - b.r * 0.65;
      const inYWindow = b.y >= rimY - 2 && b.y <= rimY + 22;
      if (b.vy > 0.8 && inXWindow && inYWindow) {
        BB.score++; BB.streak++;
        document.getElementById('bball-score').textContent = BB.score;
        _bbUpdateStreak();
        BB.net.forEach(s => { s.vel += (Math.random() - 0.4) * 5 + 3.5; });
        BB.scoreFlash = 22;
        BB.phase = 'scored';
        b.vx *= 0.08; b.vy = Math.abs(b.vy) * 0.2;

        if (particles) {
          const rect = canvas.getBoundingClientRect();
          particles.burst(
            rect.left + (hoop.x / W) * rect.width,
            rect.top  + (hoop.y / H) * rect.height
          );
        }

        const msgs = ['SWISH!', 'NICE!', '완벽!', '굿샷!', 'CLEAN!'];
        const streakTxt = BB.streak >= 3 ? `  ${BB.streak}연속 🔥` : '';
        BB.popup = { text: msgs[BB.score % msgs.length] + streakTxt,
          x: hoop.x, y: hoop.y - 55, life: 85, maxLife: 85,
          color: BB.streak >= 3 ? '#FFD700' : '#44FF88' };

        // Move hoop to new height
        const minY = H * 0.17, maxY = H * 0.60;
        let ny;
        do { ny = minY + Math.random() * (maxY - minY); }
        while (Math.abs(ny - hoop.targetY) < (maxY - minY) * 0.28);
        hoop.targetY = ny;

        clearTimeout(BB.resetTimer);
        BB.resetTimer = setTimeout(() => {
          if (BB.phase === 'scored') { BB.phase = 'idle'; _bbInitPositions(); }
        }, 1200);
      }
    }
  }

  // Draw scene
  _bbDraw(ctx, W, H, floorY);
  requestAnimationFrame(bbTick);
}

function _bbDraw(ctx, W, H, floorY) {
  const { ball: b, hoop, drag, net, phase } = BB;
  ctx.clearRect(0, 0, W, H);

  // ── Arena background ──
  const bg = ctx.createLinearGradient(0, 0, 0, floorY);
  bg.addColorStop(0,   '#0a0a18');
  bg.addColorStop(0.55,'#111130');
  bg.addColorStop(1,   '#1a1a40');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, floorY);

  // Spotlight cones
  [[W * 0.25, '#FFE8A0', 0.10], [W * 0.75, '#E0D8FF', 0.08]].forEach(([sx, col, a]) => {
    const sg = ctx.createRadialGradient(sx, 0, 0, sx, 0, H * 0.78);
    sg.addColorStop(0,   col.replace(')', `,${a})`).replace('rgb','rgba'));
    sg.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, floorY);
  });

  // Crowd silhouettes
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let cx = 12; cx < W; cx += 20) {
    const bh = 8 + Math.sin(cx * 0.31 + BB.t * 0.003) * 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, floorY - 1, 9, bh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Wood floor ──
  const fg = ctx.createLinearGradient(0, floorY, 0, H);
  fg.addColorStop(0, '#C07030'); fg.addColorStop(1, '#8C4A18');
  ctx.fillStyle = fg;
  ctx.fillRect(0, floorY, W, H - floorY);

  // Plank lines
  const PH = 16;
  for (let py = floorY; py < H; py += PH) {
    const even = Math.floor((py - floorY) / PH) % 2 === 0;
    if (even) { ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, py, W, PH); }
    ctx.strokeStyle = 'rgba(60,20,0,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, py + PH - 0.5); ctx.lineTo(W, py + PH - 0.5); ctx.stroke();
  }
  // Wood grain
  ctx.save(); ctx.globalAlpha = 0.055;
  ctx.strokeStyle = '#FFAA50'; ctx.lineWidth = 1;
  for (let gx = -H; gx < W + H; gx += 32) {
    ctx.beginPath(); ctx.moveTo(gx, floorY); ctx.lineTo(gx + H * 0.65, H); ctx.stroke();
  }
  ctx.restore();

  // Court line at floor edge
  ctx.strokeStyle = 'rgba(255,210,120,0.55)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();

  // Free-throw key arc
  const keyX = b.x + 20; // centered near ball start area
  ctx.save(); ctx.strokeStyle = 'rgba(255,220,140,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(Math.round(W * 0.13), floorY, H * 0.26, -Math.PI, 0); ctx.stroke();
  ctx.restore();

  // ── Hoop geometry ──
  const rimY  = Math.round(hoop.y);
  const rimX  = hoop.x;
  const rimHW = hoop.hw;
  const rimHH = 10;  // perspective depth (ellipse minor axis)

  // Backboard flush against right wall
  const bbR   = W;
  const bbL   = W - 26;
  const bbTop = rimY - 68;
  const bbBot = rimY + 54;

  // ── Backboard ──
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.shadowOffsetX = -5;

  // Glass panel fill
  const glassG = ctx.createLinearGradient(bbL, bbTop, bbR, bbTop);
  glassG.addColorStop(0,    'rgba(195,212,255,0.82)');
  glassG.addColorStop(0.35, 'rgba(238,243,255,0.97)');
  glassG.addColorStop(1,    'rgba(215,225,255,0.88)');
  ctx.fillStyle = glassG;
  ctx.fillRect(bbL, bbTop, bbR - bbL, bbBot - bbTop);
  ctx.shadowBlur = 0; ctx.shadowOffsetX = 0;

  // Thick outer frame (orange, like a real backboard)
  ctx.strokeStyle = '#DD4400'; ctx.lineWidth = 4;
  ctx.strokeRect(bbL + 2, bbTop + 2, bbR - bbL - 4, bbBot - bbTop - 4);

  // Inner thin frame
  ctx.strokeStyle = 'rgba(160,175,220,0.6)'; ctx.lineWidth = 1;
  ctx.strokeRect(bbL + 6, bbTop + 6, bbR - bbL - 12, bbBot - bbTop - 12);

  // Glass shine strip
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(bbL + 7, bbTop + 7, (bbR - bbL) * 0.35, bbBot - bbTop - 14);

  // Red target box (wider, more visible)
  ctx.strokeStyle = '#CC0A00'; ctx.lineWidth = 3.5;
  ctx.strokeRect(bbL + 4, rimY - 20, bbR - bbL - 8, 34);
  ctx.restore();

  // ── Support bracket (two angled arms + bolt) ──
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // Upper arm
  ctx.strokeStyle = '#8A8A8A'; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(bbL + 2, rimY - 14);
  ctx.lineTo(rimX + rimHW + 2, rimY - rimHH + 1);
  ctx.stroke();

  // Lower arm
  ctx.beginPath();
  ctx.moveTo(bbL + 2, rimY + 14);
  ctx.lineTo(rimX + rimHW + 2, rimY + rimHH - 1);
  ctx.stroke();

  // Cross-brace
  ctx.strokeStyle = '#727272'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bbL + 2, rimY - 14);
  ctx.lineTo(bbL + 2, rimY + 14);
  ctx.stroke();

  // Bolt/gusset at rim attachment
  const boltGrad = ctx.createRadialGradient(rimX+rimHW, rimY, 0, rimX+rimHW, rimY, 7);
  boltGrad.addColorStop(0, '#BBBBBB'); boltGrad.addColorStop(1, '#666');
  ctx.fillStyle = boltGrad;
  ctx.beginPath(); ctx.arc(rimX + rimHW, rimY, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(rimX + rimHW, rimY, 6.5, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // ── Rim back arc (drawn behind net) ──
  // Outer dark tube
  ctx.strokeStyle = '#7A2500'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(rimX, rimY, rimHW, rimHH, 0, Math.PI, 2 * Math.PI);
  ctx.stroke();
  // Inner color
  ctx.strokeStyle = '#B83800'; ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(rimX, rimY, rimHW, rimHH, 0, Math.PI, 2 * Math.PI);
  ctx.stroke();
  // Top highlight on tube
  ctx.strokeStyle = 'rgba(255,130,60,0.45)'; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(rimX, rimY - 3, rimHW - 1, rimHH - 2, 0, Math.PI, 2 * Math.PI);
  ctx.stroke();

  // ── Net ──
  _bbDrawNet(ctx, rimX, rimY, rimHW, rimHH, net);

  // ── Ball shadow ──
  if (b.y < floorY - b.r) {
    const frac = 1 - Math.min((floorY - b.y) / (floorY * 0.82), 0.94);
    ctx.fillStyle = `rgba(0,0,0,${frac * 0.32})`;
    ctx.beginPath();
    ctx.ellipse(b.x, floorY - 2, b.r * Math.max(0.3, frac), b.r * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Trajectory dots (while aiming) ──
  if (phase === 'aiming' && drag.active) {
    _bbDrawTrajectory(ctx, W, H, floorY, b, drag);
  }

  // ── Ball ──
  _bbDrawBall(ctx, b, phase);

  // ── Rim front arc (drawn over ball) ──
  const flash  = BB.scoreFlash > 0;
  const flashT = flash ? BB.scoreFlash / 22 : 0;

  // Glow ring when scoring
  if (flash) {
    ctx.shadowBlur = 28; ctx.shadowColor = '#FFD700';
    ctx.strokeStyle = `rgba(255,230,30,${flashT * 0.55})`;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.ellipse(rimX, rimY, rimHW, rimHH, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Outer dark edge of tube
  ctx.strokeStyle = flash ? '#996600' : '#7A2500';
  ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(rimX, rimY, rimHW, rimHH, 0, 0, Math.PI);
  ctx.stroke();

  // Main rim color (front half)
  ctx.strokeStyle = flash ? `rgba(255,210,30,${0.7 + flashT * 0.3})` : '#E84800';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(rimX, rimY, rimHW, rimHH, 0, 0, Math.PI);
  ctx.stroke();

  // Highlight on top of front tube
  ctx.strokeStyle = flash ? 'rgba(255,250,140,0.8)' : 'rgba(255,165,80,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(rimX, rimY - 3.5, rimHW - 1.5, rimHH - 2.5, 0, 0, Math.PI);
  ctx.stroke();

  // End caps (circles at front-left and front-right of rim)
  const capColor = flash ? '#FFDD30' : '#E84800';
  [[rimX - rimHW, rimY], [rimX + rimHW, rimY]].forEach(([rx, ry]) => {
    ctx.fillStyle = '#7A2500';
    ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = capColor;
    ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,100,0.5)';
    ctx.beginPath(); ctx.arc(rx - 1.5, ry - 1.5, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  // ── Popup text ──
  if (BB.popup) {
    const { text, x, y, life, maxLife, color } = BB.popup;
    const t = life / maxLife;
    const alpha = t < 0.25 ? t / 0.25 : (t < 0.75 ? 1 : (t - 0.75) / 0.25);
    const rise  = (1 - t) * 28;
    ctx.save();
    ctx.globalAlpha = Math.min(alpha, 1);
    ctx.font = `bold 24px Gowun Dodum, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y - rise);
    ctx.restore();
  }

  // Miss flash
  if (BB.missFlash > 0) {
    ctx.save();
    ctx.globalAlpha = (BB.missFlash / 30) * 0.25;
    ctx.fillStyle = '#FF2200';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ── HUD overlay ──
  _bbDrawHUD(ctx, W);
}

function _bbDrawNet(ctx, rimX, rimY, rimHW, rimHH, net) {
  const N = 12;       // vertical strings
  const netH = 44;    // net depth
  const avgSway = net.reduce((a, s) => a + s.sway, 0) / net.length;

  ctx.save();
  ctx.lineCap = 'round';

  // Vertical strings
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    // Start point: on the rim ellipse (back half π→2π sweeps back-to-front)
    const angle = Math.PI + t * Math.PI;
    const sx = rimX + Math.cos(angle) * rimHW;
    const sy = rimY + Math.sin(angle) * rimHH;

    // Sway interpolated across net array
    const ni = Math.floor(t * (net.length - 1));
    const sw = net[ni].sway;

    // Bottom converges toward center
    const bx = rimX + (sx - rimX) * 0.18 + sw * 0.12;
    const by = rimY + netH;

    // Control point for curve
    const cpx = rimX + (sx - rimX) * 0.45 + sw * 0.42;
    const cpy = rimY + netH * 0.58 + sw * 0.38;

    // Opacity based on position (front strings more visible)
    const vis  = 0.45 + Math.sin(angle) * 0.3; // back strings dimmer
    ctx.strokeStyle = `rgba(230,230,225,${vis})`;
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cpx, cpy, bx, by);
    ctx.stroke();
  }

  // Horizontal rings (4 levels)
  ctx.strokeStyle = `rgba(220,220,215,0.55)`;
  ctx.lineWidth = 0.9;
  for (let j = 1; j <= 4; j++) {
    const ft = j / 4.6;
    const ry = rimY + netH * ft;
    const rw = rimHW * (1 - ft * 0.54);
    const rh = rimHH * (1 - ft * 0.38);
    const sw = avgSway * (1 - ft * 0.3);
    ctx.beginPath();
    ctx.ellipse(rimX + sw * 0.07, ry, Math.max(rw, 2), Math.max(rh, 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function _bbDrawTrajectory(ctx, W, H, floorY, b, drag) {
  const dx = b.x - drag.x;
  const dy = b.y - drag.y;
  const dist = Math.min(Math.hypot(dx, dy), MAX_PULL);
  if (dist < 6) return;
  const len   = Math.hypot(dx, dy);
  const power = (dist / MAX_PULL) * MAX_SPD;
  let px = b.x, py = b.y;
  let pvx = (dx / len) * power;
  let pvy = (dy / len) * power;
  const pts = [];
  for (let i = 0; i < 95; i++) {
    pvy += GRAV;
    px += pvx; py += pvy;
    if (py > floorY + 10 || px < -20 || px > W + 20) break;
    if (i % 3 === 0) pts.push([px, py, i]);
  }

  // Dots
  pts.forEach(([px, py, idx]) => {
    const fade = Math.max(0, 0.75 - idx * 0.028);
    const sz   = Math.max(1.5, 4.5 - idx * 0.07);
    ctx.fillStyle = `rgba(255,255,255,${fade})`;
    ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
  });

  // Slingshot rubber band lines
  ctx.save();
  ctx.setLineDash([5, 6]);
  ctx.strokeStyle = 'rgba(255,255,180,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(drag.x, drag.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Power arc around ball
  const ratio = dist / MAX_PULL;
  const hue   = Math.round(120 - ratio * 120);
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r + 9, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
  ctx.strokeStyle = `hsl(${hue}, 100%, 58%)`;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Guide point on drag
  ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.7)`;
  ctx.beginPath(); ctx.arc(drag.x, drag.y, 7, 0, Math.PI * 2); ctx.fill();
}

function _bbDrawBall(ctx, b, phase) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.spin);
  const r = b.r;
  const scored = phase === 'scored';

  // Outer glow when scored
  if (scored) {
    ctx.shadowBlur = 22; ctx.shadowColor = '#FFD700';
  }

  // Ball body
  const grad = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.04, 0, 0, r);
  grad.addColorStop(0,   scored ? '#FFE860' : '#FFAE38');
  grad.addColorStop(0.55, scored ? '#FFA820' : '#E86010');
  grad.addColorStop(1,   scored ? '#CC7A00' : '#8A2200');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Seams
  ctx.strokeStyle = 'rgba(38,6,0,0.58)';
  ctx.lineWidth = 1.8;
  const seamCtrl = r * 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(seamCtrl, -r*0.32, seamCtrl, r*0.32, 0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(-seamCtrl, -r*0.32, -seamCtrl, r*0.32, 0, r);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.bezierCurveTo(-r*0.3, r*0.55, r*0.3, r*0.55, r, 0);
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.35, r * 0.22, -0.65, 0, Math.PI * 2);
  ctx.fill();
  // Tiny bright spot
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.4, r * 0.1, r * 0.07, -0.65, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function _bbDrawHUD(ctx, W) {
  ctx.save();
  // Score
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  const _r = 10, _x = 14, _y = 10, _w = 72, _h = 48;
  ctx.moveTo(_x + _r, _y);
  ctx.lineTo(_x + _w - _r, _y); ctx.arcTo(_x + _w, _y, _x + _w, _y + _r, _r);
  ctx.lineTo(_x + _w, _y + _h - _r); ctx.arcTo(_x + _w, _y + _h, _x + _w - _r, _y + _h, _r);
  ctx.lineTo(_x + _r, _y + _h); ctx.arcTo(_x, _y + _h, _x, _y + _h - _r, _r);
  ctx.lineTo(_x, _y + _r); ctx.arcTo(_x, _y, _x + _r, _y, _r);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 26px Gowun Dodum, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText(BB.score, 22, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '11px Gowun Dodum, sans-serif';
  ctx.fillText('SCORE', 22, 54);

  // Guide hint
  if (BB.phase === 'idle' && BB.shots === 0) {
    ctx.fillStyle = 'rgba(255,240,180,0.7)';
    ctx.font = '13px Gowun Dodum, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('꾹 눌러서 당기면 궤도가 보여요!', W / 2, 26);
  }
  ctx.restore();
}

function _bbUpdateStreak() {
  const stat = document.getElementById('bball-streak-stat');
  const val  = document.getElementById('bball-streak');
  if (!stat || !val) return;
  if (BB.streak >= 2) {
    stat.style.display = 'flex';
    val.textContent = `${BB.streak}🔥`;
  } else {
    stat.style.display = 'none';
  }
}

/* ============================================================
   GAMES PAGE — TAB SWITCHER (농구 슛 ↔ 반딧불이 정원 ↔ 종이비행기)
   ============================================================ */
let activeGame = 'bball';

const GAME_TABS = {
  bball:   { tab: 'game-tab-bball',   wrap: 'bball-wrap', sub: '꾹 눌러서 당기면 궤도가 표시돼요 — 골대는 넣을 때마다 움직여요!' },
  firefly: { tab: 'game-tab-firefly', wrap: 'ff-wrap',    sub: '랜턴을 움직여 반딧불이 곁에서 클릭 — 빛의 파동으로 살포시 모아보세요!' },
  paper:   { tab: 'game-tab-paper',   wrap: 'pp-wrap',    sub: '마우스를 움직여 종이비행기를 조종해요 — 노을 도시의 금빛 링을 통과해 보세요! (꾹 누르면 부스트)' }
};

function switchGame(name) {
  if (name === activeGame || !GAME_TABS[name]) return;
  activeGame = name;

  Object.keys(GAME_TABS).forEach(k => {
    const tab  = document.getElementById(GAME_TABS[k].tab);
    const wrap = document.getElementById(GAME_TABS[k].wrap);
    if (tab)  tab.classList.toggle('active', k === name);
    if (wrap) wrap.style.display = k === name ? '' : 'none';
  });

  const sub = document.getElementById('games-subtitle');
  if (sub) sub.textContent = GAME_TABS[name].sub;

  // 보이는 탭의 루프만 돌아가도록 (상호 배타)
  if (name === 'firefly') { ensureFireflyInit(); ffResume(); }
  else ffPause();
  if (name === 'paper') { ensurePaperInit(); ppResume(); }
  else ppPause();
}

/* ============================================================
   FIREFLY GARDEN GAME (반딧불이 정원)
   랜턴(마우스)을 옮기고 클릭하면 빛의 파동이 퍼지며
   근처의 반딧불이들이 랜턴 속으로 모여든다.
   ============================================================ */
const FF_PULSE_R  = 125;   // 파동 포획 반경 (px)
const FF_PULSE_CD = 700;   // 파동 쿨다운 (ms)
const FF_COMBO_MS = 2600;  // 콤보 유지 시간 (ms)
const FF_FLY_MAX  = 13;    // 화면 위 반딧불이 수

const FF = {
  initialized: false, canvas: null, ctx: null, rafId: null,
  W: 0, H: 0, dpr: 1, t: 0,
  lantern: { x: 0, y: 0, tx: 0, ty: 0 },
  flies: [], jar: [], pulses: [], sparks: [], popups: [],
  stars: [], hillsFar: [], hillsNear: [], pines: [], grassBack: [], grassFront: [],
  respawns: [], nextGoldenAt: 320, shootStar: null,
  score: 0, caught: 0, combo: 0,
  lastCatchAt: 0, lastPulseAt: -99999
};

function ensureFireflyInit() {
  if (FF.initialized) return;
  const c = document.getElementById('ff-canvas');
  if (!c) return;
  FF.initialized = true;
  FF.canvas = c;
  FF.ctx = c.getContext('2d');
  _ffResize();
  window.addEventListener('resize', _ffResize);

  FF.lantern.x = FF.lantern.tx = FF.W * 0.5;
  FF.lantern.y = FF.lantern.ty = FF.H * 0.55;
  for (let i = 0; i < FF_FLY_MAX; i++) FF.flies.push(_ffSpawnFly());

  c.addEventListener('mousemove', e => { const p = _ffPos(e); FF.lantern.tx = p.x; FF.lantern.ty = p.y; });
  c.addEventListener('mousedown', e => { e.preventDefault(); const p = _ffPos(e); FF.lantern.tx = p.x; FF.lantern.ty = p.y; ffPulse(); });
  c.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = _ffPos(e.touches[0]);
    // 터치는 랜턴을 즉시 옮긴 뒤 파동 (마우스와 달리 따라올 시간이 없으므로)
    FF.lantern.x = FF.lantern.tx = p.x;
    FF.lantern.y = FF.lantern.ty = p.y;
    ffPulse();
  }, { passive: false });
  c.addEventListener('touchmove',  e => { e.preventDefault(); const p = _ffPos(e.touches[0]); FF.lantern.tx = p.x; FF.lantern.ty = p.y; }, { passive: false });
  // 루프는 ffResume()에서 시작 (탭/페이지가 보일 때만 돈다)
}

function ffResume() {
  if (!FF.initialized || FF.rafId) return;
  if (FF.canvas && FF.canvas.offsetWidth && FF.canvas.offsetWidth !== FF.W) _ffResize();
  FF.rafId = requestAnimationFrame(ffTick);
}

function ffPause() {
  if (FF.rafId) { cancelAnimationFrame(FF.rafId); FF.rafId = null; }
}

function resetFirefly() {
  FF.score = 0; FF.caught = 0; FF.combo = 0;
  FF.lastCatchAt = 0; FF.lastPulseAt = -99999;
  FF.jar = []; FF.pulses = []; FF.sparks = []; FF.popups = []; FF.respawns = [];
  FF.flies = [];
  for (let i = 0; i < FF_FLY_MAX; i++) FF.flies.push(_ffSpawnFly());
  FF.nextGoldenAt = FF.t + 320;
  _ffUpdateHUD();
}

function _ffResize() {
  const c = FF.canvas;
  if (!c) return;
  const w = c.offsetWidth, h = c.offsetHeight;
  if (!w || !h) return;                    // 탭이 숨겨진 상태면 건너뜀 (ffResume에서 재시도)
  FF.dpr = Math.min(window.devicePixelRatio || 1, 2);
  FF.W = w; FF.H = h;
  c.width  = Math.round(w * FF.dpr);
  c.height = Math.round(h * FF.dpr);
  FF.ctx.setTransform(FF.dpr, 0, 0, FF.dpr, 0, 0);
  _ffGenScene();
}

function _ffGenScene() {
  const W = FF.W, H = FF.H;

  // 별
  FF.stars = [];
  for (let i = 0; i < 90; i++) {
    FF.stars.push({
      x: Math.random() * W, y: Math.random() * H * 0.55,
      r: 0.4 + Math.random() * 1.1,
      tw: 0.01 + Math.random() * 0.04,
      ph: Math.random() * Math.PI * 2
    });
  }

  // 언덕 능선 (파랄랙스용으로 좌우 여유폭 포함)
  const ridge = (baseY, amp, seed) => {
    const pts = [];
    for (let x = -240; x <= W + 240; x += 14) {
      pts.push([x, baseY
        + Math.sin(x * 0.0058 + seed) * amp
        + Math.sin(x * 0.0161 + seed * 2.7) * amp * 0.38]);
    }
    return pts;
  };
  FF.hillsFar  = ridge(H * 0.60, H * 0.055, 1.7);
  FF.hillsNear = ridge(H * 0.72, H * 0.045, 4.2);

  // 가까운 능선 위 소나무 실루엣
  FF.pines = [];
  for (let x = -180; x <= W + 180; x += 46 + Math.random() * 60) {
    const idx = Math.max(0, Math.min(FF.hillsNear.length - 1, Math.round((x + 240) / 14)));
    FF.pines.push({ x, y: FF.hillsNear[idx][1] + 3, h: 16 + Math.random() * 22 });
  }

  // 풀잎 (뒷줄 / 앞줄)
  const blades = (step, hMin, hMax) => {
    const arr = [];
    for (let x = -6; x <= W + 6; x += step) {
      arr.push({
        x: x + Math.random() * step * 0.7,
        h: hMin + Math.random() * (hMax - hMin),
        lean: (Math.random() - 0.5) * 10,
        ph: Math.random() * Math.PI * 2,
        sp: 0.02 + Math.random() * 0.02
      });
    }
    return arr;
  };
  FF.grassBack  = blades(8, 22, 40);
  FF.grassFront = blades(5, 32, 60);
}

function _ffPos(e) {
  const r = FF.canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function _ffSpawnFly(golden = false, fromEdge = false) {
  const W = FF.W || 640, H = FF.H || 420;
  return {
    x: fromEdge ? (Math.random() < 0.5 ? -18 : W + 18) : Math.random() * W,
    y: H * 0.16 + Math.random() * H * 0.62,
    a: Math.random() * Math.PI * 2,
    spd: golden ? 1.45 : 0.5 + Math.random() * 0.5,
    ph: Math.random() * Math.PI * 2,
    pl: 0.008 + Math.random() * 0.012,     // 발광 맥동 속도 (숨쉬듯 천천히)
    r: golden ? 4.2 : 2.2 + Math.random() * 1.3,
    golden,
    life: golden ? 620 : Infinity,
    state: 'free', ct: 0, cx: 0, cy: 0
  };
}

/* ── 빛의 파동 (클릭) ── */
function ffPulse() {
  const now = performance.now();
  if (now - FF.lastPulseAt < FF_PULSE_CD) return;
  FF.lastPulseAt = now;
  const lx = FF.lantern.x, ly = FF.lantern.y;
  FF.pulses.push({ x: lx, y: ly, r: 16, max: FF_PULSE_R, life: 1 });

  const hit = FF.flies.filter(f =>
    f.state === 'free' && Math.hypot(f.x - lx, f.y - ly) < FF_PULSE_R);
  if (!hit.length) return;

  // 콤보: 직전 포획에서 2.6초 안에 이어가면 배수 상승
  FF.combo = (now - FF.lastCatchAt < FF_COMBO_MS) ? FF.combo + 1 : 1;
  FF.lastCatchAt = now;
  const mult = Math.min(FF.combo, 5);

  let base = 0, goldenN = 0;
  hit.forEach(f => {
    f.state = 'caught'; f.ct = 0; f.cx = f.x; f.cy = f.y;
    base += f.golden ? 50 : 10;
    if (f.golden) goldenN++;
  });
  const gained = base * mult;
  const prevCaught = FF.caught;
  FF.score += gained;
  FF.caught += hit.length;

  _ffAddPopup(`+${gained}`, lx, ly - 48, mult >= 3 ? '#FFD700' : '#B9FF6E', 24);
  if (mult >= 2) _ffAddPopup(`콤보 x${mult}!`, lx, ly - 76, '#FFC94A', 15);

  const rect = FF.canvas.getBoundingClientRect();
  const burstAt = (x, y) => { if (particles) particles.burst(rect.left + x, rect.top + y); };

  if (goldenN > 0) {
    _ffAddPopup('황금 반딧불이! ✨', lx, ly - 100, '#FFE24A', 18);
    burstAt(lx, ly);
  }
  if (hit.length >= 3) {
    _ffAddPopup(`한 번에 ${hit.length}마리! 🌟`, lx, ly - 100 - (goldenN ? 26 : 0), '#8EE8FF', 16);
    burstAt(lx, ly - 30);
  }
  // 15마리 단위 축하
  if (Math.floor(FF.caught / 15) > Math.floor(prevCaught / 15)) {
    burstAt(FF.W / 2, FF.H * 0.4);
    showToast(`반딧불이 ${Math.floor(FF.caught / 15) * 15}마리를 모았어요! 정원이 반짝여요`, '✨');
  }
  _ffUpdateHUD();
}

function _ffAddPopup(text, x, y, color, size) {
  FF.popups.push({ text, x, y, color, size, life: 80, maxLife: 80 });
}

function _ffUpdateHUD() {
  const s = document.getElementById('ff-score');
  const c = document.getElementById('ff-caught');
  if (s) s.textContent = FF.score;
  if (c) c.textContent = FF.caught;
  const stat = document.getElementById('ff-combo-stat');
  const val  = document.getElementById('ff-combo');
  if (!stat || !val) return;
  if (FF.combo >= 2) {
    stat.style.display = 'flex';
    val.textContent = `x${Math.min(FF.combo, 5)}🔥`;
  } else {
    stat.style.display = 'none';
  }
}

/* ── 메인 루프 ── */
function ffTick() {
  FF.rafId = requestAnimationFrame(ffTick);
  if (!FF.ctx || !FF.W) return;
  FF.t++;
  _ffUpdate();
  _ffDraw();
}

function _ffUpdate() {
  const W = FF.W, H = FF.H, L = FF.lantern;
  const now = performance.now();

  // 랜턴: 마우스를 부드럽게 따라감 (easing)
  L.tx = Math.max(18, Math.min(W - 18, L.tx));
  L.ty = Math.max(30, Math.min(H - 26, L.ty));
  L.x += (L.tx - L.x) * 0.14;
  L.y += (L.ty - L.y) * 0.14;

  // 콤보 시간 만료
  if (FF.combo > 0 && now - FF.lastCatchAt > FF_COMBO_MS) {
    FF.combo = 0;
    _ffUpdateHUD();
  }

  // 반딧불이
  const angDiff = (a, b) => ((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const alive = [];
  FF.flies.forEach(f => {
    if (f.state === 'free') {
      f.a += (Math.random() - 0.5) * 0.16;
      // 화면 밖으로 나가려 하면 중앙 쪽으로 선회
      if (f.x < 24 || f.x > W - 24 || f.y < H * 0.1 || f.y > H * 0.9) {
        const toC = Math.atan2(H * 0.5 - f.y, W * 0.5 - f.x);
        f.a += angDiff(toC, f.a) * 0.1;
      }
      // 랜턴 불빛은 살짝 피해 다닌다 → 파동 타이밍이 실력
      const dl = Math.hypot(f.x - L.x, f.y - L.y);
      if (dl < 90) {
        const away = Math.atan2(f.y - L.y, f.x - L.x);
        f.a += angDiff(away, f.a) * 0.13;
      }
      f.x += Math.cos(f.a) * f.spd;
      f.y += Math.sin(f.a) * f.spd + Math.sin(FF.t * 0.02 + f.ph) * 0.22;

      if (f.golden) {
        f.life--;
        if (f.life <= 0) {           // 황금 반딧불이가 떠남
          FF.nextGoldenAt = FF.t + 520 + Math.random() * 420;
          return;
        }
      }
      alive.push(f);
    } else {
      // 포획됨 → 나선을 그리며 랜턴 속으로 (가속 easing)
      f.ct = Math.min(1, f.ct + 0.028 + f.ct * 0.055);
      const e = f.ct * f.ct * (3 - 2 * f.ct);   // smoothstep
      const spiralR = (1 - f.ct) * 26;
      const spiralA = f.ct * 9 + f.ph;
      f.x = f.cx + (L.x - f.cx) * e + Math.cos(spiralA) * spiralR;
      f.y = f.cy + (L.y - f.cy) * e + Math.sin(spiralA) * spiralR;
      if (f.ct >= 1) {
        // 도착: 반짝 스파크 + 랜턴 속 불빛 추가
        for (let i = 0; i < 8; i++) {
          const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.6;
          FF.sparks.push({ x: L.x, y: L.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.4,
            life: 1, golden: f.golden });
        }
        if (FF.jar.length < 10) {
          FF.jar.push({ ang: Math.random() * Math.PI * 2,
            spd: 0.03 + Math.random() * 0.03, rr: 4 + Math.random() * 6, golden: f.golden });
        }
        if (f.golden) FF.nextGoldenAt = FF.t + 520 + Math.random() * 420;
        else FF.respawns.push(FF.t + 130 + Math.random() * 170);
        return;   // 이 개체는 제거
      }
      alive.push(f);
    }
  });
  FF.flies = alive;

  // 일반 반딧불이 재등장
  FF.respawns = FF.respawns.filter(due => {
    if (FF.t >= due) { FF.flies.push(_ffSpawnFly(false, true)); return false; }
    return true;
  });

  // 황금 반딧불이 등장 스케줄
  if (FF.t >= FF.nextGoldenAt && !FF.flies.some(f => f.golden)) {
    FF.flies.push(_ffSpawnFly(true, true));
    FF.nextGoldenAt = Infinity;
  }

  // 파동 링
  FF.pulses.forEach(p => { p.r += (p.max - p.r) * 0.13 + 1.4; p.life -= 0.032; });
  FF.pulses = FF.pulses.filter(p => p.life > 0);

  // 스파크
  FF.sparks.forEach(s => { s.x += s.vx; s.y += s.vy; s.vy -= 0.015; s.vx *= 0.96; s.life -= 0.028; });
  FF.sparks = FF.sparks.filter(s => s.life > 0);

  // 팝업
  FF.popups.forEach(p => p.life--);
  FF.popups = FF.popups.filter(p => p.life > 0);

  // 별똥별
  if (!FF.shootStar && Math.random() < 0.0018) {
    FF.shootStar = { x: Math.random() * W * 0.6 + W * 0.1, y: Math.random() * H * 0.2 + 10,
      vx: 4.5 + Math.random() * 3, vy: 1.6 + Math.random(), life: 1 };
  }
  if (FF.shootStar) {
    const ss = FF.shootStar;
    ss.x += ss.vx; ss.y += ss.vy; ss.life -= 0.03;
    if (ss.life <= 0) FF.shootStar = null;
  }
}

/* ── 렌더링 ── */
function _ffDraw() {
  const ctx = FF.ctx, W = FF.W, H = FF.H, L = FF.lantern, t = FF.t;
  const gust = Math.sin(t * 0.008) * 0.6 + Math.sin(t * 0.023) * 0.4;

  // ── 밤하늘 ──
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0,    '#050915');
  sky.addColorStop(0.45, '#0c1730');
  sky.addColorStop(0.72, '#17284d');
  sky.addColorStop(1,    '#0a1526');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 별 (반짝임)
  FF.stars.forEach(s => {
    const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph));
    ctx.fillStyle = `rgba(215,228,255,${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
  });

  // 별똥별
  if (FF.shootStar) {
    const ss = FF.shootStar;
    const grad = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 9, ss.y - ss.vy * 9);
    grad.addColorStop(0, `rgba(255,255,255,${ss.life * 0.9})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(ss.x, ss.y);
    ctx.lineTo(ss.x - ss.vx * 9, ss.y - ss.vy * 9); ctx.stroke();
  }

  // 달 + 달무리
  const mx = W * 0.82, my = H * 0.16, mr = 26;
  const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 5);
  halo.addColorStop(0, 'rgba(214,226,255,0.22)');
  halo.addColorStop(1, 'rgba(214,226,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(mx, my, mr * 5, 0, Math.PI * 2); ctx.fill();
  const moon = ctx.createRadialGradient(mx - 7, my - 7, 2, mx, my, mr);
  moon.addColorStop(0, '#FFFDF2'); moon.addColorStop(1, '#D9DEC8');
  ctx.fillStyle = moon;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(120,130,110,0.14)';
  ctx.beginPath(); ctx.arc(mx + 8, my + 4, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(mx - 6, my + 9, 3.4, 0, Math.PI * 2); ctx.fill();

  // ── 언덕 실루엣 (랜턴 위치에 따른 파랄랙스) ──
  const paraFar  = (W / 2 - L.x) * 0.015;
  const paraNear = (W / 2 - L.x) * 0.035;
  const drawRidge = (pts, off, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + off, pts[0][1]);
    pts.forEach(([px, py]) => ctx.lineTo(px + off, py));
    ctx.lineTo(W + 260, H + 10); ctx.lineTo(-260, H + 10);
    ctx.closePath(); ctx.fill();
  };
  drawRidge(FF.hillsFar, paraFar, '#0e1c38');

  // 물안개 띠
  const mist = ctx.createLinearGradient(0, H * 0.58, 0, H * 0.72);
  mist.addColorStop(0, 'rgba(130,160,225,0)');
  mist.addColorStop(0.5, 'rgba(130,160,225,0.07)');
  mist.addColorStop(1, 'rgba(130,160,225,0)');
  ctx.fillStyle = mist;
  ctx.fillRect(0, H * 0.58, W, H * 0.14);

  drawRidge(FF.hillsNear, paraNear, '#0a1526');
  // 소나무들
  ctx.fillStyle = '#071020';
  FF.pines.forEach(p => {
    const px = p.x + paraNear;
    ctx.beginPath();
    ctx.moveTo(px, p.y - p.h);
    ctx.lineTo(px - p.h * 0.34, p.y);
    ctx.lineTo(px + p.h * 0.34, p.y);
    ctx.closePath(); ctx.fill();
  });

  // ── 땅 + 랜턴 불빛 웅덩이 ──
  const ground = ctx.createLinearGradient(0, H * 0.8, 0, H);
  ground.addColorStop(0, '#081120'); ground.addColorStop(1, '#04080f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const pool = ctx.createRadialGradient(L.x, H * 0.88, 0, L.x, H * 0.88, 130);
  const poolA = Math.max(0, 0.14 * (1 - Math.abs(L.y - H * 0.7) / (H * 0.7)) + 0.05);
  pool.addColorStop(0, `rgba(255,190,90,${poolA})`);
  pool.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = pool;
  ctx.beginPath(); ctx.ellipse(L.x, H * 0.88, 130, 42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // ── 풀 뒷줄 ──
  _ffDrawGrass(ctx, FF.grassBack, H, gust, L, 1.1, 10, 0.75);

  // ── 반딧불이 ──
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  FF.flies.forEach(f => {
    const pulse = 0.55 + 0.45 * Math.sin(t * f.pl * (Math.PI * 2) + f.ph);
    let alpha = f.golden ? 0.95 : 0.8;
    if (f.golden && f.life < 120) alpha *= f.life / 120;   // 떠나기 전 잦아듦
    if (f.state === 'caught') alpha *= 1 - f.ct * 0.4;
    const hue = f.golden ? 45 : 68 + Math.sin(f.ph) * 12;
    const rr = f.r * (f.state === 'caught' ? 1 + f.ct * 0.6 : 1);

    const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rr * 7);
    glow.addColorStop(0, `hsla(${hue},100%,68%,${0.20 * pulse * alpha})`);
    glow.addColorStop(1, `hsla(${hue},100%,60%,0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr * 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = `hsla(${hue},100%,${72 + pulse * 14}%,${alpha})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, rr * (0.75 + pulse * 0.35), 0, Math.PI * 2); ctx.fill();

    if (f.golden) {   // 황금빛 십자 반짝임
      ctx.strokeStyle = `hsla(48,100%,80%,${0.5 * pulse * alpha})`;
      ctx.lineWidth = 1;
      const sl = rr * 3.4 * pulse;
      ctx.beginPath();
      ctx.moveTo(f.x - sl, f.y); ctx.lineTo(f.x + sl, f.y);
      ctx.moveTo(f.x, f.y - sl); ctx.lineTo(f.x, f.y + sl);
      ctx.stroke();
    }
  });

  // 파동 링
  FF.pulses.forEach(p => {
    ctx.strokeStyle = `rgba(255,228,150,${p.life * 0.55})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,246,210,${p.life * 0.22})`;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.86, 0, Math.PI * 2); ctx.stroke();
  });

  // 스파크
  FF.sparks.forEach(s => {
    ctx.fillStyle = s.golden
      ? `rgba(255,222,90,${s.life * 0.9})`
      : `rgba(210,255,150,${s.life * 0.85})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, 1.6 + s.life * 1.4, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();

  // ── 랜턴 ──
  _ffDrawLantern(ctx, L, t);

  // ── 풀 앞줄 (랜턴 아래를 살짝 가려 깊이감) ──
  _ffDrawGrass(ctx, FF.grassFront, H, gust, L, 1.5, 7, 1);

  // ── 팝업 텍스트 ──
  FF.popups.forEach(p => {
    const k = p.life / p.maxLife;                       // 1 → 0
    const alpha = k > 0.85 ? (1 - k) / 0.15 : (k < 0.3 ? k / 0.3 : 1);
    const rise = (1 - k) * 30;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.font = `bold ${p.size}px Gowun Dodum, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 9; ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y - rise);
    ctx.restore();
  });

  // ── 안내 문구 (첫 포획 전) ──
  if (FF.caught === 0) {
    const a = 0.5 + Math.sin(t * 0.05) * 0.25;
    ctx.fillStyle = `rgba(255,240,200,${a})`;
    ctx.font = '13px Gowun Dodum, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('랜턴을 움직여 반딧불이 곁에서 클릭해보세요 ✨', W / 2, 28);
  }

  // ── 비네트 ──
  const vig = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.4, W / 2, H * 0.55, H * 1.05);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}

function _ffDrawGrass(ctx, blades, H, gust, L, lw, tint, alpha) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalAlpha = alpha;
  blades.forEach(b => {
    const sway = Math.sin(FF.t * b.sp + b.ph) * 3 + gust * 2.4;
    const lit = Math.max(0, 1 - Math.hypot(b.x - L.x, H - 6 - L.y) / 175);
    ctx.strokeStyle = `hsl(96, 42%, ${tint + lit * 30}%)`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(b.x, H + 2);
    ctx.quadraticCurveTo(
      b.x + b.lean * 0.4 + sway * 0.4, H - b.h * 0.55,
      b.x + b.lean + sway, H - b.h
    );
    ctx.stroke();
  });
  ctx.restore();
}

function _ffDrawLantern(ctx, L, t) {
  const x = L.x, y = L.y + Math.sin(t * 0.045) * 2.5;   // 둥실둥실
  const flick = 0.86 + Math.sin(t * 0.32) * 0.07 + Math.sin(t * 0.11 + 2) * 0.07;
  const now = performance.now();
  const gw = 14, gh = 18;   // 유리 몸통 절반 크기

  // 넓은 온기 글로우
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const amb = ctx.createRadialGradient(x, y, 0, x, y, 150);
  amb.addColorStop(0,    `rgba(255,196,96,${0.28 * flick})`);
  amb.addColorStop(0.45, `rgba(255,170,60,${0.10 * flick})`);
  amb.addColorStop(1,    'rgba(255,150,40,0)');
  ctx.fillStyle = amb;
  ctx.beginPath(); ctx.arc(x, y, 150, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // 파동 쿨다운 게이지 / 준비 완료 링
  const prog = Math.min(1, (now - FF.lastPulseAt) / FF_PULSE_CD);
  if (prog < 1) {
    ctx.strokeStyle = 'rgba(255,220,150,0.38)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 27, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
    ctx.stroke();
  } else {
    const br = 0.5 + Math.sin(t * 0.09) * 0.5;
    ctx.strokeStyle = `rgba(255,235,180,${0.10 + br * 0.12})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, 27 + br * 2.5, 0, Math.PI * 2); ctx.stroke();
  }

  // 손잡이 고리 + 뚜껑
  ctx.strokeStyle = '#3a2c1c'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y - gh - 12, 5.5, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#4a3822';
  ctx.beginPath();
  ctx.moveTo(x - 10, y - gh);
  ctx.lineTo(x - 6, y - gh - 7);
  ctx.lineTo(x + 6, y - gh - 7);
  ctx.lineTo(x + 10, y - gh);
  ctx.closePath(); ctx.fill();

  // 유리 몸통
  const glass = ctx.createLinearGradient(x, y - gh, x, y + gh);
  glass.addColorStop(0,   `rgba(255,220,140,${0.24 * flick})`);
  glass.addColorStop(0.5, `rgba(255,190,90,${0.36 * flick})`);
  glass.addColorStop(1,   `rgba(255,160,60,${0.22 * flick})`);
  ctx.fillStyle = glass;
  _ffRoundRectPath(ctx, x - gw, y - gh, gw * 2, gh * 2, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74,56,34,0.9)'; ctx.lineWidth = 2;
  ctx.stroke();
  // 세로 창살
  ctx.strokeStyle = 'rgba(74,56,34,0.5)'; ctx.lineWidth = 1.2;
  [x - 4.5, x + 4.5].forEach(bx => {
    ctx.beginPath(); ctx.moveTo(bx, y - gh + 2); ctx.lineTo(bx, y + gh - 2); ctx.stroke();
  });
  // 받침
  ctx.fillStyle = '#4a3822';
  ctx.fillRect(x - 11, y + gh - 1, 22, 4);

  // 심지 불꽃 + 모은 반딧불이들이 유리 속을 맴돈다
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const flame = ctx.createRadialGradient(x, y + 3, 0, x, y + 3, 12);
  flame.addColorStop(0,   `rgba(255,255,230,${0.95 * flick})`);
  flame.addColorStop(0.4, `rgba(255,210,110,${0.55 * flick})`);
  flame.addColorStop(1,   'rgba(255,160,50,0)');
  ctx.fillStyle = flame;
  ctx.beginPath(); ctx.arc(x, y + 3, 12, 0, Math.PI * 2); ctx.fill();

  FF.jar.forEach(j => {
    j.ang += j.spd;
    const jx = x + Math.cos(j.ang) * j.rr;
    const jy = y + Math.sin(j.ang * 1.3) * gh * 0.5;
    const jp = 0.6 + 0.4 * Math.sin(t * 0.07 + j.ang * 3);
    ctx.fillStyle = j.golden
      ? `rgba(255,225,110,${0.85 * jp})`
      : `rgba(215,255,150,${0.8 * jp})`;
    ctx.beginPath(); ctx.arc(jx, jy, 1.7, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function _ffRoundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function studyInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendStudyMessage();
    return;
  }
  const input = e.target;
  setTimeout(() => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }, 0);
}


/* ============================================================
   ACCESSIBILITY / MOTION
   ============================================================ */
const PREFERS_REDUCED_MOTION =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   UTIL — HTML entity decode (YouTube API titles)
   ============================================================ */
function htmlDecode(str) {
  const t = document.createElement('textarea');
  t.innerHTML = String(str);
  return t.value;
}

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
function showToast(msg, icon = '🌿') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  // 최대 3개까지만 쌓기
  while (root.children.length >= 3) root.removeChild(root.firstChild);

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${escHtml(msg)}</span>`;
  root.appendChild(el);

  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 350);
  }, 2800);
}

/* ============================================================
   STUDY LOG — focus minutes & completed tasks per day
   (하루 키: todayStr() 형식 "YYYY-M-D")
   ============================================================ */
const FOCUS_LOG_KEY = 'hs_focus_log_v1';
const TASKS_LOG_KEY = 'hs_tasks_log_v1';

function getLog(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (_) { return {}; }
}

function bumpLog(key, dateStr, delta) {
  const log = getLog(key);
  log[dateStr] = Math.max(0, (log[dateStr] || 0) + delta);
  if (log[dateStr] === 0) delete log[dateStr];
  try { localStorage.setItem(key, JSON.stringify(log)); } catch (_) {}
}

function dateStrOffset(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getTodayFocusMin()  { return getLog(FOCUS_LOG_KEY)[todayStr()] || 0; }

function getWeekFocusMin() {
  const log = getLog(FOCUS_LOG_KEY);
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += log[dateStrOffset(i)] || 0;
  return sum;
}

function getTotalFocusMin() {
  const log = getLog(FOCUS_LOG_KEY);
  return Object.values(log).reduce((a, b) => a + b, 0);
}

function getTotalTasks() {
  const log = getLog(TASKS_LOG_KEY);
  return Object.values(log).reduce((a, b) => a + b, 0);
}

function dayPoints(dateStr) {
  const f = getLog(FOCUS_LOG_KEY)[dateStr] || 0;
  const t = getLog(TASKS_LOG_KEY)[dateStr] || 0;
  return f + t * 5;
}

/* ── 연속 공부 스트릭 ── */
function calcStreak() {
  const focus = getLog(FOCUS_LOG_KEY);
  const tasks = getLog(TASKS_LOG_KEY);
  const active = d => (focus[d] || 0) > 0 || (tasks[d] || 0) > 0;

  let streak = 0;
  let i = active(dateStrOffset(0)) ? 0 : 1;  // 오늘 아직 안 했으면 어제부터 소급
  while (active(dateStrOffset(i))) { streak++; i++; }
  return streak;
}

/* ── 성장 레벨 ── */
const LEVELS = [
  { min: 0,    name: '새싹',          tree: '🌱' },
  { min: 100,  name: '초록 잎새',     tree: '🌿' },
  { min: 250,  name: '자라는 화분',   tree: '🪴' },
  { min: 500,  name: '어린나무',      tree: '🌳' },
  { min: 900,  name: '튼튼한 나무',   tree: '🌲' },
  { min: 1500, name: '꽃피는 나무',   tree: '🌸' },
  { min: 2400, name: '열매 맺는 나무', tree: '🍎' },
  { min: 3600, name: '숲의 큰 나무',  tree: '🎄' },
  { min: 5200, name: '빛나는 나무',   tree: '🌟' },
  { min: 7500, name: '전설의 숲',     tree: '🌈' },
];

function calcPoints() {
  return getTotalFocusMin() + getTotalTasks() * 5;
}

function getLevelInfo(points) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) idx = i;
  const cur  = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const progress = next
    ? Math.min(100, Math.round(((points - cur.min) / (next.min - cur.min)) * 100))
    : 100;
  return { level: idx + 1, name: cur.name, tree: cur.tree, next, progress, points };
}

/* ============================================================
   HOME STATS + SIDEBAR LEVEL
   ============================================================ */
function updateHomeStats() {
  const lv = getLevelInfo(calcPoints());

  const focusEl  = document.getElementById('hstat-focus');
  const streakEl = document.getElementById('hstat-streak');
  const tasksEl  = document.getElementById('hstat-tasks');
  const levelEl  = document.getElementById('hstat-level');
  const treeEl   = document.getElementById('hstat-tree');

  if (focusEl)  focusEl.textContent  = `${getTodayFocusMin()}분`;
  if (streakEl) streakEl.textContent = `${calcStreak()}일`;
  if (tasksEl) {
    const total = state.checklist.items.length;
    const done  = state.checklist.items.filter(i => i.done).length;
    tasksEl.textContent = `${done}/${total}`;
  }
  if (levelEl) levelEl.textContent = `LV.${lv.level}`;
  if (treeEl)  treeEl.textContent  = lv.tree;

  // 사이드바 미니 레벨
  const slTree = document.getElementById('sl-tree');
  const slLv   = document.getElementById('sl-level');
  const slBar  = document.getElementById('sl-bar-fill');
  if (slTree) slTree.textContent = lv.tree;
  if (slLv)   slLv.textContent   = `LV.${lv.level} ${lv.name}`;
  if (slBar)  slBar.style.width  = `${lv.progress}%`;
}

function updateTimerTodayHint() {
  const el = document.getElementById('timer-today-hint');
  if (!el) return;
  const min = getTodayFocusMin();
  el.textContent = min > 0 ? `오늘 집중 ${min}분` : '오늘의 첫 집중을 시작해봐요';
}

/* ============================================================
   STATS PAGE — 공부 기록
   ============================================================ */
function renderStats() {
  const focusLog = getLog(FOCUS_LOG_KEY);

  /* ── 상단 타일 ── */
  const todayMin = getTodayFocusMin();
  const weekMin  = getWeekFocusMin();
  const totalMin = getTotalFocusMin();
  const streak   = calcStreak();

  const fmtLong = m => m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + '분' : ''}`.trim() : `${m}분`;

  const stToday  = document.getElementById('st-today');
  const stWeek   = document.getElementById('st-week');
  const stStreak = document.getElementById('st-streak');
  const stTotal  = document.getElementById('st-total');
  if (stToday)  stToday.textContent  = `${todayMin}분`;
  if (stWeek)   stWeek.textContent   = fmtLong(weekMin);
  if (stStreak) stStreak.textContent = `${streak}일`;
  if (stTotal)  stTotal.textContent  = totalMin >= 60 ? `${(totalMin / 60).toFixed(1)}시간` : `${totalMin}분`;

  /* ── 최근 7일 바 차트 ── */
  const chart = document.getElementById('stats-week-chart');
  if (chart) {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const ds = dateStrOffset(i);
      const d  = new Date();
      d.setDate(d.getDate() - i);
      days.push({ ds, min: focusLog[ds] || 0, label: DAYS_SHORT[d.getDay()], isToday: i === 0 });
    }
    const max = Math.max(...days.map(d => d.min), 30);
    chart.innerHTML = days.map(d => `
      <div class="wc-col${d.isToday ? ' wc-today' : ''}" title="${d.ds} · ${d.min}분">
        <span class="wc-val">${d.min > 0 ? d.min : ''}</span>
        <div class="wc-bar-track">
          <div class="wc-bar" style="height:${Math.max(d.min / max * 100, d.min > 0 ? 5 : 2)}%"></div>
        </div>
        <span class="wc-day">${d.label}</span>
      </div>
    `).join('');
  }

  /* ── 성장 나무 ── */
  const lv = getLevelInfo(calcPoints());
  const tEl  = document.getElementById('stats-tree');
  const nEl  = document.getElementById('stats-level-name');
  const bEl  = document.getElementById('stats-level-bar');
  const nxEl = document.getElementById('stats-level-next');
  if (tEl)  tEl.textContent = lv.tree;
  if (nEl)  nEl.textContent = `LV.${lv.level} ${lv.name}`;
  if (bEl)  bEl.style.width = `${lv.progress}%`;
  if (nxEl) nxEl.textContent = lv.next
    ? `다음 레벨(${lv.next.tree} ${lv.next.name})까지 ${lv.next.min - lv.points}P`
    : '최고 레벨 달성! 🎉';

  /* ── 12주 잔디 히트맵 ── */
  const hm = document.getElementById('stats-heatmap');
  if (hm) {
    const today = new Date();
    const dow = today.getDay(); // 0 = 일요일
    // 이번 주 일요일에서 11주 전 일요일까지
    const start = new Date(today);
    start.setDate(today.getDate() - dow - 7 * 11);

    let cells = '';
    for (let w = 0; w < 12; w++) {
      for (let d = 0; d < 7; d++) {
        const cur = new Date(start);
        cur.setDate(start.getDate() + w * 7 + d);
        const ds = `${cur.getFullYear()}-${cur.getMonth() + 1}-${cur.getDate()}`;
        if (cur > today) {
          cells += `<span class="hm-cell hm-future"></span>`;
          continue;
        }
        const p = dayPoints(ds);
        const cls = p === 0 ? 'hm-0' : p < 15 ? 'hm-1' : p < 30 ? 'hm-2' : p < 60 ? 'hm-3' : 'hm-4';
        const f = getLog(FOCUS_LOG_KEY)[ds] || 0;
        const t = getLog(TASKS_LOG_KEY)[ds] || 0;
        cells += `<span class="hm-cell ${cls}" title="${cur.getMonth() + 1}/${cur.getDate()} · 집중 ${f}분 · 할 일 ${t}개"></span>`;
      }
    }
    hm.innerHTML = cells;
  }
}

/* ============================================================
   FLASHCARDS — 암기 카드
   ============================================================ */
const FC_STORAGE_KEY = 'hs_flashcards_v1';

const fcState = {
  deckId: null,     // 열려 있는 덱
  queue: [],        // 학습 큐 (카드 객체 참조)
  idx: 0,
  flipped: false,
  againIds: [],     // 이번 세션에서 "다시 볼래요"한 카드
  knowCount: 0
};

function fcLoad() {
  try {
    const data = JSON.parse(localStorage.getItem(FC_STORAGE_KEY));
    if (data && Array.isArray(data.decks)) return data;
  } catch (_) {}
  return { decks: [] };
}

function fcSave(data) {
  try { localStorage.setItem(FC_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

function fcGetDeck(data, id) { return data.decks.find(d => d.id === id); }

function fcInit() {
  // 학습 모드 키보드 조작: Space=뒤집기, ←=다시, →=외웠어요
  document.addEventListener('keydown', (e) => {
    const studyView = document.getElementById('fc-study-view');
    if (!studyView || studyView.style.display === 'none') return;
    if (!document.getElementById('page-cards').classList.contains('active')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const doneVisible = document.getElementById('fc-study-done').style.display !== 'none';
    if (doneVisible) return;

    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); fcFlip(); }
    else if (e.key === 'ArrowLeft'  && fcState.flipped) fcAnswer(false);
    else if (e.key === 'ArrowRight' && fcState.flipped) fcAnswer(true);
  });
}

/* ── 뷰 전환 ── */
function fcShowView(view) {
  document.getElementById('fc-deck-list-view').style.display = view === 'list'  ? 'block' : 'none';
  document.getElementById('fc-deck-view').style.display      = view === 'deck'  ? 'block' : 'none';
  document.getElementById('fc-study-view').style.display     = view === 'study' ? 'block' : 'none';
}

/* ── 덱 목록 ── */
function fcRenderDecks() {
  fcShowView(fcState.deckId ? 'deck' : 'list');
  if (fcState.deckId) { fcRenderDeckView(); return; }

  const data  = fcLoad();
  const grid  = document.getElementById('fc-deck-grid');
  const empty = document.getElementById('fc-empty');
  if (!grid) return;

  if (data.decks.length === 0) {
    grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  grid.innerHTML = data.decks.map(d => {
    const known = d.cards.filter(c => !c.miss).length;
    const pct   = d.cards.length ? Math.round(known / d.cards.length * 100) : 0;
    return `
      <div class="fc-deck-card" onclick="fcOpenDeck('${d.id}')" role="button" tabindex="0"
           onkeydown="if(event.key==='Enter') fcOpenDeck('${d.id}')">
        <button class="fc-deck-del" title="묶음 삭제"
          onclick="event.stopPropagation();fcDeleteDeck('${d.id}')">✕</button>
        <div class="fc-deck-icon">🃏</div>
        <div class="fc-deck-name">${escHtml(d.name)}</div>
        <div class="fc-deck-count">카드 ${d.cards.length}장${d.cards.length ? ` · 외운 카드 ${known}장` : ''}</div>
        <div class="fc-deck-bar"><div class="fc-deck-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');
}

function fcCreateDeck() {
  const input = document.getElementById('fc-new-deck-input');
  const name = input.value.trim();
  if (!name) {
    input.focus();
    input.style.borderColor = '#D45C5C';
    setTimeout(() => input.style.borderColor = '', 1200);
    return;
  }
  const data = fcLoad();
  const id = genId();
  data.decks.unshift({ id, name, cards: [], created: Date.now() });
  fcSave(data);
  input.value = '';
  showToast(`「${name}」 묶음을 만들었어요`, '🃏');
  fcOpenDeck(id);
}

function fcDeleteDeck(id) {
  const data = fcLoad();
  const deck = fcGetDeck(data, id);
  if (!deck) return;
  if (!confirm(`「${deck.name}」 묶음(카드 ${deck.cards.length}장)을 삭제할까요?`)) return;
  data.decks = data.decks.filter(d => d.id !== id);
  fcSave(data);
  if (fcState.deckId === id) fcState.deckId = null;
  fcRenderDecks();
}

/* ── 덱 상세 ── */
function fcOpenDeck(id) {
  fcState.deckId = id;
  fcShowView('deck');
  fcRenderDeckView();
  setTimeout(() => {
    const el = document.getElementById('fc-front-input');
    if (el) el.focus();
  }, 80);
}

function fcBackToDecks() {
  fcState.deckId = null;
  fcRenderDecks();
}

function fcRenderDeckView() {
  const data = fcLoad();
  const deck = fcGetDeck(data, fcState.deckId);
  if (!deck) { fcState.deckId = null; fcRenderDecks(); return; }

  document.getElementById('fc-deck-title').textContent = deck.name;
  const studyBtn = document.getElementById('fc-study-btn');
  if (studyBtn) studyBtn.disabled = deck.cards.length === 0;

  const list = document.getElementById('fc-card-list');
  if (!list) return;
  if (deck.cards.length === 0) {
    list.innerHTML = `<div class="empty-state-small">아직 카드가 없어요. 직접 추가하거나 AI로 만들어보세요! ✨</div>`;
    return;
  }
  list.innerHTML = deck.cards.map((c, i) => `
    <div class="fc-card-row${c.miss ? ' fc-row-miss' : ''}">
      <span class="fc-row-num">${i + 1}</span>
      <span class="fc-row-front">${escHtml(c.front)}</span>
      <span class="fc-row-arrow">→</span>
      <span class="fc-row-back">${escHtml(c.back)}</span>
      ${c.miss ? '<span class="fc-row-tag">복습 필요</span>' : ''}
      <button class="fc-row-del" title="카드 삭제" onclick="fcDeleteCard('${c.id}')">✕</button>
    </div>
  `).join('');
}

function fcAddCard() {
  const frontEl = document.getElementById('fc-front-input');
  const backEl  = document.getElementById('fc-back-input');
  const front = frontEl.value.trim();
  const back  = backEl.value.trim();
  if (!front || !back) {
    const target = !front ? frontEl : backEl;
    target.focus();
    target.style.borderColor = '#D45C5C';
    setTimeout(() => target.style.borderColor = '', 1200);
    return;
  }
  const data = fcLoad();
  const deck = fcGetDeck(data, fcState.deckId);
  if (!deck) return;
  deck.cards.push({ id: genId(), front, back, miss: false });
  fcSave(data);
  frontEl.value = '';
  backEl.value = '';
  frontEl.focus();
  fcRenderDeckView();
}

function fcDeleteCard(cardId) {
  const data = fcLoad();
  const deck = fcGetDeck(data, fcState.deckId);
  if (!deck) return;
  deck.cards = deck.cards.filter(c => c.id !== cardId);
  fcSave(data);
  fcRenderDeckView();
}

/* ── AI 카드 생성 ── */
async function fcGenerateAI() {
  const topicEl = document.getElementById('fc-ai-topic');
  const btn     = document.getElementById('fc-ai-btn');
  const topic = topicEl.value.trim();
  if (!topic) {
    topicEl.focus();
    topicEl.style.borderColor = '#D45C5C';
    setTimeout(() => topicEl.style.borderColor = '', 1200);
    return;
  }
  const apiKey = localStorage.getItem(OPENAI_KEY_STORAGE);
  if (!apiKey) { showSettingsModal(); return; }

  const deckId = fcState.deckId;
  btn.disabled = true;
  const origText = btn.textContent;
  btn.textContent = '✨ 만드는 중...';

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '당신은 중고등학생용 암기 카드를 만드는 전문가입니다. 항상 유효한 JSON만 반환합니다.'
          },
          {
            role: 'user',
            content: `주제: "${topic}"\n\n이 주제로 홈스쿨러 학생을 위한 암기 카드 8장을 만들어주세요.\n앞면(front)은 질문/단어, 뒷면(back)은 답/뜻으로, 짧고 명확하게.\n아래 JSON 형식으로만 응답:\n{"cards":[{"front":"...","back":"..."}]}`
          }
        ]
      })
    });
    const json = await resp.json();
    if (json.error) throw new Error(json.error.message);
    const parsed = JSON.parse(json.choices[0].message.content);
    const cards = (parsed.cards || []).filter(c => c.front && c.back);
    if (!cards.length) throw new Error('카드를 만들지 못했어요. 주제를 조금 바꿔보세요.');

    const data = fcLoad();
    const deck = fcGetDeck(data, deckId);
    if (!deck) throw new Error('카드 묶음을 찾을 수 없어요.');
    cards.forEach(c => deck.cards.push({
      id: genId(),
      front: String(c.front).slice(0, 200),
      back:  String(c.back).slice(0, 300),
      miss: false
    }));
    fcSave(data);
    topicEl.value = '';
    showToast(`AI가 카드 ${cards.length}장을 만들었어요`, '✨');
    if (fcState.deckId === deckId) fcRenderDeckView();
  } catch (err) {
    showToast('오류: ' + err.message, '⚠️');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

/* ── 학습 모드 ── */
function fcStartStudy(reviewOnly = false) {
  const data = fcLoad();
  const deck = fcGetDeck(data, fcState.deckId);
  if (!deck || deck.cards.length === 0) return;

  let cards = reviewOnly ? deck.cards.filter(c => c.miss) : [...deck.cards];
  if (cards.length === 0) cards = [...deck.cards];

  // 셔플
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  fcState.queue = cards;
  fcState.idx = 0;
  fcState.flipped = false;
  fcState.againIds = [];
  fcState.knowCount = 0;

  fcShowView('study');
  document.getElementById('fc-study-done').style.display = 'none';
  document.getElementById('fc-flip-card').style.display = '';
  document.getElementById('fc-study-actions').style.display = '';
  fcShowCurrentCard();
}

function fcShowCurrentCard() {
  const card = fcState.queue[fcState.idx];
  if (!card) { fcFinishStudy(); return; }

  fcState.flipped = false;
  const inner = document.getElementById('fc-flip-inner');
  inner.classList.remove('flipped');
  // 카드 전환 시 살짝 등장 애니메이션
  const stage = document.getElementById('fc-flip-card');
  stage.classList.remove('fc-enter');
  void stage.offsetWidth; // reflow로 애니메이션 재시작
  stage.classList.add('fc-enter');

  document.getElementById('fc-face-front-text').textContent = card.front;
  document.getElementById('fc-face-back-text').textContent  = card.back;
  document.getElementById('fc-study-progress').textContent =
    `${fcState.idx + 1} / ${fcState.queue.length}`;

  fcUpdateAnswerButtons();
}

function fcFlip() {
  if (!fcState.queue[fcState.idx]) return;
  fcState.flipped = !fcState.flipped;
  document.getElementById('fc-flip-inner').classList.toggle('flipped', fcState.flipped);
  fcUpdateAnswerButtons();
}

function fcUpdateAnswerButtons() {
  document.querySelectorAll('#fc-study-actions button').forEach(b => {
    b.disabled = !fcState.flipped;
  });
}

function fcAnswer(know) {
  const card = fcState.queue[fcState.idx];
  if (!card || !fcState.flipped) return;

  // 결과 저장 (miss 플래그 영구 반영)
  const data = fcLoad();
  const deck = fcGetDeck(data, fcState.deckId);
  if (deck) {
    const target = deck.cards.find(c => c.id === card.id);
    if (target) target.miss = !know;
    fcSave(data);
  }
  if (know) fcState.knowCount++;
  else fcState.againIds.push(card.id);

  fcState.idx++;
  if (fcState.idx >= fcState.queue.length) fcFinishStudy();
  else fcShowCurrentCard();
}

function fcFinishStudy() {
  const total = fcState.queue.length;
  const know  = fcState.knowCount;
  const again = fcState.againIds.length;

  document.getElementById('fc-flip-card').style.display = 'none';
  document.getElementById('fc-study-actions').style.display = 'none';
  const done = document.getElementById('fc-study-done');
  done.style.display = 'block';

  const title = document.getElementById('fc-done-title');
  const sub   = document.getElementById('fc-done-sub');
  if (again === 0) {
    title.textContent = '전부 외웠어요! 🏆';
    sub.textContent = `카드 ${total}장을 모두 완벽하게 외웠어요. 최고예요!`;
    if (particles) particles.burst(window.innerWidth * 0.5, window.innerHeight * 0.35);
  } else {
    title.textContent = '학습 완료!';
    sub.textContent = `${total}장 중 ${know}장을 외웠어요. 남은 ${again}장은 복습으로 정복해봐요!`;
  }

  // "다시 볼 카드만 복습" 버튼: 복습할 카드가 없으면 숨김
  const reviewBtn = document.querySelector('#fc-study-done .fc-done-actions .btn-primary');
  if (reviewBtn) reviewBtn.style.display = again > 0 ? '' : 'none';
}

function fcExitStudy() {
  fcShowView('deck');
  fcRenderDeckView();
}

/* ============================================================
   PAPER PLANE CITY FLIGHT (종이비행기 도시비행) — Three.js 3D
   노을 지는 저녁, 로우폴리 도시 사이를 종이비행기로 활공하며
   금빛 링을 통과하는 3D 미니게임. 실패 없음 — 부딪히면 살짝 튕겨날 뿐.
   월드 원점은 항상 0 근처: 비행기는 제자리, 도시와 링이 흘러온다.
   ============================================================ */
const PP_SPEED      = 40;    // 기본 전진 속도 (unit/s)
const PP_BOOST_MULT = 1.6;   // 부스트 배속 (마우스 꾹 / 스페이스)
const PP_BUILDINGS  = 54;    // 재활용 빌딩 풀 크기
const PP_RINGS      = 7;     // 재활용 링 풀 크기
const PP_SPAN       = 300;   // 빌딩이 순환하는 z 구간 길이

const PP = {
  initialized: false, failed: false, rafId: null,
  container: null, renderer: null, scene: null, camera: null,
  plane: null, buildings: [], rings: [], groundTex: null,
  hitFlashEl: null,
  px: 0, py: 8, tx: 0, ty: 8,          // 비행기 위치 / 목표 위치
  knockX: 0, knockY: 0,                 // 충돌 넉백 속도
  shake: 0, hitT: 0,                    // 카메라 흔들림 / 화면 붉은 플래시
  boost: false,
  keys: { up: false, down: false, left: false, right: false },
  score: 0, ringCount: 0, dist: 0, distShown: -1,
  lastT: 0, t: 0
};

function ensurePaperInit() {
  if (PP.initialized) return;
  const box = document.getElementById('pp-canvas-container');
  if (!box) return;
  PP.initialized = true;
  try {
    if (typeof THREE === 'undefined') throw new Error('THREE not loaded');

    PP.container = box;
    PP.renderer = new THREE.WebGLRenderer({ antialias: true });
    PP.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    box.appendChild(PP.renderer.domElement);

    PP.scene = new THREE.Scene();
    PP.scene.background = _ppMakeSkyTexture();
    PP.scene.fog = new THREE.Fog(0xe0906c, 55, 250);   // 먼 도시가 노을빛 속으로 사라진다

    PP.camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 500);
    PP.camera.position.set(0, 10.5, 8);

    // 조명 — 낮게 걸린 노을 태양 + 부드러운 반구광 (그림자 맵 없음: 가벼움 유지)
    PP.scene.add(new THREE.HemisphereLight(0xffc9a0, 0x453552, 0.85));
    const sun = new THREE.DirectionalLight(0xffb070, 1.0);
    sun.position.set(-45, 55, -90);
    PP.scene.add(sun);

    _ppBuildGround();
    _ppBuildCity();
    _ppBuildPlane();
    _ppBuildRings();

    // 충돌 시 화면이 살짝 붉어지는 오버레이
    const flash = document.createElement('div');
    flash.className = 'pp-hit-flash';
    box.appendChild(flash);
    PP.hitFlashEl = flash;

    // 조작: 마우스/터치 위치 → 목표 지점, 꾹 누르면 부스트, 화살표 키도 지원
    box.addEventListener('mousemove', e => _ppPointer(e.clientX, e.clientY));
    box.addEventListener('mousedown', e => { e.preventDefault(); PP.boost = true; _ppPointer(e.clientX, e.clientY); });
    window.addEventListener('mouseup', () => { PP.boost = false; });
    box.addEventListener('touchstart', e => { e.preventDefault(); PP.boost = true; _ppPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    box.addEventListener('touchmove',  e => { e.preventDefault(); _ppPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    window.addEventListener('touchend', () => { PP.boost = false; });
    window.addEventListener('keydown', e => _ppKey(e, true));
    window.addEventListener('keyup',   e => _ppKey(e, false));

    window.addEventListener('resize', _ppResize);
    _ppResize();
    _ppUpdateHUD();
    // 루프는 ppResume()에서 시작 (탭/페이지가 보일 때만 돈다)
  } catch (err) {
    PP.failed = true;
    box.innerHTML = '<div class="pp-fallback">지금은 3D 그래픽을 불러올 수 없어요 —<br>인터넷 연결을 확인해주세요 ✈️</div>';
  }
}

function ppResume() {
  if (!PP.initialized || PP.failed || PP.rafId) return;
  _ppResize();                          // 숨겨진 채 초기화됐을 수 있으니 크기 재계산
  PP.lastT = performance.now();
  PP.rafId = requestAnimationFrame(ppTick);
}

function ppPause() {
  if (PP.rafId) { cancelAnimationFrame(PP.rafId); PP.rafId = null; }
}

function resetPaperPlane() {
  if (!PP.initialized || PP.failed) return;
  PP.score = 0; PP.ringCount = 0; PP.dist = 0; PP.distShown = -1;
  PP.px = 0; PP.py = 8; PP.tx = 0; PP.ty = 8;
  PP.knockX = 0; PP.knockY = 0; PP.shake = 0; PP.hitT = 0; PP.boost = false;
  PP.buildings.forEach(b => _ppPlaceBuilding(b, -20 - Math.random() * PP_SPAN));
  let z = -45;
  PP.rings.forEach(r => { _ppPlaceRing(r, z); z -= 30 + Math.random() * 14; });
  _ppUpdateHUD();
}

function _ppResize() {
  if (!PP.renderer || !PP.container) return;
  const w = PP.container.clientWidth, h = PP.container.clientHeight;
  if (!w || !h) return;                 // 탭이 숨겨진 상태면 건너뜀 (ppResume에서 재시도)
  PP.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  PP.renderer.setSize(w, h);
  PP.camera.aspect = w / h;
  PP.camera.updateProjectionMatrix();
}

/* ── 씬 구성 ── */

function _ppMakeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.00, '#241c4e');   // 하늘 꼭대기: 깊은 남보라
  grad.addColorStop(0.34, '#5c3a68');
  grad.addColorStop(0.55, '#b05a6e');   // 장밋빛 중간층
  grad.addColorStop(0.72, '#e88a62');
  grad.addColorStop(0.84, '#ffb070');   // 지평선의 주황빛
  grad.addColorStop(1.00, '#ffd9a0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  // 낮게 걸린 태양의 빛무리
  const sun = g.createRadialGradient(300, 408, 6, 300, 408, 120);
  sun.addColorStop(0.00, 'rgba(255,240,200,0.95)');
  sun.addColorStop(0.22, 'rgba(255,205,135,0.55)');
  sun.addColorStop(1.00, 'rgba(255,180,110,0)');
  g.fillStyle = sun;
  g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

function _ppBuildGround() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#2a2138';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(255,170,110,0.15)';  // 블록 사이 은은한 가로등 불빛 선
  g.lineWidth = 3;
  g.strokeRect(6, 6, 116, 116);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 24);
  PP.groundTex = tex;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 560),
    new THREE.MeshLambertMaterial({ map: tex })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -160);
  PP.scene.add(ground);
}

function _ppMakeBuildingMats() {
  const bases = ['#3a2f4e', '#33293f', '#452e44', '#2c3350'];
  return bases.map(base => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 64, 128);
    for (let y = 6; y < 122; y += 12) {
      for (let x = 5; x < 60; x += 10) {
        if (Math.random() < 0.42) {
          g.fillStyle = Math.random() < 0.8 ? '#ffb45e' : '#ffe2a6';  // 불 켜진 창
          g.fillRect(x, y, 5, 7);
        } else {
          g.fillStyle = 'rgba(0,0,0,0.28)';                            // 꺼진 창
          g.fillRect(x, y, 5, 7);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    const side = new THREE.MeshLambertMaterial({
      map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5
    });
    const roof = new THREE.MeshLambertMaterial({ color: new THREE.Color(base).multiplyScalar(0.7) });
    return [side, side, roof, roof, side, side];   // +x,-x,+y,-y,+z,-z
  });
}

function _ppBuildCity() {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mats = _ppMakeBuildingMats();
  for (let i = 0; i < PP_BUILDINGS; i++) {
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    _ppPlaceBuilding(m, -20 - Math.random() * PP_SPAN);
    PP.scene.add(m);
    PP.buildings.push(m);
  }
}

function _ppPlaceBuilding(m, z) {
  const corridor = Math.random() < 0.25;             // 25%는 비행 통로 안쪽에
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = corridor ? side * (4 + Math.random() * 8) : side * (13 + Math.random() * 34);
  const w = 4 + Math.random() * 5;
  const d = 4 + Math.random() * 5;
  const h = corridor ? 5 + Math.random() * 12 : 7 + Math.random() * 24;
  m.scale.set(w, h, d);
  m.position.set(x, h / 2, z);
}

function _ppBuildPlane() {
  // 종이 다트: 코끝 + 좌우 날개 + 아래 용골, 삼각형 3장
  const nose = [0, 0, -2.3];
  const mid  = [0, 0.05, 1.5];
  const lTip = [-1.55, 0.42, 1.5];
  const rTip = [ 1.55, 0.42, 1.5];
  const keel = [0, -0.62, 1.35];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    ...nose, ...lTip, ...mid,     // 왼 날개
    ...nose, ...mid,  ...rTip,    // 오른 날개
    ...nose, ...keel, ...mid      // 아래 용골
  ]), 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0xfdf3e3, roughness: 0.9, metalness: 0,
    side: THREE.DoubleSide, flatShading: true
  }));
  const crease = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo, 10),
    new THREE.LineBasicMaterial({ color: 0xbfa88e })   // 접은 자국
  );
  PP.plane = new THREE.Group();
  PP.plane.add(body);
  PP.plane.add(crease);
  PP.plane.position.set(0, PP.py, 0);
  PP.scene.add(PP.plane);
}

function _ppBuildRings() {
  const geo = new THREE.TorusGeometry(1.7, 0.16, 8, 28);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd27a, emissive: 0xffa030, emissiveIntensity: 0.85,
    roughness: 0.4, metalness: 0.2
  });
  let z = -45;
  for (let i = 0; i < PP_RINGS; i++) {
    const m = new THREE.Mesh(geo, mat);
    _ppPlaceRing(m, z);
    z -= 30 + Math.random() * 14;
    PP.scene.add(m);
    PP.rings.push(m);
  }
}

function _ppPlaceRing(m, z) {
  let x = 0, y = 8;
  for (let attempt = 0; attempt < 4; attempt++) {
    x = (Math.random() * 2 - 1) * 13;
    y = 3.5 + Math.random() * 11;
    if (!_ppInsideBuilding(x, y, z)) break;
  }
  m.position.set(x, y, z);
  m.userData.passed = false;
  m.visible = true;
}

function _ppInsideBuilding(x, y, z) {
  for (const b of PP.buildings) {
    if (Math.abs(b.position.z - z) > b.scale.z / 2 + 2.2) continue;
    if (Math.abs(x - b.position.x) < b.scale.x / 2 + 2.2 && y < b.scale.y + 2.2) return true;
  }
  return false;
}

/* ── 조작 ── */

function _ppPointer(cx, cy) {
  if (!PP.container) return;
  const r = PP.container.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const nx = Math.max(-1, Math.min(1, ((cx - r.left) / r.width) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, ((cy - r.top) / r.height) * 2 - 1));
  PP.tx = nx * 15;
  PP.ty = 9 - ny * 7;                   // 마우스를 올리면 상승
}

function _ppKey(e, down) {
  if (!PP.rafId) return;                // 종이비행기 탭이 보일 때만
  const k = e.key;
  if (k === 'ArrowUp') PP.keys.up = down;
  else if (k === 'ArrowDown') PP.keys.down = down;
  else if (k === 'ArrowLeft') PP.keys.left = down;
  else if (k === 'ArrowRight') PP.keys.right = down;
  else if (k === ' ') PP.boost = down;
  else return;
  e.preventDefault();
}

/* ── 메인 루프 ── */

function ppTick(now) {
  PP.rafId = requestAnimationFrame(ppTick);
  const dt = Math.min((now - PP.lastT) / 1000 || 0.016, 0.05);
  PP.lastT = now;
  PP.t += dt;

  const spd = PP_SPEED * (PP.boost ? PP_BOOST_MULT : 1);

  // 화살표 키 → 목표 지점 이동 (마우스 대신 쓸 수 있는 보조 조작)
  const K = PP.keys;
  if (K.left || K.right) PP.tx = Math.max(-15, Math.min(15, PP.tx + ((K.right ? 1 : 0) - (K.left ? 1 : 0)) * 30 * dt));
  if (K.up || K.down)    PP.ty = Math.max(2,  Math.min(16, PP.ty + ((K.up ? 1 : 0)  - (K.down ? 1 : 0))  * 24 * dt));

  // 비행기: 목표를 향해 부드럽게 + 충돌 넉백 감쇠
  const prevX = PP.px, prevY = PP.py;
  const ease = 1 - Math.pow(0.06, dt);
  PP.px += (PP.tx - PP.px) * ease + PP.knockX * dt;
  PP.py += (PP.ty - PP.py) * ease + PP.knockY * dt;
  PP.knockX *= Math.pow(0.02, dt);
  PP.knockY *= Math.pow(0.02, dt);
  PP.px = Math.max(-17, Math.min(17, PP.px));
  PP.py = Math.max(1.4, Math.min(17, PP.py));
  const vx = (PP.px - prevX) / Math.max(dt, 0.001);
  const vy = (PP.py - prevY) / Math.max(dt, 0.001);

  // 기체 자세: 선회 방향으로 기울고(뱅크), 오르내릴 때 기수가 따라간다
  const bob = Math.sin(PP.t * 2.1) * 0.06;            // 종이비행기 특유의 산들거림
  PP.plane.position.set(PP.px, PP.py + bob, 0);
  PP.plane.rotation.set(
    Math.max(-0.6, Math.min(0.6, vy * 0.035)),        // pitch
    0,
    Math.max(-0.9, Math.min(0.9, -vx * 0.045))        // roll (bank)
  );

  // 도시와 링이 비행기 쪽으로 흘러온다 — 지나가면 저 멀리 앞으로 재활용
  for (const b of PP.buildings) {
    b.position.z += spd * dt;
    if (b.position.z - b.scale.z / 2 > 20) _ppPlaceBuilding(b, b.position.z - PP_SPAN);
  }
  if (PP.groundTex) {
    PP.groundTex.offset.y += (spd * dt) / (560 / 24);
    if (PP.groundTex.offset.y > 1) PP.groundTex.offset.y -= 1;   // 부동소수점 오차 방지
  }

  for (const r of PP.rings) {
    const prevZ = r.position.z;
    r.position.z += spd * dt;
    r.rotation.z += dt * 1.2;
    if (!r.userData.passed && prevZ <= 0 && r.position.z > 0) {
      r.userData.passed = true;
      const dx = PP.px - r.position.x, dy = PP.py - r.position.y;
      if (r.visible && Math.hypot(dx, dy) < 2.4) _ppCollectRing(r);
    }
    if (r.position.z > 18) _ppPlaceRing(r, _ppFarthestRingZ() - (28 + Math.random() * 16));
  }

  // 빌딩 충돌 — 실패 없음: 살짝 튕겨내고 화면만 잠깐 흔들린다
  for (const b of PP.buildings) {
    if (Math.abs(b.position.z) > b.scale.z / 2 + 1.4) continue;
    const hw = b.scale.x / 2;
    if (Math.abs(PP.px - b.position.x) < hw + 1.1 && PP.py < b.scale.y + 0.6) {
      const dir = PP.px >= b.position.x ? 1 : -1;
      PP.px = Math.max(-17, Math.min(17, b.position.x + dir * (hw + 1.6)));
      PP.tx = Math.max(-15, Math.min(15, PP.px));
      PP.knockX = dir * 10;
      PP.knockY = 4;
      PP.shake = 1;
      PP.hitT = 1;
    }
  }
  PP.shake = Math.max(0, PP.shake - dt * 2.4);
  PP.hitT  = Math.max(0, PP.hitT - dt * 2.2);
  if (PP.hitFlashEl) PP.hitFlashEl.style.opacity = PP.hitT * 0.85;

  // 3인칭 추적 카메라: 비행기 뒤 위에서 부드럽게 따라간다
  const cEase = 1 - Math.pow(0.03, dt);
  PP.camera.position.x += (PP.px * 0.88 - PP.camera.position.x) * cEase;
  PP.camera.position.y += (PP.py + 2.5 - PP.camera.position.y) * cEase;
  PP.camera.position.z = 8;
  const shk = PP.shake * PP.shake * 0.5;
  if (shk > 0.002) {
    PP.camera.position.x += (Math.random() - 0.5) * shk;
    PP.camera.position.y += (Math.random() - 0.5) * shk;
  }
  PP.camera.lookAt(PP.px * 0.9, PP.py + 0.4, -22);

  // 비행거리
  PP.dist += spd * dt;
  const df = Math.floor(PP.dist);
  if (df !== PP.distShown) {
    PP.distShown = df;
    const d = document.getElementById('pp-dist');
    if (d) d.textContent = df + 'm';
  }

  PP.renderer.render(PP.scene, PP.camera);
}

function _ppFarthestRingZ() {
  let minZ = 0;
  for (const r of PP.rings) if (r.position.z < minZ) minZ = r.position.z;
  return minZ;
}

/* ── 득점 ── */

function _ppCollectRing(r) {
  r.visible = false;
  PP.score += 10;
  PP.ringCount++;

  const pos = _ppToScreen(r.position);
  if (pos) {
    if (particles) particles.burst(pos.clientX, pos.clientY);
    _ppPopup('+10', pos.x, pos.y, '#ffd27a', 22);
  }
  // 10개 단위 축하
  if (PP.ringCount % 10 === 0) {
    const rect = PP.container.getBoundingClientRect();
    if (particles && rect.width) particles.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.35);
    showToast(`링 ${PP.ringCount}개 통과! 노을 하늘의 멋진 파일럿이에요`, '🛩️');
    if (pos) _ppPopup(`${PP.ringCount}개째! 🌟`, pos.x, pos.y - 30, '#ffe9b0', 17);
  }
  _ppUpdateHUD();
}

function _ppToScreen(v3) {
  const rect = PP.container.getBoundingClientRect();
  if (!rect.width) return null;
  const v = v3.clone().project(PP.camera);
  if (v.z > 1) return null;
  const x = (v.x * 0.5 + 0.5) * rect.width;
  const y = (1 - (v.y * 0.5 + 0.5)) * rect.height;
  return { x, y, clientX: rect.left + x, clientY: rect.top + y };
}

function _ppPopup(text, x, y, color, size) {
  if (!PP.container) return;
  const el = document.createElement('div');
  el.className = 'pp-popup';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = color;
  el.style.fontSize = size + 'px';
  PP.container.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function _ppUpdateHUD() {
  const s = document.getElementById('pp-score');
  const r = document.getElementById('pp-rings');
  const d = document.getElementById('pp-dist');
  if (s) s.textContent = PP.score;
  if (r) r.textContent = PP.ringCount;
  if (d) d.textContent = Math.floor(PP.dist) + 'm';
}
