import { show_status, get_cached_user_name, make_member_id, 
  make_hash, record_user_connection, get_user_class, copy_to_clipboard } from './utils.js';

export function sanitize_room_id(raw_value) {
  return String(raw_value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20);
}

export function read_room_id_from_url(param_name = 'room') {
  try {
    const params = new URLSearchParams(window.location.search);
    const candidate = params.get(param_name);
    return candidate ? sanitize_room_id(candidate) : '';
  } catch (e) {
    return '';
  }
}

function set_url_room_param(url_param, value) {
  const url = new URL(window.location.href);
  if (value) {
    url.searchParams.set(url_param, value);
  } else {
    url.searchParams.delete(url_param);
  }
  window.history.replaceState({}, '', url.toString());
}

export function bind_room_controls(elements, room_sync, url_param) {
  const { room_input, join_room_btn, copy_room_btn, leave_room_btn } = elements;

  if (room_input) {
    room_input.value = read_room_id_from_url(url_param);
    room_input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') room_sync.set_room_id(room_input.value);
    });
  }

  if (join_room_btn) {
    join_room_btn.addEventListener('click', () => {
      room_sync.set_room_id(room_input ? room_input.value : read_room_id_from_url(url_param));
    });
  }

  if (copy_room_btn) {
    copy_room_btn.addEventListener('click', async () => {
      const active_room_id = room_input && room_input.value
        ? sanitize_room_id(room_input.value)
        : read_room_id_from_url(url_param);

      if (!active_room_id) {
        show_status('ルームIDが未設定', true);
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set(url_param, active_room_id);

      try {
        await copy_to_clipboard(url.toString());
        show_status('URLをコピーしました');
      } catch (e) {
        show_status('URLのコピーに失敗しました', true);
      }
    });
  }

  if (leave_room_btn) {
    leave_room_btn.addEventListener('click', () => room_sync.leave_room());
  }
}

export function touch_room_created_at(room_ref) {
  if (!room_ref) return;
  room_ref.once('value').then((snapshot) => {
    const room_data = snapshot.val() || {};
    if (!Number(room_data.createdAt || 0)) {
      room_ref.child('createdAt').set(Date.now());
    }
  }).catch(() => {});
}

