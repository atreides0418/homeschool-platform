'use strict';
/* ============================================================
   과목별 계획 (홈 화면)
   - 과목 탭: 추가·삭제·이름·색·순서 변경
   - 과목마다: 오늘 계획(기존 하루 시간표·달력에서 과목 이름이 들어간 일정) / 장기 계획표 / 공부 방식 / 공부 툴
   - 데이터는 새 키 hs_subject_plans 에만 저장 (기존 데이터는 읽기만 함)
     hs_ 로 시작하므로 기존 기기 동기화와 백업에 자동으로 포함됨
   - 기존 app.js 와 이름이 겹치지 않도록 전부 SubjectPlans 안에 넣음
   ============================================================ */
const SubjectPlans = (() => {
  const KEY = 'hs_subject_plans';
  const UI_KEY = 'sp_ui'; // 접힘 상태·마지막 과목 (기기마다 따로, 동기화 안 함)
  const AI_MODEL = 'gpt-4o-mini';
  const TOOL_TYPES = {
    lecture: { label: '강좌', icon: 'play' },
    book: { label: '책', icon: 'book' },
    site: { label: '사이트', icon: 'globe' },
    etc: { label: '기타', icon: 'tag' },
  };
  const PALETTE = ['#FBE3E3', '#FDE8D4', '#FFF1CC', '#EAF4D6', '#E2F3E6', '#DCF0EF', '#E1ECFB', '#E7E4FA', '#F4E3F4', '#ECEAE4'];
  const DEFAULT_SUBJECTS = [
    { id: 's_kor', name: '국어', color: '#FBE3E3' },
    { id: 's_eng', name: '영어', color: '#E1ECFB' },
    { id: 's_math', name: '수학', color: '#E2F3E6' },
    { id: 's_sci', name: '과학', color: '#FFF1CC' },
  ];
  const TEMPLATE = [['기간', 'text'], ['목표', 'text'], ['교재·강의', 'text'], ['분량', 'text'], ['완료', 'check']];

  let data = null;
  let ui = null;
  let root = null;
  let focusCell = null;

  /* ---------- 데이터 ---------- */
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 64;
  const list = v => (Array.isArray(v) ? v : []);
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const emptySubjectData = () => ({ planTable: { columns: [], rows: [] }, methods: [], tools: [] });

  function safeUrl(v) {
    if (typeof v !== 'string' || !v) return '';
    try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }

  function normalize(raw) {
    if (!isObj(raw) || !Array.isArray(raw.subjects)) return null;
    const seen = new Set();
    const subjects = raw.subjects
      .filter(s => isObj(s) && isId(s.id) && !seen.has(s.id) && seen.add(s.id))
      .map(s => ({ id: s.id, name: (typeof s.name === 'string' ? s.name.slice(0, 20).trim() : '') || '이름 없음', color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#ECEAE4' }));
    const sd = isObj(raw.subjectData) ? raw.subjectData : {};
    const subjectData = {};
    for (const s of subjects) {
      const src = sd[s.id];
      const out = emptySubjectData();
      if (isObj(src)) {
        const pt = isObj(src.planTable) ? src.planTable : {};
        const colIds = new Set();
        out.planTable.columns = list(pt.columns).filter(c => isObj(c) && isId(c.id) && !colIds.has(c.id) && colIds.add(c.id))
          .map(c => ({ id: c.id, name: typeof c.name === 'string' ? c.name.slice(0, 30) : '', type: c.type === 'check' ? 'check' : 'text' }));
        const types = Object.fromEntries(out.planTable.columns.map(c => [c.id, c.type]));
        out.planTable.rows = list(pt.rows).filter(r => isObj(r) && isId(r.id)).map(r => {
          const cells = {};
          if (isObj(r.cells)) for (const [k, v] of Object.entries(r.cells)) {
            if (types[k] === 'check' && typeof v === 'boolean') cells[k] = v;
            else if (types[k] === 'text' && typeof v === 'string') cells[k] = v.slice(0, 500);
          }
          return { id: r.id, cells };
        });
        out.methods = list(src.methods).filter(m => isObj(m) && isId(m.id) && typeof m.text === 'string').map(m => ({ id: m.id, text: m.text.slice(0, 300) }));
        out.tools = list(src.tools).filter(t => isObj(t) && isId(t.id) && typeof t.name === 'string').map(t => ({
          id: t.id, type: TOOL_TYPES[t.type] ? t.type : 'etc', name: t.name.slice(0, 100), url: safeUrl(t.url),
          memo: typeof t.memo === 'string' ? t.memo.slice(0, 500) : '',
        }));
      }
      subjectData[s.id] = out;
    }
    return { version: 1, subjects, subjectData };
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
    data = raw ? normalize(raw) : null;
    if (!data) {
      data = { version: 1, subjects: DEFAULT_SUBJECTS.map(s => ({ ...s })), subjectData: Object.fromEntries(DEFAULT_SUBJECTS.map(s => [s.id, emptySubjectData()])) };
    }
    try { ui = JSON.parse(localStorage.getItem(UI_KEY)); } catch { ui = null; }
    if (!isObj(ui)) ui = {};
    if (!isObj(ui.collapsed)) ui.collapsed = {};
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); }
  }
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* 무시 */ } }
  function update(fn, opts) { fn(data); save(); render(opts); }

  const sd = (d, sid) => d.subjectData[sid];
  const tableOf = (d, sid) => d.subjectData[sid].planTable;

  /* ---------- DOM 도우미 (사용자 입력은 항상 텍스트로 넣음) ---------- */
  function appendAll(node, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false || c === '') continue;
      node.append(c instanceof Node ? c : String(c));
    }
  }
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    const late = {};
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v; // 코드에 고정된 아이콘 SVG에만 사용
      else if (k === 'style') { for (const [sk, sv] of Object.entries(v)) if (sv != null) { if (sk.startsWith('--')) node.style.setProperty(sk, sv); else node.style[sk] = sv; } }
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked') late[k] = v;
      else if (k === 'disabled' || k === 'hidden') node[k] = true;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    appendAll(node, children);
    Object.assign(node, late);
    return node;
  }

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M18 7l-1 13H7L6 7"/>',
    edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17Z"/>',
    more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m10 9 5 3-5 3Z"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
    tag: '<path d="M3 12V4h8l9 9-8 8Z"/><circle cx="7.5" cy="8" r="1.2"/>',
  };
  const icon = (name, cls = '') => h('span', {
    class: 'sp-icon ' + cls, 'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`,
  });
  const iconBtn = (name, label, onclick, { danger = false, disabled = false, cls = '' } = {}) =>
    h('button', { type: 'button', class: `sp-icon-btn ${cls}${danger ? ' is-danger' : ''}`, 'aria-label': label, title: label, disabled, onclick }, icon(name));
  const isComposing = e => e.isComposing || e.keyCode === 229;
  const move = (arr, i, dir) => { const j = i + dir; if (j >= 0 && j < arr.length) [arr[i], arr[j]] = [arr[j], arr[i]]; };

  // 파스텔 과목 색 → 같은 색 계열의 진한 글자색·포인트색
  function hsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    let hh = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      hh = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    }
    return { h: Math.round(hh), s: Math.round(s * 100) };
  }
  function tone(hex, light, alpha = 1) {
    const { h: hh, s } = hsl(hex);
    return `hsl(${hh} ${s === 0 ? 0 : Math.min(60, Math.max(32, s))}% ${light}% / ${alpha})`;
  }
  const ink = (hex, a) => tone(hex, 27, a);

  function autosize(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', fit);
    setTimeout(fit);
    return ta;
  }

  /* ---------- 알림 ---------- */
  function toast(message, action) {
    let box = document.getElementById('sp-toasts');
    if (!box) { box = h('div', { id: 'sp-toasts', class: 'sp-toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = h('div', { class: 'sp-toast', role: 'status' }, h('span', null, message),
      action && h('button', { type: 'button', class: 'sp-toast-action', onclick: () => { t.remove(); action.onClick(); } }, action.label));
    box.append(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), action ? 6000 : 2800);
  }

  /* ---------- 창 ---------- */
  const stack = [];
  function modal(title, onClose) {
    const prev = document.activeElement;
    const titleId = 'sp-mt-' + Math.random().toString(36).slice(2, 8);
    const body = h('div', { class: 'sp-modal-body' });
    const footer = h('div', { class: 'sp-modal-foot', hidden: true });
    let closed = false;
    const api = {
      body,
      get closed() { return closed; },
      setBody(...n) { body.replaceChildren(); appendAll(body, n); },
      setFooter(...n) { footer.replaceChildren(); appendAll(footer, n); footer.hidden = !footer.children.length; },
      close() {
        if (closed) return;
        closed = true;
        closePopover();
        overlay.remove();
        stack.splice(stack.indexOf(api), 1);
        if (prev && prev.isConnected) prev.focus();
        if (onClose) onClose();
      },
    };
    const box = h('div', { class: 'sp-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('div', { class: 'sp-modal-head' }, h('h2', { class: 'sp-modal-title', id: titleId }, title), iconBtn('x', '닫기', () => api.close())),
      body, footer);
    const overlay = h('div', { class: 'sp-overlay' }, box);
    overlay.addEventListener('pointerdown', e => { if (e.target === overlay) api.close(); });
    document.body.append(overlay);
    stack.push(api);
    setTimeout(() => {
      const t = box.querySelector('[data-autofocus]') || body.querySelector('input:not([type=checkbox]):not([type=color]), textarea, select') || box.querySelector('.sp-icon-btn');
      if (t) t.focus();
    });
    return api;
  }

  function confirmBox(message, { title = '확인', ok = '확인', danger = false } = {}) {
    return new Promise(resolve => {
      let result = false;
      const m = modal(title, () => resolve(result));
      m.setBody(h('p', { class: 'sp-modal-text' }, message));
      m.setFooter(h('span', { class: 'sp-spacer' }),
        h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
        h('button', { type: 'button', class: 'sp-btn ' + (danger ? 'sp-btn-danger' : 'sp-btn-primary'), 'data-autofocus': true, onclick: () => { result = true; m.close(); } }, ok));
    });
  }

  let pop = null;
  function onOutside(e) { if (pop && !pop.contains(e.target)) closePopover(); }
  function closePopover() {
    if (!pop) return false;
    pop.remove(); pop = null;
    document.removeEventListener('pointerdown', onOutside, true);
    return true;
  }
  function popover(anchor, content) {
    closePopover();
    const p = h('div', { class: 'sp-popover' }, content);
    document.body.append(p);
    const r = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), innerWidth - p.offsetWidth - 8);
    let top = r.bottom + 6;
    if (top + p.offsetHeight > innerHeight - 8 && r.top - p.offsetHeight - 6 > 8) top = r.top - p.offsetHeight - 6;
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    pop = p;
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true));
    return p;
  }
  function menu(anchor, items) {
    const m = h('div', { class: 'sp-menu', role: 'menu' }, items.map(it => it === '-'
      ? h('hr', { class: 'sp-menu-sep' })
      : h('button', { type: 'button', role: 'menuitem', class: 'sp-menu-item' + (it.danger ? ' is-danger' : ''), disabled: it.disabled, onclick: () => { closePopover(); it.onClick(); } }, it.label)));
    popover(anchor, m);
    const first = m.querySelector('button:not([disabled])');
    if (first) first.focus();
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (closePopover()) { e.stopPropagation(); return; }
    const top = stack[stack.length - 1];
    if (top) { e.stopPropagation(); top.close(); }
  }, true);
  window.addEventListener('resize', closePopover);
  document.addEventListener('scroll', closePopover, true);

  function field(label, control, hint) {
    return h('div', { class: 'sp-field' }, h('div', { class: 'sp-field-label' }, label), control, hint && h('p', { class: 'sp-field-hint' }, hint));
  }
  function segmented(options, current, onChange, label) {
    const g = h('div', { class: 'sp-seg', role: 'radiogroup', 'aria-label': label });
    for (const [value, text] of options) {
      const b = h('button', {
        type: 'button', role: 'radio', class: 'sp-seg-btn' + (value === current ? ' is-on' : ''), 'aria-checked': String(value === current),
        onclick: () => {
          for (const o of g.children) { o.classList.remove('is-on'); o.setAttribute('aria-checked', 'false'); }
          b.classList.add('is-on'); b.setAttribute('aria-checked', 'true');
          onChange(value);
        },
      }, text);
      g.append(b);
    }
    return g;
  }

  // 그 자리에서 고치기: Enter·바깥 클릭 = 저장, Esc = 취소, Shift+Enter = 줄바꿈
  function inlineEdit(host, value, onSave, { multiline = true, maxlength = 500, label = '내용 수정' } = {}) {
    const input = h(multiline ? 'textarea' : 'input', { class: 'sp-inline-input', value, maxlength, rows: multiline ? 1 : null, 'aria-label': label });
    host.replaceChildren(input);
    if (multiline) autosize(input);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (ok && v !== value) onSave(v); else render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', e => {
      if (isComposing(e)) return;
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
  }

  /* ---------- 오늘 계획: 기존 하루 시간표·달력에서 과목 이름이 들어간 오늘 일정 (읽기 전용) ---------- */
  function readJson(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
  function todayKey() {
    if (typeof todayStr === 'function') return todayStr();
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }
  function timeSortKey(t) {
    if (typeof ttSortKey === 'function') return ttSortKey(t);
    const [hh, mm] = String(t || '').split(':').map(Number);
    return (hh || 0) * 60 + (mm || 0);
  }
  function todayItems(subj) {
    const key = todayKey();
    const name = subj.name;
    const tt = list(readJson('hs_timetable')[key])
      .filter(it => typeof it.text === 'string' && it.text.includes(name))
      .sort((a, b) => timeSortKey(a.start) - timeSortKey(b.start))
      .map(it => ({ time: it.start, end: it.end, text: it.text, from: '시간표' }));
    const cal = list(readJson('hs_schedules_v2')[key])
      .filter(it => `${it.subject || ''} ${it.desc || ''}`.includes(name))
      .map(it => ({ time: '', text: [it.subject, it.desc].filter(Boolean).join(' · '), done: !!it.done, from: '달력' }));
    return [...tt, ...cal];
  }
  function openTimetable() {
    try { if (typeof ttDayMode !== 'undefined' && !ttDayMode && typeof toggleDayView === 'function') toggleDayView(); } catch { /* 무시 */ }
    const card = document.querySelector('#page-home .calendar-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 장기 계획표 ---------- */
  const filled = v => v === true || (typeof v === 'string' && v.trim() !== '');
  const hasContent = t => t.rows.some(r => Object.values(r.cells).some(filled));
  const colHasContent = (t, id) => t.rows.some(r => filled(r.cells[id]));
  const makeRows = n => Array.from({ length: n }, () => ({ id: uid('r'), cells: {} }));
  function progress(t) {
    const checks = t.columns.filter(c => c.type === 'check');
    if (!checks.length) return null;
    const total = checks.length * t.rows.length;
    let done = 0;
    for (const r of t.rows) for (const c of checks) if (r.cells[c.id] === true) done++;
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function planBody(sid) {
    const t = tableOf(data, sid);
    if (!t.columns.length) {
      return h('div', { class: 'sp-empty' },
        h('p', null, '아직 표의 열이 없어요.'),
        h('p', { class: 'sp-empty-sub' }, '기본 틀로 시작하거나 AI에게 이 과목에 맞는 열 구성을 제안받을 수 있어요. 내용은 직접 채워요.'),
        h('div', { class: 'sp-empty-actions' },
          h('button', { type: 'button', class: 'sp-btn', onclick: () => useTemplate(sid) }, '기본 틀 쓰기'),
          h('button', { type: 'button', class: 'sp-btn sp-btn-ai', onclick: () => suggest(sid) }, icon('sparkle'), 'AI로 틀 만들기'),
          h('button', { type: 'button', class: 'sp-btn sp-btn-ghost', onclick: () => addColumn(sid) }, icon('plus'), '열 직접 추가')));
    }
    const p = progress(t);
    return h('div', null,
      p && h('div', { class: 'sp-progress' },
        h('div', { class: 'sp-progress-top' },
          h('span', { class: 'sp-progress-label' }, '진도율'),
          h('span', { class: 'sp-progress-num' }, h('strong', null, `${p.pct}%`), ` · ${p.done}/${p.total}칸 완료`)),
        h('div', { class: 'sp-progress-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(p.pct), 'aria-label': '진도율' },
          h('div', { class: 'sp-progress-fill', style: { width: p.pct + '%' } }))),
      h('div', { class: 'sp-table-wrap' },
        h('table', { class: 'sp-table' },
          h('thead', null, h('tr', null, t.columns.map((c, i) => headCell(sid, t, c, i)), h('th', { class: 'sp-row-actions', scope: 'col' }, h('span', { class: 'sp-sr' }, '행 관리')))),
          h('tbody', null, t.rows.length
            ? t.rows.map((r, ri) => bodyRow(sid, t, r, ri))
            : h('tr', null, h('td', { class: 'sp-table-empty', colspan: t.columns.length + 1 }, '아래 \'행 추가\'를 눌러 첫 줄을 만들어 보세요.'))))),
      h('div', { class: 'sp-table-foot' },
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: () => addRow(sid) }, icon('plus'), '행 추가'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: () => addColumn(sid) }, icon('plus'), '열 추가'),
        h('span', { class: 'sp-table-tip' }, '칸을 누르면 바로 고칠 수 있어요 · Shift+Enter 줄바꿈')));
  }

  function headCell(sid, t, c, i) {
    const inner = h('div', { class: 'sp-th-inner' },
      h('button', { type: 'button', class: 'sp-th-name', title: '이름 바꾸기', onclick: () => renameColumn(sid, c, inner) }, c.name || '이름 없음'),
      iconBtn('more', `${c.name || '이름 없음'} 열 메뉴`, e => columnMenu(e.currentTarget, sid, t, c, i), { cls: 'sp-th-more' }));
    return h('th', { scope: 'col', class: c.type === 'check' ? 'sp-col-check' : 'sp-col-text' }, inner);
  }

  function bodyRow(sid, t, r, ri) {
    const label = `${ri + 1}행`;
    return h('tr', null,
      t.columns.map(c => c.type === 'check' ? checkCell(sid, r, c, label) : textCell(sid, r, c, label)),
      h('td', { class: 'sp-row-actions' }, h('div', { class: 'sp-row-actions-inner' },
        iconBtn('up', `${label} 위로`, () => update(d => move(tableOf(d, sid).rows, ri, -1)), { disabled: ri === 0 }),
        iconBtn('down', `${label} 아래로`, () => update(d => move(tableOf(d, sid).rows, ri, 1)), { disabled: ri === t.rows.length - 1 }),
        iconBtn('trash', `${label} 삭제`, () => removeRow(sid, r, ri), { danger: true }))));
  }

  function checkCell(sid, r, c, label) {
    return h('td', { class: 'sp-cell-check' }, h('label', { class: 'sp-check' },
      h('input', {
        type: 'checkbox', checked: r.cells[c.id] === true, 'aria-label': `${label} ${c.name}`,
        onchange: e => { const v = e.target.checked; update(d => { const row = tableOf(d, sid).rows.find(x => x.id === r.id); if (row) row.cells[c.id] = v; }); },
      }),
      h('span', { class: 'sp-check-box', 'aria-hidden': 'true' })));
  }

  function textCell(sid, r, c, label) {
    const value = typeof r.cells[c.id] === 'string' ? r.cells[c.id] : '';
    const td = h('td', { class: 'sp-cell-text' });
    const start = () => inlineEdit(td, value, v => update(d => { const row = tableOf(d, sid).rows.find(x => x.id === r.id); if (row) row.cells[c.id] = v; }), { label: `${label} ${c.name}` });
    td.append(h('div', {
      class: 'sp-cell-view', tabindex: '0', role: 'button', 'aria-label': `${label} ${c.name}: ${value || '비어 있음'}. 눌러서 수정`,
      onclick: start, onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); start(); } },
    }, value));
    if (focusCell && focusCell.rowId === r.id && focusCell.colId === c.id) {
      focusCell = null;
      setTimeout(() => { if (td.isConnected) start(); });
    }
    return td;
  }

  function renameColumn(sid, c, host) {
    inlineEdit(host, c.name, v => {
      if (!v) { render(); return; }
      update(d => { const col = tableOf(d, sid).columns.find(x => x.id === c.id); if (col) col.name = v.slice(0, 30); });
    }, { multiline: false, maxlength: 30, label: '열 이름' });
  }

  function columnMenu(anchor, sid, t, c, i) {
    menu(anchor, [
      { label: '이름 바꾸기', onClick: () => renameColumn(sid, c, anchor.closest('th').querySelector('.sp-th-inner')) },
      { label: c.type === 'check' ? '글자 열로 바꾸기' : '체크 열로 바꾸기', onClick: () => changeType(sid, t, c) },
      { label: '왼쪽으로 옮기기', disabled: i === 0, onClick: () => update(d => move(tableOf(d, sid).columns, i, -1)) },
      { label: '오른쪽으로 옮기기', disabled: i === t.columns.length - 1, onClick: () => update(d => move(tableOf(d, sid).columns, i, 1)) },
      '-',
      { label: '열 삭제', danger: true, onClick: () => removeColumn(sid, t, c) },
    ]);
  }

  async function changeType(sid, t, c) {
    if (colHasContent(t, c.id) && !await confirmBox(`'${c.name}' 열에 적힌 내용이 지워져요. 종류를 바꿀까요?`, { title: '열 종류 바꾸기', ok: '바꾸기', danger: true })) return;
    update(d => {
      const pt = tableOf(d, sid);
      const col = pt.columns.find(x => x.id === c.id);
      if (!col) return;
      col.type = c.type === 'check' ? 'text' : 'check';
      for (const r of pt.rows) delete r.cells[c.id];
    });
  }

  async function removeColumn(sid, t, c) {
    if (colHasContent(t, c.id) && !await confirmBox(`'${c.name}' 열과 그 안의 내용을 삭제할까요?`, { title: '열 삭제', ok: '삭제', danger: true })) return;
    update(d => {
      const pt = tableOf(d, sid);
      pt.columns = pt.columns.filter(x => x.id !== c.id);
      for (const r of pt.rows) delete r.cells[c.id];
    });
  }

  function addColumn(sid) {
    const m = modal('열 추가');
    let type = 'text';
    const name = h('input', { type: 'text', class: 'sp-input', maxlength: 30, placeholder: '예: 목표 점수', 'aria-label': '열 이름' });
    const submit = () => {
      const v = name.value.trim() || (type === 'check' ? '완료' : '새 열');
      update(d => {
        const pt = tableOf(d, sid);
        pt.columns.push({ id: uid('c'), name: v, type });
        if (!pt.rows.length) pt.rows.push(...makeRows(1));
      });
      m.close();
    };
    m.setBody(h('form', { class: 'sp-form', onsubmit: e => { e.preventDefault(); submit(); } },
      field('열 이름', name),
      field('종류', segmented([['text', '글자'], ['check', '체크']], type, v => { type = v; }, '열 종류'), '체크 열이 있으면 체크한 비율로 진도율이 표시돼요.')));
    m.setFooter(h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: submit }, '추가'));
  }

  function useTemplate(sid) {
    update(d => {
      const pt = tableOf(d, sid);
      pt.columns = TEMPLATE.map(([name, type]) => ({ id: uid('c'), name, type }));
      pt.rows = makeRows(1);
    });
  }

  function addRow(sid) {
    const row = makeRows(1)[0];
    const firstText = tableOf(data, sid).columns.find(c => c.type === 'text');
    if (firstText) focusCell = { rowId: row.id, colId: firstText.id };
    update(d => tableOf(d, sid).rows.push(row));
  }

  function removeRow(sid, r, ri) {
    const had = Object.values(r.cells).some(filled);
    update(d => { const pt = tableOf(d, sid); pt.rows = pt.rows.filter(x => x.id !== r.id); });
    if (had) toast('행을 삭제했어요.', { label: '되돌리기', onClick: () => update(d => { if (d.subjectData[sid]) { const pt = tableOf(d, sid); pt.rows.splice(Math.min(ri, pt.rows.length), 0, r); } }) });
  }

  /* AI로 틀 만들기: 설정에 저장된 OpenAI 키로 열 구성(이름·종류)만 제안받음. 내용은 사용자가 채움 */
  function cleanColumns(cols) {
    if (!Array.isArray(cols)) return [];
    const seen = new Set();
    return cols.filter(c => c && typeof c.name === 'string' && c.name.trim())
      .map(c => ({ name: c.name.trim().slice(0, 20), type: c.type === 'check' ? 'check' : 'text' }))
      .filter(c => !seen.has(c.name) && seen.add(c.name))
      .slice(0, 8);
  }

  function suggest(sid) {
    const subj = data.subjects.find(s => s.id === sid);
    if (!subj) return;
    const apiKey = localStorage.getItem('hs_openai_key');
    if (!apiKey) {
      confirmBox('AI 기능을 쓰려면 설정에서 OpenAI API 키를 먼저 저장해 주세요. 설정을 열까요?', { title: 'AI 키 필요', ok: '설정 열기' })
        .then(ok => { if (ok && typeof showSettingsModal === 'function') showSettingsModal(); });
      return;
    }
    const m = modal('AI로 틀 만들기');
    let cols = [];

    async function run() {
      m.setBody(h('div', { class: 'sp-ai-loading' }, h('span', { class: 'sp-spinner', 'aria-hidden': 'true' }), h('p', null, `'${subj.name}' 과목에 맞는 장기 계획표 열 구성을 받아오는 중이에요…`)));
      m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'));
      try {
        let res;
        try {
          res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: AI_MODEL, temperature: 0.7, max_tokens: 300, response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: '너는 학교에 다니지 않고 혼자 공부하는 학생의 과목별 장기 공부 계획표를 설계하는 도우미야. 주어진 과목에 맞는 표의 "열 구성"만 제안해. 표 안의 내용은 쓰지 마. 열은 4~6개, 각 이름은 2~8자의 짧은 한국어. 각 열의 type은 "text" 또는 "check"이고 진도 체크용 "check" 열을 1개 넣어. 반드시 {"columns":[{"name":"기간","type":"text"}]} 형식의 JSON으로만 답해.' },
                { role: 'user', content: `과목: ${subj.name}` },
              ],
            }),
          });
        } catch { throw new Error('AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'API 키가 올바르지 않아요. 설정에서 키를 확인해 주세요.'
            : res.status === 429 ? '요청이 많거나 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
              : 'AI 서버에서 오류가 났어요. 잠시 후 다시 시도해 주세요.');
        }
        let parsed = null;
        try { parsed = JSON.parse(json.choices[0].message.content); } catch { /* 형식 오류 */ }
        cols = cleanColumns(parsed && parsed.columns);
        if (cols.length < 2) throw new Error('제안 결과를 읽지 못했어요. 다시 시도해 주세요.');
        if (!m.closed) showResult();
      } catch (err) {
        if (!m.closed) {
          m.setBody(h('div', { class: 'sp-notice' }, h('p', null, err.message)));
          m.setFooter(h('span', { class: 'sp-spacer' }),
            h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '닫기'),
            h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: run }, '다시 시도'));
        }
      }
    }

    function showResult() {
      m.setBody(
        h('p', { class: 'sp-modal-text' }, `'${subj.name}' 장기 계획표에 이런 열 구성을 제안했어요.`),
        h('ol', { class: 'sp-ai-cols' }, cols.map(c => h('li', null, h('span', null, c.name),
          h('span', { class: 'sp-ai-type' + (c.type === 'check' ? ' is-check' : '') }, c.type === 'check' ? '체크' : '글자')))),
        h('p', { class: 'sp-field-hint' }, '적용한 뒤에도 열 이름·순서·종류를 자유롭게 바꿀 수 있어요.'));
      m.setFooter(
        h('button', { type: 'button', class: 'sp-btn sp-btn-ghost', onclick: run }, '다시 제안받기'),
        h('span', { class: 'sp-spacer' }),
        h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: apply }, '적용'));
    }

    async function apply() {
      const replacing = hasContent(tableOf(data, sid));
      if (replacing && !await confirmBox('지금 표에 적힌 내용이 있어요. 새 틀로 바꾸면 기존 열과 내용이 모두 지워져요. 바꿀까요?', { title: '표 덮어쓰기', ok: '바꾸기', danger: true })) return;
      update(d => {
        const pt = tableOf(d, sid);
        const n = replacing ? 1 : Math.max(1, pt.rows.length);
        pt.columns = cols.map(c => ({ id: uid('c'), name: c.name, type: c.type }));
        pt.rows = makeRows(n);
      });
      m.close();
      toast('새 틀을 적용했어요. 이제 내용을 채워 보세요.');
    }

    run();
  }

  /* ---------- 공부 방식 ---------- */
  function methodsBody(sid) {
    const items = sd(data, sid).methods;
    const listEl = items.length
      ? h('ol', { class: 'sp-method-list' }, items.map((it, i) => {
        const host = h('div', { class: 'sp-method-host' });
        const start = () => inlineEdit(host, it.text, v => {
          if (!v) { render(); return; }
          update(d => { const x = sd(d, sid).methods.find(y => y.id === it.id); if (x) x.text = v; });
        }, { maxlength: 300, label: `${i + 1}번 공부 방식` });
        host.append(h('div', { class: 'sp-method-text', tabindex: '0', role: 'button', title: '눌러서 수정', onclick: start, onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) { e.preventDefault(); start(); } } }, it.text));
        return h('li', { class: 'sp-method-item' },
          h('span', { class: 'sp-method-num', 'aria-hidden': 'true' }, String(i + 1)),
          host,
          h('div', { class: 'sp-item-actions' },
            iconBtn('up', '위로', () => update(d => move(sd(d, sid).methods, i, -1)), { disabled: i === 0 }),
            iconBtn('down', '아래로', () => update(d => move(sd(d, sid).methods, i, 1)), { disabled: i === items.length - 1 }),
            iconBtn('trash', '삭제', () => {
              update(d => { sd(d, sid).methods = sd(d, sid).methods.filter(x => x.id !== it.id); });
              toast('공부 방식을 삭제했어요.', { label: '되돌리기', onClick: () => update(d => { if (d.subjectData[sid]) sd(d, sid).methods.splice(i, 0, it); }) });
            }, { danger: true })));
      }))
      : h('p', { class: 'sp-empty sp-empty-inline' }, '이 과목을 어떻게 공부하는지 한 줄씩 적어 보세요.');
    const input = autosize(h('textarea', { class: 'sp-input', rows: 1, maxlength: 300, 'data-sp-focus': 'method-add', placeholder: '예: 개념 강의를 들은 날 관련 문제 20개 풀기', 'aria-label': '새 공부 방식' }));
    const add = () => {
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      update(d => sd(d, sid).methods.push({ id: uid('m'), text }), { focus: '[data-sp-focus="method-add"]' });
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !isComposing(e)) { e.preventDefault(); add(); } });
    return h('div', null, listEl,
      h('form', { class: 'sp-add-row', onsubmit: e => { e.preventDefault(); add(); } }, input, h('button', { type: 'submit', class: 'sp-btn' }, icon('plus'), '추가')));
  }

  /* ---------- 공부 툴 ---------- */
  function hostOf(url) { try { return new URL(url).host.replace(/^www\./, ''); } catch { return url; } }
  function normalizeUrl(s) {
    const v = s.trim();
    if (!v) return '';
    const withProto = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v;
    let u;
    try { u = new URL(withProto); } catch { throw new Error('링크 주소를 확인해 주세요.'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('http 또는 https 링크만 넣을 수 있어요.');
    return u.href;
  }

  function toolsBody(sid) {
    const items = sd(data, sid).tools;
    if (!items.length) {
      return h('div', { class: 'sp-empty' },
        h('p', null, '등록한 공부 툴이 없어요.'),
        h('p', { class: 'sp-empty-sub' }, '듣는 강좌, 풀고 있는 책, 자주 가는 사이트를 모아 두세요.'),
        h('div', { class: 'sp-empty-actions' }, h('button', { type: 'button', class: 'sp-btn', onclick: () => openToolEditor(sid) }, icon('plus'), '공부 툴 추가')));
    }
    return h('ul', { class: 'sp-tool-list' }, items.map((it, i) => {
      const T = TOOL_TYPES[it.type] || TOOL_TYPES.etc;
      return h('li', { class: `sp-tool type-${it.type}` },
        h('span', { class: 'sp-tool-badge' }, icon(T.icon), h('span', null, T.label)),
        h('div', { class: 'sp-tool-main' },
          it.url ? h('a', { class: 'sp-tool-name is-link', href: it.url, target: '_blank', rel: 'noopener noreferrer' }, it.name, icon('external', 'sp-ext')) : h('span', { class: 'sp-tool-name' }, it.name),
          it.url && h('span', { class: 'sp-tool-url' }, hostOf(it.url)),
          it.memo && h('p', { class: 'sp-tool-memo' }, it.memo)),
        h('div', { class: 'sp-item-actions' },
          iconBtn('edit', `${it.name} 수정`, () => openToolEditor(sid, it)),
          iconBtn('up', '위로', () => update(d => move(sd(d, sid).tools, i, -1)), { disabled: i === 0 }),
          iconBtn('down', '아래로', () => update(d => move(sd(d, sid).tools, i, 1)), { disabled: i === items.length - 1 }),
          iconBtn('trash', `${it.name} 삭제`, () => {
            update(d => { sd(d, sid).tools = sd(d, sid).tools.filter(x => x.id !== it.id); });
            toast(`'${it.name}'을(를) 삭제했어요.`, { label: '되돌리기', onClick: () => update(d => { if (d.subjectData[sid]) sd(d, sid).tools.splice(i, 0, it); }) });
          }, { danger: true })));
    }));
  }

  function openToolEditor(sid, item = null) {
    const m = modal(item ? '공부 툴 수정' : '공부 툴 추가');
    let type = item ? item.type : 'lecture';
    const name = h('input', { type: 'text', class: 'sp-input', maxlength: 100, value: item ? item.name : '', placeholder: '예: 수학의 정석 기본편', 'aria-label': '이름' });
    const url = h('input', { type: 'url', class: 'sp-input', inputmode: 'url', value: item ? item.url : '', placeholder: 'https://', 'aria-label': '링크' });
    const memo = autosize(h('textarea', { class: 'sp-input', rows: 2, maxlength: 500, value: item ? item.memo : '', placeholder: '예: 2단원까지 완료, 주 3회', 'aria-label': '메모' }));
    const error = h('p', { class: 'sp-form-error', role: 'alert' });
    const saveTool = () => {
      const n = name.value.trim();
      if (!n) { error.textContent = '이름을 입력해 주세요.'; name.focus(); return; }
      let link;
      try { link = normalizeUrl(url.value); } catch (err) { error.textContent = err.message; url.focus(); return; }
      const fields = { type, name: n, url: link, memo: memo.value.trim() };
      update(d => {
        const tools = sd(d, sid).tools;
        if (item) { const x = tools.find(y => y.id === item.id); if (x) Object.assign(x, fields); }
        else tools.push({ id: uid('t'), ...fields });
      });
      m.close();
    };
    m.setBody(h('form', { class: 'sp-form', novalidate: true, onsubmit: e => { e.preventDefault(); saveTool(); } },
      field('종류', segmented(Object.entries(TOOL_TYPES).map(([k, v]) => [k, v.label]), type, v => { type = v; }, '종류')),
      field('이름', name),
      field('링크 (선택)', url, '링크가 있으면 이름을 눌렀을 때 새 탭으로 열려요.'),
      field('메모 (선택)', memo),
      error));
    m.setFooter(h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: saveTool }, item ? '저장' : '추가'));
  }

  /* ---------- 과목 관리 ---------- */
  function openManager() {
    const m = modal('과목 관리');

    function pickColor(anchor, s) {
      popover(anchor, h('div', { class: 'sp-palette' },
        h('div', { class: 'sp-palette-grid' }, PALETTE.map(c => h('button', {
          type: 'button', class: 'sp-swatch' + (c.toLowerCase() === s.color.toLowerCase() ? ' is-on' : ''),
          style: { background: c }, 'aria-label': c, onclick: () => setColor(s.id, c),
        }))),
        h('label', { class: 'sp-palette-custom' },
          h('input', { type: 'color', class: 'sp-color-custom', value: s.color, 'aria-label': '직접 고르기', onchange: e => setColor(s.id, e.target.value) }),
          '직접 고르기')));
    }
    function setColor(id, color) {
      closePopover();
      update(d => { const s = d.subjects.find(x => x.id === id); if (s) s.color = color; });
      draw();
    }
    function rename(s, input) {
      const n = input.value.trim().slice(0, 20);
      if (!n) { input.value = s.name; return; }
      if (n !== s.name) update(d => { const x = d.subjects.find(y => y.id === s.id); if (x) x.name = n; });
    }
    async function remove(s) {
      if (!await confirmBox(`'${s.name}' 과목을 삭제할까요? 이 과목의 장기 계획표·공부 방식·공부 툴이 함께 삭제돼요. 기존 시간표·달력 일정은 그대로예요.`, { title: '과목 삭제', ok: '삭제', danger: true })) return;
      update(d => { d.subjects = d.subjects.filter(x => x.id !== s.id); delete d.subjectData[s.id]; });
      for (const k of Object.keys(ui.collapsed)) if (k.startsWith(s.id + ':')) delete ui.collapsed[k];
      saveUi();
      draw();
      toast(`'${s.name}' 과목을 삭제했어요.`);
    }
    function add(input) {
      const n = input.value.trim().slice(0, 20);
      if (!n) { input.focus(); return; }
      const used = new Set(data.subjects.map(s => s.color.toLowerCase()));
      const color = PALETTE.find(c => !used.has(c.toLowerCase())) || PALETTE[data.subjects.length % PALETTE.length];
      const id = uid('s');
      ui.subjectId = id;
      saveUi();
      update(d => { d.subjects.push({ id, name: n, color }); d.subjectData[id] = emptySubjectData(); });
      draw();
      const next = m.body.querySelector('.sp-manage-add input');
      if (next) next.focus();
    }
    function draw() {
      const subs = data.subjects;
      const newInput = h('input', { type: 'text', class: 'sp-input', maxlength: 20, placeholder: '새 과목 이름 (예: 사회)', 'aria-label': '새 과목 이름' });
      m.setBody(
        h('p', { class: 'sp-modal-text sp-muted' }, '탭 순서, 이름, 색을 바꿀 수 있어요. 바꾼 내용은 바로 저장돼요.'),
        subs.length ? h('ul', { class: 'sp-manage-list' }, subs.map((s, i) => h('li', { class: 'sp-manage-row' },
          h('button', { type: 'button', class: 'sp-swatch sp-swatch-lg', style: { background: s.color }, 'aria-label': `${s.name} 색 바꾸기`, title: '색 바꾸기', onclick: e => pickColor(e.currentTarget, s) }),
          h('input', { type: 'text', class: 'sp-input', value: s.name, maxlength: 20, 'aria-label': `${s.name} 이름`, onchange: e => rename(s, e.target), onkeydown: e => { if (e.key === 'Enter' && !isComposing(e)) e.target.blur(); } }),
          iconBtn('up', '앞으로', () => { update(d => move(d.subjects, i, -1)); draw(); }, { disabled: i === 0 }),
          iconBtn('down', '뒤로', () => { update(d => move(d.subjects, i, 1)); draw(); }, { disabled: i === subs.length - 1 }),
          iconBtn('trash', `${s.name} 삭제`, () => remove(s), { danger: true })))) : h('p', { class: 'sp-empty' }, '과목이 없어요.'),
        h('form', { class: 'sp-manage-add', onsubmit: e => { e.preventDefault(); add(newInput); } },
          newInput, h('button', { type: 'submit', class: 'sp-btn sp-btn-primary' }, icon('plus'), '추가')));
      m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '닫기'));
    }
    draw();
  }

  /* ---------- 화면 ---------- */
  function currentId() {
    if (!data.subjects.some(s => s.id === ui.subjectId)) ui.subjectId = data.subjects.length ? data.subjects[0].id : null;
    return ui.subjectId;
  }
  function select(id) { ui.subjectId = id; saveUi(); render(); }

  function section(sid, key, title, { meta, actions = [], body }) {
    const ck = `${sid}:${key}`;
    const collapsed = !!ui.collapsed[ck];
    const bodyId = `sp-sec-${key}`;
    return h('section', { class: 'sp-section' + (collapsed ? ' is-collapsed' : '') },
      h('div', { class: 'sp-section-head' },
        h('button', {
          type: 'button', class: 'sp-section-toggle', 'aria-expanded': String(!collapsed), 'aria-controls': bodyId,
          onclick: () => { ui.collapsed[ck] = !collapsed; saveUi(); render(); },
        }, icon('chevron-down', 'sp-chev'), h('h3', { class: 'sp-section-title' }, title), meta && h('span', { class: 'sp-section-meta' }, meta)),
        !collapsed && actions.length > 0 && h('div', { class: 'sp-section-actions' }, actions)),
      !collapsed && h('div', { class: 'sp-section-body', id: bodyId }, body()));
  }

  function todaySection(sid, subj) {
    const items = todayItems(subj);
    return section(sid, 'today', '오늘 계획', {
      meta: `${items.length}개`,
      actions: [h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: openTimetable }, icon('clock'), '하루 시간표 열기')],
      body: () => items.length
        ? h('ul', { class: 'sp-today-list' }, items.map(it => h('li', { class: 'sp-today-item' + (it.done ? ' is-done' : '') },
          h('span', { class: 'sp-today-time' }, it.time ? h('span', null, it.time) : h('span', { class: 'sp-today-allday' }, '하루'), it.end && h('span', { class: 'sp-today-end' }, '~ ' + it.end)),
          h('span', { class: 'sp-today-text' }, it.text),
          h('span', { class: 'sp-today-from' }, it.from))))
        : h('div', { class: 'sp-empty' },
          h('p', null, `오늘 '${subj.name}' 일정이 없어요.`),
          h('p', { class: 'sp-empty-sub' }, `하루 시간표나 달력에 '${subj.name}'이 들어간 일정을 적으면 여기에 모여요.`)),
    });
  }

  function render(opts = {}) {
    if (!root) return;
    closePopover();
    const sid = currentId();
    const subs = data.subjects;
    const tabs = h('div', { class: 'sp-tabs-bar' },
      h('div', {
        class: 'sp-tabs', role: 'tablist', 'aria-label': '과목',
        onkeydown: e => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const i = subs.findIndex(s => s.id === sid);
          const next = subs[(i + (e.key === 'ArrowRight' ? 1 : -1) + subs.length) % subs.length];
          if (next) { select(next.id); const t = document.getElementById('sp-tab-' + next.id); if (t) t.focus(); }
        },
      }, subs.map(s => {
        const active = s.id === sid;
        return h('button', {
          type: 'button', role: 'tab', id: 'sp-tab-' + s.id, class: 'sp-tab' + (active ? ' is-active' : ''),
          'aria-selected': String(active), 'aria-controls': 'sp-panel', tabindex: active ? '0' : '-1',
          style: { background: s.color, '--ink': ink(s.color), '--ink-soft': ink(s.color, 0.7) },
          onclick: () => select(s.id),
        }, s.name);
      })),
      h('button', { type: 'button', class: 'sp-btn sp-btn-ghost sp-manage-btn', onclick: openManager, 'aria-label': '과목 관리' }, icon('settings'), h('span', { class: 'sp-hide-sm' }, '과목 관리')));

    const head = h('div', { class: 'sp-head' },
      h('h2', { class: 'sp-title' }, '과목별 계획'),
      h('p', { class: 'sp-sub' }, '과목마다 장기 계획과 공부 방법, 쓰는 교재·강좌를 정리해요.'));

    let panel;
    if (!sid) {
      panel = h('div', { class: 'sp-empty sp-empty-big' }, h('p', null, '과목이 없어요.'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: openManager }, icon('plus'), '과목 추가하기'));
    } else {
      const subj = subs.find(s => s.id === sid);
      const t = tableOf(data, sid);
      const p = progress(t);
      panel = h('div', { class: 'sp-panel', id: 'sp-panel', role: 'tabpanel', 'aria-labelledby': 'sp-tab-' + sid, style: { '--subj-mid': tone(subj.color, 50) } },
        todaySection(sid, subj),
        section(sid, 'plan', '장기 계획표', {
          meta: p ? `진도 ${p.pct}%` : (t.rows.length ? `${t.rows.length}행` : ''),
          actions: [h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ai', onclick: () => suggest(sid) }, icon('sparkle'), 'AI로 틀 만들기')],
          body: () => planBody(sid),
        }),
        section(sid, 'method', '공부 방식', { meta: sd(data, sid).methods.length ? `${sd(data, sid).methods.length}개` : '', body: () => methodsBody(sid) }),
        section(sid, 'tool', '공부 툴', {
          meta: sd(data, sid).tools.length ? `${sd(data, sid).tools.length}개` : '',
          actions: [h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: () => openToolEditor(sid) }, icon('plus'), '추가')],
          body: () => toolsBody(sid),
        }));
    }
    root.replaceChildren(head, tabs, panel);
    if (opts.focus) { const f = root.querySelector(opts.focus); if (f) f.focus(); }
  }

  // 기존 시간표·달력을 고치면 '오늘 계획'도 바로 다시 그림
  function watch(fnName) {
    const orig = window[fnName];
    if (typeof orig !== 'function') return;
    window[fnName] = function (...args) {
      const result = orig.apply(this, args);
      try { render(); } catch (err) { console.error('[subject-plans]', err); }
      return result;
    };
  }

  function init() {
    root = document.getElementById('sp-root');
    if (!root) return;
    load();
    render();
    watch('ttSaveAll');
    watch('saveAllSchedules');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { render, reload: () => { load(); render(); } };
})();
