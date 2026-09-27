import { doc, updateDoc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { get_firebase_store } from '../shared/utils.js';
import { bind_menu_toggle, bind_show_home_button } from '../shared/menu.js';

const CYCLE_DAYS_COUNT = 49;
// 開始タイムスタンプ: 2018-03-29 00:00:00 UTC (JST 09:00:00)
const BASE_CYCLE_EPOCH_SEC = 1522281600;
const CYCLE_LENGTH_SEC = CYCLE_DAYS_COUNT * 86400; // 4,233,600 秒
const TIER_SEPARATOR = "----------------";

const GUM_DATA_MAP = {
  "メガ": { slug: "", color: "", tier: "mega" },
  "肌身離さず": { slug: "aftertaste", color: "#0091FF", tier: "mega" },
  "板張り職人": { slug: "board_games", color: "#0091FF", tier: "mega" },
  "死の板": { slug: "board_to_death", color: "#23C734", tier: "mega" },
  "炎上": { slug: "burned_out", color: "#FFA033", tier: "mega" },
  "ハイハイ": { slug: "crawl_space", color: "#8A1CE7", tier: "mega" },
  "世界の終焉": { slug: "dead_of_nuclear_winter", color: "#8A1CE7", tier: "mega" },
  "乱れ撃ち": { slug: "disorderly_combat", color: "#23C734", tier: "mega" },
  "刹那の強化": { slug: "ephemeral_enhancement", color: "#8A1CE7", tier: "mega" },
  "悪魔の兵器": { slug: "fatal_contraption", color: "#8A1CE7", tier: "mega" },
  "おまじない": { slug: "flavor_hexed", color: "#FFA033", tier: "mega" },
  "透明人間": { slug: "idle_eyes", color: "#8A1CE7", tier: "mega" },
  "運だめし": { slug: "im_feelin_lucky", color: "#8A1CE7", tier: "mega" },
  "一掃セール": { slug: "immolation_liquidation", color: "#8A1CE7", tier: "mega" },
  "すご腕職人": { slug: "licensed_contractor", color: "#8A1CE7", tier: "mega" },
  "ヘッドバン": { slug: "mind_blown", color: "#8A1CE7", tier: "mega" },
  "不死鳥": { slug: "phoenix_up", color: "#8A1CE7", tier: "mega" },
  "電撃ポップ": { slug: "pop_shocks", color: "#FFA033", tier: "mega" },
  "再発注": { slug: "respin_cycle", color: "#8A1CE7", tier: "mega" },
  "危険な滑り": { slug: "slaughter_slide", color: "#FFA033", tier: "mega" },
  "マジックマ": { slug: "unbearable", color: "#FFA033", tier: "mega" },
  "プラスワン": { slug: "unquenchable", color: "#FFA033", tier: "mega" },
  "Wスコア": { slug: "whos_keeping_score", color: "#8A1CE7", tier: "mega" },

  "レアメガ": { slug: "", color: "", tier: "rare" },
  "弾丸強化": { slug: "bullet_boost", color: "#8A1CE7", tier: "rare" },
  "隠しだま": { slug: "cache_back", color: "#8A1CE7", tier: "rare" },
  "箱パワー": { slug: "crate_power", color: "#FFA033", tier: "rare" },
  "へそくり": { slug: "extra_credit", color: "#8A1CE7", tier: "rare" },
  "恐怖の視線": { slug: "fear_in_headlights", color: "#8A1CE7", tier: "rare" },
  "キルジョイ": { slug: "kill_joy", color: "#8A1CE7", tier: "rare" },
  "サービス品": { slug: "on_the_house", color: "#8A1CE7", tier: "rare" },
  "おまけPERK": { slug: "soda_fountain", color: "#FFA033", tier: "rare" },
  "時の恵み": { slug: "temporal_gift", color: "#0091FF", tier: "rare" },
  "死体歩き": { slug: "undead_man_walking", color: "#23C734", tier: "rare" },
  "壁パンチ": { slug: "wall_power", color: "#FFA033", tier: "rare" },

  "超レアメガ": { slug: "", color: "", tier: "ultra" },
  "ヘッドガン": { slug: "head_drama", color: "#0091FF", tier: "ultra" },
  "キルタイム": { slug: "killing_time", color: "#8A1CE7", tier: "ultra" },
  "臨死体験": { slug: "near_death_experience", color: "#0091FF", tier: "ultra" },
  "PERKマニア": { slug: "perkaholic", color: "#FFA033", tier: "ultra" },
  "パワー集約": { slug: "power_vacuum", color: "#0091FF", tier: "ultra" },
  "利益分配": { slug: "profit_sharing", color: "#23C734", tier: "ultra" },
  "完全無欠": { slug: "reign_drops", color: "#8A1CE7", tier: "ultra" },
  "強制終了": { slug: "round_robbin", color: "#8A1CE7", tier: "ultra" },
  "秘密の客": { slug: "secret_shopper", color: "#23C734", tier: "ultra" },
  "自己治療": { slug: "self_medication", color: "#FFA033", tier: "ultra" },
  "無料セール": { slug: "shopping_free", color: "#23C734", tier: "ultra" }
};

let all_recipes = [];
let active_cycle_day = null;
let accordion_needs_render = true;
let filter_output_active = true;
let filter_input_active = true;

function calculate_current_cycle_day(now = new Date()) {
  const current_sec = Math.floor(now.getTime() / 1000);
  const elapsed = current_sec - BASE_CYCLE_EPOCH_SEC;
  const mod_sec = ((elapsed % CYCLE_LENGTH_SEC) + CYCLE_LENGTH_SEC) % CYCLE_LENGTH_SEC;
  const day_index = Math.floor(mod_sec / 86400); // 0 〜 48
  return day_index + 1; // 1 〜 49
}

function get_formatted_time_to_next_9am(now = new Date()) {
  const next_utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  const total_seconds = Math.max(0, Math.floor((next_utc - now) / 1000));

  const hours = String(Math.floor(total_seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total_seconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(total_seconds % 60).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function get_day_start_sec(now = new Date()) {
  const current_sec = Math.floor(now.getTime() / 1000);
  return current_sec - (current_sec % 86400);
}

function format_ymd_utc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function get_date_for_day_offset(day_offset, now = new Date()) {
  const target_sec = get_day_start_sec(now) + (day_offset * 86400);
  return format_ymd_utc(new Date(target_sec * 1000));
}

function get_next_calendar_date_for_cycle_day(target_day, current_day = calculate_current_cycle_day(), now = new Date()) {
  let day_offset = target_day - current_day;
  if (day_offset < 0) day_offset += CYCLE_DAYS_COUNT;
  return get_date_for_day_offset(day_offset, now);
}

function get_cycle_day_order(current_day) {
  const order = [];
  for (let offset = 1; offset <= CYCLE_DAYS_COUNT; offset++) {
    order.push(((current_day - 1 + offset) % CYCLE_DAYS_COUNT) + 1);
  }
  return order;
}

function parse_recipe_csv(csv_text) {
  const lines = csv_text.trim().split(/\r?\n/);
  if (lines.length <= 1) return null;

  const parsed = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s) => s.trim());
    if (cols.length < 5) continue;

    const day = parseInt(cols[0], 10);
    const slot = parseInt(cols[1], 10);
    const output_name = cols[2];
    const output_count = parseInt(cols[3] || '1', 10);

    const inputs = [];
    if (cols[4] && cols[5]) inputs.push({ name: cols[4], count: parseInt(cols[5], 10) });
    if (cols[6] && cols[7]) inputs.push({ name: cols[6], count: parseInt(cols[7], 10) });
    if (cols[8] && cols[9]) inputs.push({ name: cols[8], count: parseInt(cols[9], 10) });

    if (day && slot && output_name) {
      parsed.push({ day, slot, output_name, output_count, inputs });
    }
  }

  return parsed.length > 0 ? parsed : null;
}

async function load_recipe_data() {
  try {
    const res = await fetch('./resource/recipe.csv');
    const text = await res.text();
    all_recipes = parse_recipe_csv(text) || [];
  } catch (err) {
    console.info('[NCC] Using built-in recipe dataset (CSV fetch bypassed or offline).');
  }
}

let gum_image_dir = 'gumimg_d';

function render_gum_icon(gum_name) {
  const gum_info = GUM_DATA_MAP[gum_name] || { slug: '', color: '#0369a1' };
  const img_path = gum_info.slug ? `./resource/${gum_image_dir}/${gum_info.slug}.png` : '';
  const bg_color = gum_info.color || '#0369a1';
  const initial = gum_name ? gum_name.charAt(0) : '?';

  if (img_path) {
    return `
      <div class="gum-img-wrap" title="${gum_name}" style="background: radial-gradient(circle at 35% 35%, ${bg_color}, #090d16);">
        <img 
          src="${img_path}" 
          alt="${gum_name}" 
          class="gum-img" 
          loading="lazy" 
          onerror="this.onerror=null; this.parentElement.innerHTML='<span class=\\'gum-fallback-icon\\'>${initial}</span>';"
        />
      </div>
    `;
  }

  return `
    <div class="gum-img-wrap" title="${gum_name}" style="background: radial-gradient(circle at 35% 35%, ${bg_color}, #090d16);">
      <span class="gum-fallback-icon">${initial}</span>
    </div>
  `;
}

function render_recipe_card(recipe) {
  const { slot, output_name, output_count, inputs } = recipe;

  const ingredients_html = inputs.map((input) => `
    <div class="gum-item input-gum">
      ${render_gum_icon(input.name)}
      <div class="gum-info">
        <span class="gum-name" title="${input.name}">${input.name}</span>
        <span class="gum-qty">×${input.count}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="recipe-card" data-output="${output_name}">
      <div class="card-slot">
        <span>レシピ ${slot}</span>
      </div>
      <div class="recipe-flow">
        <div class="ingredients-group">
          ${ingredients_html}
        </div>
        <div class="flow-arrow" aria-label="変換">➔</div>
        <div class="output-group">
          <div class="gum-item output-gum">
            ${render_gum_icon(output_name)}
            <div class="gum-info">
              <span class="gum-name" title="${output_name}">${output_name}</span>
              <span class="gum-qty">完成数: ×${output_count}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function render_today_section() {
  const current_day = calculate_current_cycle_day();
  active_cycle_day = current_day;

  const today_recipes_grid_el = document.getElementById('todayRecipesGrid');
  const today_recipes = all_recipes.filter((r) => r.day === current_day).sort((a, b) => a.slot - b.slot);

  if (today_recipes_grid_el) {
    today_recipes_grid_el.innerHTML = today_recipes.map((r) => render_recipe_card(r)).join('');
  }
}

function render_full_cycle_accordion_content() {
  const accordion_content_el = document.getElementById('accordionContent');
  if (!accordion_content_el) return;

  const current_day = calculate_current_cycle_day();

  const day_groups = new Map();
  all_recipes.forEach((r) => {
    if (!day_groups.has(r.day)) {
      day_groups.set(r.day, []);
    }
    day_groups.get(r.day).push(r);
  });

  const cards_html = get_cycle_day_order(current_day).map((day, index) => {
    const recipes = (day_groups.get(day) || []).slice().sort((a, b) => a.slot - b.slot);
    const next_date = get_date_for_day_offset(index + 1);

    return `
      <div class="cycle-day-card" id="cycle-day-${day}">
        <div class="cycle-day-header">
          <div class="cycle-day-title">
            <span>次回: ${next_date}</span>
          </div>
        </div>
        <div class="recipes-grid">
          ${recipes.map((r) => render_recipe_card(r)).join('')}
        </div>
      </div>
    `;
  }).join('');

  accordion_content_el.innerHTML = cards_html;
  accordion_needs_render = false;
}

function render_full_cycle_accordion() {
  accordion_needs_render = true;
  const accordion_content_el = document.getElementById('accordionContent');
  if (accordion_content_el && accordion_content_el.classList.contains('open')) {
    render_full_cycle_accordion_content();
  }
}

function get_all_gum_names() {
  const all_names = Object.keys(GUM_DATA_MAP);

  const mega = all_names.filter(n => GUM_DATA_MAP[n].tier === "mega" && n !== "メガ");
  const rare = all_names.filter(n => GUM_DATA_MAP[n].tier === "rare" && n !== "レアメガ");
  const ultra = all_names.filter(n => GUM_DATA_MAP[n].tier === "ultra" && n !== "超レアメガ");

  return [
    TIER_SEPARATOR, ...mega,
    TIER_SEPARATOR, ...rare,
    TIER_SEPARATOR, ...ultra
  ];
}

function set_filter_active(button, is_active) {
  button.classList.toggle('active', is_active);
  button.setAttribute('aria-pressed', String(is_active));
}

function setup_search_features() {
  const trigger = document.getElementById('customSelectTrigger');
  const dropdown = document.getElementById('customSelectDropdown');
  const clear_btn = document.getElementById('clearSearchBtn');
  const filter_output_btn = document.getElementById('filterOutputBtn');
  const filter_input_btn = document.getElementById('filterInputBtn');
  const results_section = document.getElementById('searchResultsSection');

  let selected_value = '';
  let separator_index = 0;

  get_all_gum_names().forEach((name) => {
    if (name === TIER_SEPARATOR) {
      separator_index += 1;
      const separator = document.createElement('div');
      separator.className = 'custom-select-separator';

      if (separator_index === 1) {
        separator.textContent = 'メガ';
        separator.style.color = "#23C734";
      } else if (separator_index === 2) {
        separator.textContent = 'レアメガ';
        separator.style.color = "#FFC837";
      } else if (separator_index === 3) {
        separator.textContent = '超レアメガ';
        separator.style.color = "#8A1CE7";
      } else {
        separator.textContent = 'その他';
      }

      dropdown.appendChild(separator);
      return;
    }

    const opt = document.createElement('div');
    opt.className = 'custom-select-option';
    opt.dataset.value = name;

    const is_output = all_recipes.some(r => r.output_name === name);
    const is_input = all_recipes.some(r => r.inputs.some(i => i.name === name));

    let role_html = '';
    if (is_output && is_input) {
      role_html = `
        <div class="gum-role-container">
          <span class="gum-role-tag input">素</span>
          <span class="gum-role-tag output">完</span>
        </div>
      `;
    } else if (is_output) {
      role_html = `<span class="gum-role-tag output single">完</span>`;
    } else if (is_input) {
      role_html = `<span class="gum-role-tag input single">素</span>`;
    }

    opt.innerHTML = `
      ${render_gum_icon(name)}
      <span class="gum-name">${name}</span>
      ${role_html}
    `;
    opt.addEventListener('click', () => {
      selected_value = name;
      trigger.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          ${render_gum_icon(name)}
          <span class="gum-name" style="font-size:14px; font-weight:700;">${name}</span>
        </div>
      `;
      dropdown.classList.remove('open');
      perform_search(name);
    });
    dropdown.appendChild(opt);
  });

  if (trigger && dropdown) {
    trigger.addEventListener('click', () => {
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  const search_index = all_recipes.map((r) => ({
    recipe: r,
    output_lower: r.output_name.toLowerCase(),
    inputs_lower: r.inputs.map((input) => input.name.toLowerCase())
  }));

  function perform_search(query) {
    if (query === TIER_SEPARATOR) return;
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed) {
      results_section.classList.remove('active');
      return;
    }

    const matched_recipes = search_index
      .filter((entry) => (
        (filter_output_active && entry.output_lower.includes(trimmed)) ||
        (filter_input_active && entry.inputs_lower.some((name) => name.includes(trimmed)))
      ))
      .map((entry) => entry.recipe);

    const current_day = calculate_current_cycle_day();
    matched_recipes.sort((a, b) => {
      const get_days_diff = (day) => {
        let diff = day - current_day;
        if (diff < 0) diff += CYCLE_DAYS_COUNT;
        return diff;
      };
      return get_days_diff(a.day) - get_days_diff(b.day) || a.slot - b.slot;
    });

    results_section.classList.add('active');
    results_section.innerHTML = `
      <div class="results-heading">
        <h3 class="results-title" id="searchResultsTitle">「${query}」の検索結果</h3>
        <span id="searchResultsCount" class="results-count">${matched_recipes.length}件のレシピが見つかりました</span>
      </div>
      <div id="searchResultsGrid" class="results-grid">
        ${matched_recipes.length === 0 ? `
          <div class="no-results">
            該当するレシピは見つかりませんでした
          </div>
        ` : matched_recipes.map((r) => {
          const next_date = get_next_calendar_date_for_cycle_day(r.day, current_day);
          const is_today = r.day === current_day;

          return `
            <div class="result-card">
              <div class="result-header">
                <span class="result-date">${is_today ? '本日開催中！' : `次回: ${next_date}`}</span>
              </div>
              ${render_recipe_card(r)}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  if (clear_btn) {
    clear_btn.addEventListener('click', () => {
      selected_value = '';
      if (trigger) trigger.innerHTML = `<span class="custom-select-placeholder">-- ガム一覧から選択 --</span>`;
      results_section.classList.remove('active');
    });
  }

  if (filter_output_btn) {
    filter_output_btn.addEventListener('click', () => {
      filter_output_active = !filter_output_active;
      set_filter_active(filter_output_btn, filter_output_active);
      if (selected_value) perform_search(selected_value);
    });
  }

  if (filter_input_btn) {
    filter_input_btn.addEventListener('click', () => {
      filter_input_active = !filter_input_active;
      set_filter_active(filter_input_btn, filter_input_active);
      if (selected_value) perform_search(selected_value);
    });
  }
}

function setup_accordion() {
  const toggle_btn = document.getElementById('accordionToggleBtn');
  const content = document.getElementById('accordionContent');

  function set_accordion_open(is_open) {
    if (!content || !toggle_btn) return;
    toggle_btn.setAttribute('aria-expanded', String(is_open));
    content.setAttribute('aria-hidden', String(!is_open));
    content.classList.toggle('open', is_open);

    if (is_open && accordion_needs_render) render_full_cycle_accordion_content();
  }

  if (toggle_btn && content) {
    toggle_btn.addEventListener('click', () => {
      const is_open = toggle_btn.getAttribute('aria-expanded') === 'true';
      set_accordion_open(!is_open);
    });
  }
}

function setup_shared_menu() {
  const toggle_btn = document.getElementById('menuToggleBtn');
  const close_btn = document.getElementById('menuCloseBtn');
  const home_btn = document.getElementById('showHomeBtn');

  bind_menu_toggle(toggle_btn, close_btn, 'menuPanel');
  bind_show_home_button(home_btn);

  const menu_header = document.getElementById('menuHeaderTitle');
  let click_count = 0;
  let last_click_time = 0;

  if (menu_header) {
    menu_header.addEventListener('click', () => {
      const now = Date.now();
      if (now - last_click_time > 5000) {
        click_count = 0;
      }
      click_count++;
      last_click_time = now;

      if (click_count >= 10) {
        gum_image_dir = (gum_image_dir === 'gumimg_d' ? 'gumimg_c' : 'gumimg_d');
        render_today_section();
        render_full_cycle_accordion();
        click_count = 0;
        alert(`ガム画像を切り替えました`);
      }
    });
  }
}

function start_auto_update_loop() {
  const timer_el = document.getElementById('countdownTimer');
  let interval_id = null;

  function tick() {
    if (timer_el) timer_el.textContent = get_formatted_time_to_next_9am();

    const current_day = calculate_current_cycle_day();
    if (active_cycle_day !== null && current_day !== active_cycle_day) {
      console.info(`[NCC] 9:00 AM JST reached! Switching from Day ${active_cycle_day} to Day ${current_day}`);
      render_today_section();
      render_full_cycle_accordion();
    }
  }

  function schedule() {
    if (interval_id) clearInterval(interval_id);
    interval_id = setInterval(tick, document.hidden ? 15000 : 1000);
  }

  tick();
  schedule();

  document.addEventListener('visibilitychange', () => {
    tick();
    schedule();
  });
}

async function record_access_count() {
  try {
    const store = get_firebase_store();
    const counter_doc = doc(store, 'analytics', 'ncc_pageviews');
    const payload = { views: increment(1) };

    try {
      await updateDoc(counter_doc, payload);
    } catch (update_err) {
      await setDoc(counter_doc, payload, { merge: true });
    }
  } catch (err) {
    console.warn('Failed to record access count:', err.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  record_access_count();
  await load_recipe_data();
  render_today_section();
  setup_search_features();
  setup_accordion();
  setup_shared_menu();
  start_auto_update_loop();
});
