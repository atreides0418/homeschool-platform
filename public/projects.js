'use strict';
/* ============================================================
   프로젝트
   - 프로젝트(폴더): 표지·이모지·상태·마감일(D-day)·할 일·고정·휴지통
   - 문서 편집기: 제목/본문 서식, 목록·체크리스트, 표, 그림, 링크, 인용·코드·강조 상자,
     찾기·바꾸기, 개요, 글자 수 목표, 버전 기록, 집중 모드, / 명령, 마크다운 단축 입력
   - 내보내기: .docx (Word·구글 문서에서 열림), 인쇄·PDF, 마크다운
   - AI 도우미: 설정에 저장된 OpenAI 키로 문서·선택 영역을 다듬기·요약·이어 쓰기 등
   저장
   - 프로젝트·문서 글은 hs_projects (기기 동기화·백업에 자동 포함)
   - 그림과 버전 기록은 이 기기의 IndexedDB 에만 (용량이 커서 동기화하지 않음)
   ============================================================ */
const Projects = (() => {
  const KEY = 'hs_projects';
  const UI_KEY = 'pj_ui';
  const DB_NAME = 'hs-projects-local';
  const AI_MODEL = 'gpt-4o-mini';
  const MAX_VERSIONS = 30;
  const VERSION_EVERY = 5 * 60 * 1000;
  const EMOJIS = ['📁', '🚀', '🧪', '📚', '✏️', '🎨', '🧭', '🌱', '💡', '🔭', '🧩', '🎯', '📝', '🗺️', '🎵', '🏗️', '🌙', '⭐', '🔬', '📊', '🧠', '🌍', '🐾', '🎬'];
  const COVERS = {
    navy: { name: '남색 밤', bg: '#1F3157', fg: '#FBF7EF', pattern: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,.18) 1px, transparent 1.5px), radial-gradient(circle at 70% 60%, rgba(255,255,255,.12) 1px, transparent 1.5px)', size: '28px 28px, 41px 41px' },
    paper: { name: '아이보리 종이', bg: '#F3ECDD', fg: '#1F3157', pattern: 'repeating-linear-gradient(0deg, transparent 0 21px, rgba(31,49,87,.08) 21px 22px)', size: 'auto' },
    sky: { name: '하늘', bg: '#DCE8F7', fg: '#173A66', pattern: 'radial-gradient(circle at 0 0, rgba(255,255,255,.7) 0 18px, transparent 19px)', size: '46px 46px' },
    forest: { name: '숲', bg: '#DCEFE2', fg: '#1E4A30', pattern: 'repeating-linear-gradient(135deg, rgba(30,74,48,.07) 0 10px, transparent 10px 20px)', size: 'auto' },
    sunset: { name: '노을', bg: '#FBE2D3', fg: '#6E2B17', pattern: 'radial-gradient(circle at 80% 120%, rgba(255,255,255,.55) 0 40%, transparent 41%)', size: 'auto' },
    lavender: { name: '라벤더', bg: '#E6E3F8', fg: '#33296B', pattern: 'radial-gradient(circle, rgba(51,41,107,.12) 1.2px, transparent 1.5px)', size: '16px 16px' },
    mint: { name: '민트', bg: '#D9F1EE', fg: '#14524A', pattern: 'repeating-linear-gradient(90deg, rgba(20,82,74,.06) 0 2px, transparent 2px 18px)', size: 'auto' },
    sand: { name: '모래', bg: '#F6E9C9', fg: '#5E4306', pattern: 'radial-gradient(ellipse at 50% 130%, rgba(94,67,6,.12) 0 45%, transparent 46%)', size: '60px 30px' },
  };
  const STATUS = { active: '진행 중', paused: '보류', done: '완료' };

  const TEMPLATES = [
    { id: 'blank', emoji: '📄', name: '빈 문서', desc: '처음부터 자유롭게', html: '<p><br></p>' },
    { id: 'plan', emoji: '🧭', name: '프로젝트 계획서', desc: '목표·일정·준비물', html: '<h1>프로젝트 계획서</h1><div class="pj-callout">💡 이 프로젝트로 무엇을 알고 싶거나 만들고 싶은지 한 문장으로 적어 보세요.</div><h2>1. 목표</h2><p><br></p><h2>2. 왜 하는가</h2><p><br></p><h2>3. 일정</h2><table class="pj-table"><tbody><tr><td><b>기간</b></td><td><b>할 일</b></td><td><b>결과물</b></td></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><h2>4. 준비물·자료</h2><ul><li><br></li></ul><h2>5. 체크리스트</h2><ul class="pj-check"><li data-checked="false"><br></li></ul>' },
    { id: 'experiment', emoji: '🧪', name: '실험 노트', desc: '가설·방법·결과·발견', html: '<h1>실험 노트</h1><p><b>날짜</b>: </p><h2>궁금한 점 (가설)</h2><p><br></p><h2>바꾸는 것 / 그대로 두는 것</h2><ul><li>바꾸는 것: </li><li>그대로 두는 것: </li></ul><h2>방법</h2><ol><li><br></li></ol><h2>결과</h2><table class="pj-table"><tbody><tr><td><b>시도</b></td><td><b>조건</b></td><td><b>결과</b></td></tr><tr><td>1</td><td><br></td><td><br></td></tr><tr><td>2</td><td><br></td><td><br></td></tr></tbody></table><h2>발견한 것 · 실패한 것</h2><p><br></p><h2>다음에 해 볼 것</h2><p><br></p>' },
    { id: 'study', emoji: '📚', name: '공부 정리', desc: '개념·예시·질문', html: '<h1>공부 정리</h1><p><b>과목</b>: &nbsp; <b>범위</b>: </p><h2>핵심 개념</h2><ul><li><br></li></ul><h2>예시</h2><p><br></p><blockquote>헷갈렸던 점이나 꼭 기억할 문장</blockquote><h2>스스로 묻고 답하기</h2><ol><li><br></li></ol>' },
    { id: 'reading', emoji: '📖', name: '독서 기록', desc: '줄거리·인상 깊은 문장', html: '<h1>독서 기록</h1><p><b>책</b>: &nbsp; <b>지은이</b>: &nbsp; <b>읽은 날</b>: </p><h2>한 줄 요약</h2><p><br></p><h2>인상 깊은 문장</h2><blockquote><br></blockquote><h2>내 생각</h2><p><br></p>' },
    { id: 'presentation', emoji: '🎤', name: '발표 준비', desc: '문제·시도·발견·다음', html: '<h1>발표 준비</h1><h2>1. 문제</h2><p><br></p><h2>2. 내가 한 시도</h2><p><br></p><h2>3. 발견한 것</h2><p><br></p><h2>4. 다음에 할 것</h2><p><br></p><div class="pj-callout">🎯 발표 시간: &nbsp;분 · 꼭 전할 한 문장: </div>' },
  ];

  const AI_ACTIONS = [
    { id: 'polish', label: '다듬기', prompt: '다음 글을 뜻은 그대로 두고 더 자연스럽고 읽기 쉽게 다듬어 줘. 다듬은 글만 답해.' },
    { id: 'summary', label: '요약', prompt: '다음 글을 핵심만 3~5줄로 요약해 줘. 요약만 답해.' },
    { id: 'continue', label: '이어 쓰기', prompt: '다음 글의 흐름과 말투를 그대로 이어서 한두 문단 더 써 줘. 이어지는 부분만 답해.' },
    { id: 'simple', label: '쉽게 풀기', prompt: '다음 글을 중학생도 이해할 수 있게 쉬운 말로 풀어 써 줘. 풀어 쓴 글만 답해.' },
    { id: 'spell', label: '맞춤법', prompt: '다음 글의 맞춤법과 띄어쓰기만 바르게 고쳐 줘. 내용은 바꾸지 말고 고친 글만 답해.' },
    { id: 'outline', label: '개요 만들기', prompt: '다음 주제나 글을 바탕으로 문서 개요를 만들어 줘. 각 줄은 "# 제목" 또는 "- 항목" 형식으로 답해.' },
    { id: 'quiz', label: '질문 만들기', prompt: '다음 글을 공부할 때 스스로 확인할 수 있는 질문 5개와 짧은 답을 만들어 줘. "1. 질문 — 답" 형식으로만 답해.' },
    { id: 'en', label: '영어로', prompt: '다음 글을 자연스러운 영어로 번역해 줘. 번역만 답해.' },
    { id: 'ko', label: '한국어로', prompt: '다음 글을 자연스러운 한국어로 번역해 줘. 번역만 답해.' },
  ];

  let U = null;
  let h = null;
  let data = null;
  let ui = null;
  let root = null;
  let route = { view: 'home', projectId: null, docId: null };
  let editorCtx = null; // 열린 문서의 상태

  /* ---------- 기본 도우미 ---------- */
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const pad = n => String(n).padStart(2, '0');
  const dkey = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const today = () => dkey(new Date());
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function dday(s) {
    if (!isDate(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const n = Math.round((new Date(y, m - 1, d) - t) / 86400000);
    return n === 0 ? 'D-DAY' : n > 0 ? `D-${n}` : `D+${-n}`;
  }
  function ago(ts) {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return '방금';
    if (s < 3600) return `${Math.floor(s / 60)}분 전`;
    if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)}일 전`;
    const d = new Date(ts);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  }
  // replaceChildren 은 false 를 글자로 넣으므로 빈 값을 걸러서 넣음
  const setKids = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false && k !== ''));
  const clock = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fullTime = ts => { const d = new Date(ts); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${clock(ts)}`; };

  /* ---------- 데이터 ---------- */
  function normalize(raw) {
    const out = { version: 1, projects: [], docs: [] };
    if (!isObj(raw)) return out;
    const pids = new Set();
    for (const p of Array.isArray(raw.projects) ? raw.projects : []) {
      if (!isObj(p) || typeof p.id !== 'string' || pids.has(p.id)) continue;
      pids.add(p.id);
      out.projects.push({
        id: p.id, name: str(p.name, 60) || '이름 없는 프로젝트', emoji: str(p.emoji, 8) || '📁',
        cover: COVERS[p.cover] ? p.cover : 'navy', desc: str(p.desc, 300),
        status: STATUS[p.status] ? p.status : 'active', deadline: isDate(p.deadline) ? p.deadline : '',
        pinned: !!p.pinned, trashed: !!p.trashed,
        createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
        tasks: (Array.isArray(p.tasks) ? p.tasks : []).filter(t => isObj(t) && typeof t.id === 'string').map(t => ({ id: t.id, text: str(t.text, 200), done: !!t.done })),
      });
    }
    for (const d of Array.isArray(raw.docs) ? raw.docs : []) {
      if (!isObj(d) || typeof d.id !== 'string' || !pids.has(d.projectId)) continue;
      out.docs.push({
        id: d.id, projectId: d.projectId, title: str(d.title, 120) || '제목 없는 문서', emoji: str(d.emoji, 8) || '📄',
        html: typeof d.html === 'string' ? d.html : '<p><br></p>', starred: !!d.starred, trashed: !!d.trashed,
        goal: Number.isInteger(d.goal) && d.goal > 0 ? Math.min(d.goal, 200000) : 0,
        chars: Number.isInteger(d.chars) ? d.chars : 0,
        createdAt: typeof d.createdAt === 'number' ? d.createdAt : Date.now(),
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
      });
    }
    return out;
  }
  function load() {
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch { raw = null; }
    data = normalize(raw);
    try { ui = JSON.parse(localStorage.getItem(UI_KEY)); } catch { ui = null; }
    if (!isObj(ui)) ui = {};
    if (!['all', 'active', 'paused', 'done'].includes(ui.filter)) ui.filter = 'all';
    if (!['updated', 'name', 'deadline'].includes(ui.sort)) ui.sort = 'updated';
    ui.outline = ui.outline !== false;
    ui.q = '';
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch {
      U.toast('저장 공간이 가득 찼어요. 오래된 문서를 정리하거나 내보내기로 보관해 주세요.');
      return false;
    }
  }
  function saveUi() { try { localStorage.setItem(UI_KEY, JSON.stringify({ filter: ui.filter, sort: ui.sort, outline: ui.outline, ai: ui.ai })); } catch { /* 무시 */ } }
  function update(fn) { fn(data); save(); render(); }

  const projectById = id => data.projects.find(p => p.id === id);
  const docById = id => data.docs.find(d => d.id === id);
  const liveDocs = pid => data.docs.filter(d => d.projectId === pid && !d.trashed);
  const taskProgress = p => (p.tasks.length ? Math.round(p.tasks.filter(t => t.done).length / p.tasks.length * 100) : null);
  const touch = pid => { const p = projectById(pid); if (p) p.updatedAt = Date.now(); };

  /* ---------- 이 기기 저장소: 그림·버전 ---------- */
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) { reject(new Error('이 브라우저는 그림 저장을 지원하지 않아요.')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('images'); req.result.createObjectStore('versions'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('저장소를 열지 못했어요.'));
      });
      dbp.catch(() => { dbp = null; });
    }
    return dbp;
  }
  async function idb(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('저장이 취소됐어요.'));
    });
  }
  const putImage = (id, blob) => idb('images', 'readwrite', s => s.put(blob, id));
  const getImage = id => idb('images', 'readonly', s => s.get(id)).catch(() => null);
  const delImages = ids => Promise.all(ids.map(id => idb('images', 'readwrite', s => s.delete(id)).catch(() => null)));
  const getVersions = docId => idb('versions', 'readonly', s => s.get(docId)).then(v => v || []).catch(() => []);
  const setVersions = (docId, list) => idb('versions', 'readwrite', s => s.put(list, docId)).catch(() => null);
  const delVersions = docId => idb('versions', 'readwrite', s => s.delete(docId)).catch(() => null);

  async function shrinkImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('그림 파일만 넣을 수 있어요.');
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return file; }
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d');
    const png = file.type === 'image/png';
    if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    const blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.85));
    return blob && (blob.size < file.size || scale < 1) ? blob : file;
  }
  function imageIdsIn(html) {
    const out = [];
    html.replace(/data-pimg="([^"]+)"/g, (_, id) => { out.push(id); return ''; });
    return out;
  }

  /* ---------- HTML 정리: 허용한 태그·속성만 남김 (붙여넣기·저장된 문서 모두) ---------- */
  const ALLOWED = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'TABLE', 'TBODY', 'THEAD', 'TR', 'TD', 'TH', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A', 'BR', 'HR', 'SPAN', 'FONT', 'IMG', 'CODE', 'SUB', 'SUP', 'MARK']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TITLE', 'svg', 'SVG', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'NOSCRIPT', 'TEMPLATE']);
  function safeColor(v) { return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/i.test(v.trim()) ? v.trim() : ''; }
  function cleanNode(node) {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue;
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName.toUpperCase();
      if (DROP.has(child.tagName) || DROP.has(tag)) { child.remove(); continue; }
      cleanNode(child);
      if (!ALLOWED.has(tag)) {
        // 모르는 태그는 내용만 남김 (블록처럼 쓰인 태그는 문단으로)
        if (['SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'H4', 'H5', 'H6'].includes(tag)) {
          const p = document.createElement(/^H[456]$/.test(tag) ? 'h3' : 'p');
          while (child.firstChild) p.append(child.firstChild);
          child.replaceWith(p);
        } else {
          child.replaceWith(...child.childNodes);
        }
        continue;
      }
      const keep = {};
      const style = child.getAttribute('style') || '';
      const color = (style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i) || [])[1];
      const bg = (style.match(/background(?:-color)?\s*:\s*([^;]+)/i) || [])[1];
      const align = (style.match(/text-align\s*:\s*(left|center|right|justify)/i) || [])[1];
      const css = [];
      if (color && safeColor(color)) css.push(`color: ${safeColor(color)}`);
      if (bg && safeColor(bg) && !/^(transparent|white|#fff(fff)?|rgb\(255,\s*255,\s*255\))$/i.test(bg.trim())) css.push(`background-color: ${safeColor(bg)}`);
      if (align) css.push(`text-align: ${align.toLowerCase()}`);
      if (css.length) keep.style = css.join('; ');
      if (tag === 'A') {
        const href = child.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) { keep.href = href; keep.target = '_blank'; keep.rel = 'noopener noreferrer'; }
      }
      if (tag === 'IMG') {
        const pimg = child.getAttribute('data-pimg');
        const src = child.getAttribute('src') || '';
        if (pimg) keep['data-pimg'] = pimg;
        else if (/^https?:/i.test(src)) keep.src = src;
        else { child.remove(); continue; }
        const w = child.getAttribute('data-w');
        if (w && /^\d{1,3}$/.test(w)) keep['data-w'] = w;
        keep.alt = (child.getAttribute('alt') || '').slice(0, 200);
      }
      if (tag === 'FONT' && child.getAttribute('color') && safeColor(child.getAttribute('color'))) keep.color = safeColor(child.getAttribute('color'));
      if ((tag === 'UL' || tag === 'DIV' || tag === 'TABLE') && child.classList.length) {
        const cls = [...child.classList].filter(c => ['pj-check', 'pj-callout', 'pj-table'].includes(c));
        if (cls.length) keep.class = cls.join(' ');
      }
      if (tag === 'LI' && child.hasAttribute('data-checked')) keep['data-checked'] = child.getAttribute('data-checked') === 'true' ? 'true' : 'false';
      if ((tag === 'TD' || tag === 'TH') && /^\d{1,2}$/.test(child.getAttribute('colspan') || '')) keep.colspan = child.getAttribute('colspan');
      for (const a of [...child.attributes]) child.removeAttribute(a.name);
      for (const [k, v] of Object.entries(keep)) child.setAttribute(k, v);
    }
  }
  function sanitize(html) {
    const t = document.createElement('template');
    t.innerHTML = html;
    cleanNode(t.content);
    return t.innerHTML;
  }

  /* ---------- AI ---------- */
  async function askAI(messages, maxTokens = 900) {
    const apiKey = localStorage.getItem('hs_openai_key');
    if (!apiKey) {
      const e = new Error('AI 기능을 쓰려면 설정에서 OpenAI API 키를 먼저 저장해 주세요.');
      e.noKey = true;
      throw e;
    }
    let res;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: AI_MODEL, temperature: 0.6, max_tokens: maxTokens, messages }),
      });
    } catch { throw new Error('AI 서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'API 키가 올바르지 않아요. 설정에서 키를 확인해 주세요.'
        : res.status === 429 ? '요청이 많거나 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
          : 'AI 서버에서 오류가 났어요. 잠시 후 다시 시도해 주세요.');
    }
    const text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!text) throw new Error('AI 답을 읽지 못했어요. 다시 시도해 주세요.');
    return text.trim();
  }
  const AI_SYSTEM = '너는 학교에 다니지 않고 혼자 공부하는 학생 "지윤"의 프로젝트 문서 작업을 돕는 친절한 도우미야. 한국어 존댓말(해요체)로 간결하게 답해. 사실이 확실하지 않으면 그렇다고 말해. 학생이 스스로 생각하도록 돕되, 요청하면 직접 써 줘.';

  // AI 답(마크다운 비슷한 글)을 문서에 넣을 HTML로 바꿈
  function textToHtml(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const out = [];
    let list = null;
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { close(); continue; }
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
    close();
    return out.join('') || '<p><br></p>';
  }

  /* ============================================================
     화면 1: 프로젝트 목록
     ============================================================ */
  function coverStyle(key) {
    const c = COVERS[key] || COVERS.navy;
    return { background: `${c.pattern}, ${c.bg}`, backgroundSize: `${c.size}, auto`, color: c.fg };
  }

  function ring(pct, size = 44) {
    const r = (size - 6) / 2, c = 2 * Math.PI * r;
    return h('span', {
      class: 'pj-ring', style: { width: size + 'px', height: size + 'px' }, 'aria-label': `할 일 ${pct}% 완료`,
      html: `<svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pj-ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="pj-ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}"/></svg><b>${pct}%</b>`,
    });
  }

  function projectCard(p) {
    const docs = liveDocs(p.id);
    const prog = taskProgress(p);
    const dd = p.deadline && p.status !== 'done' ? dday(p.deadline) : null;
    return h('li', { class: 'pj-card-wrap' },
      h('button', { type: 'button', class: 'pj-card', onclick: () => go({ view: 'project', projectId: p.id }) },
        h('div', { class: 'pj-cover', style: coverStyle(p.cover) },
          h('span', { class: 'pj-cover-emoji' }, p.emoji),
          dd && h('span', { class: 'pj-dday' + (dd === 'D-DAY' || dd.startsWith('D+') ? ' is-hot' : '') }, dd),
          p.pinned && h('span', { class: 'pj-pin', title: '고정됨' }, '📌')),
        h('div', { class: 'pj-card-body' },
          h('div', { class: 'pj-card-title-row' },
            h('span', { class: 'pj-card-title' }, p.name),
            h('span', { class: `pj-status is-${p.status}` }, STATUS[p.status])),
          p.desc && h('p', { class: 'pj-card-desc' }, p.desc),
          h('div', { class: 'pj-card-foot' },
            h('span', { class: 'pj-meta' }, `📄 문서 ${docs.length}개`),
            h('span', { class: 'pj-meta' }, ago(p.updatedAt)),
            prog !== null && ring(prog, 38)))));
  }

  function renderHome() {
    const live = data.projects.filter(p => !p.trashed);
    const q = ui.q.trim().toLowerCase();
    const list = live
      .filter(p => ui.filter === 'all' || p.status === ui.filter)
      .filter(p => !q || `${p.name} ${p.desc}`.toLowerCase().includes(q) || liveDocs(p.id).some(d => d.title.toLowerCase().includes(q)))
      .sort((a, b) => (b.pinned - a.pinned) || (ui.sort === 'name' ? a.name.localeCompare(b.name, 'ko')
        : ui.sort === 'deadline' ? (a.deadline || '9999').localeCompare(b.deadline || '9999') : b.updatedAt - a.updatedAt));
    const allDocs = data.docs.filter(d => !d.trashed && projectById(d.projectId) && !projectById(d.projectId).trashed);
    const recent = [...allDocs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    const totalChars = allDocs.reduce((s, d) => s + (d.chars || 0), 0);
    const soon = live.filter(p => p.deadline && p.status !== 'done' && p.deadline >= today()).sort((a, b) => a.deadline.localeCompare(b.deadline))[0];
    const trashCount = data.projects.filter(p => p.trashed).length + data.docs.filter(d => d.trashed).length;

    const hero = h('div', { class: 'pj-hero' },
      h('div', { class: 'pj-hero-deco', 'aria-hidden': 'true' }, h('span', null, '✦'), h('span', null, '✧'), h('span', null, '◆')),
      h('div', { class: 'pj-hero-text' },
        h('p', { class: 'pj-eyebrow' }, 'PROJECTS'),
        h('h1', { class: 'pj-h1' }, '프로젝트'),
        h('p', { class: 'pj-hero-sub' }, '하고 싶은 일을 폴더로 모으고, 문서로 생각을 키워요.')),
      h('div', { class: 'pj-hero-actions' },
        h('button', { type: 'button', class: 'sp-btn pj-btn-light', onclick: () => go({ view: 'trash' }) }, U.icon('trash'), `휴지통${trashCount ? ' ' + trashCount : ''}`),
        h('button', { type: 'button', class: 'sp-btn pj-btn-gold', onclick: openProjectEditor }, U.icon('plus'), '새 프로젝트')));

    const stats = h('div', { class: 'pj-stats' },
      stat('🚀', '진행 중', `${live.filter(p => p.status === 'active').length}개`),
      stat('📄', '문서', `${allDocs.length}개`),
      stat('✍️', '쓴 글자', `${totalChars.toLocaleString()}자`),
      stat('⏰', '다가오는 마감', soon ? `${soon.emoji} ${dday(soon.deadline)}` : '없어요'));

    const recentEl = recent.length > 0 && h('section', { class: 'pj-recent' },
      h('h2', { class: 'pj-h2' }, '최근 문서'),
      h('div', { class: 'pj-recent-row' }, recent.map(d => {
        const p = projectById(d.projectId);
        return h('button', { type: 'button', class: 'pj-recent-card', onclick: () => go({ view: 'editor', projectId: d.projectId, docId: d.id }) },
          h('span', { class: 'pj-recent-strip', style: coverStyle(p.cover) }),
          h('span', { class: 'pj-recent-emoji' }, d.emoji),
          h('span', { class: 'pj-recent-title' }, d.title),
          h('span', { class: 'pj-recent-meta' }, `${p.emoji} ${p.name} · ${ago(d.updatedAt)}`));
      })));

    const toolbar = h('div', { class: 'pj-list-tools' },
      h('div', { class: 'pj-filter', role: 'tablist', 'aria-label': '상태' },
        [['all', '전체'], ['active', '진행 중'], ['paused', '보류'], ['done', '완료']].map(([v, t]) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': String(ui.filter === v), class: 'pj-filter-btn' + (ui.filter === v ? ' is-on' : ''),
          onclick: () => { ui.filter = v; saveUi(); render(); },
        }, t, h('small', null, String(v === 'all' ? live.length : live.filter(p => p.status === v).length))))),
      h('div', { class: 'pj-list-right' },
        h('label', { class: 'pj-search' }, U.icon('search'), h('input', {
          type: 'search', class: 'sp-input', value: ui.q, placeholder: '프로젝트·문서 찾기', 'aria-label': '프로젝트 찾기',
          oninput: e => { ui.q = e.target.value; const pos = e.target.selectionStart; render(); const s = root.querySelector('.pj-search input'); if (s) { s.focus(); s.setSelectionRange(pos, pos); } },
        })),
        h('select', { class: 'sp-input pj-sort', 'aria-label': '정렬', onchange: e => { ui.sort = e.target.value; saveUi(); render(); } },
          h('option', { value: 'updated' }, '최근 수정순'), h('option', { value: 'deadline' }, '마감 가까운 순'), h('option', { value: 'name' }, '이름순'))));
    toolbar.querySelector('.pj-sort').value = ui.sort;

    const grid = list.length
      ? h('ul', { class: 'pj-grid' }, list.map(projectCard),
        h('li', { class: 'pj-card-wrap' }, h('button', { type: 'button', class: 'pj-card pj-card-new', onclick: openProjectEditor }, h('span', { class: 'pj-new-plus' }, '+'), h('span', null, '새 프로젝트'))))
      : h('div', { class: 'pj-empty' },
        h('div', { class: 'pj-empty-art', 'aria-hidden': 'true' }, '🗂️'),
        h('p', { class: 'pj-empty-title' }, live.length ? '조건에 맞는 프로젝트가 없어요.' : '첫 프로젝트를 만들어 볼까요?'),
        h('p', { class: 'sp-empty-sub' }, live.length ? '다른 상태나 검색어로 찾아보세요.' : '실험, 발표, 독서, 만들기… 하고 싶은 일마다 폴더를 하나씩 만들어요.'),
        !live.length && h('div', { class: 'sp-empty-actions' }, h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: openProjectEditor }, U.icon('plus'), '새 프로젝트')));

    return h('div', { class: 'pj-home' }, hero, stats, recentEl, h('section', null, h('h2', { class: 'pj-h2' }, '프로젝트 폴더'), toolbar, grid));
  }
  function stat(emoji, label, value) {
    return h('div', { class: 'pj-stat' }, h('span', { class: 'pj-stat-emoji', 'aria-hidden': 'true' }, emoji), h('span', { class: 'pj-stat-label' }, label), h('span', { class: 'pj-stat-val' }, value));
  }

  function openProjectEditor(pid) {
    const p = typeof pid === 'string' ? projectById(pid) : null;
    const st = { emoji: p ? p.emoji : EMOJIS[Math.floor(Math.random() * 8)], cover: p ? p.cover : Object.keys(COVERS)[Math.floor(Math.random() * 8)], status: p ? p.status : 'active' };
    const m = U.modal(p ? '프로젝트 설정' : '새 프로젝트');
    const name = h('input', { type: 'text', class: 'sp-input', maxlength: 60, value: p ? p.name : '', placeholder: '예: 식물 성장 실험', 'aria-label': '프로젝트 이름' });
    const desc = U.autosize(h('textarea', { class: 'sp-input', rows: 2, maxlength: 300, value: p ? p.desc : '', placeholder: '이 프로젝트로 하고 싶은 일 (선택)', 'aria-label': '설명' }));
    const deadline = h('input', { type: 'date', class: 'sp-input', value: p ? p.deadline : '', 'aria-label': '마감일' });
    const error = h('p', { class: 'sp-form-error', role: 'alert' });
    const preview = h('div', { class: 'pj-preview' });
    const drawPreview = () => {
      preview.replaceChildren(h('div', { class: 'pj-cover pj-cover-preview', style: coverStyle(st.cover) }, h('span', { class: 'pj-cover-emoji' }, st.emoji)));
    };
    drawPreview();
    const emojiPick = h('div', { class: 'pj-emoji-pick' }, EMOJIS.map(e => {
      const b = h('button', { type: 'button', class: 'pj-emoji' + (e === st.emoji ? ' is-on' : ''), 'aria-label': e, onclick: () => { st.emoji = e; emojiPick.querySelectorAll('.pj-emoji').forEach(x => x.classList.toggle('is-on', x === b)); drawPreview(); } }, e);
      return b;
    }));
    const coverPick = h('div', { class: 'pj-cover-pick' }, Object.entries(COVERS).map(([k, c]) => {
      const b = h('button', { type: 'button', class: 'pj-cover-swatch' + (k === st.cover ? ' is-on' : ''), style: coverStyle(k), title: c.name, 'aria-label': c.name, onclick: () => { st.cover = k; coverPick.querySelectorAll('.pj-cover-swatch').forEach(x => x.classList.toggle('is-on', x === b)); drawPreview(); } });
      return b;
    }));
    const submit = () => {
      const n = name.value.trim();
      if (!n) { error.textContent = '프로젝트 이름을 적어 주세요.'; name.focus(); return; }
      const fields = { name: n, desc: desc.value.trim(), deadline: isDate(deadline.value) ? deadline.value : '', emoji: st.emoji, cover: st.cover, status: st.status, updatedAt: Date.now() };
      if (p) {
        update(d => { Object.assign(d.projects.find(x => x.id === p.id), fields); });
        m.close();
      } else {
        const id = uid('pj');
        data.projects.push({ id, ...fields, pinned: false, trashed: false, createdAt: Date.now(), tasks: [] });
        save();
        m.close();
        go({ view: 'project', projectId: id });
        U.toast(`${st.emoji} '${n}' 프로젝트를 만들었어요.`);
      }
    };
    m.setBody(h('form', { class: 'sp-form', onsubmit: e => { e.preventDefault(); submit(); } },
      preview,
      U.field('이름', name),
      U.field('설명', desc),
      h('div', { class: 'pj-row2' },
        U.field('상태', U.segmented(Object.entries(STATUS), st.status, v => { st.status = v; }, '상태')),
        U.field('마감일 (선택)', deadline)),
      U.field('아이콘', emojiPick),
      U.field('표지', coverPick),
      error));
    m.setFooter(h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: submit }, p ? '저장' : '만들기'));
  }

  /* ============================================================
     화면 2: 프로젝트 안
     ============================================================ */
  function renderProject(p) {
    const docs = liveDocs(p.id).sort((a, b) => (b.starred - a.starred) || b.updatedAt - a.updatedAt);
    const prog = taskProgress(p);
    const dd = p.deadline ? dday(p.deadline) : null;

    const banner = h('div', { class: 'pj-banner', style: coverStyle(p.cover) },
      h('button', { type: 'button', class: 'pj-back', onclick: () => go({ view: 'home' }) }, '← 모든 프로젝트'),
      h('div', { class: 'pj-banner-main' },
        h('span', { class: 'pj-banner-emoji' }, p.emoji),
        h('div', null,
          h('h1', { class: 'pj-banner-title' }, p.name),
          h('div', { class: 'pj-banner-meta' },
            h('span', { class: `pj-status is-${p.status}` }, STATUS[p.status]),
            dd && h('span', { class: 'pj-banner-chip' }, `마감 ${p.deadline.slice(5).replace('-', '.')} · ${dd}`),
            h('span', { class: 'pj-banner-chip' }, `문서 ${docs.length}개`)),
          p.desc && h('p', { class: 'pj-banner-desc' }, p.desc))),
      h('div', { class: 'pj-banner-actions' },
        h('button', { type: 'button', class: 'sp-btn pj-btn-light', onclick: () => update(d => { const x = d.projects.find(y => y.id === p.id); x.pinned = !x.pinned; }) }, p.pinned ? '📌 고정 풀기' : '📌 고정'),
        h('button', { type: 'button', class: 'sp-btn pj-btn-light', onclick: () => openProjectEditor(p.id) }, U.icon('settings'), '설정'),
        h('button', { type: 'button', class: 'sp-btn pj-btn-light', onclick: async () => {
          if (!await U.confirmBox(`'${p.name}' 프로젝트를 휴지통으로 옮길까요? 안에 있는 문서도 함께 옮겨져요. 휴지통에서 되살릴 수 있어요.`, { title: '프로젝트 휴지통으로', ok: '옮기기', danger: true })) return;
          data.projects.find(y => y.id === p.id).trashed = true;
          save();
          go({ view: 'home' });
          U.toast('휴지통으로 옮겼어요.');
        } }, U.icon('trash'), '삭제')));

    // 문서
    const docList = h('section', { class: 'pj-docs' },
      h('div', { class: 'pj-section-head' },
        h('h2', { class: 'pj-h2' }, '문서'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: () => openTemplatePicker(p.id) }, U.icon('plus'), '새 문서')),
      docs.length
        ? h('ul', { class: 'pj-doc-grid' }, docs.map(d => docCard(p, d)))
        : h('div', { class: 'pj-empty pj-empty-sm' },
          h('div', { class: 'pj-empty-art', 'aria-hidden': 'true' }, '📝'),
          h('p', { class: 'pj-empty-title' }, '아직 문서가 없어요.'),
          h('p', { class: 'sp-empty-sub' }, '계획서·실험 노트 같은 틀로 시작하면 빠르게 쓸 수 있어요.'),
          h('div', { class: 'sp-empty-actions' }, h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: () => openTemplatePicker(p.id) }, U.icon('plus'), '첫 문서 만들기'))));

    // 할 일
    const taskInput = h('input', { type: 'text', class: 'sp-input', maxlength: 200, placeholder: '할 일을 적고 Enter', 'aria-label': '새 할 일', 'data-pj-focus': 'task' });
    const addTask = () => {
      const t = taskInput.value.trim();
      if (!t) return;
      update(d => { const x = d.projects.find(y => y.id === p.id); x.tasks.push({ id: uid('t'), text: t, done: false }); x.updatedAt = Date.now(); });
      const f = root.querySelector('[data-pj-focus="task"]'); if (f) f.focus();
    };
    taskInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !U.isComposing(e)) { e.preventDefault(); addTask(); } });
    const tasks = h('aside', { class: 'pj-tasks' },
      h('div', { class: 'pj-section-head' }, h('h2', { class: 'pj-h2' }, '할 일'), prog !== null && ring(prog, 46)),
      p.tasks.length ? h('ul', { class: 'pj-task-list' }, p.tasks.map((t, i) => h('li', { class: 'pj-task' + (t.done ? ' is-done' : '') },
        h('label', { class: 'sp-check' }, h('input', { type: 'checkbox', checked: t.done, 'aria-label': t.text, onchange: e => {
          const v = e.target.checked;
          update(d => { const x = d.projects.find(y => y.id === p.id); x.tasks[i].done = v; x.updatedAt = Date.now(); });
          if (v && p.tasks.every((tt, j) => j === i || tt.done)) celebrate();
        } }), h('span', { class: 'sp-check-box', 'aria-hidden': 'true' })),
        h('span', { class: 'pj-task-text' }, t.text),
        U.iconBtn('x', '할 일 지우기', () => update(d => { d.projects.find(y => y.id === p.id).tasks.splice(i, 1); }))))) : h('p', { class: 'pj-muted' }, '프로젝트를 끝내기 위해 할 일을 적어 보세요.'),
      h('div', { class: 'pj-task-add' }, taskInput, h('button', { type: 'button', class: 'sp-btn', onclick: addTask }, '추가')));

    return h('div', { class: 'pj-project' }, banner, h('div', { class: 'pj-project-grid' }, docList, tasks));
  }

  function docCard(p, d) {
    const more = U.iconBtn('more', `${d.title} 메뉴`, e => { e.stopPropagation(); docMenu(e.currentTarget, d); }, { cls: 'pj-doc-more' });
    const text = (d.html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return h('li', null, h('div', {
      class: 'pj-doc-card', role: 'button', tabindex: '0',
      onclick: () => go({ view: 'editor', projectId: p.id, docId: d.id }),
      onkeydown: e => { if (e.key === 'Enter') go({ view: 'editor', projectId: p.id, docId: d.id }); },
    },
      h('div', { class: 'pj-doc-paper', 'aria-hidden': 'true' }, h('span', { class: 'pj-doc-paper-emoji' }, d.emoji), h('p', null, text.slice(0, 140) || '빈 문서')),
      h('div', { class: 'pj-doc-info' },
        h('span', { class: 'pj-doc-title' }, d.starred ? '⭐ ' : '', d.title),
        h('span', { class: 'pj-doc-meta' }, `${(d.chars || 0).toLocaleString()}자 · ${ago(d.updatedAt)}`)),
      more));
  }

  function docMenu(anchor, d) {
    U.menu(anchor, [
      { label: d.starred ? '⭐ 별표 빼기' : '⭐ 별표', onClick: () => update(x => { x.docs.find(y => y.id === d.id).starred = !d.starred; }) },
      { label: '이름 바꾸기', onClick: () => renameDoc(d.id) },
      { label: '사본 만들기', onClick: () => duplicateDoc(d.id) },
      { label: '다른 프로젝트로 옮기기', onClick: () => moveDoc(d.id) },
      { label: '.docx로 내려받기', onClick: () => exportDocx(d.id) },
      '-',
      { label: '휴지통으로', danger: true, onClick: () => { update(x => { x.docs.find(y => y.id === d.id).trashed = true; touch(d.projectId); }); U.toast('휴지통으로 옮겼어요.'); } },
    ]);
  }

  function renameDoc(id) {
    const d = docById(id);
    const m = U.modal('문서 이름 바꾸기');
    const input = h('input', { type: 'text', class: 'sp-input', maxlength: 120, value: d.title, 'aria-label': '문서 이름' });
    const ok = () => { const v = input.value.trim(); if (v) update(x => { x.docs.find(y => y.id === id).title = v; }); m.close(); };
    m.setBody(h('form', { class: 'sp-form', onsubmit: e => { e.preventDefault(); ok(); } }, U.field('이름', input)));
    m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'), h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: ok }, '저장'));
  }

  async function duplicateDoc(id) {
    const d = docById(id);
    // 그림은 새 id로 복사해야 원본을 지워도 사본이 남음
    let html = d.html;
    for (const imgId of imageIdsIn(html)) {
      const blob = await getImage(imgId);
      if (!blob) continue;
      const nid = uid('img');
      await putImage(nid, blob).catch(() => null);
      html = html.split(`data-pimg="${imgId}"`).join(`data-pimg="${nid}"`);
    }
    update(x => { x.docs.push({ ...d, id: uid('doc'), title: `${d.title} (사본)`, html, starred: false, createdAt: Date.now(), updatedAt: Date.now() }); touch(d.projectId); });
    U.toast('사본을 만들었어요.');
  }

  function moveDoc(id) {
    const d = docById(id);
    const others = data.projects.filter(p => !p.trashed && p.id !== d.projectId);
    if (!others.length) { U.toast('옮길 다른 프로젝트가 없어요.'); return; }
    const m = U.modal('다른 프로젝트로 옮기기');
    m.setBody(h('div', { class: 'pj-move-list' }, others.map(p => h('button', { type: 'button', class: 'pj-move-item', onclick: () => {
      update(x => { x.docs.find(y => y.id === id).projectId = p.id; touch(p.id); touch(d.projectId); });
      m.close();
      U.toast(`${p.emoji} '${p.name}'(으)로 옮겼어요.`);
    } }, h('span', { class: 'pj-move-cover', style: coverStyle(p.cover) }, p.emoji), h('span', null, p.name)))));
  }

  function openTemplatePicker(pid) {
    const m = U.modal('새 문서 만들기');
    m.setBody(
      h('p', { class: 'sp-modal-text sp-muted' }, '틀을 고르면 바로 쓸 수 있게 기본 구성이 들어가요.'),
      h('div', { class: 'pj-template-grid' }, TEMPLATES.map(t => h('button', { type: 'button', class: 'pj-template', onclick: () => {
        const id = uid('doc');
        data.docs.push({ id, projectId: pid, title: t.id === 'blank' ? '제목 없는 문서' : t.name, emoji: t.emoji, html: t.html, starred: false, trashed: false, goal: 0, chars: 0, createdAt: Date.now(), updatedAt: Date.now() });
        touch(pid);
        save();
        m.close();
        go({ view: 'editor', projectId: pid, docId: id });
      } },
        h('span', { class: 'pj-template-emoji' }, t.emoji), h('span', { class: 'pj-template-name' }, t.name), h('span', { class: 'pj-template-desc' }, t.desc)))),
      h('div', { class: 'pj-template-ai' },
        h('p', null, '✨ 만들고 싶은 문서를 적으면 AI가 개요를 짜 줘요.'),
        (() => {
          const input = h('input', { type: 'text', class: 'sp-input', maxlength: 200, placeholder: '예: 식물에 음악을 들려주면 더 잘 자랄까? 실험 계획서', 'aria-label': 'AI 개요 주제' });
          const btn = h('button', { type: 'button', class: 'sp-btn sp-btn-ai', onclick: async () => {
            const topic = input.value.trim();
            if (!topic) { input.focus(); return; }
            btn.disabled = true; btn.textContent = '개요 만드는 중…';
            try {
              const text = await askAI([{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: `다음 문서의 개요를 만들어 줘. 첫 줄은 "# 문서 제목", 그다음은 "## 소제목"과 그 아래 "- 쓸 내용 힌트" 형식으로만 답해.\n주제: ${topic}` }], 700);
              const html = textToHtml(text);
              const title = (text.match(/^#\s+(.+)$/m) || [])[1] || topic.slice(0, 60);
              const id = uid('doc');
              data.docs.push({ id, projectId: pid, title: title.trim(), emoji: '✨', html: sanitize(html), starred: false, trashed: false, goal: 0, chars: 0, createdAt: Date.now(), updatedAt: Date.now() });
              touch(pid); save(); m.close();
              go({ view: 'editor', projectId: pid, docId: id });
            } catch (err) {
              btn.disabled = false; btn.textContent = '✨ AI 개요';
              if (err.noKey) { if (await U.confirmBox(err.message + ' 설정을 열까요?', { title: 'AI 키 필요', ok: '설정 열기' }) && typeof showSettingsModal === 'function') showSettingsModal(); }
              else U.toast(err.message);
            }
          } }, '✨ AI 개요');
          input.addEventListener('keydown', e => { if (e.key === 'Enter' && !U.isComposing(e)) { e.preventDefault(); btn.click(); } });
          return h('div', { class: 'pj-template-ai-row' }, input, btn);
        })()));
  }

  /* ---------- 휴지통 ---------- */
  function renderTrash() {
    const ps = data.projects.filter(p => p.trashed);
    const ds = data.docs.filter(d => d.trashed && projectById(d.projectId) && !projectById(d.projectId).trashed);
    const restoreP = id => update(x => { x.projects.find(y => y.id === id).trashed = false; });
    const restoreD = id => update(x => { x.docs.find(y => y.id === id).trashed = false; });
    async function purge(kind, id) {
      if (!await U.confirmBox('완전히 지우면 되살릴 수 없어요. 지울까요?', { title: '완전히 지우기', ok: '지우기', danger: true })) return;
      const docs = kind === 'p' ? data.docs.filter(d => d.projectId === id) : [docById(id)];
      docs.forEach(d => { delImages(imageIdsIn(d.html)); delVersions(d.id); });
      update(x => {
        if (kind === 'p') { x.projects = x.projects.filter(y => y.id !== id); x.docs = x.docs.filter(y => y.projectId !== id); }
        else x.docs = x.docs.filter(y => y.id !== id);
      });
    }
    const row = (emoji, title, sub, onRestore, onPurge) => h('li', { class: 'pj-trash-row' },
      h('span', { class: 'pj-trash-emoji' }, emoji),
      h('div', { class: 'pj-trash-text' }, h('span', { class: 'pj-trash-title' }, title), h('span', { class: 'pj-trash-sub' }, sub)),
      h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: onRestore }, '되살리기'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost pj-danger', onclick: onPurge }, '완전히 지우기'));
    return h('div', { class: 'pj-trash' },
      h('button', { type: 'button', class: 'pj-back pj-back-dark', onclick: () => go({ view: 'home' }) }, '← 모든 프로젝트'),
      h('h1', { class: 'pj-h1 pj-h1-dark' }, '🗑️ 휴지통'),
      h('p', { class: 'pj-muted' }, '지운 프로젝트와 문서는 여기 남아 있어요. 되살리거나 완전히 지울 수 있어요.'),
      ps.length + ds.length === 0 ? h('div', { class: 'pj-empty pj-empty-sm' }, h('div', { class: 'pj-empty-art' }, '✨'), h('p', { class: 'pj-empty-title' }, '휴지통이 비어 있어요.'))
        : h('ul', { class: 'pj-trash-list' },
          ps.map(p => row(p.emoji, p.name, `프로젝트 · 문서 ${data.docs.filter(d => d.projectId === p.id).length}개`, () => restoreP(p.id), () => purge('p', p.id))),
          ds.map(d => row(d.emoji, d.title, `문서 · ${projectById(d.projectId).name}`, () => restoreD(d.id), () => purge('d', d.id)))));
  }

  function celebrate() {
    const layer = h('div', { class: 'pj-confetti', 'aria-hidden': 'true' });
    const colors = ['#1F3157', '#D6B370', '#E59484', '#8FB1E6', '#86CBB8', '#F4C97A'];
    for (let i = 0; i < 60; i++) {
      layer.append(h('i', { style: { left: Math.random() * 100 + '%', background: colors[i % colors.length], animationDelay: Math.random() * 0.4 + 's', animationDuration: 1.6 + Math.random() * 1.2 + 's', transform: `rotate(${Math.random() * 360}deg)` } }));
    }
    document.body.append(layer);
    setTimeout(() => layer.remove(), 3200);
    U.toast('🎉 할 일을 모두 끝냈어요!');
  }

  /* ============================================================
     화면 3: 문서 편집기
     ============================================================ */
  const BLOCKS = [
    { id: 'p', label: '본문', tag: 'p' },
    { id: 'h1', label: '제목 1', tag: 'h1' },
    { id: 'h2', label: '제목 2', tag: 'h2' },
    { id: 'h3', label: '제목 3', tag: 'h3' },
    { id: 'blockquote', label: '인용', tag: 'blockquote' },
    { id: 'pre', label: '코드', tag: 'pre' },
  ];
  const TEXT_COLORS = ['#1B2740', '#56607A', '#B4442F', '#C0762A', '#2E7D4F', '#2F5BA8', '#6B4FB8', '#B03A78'];
  const HL_COLORS = ['#FFF1A8', '#FDDCD3', '#D8F0DD', '#DCE8F7', '#ECE3FA', '#F3ECDD'];

  const SLASH = [
    { id: 'h1', label: '제목 1', hint: '큰 제목', keys: 'h1 제목 heading', run: () => fmtBlock('h1') },
    { id: 'h2', label: '제목 2', hint: '중간 제목', keys: 'h2 제목', run: () => fmtBlock('h2') },
    { id: 'h3', label: '제목 3', hint: '작은 제목', keys: 'h3 제목', run: () => fmtBlock('h3') },
    { id: 'ul', label: '글머리 목록', hint: '• 항목', keys: 'ul 목록 list bullet', run: () => cmd('insertUnorderedList') },
    { id: 'ol', label: '번호 목록', hint: '1. 항목', keys: 'ol 번호 number', run: () => cmd('insertOrderedList') },
    { id: 'check', label: '체크리스트', hint: '☐ 할 일', keys: 'todo 체크 check', run: () => insertChecklist() },
    { id: 'quote', label: '인용', hint: '“ ”', keys: 'quote 인용', run: () => fmtBlock('blockquote') },
    { id: 'callout', label: '강조 상자', hint: '💡 메모', keys: 'callout 강조 상자 메모', run: () => insertCallout() },
    { id: 'code', label: '코드', hint: '고정폭 글자', keys: 'code 코드', run: () => fmtBlock('pre') },
    { id: 'table', label: '표', hint: '3×3', keys: 'table 표', run: () => insertTable(3, 3) },
    { id: 'image', label: '그림', hint: '사진 넣기', keys: 'image 그림 사진 img', run: () => pickImage() },
    { id: 'hr', label: '구분선', hint: '———', keys: 'hr 구분선 divider', run: () => cmd('insertHorizontalRule') },
    { id: 'date', label: '오늘 날짜', hint: today(), keys: 'date 날짜 오늘', run: () => cmd('insertText', `${today().replace(/-/g, '.')}`) },
    { id: 'ai', label: 'AI에게 이어 쓰기', hint: '✨', keys: 'ai 이어 continue', run: () => runAiAction('continue') },
  ];

  function editor() { return editorCtx && editorCtx.page; }
  // 창·메뉴를 쓰느라 편집기에서 포커스가 빠졌다면, 마지막 커서 위치로 되돌린 뒤 명령을 실행
  function focusEditor() {
    const ed = editor();
    if (!ed) return false;
    const had = document.activeElement === ed;
    ed.focus();
    if (!had && editorCtx.range) {
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(editorCtx.range);
    }
    return true;
  }
  function cmd(name, value = null) {
    if (!focusEditor()) return;
    document.execCommand(name, false, value);
    afterChange();
  }
  function fmtBlock(tag) {
    if (!focusEditor()) return;
    const cur = currentBlockTag();
    document.execCommand('formatBlock', false, cur === tag && tag !== 'p' ? 'p' : tag);
    afterChange();
  }
  function currentBlock() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    let n = sel.anchorNode;
    const ed = editor();
    while (n && n !== ed) {
      if (n.nodeType === 1 && /^(P|H1|H2|H3|BLOCKQUOTE|PRE|LI|DIV|TD|TH)$/.test(n.tagName)) return n;
      n = n.parentNode;
    }
    return null;
  }
  function currentBlockTag() {
    const b = currentBlock();
    if (!b) return 'p';
    const t = b.tagName.toLowerCase();
    return t === 'div' || t === 'li' || t === 'td' || t === 'th' ? 'p' : t;
  }
  function saveSelection() {
    const sel = getSelection();
    const ed = editor();
    if (ed && sel.rangeCount && ed.contains(sel.getRangeAt(0).commonAncestorContainer)) editorCtx.range = sel.getRangeAt(0).cloneRange();
  }
  function insertHtmlAtCursor(html) {
    if (!focusEditor()) return;
    document.execCommand('insertHTML', false, html);
    afterChange();
  }
  function insertChecklist() {
    const b = currentBlock();
    const text = b && b.tagName !== 'LI' ? b.innerHTML : '<br>';
    if (b && b.parentNode === editor() && !/^(TD|TH|LI)$/.test(b.tagName)) {
      const ul = h('ul', { class: 'pj-check' });
      const li = h('li', { 'data-checked': 'false' });
      li.innerHTML = text || '<br>';
      ul.append(li);
      b.replaceWith(ul);
      placeCaretEnd(li);
      afterChange();
    } else {
      insertHtmlAtCursor('<ul class="pj-check"><li data-checked="false"><br></li></ul>');
    }
  }
  function insertCallout() {
    insertHtmlAtCursor('<div class="pj-callout">💡 </div><p><br></p>');
  }
  function insertTable(rows, cols) {
    const tr = Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: cols }, () => (r === 0 ? '<td><b><br></b></td>' : '<td><br></td>')).join('')}</tr>`).join('');
    insertHtmlAtCursor(`<table class="pj-table"><tbody>${tr}</tbody></table><p><br></p>`);
  }
  function placeCaretEnd(node) {
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // 표 안에 있을 때 행·열 조작
  function tableCtx() {
    const b = currentBlock();
    let n = b;
    while (n && n !== editor() && n.tagName !== 'TD' && n.tagName !== 'TH') n = n.parentNode;
    if (!n || n === editor()) return null;
    const tr = n.parentNode;
    const table = tr.closest('table');
    return { cell: n, tr, table, col: [...tr.children].indexOf(n) };
  }
  function tableOp(op) {
    const t = tableCtx();
    if (!t) { U.toast('표 안의 칸을 먼저 눌러 주세요.'); return; }
    const rows = [...t.table.querySelectorAll('tr')];
    if (op === 'rowBelow' || op === 'rowAbove') {
      const nr = document.createElement('tr');
      for (let i = 0; i < t.tr.children.length; i++) nr.append(h('td', null, h('br')));
      t.tr.parentNode.insertBefore(nr, op === 'rowBelow' ? t.tr.nextSibling : t.tr);
    } else if (op === 'colRight' || op === 'colLeft') {
      rows.forEach(r => { const ref = r.children[t.col]; const c = h('td', null, h('br')); if (!ref) r.append(c); else r.insertBefore(c, op === 'colRight' ? ref.nextSibling : ref); });
    } else if (op === 'delRow') {
      if (rows.length <= 1) { t.table.remove(); } else t.tr.remove();
    } else if (op === 'delCol') {
      if (t.tr.children.length <= 1) t.table.remove();
      else rows.forEach(r => { if (r.children[t.col]) r.children[t.col].remove(); });
    } else if (op === 'delTable') {
      t.table.remove();
    }
    afterChange();
  }

  /* 그림 */
  function pickImage() {
    saveSelection();
    const input = h('input', { type: 'file', accept: 'image/*', multiple: true });
    input.addEventListener('change', () => insertImages([...input.files]));
    input.click();
  }
  async function insertImages(files) {
    for (const f of files.slice(0, 10)) {
      try {
        const blob = await shrinkImage(f);
        const id = uid('img');
        await putImage(id, blob);
        const url = URL.createObjectURL(blob);
        editorCtx.urls.push(url);
        insertHtmlAtCursor(`<img data-pimg="${id}" src="${url}" alt="${esc(f.name.replace(/\.[^.]+$/, ''))}"><p><br></p>`);
      } catch (err) { U.toast(err.message || '그림을 넣지 못했어요.'); }
    }
  }
  async function hydrateImages(container) {
    for (const img of container.querySelectorAll('img[data-pimg]')) {
      if (img.getAttribute('src')) continue;
      const blob = await getImage(img.getAttribute('data-pimg'));
      if (blob) {
        const u = URL.createObjectURL(blob);
        if (editorCtx) editorCtx.urls.push(u);
        img.src = u;
      } else {
        img.classList.add('is-missing');
        img.alt = '그림은 넣은 기기에서만 보여요';
      }
    }
  }
  function applyImageWidths(container) {
    container.querySelectorAll('img[data-w]').forEach(img => { img.style.width = img.getAttribute('data-w') + '%'; });
  }

  /* 저장 */
  function serialize() {
    const clone = editor().cloneNode(true);
    clone.querySelectorAll('img[data-pimg]').forEach(img => { img.removeAttribute('src'); img.removeAttribute('class'); img.removeAttribute('style'); });
    clone.querySelectorAll('img:not([data-pimg])').forEach(img => { img.removeAttribute('style'); });
    clone.querySelectorAll('.pj-find-hit').forEach(s => s.replaceWith(...s.childNodes));
    return sanitize(clone.innerHTML);
  }
  function textStats() {
    const text = (editor().innerText || '').replace(/​/g, '');
    const chars = text.replace(/\s/g, '').length;
    const words = (text.trim().match(/\S+/g) || []).length;
    return { chars, words, minutes: Math.max(1, Math.round(chars / 500)) };
  }
  function afterChange() {
    if (!editorCtx) return;
    editorCtx.dirty = true;
    setSaveState('saving');
    clearTimeout(editorCtx.saveTimer);
    editorCtx.saveTimer = setTimeout(flush, 700);
    clearTimeout(editorCtx.outlineTimer);
    editorCtx.outlineTimer = setTimeout(() => { drawOutline(); drawStatus(); }, 250);
  }
  function flush() {
    if (!editorCtx || !editorCtx.dirty) return;
    const d = docById(editorCtx.docId);
    if (!d) return;
    clearTimeout(editorCtx.saveTimer);
    const html = serialize();
    const s = textStats();
    d.html = html;
    d.chars = s.chars;
    d.updatedAt = Date.now();
    touch(d.projectId);
    editorCtx.dirty = false;
    const ok = save();
    setSaveState(ok ? 'saved' : 'error');
    if (Date.now() - editorCtx.lastVersion > VERSION_EVERY) snapshot('자동 저장');
  }
  function setSaveState(st) {
    const el = editorCtx && editorCtx.saveEl;
    if (!el) return;
    el.className = 'pj-save is-' + st;
    el.textContent = st === 'saving' ? '저장 중…' : st === 'error' ? '저장 실패' : `저장됨 ${clock(Date.now())}`;
  }
  async function snapshot(label) {
    if (!editorCtx) return;
    const d = docById(editorCtx.docId);
    if (!d) return;
    editorCtx.lastVersion = Date.now();
    const list = await getVersions(d.id);
    if (list.length && list[0].html === d.html) return;
    list.unshift({ at: Date.now(), title: d.title, html: d.html, chars: d.chars, label });
    await setVersions(d.id, list.slice(0, MAX_VERSIONS));
  }

  /* 개요·상태줄 */
  function drawOutline() {
    if (!editorCtx || !editorCtx.outlineEl) return;
    const heads = [...editor().querySelectorAll('h1, h2, h3')].filter(x => x.textContent.trim());
    editorCtx.outlineEl.replaceChildren(heads.length
      ? h('ul', { class: 'pj-outline-list' }, heads.map(x => h('li', { class: 'pj-outline-' + x.tagName.toLowerCase() },
        h('button', { type: 'button', onclick: () => { x.scrollIntoView({ behavior: 'smooth', block: 'center' }); x.classList.add('pj-flash'); setTimeout(() => x.classList.remove('pj-flash'), 1200); } }, x.textContent.trim().slice(0, 60)))))
      : h('p', { class: 'pj-outline-empty' }, '제목 1·2·3을 쓰면 여기에 목차가 생겨요.'));
  }
  function drawStatus() {
    if (!editorCtx || !editorCtx.statusEl) return;
    const d = docById(editorCtx.docId);
    const s = textStats();
    const goal = d.goal;
    const pct = goal ? Math.min(100, Math.round(s.chars / goal * 100)) : 0;
    setKids(editorCtx.statusEl,
      h('span', null, `글자 ${s.chars.toLocaleString()}자`), h('span', { class: 'pj-dot' }, '·'),
      h('span', null, `단어 ${s.words.toLocaleString()}개`), h('span', { class: 'pj-dot' }, '·'),
      h('span', null, `읽는 시간 약 ${s.minutes}분`),
      h('span', { class: 'sp-spacer' }),
      h('button', { type: 'button', class: 'pj-goal-btn', onclick: setGoal }, goal ? `목표 ${goal.toLocaleString()}자` : '🎯 글자 수 목표 정하기'),
      goal > 0 && h('span', { class: 'pj-goal-track', title: `${pct}%` }, h('span', { class: 'pj-goal-fill' + (pct >= 100 ? ' is-done' : ''), style: { width: pct + '%' } })),
      goal > 0 && h('span', { class: 'pj-goal-pct' }, pct >= 100 ? '🎉 달성!' : `${pct}%`));
  }
  function setGoal() {
    const d = docById(editorCtx.docId);
    const m = U.modal('글자 수 목표');
    const input = h('input', { type: 'number', class: 'sp-input', min: 0, max: 200000, step: 100, value: d.goal || '', placeholder: '예: 2000', 'aria-label': '목표 글자 수' });
    const ok = () => { d.goal = Math.max(0, Math.min(200000, parseInt(input.value, 10) || 0)); save(); drawStatus(); m.close(); };
    m.setBody(h('form', { class: 'sp-form', onsubmit: e => { e.preventDefault(); ok(); } }, U.field('목표 글자 수 (공백 빼고)', input, '0으로 두면 목표를 지워요.')));
    m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'), h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: ok }, '정하기'));
  }

  /* 툴바 */
  function tb(iconHtml, label, onClick, extraCls = '', key) {
    return h('button', {
      type: 'button', class: 'pj-tb ' + extraCls, title: label + (key ? ` (${key})` : ''), 'aria-label': label,
      onmousedown: e => e.preventDefault(), onclick: onClick, html: iconHtml,
    });
  }
  const T = s => `<span class="pj-tb-txt">${s}</span>`;
  const I = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${{
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    ul: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    ol: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 4h1v4M4 10.5h2L4 14h2M4 16.5h2v4H4"/>',
    check: '<rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 7 1.2 1.2L8 5.8"/><path d="M12 7h9"/><rect x="3" y="14" width="6" height="6" rx="1"/><path d="M12 17h9"/>',
    left: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    center: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    right: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    justify: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
    indent: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3 9 3 3-3 3"/>',
    outdent: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="M6 9l-3 3 3 3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
    hr: '<path d="M3 12h18"/>',
    callout: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h8M8 14h5"/>',
    clear: '<path d="M6 4h12M10 4 8 20M14 4l-1 6"/><path d="m15 15 6 6M21 15l-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    color: '<path d="m6 19 6-15 6 15M8.5 13h7"/>',
    hl: '<path d="m9 11 6-6 4 4-6 6"/><path d="m9 11-4 4v3h3l5-5"/><path d="M14 21h7"/>',
  }[name] || ''}</svg>`;

  function colorMenu(anchor, kind) {
    saveSelection();
    const colors = kind === 'fore' ? TEXT_COLORS : HL_COLORS;
    U.popover(anchor, h('div', { class: 'pj-colors' },
      h('div', { class: 'pj-colors-grid' }, colors.map(c => h('button', { type: 'button', class: 'pj-color', style: { background: c }, 'aria-label': c, onmousedown: e => e.preventDefault(), onclick: () => {
        U.closePopover();
        document.execCommand('styleWithCSS', false, true);
        cmd(kind === 'fore' ? 'foreColor' : 'hiliteColor', c);
      } }))),
      h('button', { type: 'button', class: 'pj-color-none', onmousedown: e => e.preventDefault(), onclick: () => {
        U.closePopover();
        document.execCommand('styleWithCSS', false, true);
        cmd(kind === 'fore' ? 'foreColor' : 'hiliteColor', kind === 'fore' ? '#1B2740' : 'transparent');
      } }, kind === 'fore' ? '기본 색' : '형광펜 지우기')));
  }
  function tableMenu(anchor) {
    saveSelection();
    if (tableCtx()) {
      U.menu(anchor, [
        { label: '위에 행 넣기', onClick: () => tableOp('rowAbove') }, { label: '아래에 행 넣기', onClick: () => tableOp('rowBelow') },
        { label: '왼쪽에 열 넣기', onClick: () => tableOp('colLeft') }, { label: '오른쪽에 열 넣기', onClick: () => tableOp('colRight') },
        '-', { label: '이 행 지우기', onClick: () => tableOp('delRow') }, { label: '이 열 지우기', onClick: () => tableOp('delCol') },
        { label: '표 지우기', danger: true, onClick: () => tableOp('delTable') },
      ]);
      return;
    }
    const label = h('p', { class: 'pj-grid-label' }, '표 크기 고르기');
    const grid = h('div', { class: 'pj-grid-pick' });
    for (let r = 1; r <= 6; r++) for (let c = 1; c <= 6; c++) {
      grid.append(h('button', {
        type: 'button', class: 'pj-grid-cell', 'aria-label': `${r}행 ${c}열`, 'data-r': r, 'data-c': c,
        onmouseenter: () => { label.textContent = `${r} × ${c}`; grid.querySelectorAll('.pj-grid-cell').forEach(x => x.classList.toggle('is-on', +x.dataset.r <= r && +x.dataset.c <= c)); },
        onmousedown: e => e.preventDefault(),
        onclick: () => { U.closePopover(); insertTable(r, c); },
      }));
    }
    U.popover(anchor, h('div', { class: 'pj-grid-wrap' }, label, grid));
  }
  function linkDialog() {
    saveSelection();
    const sel = getSelection();
    const selected = sel.toString();
    const m = U.modal('링크 넣기');
    const url = h('input', { type: 'url', class: 'sp-input', placeholder: 'https://', 'aria-label': '주소' });
    const text = h('input', { type: 'text', class: 'sp-input', value: selected, placeholder: '보여 줄 글자 (비우면 주소)', 'aria-label': '보여 줄 글자' });
    const error = h('p', { class: 'sp-form-error', role: 'alert' });
    const ok = () => {
      let v = url.value.trim();
      if (!v) { error.textContent = '주소를 적어 주세요.'; return; }
      if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
      if (!/^https?:/i.test(v)) { error.textContent = 'http 또는 https 주소만 넣을 수 있어요.'; return; }
      m.close();
      const t = text.value.trim() || v;
      insertHtmlAtCursor(`<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>&nbsp;`);
    };
    m.setBody(h('form', { class: 'sp-form', novalidate: true, onsubmit: e => { e.preventDefault(); ok(); } }, U.field('주소', url), U.field('보여 줄 글자', text), error));
    m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn', onclick: () => m.close() }, '취소'), h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: ok }, '넣기'));
  }

  function buildToolbar() {
    const blockSel = h('select', { class: 'pj-block-select', 'aria-label': '문단 모양', onmousedown: () => saveSelection(), onchange: e => { fmtBlock(e.target.value); } },
      BLOCKS.map(b => h('option', { value: b.tag }, b.label)));
    const sep = () => h('span', { class: 'pj-tb-sep', 'aria-hidden': 'true' });
    const bar = h('div', { class: 'pj-toolbar', role: 'toolbar', 'aria-label': '서식' },
      tb(I('undo'), '되돌리기', () => cmd('undo'), '', 'Ctrl+Z'),
      tb(I('redo'), '다시 하기', () => cmd('redo'), '', 'Ctrl+Y'),
      sep(), blockSel, sep(),
      tb(T('<b>B</b>'), '굵게', () => cmd('bold'), 'js-bold', 'Ctrl+B'),
      tb(T('<i>I</i>'), '기울임', () => cmd('italic'), 'js-italic', 'Ctrl+I'),
      tb(T('<u>U</u>'), '밑줄', () => cmd('underline'), 'js-underline', 'Ctrl+U'),
      tb(T('<s>S</s>'), '취소선', () => cmd('strikeThrough'), 'js-strike'),
      tb(I('color'), '글자 색', e => colorMenu(e.currentTarget, 'fore')),
      tb(I('hl'), '형광펜', e => colorMenu(e.currentTarget, 'hl')),
      sep(),
      tb(I('ul'), '글머리 목록', () => cmd('insertUnorderedList'), 'js-ul'),
      tb(I('ol'), '번호 목록', () => cmd('insertOrderedList'), 'js-ol'),
      tb(I('check'), '체크리스트', () => insertChecklist()),
      tb(I('outdent'), '내어쓰기', () => cmd('outdent')),
      tb(I('indent'), '들여쓰기', () => cmd('indent')),
      sep(),
      tb(I('left'), '왼쪽 정렬', () => cmd('justifyLeft'), 'js-left'),
      tb(I('center'), '가운데 정렬', () => cmd('justifyCenter'), 'js-center'),
      tb(I('right'), '오른쪽 정렬', () => cmd('justifyRight'), 'js-right'),
      tb(I('justify'), '양쪽 정렬', () => cmd('justifyFull'), 'js-justify'),
      sep(),
      tb(I('link'), '링크', linkDialog, '', 'Ctrl+K'),
      tb(I('image'), '그림', pickImage),
      tb(I('table'), '표', e => tableMenu(e.currentTarget)),
      tb(I('callout'), '강조 상자', insertCallout),
      tb(I('hr'), '구분선', () => cmd('insertHorizontalRule')),
      tb(I('clear'), '서식 지우기', () => { cmd('removeFormat'); fmtBlock('p'); }),
      sep(),
      tb(I('search'), '찾기·바꾸기', toggleFind, '', 'Ctrl+F'));
    editorCtx.blockSel = blockSel;
    editorCtx.toolbar = bar;
    return bar;
  }
  function syncToolbar() {
    if (!editorCtx || !editorCtx.toolbar) return;
    const sel = getSelection();
    if (!sel.rangeCount || !editor().contains(sel.anchorNode)) return;
    const st = (cls, on) => { const b = editorCtx.toolbar.querySelector('.' + cls); if (b) b.classList.toggle('is-on', !!on); };
    const q = n => { try { return document.queryCommandState(n); } catch { return false; } };
    st('js-bold', q('bold')); st('js-italic', q('italic')); st('js-underline', q('underline')); st('js-strike', q('strikeThrough'));
    st('js-ul', q('insertUnorderedList')); st('js-ol', q('insertOrderedList'));
    st('js-left', q('justifyLeft')); st('js-center', q('justifyCenter')); st('js-right', q('justifyRight')); st('js-justify', q('justifyFull'));
    const tag = currentBlockTag();
    if (editorCtx.blockSel && editorCtx.blockSel.value !== tag) editorCtx.blockSel.value = BLOCKS.some(b => b.tag === tag) ? tag : 'p';
  }

  /* 찾기·바꾸기 (한 덩어리 글 안에서 찾음) */
  function toggleFind() {
    const panel = editorCtx.findEl;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { const s = getSelection().toString(); const q = panel.querySelector('.js-find'); if (s && s.length < 60) q.value = s; q.focus(); q.select(); updateFindCount(); }
    else clearHits();
  }
  function textNodes() {
    const w = document.createTreeWalker(editor(), NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function clearHits() { if (window.CSS && CSS.highlights) CSS.highlights.delete('pj-find'); }
  function findRanges(q) {
    if (!q) return [];
    const ranges = [];
    const lq = q.toLowerCase();
    for (const n of textNodes()) {
      const t = n.nodeValue.toLowerCase();
      let i = t.indexOf(lq);
      while (i !== -1) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + q.length); ranges.push(r); i = t.indexOf(lq, i + q.length); }
    }
    return ranges;
  }
  function updateFindCount() {
    const panel = editorCtx.findEl;
    const q = panel.querySelector('.js-find').value;
    const ranges = findRanges(q);
    panel.querySelector('.js-count').textContent = q ? `${ranges.length}개` : '';
    clearHits();
    if (window.CSS && CSS.highlights && typeof Highlight === 'function' && ranges.length) CSS.highlights.set('pj-find', new Highlight(...ranges));
    return ranges;
  }
  function findNext() {
    const ranges = updateFindCount();
    if (!ranges.length) return;
    const sel = getSelection();
    let idx = 0;
    if (sel.rangeCount) {
      const cur = sel.getRangeAt(0);
      idx = ranges.findIndex(r => r.compareBoundaryPoints(Range.START_TO_START, cur) > 0);
      if (idx === -1) idx = 0;
    }
    sel.removeAllRanges();
    sel.addRange(ranges[idx]);
    const rect = ranges[idx].getBoundingClientRect();
    const node = ranges[idx].startContainer.parentElement;
    if (node && (rect.top < 80 || rect.bottom > innerHeight - 40)) node.scrollIntoView({ block: 'center' });
  }
  function replaceOne() {
    const panel = editorCtx.findEl;
    const q = panel.querySelector('.js-find').value;
    const r = panel.querySelector('.js-replace').value;
    const sel = getSelection();
    if (q && sel.rangeCount && sel.toString().toLowerCase() === q.toLowerCase() && editor().contains(sel.anchorNode)) {
      document.execCommand('insertText', false, r);
      afterChange();
    }
    findNext();
  }
  function replaceAll() {
    const panel = editorCtx.findEl;
    const q = panel.querySelector('.js-find').value;
    const r = panel.querySelector('.js-replace').value;
    if (!q) return;
    const ranges = findRanges(q);
    for (let i = ranges.length - 1; i >= 0; i--) { ranges[i].deleteContents(); if (r) ranges[i].insertNode(document.createTextNode(r)); }
    editor().normalize();
    afterChange();
    updateFindCount();
    U.toast(`${ranges.length}곳을 바꿨어요.`);
  }

  /* / 명령 메뉴 */
  function slashState() {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return null;
    const node = sel.anchorNode;
    if (!node || node.nodeType !== 3 || !editor().contains(node)) return null;
    const before = node.nodeValue.slice(0, sel.anchorOffset);
    const m = before.match(/(^|\s)\/([^\s/]{0,12})$/);
    if (!m) return null;
    return { node, start: sel.anchorOffset - m[2].length - 1, end: sel.anchorOffset, query: m[2].toLowerCase() };
  }
  function openSlash() {
    const s = slashState();
    if (!s) { closeSlash(); return; }
    const items = SLASH.filter(it => !s.query || it.label.toLowerCase().includes(s.query) || it.keys.includes(s.query));
    if (!items.length) { closeSlash(); return; }
    const r = document.createRange(); r.setStart(s.node, s.start); r.setEnd(s.node, s.end);
    const rect = r.getBoundingClientRect();
    let menu = editorCtx.slashEl;
    if (!menu) { menu = h('div', { class: 'pj-slash', role: 'listbox' }); document.body.append(menu); editorCtx.slashEl = menu; }
    editorCtx.slash = { ...s, items, index: Math.min(editorCtx.slash ? editorCtx.slash.index : 0, items.length - 1) };
    drawSlash();
    const top = Math.min(rect.bottom + 6, innerHeight - menu.offsetHeight - 8);
    menu.style.left = Math.min(rect.left, innerWidth - 260) + 'px';
    menu.style.top = (top < rect.bottom ? rect.top - menu.offsetHeight - 6 : top) + 'px';
  }
  function drawSlash() {
    const { items, index } = editorCtx.slash;
    editorCtx.slashEl.replaceChildren(h('p', { class: 'pj-slash-head' }, '넣을 블록'), ...items.map((it, i) => h('button', {
      type: 'button', role: 'option', 'aria-selected': String(i === index), class: 'pj-slash-item' + (i === index ? ' is-on' : ''),
      onmousedown: e => { e.preventDefault(); runSlash(i); },
    }, h('span', { class: 'pj-slash-label' }, it.label), h('span', { class: 'pj-slash-hint' }, it.hint))));
  }
  function runSlash(i) {
    const s = editorCtx.slash;
    if (!s) return;
    const it = s.items[i];
    const r = document.createRange(); r.setStart(s.node, s.start); r.setEnd(s.node, Math.min(s.end, s.node.nodeValue.length));
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete');
    closeSlash();
    saveSelection();
    it.run();
  }
  function closeSlash() {
    if (editorCtx && editorCtx.slashEl) { editorCtx.slashEl.remove(); editorCtx.slashEl = null; }
    if (editorCtx) editorCtx.slash = null;
  }

  // 마크다운처럼 입력: "# ", "## ", "- ", "1. ", "[] ", "> " 를 문단 맨 앞에 쓰면 바로 바뀜
  function markdownShortcut(e) {
    if (e.key !== ' ') return false;
    const sel = getSelection();
    if (!sel.isCollapsed) return false;
    const block = currentBlock();
    if (!block || /^(LI|TD|TH|PRE)$/.test(block.tagName)) return false;
    const r = document.createRange();
    r.selectNodeContents(block);
    r.setEnd(sel.anchorNode, sel.anchorOffset);
    const before = r.toString();
    const map = { '#': () => fmtBlock('h1'), '##': () => fmtBlock('h2'), '###': () => fmtBlock('h3'), '-': () => cmd('insertUnorderedList'), '*': () => cmd('insertUnorderedList'), '1.': () => cmd('insertOrderedList'), '[]': () => insertChecklist(), '>': () => fmtBlock('blockquote'), '```': () => fmtBlock('pre') };
    if (!map[before]) return false;
    e.preventDefault();
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('delete');
    if (!block.textContent && !block.querySelector('br')) block.append(h('br'));
    map[before]();
    return true;
  }

  function onEditorKeydown(e) {
    if (U.isComposing(e)) return;
    if (editorCtx.slash) {
      const s = editorCtx.slash;
      if (e.key === 'ArrowDown') { e.preventDefault(); s.index = (s.index + 1) % s.items.length; drawSlash(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); s.index = (s.index - 1 + s.items.length) % s.items.length; drawSlash(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); runSlash(s.index); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSlash(); return; }
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); linkDialog(); return; }
    if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFind(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flush(); snapshot('직접 저장'); U.toast('저장했어요. 버전 기록에도 남겼어요.'); return; }
    if (mod && e.altKey && /^[123]$/.test(e.key)) { e.preventDefault(); fmtBlock('h' + e.key); return; }
    if (mod && e.altKey && e.key === '0') { e.preventDefault(); fmtBlock('p'); return; }
    if (e.key === 'Tab') {
      const t = tableCtx();
      if (t) {
        e.preventDefault();
        const cells = [...t.table.querySelectorAll('td, th')];
        const i = cells.indexOf(t.cell) + (e.shiftKey ? -1 : 1);
        if (i >= cells.length) { tableOp('rowBelow'); placeCaretEnd([...t.table.querySelectorAll('td, th')][i]); }
        else if (i >= 0) placeCaretEnd(cells[i]);
        return;
      }
      e.preventDefault();
      cmd(e.shiftKey ? 'outdent' : 'indent');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const b = currentBlock();
      // 체크리스트에서 새 줄은 체크 안 된 상태로 시작
      if (b && b.tagName === 'LI' && b.parentNode.classList.contains('pj-check')) {
        setTimeout(() => { const nb = currentBlock(); if (nb && nb.tagName === 'LI' && nb !== b) nb.setAttribute('data-checked', 'false'); afterChange(); });
      }
      // 강조 상자 안에서 Enter는 상자 밖 새 문단으로
      if (b && b.classList && b.classList.contains('pj-callout') && !e.shiftKey) {
        const sel = getSelection();
        const r = document.createRange(); r.selectNodeContents(b); r.setStart(sel.anchorNode, sel.anchorOffset);
        if (!r.toString().trim()) { e.preventDefault(); const p = h('p', null, h('br')); b.after(p); placeCaretEnd(p); afterChange(); return; }
      }
    }
    markdownShortcut(e);
  }

  function onEditorClick(e) {
    const li = e.target.closest && e.target.closest('ul.pj-check > li');
    if (li && editor().contains(li)) {
      const rect = li.getBoundingClientRect();
      if (e.clientX < rect.left + 4) {
        li.setAttribute('data-checked', li.getAttribute('data-checked') === 'true' ? 'false' : 'true');
        afterChange();
      }
    }
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
    const img = e.target.tagName === 'IMG' ? e.target : null;
    if (img) imageMenu(img);
  }
  function imageMenu(img) {
    U.menu(img, [
      { label: '작게 (40%)', onClick: () => { img.setAttribute('data-w', '40'); img.style.width = '40%'; afterChange(); } },
      { label: '중간 (70%)', onClick: () => { img.setAttribute('data-w', '70'); img.style.width = '70%'; afterChange(); } },
      { label: '꽉 차게 (100%)', onClick: () => { img.setAttribute('data-w', '100'); img.style.width = '100%'; afterChange(); } },
      { label: '설명 글 바꾸기', onClick: () => {
        const m = U.modal('그림 설명');
        const input = h('input', { type: 'text', class: 'sp-input', value: img.alt, maxlength: 200, 'aria-label': '그림 설명' });
        const ok = () => { img.alt = input.value.trim(); afterChange(); m.close(); };
        m.setBody(h('form', { class: 'sp-form', onsubmit: e => { e.preventDefault(); ok(); } }, U.field('설명 (화면 낭독·docx에 쓰여요)', input)));
        m.setFooter(h('span', { class: 'sp-spacer' }), h('button', { type: 'button', class: 'sp-btn sp-btn-primary', onclick: ok }, '저장'));
      } },
      '-',
      { label: '그림 지우기', danger: true, onClick: () => { img.remove(); afterChange(); } },
    ]);
  }

  async function onPaste(e) {
    const cd = e.clipboardData;
    if (!cd) return;
    const files = [...cd.files].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); saveSelection(); await insertImages(files); return; }
    const html = cd.getData('text/html');
    e.preventDefault();
    if (html) {
      document.execCommand('insertHTML', false, sanitize(html.replace(/<!--[\s\S]*?-->/g, '')));
    } else {
      const text = cd.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
    afterChange();
  }
  function onDrop(e) {
    const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const pos = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
    if (pos) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(pos); }
    saveSelection();
    insertImages(files);
  }

  /* 버전 기록 */
  async function openVersions() {
    flush();
    const d = docById(editorCtx.docId);
    const list = await getVersions(d.id);
    const m = U.modal('버전 기록');
    m.setBody(
      h('p', { class: 'sp-modal-text sp-muted' }, '5분마다, 그리고 Ctrl+S를 누를 때 이 기기에 버전이 남아요. 최근 30개까지 보관해요.'),
      h('button', { type: 'button', class: 'sp-btn', onclick: async () => { await snapshot('직접 저장'); m.close(); openVersions(); } }, U.icon('plus'), '지금 버전 남기기'),
      list.length ? h('ul', { class: 'pj-version-list' }, list.map((v, i) => h('li', { class: 'pj-version' },
        h('div', { class: 'pj-version-text' }, h('span', { class: 'pj-version-time' }, fullTime(v.at)), h('span', { class: 'pj-version-sub' }, `${v.label || ''} · ${(v.chars || 0).toLocaleString()}자`)),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: () => previewVersion(v) }, '미리 보기'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: async () => {
          if (!await U.confirmBox(`${fullTime(v.at)} 버전으로 되돌릴까요? 지금 내용은 버전 기록에 먼저 남겨 둘게요.`, { title: '버전 되돌리기', ok: '되돌리기' })) return;
          await snapshot('되돌리기 전');
          editor().innerHTML = sanitize(v.html);
          applyImageWidths(editor());
          await hydrateImages(editor());
          afterChange(); flush();
          m.close();
          U.toast('그 버전으로 되돌렸어요.');
        } }, '되돌리기')))) : h('p', { class: 'sp-empty' }, '아직 남은 버전이 없어요.'));
  }
  async function previewVersion(v) {
    const m = U.modal(`${fullTime(v.at)} 버전`);
    const box = h('div', { class: 'pj-paper pj-paper-preview' });
    box.innerHTML = sanitize(v.html);
    applyImageWidths(box);
    m.setBody(box);
    await hydrateImages(box);
  }

  /* 집중 모드 */
  function toggleFocus(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('pj-focus-mode');
    document.body.classList.toggle('pj-focus-mode', on);
    if (on) U.toast('집중 모드예요. Esc 를 누르면 나가요.');
    editor().focus();
  }

  /* ---------- AI 도우미 패널 ---------- */
  function selectionText() {
    const sel = getSelection();
    if (sel.rangeCount && editor().contains(sel.anchorNode)) return sel.toString().trim();
    if (editorCtx.range && !editorCtx.range.collapsed) return editorCtx.range.toString().trim();
    return '';
  }
  function docText(max = 12000) { return (editor().innerText || '').trim().slice(0, max); }

  function buildAiPanel() {
    const log = h('div', { class: 'pj-ai-log', 'aria-live': 'polite' });
    const input = U.autosize(h('textarea', { class: 'sp-input pj-ai-input', rows: 1, maxlength: 2000, placeholder: '문서에 대해 물어보거나 부탁해요', 'aria-label': 'AI에게 보낼 말' }));
    const send = () => { const t = input.value.trim(); if (!t) return; input.value = ''; input.dispatchEvent(new Event('input')); chat(t); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !U.isComposing(e)) { e.preventDefault(); send(); } });
    const panel = h('aside', { class: 'pj-ai', 'aria-label': 'AI 도우미' },
      h('div', { class: 'pj-ai-head' },
        h('span', { class: 'pj-ai-orb', 'aria-hidden': 'true' }),
        h('div', null, h('p', { class: 'pj-ai-title' }, 'AI 도우미'), h('p', { class: 'pj-ai-sub' }, '글을 고르면 그 부분만, 안 고르면 문서 전체를 봐요')),
        U.iconBtn('x', 'AI 도우미 닫기', () => toggleAi(false))),
      h('div', { class: 'pj-ai-actions' }, AI_ACTIONS.map(a => h('button', { type: 'button', class: 'pj-ai-chip', onmousedown: e => { e.preventDefault(); saveSelection(); }, onclick: () => runAiAction(a.id) }, a.label))),
      log,
      h('div', { class: 'pj-ai-compose' }, input, h('button', { type: 'button', class: 'sp-btn sp-btn-primary pj-ai-send', onmousedown: e => { e.preventDefault(); saveSelection(); }, onclick: send, 'aria-label': '보내기' }, '보내기')));
    editorCtx.aiLog = log;
    editorCtx.aiMessages = [];
    aiWelcome();
    return panel;
  }
  function aiWelcome() {
    editorCtx.aiLog.replaceChildren(h('div', { class: 'pj-ai-msg is-ai' },
      h('p', null, '안녕하세요! 이 문서를 같이 다듬어 볼게요. 위의 버튼을 누르거나 이렇게 물어보세요.'),
      h('ul', null, ['이 글에서 빠진 내용이 뭘까?', '결론을 더 설득력 있게 써 줘', '이 실험의 변인을 정리해 줘'].map(q => h('li', null, h('button', { type: 'button', class: 'pj-ai-suggest', onclick: () => chat(q) }, q))))));
  }
  function toggleAi(force) {
    const on = typeof force === 'boolean' ? force : !editorCtx.shell.classList.contains('has-ai');
    editorCtx.shell.classList.toggle('has-ai', on);
    ui.ai = on; saveUi();
  }
  function aiBubble(role, content) {
    const el = h('div', { class: 'pj-ai-msg ' + (role === 'user' ? 'is-user' : 'is-ai') }, content);
    editorCtx.aiLog.append(el);
    editorCtx.aiLog.scrollTop = editorCtx.aiLog.scrollHeight;
    return el;
  }
  function aiResult(text, { canReplace }) {
    const box = h('div', null,
      h('div', { class: 'pj-ai-answer' }, ...text.split('\n').map(line => h('p', null, line || ' '))),
      h('div', { class: 'pj-ai-use' },
        canReplace && h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-primary', onmousedown: e => e.preventDefault(), onclick: () => {
          if (!editorCtx.range || editorCtx.range.collapsed) { U.toast('바꿀 부분을 먼저 골라 주세요.'); return; }
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(editorCtx.range);
          editor().focus();
          document.execCommand('insertHTML', false, sanitize(textToHtml(text)));
          afterChange(); U.toast('고른 부분을 바꿨어요.');
        } }, '고른 부분 바꾸기'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onmousedown: e => e.preventDefault(), onclick: () => {
          if (editorCtx.range) { const r = editorCtx.range.cloneRange(); r.collapse(false); editorCtx.range = r; }
          insertHtmlAtCursor(sanitize(textToHtml(text)));
          U.toast('문서에 넣었어요.');
        } }, '문서에 넣기'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(text).then(() => U.toast('복사했어요.'), () => U.toast('복사하지 못했어요.')); } }, '복사')));
    return box;
  }
  async function aiRun(userLabel, messages, opts) {
    if (!editorCtx.shell.classList.contains('has-ai')) toggleAi(true);
    aiBubble('user', h('p', null, userLabel));
    const wait = aiBubble('ai', h('p', { class: 'pj-ai-typing' }, h('span'), h('span'), h('span')));
    try {
      const text = await askAI(messages);
      wait.replaceChildren(aiResult(text, opts));
      return text;
    } catch (err) {
      setKids(wait, h('p', { class: 'pj-ai-err' }, err.message),
        err.noKey && h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: () => { if (typeof showSettingsModal === 'function') showSettingsModal(); } }, '설정 열기'));
      return null;
    } finally {
      editorCtx.aiLog.scrollTop = editorCtx.aiLog.scrollHeight;
    }
  }
  function runAiAction(id) {
    const a = AI_ACTIONS.find(x => x.id === id);
    const sel = selectionText();
    const target = sel || docText();
    if (!target) { U.toast('먼저 글을 조금 써 주세요.'); return; }
    const d = docById(editorCtx.docId);
    aiRun(`${a.label} · ${sel ? '고른 부분' : '문서 전체'}`, [
      { role: 'system', content: AI_SYSTEM },
      { role: 'user', content: `${a.prompt}\n\n문서 제목: ${d.title}\n---\n${target}` },
    ], { canReplace: !!sel && id !== 'quiz' && id !== 'outline' && id !== 'continue' });
  }
  async function chat(text) {
    const d = docById(editorCtx.docId);
    const sel = selectionText();
    editorCtx.aiMessages.push({ role: 'user', content: text });
    const context = `문서 제목: ${d.title}\n${sel ? `학생이 고른 부분:\n${sel.slice(0, 4000)}\n\n` : ''}문서 내용(일부일 수 있음):\n${docText(9000)}`;
    const answer = await aiRun(text, [
      { role: 'system', content: AI_SYSTEM + '\n\n' + context },
      ...editorCtx.aiMessages.slice(-8),
    ], { canReplace: !!sel });
    if (answer) editorCtx.aiMessages.push({ role: 'assistant', content: answer });
  }

  /* ---------- 내보내기 ---------- */
  function exportMenu(anchor, docId) {
    U.menu(anchor, [
      { label: '📄 Word 문서 (.docx)', onClick: () => exportDocx(docId) },
      { label: '🖨️ 인쇄 · PDF로 저장', onClick: () => printDoc(docId) },
      { label: '📝 마크다운 (.md)', onClick: () => exportMarkdown(docId) },
    ]);
  }
  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const fileName = (title, ext) => `${(title || '문서').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || '문서'}.${ext}`;
  function docHtmlFor(docId) {
    if (editorCtx && editorCtx.docId === docId) flush();
    return docById(docId).html;
  }

  async function printDoc(docId) {
    const d = docById(docId);
    const box = document.createElement('div');
    box.innerHTML = sanitize(docHtmlFor(docId));
    for (const img of box.querySelectorAll('img[data-pimg]')) {
      const blob = await getImage(img.getAttribute('data-pimg'));
      if (blob) img.src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
      if (img.getAttribute('data-w')) img.style.width = img.getAttribute('data-w') + '%';
    }
    const w = window.open('', '_blank');
    if (!w) { U.toast('팝업이 막혀 있어요. 이 사이트의 팝업을 허용해 주세요.'); return; }
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<style>@page{size:A4;margin:20mm}body{font-family:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;color:#1B2740;line-height:1.75;font-size:11pt;word-break:keep-all}
h1{font-size:22pt;color:#18264A;margin:0 0 10pt}h2{font-size:16pt;color:#18264A;margin:18pt 0 6pt}h3{font-size:13pt;margin:14pt 0 4pt}
.doc-title{font-size:26pt;font-weight:800;color:#18264A;border-bottom:2px solid #1F3157;padding-bottom:8pt;margin-bottom:16pt}
blockquote{border-left:3px solid #8C9AB8;margin:8pt 0;padding:2pt 12pt;color:#56607A}pre{background:#F4F1EA;padding:8pt;border-radius:4pt;white-space:pre-wrap;font-family:Consolas,monospace}
table{border-collapse:collapse;width:100%;margin:8pt 0}td,th{border:1px solid #C9C2B4;padding:5pt 7pt;vertical-align:top}
img{max-width:100%}ul.pj-check{list-style:none;padding-left:4pt}ul.pj-check li::before{content:'☐ '}ul.pj-check li[data-checked=true]::before{content:'☑ '}ul.pj-check li[data-checked=true]{color:#8F94A3;text-decoration:line-through}
.pj-callout{background:#F3ECDD;border:1px solid #E1D6BE;border-radius:6pt;padding:8pt 12pt;margin:8pt 0}hr{border:0;border-top:1px solid #C9C2B4;margin:14pt 0}a{color:#2F5BA8}</style></head>
<body><div class="doc-title">${esc(d.emoji)} ${esc(d.title)}</div>${box.innerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  function exportMarkdown(docId) {
    const d = docById(docId);
    const box = document.createElement('div');
    box.innerHTML = sanitize(docHtmlFor(docId));
    const inl = n => [...n.childNodes].map(c => {
      if (c.nodeType === 3) return c.nodeValue.replace(/ /g, ' ');
      if (c.nodeType !== 1) return '';
      const t = c.tagName, inner = inl(c);
      if (t === 'B' || t === 'STRONG') return inner.trim() ? `**${inner}**` : inner;
      if (t === 'I' || t === 'EM') return inner.trim() ? `*${inner}*` : inner;
      if (t === 'S' || t === 'STRIKE' || t === 'DEL') return `~~${inner}~~`;
      if (t === 'CODE') return '`' + inner + '`';
      if (t === 'A') return `[${inner}](${c.getAttribute('href')})`;
      if (t === 'BR') return '  \n';
      if (t === 'IMG') return `![${c.alt || '그림'}](${c.getAttribute('src') || ''})`;
      return inner;
    }).join('');
    const out = [`# ${d.title}`, ''];
    const walk = (n, depth = 0) => {
      for (const c of n.children) {
        const t = c.tagName;
        if (/^H[1-3]$/.test(t)) out.push('#'.repeat(+t[1] + (t === 'H3' ? 0 : 1)) + ' ' + inl(c).trim(), '');
        else if (t === 'UL' || t === 'OL') {
          [...c.children].forEach((li, i) => {
            const mark = c.classList.contains('pj-check') ? `- [${li.getAttribute('data-checked') === 'true' ? 'x' : ' '}]` : t === 'OL' ? `${i + 1}.` : '-';
            const nested = [...li.children].filter(x => x.tagName === 'UL' || x.tagName === 'OL');
            const clone = li.cloneNode(true); clone.querySelectorAll('ul, ol').forEach(x => x.remove());
            out.push('  '.repeat(depth) + `${mark} ${inl(clone).trim()}`);
            nested.forEach(x => walk({ children: [x] }, depth + 1));
          });
          if (!depth) out.push('');
        } else if (t === 'BLOCKQUOTE') out.push('> ' + inl(c).trim(), '');
        else if (t === 'PRE') out.push('```', c.textContent, '```', '');
        else if (t === 'HR') out.push('---', '');
        else if (t === 'TABLE') {
          const rows = [...c.querySelectorAll('tr')].map(r => [...r.children].map(x => inl(x).trim().replace(/\|/g, '\\|') || ' '));
          if (rows.length) { out.push('| ' + rows[0].join(' | ') + ' |', '|' + rows[0].map(() => ' --- ').join('|') + '|'); rows.slice(1).forEach(r => out.push('| ' + r.join(' | ') + ' |')); out.push(''); }
        } else if (c.classList && c.classList.contains('pj-callout')) out.push('> ' + inl(c).trim(), '');
        else { const s = inl(c).trim(); out.push(s, ''); }
      }
    };
    walk(box);
    downloadBlob(new Blob([out.join('\n').replace(/\n{3,}/g, '\n\n')], { type: 'text/markdown;charset=utf-8' }), fileName(d.title, 'md'));
    U.toast('마크다운 파일을 내려받았어요.');
  }

  /* .docx 만들기: JSZip 으로 Word 파일(OOXML)을 직접 구성 */
  let jszipP = null;
  function loadJSZip() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!jszipP) {
      jszipP = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        s.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('압축 도구를 불러오지 못했어요.')));
        s.onerror = () => { jszipP = null; reject(new Error('인터넷 연결을 확인해 주세요. (.docx 만들기 도구를 불러오지 못했어요)')); };
        document.head.append(s);
      });
    }
    return jszipP;
  }
  const xesc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  function toHex(c) {
    if (!c) return null;
    c = c.trim();
    let m;
    if ((m = c.match(/^#([0-9a-f]{6})$/i))) return m[1].toUpperCase();
    if ((m = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i))) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
    if ((m = c.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/i))) {
      if (m[4] !== undefined && parseFloat(m[4]) === 0) return null;
      return [m[1], m[2], m[3]].map(x => Math.min(255, +x).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    return null;
  }

  async function exportDocx(docId) {
    const d = docById(docId);
    U.toast('Word 문서를 만드는 중이에요…');
    let JSZip;
    try { JSZip = await loadJSZip(); } catch (err) { U.toast(err.message); return; }
    const box = document.createElement('div');
    box.innerHTML = sanitize(docHtmlFor(docId));

    const rels = [];      // 문서 관계 (링크·그림)
    const media = [];     // { name, data }
    const nums = [];      // 번호 목록마다 새 번호 매기기
    let relN = 10, imgN = 0, docPrN = 1;
    const addRel = (type, target, external) => { const id = 'rId' + (relN++); rels.push({ id, type, target, external }); return id; };

    async function imageXml(img) {
      let blob = null;
      const pid = img.getAttribute('data-pimg');
      if (pid) blob = await getImage(pid);
      else if (img.getAttribute('src')) { try { const r = await fetch(img.getAttribute('src')); if (r.ok) blob = await r.blob(); } catch { blob = null; } }
      if (!blob) return run(`[그림${img.alt ? ': ' + img.alt : ''}]`, { i: true });
      let w = 600, hgt = 400, ext = 'png';
      try { const bmp = await createImageBitmap(blob); w = bmp.width; hgt = bmp.height; if (bmp.close) bmp.close(); } catch { /* 크기 기본값 */ }
      if (/jpe?g/.test(blob.type)) ext = 'jpeg'; else if (/gif/.test(blob.type)) ext = 'gif'; else if (!/png/.test(blob.type)) {
        // 그 밖의 형식은 PNG 로 바꿔서 넣음
        try {
          const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
          blob = await new Promise(r => c.toBlob(r, 'image/png'));
        } catch { return run('[그림]', { i: true }); }
      }
      const name = `image${++imgN}.${ext}`;
      media.push({ name, data: blob });
      const rid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/${name}`);
      const pct = Math.min(100, parseInt(img.getAttribute('data-w') || '100', 10)) / 100;
      const maxW = 6.0 * 914400 * pct; // 본문 폭 약 6인치
      const cx = Math.round(Math.min(maxW, w * 9525));
      const cy = Math.round(cx * hgt / w);
      const id = docPrN++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="그림 ${id}" descr="${xesc(img.alt || '')}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }
    function run(text, f = {}) {
      const pr = [];
      if (f.b) pr.push('<w:b/>');
      if (f.i) pr.push('<w:i/>');
      if (f.u) pr.push('<w:u w:val="single"/>');
      if (f.s) pr.push('<w:strike/>');
      if (f.code) pr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>');
      if (f.color) pr.push(`<w:color w:val="${f.color}"/>`);
      if (f.link && !f.color) pr.push('<w:color w:val="2F5BA8"/>');
      if (f.link && !f.u) pr.push('<w:u w:val="single"/>');
      if (f.bg) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${f.bg}"/>`);
      if (f.sup) pr.push('<w:vertAlign w:val="superscript"/>');
      if (f.sub) pr.push('<w:vertAlign w:val="subscript"/>');
      const rpr = pr.length ? `<w:rPr>${pr.join('')}</w:rPr>` : '';
      return text.split('\n').map((part, i) => (i ? `<w:r>${rpr}<w:br/></w:r>` : '') + (part ? `<w:r>${rpr}<w:t xml:space="preserve">${xesc(part)}</w:t></w:r>` : '')).join('');
    }
    async function inlines(node, f = {}) {
      let out = '';
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { const t = c.nodeValue.replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' '); if (t) out += run(t, f); continue; }
        if (c.nodeType !== 1) continue;
        const t = c.tagName;
        if (/^(UL|OL|TABLE)$/.test(t)) continue; // 블록은 따로 처리
        const nf = { ...f };
        if (t === 'B' || t === 'STRONG') nf.b = true;
        if (t === 'I' || t === 'EM') nf.i = true;
        if (t === 'U') nf.u = true;
        if (t === 'S' || t === 'STRIKE' || t === 'DEL') nf.s = true;
        if (t === 'CODE') nf.code = true;
        if (t === 'SUP') nf.sup = true;
        if (t === 'SUB') nf.sub = true;
        if (t === 'MARK') nf.bg = 'FFF1A8';
        if (t === 'FONT' && c.getAttribute('color')) nf.color = toHex(c.getAttribute('color')) || nf.color;
        if (c.style && c.style.color) nf.color = toHex(c.style.color) || nf.color;
        if (c.style && c.style.backgroundColor) nf.bg = toHex(c.style.backgroundColor) || nf.bg;
        if (t === 'BR') { out += '<w:r><w:br/></w:r>'; continue; }
        if (t === 'IMG') { out += await imageXml(c); continue; }
        if (t === 'A' && c.getAttribute('href')) {
          const rid = addRel('http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', c.getAttribute('href'), true);
          out += `<w:hyperlink r:id="${rid}">${await inlines(c, { ...nf, link: true })}</w:hyperlink>`;
          continue;
        }
        out += await inlines(c, nf);
      }
      return out;
    }
    const jcOf = el => { const a = (el.style && el.style.textAlign) || ''; return { center: 'center', right: 'right', justify: 'both', left: 'left' }[a] || ''; };
    const para = (content, { style, jc, numId, ilvl, shade, border } = {}) => {
      const pr = [];
      if (style) pr.push(`<w:pStyle w:val="${style}"/>`);
      if (numId) pr.push(`<w:numPr><w:ilvl w:val="${ilvl || 0}"/><w:numId w:val="${numId}"/></w:numPr>`);
      if (border) pr.push('<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="E1D6BE"/><w:left w:val="single" w:sz="6" w:space="6" w:color="E1D6BE"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="E1D6BE"/><w:right w:val="single" w:sz="6" w:space="6" w:color="E1D6BE"/></w:pBdr>');
      if (shade) pr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`);
      if (jc) pr.push(`<w:jc w:val="${jc}"/>`);
      return `<w:p>${pr.length ? `<w:pPr>${pr.join('')}</w:pPr>` : ''}${content}</w:p>`;
    };
    async function list(el, depth) {
      let out = '';
      let numId = 1;
      const isCheck = el.classList.contains('pj-check');
      if (el.tagName === 'OL') { nums.push(nums.length + 3); numId = nums[nums.length - 1]; }
      for (const li of el.children) {
        if (li.tagName !== 'LI') continue;
        let prefix = '';
        if (isCheck) prefix = run(li.getAttribute('data-checked') === 'true' ? '☑ ' : '☐ ');
        out += para(prefix + await inlines(li, isCheck && li.getAttribute('data-checked') === 'true' ? { s: true, color: '8F94A3' } : {}), isCheck ? { jc: jcOf(li) } : { numId, ilvl: Math.min(depth, 2), jc: jcOf(li) });
        for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') out += await list(sub, depth + 1);
      }
      return out;
    }
    async function table(el) {
      const rows = [...el.querySelectorAll(':scope > tbody > tr, :scope > thead > tr, :scope > tr')];
      const cols = Math.max(1, ...rows.map(r => [...r.children].reduce((s, c) => s + (parseInt(c.getAttribute('colspan') || '1', 10) || 1), 0)));
      const colW = Math.floor(9000 / cols);
      let out = `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/>`).join('')}</w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${colW}"/>`).join('')}</w:tblGrid>`;
      for (const r of rows) {
        out += '<w:tr>';
        for (const c of r.children) {
          const span = parseInt(c.getAttribute('colspan') || '1', 10) || 1;
          const inner = (await blocks(c)) || para('');
          out += `<w:tc><w:tcPr><w:tcW w:w="${colW * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${c.tagName === 'TH' ? '<w:shd w:val="clear" w:color="auto" w:fill="E7EAF2"/>' : ''}</w:tcPr>${inner}</w:tc>`;
        }
        out += '</w:tr>';
      }
      return out + '</w:tbl>' + para('');
    }
    // 블록 수준 변환. 블록 사이에 낀 글자·인라인 태그는 문단 하나로 모음
    async function blocks(container) {
      let out = '';
      let pending = document.createElement('span');
      const flushInline = async () => { if (pending.textContent.trim() || pending.querySelector('img')) out += para(await inlines(pending)); pending = document.createElement('span'); };
      for (const c of [...container.childNodes]) {
        const t = c.nodeType === 1 ? c.tagName : '';
        const isBlock = /^(P|DIV|H1|H2|H3|BLOCKQUOTE|PRE|UL|OL|TABLE|HR)$/.test(t);
        if (!isBlock) { pending.append(c.cloneNode(true)); continue; }
        await flushInline();
        if (t === 'H1' || t === 'H2' || t === 'H3') out += para(await inlines(c), { style: 'Heading' + t[1], jc: jcOf(c) });
        else if (t === 'BLOCKQUOTE') out += para(await inlines(c), { style: 'Quote', jc: jcOf(c) });
        else if (t === 'PRE') out += c.textContent.split('\n').map(line => para(run(line, { code: true }), { style: 'Code' })).join('');
        else if (t === 'UL' || t === 'OL') out += await list(c, 0);
        else if (t === 'TABLE') out += await table(c);
        else if (t === 'HR') out += '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9C2B4"/></w:pBdr></w:pPr></w:p>';
        else if (t === 'DIV' && c.classList.contains('pj-callout')) out += para(await inlines(c), { shade: 'F3ECDD', border: true, jc: jcOf(c) });
        else if (t === 'DIV' && [...c.children].some(x => /^(P|H1|H2|H3|UL|OL|TABLE|BLOCKQUOTE|PRE|DIV)$/.test(x.tagName))) out += await blocks(c);
        else out += para(await inlines(c), { jc: jcOf(c) });
      }
      await flushInline();
      return out;
    }

    let body;
    try {
      body = para(run(`${d.title}`), { style: 'Title' }) + await blocks(box);
    } catch (err) {
      console.error('[docx]', err);
      U.toast('Word 문서를 만들지 못했어요.');
      return;
    }
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const font = '<w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic" w:hAnsi="Malgun Gothic" w:cs="Malgun Gothic"/>';
    const styleP = (id, name, rpr, ppr = '', based = 'Normal') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${based}"/><w:next w:val="Normal"/><w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}<w:rPr>${rpr}</w:rPr></w:style>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="1B2740"/></w:rPr></w:style>
