const NETWORK = {
  Dept: { 1: 'Armo', 2: 'Infi', 3: 'Drag' },
  Drag: { 1: 'Supp', 2: 'Dept', 3: 'Infi' },
  Armo: { 1: 'Supp', 2: 'Tank', 3: 'Dept' },
  Supp: { 1: 'Drag', 2: 'Armo', 3: 'Tank' },
  Infi: { 1: 'Dept', 2: 'Tank', 3: 'Drag' },
  Tank: { 1: 'Infi', 2: 'Supp', 3: 'Armo' }
};

const ROOM_TEMPLATES = [
  { key: 'Dept', label: 'デパート' },
  { key: 'Drag', label: 'ドラゴンコマンド' },
  { key: 'Armo', label: '武器庫' },
  { key: 'Supp', label: '補給所' },
  { key: 'Infi', label: '診療所' },
  { key: 'Tank', label: '戦車工場' }
];

const room_keys = ROOM_TEMPLATES.map((t) => t.key);
const room_bit = Object.fromEntries(ROOM_TEMPLATES.map((t, i) => [t.key, 1 << i]));
const DEFAULT_ROOM_TITLES = Object.fromEntries(ROOM_TEMPLATES.map((t) => [t.key, t.label]));

const ROOM_STATUS_TYPES = Object.freeze({
  GREEN: 'green',
  NOT_GREEN: 'notgreen',
  PASSWORD: 'password'
});

const ROOM_TITLE_KEY = 'gorodKroviRoomTitles';

const selected_vals = Object.fromEntries(room_keys.map((k) => [k, null]));
let last_states = { green: null, password: null, not_greens: new Set() };

const precomputed_paths = new Map();

function set_area_title_editor_visible(is_visible) {
  const area_title_editor = document.getElementById('areaTitleEditor');
  const area_title_actions = document.getElementById('areaTitleActions');
  const show_area_title_editor_btn = document.getElementById('showAreaTitleEditorBtn');
  if (area_title_editor) area_title_editor.classList.toggle('hidden', !is_visible);
  if (area_title_actions) area_title_actions.classList.toggle('hidden', !is_visible);
  if (show_area_title_editor_btn) show_area_title_editor_btn.hidden = is_visible;
}

function get_area_title_map() {
  const raw = localStorage.getItem(ROOM_TITLE_KEY) || JSON.stringify(DEFAULT_ROOM_TITLES);
  try {
    return { ...DEFAULT_ROOM_TITLES, ...JSON.parse(raw) };
  } catch (e) {
    return { ...DEFAULT_ROOM_TITLES };
  }
}

function set_area_title_map(map) {
  localStorage.setItem(ROOM_TITLE_KEY, JSON.stringify(map));
}

function reset_area_title_map() {
  localStorage.removeItem(ROOM_TITLE_KEY);
  return { ...DEFAULT_ROOM_TITLES };
}

function get_area_short_label(title) {
  return String(title || '').trim().slice(0, 2) || '';
}

function apply_room_title_labels() {
  const titles = get_area_title_map();

  room_keys.forEach((room_key) => {
    const default_label = DEFAULT_ROOM_TITLES[room_key] || room_key;
    const label = titles[room_key] || default_label;

    const title_node = document.querySelector(`.room-card[data-room="${room_key}"] .room-title`);
    if (title_node) title_node.textContent = label;

    const input = document.getElementById(`title_${room_key}`);
    if (input) {
      const is_default = String(titles[room_key] || '').trim() === '' || label === default_label;
      input.value = is_default ? '' : label;
      input.placeholder = default_label;
    }

    const results_header = document.getElementById(`resultsHeader_${room_key}`);
    if (results_header) results_header.textContent = get_area_short_label(label);
  });
}

