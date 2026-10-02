/* ============================================================
   CLOUD SYNC (Firebase Realtime Database + Google 로그인)
   - 앱 데이터(localStorage의 hs_* / homeschool_v1)를 통째로 users/{uid}에 저장
   - API 키, 음악 파일은 기기별로 따로 (동기화 제외)
   - app.js보다 먼저 로드되어야 함 (localStorage 쓰기 감지)
   ============================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyAC0DR4o0PCEHftO9j2r1ZDQPgwFHgX8Ac",
  authDomain: "practice-c0fa1.firebaseapp.com",
  databaseURL: "https://practice-c0fa1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "practice-c0fa1",
  storageBucket: "practice-c0fa1.firebasestorage.app",
  messagingSenderId: "249030547782",
  appId: "1:249030547782:web:5cb45ef543e1bcf1f82d47"
};

const SYNC_LOCAL_TS  = 'hs_sync_local_ts';   // 이 기기에서 마지막으로 데이터를 바꾼 시각
const SYNC_REMOTE_TS = 'hs_sync_remote_ts';  // 마지막으로 클라우드와 맞춘 버전
const SYNC_DEVICE    = 'hs_sync_device';
const SYNC_EXCLUDE   = ['hs_openai_key', 'hs_youtube_key', 'hs_music_meta_v2'];

const _origSetItem    = Storage.prototype.setItem;
const _origRemoveItem = Storage.prototype.removeItem;
const _lsGet = k => localStorage.getItem(k);
const _lsSet = (k, v) => { try { _origSetItem.call(localStorage, k, v); } catch (_) {} };

const sync = {
  available: false,   // Firebase SDK 로드 + http(s) 환경
  user: null,
  ref: null,
  ready: false,       // 첫 동기화 끝남 → 이후 변경사항 업로드
  booted: false,      // 앱 시작 시 자동으로 쓰는 값은 '수정'으로 치지 않음
  applying: false,
  pushTimer: null,
  status: 'off'       // off | file | syncing | synced | error
};

function syncDeviceId() {
  let id = _lsGet(SYNC_DEVICE);
  if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); _lsSet(SYNC_DEVICE, id); }
  return id;
}

function isSyncKey(k) {
  if (!k) return false;
  if (k === 'homeschool_v1') return true;
  if (!k.startsWith('hs_')) return false;
  if (k.startsWith('hs_sync_') || k.startsWith('hs_mf_')) return false;
  return !SYNC_EXCLUDE.includes(k);
}

function collectLocalData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (isSyncKey(k)) data[k] = localStorage.getItem(k);
  }
  return data;
}

// localStorage 쓰기를 감지해서 클라우드 업로드 예약
Storage.prototype.setItem = function (k, v) {
  _origSetItem.call(this, k, v);
  if (this === localStorage && isSyncKey(k)) onLocalChange();
};
Storage.prototype.removeItem = function (k) {
  _origRemoveItem.call(this, k);
  if (this === localStorage && isSyncKey(k)) onLocalChange();
};

function onLocalChange() {
  if (sync.applying || !sync.booted) return;
  _lsSet(SYNC_LOCAL_TS, String(Date.now()));
  if (sync.ready && sync.user) {
    clearTimeout(sync.pushTimer);
    sync.pushTimer = setTimeout(pushToCloud, 1500);
  }
}

async function pushToCloud() {
  if (!sync.ref) return;
  clearTimeout(sync.pushTimer);
  const ts = Date.now();
  setSyncStatus('syncing');
  try {
    await sync.ref.set({ updatedAt: ts, device: syncDeviceId(), data: collectLocalData() });
    _lsSet(SYNC_REMOTE_TS, String(ts));
    setSyncStatus('synced');
  } catch (e) {
    console.error('[sync] push failed', e);
    setSyncStatus('error');
  }
}

function applyRemote(remote) {
  // 타이머가 돌고 있으면 끝날 때까지 기다렸다가 반영 (새로고침되면 타이머가 끊기므로)
  if (typeof state !== 'undefined' && state.timer && state.timer.isRunning) {
    setTimeout(() => applyRemote(remote), 5000);
    return;
  }
  sync.applying = true;
  const data = remote.data || {};
  Object.keys(collectLocalData()).forEach(k => { if (!(k in data)) _origRemoveItem.call(localStorage, k); });
  Object.entries(data).forEach(([k, v]) => _lsSet(k, v));
  _lsSet(SYNC_REMOTE_TS, String(remote.updatedAt));
  _lsSet(SYNC_LOCAL_TS, String(remote.updatedAt));
  sync.applying = false;
  location.reload();
}

async function initialSync() {
  setSyncStatus('syncing');
  try {
    const snap = await sync.ref.get();
    const remote = snap.val();
    const lastRemote = Number(_lsGet(SYNC_REMOTE_TS)) || 0;
    const localTs = Number(_lsGet(SYNC_LOCAL_TS)) || 0;

    if (!remote) {
      await pushToCloud();                       // 클라우드가 비어 있음 → 이 기기 데이터 올리기
    } else if (lastRemote === 0) {
      applyRemote(remote); return;               // 이 기기 첫 연결 → 클라우드 데이터 받기
    } else if (remote.updatedAt > lastRemote) {
      // 다른 기기에서 바뀜. 이 기기도 그 뒤에 더 최근에 바꿨으면 이 기기 것이 이김
      if (localTs > remote.updatedAt) await pushToCloud();
      else { applyRemote(remote); return; }
    } else if (localTs > lastRemote) {
      await pushToCloud();                       // 오프라인/로그아웃 중에 바꾼 것 올리기
    } else {
      setSyncStatus('synced');
    }
    sync.ready = true;

    // 다른 기기에서 바꾸면 실시간으로 받기
    sync.ref.on('value', s => {
      const r = s.val();
      if (!r || r.device === syncDeviceId()) return;
      if (r.updatedAt > (Number(_lsGet(SYNC_REMOTE_TS)) || 0)) {
        if (typeof showToast === 'function') showToast('다른 기기에서 바뀐 내용을 불러올게요', '☁️');
        setTimeout(() => applyRemote(r), 1200);
      }
    });
  } catch (e) {
    console.error('[sync] initial sync failed', e);
    setSyncStatus('error');
  }
}

/* ---------- 로그인 ---------- */
function syncLogin() {
  if (!sync.available) {
    showToast(location.protocol === 'file:' ? '파일로 열면 로그인이 안 돼요. 사이트 주소로 접속해 주세요' : '동기화 기능을 불러오지 못했어요', '⚠️');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(e => {
    console.error('[sync] login failed', e);
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      showToast('로그인에 실패했어요: ' + (e.code || e.message), '⚠️');
    }
  });
}