${styleP('Title', 'Title', '<w:b/><w:color w:val="18264A"/><w:sz w:val="48"/>', '<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="1F3157"/></w:pBdr><w:spacing w:after="300"/>')}
${styleP('Heading1', 'heading 1', '<w:b/><w:color w:val="18264A"/><w:sz w:val="36"/>', '<w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/>')}
${styleP('Heading2', 'heading 2', '<w:b/><w:color w:val="18264A"/><w:sz w:val="30"/>', '<w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="1"/>')}
${styleP('Heading3', 'heading 3', '<w:b/><w:color w:val="1F3157"/><w:sz w:val="26"/>', '<w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/>')}
${styleP('Quote', 'Quote', '<w:i/><w:color w:val="56607A"/>', '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="8C9AB8"/></w:pBdr><w:ind w:left="240"/>')}
${styleP('Code', 'Code', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/>', '<w:shd w:val="clear" w:color="auto" w:fill="F4F1EA"/><w:spacing w:after="0"/>')}
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C9C2B4"/></w:tblBorders></w:tblPr></w:style></w:styles>`;
    const lvl = (i, fmt, text, ind) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${ind}" w:hanging="360"/></w:pPr></w:lvl>`;
    const numberingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'bullet', '•', 720)}${lvl(1, 'bullet', '◦', 1440)}${lvl(2, 'bullet', '▪', 2160)}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'decimal', '%1.', 720)}${lvl(1, 'lowerLetter', '%2.', 1440)}${lvl(2, 'lowerRoman', '%3.', 2160)}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${nums.map(n => `<w:num w:numId="${n}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`).join('')}</w:numbering>`;
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${xesc(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`).join('')}</Relationships>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(d.title)}</dc:title><dc:creator>한지윤의 공부방</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file('word/document.xml', documentXml);
    zip.file('word/styles.xml', stylesXml);
    zip.file('word/numbering.xml', numberingXml);
    zip.file('word/_rels/document.xml.rels', docRels);
    media.forEach(m => zip.file(`word/media/${m.name}`, m.data));
    const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    downloadBlob(blob, fileName(d.title, 'docx'));
    U.toast('Word 문서(.docx)를 내려받았어요.');
    return blob;
  }

  /* ---------- 편집기 화면 ---------- */
  function renderEditor(p, d) {
    editorCtx = { docId: d.id, projectId: p.id, urls: [], dirty: false, range: null, lastVersion: 0, slash: null };
    const title = h('input', {
      type: 'text', class: 'pj-title-input', value: d.title, maxlength: 120, 'aria-label': '문서 제목', placeholder: '제목 없는 문서',
      oninput: e => { d.title = e.target.value.trim() || '제목 없는 문서'; d.updatedAt = Date.now(); save(); setSaveState('saved'); },
      onkeydown: e => { if (e.key === 'Enter' && !U.isComposing(e)) { e.preventDefault(); editor().focus(); } },
    });
    const emojiBtn = h('button', { type: 'button', class: 'pj-doc-emoji', title: '문서 아이콘 바꾸기', 'aria-label': '문서 아이콘 바꾸기', onclick: e => {
      U.popover(e.currentTarget, h('div', { class: 'pj-emoji-pick pj-emoji-pop' }, ['📄', '📝', '🧪', '📚', '📖', '🎤', '💡', '✨', '🧭', '📊', '🗒️', '🎯', '🔬', '🌱', '🧩', '⭐'].map(x => h('button', { type: 'button', class: 'pj-emoji', onclick: () => { d.emoji = x; save(); emojiBtn.textContent = x; U.closePopover(); } }, x))));
    } }, d.emoji);
    const saveEl = h('span', { class: 'pj-save is-saved' }, `저장됨 ${clock(d.updatedAt)}`);
    editorCtx.saveEl = saveEl;

    const top = h('div', { class: 'pj-ed-top' },
      h('button', { type: 'button', class: 'pj-crumb', onclick: () => go({ view: 'project', projectId: p.id }), title: '프로젝트로 돌아가기' },
        h('span', { class: 'pj-crumb-cover', style: coverStyle(p.cover) }, p.emoji), h('span', { class: 'pj-crumb-name' }, p.name)),
      h('span', { class: 'pj-crumb-sep', 'aria-hidden': 'true' }, '/'),
      emojiBtn, title, saveEl,
      h('div', { class: 'pj-ed-actions' },
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: () => { ui.outline = !ui.outline; saveUi(); editorCtx.shell.classList.toggle('has-outline', ui.outline); } }, '목차'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: openVersions }, '버전'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm sp-btn-ghost', onclick: () => toggleFocus() }, '집중'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: e => exportMenu(e.currentTarget, d.id) }, U.icon('external'), '내보내기'),
        h('button', { type: 'button', class: 'sp-btn sp-btn-sm pj-ai-toggle', onmousedown: e => { e.preventDefault(); saveSelection(); }, onclick: () => toggleAi() }, '✨ AI')));

    const page = h('div', {
      class: 'pj-paper', contenteditable: 'true', spellcheck: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': '문서 본문',
      'data-placeholder': '여기에 쓰기 시작해요. / 를 누르면 블록 메뉴가 나와요.',
    });
    page.innerHTML = sanitize(d.html || '<p><br></p>');
    if (!page.innerHTML.trim()) page.innerHTML = '<p><br></p>';
    applyImageWidths(page);
    editorCtx.page = page;
    page.addEventListener('input', () => { afterChange(); openSlash(); });
    page.addEventListener('keydown', onEditorKeydown);
    page.addEventListener('keyup', () => { saveSelection(); syncToolbar(); });
    page.addEventListener('mouseup', () => { saveSelection(); syncToolbar(); });
    page.addEventListener('click', onEditorClick);
    page.addEventListener('paste', onPaste);
    page.addEventListener('drop', onDrop);
    page.addEventListener('blur', () => { saveSelection(); setTimeout(() => { if (editorCtx && document.activeElement !== editor()) closeSlash(); }, 150); flush(); });

    const find = h('div', { class: 'pj-find', hidden: true },
      h('input', { type: 'text', class: 'sp-input js-find', placeholder: '찾을 말', 'aria-label': '찾을 말', oninput: updateFindCount, onkeydown: e => { if (e.key === 'Enter' && !U.isComposing(e)) { e.preventDefault(); findNext(); } if (e.key === 'Escape') { e.stopPropagation(); toggleFind(); } } }),
      h('span', { class: 'pj-find-count js-count' }),
      h('input', { type: 'text', class: 'sp-input js-replace', placeholder: '바꿀 말', 'aria-label': '바꿀 말' }),
      h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: findNext }, '다음'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: replaceOne }, '바꾸기'),
      h('button', { type: 'button', class: 'sp-btn sp-btn-sm', onclick: replaceAll }, '모두 바꾸기'),
      U.iconBtn('x', '찾기 닫기', toggleFind));
    editorCtx.findEl = find;

    const outline = h('div', { class: 'pj-outline-body' });
    editorCtx.outlineEl = outline;
    const status = h('div', { class: 'pj-status-bar' });
    editorCtx.statusEl = status;

    const shell = h('div', { class: 'pj-editor' + (ui.outline ? ' has-outline' : '') + (ui.ai ? ' has-ai' : '') },
      top,
      h('div', { class: 'pj-toolbar-wrap' }, buildToolbar(), find),
      h('div', { class: 'pj-ed-body' },
        h('nav', { class: 'pj-outline', 'aria-label': '목차' }, h('p', { class: 'pj-outline-title' }, '목차'), outline,
          h('div', { class: 'pj-tips' }, h('p', { class: 'pj-outline-title' }, '빠른 입력'),
            h('p', null, h('kbd', null, '/'), ' 블록 메뉴'), h('p', null, h('kbd', null, '#'), ' + 띄어쓰기 → 제목'),
            h('p', null, h('kbd', null, '-'), ' 목록 · ', h('kbd', null, '[]'), ' 체크'), h('p', null, h('kbd', null, 'Ctrl+S'), ' 버전 남기기'))),
        h('div', { class: 'pj-paper-scroll' }, h('div', { class: 'pj-paper-sheet' }, page), status),
        buildAiPanel()));
    editorCtx.shell = shell;
    setTimeout(async () => {
      drawOutline(); drawStatus();
      await hydrateImages(page);
      snapshot('문서 열기');
      if (!d.html || d.html === '<p><br></p>') page.focus();
    });
    return shell;
  }

  /* ---------- 화면 전환 ---------- */
  function leaveEditor() {
    if (!editorCtx) return;
    flush();
    closeSlash();
    clearHits();
    document.body.classList.remove('pj-focus-mode');
    editorCtx.urls.forEach(u => URL.revokeObjectURL(u));
    editorCtx = null;
  }
  function go(r) {
    if (route.view === 'editor') leaveEditor();
    route = { view: 'home', projectId: null, docId: null, ...r };
    render();
    const main = document.getElementById('main');
    if (main) main.scrollTop = 0;
  }
  function render() {
    if (!root || !data) return;
    U.closePopover();
    if (route.view !== 'editor' && editorCtx) leaveEditor();
    const p = route.projectId && projectById(route.projectId);
    const d = route.docId && docById(route.docId);
    let view;
    if (route.view === 'editor' && p && d && !d.trashed) {
      if (editorCtx && editorCtx.docId === d.id) return; // 편집 중에는 다시 그리지 않음
      view = renderEditor(p, d);
    } else if (route.view === 'project' && p && !p.trashed) view = renderProject(p);
    else if (route.view === 'trash') view = renderTrash();
    else { route = { view: 'home' }; view = renderHome(); }
    root.classList.toggle('is-editor', route.view === 'editor');
    const section = document.getElementById('page-projects');
    if (section) section.classList.toggle('pj-editing', route.view === 'editor');
    root.replaceChildren(view);
  }

  function init() {
    root = document.getElementById('pj-root');
    if (!root || typeof SubjectPlans === 'undefined' || !SubjectPlans.ui) return;
    U = SubjectPlans.ui;
    h = U.h;
    load();
    render();
    document.addEventListener('selectionchange', () => { if (editorCtx && document.activeElement === editor()) syncToolbar(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.body.classList.contains('pj-focus-mode')) toggleFocus(false);
    });
    window.addEventListener('beforeunload', () => { if (editorCtx) flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && editorCtx) flush(); });
    const nav = window.navigate;
    if (typeof nav === 'function') {
      window.navigate = function (page, ...rest) {
        if (page !== 'projects' && editorCtx) { flush(); document.body.classList.remove('pj-focus-mode'); }
        const r = nav.call(this, page, ...rest);
        if (page === 'projects' && route.view !== 'editor') render();
        return r;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { render, exportDocx, _debug: { sanitize, textToHtml, get data() { return data; } } };
})();
