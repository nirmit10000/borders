// Tiny reactive store. Every feature reads state and subscribes to the keys it cares about,
// so new features plug in without touching existing ones:
//   store.on(['var', 'year'], (state, prev) => …)
// URL-hash persistence lives here too (HASH_KEYS: which keys are shareable and how).

export function createStore(initial) {
  let state = { ...initial };
  const subs = [];
  let queued = null;

  function flush() {
    const { prev, changed } = queued;
    queued = null;
    for (const [keys, fn] of subs) {
      if (!keys || keys.some((k) => changed.has(k))) {
        try { fn(state, prev, changed); } catch (e) { console.error(e); }
      }
    }
  }

  return {
    get: () => state,
    /** Merge a patch; subscribers run once per microtask with the union of changed keys. */
    set(patch) {
      const prev = state;
      const next = { ...state, ...patch };
      const changed = Object.keys(patch).filter((k) => !Object.is(prev[k], next[k]));
      if (!changed.length) return;
      state = next;
      if (!queued) {
        queued = { prev, changed: new Set(changed) };
        queueMicrotask(flush);
      } else changed.forEach((k) => queued.changed.add(k));
    },
    on(keys, fn) { subs.push([keys, fn]); return fn; },
  };
}

// ----------------------------------------------------------------------------------------------
// URL hash: short names, only non-default values
// ----------------------------------------------------------------------------------------------
const HASH_KEYS = {
  sel: 's', ver: 'm', level: 'l', res: 'h', scope: 'sc', var: 'v', year: 'y', mode: 'md', from: 'f',
  density: 'pk', basemap: 'b', overlays: 'o', threeD: '3d', hex: 'x', compare: 'cmp', view: 'at',
  ramp: 'r', rev: 'rv', breaks: 'bk', height: 'ht', heightBy: 'hb', state: 'st',
};

// a selection is written as <version>.<level>.<number>, e.g. 2008.ac.201 (numbers are stable, ids are not)
const enc = {
  sel: (v) => (v ? `${v.ver}.${v.level}.${v.no}` : ''),
  overlays: (v) => v.join(','),
  view: (v) => (v ? v.join('/') : ''),
};
const dec = {
  sel: (s) => { const m = /^(\w+)\.(ac|pc)\.(\d+)$/.exec(s); return m ? { ver: m[1], level: m[2], no: +m[3] } : null; },
  overlays: (s) => (s ? s.split(',') : []),
  res: (s) => (/^\d$/.test(s) ? +s : s),
  year: (s) => (s ? +s : null), from: (s) => (s ? +s : null),
  density: (s) => s === '1', threeD: (s) => s === '1', compare: (s) => s === '1', rev: (s) => s === '1',
  height: (s) => +s,
  view: (s) => s.split('/').map(Number),
};

export function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out = {};
  for (const [k, short] of Object.entries(HASH_KEYS)) {
    if (!p.has(short)) continue;
    const raw = p.get(short);
    out[k] = dec[k] ? dec[k](raw) : raw;
  }
  return out;
}

export function writeHash(state, defaults) {
  const p = new URLSearchParams();
  for (const [k, short] of Object.entries(HASH_KEYS)) {
    let v = state[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length && !(defaults[k] || []).length)) continue;
    if (typeof v === 'boolean') { if (v === !!defaults[k]) continue; v = v ? '1' : '0'; }
    const s = enc[k] ? enc[k](v) : String(v);
    const d = defaults[k] == null ? '' : (enc[k] ? enc[k](defaults[k]) : String(defaults[k]));
    if (s === '' || s === d) continue;
    p.set(short, s);
  }
  const str = p.toString().replace(/%7C/gi, '|').replace(/%3A/gi, ':').replace(/%2C/gi, ',').replace(/%2F/gi, '/');
  history.replaceState(null, '', str ? `#${str}` : location.pathname + location.search);
}
