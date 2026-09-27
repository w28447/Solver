import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDo5BtxY6AE1cLsqJcML-AdijxLmtnrpn0',
  authDomain: 'solver-80ad0.firebaseapp.com',
  databaseURL: 'https://solver-80ad0-default-rtdb.firebaseio.com',
  projectId: 'solver-80ad0',
  storageBucket: 'solver-80ad0.firebasestorage.app',
  messagingSenderId: '639285537821',
  appId: '1:639285537821:web:399f1ab5f22f2ee64beaf4',
  measurementId: 'G-7GD00HE91K'
};

const USER_CONNECTION_CACHE_KEY = 'sharedUserConnectionCache';

let cached_user_name = null;
let firebase_app = null;

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

export async function copy_to_clipboard(text) {
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    throw new Error("Clipboard API is not supported in this browser.");
  }
  await navigator.clipboard.writeText(text);
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
  if (name.includes('_115') || name.includes('_935')) return 'rare';
  if (!name.includes('_')) return 'special';
  return '';
}

export function get_firebase_app() {
  if (!firebase_app) firebase_app = initializeApp(FIREBASE_CONFIG);
  return firebase_app;
}

export function get_firebase_store() {
  return getFirestore(get_firebase_app());
}

export async function make_member_id() {
  try {
    const auth = getAuth(get_firebase_app());
    let user = auth.currentUser;
    if (!user) {
      const credential = await signInAnonymously(auth);
      user = credential.user;
    }
    return user ? user.uid : null;
  } catch (e) {
    console.warn('make_member_id auth error:', e);
    return null;
  }
}

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
  const store = get_firebase_store();
  const [snap_a, snap_b, snap_c, snap_d] = await Promise.all([
    getDoc(doc(store, 'Words', 'groupA')),
    getDoc(doc(store, 'Words', 'groupB')),
    getDoc(doc(store, 'Words', 'groupC')),
    getDoc(doc(store, 'Words', 'groupD'))
  ]);

  return {
    a: snap_a.exists() ? Object.keys(snap_a.data() || {}) : [],
    b: snap_b.exists() ? Object.keys(snap_b.data() || {}) : [],
    c: snap_c.exists() ? Object.keys(snap_c.data() || {}) : [],
    d: snap_d.exists() ? Object.keys(snap_d.data() || {}) : []
  };
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
  const cached_connection = read_json_cache(USER_CONNECTION_CACHE_KEY);

  if (cached_connection && cached_connection.user_id === user_id && cached_connection.name) {
    set_cached_user_name(cached_connection.name);
    return;
  }

  try {
    const store = get_firebase_store();
    const user_ref = doc(store, 'users', user_id);

    const snapshot = await getDoc(user_ref);
    const data = snapshot.data() || {};
    const user_name = (snapshot.exists() && data.default_name) || await generate_user_name(user_id);
    set_cached_user_name(user_name);

    if (!snapshot.exists()) {
      const new_doc = { count: 1, time: Date.now() };
      if (user_name !== 'unknown user') new_doc.default_name = user_name;
      await setDoc(user_ref, new_doc);
    } else {
      const update_data = { count: increment(1), time: Date.now() };
      if (!data.default_name && user_name !== 'unknown user') {
        update_data.default_name = user_name;
      }
      await updateDoc(user_ref, update_data);
    }

    write_json_cache(USER_CONNECTION_CACHE_KEY, { user_id, name: user_name });
  } catch (e) {
    console.warn('Failed to record user connection in Firestore:', e);
  }
}