function syncLogout() {
  if (!sync.available) return;
  firebase.auth().signOut();
}

function syncNow() {
  if (sync.user && sync.ready) pushToCloud();
}

/* ---------- 상태 표시 ---------- */
function setSyncStatus(s) {
  sync.status = s;
  renderSyncStatus();
}

function renderSyncStatus() {
  const labels = {
    off:     '☁️ 로그인하고 동기화',
    file:    '☁️ 동기화 꺼짐 (파일 모드)',
    syncing: '☁️ 동기화 중...',
    synced:  '☁️ 동기화됨',
    error:   '⚠️ 동기화 오류'
  };
  const side = document.getElementById('sync-status-btn');
  if (side) {
    side.textContent = labels[sync.status];
    side.classList.toggle('ok', sync.status === 'synced');
    side.classList.toggle('err', sync.status === 'error');
  }
  const acct = document.getElementById('sync-account');
  const inBtn = document.getElementById('sync-login-btn');
  const outBtns = document.getElementById('sync-logged-in-btns');
  if (acct) {
    acct.textContent = sync.user
      ? `${sync.user.email} 계정으로 연결됨 · ${labels[sync.status].replace('☁️ ', '')}`
      : (sync.status === 'file' ? '파일(file://)로 열면 동기화가 안 돼요. 사이트 주소로 접속해 주세요.' : '로그인하면 노트북·휴대폰 데이터가 자동으로 맞춰져요.');
  }
  if (inBtn) inBtn.style.display = sync.user ? 'none' : '';
  if (outBtns) outBtns.style.display = sync.user ? '' : 'none';
}

/* ---------- 백업 파일 내보내기 / 가져오기 ---------- */
function exportAppData() {
  const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), data: collectLocalData() }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `지윤공부방-백업-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importAppData(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed.data || {};
      sync.applying = true;
      Object.keys(collectLocalData()).forEach(k => _origRemoveItem.call(localStorage, k));
      Object.entries(data).forEach(([k, v]) => { if (isSyncKey(k)) _lsSet(k, v); });
      sync.applying = false;
      _lsSet(SYNC_LOCAL_TS, String(Date.now()));
      if (sync.user && sync.ready) await pushToCloud();   // 가져온 데이터로 클라우드도 덮어쓰기
      showToast('백업을 불러왔어요. 새로고침할게요', '📦');
      setTimeout(() => location.reload(), 1000);
    } catch (e) {
      sync.applying = false;
      showToast('백업 파일을 읽지 못했어요', '⚠️');
    }
  };
  reader.readAsText(file);
}

/* ---------- 시작 ---------- */
window.addEventListener('load', () => {
  // 앱 시작 직후 자동 저장(이월 등)은 수정으로 치지 않음
  setTimeout(() => { sync.booted = true; }, 1000);
  renderSyncStatus();
});

(function initSync() {
  if (location.protocol === 'file:') { sync.status = 'file'; return; }
  if (typeof firebase === 'undefined') { sync.status = 'error'; return; }
  try {
    firebase.initializeApp(firebaseConfig);
    sync.available = true;
    firebase.auth().onAuthStateChanged(user => {
      if (sync.ref) sync.ref.off();
      sync.user = user;
      sync.ready = false;
      if (user) {
        sync.ref = firebase.database().ref('users/' + user.uid);
        initialSync();
      } else {
        sync.ref = null;
        setSyncStatus('off');
      }
    });
  } catch (e) {
    console.error('[sync] init failed', e);
    sync.status = 'error';
  }
})();
