export async function store(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export async function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
