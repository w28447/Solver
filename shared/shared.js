(function (global) {
  function sanitize_room_id(raw_value) {
    return String(raw_value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 20);
  }

  function read_room_id_from_url(param_name = 'room') {
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

  async function make_member_id() {
    try {
      if (global.firebase && typeof global.firebase.auth === 'function') {
        const auth = global.firebase.auth();
        let user = auth.currentUser;
        if (!user) {
          const credential = await auth.signInAnonymously();
          user = credential.user;
        }
        if (user && user.uid) return user.uid;
      }
    } catch (e) {
      console.warn('make_member_id auth error:', e);
    }
  }

  async function copy_to_clipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function make_hash(string) {
    let hash = 0x4b9ace2f | 0;
    for (let i = 0; i < string.length; i++) {
      const x = (string.charCodeAt(i) + hash) | 0;
      hash = ((x ^ (x << 10)) + ((x ^ (x << 10)) >> 6)) | 0;
    }
    return Math.imul(0x8001, ((9 * hash) ^ ((9 * hash) >> 11)) | 0);
  }

  function is_special_user(name) {
    return name.includes('_115') || name.includes('_935');
  }

  function is_rare_user(name) {
    return !name.includes('_');
  }

  function set_menu_open(menu_id, is_open) {
    const menu = document.getElementById(menu_id);
    const toggle_btn = document.getElementById('menuToggleBtn');
    if (!menu) return;

    if (!is_open && menu.contains(document.activeElement)) {
      (toggle_btn || document.body).focus();
    }

    menu.classList.toggle('open', is_open);
    menu.setAttribute('aria-hidden', String(!is_open));
    menu.toggleAttribute('inert', !is_open);

    if (toggle_btn) toggle_btn.setAttribute('aria-expanded', String(is_open));
  }

  function bind_menu_toggle(toggle_btn, close_btn, menu_panel_id, on_close) {
    const panel = document.getElementById(menu_panel_id);

    if (toggle_btn) {
      toggle_btn.addEventListener('click', () => {
        const is_open = !!(panel && panel.classList.contains('open'));
        set_menu_open(menu_panel_id, !is_open);
      });
    }

    if (close_btn) {
      close_btn.addEventListener('click', () => {
        set_menu_open(menu_panel_id, false);
        if (typeof on_close === 'function') on_close();
      });
    }

    if (panel) {
      panel.addEventListener('click', (event) => {
        if (event.target === panel) set_menu_open(menu_panel_id, false);
      });
    }
  }

  function go_home() {
    window.location.href = '../index.html';
  }

  function bind_show_home_button(btn) {
    if (btn) btn.addEventListener('click', go_home);
  }

  function bind_room_controls(elements, room_sync, url_param, on_status) {
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
          on_status('ルームIDが未設定', true);
          return;
        }

        const url = new URL(window.location.href);
        url.searchParams.set(url_param, active_room_id);

        try {
          await copy_to_clipboard(url.toString());
          on_status('URLをコピーしました');
        } catch (e) {
          on_status('URLのコピーに失敗しました', true);
        }
      });
    }

    if (leave_room_btn) {
      leave_room_btn.addEventListener('click', () => room_sync.leave_room());
    }
  }

  function touch_room_created_at(room_ref) {
    if (!room_ref) return;
    room_ref.once('value').then((snapshot) => {
      const room_data = snapshot.val() || {};
      if (!Number(room_data.createdAt || 0)) {
        room_ref.child('createdAt').set(Date.now());
      }
    }).catch(() => {});
  }

  const NAME_WORD_GROUPS_CACHE_KEY = 'sharedNameWordGroupsCache';
  const USER_CONNECTION_CACHE_KEY = 'sharedUserConnectionCache';
  const RECONNECT_SKIP_WINDOW_MS = 60 * 1000;

  function read_json_cache(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function write_json_cache(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  async function load_name_word_groups() {
    const cached = read_json_cache(NAME_WORD_GROUPS_CACHE_KEY);
    if (cached) return cached;

    const db = global.firebase.firestore();
    const [doc_a, doc_b, doc_c, doc_d] = await Promise.all([
      db.collection('Words').doc('groupA').get(),
      db.collection('Words').doc('groupB').get(),
      db.collection('Words').doc('groupC').get(),
      db.collection('Words').doc('groupD').get()
    ]);

    const groups = {
      a: doc_a.exists ? Object.keys(doc_a.data() || {}) : [],
      b: doc_b.exists ? Object.keys(doc_b.data() || {}) : [],
      c: doc_c.exists ? Object.keys(doc_c.data() || {}) : [],
      d: doc_d.exists ? Object.keys(doc_d.data() || {}) : []
    };

    write_json_cache(NAME_WORD_GROUPS_CACHE_KEY, groups);
    return groups;
  }

  async function generate_user_name(uid) {
    const hash = Math.abs(make_hash(String(uid)));
    const { a: group_a, b: group_b, c: group_c, d: group_d } = await load_name_word_groups();
    const rare_roll = (hash % 100000) / 100000;

    if (rare_roll < 0.0005 && group_d.length > 0) {
      return group_d[hash % group_d.length];
    }

    if (group_a.length === 0 && group_b.length === 0 && group_c.length === 0) {
      return 'unknown user';
    }

    const part_a = group_a.length > 0 ? group_a[hash % group_a.length] : '';
    const part_b = group_b.length > 0 ? group_b[(hash + 115) % group_b.length] : '';
    const part_c = group_c.length > 0 ? group_c[(hash + 935) % group_c.length] : '';

    return `${part_a}${part_b}${part_c}_${hash % 1000}`;
  }

  async function record_user_connection(user_id) {
    const now = Date.now();
    const cached_connection = read_json_cache(USER_CONNECTION_CACHE_KEY);

    if (cached_connection && cached_connection.user_id === user_id
      && (now - cached_connection.last_connected_at) < RECONNECT_SKIP_WINDOW_MS) {
      global.cachedUserName = cached_connection.name;
      return;
    }

    try {
      if (!global.firebase || typeof global.firebase.firestore !== 'function') return;
      const db = global.firebase.firestore();
      const user_ref = db.collection('users').doc(user_id);

      const known_name = global.cachedUserName
        || (cached_connection && cached_connection.user_id === user_id ? cached_connection.name : null);

      const doc = await user_ref.get();
      const data = doc.data() || {};
      const user_name = (doc.exists && data.defaultName) || known_name || await generate_user_name(user_id);
      global.cachedUserName = user_name;

      if (!doc.exists) {
        const new_doc = { count: 1, time: now };
        if (user_name !== 'unknown user') new_doc.defaultName = user_name;
        await user_ref.set(new_doc);
      } else {
        const update_data = {
          count: global.firebase.firestore.FieldValue.increment(1),
          time: now
        };
        if (!data.defaultName && user_name !== 'unknown user') {
          update_data.defaultName = user_name;
        }
        await user_ref.update(update_data);
      }

      write_json_cache(USER_CONNECTION_CACHE_KEY, { user_id, name: user_name, last_connected_at: now });
    } catch (e) {
      console.warn('Failed to record user connection in Firestore:', e);
    }
  }

  function create_room_sync(config) {
    const {
      room_path_prefix,
      url_param = 'room',
      get_state_payload,
      apply_remote_state,
      on_first_member_join,
      on_room_ready,
      on_status_change
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
      if (typeof on_status_change === 'function') on_status_change(message, is_error);
      update_status_display(message, is_error, last_cached_members);
    }

    function update_status_display(message, is_error, members = {}) {
      const status_node = document.getElementById('shareStatus');
      if (status_node) {
        status_node.textContent = message;
        status_node.style.color = is_error ? '#ff8a8a' : '#93c5fd';
      }

      const meta_container = document.getElementById('roomMetaInfo');
      const list_container = document.getElementById('roomMemberListDropdown');
      if (!meta_container) return;

      const current_uid = state.member_id
        || (global.firebase && global.firebase.auth && global.firebase.auth().currentUser && global.firebase.auth().currentUser.uid)
        || 'guest';
      const my_member = members[current_uid];
      const my_name = (my_member && my_member.name) || global.cachedUserName || '';
      const member_ids = Object.keys(members);
      const member_count = member_ids.length > 0 ? member_ids.length : 1;

      const name_class = ['username'];
      if (is_rare_user(my_name)) name_class.push('rare');
      else if (is_special_user(my_name)) name_class.push('special');

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
        if (is_rare_user(member_name)) item_class.push('rare');
        else if (is_special_user(member_name)) item_class.push('special');
        return `<div class="${item_class.join(' ')}">${member_name}</div>`;
      }).join('');
    }

    async function setup_presence() {
      if (!state.db || !state.room_ref || !state.state_ref || !state.members_ref) return;

      const member_id = await make_member_id();
      await record_user_connection(member_id);

      const member_hash = String(Math.abs(make_hash(String(member_id))));
      const fingerprint = String(Math.abs(make_hash(`${member_id}::fp`)));
      const display_name = global.cachedUserName;
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

        if (Object.keys(members).length === 0 && typeof on_first_member_join === 'function') {
          on_first_member_join();
        }

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
      if (!global.firebase_config || !global.firebase) {
        state.has_realtime_sync = false;
        state.db = null;
        notify_status('ローカルモード: サーバー未設定');
        return;
      }

      try {
        if (!global.firebase.apps || !global.firebase.apps.length) {
          global.firebase.initializeApp(global.firebase_config);
        }
        state.db = global.firebase.database();
        state.has_realtime_sync = true;
      } catch (e) {
        console.error('Firebase init failed', e);
        state.has_realtime_sync = false;
        notify_status('共有の初期化に失敗しました', true);
        return;
      }

      try {
        const auth = global.firebase.auth();
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

      if (typeof on_room_ready === 'function') on_room_ready(room_ref, room_id);

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

  global.shared_util = {
    sanitize_room_id,
    read_room_id_from_url,
    make_member_id,
    copy_to_clipboard,
    set_menu_open,
    bind_menu_toggle,
    bind_show_home_button,
    bind_room_controls,
    touch_room_created_at,
    create_room_sync
  };

  global.firebase_config = {
    apiKey: 'AIzaSyDo5BtxY6AE1cLsqJcML-AdijxLmtnrpn0',
    authDomain: 'solver-80ad0.firebaseapp.com',
    databaseURL: 'https://solver-80ad0-default-rtdb.firebaseio.com',
    projectId: 'solver-80ad0',
    storageBucket: 'solver-80ad0.firebasestorage.app',
    messagingSenderId: '639285537821',
    appId: '1:639285537821:web:399f1ab5f22f2ee64beaf4',
    measurementId: 'G-7GD00HE91K'
  };
})(window);