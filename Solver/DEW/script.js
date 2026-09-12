const DEFAULT_CANDIDATES = [
  { id: 'church', label: '教会時計', detail: '教会のドラゴンの上にある時計' },
  { id: 'radio', label: '教会機器', detail: '教会階段近くにある機器' },
  { id: 'power', label: '電源部屋', detail: '電源部屋にある電話' },
  { id: 'clock', label: '時計', detail: '時計塔と協会間にある2階通路の時計' },
  { id: 'globe', label: '地球儀', detail: 'サマンサの部屋を過ぎた場所の地球儀' },
  { id: 'crate', label: '木箱', detail: 'ダブルタップの上の部屋の木箱' },
  { id: 'tire', label: 'タイヤ', detail: '初期部屋とダブルタップの間にある車' },
  { id: 'spawn', label: '初期部屋', detail: 'クイックリバイブ向かい机の上の電話' }
];

const DISTANCE_MAP = {
  church: ['radio', 'power', 'globe', 'clock', 'tire', 'crate', 'spawn'],
  radio: ['power', 'church', 'globe', 'clock', 'tire', 'crate', 'spawn'],
  power: ['globe', 'radio', 'church', 'tire', 'crate', 'clock', 'spawn'],
  clock: ['radio', 'power', 'church', 'spawn', 'globe', 'tire', 'crate'],
  globe: ['power', 'radio', 'church', 'crate', 'tire', 'clock', 'spawn'],
  crate: ['tire', 'power', 'globe', 'spawn', 'radio', 'clock', 'church'],
  tire: ['crate', 'spawn', 'power', 'globe', 'radio', 'clock', 'church'],
  spawn: ['tire', 'crate', 'clock', 'power', 'radio', 'globe', 'church']
};

const MAX_HISTORY = 4;
const STORAGE_KEYS = {
  order: 'dewCandidateOrder',
  titles: 'dewCustomTitles',
  history: 'dewHistory'
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let whisper_candidates = clone(DEFAULT_CANDIDATES);

function load_custom_settings() {
  const saved_titles = localStorage.getItem(STORAGE_KEYS.titles);
  if (saved_titles) {
    try {
      const title_map = JSON.parse(saved_titles);
      DEFAULT_CANDIDATES.forEach((candidate) => {
        if (title_map[candidate.id]) candidate.label = title_map[candidate.id];
      });
    } catch (e) {}
  }

  const saved_order = localStorage.getItem(STORAGE_KEYS.order);
  if (!saved_order) {
    whisper_candidates = clone(DEFAULT_CANDIDATES);
    return;
  }

  try {
    const order_ids = JSON.parse(saved_order);
    const reordered = order_ids
      .map((id) => DEFAULT_CANDIDATES.find((c) => c.id === id))
      .filter(Boolean);
    DEFAULT_CANDIDATES.forEach((candidate) => {
      if (!reordered.includes(candidate)) reordered.push(candidate);
    });
    whisper_candidates = reordered;
  } catch (e) {
    whisper_candidates = clone(DEFAULT_CANDIDATES);
  }
}
load_custom_settings();

const show_area_title_editor_btn = document.getElementById('showAreaTitleEditorBtn');
const area_title_editor = document.getElementById('areaTitleEditor');
const area_title_actions = document.getElementById('areaTitleActions');
const save_room_title_btn = document.getElementById('saveRoomTitleBtn');
const reset_room_title_btn = document.getElementById('resetRoomTitleBtn');
const editor_rows_container = document.getElementById('editorRowsContainer');

const candidate_buttons = document.getElementById('candidateButtons');
const history_container = document.getElementById('historyContainer');
const history_section = document.getElementById('historySection');
const selected_label = document.getElementById('selectedLabel');
const reset_btn = document.getElementById('resetBtn');
const player_count_group = document.getElementById('playerCountGroup');
const room_input = document.getElementById('roomIdInput');
const join_room_btn = document.getElementById('joinRoomBtn');
const copy_room_btn = document.getElementById('copyRoomBtn');
const leave_room_btn = document.getElementById('leaveRoomBtn');
const share_status = document.getElementById('shareStatus');
const show_home_btn = document.getElementById('showHomeBtn');
const menu_toggle_btn = document.getElementById('menuToggleBtn');
const menu_close_btn = document.getElementById('menuCloseBtn');

const local_state = {
  selected_id: null,
  player_count: 1,
  history: JSON.parse(localStorage.getItem(STORAGE_KEYS.history) || '[]')
};

function close_title_editor() {
  area_title_editor.classList.add('hidden');
  area_title_actions.classList.add('hidden');
  show_area_title_editor_btn.textContent = '候補地名変更';
}

function move_candidate(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= whisper_candidates.length) return;
  [whisper_candidates[index], whisper_candidates[target]] = [whisper_candidates[target], whisper_candidates[index]];
  render_area_title_editor();
}