function render_room_grid() {
  const container = document.getElementById('roomGrid');
  if (!container) return;

  const titles = get_area_title_map();
  container.innerHTML = ROOM_TEMPLATES.map(({ key, label }) => {
    const title = titles[key] || label;
    return `
      <div class="room-card" data-room="${key}">
        <div class="room-header">
          <span class="room-title">${title}</span>
          <div class="status-toggle">
            <button type="button" class="status-btn" data-room="${key}" data-type="green">G</button>
            <button type="button" class="status-btn" data-room="${key}" data-type="notgreen">B</button>
            <button type="button" class="status-btn" data-room="${key}" data-type="password">P</button>
          </div>
        </div>
        <div class="valves-container">
          <div class="btn-group" data-room="${key}">
            <button type="button" class="dial-btn" data-val="1">1</button>
            <button type="button" class="dial-btn" data-val="2">2</button>
            <button type="button" class="dial-btn" data-val="3">3</button>
          </div>
          <div class="prob-display" id="pr_${key}">1:33 2:33 3:33</div>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.btn-group').forEach((group) => {
    const room = group.dataset.room;
    group.querySelectorAll('.dial-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const clicked_val = Number(e.target.dataset.val);
        group.querySelectorAll('.dial-btn').forEach((b) => b.classList.remove('active'));

        selected_vals[room] = selected_vals[room] === clicked_val ? null : clicked_val;
        if (selected_vals[room] !== null) e.target.classList.add('active');

        calculate();
        room_sync.sync_current_state();
      });
    });
  });

  document.querySelectorAll('.status-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      handle_state_toggle(e.target);
      calculate();
      room_sync.sync_current_state();
    });
  });
}

function get_status_button(room, type) {
  if (!room || !type) return null;
  return document.querySelector(`.status-btn[data-room="${room}"][data-type="${type}"]`);
}

function clear_status_button_state(room, type) {
  const button = get_status_button(room, type);
  if (button) button.classList.remove('active');
}

function sync_toggle_buttons_from_state() {
  document.querySelectorAll('.status-btn').forEach((btn) => {
    const { room, type } = btn.dataset;
    const is_active =
      (type === ROOM_STATUS_TYPES.GREEN && last_states.green === room) ||
      (type === ROOM_STATUS_TYPES.PASSWORD && last_states.password === room) ||
      (type === ROOM_STATUS_TYPES.NOT_GREEN && last_states.not_greens.has(room));
    btn.classList.toggle('active', is_active);
  });
}

function apply_selected_values_to_buttons() {
  Object.entries(selected_vals).forEach(([room, value]) => {
    const group = document.querySelector(`.btn-group[data-room="${room}"]`);
    if (!group) return;
    group.querySelectorAll('.dial-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.val) === Number(value));
    });
  });
}

function set_exclusive_role(type, room) {
  const other_type = type === ROOM_STATUS_TYPES.GREEN ? ROOM_STATUS_TYPES.PASSWORD : ROOM_STATUS_TYPES.GREEN;

  if (last_states[type]) clear_status_button_state(last_states[type], type);
  last_states[type] = room;

  last_states.not_greens.delete(room);
  clear_status_button_state(room, ROOM_STATUS_TYPES.NOT_GREEN);

  if (last_states[other_type] === room) {
    last_states[other_type] = null;
    clear_status_button_state(room, other_type);
  }
}

function handle_state_toggle(target) {
  const { room, type } = target.dataset;
  const is_active = target.classList.contains('active');

  if (is_active) {
    target.classList.remove('active');
    if (type === ROOM_STATUS_TYPES.GREEN) last_states.green = null;
    if (type === ROOM_STATUS_TYPES.PASSWORD) last_states.password = null;
    if (type === ROOM_STATUS_TYPES.NOT_GREEN) last_states.not_greens.delete(room);
    return;
  }

  if (type === ROOM_STATUS_TYPES.NOT_GREEN) {
    last_states.not_greens.add(room);
    if (last_states.green === room) {
      last_states.green = null;
      clear_status_button_state(room, ROOM_STATUS_TYPES.GREEN);
    }
    if (last_states.password === room) {
      last_states.password = null;
      clear_status_button_state(room, ROOM_STATUS_TYPES.PASSWORD);
    }
  } else {
    set_exclusive_role(type, room);
  }

  target.classList.add('active');
}

function reset_state_to_default({ sync = true } = {}) {
  room_keys.forEach((k) => { selected_vals[k] = null; });
  last_states = { green: null, password: null, not_greens: new Set() };

  apply_selected_values_to_buttons();
  sync_toggle_buttons_from_state();
  calculate();

  if (sync) room_sync.sync_current_state();
}

function update_share_status(message, is_error = false) {
  const status_node = document.getElementById('shareStatus');
  if (!status_node) return;
  status_node.textContent = message;
  status_node.style.color = is_error ? '#ff8a8a' : '#93c5fd';
}

const room_sync = shared_util.create_room_sync({
  room_path_prefix: 'gorodKroviRooms',
  url_param: 'gks',
  get_state_payload: () => ({
    selectedVals: { ...selected_vals },
    green: last_states.green,
    password: last_states.password,
    notGreens: Array.from(last_states.not_greens)
  }),
  apply_remote_state: (payload) => {
    const has_no_selection = !payload || (
      !payload.selectedVals && !payload.green && !payload.password && (!payload.notGreens || payload.notGreens.length === 0)
    );
    const all_values_null = payload && payload.selectedVals
      && Object.values(payload.selectedVals).every((v) => v === null)
      && !payload.green && !payload.password && (!payload.notGreens || payload.notGreens.length === 0);

    if (has_no_selection || all_values_null) {
      reset_state_to_default({ sync: false });
      return;
    }

    Object.assign(selected_vals, payload.selectedVals || {});
    last_states = {
      green: payload.green || null,
      password: payload.password || null,
      not_greens: new Set(Array.isArray(payload.notGreens) ? payload.notGreens : [])
    };

    apply_selected_values_to_buttons();
    sync_toggle_buttons_from_state();
    calculate();
  },
  on_first_member_join: () => reset_state_to_default({ sync: true }),
  on_room_ready: (room_ref) => shared_util.touch_room_created_at(room_ref),
  on_status_change: update_share_status
});

function init_precomputed_paths() {
  for (let start_idx = 0; start_idx < room_keys.length; start_idx++) {
    for (let end_idx = 0; end_idx < room_keys.length; end_idx++) {
      if (start_idx === end_idx) continue;

      const start = room_keys[start_idx];
      const end = room_keys[end_idx];
      const found_paths = [];
      const net_start = NETWORK[start];

      for (let dial = 1; dial <= 3; dial++) {
        const first_next = net_start[dial];
        const initial_mask = room_bit[start] | room_bit[first_next];

        const stack = [{
          curr: first_next,
          mask: initial_mask,
          path: [{ room: start, dial, next: first_next }]
        }];

        while (stack.length > 0) {
          const state = stack.pop();

          if (state.mask === 63) {
            if (state.curr === end) found_paths.push(state.path);
            continue;
          }

          const net_curr = NETWORK[state.curr];
          for (let next_dial = 1; next_dial <= 3; next_dial++) {
            const next_room = net_curr[next_dial];
            const next_bit = room_bit[next_room];
            if (state.mask & next_bit) continue;
            if (next_room === end && state.mask !== (63 ^ next_bit)) continue;

            stack.push({
              curr: next_room,
              mask: state.mask | next_bit,
              path: [...state.path, { room: state.curr, dial: next_dial, next: next_room }]
            });
          }
        }
      }

      precomputed_paths.set(`${start}_${end}`, found_paths);
    }
  }
}

function find_hamiltonian_paths(start, end) {
  return precomputed_paths.get(`${start}_${end}`) || [];
}

function update_live_probabilities() {
  const start = last_states.green;
  const end = last_states.password;

  const active_starts = start ? [start] : room_keys.filter((k) => !last_states.not_greens.has(k));
  const active_ends = end ? [end] : room_keys;

  const freqs = Object.fromEntries(room_keys.map((k) => [k, { 1: 0, 2: 0, 3: 0, total: 0 }]));

  active_starts.forEach((s) => {
    active_ends.forEach((e) => {
      if (s === e) return;
      find_hamiltonian_paths(s, e).forEach((path) => {
        path.forEach((step) => {
          freqs[step.room][step.dial]++;
          freqs[step.room].total++;
        });
        freqs[e].total++;
      });
    });
  });

  room_keys.forEach((k) => {
    const f = freqs[k];
    const total = f.total;
    const p1 = total ? Math.round((f[1] / total) * 100) : 33;
    const p2 = total ? Math.round((f[2] / total) * 100) : 33;
    const p3 = total ? Math.max(0, 100 - p1 - p2) : 34;

    const display_node = document.getElementById(`pr_${k}`);
    if (display_node) display_node.innerText = `1:${p1} 2:${p2} 3:${p3}`;
  });
}

function build_result_row(path, end) {
  const solution = {};
  path.forEach((step) => { solution[step.room] = step.dial; });
  solution[end] = 'P';

  const row = document.createElement('tr');
  room_keys.forEach((room_key) => {
    const span = document.createElement('span');
    span.className = 'num-span';

    const val = solution[room_key];
    span.innerText = val;
    if (val === 'P') {
      span.classList.add('pink-p');
    } else if (val === selected_vals[room_key]) {
      span.classList.add('no-change');
    } else {
      span.classList.add('change-required');
    }

    const cell = document.createElement('td');
    cell.appendChild(span);
    row.appendChild(cell);
  });

  return row;
}

function calculate() {
  update_live_probabilities();

  const start = last_states.green;
  const end = last_states.password;
  const panel = document.getElementById('resPanel');

  const all_paths = (start && end && start !== end) ? find_hamiltonian_paths(start, end) : [];
  if (all_paths.length === 0) {
    panel.style.display = 'none';
    return;
  }

  const fragment = document.createDocumentFragment();
  all_paths.forEach((path) => fragment.appendChild(build_result_row(path, end)));

  const body = document.getElementById('resBody');
  body.innerHTML = '';
  body.appendChild(fragment);
  panel.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  init_precomputed_paths();

  const room_input = document.getElementById('roomIdInput');
  const join_room_btn = document.getElementById('joinRoomBtn');
  const copy_room_btn = document.getElementById('copyRoomBtn');
  const leave_room_btn = document.getElementById('leaveRoomBtn');
  const menu_toggle_btn = document.getElementById('menuToggleBtn');
  const menu_close_btn = document.getElementById('menuCloseBtn');
  const show_area_title_editor_btn = document.getElementById('showAreaTitleEditorBtn');
  const save_room_title_btn = document.getElementById('saveRoomTitleBtn');
  const reset_room_title_btn = document.getElementById('resetRoomTitleBtn');
  const show_home_btn = document.getElementById('showHomeBtn');
  const reset_btn = document.getElementById('resetBtn');

  render_room_grid();
  set_area_title_editor_visible(false);
  apply_room_title_labels();
  document.querySelectorAll('.dial-btn').forEach((btn) => btn.classList.remove('active'));

  shared_util.bind_room_controls(
    { room_input, join_room_btn, copy_room_btn, leave_room_btn },
    room_sync,
    'gks',
    update_share_status
  );

  shared_util.bind_menu_toggle(menu_toggle_btn, menu_close_btn, 'menuPanel', () => {
    set_area_title_editor_visible(false);
  });

  shared_util.bind_show_home_button(show_home_btn);

  if (show_area_title_editor_btn) {
    show_area_title_editor_btn.addEventListener('click', () => {
      set_area_title_editor_visible(true);
      shared_util.set_menu_open('menuPanel', true);
    });
  }

  if (save_room_title_btn) {
    save_room_title_btn.addEventListener('click', () => {
      const next_titles = {};
      room_keys.forEach((room_key) => {
        const input = document.getElementById(`title_${room_key}`);
        next_titles[room_key] = (input && input.value.trim()) || DEFAULT_ROOM_TITLES[room_key];
      });

      set_area_title_map(next_titles);
      apply_room_title_labels();
      set_area_title_editor_visible(false);
      shared_util.set_menu_open('menuPanel', false);
      update_share_status('エリア名を保存しました');
    });
  }

  if (reset_room_title_btn) {
    reset_room_title_btn.addEventListener('click', () => {
      const default_titles = reset_area_title_map();
      room_keys.forEach((room_key) => {
        const input = document.getElementById(`title_${room_key}`);
        if (input) {
          input.value = '';
          input.placeholder = default_titles[room_key];
        }
      });

      apply_room_title_labels();
      set_area_title_editor_visible(false);
      shared_util.set_menu_open('menuPanel', false);
      update_share_status('エリア名を初期値に戻しました');
    });
  }

  if (reset_btn) {
    reset_btn.addEventListener('click', () => reset_state_to_default({ sync: true }));
  }

  room_sync.init();
  calculate();
});
