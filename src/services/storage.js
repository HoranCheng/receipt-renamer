export async function store(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_e) {
    // localStorage may be full or unavailable
  }
}

export async function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_e) {
    return fallback;
  }
}