function render_area_title_editor() {
  if (!editor_rows_container) return;
  editor_rows_container.innerHTML = '';

  whisper_candidates.forEach((candidate, index) => {
    const row = document.createElement('div');
    row.className = 'editor-row';

    const at_start = index === 0;
    const at_end = index === whisper_candidates.length - 1;

    row.innerHTML = `
      <label class="menu-label" for="title_${candidate.id}">${candidate.label} (位置 ${index + 1})</label>
      <div class="editor-row-controls">
        <input id="title_${candidate.id}" class="menu-title-input" type="text" maxlength="20" placeholder="${candidate.label}" />
        <button type="button" class="btn btn-neutral move-up-btn" data-index="${index}" ${at_start ? 'disabled' : ''}>▲</button>
        <button type="button" class="btn btn-neutral move-down-btn" data-index="${index}" ${at_end ? 'disabled' : ''}>▼</button>
      </div>
    `;
    editor_rows_container.appendChild(row);
  });

  editor_rows_container.querySelectorAll('.move-up-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => move_candidate(parseInt(e.target.dataset.index, 10), -1));
  });
  editor_rows_container.querySelectorAll('.move-down-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => move_candidate(parseInt(e.target.dataset.index, 10), 1));
  });
}

if (save_room_title_btn) {
  save_room_title_btn.addEventListener('click', () => {
    const title_map = {};
    const order_ids = [];

    whisper_candidates.forEach((candidate) => {
      const input = document.getElementById(`title_${candidate.id}`);
      if (input && input.value.trim()) {
        candidate.label = input.value.trim();
        title_map[candidate.id] = candidate.label;
      }
      order_ids.push(candidate.id);
    });

    localStorage.setItem(STORAGE_KEYS.titles, JSON.stringify(title_map));
    localStorage.setItem(STORAGE_KEYS.order, JSON.stringify(order_ids));

    update_ui();
    room_sync.sync_current_state();
    close_title_editor();
  });
}

if (reset_room_title_btn) {
  reset_room_title_btn.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.titles);
    localStorage.removeItem(STORAGE_KEYS.order);
    whisper_candidates = clone(DEFAULT_CANDIDATES);

    if (area_title_editor && !area_title_editor.classList.contains('hidden')) {
      render_area_title_editor();
    }

    update_ui();
    room_sync.sync_current_state();
  });
}

if (show_area_title_editor_btn && area_title_editor && area_title_actions) {
  show_area_title_editor_btn.addEventListener('click', () => {
    const is_hidden = area_title_editor.classList.contains('hidden');
    area_title_editor.classList.toggle('hidden', !is_hidden);
    area_title_actions.classList.toggle('hidden', !is_hidden);
    show_area_title_editor_btn.textContent = is_hidden ? '候補地名変更を閉じる' : '候補地名変更';

    if (is_hidden) render_area_title_editor();
  });
}

function update_share_status(message, is_error = false) {
  if (!share_status) return;
  share_status.textContent = message;
  share_status.style.color = is_error ? '#ff8a8a' : '#93c5fd';
}

const room_sync = shared_util.create_room_sync({
  room_path_prefix: 'derEisendracheRooms',
  url_param: 'dew',
  get_state_payload: () => ({
    selectedId: local_state.selected_id,
    playerCount: local_state.player_count,
    history: local_state.history
  }),
  apply_remote_state: (payload) => {
    const is_payload_empty = !payload || (payload.selectedId === undefined && (!payload.history || payload.history.length === 0));

    if (is_payload_empty) {
      local_state.selected_id = null;
      local_state.history = [];
      if (payload && payload.playerCount !== undefined) local_state.player_count = payload.playerCount;
      update_ui();
      return;
    }

    if (payload.selectedId !== undefined) local_state.selected_id = payload.selectedId;
    if (payload.playerCount !== undefined) local_state.player_count = payload.playerCount;
    if (Array.isArray(payload.history)) local_state.history = payload.history;
    update_ui();
  },
  on_first_member_join: () => reset_state_to_default({ sync: true }),
  on_room_ready: (room_ref) => shared_util.touch_room_created_at(room_ref),
  on_status_change: update_share_status
});