export function create_room_sync(config) {
  const {
    room_path_prefix,
    url_param = 'room',
    get_state_payload,
    apply_remote_state,
    on_room_ready
  } = config;

  const state = {
    room_id: '',
    db: null,
    room_ref: null,
    state_ref: null,
    members_ref: null,
    member_id: null,
    has_realtime_sync: false,
    is_applying_remote: false
  };

  let last_cached_members = {};

  function notify_status(message, is_error) {
    update_status_display(message, is_error, last_cached_members);
  }

  function update_status_display(message, is_error, members = {}) {
    show_status(message, is_error);

    const meta_container = document.getElementById('roomMetaInfo');
    const list_container = document.getElementById('roomMemberListDropdown');
    if (!meta_container) return;

    const current_uid = state.member_id
      || (window.firebase && window.firebase.auth && window.firebase.auth().currentUser && window.firebase.auth().currentUser.uid)
      || 'guest';
    const my_member = members[current_uid];
    const my_name = (my_member && my_member.name) || get_cached_user_name() || '';
    const member_ids = Object.keys(members);
    const member_count = member_ids.length > 0 ? member_ids.length : 1;

    const name_class = ['username'];
    name_class.push(get_user_class(my_name));

    meta_container.innerHTML = `
      <span class="${name_class.join(' ')}">${my_name}</span>
      <button id="memberCountBadge" class="btn btn-neutral member-count-badge" aria-expanded="false">人数: ${member_count} ▼</button>
    `;

    bind_member_count_badge(member_ids, members, current_uid, list_container);
  }

  function bind_member_count_badge(member_ids, members, current_uid, list_container) {
    const badge = document.getElementById('memberCountBadge');
    if (!badge || !list_container) return;

    badge.onclick = () => {
      const was_hidden = list_container.style.display === 'none';
      list_container.style.display = was_hidden ? 'flex' : 'none';
      badge.textContent = `人数: ${member_ids.length > 0 ? member_ids.length : 1} ${was_hidden ? '▲' : '▼'}`;
      badge.setAttribute('aria-expanded', String(was_hidden));

      if (was_hidden) render_member_dropdown(member_ids, members, current_uid, list_container);
    };
  }

  function render_member_dropdown(member_ids, members, current_uid, list_container) {
    const unique_ids = Array.from(new Set(member_ids.length > 0 ? member_ids : [current_uid]));
    const other_ids = unique_ids.filter((id) => id !== current_uid);

    if (other_ids.length === 0) {
      list_container.innerHTML = '<div class="member-dropdown-empty">他のメンバーはいません</div>';
      return;
    }

    list_container.innerHTML = other_ids.map((id) => {
      const member_name = (members[id] || {}).name || '???';
      const item_class = ['member-dropdown-item'];
      item_class.push(get_user_class(member_name));
      return `<div class="${item_class.join(' ')}">${member_name}</div>`;
    }).join('');
  }

  async function setup_presence() {
    if (!state.db || !state.room_ref || !state.state_ref || !state.members_ref) return;

    const member_id = await make_member_id();
    await record_user_connection(member_id);

    const member_hash = String(Math.abs(make_hash(String(member_id))));
    const fingerprint = String(Math.abs(make_hash(`${member_id}::fp`)));
    const display_name = get_cached_user_name();
    state.member_id = member_hash;

    try {
      const snapshot = await state.members_ref.once('value');
      const members = snapshot.val() || {};

      let final_key = member_hash;
      let branch = 1;
      while (members[final_key] && members[final_key].fp !== fingerprint) {
        branch += 1;
        final_key = `${member_hash}-${branch}`;
      }
      state.member_id = final_key;

      const my_member_ref = state.members_ref.child(final_key);
      const current_data = members[final_key] || {};

      await my_member_ref.set({
        joinedAt: current_data.joinedAt || Date.now(),
        name: display_name,
        fp: fingerprint
      });

      my_member_ref.onDisconnect().remove();
    } catch (e) {
      console.warn('setup_presence failed:', e);
    }

    state.members_ref.on('value', (snapshot) => {
      const members = snapshot.val() || {};
      last_cached_members = members;
      update_status_display(`共有中: ${state.room_id}`, false, members);

      if (Object.keys(members).length === 0 && state.room_ref) {
        state.room_ref.remove().catch(() => {});
      }
    });

    bind_page_close_cleanup();

    const snapshot = await state.state_ref.once('value');
    if (!snapshot.exists()) sync_current_state();
  }

  function detach() {
    if (state.state_ref) state.state_ref.off('value');
    if (state.members_ref) state.members_ref.off('value');
    if (state.room_ref) state.room_ref.off('value');
    state.room_ref = null;
    state.state_ref = null;
    state.members_ref = null;
  }

  async function remove_current_member() {
    if (!state.member_id || !state.members_ref) return;
    const my_member_ref = state.members_ref.child(state.member_id);
    try {
      await my_member_ref.remove();
      if (!state.members_ref) return;
      const snapshot = await state.members_ref.once('value');
      const members = snapshot.val() || {};
      if (Object.keys(members).length === 0 && state.room_ref) {
        await state.room_ref.remove().catch(() => {});
      }
    } catch (e) {
      console.warn('remove_current_member failed:', e);
    }
  }

  function bind_page_close_cleanup() {
    const cleanup = () => remove_current_member();
    window.addEventListener('beforeunload', cleanup, { passive: true });
    window.addEventListener('pagehide', cleanup, { passive: true });
  }

  function sync_current_state() {
    if (!state.has_realtime_sync || !state.state_ref || state.is_applying_remote) return;
    const payload = Object.assign({ updatedAt: Date.now() }, get_state_payload());
    state.state_ref.set(payload).catch((e) => {
      console.error('create_room_sync: write failed', e);
      notify_status('共有の更新に失敗しました', true);
    });
  }

  async function init() {
    if (!firebase_config || !window.firebase) {
      state.has_realtime_sync = false;
      state.db = null;
      notify_status('ローカルモード: サーバー未設定');
      return;
    }

    try {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(firebase_config);
      }
      state.db = window.firebase.database();
      state.has_realtime_sync = true;
    } catch (e) {
      console.error('Firebase init failed', e);
      state.has_realtime_sync = false;
      notify_status('共有の初期化に失敗しました', true);
      return;
    }

    try {
      const auth = window.firebase.auth();
      if (!auth.currentUser) await auth.signInAnonymously();
    } catch (e) {
      console.warn('Anonymous auth failed during init:', e);
      notify_status('認証に失敗しました', true);
      return;
    }

    const room_id = read_room_id_from_url(url_param);
    state.room_id = room_id;

    detach();
    if (!room_id) {
      state.member_id = null;
      notify_status('ローカルモード: ルームIDが未設定');
      return;
    }

    const room_ref = state.db.ref(`${room_path_prefix}/${room_id}`);
    const state_ref = room_ref.child('state');
    state.room_ref = room_ref;
    state.state_ref = state_ref;
    state.members_ref = room_ref.child('members');

    if (typeof on_room_ready === 'function') on_room_ready(room_ref);

    state_ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      state.is_applying_remote = true;
      apply_remote_state(data);
      state.is_applying_remote = false;
    });

    notify_status(`共有中: ${room_id}`);
    await setup_presence();
  }

  function set_room_id(next_room_id) {
    const normalized = sanitize_room_id(next_room_id);
    if (!normalized) {
      leave_room();
      return;
    }

    if (state.member_id && state.members_ref) remove_current_member();
    state.room_id = normalized;

    const input = document.getElementById('roomIdInput');
    if (input) input.value = normalized;

    set_url_room_param(url_param, normalized);
    detach();
    init();
  }

  function leave_room() {
    if (state.member_id && state.members_ref) remove_current_member();
    detach();
    state.room_id = '';
    state.member_id = null;

    const input = document.getElementById('roomIdInput');
    if (input) input.value = '';

    set_url_room_param(url_param, '');
    notify_status('ローカルモード: ルームIDが未設定');
  }

  return { state, init, set_room_id, leave_room, sync_current_state };
}

const firebase_config = {
  apiKey: 'AIzaSyDo5BtxY6AE1cLsqJcML-AdijxLmtnrpn0',
  authDomain: 'solver-80ad0.firebaseapp.com',
  databaseURL: 'https://solver-80ad0-default-rtdb.firebaseio.com',
  projectId: 'solver-80ad0',
  storageBucket: 'solver-80ad0.firebasestorage.app',
  messagingSenderId: '639285537821',
  appId: '1:639285537821:web:399f1ab5f22f2ee64beaf4',
  measurementId: 'G-7GD00HE91K'
};