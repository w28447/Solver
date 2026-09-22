let cached_user_name = null;
export function get_cached_user_name() {
  return cached_user_name;
}

export function set_cached_user_name(name) {
  cached_user_name = name;
  return cached_user_name;
}

export function show_status(message, is_error = false) {
  const status_node = document.getElementById('shareStatus');
  if (!status_node) return;
  status_node.textContent = message;
  status_node.style.color = is_error ? '#ff8a8a' : '#93c5fd';
}

export async function make_member_id() {
  try {
    if (window.firebase && typeof window.firebase.auth === 'function') {
      const auth = window.firebase.auth();
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

export async function copy_to_clipboard(text) {
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

export function make_hash(string) {
  let hash = 0x4b9ace2f | 0;
  for (let i = 0; i < string.length; i++) {
    const x = (string.charCodeAt(i) + hash) | 0;
    hash = ((x ^ (x << 10)) + ((x ^ (x << 10)) >> 6)) | 0;
  }
  return Math.imul(0x8001, ((9 * hash) ^ ((9 * hash) >> 11)) | 0);
}

export function get_user_class(name) {
  switch (true){
    case name.includes('_115'):
    case name.includes('_935'):
      return 'rare'
    case !name.includes('_'):
      return 'special'
    default:
      return ''
  }
}

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
  const db = window.firebase.firestore();
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

  return groups;
}

export async function generate_user_name(uid) {
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

export async function record_user_connection(user_id) {
  const now = Date.now();
  const cached_connection = read_json_cache(USER_CONNECTION_CACHE_KEY);

  if (cached_connection && cached_connection.user_id === user_id
    && (now - cached_connection.last_connected_at) < RECONNECT_SKIP_WINDOW_MS) {
    set_cached_user_name(cached_connection.name);
    return;
  }

  try {
    if (!window.firebase || typeof window.firebase.firestore !== 'function') return;
    const db = window.firebase.firestore();
    const user_ref = db.collection('users').doc(user_id);

    const known_name = get_cached_user_name()
      || (cached_connection && cached_connection.user_id === user_id ? cached_connection.name : null);

    const doc = await user_ref.get();
    const data = doc.data() || {};
    const user_name = (doc.exists && data.defaultName) || known_name || await generate_user_name(user_id);
    set_cached_user_name(user_name);

    if (!doc.exists) {
      const new_doc = { count: 1, time: now };
      if (user_name !== 'unknown user') new_doc.defaultName = user_name;
      await user_ref.set(new_doc);
    } else {
      const update_data = {
        count: window.firebase.firestore.FieldValue.increment(1),
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