function get_valid_next_candidates() {
  if (local_state.history.length >= MAX_HISTORY) return [];

  if (!local_state.selected_id) return [...whisper_candidates];

  const max_count = parseInt(local_state.player_count, 10) + 1;
  const nearby_ids = DISTANCE_MAP[local_state.selected_id] || [];

  return nearby_ids
    .filter((id) => id !== local_state.selected_id && !local_state.history.includes(id))
    .map((id) => whisper_candidates.find((c) => c.id === id))
    .filter(Boolean)
    .slice(0, max_count);
}

function record_history(id) {
  if (!local_state.history.includes(id)) local_state.history.push(id);
}

function select_candidate(id) {
  if (local_state.selected_id) record_history(local_state.selected_id);
  local_state.selected_id = id;

  if (local_state.history.length >= MAX_HISTORY - 1) record_history(id);

  update_ui();
  room_sync.sync_current_state();
}

function render_candidates() {
  if (!candidate_buttons) return;
  candidate_buttons.innerHTML = '';
  if (local_state.history.length >= MAX_HISTORY) return;

  get_valid_next_candidates().forEach((candidate) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'candidate-btn';
    btn.dataset.id = candidate.id;
    btn.innerHTML = `<div class="btn-title">${candidate.label}</div><div class="btn-sub">${candidate.detail}</div>`;
    btn.addEventListener('click', () => select_candidate(candidate.id));
    candidate_buttons.appendChild(btn);
  });
}

function render_history() {
  if (!history_container || !history_section) return;
  history_container.innerHTML = '';

  if (local_state.history.length === 0) {
    history_section.style.display = 'none';
    return;
  }

  history_section.style.display = 'block';
  local_state.history.forEach((id, index) => {
    const candidate = whisper_candidates.find((c) => c.id === id);
    if (!candidate) return;
    const chip = document.createElement('div');
    chip.className = 'history-chip';
    chip.textContent = `${index + 1}: ${candidate.label}`;
    history_container.appendChild(chip);
  });
}

function update_ui() {
  const has_started = local_state.selected_id !== null || local_state.history.length > 0;

  if (player_count_group) {
    player_count_group.querySelectorAll('.player-btn').forEach((btn) => {
      const count = parseInt(btn.dataset.count, 10);
      btn.classList.toggle('active', count === local_state.player_count);
      btn.disabled = has_started;
      btn.style.opacity = has_started ? '0.5' : '1';
      btn.style.cursor = has_started ? 'not-allowed' : 'pointer';
    });
  }

  if (selected_label) {
    const current = whisper_candidates.find((c) => c.id === local_state.selected_id);
    if (local_state.history.length >= MAX_HISTORY) {
      selected_label.textContent = `完了 (全${MAX_HISTORY}回達成)`;
    } else {
      selected_label.textContent = current ? `前回の位置: ${current.label}` : '前回の位置: 未選択';
    }
  }

  render_candidates();
  render_history();
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(local_state.history));
}

function reset_state_to_default({ sync = true } = {}) {
  local_state.selected_id = null;
  local_state.history = [];
  update_ui();
  if (sync) room_sync.sync_current_state();
}

if (player_count_group) {
  player_count_group.addEventListener('click', (e) => {
    const has_started = local_state.selected_id !== null || local_state.history.length > 0;
    if (has_started) return;

    const btn = e.target.closest('.player-btn');
    if (!btn || btn.disabled) return;

    local_state.player_count = parseInt(btn.dataset.count, 10);
    update_ui();
    room_sync.sync_current_state();
  });
}

if (reset_btn) {
  reset_btn.addEventListener('click', () => reset_state_to_default({ sync: true }));
}

shared_util.bind_room_controls(
  { room_input, join_room_btn, copy_room_btn, leave_room_btn },
  room_sync,
  'dew',
  update_share_status
);

shared_util.bind_menu_toggle(menu_toggle_btn, menu_close_btn, 'menuPanel', close_title_editor);
shared_util.bind_show_home_button(show_home_btn);

document.addEventListener('DOMContentLoaded', () => {
  update_ui();
  room_sync.init();
});
