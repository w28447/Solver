import { bind_menu_toggle, bind_show_home_button, bind_modal_toggle, set_menu_open } from '../shared/menu.js';
import { get_firebase_store } from '../shared/utils.js';

const WORD_GROUPS = {
  rave: ["harpoon", "trees", "dance", "basement", "slasher", "memories", "charms", "boat", "kevinsmith", "fairies"],
  spaceland: ["brute", "octonian", "rollercoaster", "arcade", "slide", "geyser", "zapper", "forgefreeze", "bumpercars", "yetieyes"],
  disco: ["rollerskates", "katana", "kungfu", "nunchucks", "dragon", "crane", "snake", "tiger", "pamgrier", "arthur"],
  disco2: ["disco", "ratking", "subway", "punks", "blackcat", "pinkcat", "inferno", "mcintosh", "staff", "shield"],
  extinction: ["cryptid", "drcross", "hives", "ancestor", "breeder", "kraken", "obelisk", "davidarcher", "nightfall", "samantha"],
  willard: ["shuffle", "winonawyler", "director", "death", "redwoods", "mephistopheles", "sixtymillion", "afterlife", "spaceland", "shaolin"],
  characters: ["werewolfpoets", "losangeles", "realitytv", "beverlyhills", "ghetto", "broadway", "comicbooks", "newyork", "actors", "audition"]
};

const ALL_GROUPS = Object.keys(WORD_GROUPS);

const ALL_WORDS = ALL_GROUPS.flatMap(group =>
  WORD_GROUPS[group].map(word => ({ group, word }))
);

const get_element = id => document.getElementById(id);

const letters_container = get_element("letters");
const prefix_display = get_element("prefixDisplay");
const letter_count = get_element("letterCount");
const miss_count_display = get_element("missCount");
const candidate_count = get_element("candidateCount");

let prefix = "";
let active_groups = new Set(ALL_GROUPS);
let miss_count = 0;

function get_candidates() {
  return ALL_WORDS.filter(({ group, word }) =>
    active_groups.has(group) && word.startsWith(prefix)
  );
}

function get_next_letters(candidates) {
  const letters = new Set(
    candidates
      .filter(({ word }) => word.length > prefix.length)
      .map(({ word }) => word[prefix.length].toUpperCase())
  );

  return [...letters].sort();
}

function get_remaining_groups(candidates) {
  const groups = new Set(candidates.map(({ group }) => group));

  return ALL_GROUPS.filter(group => groups.has(group));
}

function create_letter_button(letter, use_symbol) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "letter-button";
  button.dataset.letter = letter;

  if (!use_symbol) {
    button.title = `${letter} を入力`;
    button.textContent = letter;
    return button;
  }

  const image = new Image();
  image.src = `resource/symbols/${letter}.png`;
  image.alt = `記号 ${letter}`;
  image.className = "symbol-image";
  image.onerror = () => button.replaceChildren(letter);

  button.title = `記号（${letter}）を入力`;
  button.append(image);
  return button;
}

function render() {
  const candidates = get_candidates();
  const next_letters = get_next_letters(candidates);
  const use_symbol = prefix !== "";

  prefix_display.textContent = use_symbol
    ? prefix.toUpperCase().split("").join(" ")
    : "—";
  miss_count_display.textContent = `失敗：${String(miss_count).padStart(2, " ")}回`;
  candidate_count.textContent = `候補：${String(candidates.length).padStart(2, " ")}件`;
  letter_count.textContent = `${next_letters.length}文字`;

  letters_container.replaceChildren(
    ...next_letters.map(letter => create_letter_button(letter, use_symbol))
  );
}

function input_letter(event) {
  const button = event.target.closest(".letter-button");

  if (!button) return;

  prefix += button.dataset.letter.toLowerCase();
  render();
}

function clear_input() {
  prefix = "";
  render();
}

function reset_all() {
  active_groups = new Set(ALL_GROUPS);
  miss_count = 0;
  clear_input();
}

function next_word() {
  if (prefix === "") return;

  const remaining_groups = get_remaining_groups(get_candidates());

  if (remaining_groups.length === 0) {
    alert("候補がありません。入力を確認するか、すべてリセットしてください。");
    return;
  }

  active_groups = new Set(remaining_groups);
  miss_count++;
  clear_input();
}

function init_menu() {
  const manual_button = get_element("manualBtn");
  const manual_close_button = get_element("manualCloseBtn");

  bind_menu_toggle(
    get_element("menuToggleBtn"),
    get_element("menuCloseBtn"),
    "menuPanel",
    () => set_menu_open("menuPanel", false)
  );
  bind_show_home_button(get_element("showHomeBtn"));
  bind_modal_toggle(manual_button, manual_close_button, "manualModal");
}

function init_events() {
  letters_container.addEventListener("click", input_letter);
  get_element("nextWord").addEventListener("click", next_word);
  get_element("clearInput").addEventListener("click", clear_input);
  get_element("resetAll").addEventListener("click", reset_all);
}

async function record_access_count() {
  try {
    const store = get_firebase_store();
    const counter_doc = doc(store, 'analytics', 'scs_pageviews');
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
});

init_menu();
init_events();
render();