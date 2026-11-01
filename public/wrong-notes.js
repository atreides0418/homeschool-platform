'use strict';
/* ============================================================
   오답노트
   - 글 기록(과목·날짜·출처·문제·내 답·정답·틀린 이유·메모)은 hs_wrong_notes 에 저장
     → hs_ 로 시작하므로 기존 기기 동기화·백업에 자동 포함
   - 사진(선택, 최대 3장)은 줄여서 이 기기의 IndexedDB 에만 저장 (동기화되지 않음)
   - 다시 풀기: 맞히면 1·3·7·14·30일 뒤로 복습 간격이 늘고, 다섯 번 연속 맞히면 '완료'
   - 화면 부품(버튼·창·아이콘)은 subject-plans.js 의 SubjectPlans.ui 를 같이 씀
   ============================================================ */
const WrongNotes = (() => {
  const KEY = 'hs_wrong_notes';
  const UI_KEY = 'wn_ui';
  const DB_NAME = 'hs-wrong-note-photos';
  const STORE = 'photos';
  const MAX_PHOTOS = 3;
  const MAX_EDGE = 1600;
  const INTERVALS = [1, 3, 7, 14, 30];
  const REASONS = ['개념 부족', '계산 실수', '문제를 잘못 읽음', '시간 부족', '찍어서 맞힘·틀림', '기타'];
  const FALLBACK_SUBJECTS = [
    { id: 's_kor', name: '국어', color: '#FBE3E3' },
    { id: 's_eng', name: '영어', color: '#E1ECFB' },
    { id: 's_math', name: '수학', color: '#E2F3E6' },
    { id: 's_sci', name: '과학', color: '#FFF1CC' },
  ];

  let U = null; // SubjectPlans.ui
  let h = null;
  let data = null;
  let ui = null;
  let root = null;
  let urls = []; // 화면에 쓴 사진 주소 (다시 그릴 때 정리)

  /* ---------- 날짜 ('YYYY-MM-DD') ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dkey = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const today = () => dkey(new Date());
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return dkey(new Date(y, m - 1, d + n)); };
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const dayDiff = (a, b) => { const p = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 86400000); };
  const shortDate = s => { const [, m, d] = s.split('-').map(Number); return `${m}월 ${d}일`; };

  /* ---------- 데이터 ---------- */
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function normalizeNote(n) {
    if (!isObj(n) || typeof n.id !== 'string') return null;
    const r = isObj(n.review) ? n.review : {};
    return {
      id: n.id,
      subjectId: str(n.subjectId, 64),
      subjectName: str(n.subjectName, 20),
      date: isDate(n.date) ? n.date : today(),
      source: str(n.source, 100),
      problem: str(n.problem, 3000),
      myAnswer: str(n.myAnswer, 500),
      answer: str(n.answer, 3000),
      reasons: Array.isArray(n.reasons) ? n.reasons.filter(x => REASONS.includes(x)) : [],
      memo: str(n.memo, 3000),
      photos: Array.isArray(n.photos) ? n.photos.filter(x => typeof x === 'string').slice(0, MAX_PHOTOS) : [],
      createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
      review: {
        stage: Number.isInteger(r.stage) ? Math.max(0, Math.min(INTERVALS.length, r.stage)) : 0,
        next: isDate(r.next) ? r.next : addDays(today(), 1),
        history: Array.isArray(r.history) ? r.history.filter(x => isObj(x) && isDate(x.date)).map(x => ({ date: x.date, ok: !!x.ok })).slice(-50) : [],
      },
      done: !!n.done,
    };
  }

  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
    data = { version: 1, notes: isObj(raw) && Array.isArray(raw.notes) ? raw.notes.map(normalizeNote).filter(Boolean) : [] };
    try { ui = JSON.parse(localStorage.getItem(UI_KEY)); } catch { ui = null; }
    if (!isObj(ui)) ui = {};
    if (!['due', 'all', 'done'].includes(ui.tab)) ui.tab = 'due';
    if (typeof ui.subject !== 'string') ui.subject = 'all';
    ui.q = '';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { U.toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.'); }
  }
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, subject: ui.subject })); } catch { /* 무시 */ } }
  function update(fn) { fn(data); save(); render(); }

  function subjects() {
    const s = typeof SubjectPlans !== 'undefined' && SubjectPlans.subjects ? SubjectPlans.subjects() : [];
    return s.length ? s : FALLBACK_SUBJECTS;
  }
  function subjectOf(note) {
    const s = subjects().find(x => x.id === note.subjectId);
    return s || { id: note.subjectId, name: note.subjectName || '과목 없음', color: '#ECEAE4' };
  }
  const isDue = n => !n.done && n.review.next <= today();

  /* ---------- 사진: IndexedDB (이 기기에만) ---------- */
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) { reject(new Error('이 브라우저는 사진 저장을 지원하지 않아요.')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('사진 저장소를 열지 못했어요.'));
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('사진 저장이 취소됐어요.'));
    });
  }
  const putPhoto = (id, blob) => tx('readwrite', s => s.put(blob, id));
  const getPhoto = id => tx('readonly', s => s.get(id)).catch(() => null);
  const delPhotos = ids => Promise.all(ids.map(id => tx('readwrite', s => s.delete(id)).catch(() => null)));

  // 긴 변이 1600px 이하가 되도록 줄이고 JPEG로 저장 (원본보다 크면 원본 유지)
  async function shrink(file) {
    if (!file.type.startsWith('image/')) throw new Error('사진 파일만 넣을 수 있어요.');
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {
      bmp = await new Promise((resolve, reject) => {
        const img = new Image();
        const u = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(u); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('사진을 읽지 못했어요.')); };
        img.src = u;
      });
    }
    const w = bmp.width, hgt = bmp.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, hgt));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(hgt * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) throw new Error('사진을 줄이지 못했어요.');
    return blob.size < file.size || scale < 1 ? blob : file;
  }

  // 사진 칸: 이 기기에 없으면 안내 문구를 보여 줌
  function photoEl(id, cls, onClick) {
    const box = h('div', { class: 'wn-photo ' + cls });
    getPhoto(id).then(blob => {
      if (!box.isConnected && !box.parentNode) return;
      if (blob) {
        const u = URL.createObjectURL(blob);
        urls.push(u);
        const img = h('img', { src: u, alt: '오답 사진', loading: 'lazy' });
        if (onClick) { img.style.cursor = 'zoom-in'; img.addEventListener('click', () => onClick(u)); }
        box.replaceChildren(img);
      } else {
        box.classList.add('is-missing');
        box.replaceChildren(h('span', null, '사진은 찍은 기기에서만 보여요'));
      }
    });
    return box;
  }
  function zoom(u) {
    const m = U.modal('사진 크게 보기');
    m.setBody(h('img', { src: u, alt: '오답 사진', class: 'wn-zoom' }));
  }

  /* ---------- 화면 ---------- */
  function filtered() {
    const q = ui.q.trim().toLowerCase();
    return data.notes
      .filter(n => ui.tab === 'due' ? isDue(n) : ui.tab === 'done' ? n.done : true)
      .filter(n => ui.subject === 'all' || n.subjectId === ui.subject)
      .filter(n => !q || [n.source, n.problem, n.answer, n.memo, n.myAnswer, subjectOf(n).name].join(' ').toLowerCase().includes(q))
      .sort((a, b) => ui.tab === 'due' ? a.review.next.localeCompare(b.review.next) || b.createdAt - a.createdAt : b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function reviewLabel(n) {
    if (n.done) return { text: '완료', cls: 'is-done' };
    const d = dayDiff(today(), n.review.next);
    if (d <= 0) return { text: d < 0 ? `복습 ${-d}일 밀림` : '오늘 복습', cls: 'is-due' };
    return { text: `${d}일 뒤 복습`, cls: '' };
  }

  function chip(subj) {
    return h('span', { class: 'wn-chip', style: { background: subj.color, color: U.ink(subj.color) } }, subj.name);
  }

  function card(n) {
    const subj = subjectOf(n);
    const rl = reviewLabel(n);
    return h('li', null, h('button', { type: 'button', class: 'wn-card', onclick: () => openDetail(n.id), style: { '--bar': U.tone(subj.color, 50) } },
      h('div', { class: 'wn-card-top' },
        chip(subj),
        h('span', { class: 'wn-card-date' }, shortDate(n.date)),
        n.source && h('span', { class: 'wn-card-source' }, n.source),
        h('span', { class: 'wn-review ' + rl.cls }, rl.text)),
      h('div', { class: 'wn-card-body' },
        h('p', { class: 'wn-card-problem' + (n.problem ? '' : ' is-empty') }, n.problem || '사진으로 기록한 문제'),
        n.photos.length > 0 && photoEl(n.photos[0], 'wn-thumb')),
      n.reasons.length > 0 && h('div', { class: 'wn-tags' }, n.reasons.map(r => h('span', { class: 'wn-tag' }, r)))));
  }

  function render() {
    if (!root || !data) return;
    urls.forEach(u => URL.revokeObjectURL(u));
    urls = [];
    const subs = subjects();
    const dueCount = data.notes.filter(isDue).length;
    const doneCount = data.notes.filter(n => n.done).length;
    const reasonCount = {};
    data.notes.forEach(n => n.reasons.forEach(r => { reasonCount[r] = (reasonCount[r] || 0) + 1; }));
    const topReason = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0];

    const head = h('div', { class: 'wn-head' },
      h('div', null,
        h('h1', { class: 'wn-title' }, '오답노트'),
        h('p', { class: 'wn-sub' }, '틀린 문제를 모아 두고, 날짜에 맞춰 다시 풀어요.')),
      h('div', { class: 'wn-head-actions' },
        h('button', { type: 'button', class: 'sp-btn', disabled: dueCount === 0, onclick: startReview }, U.icon('refresh'), `오늘 복습 ${dueCount}개`),
        h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: () => openEditor() }, U.icon('plus'), '오답 추가')));

    const stats = h('div', { class: 'wn-stats' },
      stat('복습할 오답', `${dueCount}개`),
      stat('전체 오답', `${data.notes.length}개`),
      stat('완료', `${doneCount}개`),
      stat('가장 많은 실수', topReason ? topReason[0] : '아직 없어요', !topReason));

    const tabs = h('div', { class: 'wn-tabs', role: 'tablist', 'aria-label': '보기' },
      [['due', `복습할 것 ${dueCount}`], ['all', `전체 ${data.notes.length}`], ['done', `완료 ${doneCount}`]].map(([v, t]) => h('button', {
        type: 'button', role: 'tab', class: 'wn-tab' + (ui.tab === v ? ' is-on' : ''), 'aria-selected': String(ui.tab === v),
        onclick: () => { ui.tab = v; saveUi(); render(); },
      }, t)));

    const search = h('input', {
      type: 'search', class: 'sp-input wn-search', value: ui.q, placeholder: '교재, 문제, 메모로 찾기', 'aria-label': '오답 찾기',
      oninput: e => { ui.q = e.target.value; renderList(); },
    });
    const filters = h('div', { class: 'wn-filters' },
      h('div', { class: 'wn-subject-filter' },
        [{ id: 'all', name: '전체 과목' }, ...subs].map(s => h('button', {
          type: 'button', class: 'wn-filter' + (ui.subject === s.id ? ' is-on' : ''), 'aria-pressed': String(ui.subject === s.id),
          style: s.color && ui.subject === s.id ? { background: s.color, color: U.ink(s.color), borderColor: U.ink(s.color, 0.5) } : null,
          onclick: () => { ui.subject = s.id; saveUi(); render(); },
        }, s.name))),
      h('label', { class: 'wn-search-wrap' }, U.icon('search'), search));

    const listHost = h('div', { class: 'wn-list-host' });
    function renderList() {
      const items = filtered();
      listHost.replaceChildren(items.length
        ? h('ul', { class: 'wn-list' }, items.map(card))
        : h('div', { class: 'sp-empty wn-empty' },
          h('p', null, data.notes.length === 0 ? '아직 기록한 오답이 없어요.'
            : ui.tab === 'due' ? '오늘 복습할 오답이 없어요.' : '조건에 맞는 오답이 없어요.'),
          h('p', { class: 'sp-empty-sub' }, data.notes.length === 0 ? '틀린 문제를 글이나 사진으로 남겨 두면 날짜에 맞춰 다시 풀 수 있어요.'
            : ui.tab === 'due' ? '다음 복습 날이 되면 여기에 다시 모여요.' : '다른 과목이나 검색어로 찾아보세요.'),
          data.notes.length === 0 && h('div', { class: 'sp-empty-actions' },
            h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: () => openEditor() }, U.icon('plus'), '첫 오답 추가'))));
    }
    renderList();

    root.replaceChildren(head, stats, h('div', { class: 'wn-panel' }, tabs, filters, listHost));
  }

  function stat(label, value, muted) {
    return h('div', { class: 'wn-stat' }, h('span', { class: 'wn-stat-label' }, label), h('span', { class: 'wn-stat-val' + (muted ? ' is-muted' : '') }, value));
  }

  /* ---------- 추가·수정 ---------- */
  function openEditor(noteId = null) {
    const note = noteId ? data.notes.find(n => n.id === noteId) : null;
    const subs = subjects();
    const m = U.modal(note ? '오답 수정' : '오답 추가');
    const st = {
      subjectId: note ? note.subjectId : (ui.subject !== 'all' && subs.some(s => s.id === ui.subject) ? ui.subject : (subs[0] ? subs[0].id : '')),
      reasons: new Set(note ? note.reasons : []),
      keep: note ? [...note.photos] : [],   // 남겨 둘 기존 사진 id
      added: [],                             // 새로 고른 사진 { blob, url }
    };
    const removedIds = [];
    const error = h('p', { class: 'sp-form-error', role: 'alert' });

    const subject = h('select', { class: 'sp-input', 'aria-label': '과목', onchange: e => { st.subjectId = e.target.value; } },
      subs.map(s => h('option', { value: s.id }, s.name)),
      note && !subs.some(s => s.id === note.subjectId) && h('option', { value: note.subjectId }, note.subjectName || '과목 없음'));
    subject.value = st.subjectId;
    const date = h('input', { type: 'date', class: 'sp-input', value: note ? note.date : today(), 'aria-label': '틀린 날짜' });
    const source = h('input', { type: 'text', class: 'sp-input', maxlength: 100, value: note ? note.source : '', placeholder: '예: 쎈 B단계 32쪽 15번', 'aria-label': '출처' });
    const problem = U.autosize(h('textarea', { class: 'sp-input', rows: 3, maxlength: 3000, value: note ? note.problem : '', placeholder: '문제를 적거나 아래에 사진을 넣어요', 'aria-label': '문제', 'data-autofocus': !note ? true : null }));
    const myAnswer = h('input', { type: 'text', class: 'sp-input', maxlength: 500, value: note ? note.myAnswer : '', placeholder: '예: ③', 'aria-label': '내가 쓴 답' });
    const answer = U.autosize(h('textarea', { class: 'sp-input', rows: 2, maxlength: 3000, value: note ? note.answer : '', placeholder: '정답과 풀이 핵심', 'aria-label': '정답' }));
    const memo = U.autosize(h('textarea', { class: 'sp-input', rows: 2, maxlength: 3000, value: note ? note.memo : '', placeholder: '다음에 같은 실수를 안 하려면?', 'aria-label': '메모' }));

    const photoGrid = h('div', { class: 'wn-photo-grid' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => addFiles(e.target.files) });
    function drawPhotos() {
      const count = st.keep.length + st.added.length;
      photoGrid.replaceChildren(...[
        ...st.keep.map(id => h('div', { class: 'wn-photo-item' }, photoEl(id, 'wn-photo-edit'),
          U.iconBtn('x', '사진 빼기', () => { st.keep = st.keep.filter(x => x !== id); removedIds.push(id); drawPhotos(); }, { cls: 'wn-photo-remove' }))),
        ...st.added.map((a, i) => h('div', { class: 'wn-photo-item' }, h('div', { class: 'wn-photo wn-photo-edit' }, h('img', { src: a.url, alt: '새 사진' })),
          U.iconBtn('x', '사진 빼기', () => { URL.revokeObjectURL(a.url); st.added.splice(i, 1); drawPhotos(); }, { cls: 'wn-photo-remove' }))),
        count < MAX_PHOTOS && h('button', { type: 'button', class: 'wn-photo-add', onclick: () => fileInput.click() }, U.icon('camera'), h('span', null, '사진 넣기'), h('small', null, `${count}/${MAX_PHOTOS}`)),
      ].filter(Boolean));
    }
    async function addFiles(files) {
      const list = [...files].slice(0, MAX_PHOTOS - st.keep.length - st.added.length);
      fileInput.value = '';
      for (const f of list) {
        try {
          const blob = await shrink(f);
          st.added.push({ blob, url: URL.createObjectURL(blob) });
        } catch (err) { error.textContent = err.message; }
      }
      drawPhotos();
    }
    drawPhotos();

    const reasons = h('div', { class: 'wn-reason-picks' }, REASONS.map(r => {
      const b = h('button', {
        type: 'button', class: 'wn-reason' + (st.reasons.has(r) ? ' is-on' : ''), 'aria-pressed': String(st.reasons.has(r)),
        onclick: () => { if (st.reasons.has(r)) st.reasons.delete(r); else st.reasons.add(r); b.classList.toggle('is-on'); b.setAttribute('aria-pressed', String(st.reasons.has(r))); },
      }, r);
      return b;
    }));

    let saving = false;
    async function saveNote() {
      if (saving) return;
      error.textContent = '';
      if (!problem.value.trim() && st.keep.length + st.added.length === 0) { error.textContent = '문제를 적거나 사진을 넣어 주세요.'; problem.focus(); return; }
      if (!isDate(date.value)) { error.textContent = '날짜를 확인해 주세요.'; return; }
      saving = true;
      const newIds = [];
      try {
        for (const a of st.added) { const id = uid('ph'); await putPhoto(id, a.blob); newIds.push(id); }
      } catch (err) {
        saving = false;
        error.textContent = '사진을 저장하지 못했어요. ' + (err && err.message ? err.message : '');
        return;
      }
      const subj = subs.find(s => s.id === st.subjectId);
      const fields = {
        subjectId: st.subjectId, subjectName: subj ? subj.name : (note ? note.subjectName : ''),
        date: date.value, source: source.value.trim(), problem: problem.value.trim(), myAnswer: myAnswer.value.trim(),
        answer: answer.value.trim(), reasons: REASONS.filter(r => st.reasons.has(r)), memo: memo.value.trim(),
        photos: [...st.keep, ...newIds],
      };
      update(d => {
        if (note) { const x = d.notes.find(y => y.id === note.id); if (x) Object.assign(x, fields); }
        else d.notes.push(normalizeNote({ id: uid('wn'), ...fields, createdAt: Date.now(), review: { stage: 0, next: addDays(today(), 1), history: [] } }));
      });
      if (removedIds.length) delPhotos(removedIds);
      st.added.forEach(a => URL.revokeObjectURL(a.url));
      st.added = [];
      m.close();
      U.toast(note ? '오답을 고쳤어요.' : '오답을 추가했어요. 내일 복습 목록에 나와요.');
    }

    m.setBody(h('form', { class: 'sp-form', novalidate: true, onsubmit: e => { e.preventDefault(); saveNote(); } },
      h('div', { class: 'wn-row' }, U.field('과목', subject), U.field('틀린 날짜', date)),
      U.field('출처 (선택)', source),
      U.field('문제', problem),
      U.field('사진 (선택)', h('div', null, photoGrid, fileInput), '사진은 줄여서 이 기기에만 저장돼요. 다른 기기에서는 글만 보여요.'),
      h('div', { class: 'wn-row' }, U.field('내가 쓴 답 (선택)', myAnswer)),
      U.field('정답·풀이 (선택)', answer),
      U.field('틀린 이유 (여러 개 고를 수 있어요)', reasons),
      U.field('메모 (선택)', memo),
      error));
    m.setFooter(h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: saveNote }, note ? '저장' : '추가'));
  }

  /* ---------- 자세히 보기 ---------- */
  function openDetail(id) {
    const n = data.notes.find(x => x.id === id);
    if (!n) return;
    const subj = subjectOf(n);
    const rl = reviewLabel(n);
    const m = U.modal('오답 자세히 보기');
    const okCount = n.review.history.filter(x => x.ok).length;
    m.setBody(
      h('div', { class: 'wn-detail-top' }, chip(subj), h('span', { class: 'wn-card-date' }, shortDate(n.date)), n.source && h('span', { class: 'wn-card-source' }, n.source), h('span', { class: 'wn-review ' + rl.cls }, rl.text)),
      block('문제', n.problem),
      n.photos.length > 0 && h('div', { class: 'wn-detail-photos' }, n.photos.map(pid => photoEl(pid, 'wn-photo-full', zoom))),
      block('내가 쓴 답', n.myAnswer),
      block('정답·풀이', n.answer),
      n.reasons.length > 0 && h('div', { class: 'wn-block' }, h('div', { class: 'wn-block-label' }, '틀린 이유'), h('div', { class: 'wn-tags' }, n.reasons.map(r => h('span', { class: 'wn-tag' }, r)))),
      block('메모', n.memo),
      h('p', { class: 'wn-history' }, n.review.history.length ? `다시 푼 기록: ${n.review.history.length}번 중 ${okCount}번 맞힘` : '아직 다시 풀어 보지 않았어요.'));
    m.setFooter(
      h('button', { type: 'button', class: 'sp-btn sp-btn-ghost wn-danger-text', onclick: async () => {
        if (!await U.confirmBox('이 오답을 삭제할까요? 이 기기에 저장된 사진도 함께 지워져요.', { title: '오답 삭제', ok: '삭제', danger: true })) return;
        update(d => { d.notes = d.notes.filter(x => x.id !== n.id); });
        delPhotos(n.photos);
        m.close();
        U.toast('오답을 삭제했어요.');
      } }, U.icon('trash'), '삭제'),
      n.done && h('button', { type: 'button', class: 'sp-btn sp-btn-ghost', onclick: () => {
        update(d => { const x = d.notes.find(y => y.id === n.id); if (x) { x.done = false; x.review.stage = 0; x.review.next = today(); } });
        m.close();
        U.toast('다시 복습 목록에 넣었어요.');
      } }, '다시 복습하기'),
      h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => { m.close(); openEditor(n.id); } }, U.icon('edit'), '수정'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: () => m.close() }, '닫기'));
  }
  function block(label, text) {
    if (!text) return null;
    return h('div', { class: 'wn-block' }, h('div', { class: 'wn-block-label' }, label), h('p', { class: 'wn-block-text' }, text));
  }

  /* ---------- 오늘 복습: 문제 → 정답 보기 → 맞힘/또 틀림 ---------- */
  function grade(id, ok) {
    update(d => {
      const n = d.notes.find(x => x.id === id);
      if (!n) return;
      n.review.history.push({ date: today(), ok });
      if (ok) {
        n.review.stage += 1;
        if (n.review.stage >= INTERVALS.length) { n.done = true; n.review.next = today(); }
        else n.review.next = addDays(today(), INTERVALS[n.review.stage]);
      } else {
        n.review.stage = 0;
        n.review.next = addDays(today(), 1);
      }
    });
  }

  function startReview() {
    const queue = data.notes.filter(isDue).sort((a, b) => a.review.next.localeCompare(b.review.next)).map(n => n.id);
    if (!queue.length) return;
    let i = 0, right = 0;
    const m = U.modal('오늘 복습');
    function step() {
      if (i >= queue.length) {
        m.setBody(h('div', { class: 'wn-review-end' }, h('p', { class: 'wn-review-big' }, `${queue.length}문제 중 ${right}문제 맞혔어요`),
          h('p', { class: 'sp-empty-sub' }, '틀린 문제는 내일 다시, 맞힌 문제는 간격을 늘려서 다시 나와요.')));
        m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn sp-btn-primary', 'data-autofocus': true, onclick: () => m.close() }, '끝내기'));
        return;
      }
      const n = data.notes.find(x => x.id === queue[i]);
      if (!n) { i++; step(); return; }
      const subj = subjectOf(n);
      const answerBox = h('div', { class: 'wn-reveal', hidden: true },
        block('정답·풀이', n.answer || '정답을 적어 두지 않았어요.'),
        block('내가 전에 쓴 답', n.myAnswer),
        n.reasons.length > 0 && h('div', { class: 'wn-block' }, h('div', { class: 'wn-block-label' }, '전에 틀린 이유'), h('div', { class: 'wn-tags' }, n.reasons.map(r => h('span', { class: 'wn-tag' }, r)))),
        block('메모', n.memo));
      m.setBody(
        h('div', { class: 'wn-review-progress' }, h('span', null, `${i + 1} / ${queue.length}`), h('div', { class: 'sp-progress-track' }, h('div', { class: 'sp-progress-fill', style: { width: `${(i / queue.length) * 100}%` } }))),
        h('div', { class: 'wn-detail-top' }, chip(subj), n.source && h('span', { class: 'wn-card-source' }, n.source)),
        block('문제', n.problem),
        n.photos.length > 0 && h('div', { class: 'wn-detail-photos' }, n.photos.map(pid => photoEl(pid, 'wn-photo-full', zoom))),
        h('p', { class: 'sp-field-hint' }, '먼저 직접 풀어 본 뒤 정답을 확인해요.'),
        answerBox);
      const reveal = h('button', { type: 'button', class: 'sp-btn sp-btn-primary', 'data-autofocus': true, onclick: () => {
        answerBox.hidden = false;
        m.setFooter(
          h('button', { type: 'button', class: 'sp-btn sp-btn-ghost', onclick: () => { i++; step(); } }, '건너뛰기'),
          h('span', { class: 'sp-spacer' }),
          h('button', { type: 'button', class: 'sp-btn wn-wrong', onclick: () => { grade(n.id, false); i++; step(); } }, U.icon('x'), '또 틀렸어요'),
          h('button', { type: 'button', class: 'sp-btn wn-right', onclick: () => { grade(n.id, true); right++; i++; step(); } }, U.icon('check'), '맞혔어요'));
      } }, '정답 보기');
      m.setFooter(h('button', { type: 'button', class: 'sp-btn sp-btn-ghost', onclick: () => { i++; step(); } }, '건너뛰기'), h('span', { class: 'sp-spacer' }), reveal);
    }
    step();
  }

  /* ---------- 시작 ---------- */
  function init() {
    root = document.getElementById('wn-root');
    if (!root || typeof SubjectPlans === 'undefined' || !SubjectPlans.ui) return;
    U = SubjectPlans.ui;
    h = U.h;
    load();
    render();
    // 오답노트 메뉴로 들어올 때마다 최신 과목·날짜로 다시 그림
    const nav = window.navigate;
    if (typeof nav === 'function') {
      window.navigate = function (page, ...rest) {
        const r = nav.call(this, page, ...rest);
        if (page === 'wrongnote') render();
        return r;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { render };
})();
