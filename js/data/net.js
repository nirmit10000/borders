// Where data comes from. On the published site, config.json carries, per state, "cdn": jsDelivr's mirror of
// a commit holding only that state's data (jsDelivr serves a GitHub commit only while it is small, so each
// state has its own). The mirror is fast on routes where github.io is slow, but it serves byte ranges of
// its compressed copy, so from it we read whole files (they compress well). Any failure falls back to this
// site, read with HTTP ranges. Locally there is no mirror.

let CDN = '';          // one mirror for every data path (older configs)
let CDNS = {};         // state code -> mirror of that state's data commit
const dead = new Set();
let VER = '';

export function initNet(cdn, version, perState = {}) { CDN = cdn || ''; CDNS = perState || {}; VER = version; }
function base(path) {
  const m = /^data\/([^/]+)\//.exec(path);
  const b = (m && CDNS[m[1]]) || CDN;
  return b && !dead.has(b) ? b : '';
}
export const usingCDN = (path) => !!base(path);
export const localURL = (path) => `${path}?v=${VER}`;

/** A Response for a data path: from its mirror if there is one, else (or on any failure) from this site. */
export async function fetchData(path, init) {
  const b = base(path);
  if (b) {
    try {
      const r = await fetch(b + path, init);
      if (r.ok) return r;
    } catch { /* fall back */ }
    console.warn('mirror unavailable, reading from the site:', path);
    dead.add(b);
  }
  return fetch(localURL(path), init);
}

export const getJSON = (path) => fetchData(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${path}`))));
