// Election results card for a selected seat (decision R1, 22 Nov 2026).
//   data/<state>/results/index.json lists the elections held on each map version; data/<state>/results/<key>.json
//   holds the ECI results per AC and PC (top 3 candidates + Others, NOTA, electors, turnout, winner, margin).
//   An Assembly seat shows its Assembly results and, for Lok Sabha years, the votes cast in it as a segment (a
//   "lead", not a result). A Lok Sabha seat shows its results and, for Assembly years, its segments' votes summed.
//   Loaded on demand and cached; the panel renders the card synchronously once the data is in.
import { esc } from '../scales.js';
import { getJSON } from '../data/net.js';

let CTX = null;
let IDX;                       // undefined: not asked; null: none; object: loaded
let idxP = null;
const DOCS = new Map();        // key -> doc | Promise
const pick = {};               // `${ver}:${level}` -> chosen election key (this visit)
const GREY = '#8d877b';
const HOUSE = { VS: 'Assembly', LS: 'Lok Sabha' };
const sentence = (g) => { const t = String(g).trim(); return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : ''; };
const fmt = (n) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString('en-IN'));

export function initResults(ctx) { CTX = ctx; }

function loadIndex(onReady) {
  if (IDX !== undefined || idxP) return;
  if (!CTX.STATE.results) { IDX = null; return; }
  idxP = getJSON(`data/${CTX.STATE.code}/results/index.json`)
    .then((d) => { IDX = d; }).catch(() => { IDX = null; }).finally(() => { idxP = null; onReady(); });
}
function loadDoc(key, onReady) {
  if (DOCS.has(key)) return;
  DOCS.set(key, getJSON(`data/${CTX.STATE.code}/results/${key}.json`)
    .then((d) => { DOCS.set(key, d); onReady(); })
    .catch(() => { DOCS.set(key, null); onReady(); }));
}

/** The elections that have a row for this seat's map version and level. */
function electionsFor(sel) {
  if (!IDX) return [];
  return IDX.elections.filter((e) => e.ver === sel.ver && (sel.level === 'ac' ? e.n_ac : e.n_pc));
}

export function choose(sel, key) { pick[`${sel.ver}:${sel.level}`] = key; }

/**
 * The card's HTML for the current selection: '' when the seat's map has no results, a placeholder while loading.
 * `rerender` is called when data arrive.
 */
export function resultsCard(st, unitNo, rerender) {
  if (!st.sel || st.sel.level === 'dt' || !CTX.STATE.results) return '';
  if (IDX === undefined) { loadIndex(rerender); return '<div class="rcard loading"><h2 class="h2">Election results</h2><p class="note">Loading…</p></div>'; }
  const els = electionsFor(st.sel);
  if (!els.length) return '';
  const own = st.sel.level === 'ac' ? 'VS' : 'LS';
  const pk = `${st.sel.ver}:${st.sel.level}`;
  let e = els.find((x) => x.key === pick[pk]);
  if (!e) e = [...els].reverse().find((x) => x.house === own) || els[els.length - 1];
  const doc = DOCS.get(e.key);
  if (doc === undefined || doc instanceof Promise) { loadDoc(e.key, rerender); }
  // year switch: one row per house, the seat's own house first
  const rows = ['VS', 'LS'].sort((a, b) => (a === own ? -1 : b === own ? 1 : 0)).map((h) => {
    const hs = els.filter((x) => x.house === h);
    if (!hs.length) return '';
    return `<div class="ryears"><span class="rh">${HOUSE[h]}</span>${hs.map((x) => `<button data-rk="${x.key}" class="${x.key === e.key ? 'on' : ''}" aria-pressed="${x.key === e.key}">${x.year}</button>`).join('')}</div>`;
  }).join('');
  const head = `<h2 class="h2">Election results <small>ECI, official</small></h2>${rows}`;
  if (doc === undefined || doc instanceof Promise) return `<div class="rcard">${head}<p class="note">Loading…</p></div>`;
  if (doc === null) return `<div class="rcard">${head}<p class="note warn">These results could not be loaded.</p></div>`;
  const u = doc[st.sel.level][String(unitNo)];
  const notes = (doc.notes || {})[`${st.sel.level}:${unitNo}`] || [];
  const kind = st.sel.level === 'ac' && e.house === 'LS' ? 'lead' : st.sel.level === 'pc' && e.house === 'VS' ? 'sum' : 'result';
  const what = { result: `${HOUSE[e.house]} election ${e.year}: result`,
    lead: `Lok Sabha election ${e.year}: votes cast in this Assembly segment (a lead, not a result)`,
    sum: `Assembly election ${e.year}: votes of its Assembly segments, summed (not an election of this seat)` }[kind];
  if (!u) return `<div class="rcard">${head}<div class="rkind">${esc(what)}</div><p class="note warn">No result for this seat in the source.${notes.length ? ` ${esc(notes.join(' '))}` : ''}</p></div>`;
  return `<div class="rcard">${head}<div class="rkind">${esc(what)}</div>${body(u, e, kind, notes)}
    <p class="note rsrc">Source: ${esc((e.source || 'Election Commission of India').split(',')[0])}. ${kind === 'lead' ? 'Shares of the EVM votes cast in this segment, NOTA included; postal ballots are counted only for the whole Lok Sabha seat.' : 'Shares of all votes for candidates and NOTA, postal ballots included.'}${e.gaps.length ? ` ${e.gaps.map(sentence).join(' ')}` : ''}</p></div>`;
}

function colourOf(party, bloc, key) {
  return (IDX.parties[party] || [])[1] || ((IDX.blocs[key] || {})[bloc] || [])[1] || GREY;
}
const partyTitle = (p) => (IDX.parties[p] || [])[0] || p;
const blocLabel = (b, key) => ((IDX.blocs[key] || {})[b] || [])[0] || b;

function body(u, e, kind, notes) {
  const cands = (u.c || []).filter((c) => c && Number.isFinite(c[3]));
  if (!cands.length) {   // nothing to show but the gap itself (e.g. a poll postponed): no zero figures
    const why = [u.x ? 'No votes for this seat in the source.' : '', ...notes.map(sentence)].filter(Boolean);
    return `<p class="note warn">${why.map(esc).join(' ') || 'No votes for this seat in the source.'}</p>`;
  }
  const total = cands.reduce((t, c) => t + c[3], 0) + (u.o || 0) + (u.nota || 0);
  const pct = (v) => (total > 0 ? (100 * v) / total : NaN);
  const p1 = (v) => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '–');
  const top = cands[0];
  const verb = { result: 'won', lead: 'led', sum: 'had the most votes' }[kind];
  const by = { result: 'by', lead: 'by', sum: ', ahead by' }[kind];
  const win = top ? `<div class="rwin"><i style="background:${colourOf(top[1], top[2], e.key)}"></i><div><b>${esc(top[0] || partyTitle(top[1]) || top[1])}</b>${top[0] ? ` <span class="rp" title="${esc(partyTitle(top[1]))}">${esc(top[1] || '')}</span>` : ''}
      <div class="rm">${verb}${u.m != null ? `${by.startsWith(',') ? '' : ' '}${by} <b>${fmt(u.m)}</b> votes${u.mp != null ? ` (${u.mp.toFixed(1)}% of votes)` : ''}` : ''}${u.r ? `; runner-up ${esc(u.r)}` : ''}</div></div></div>` : '';
  const bar = (label, sub, v, col, title = '') => {
    const s = pct(v);
    return `<div class="rrow"><span class="rn"${title ? ` title="${esc(title)}"` : ''}>${label}${sub ? ` <small>${sub}</small>` : ''}</span><span class="rv">${p1(s)}</span>
      <span class="br"><i style="width:${Number.isFinite(s) ? Math.max(1, s) : 0}%;background:${col}"></i></span><span class="sub">${fmt(v)} votes</span></div>`;
  };
  // summed Assembly votes of a Lok Sabha seat are party totals (no candidate): the party is the label
  const bars = cands.map((c) => (c[0]
    ? bar(esc(c[0]), `${esc(c[1] || '')}${c[2] && c[2] !== c[1] ? ` · ${esc(c[2])}` : ''}`, c[3], colourOf(c[1], c[2], e.key), `${partyTitle(c[1])}${c[2] ? `, ${blocLabel(c[2], e.key)}` : ''}`)
    : bar(esc(c[1] === 'IND' ? 'Independents' : (IDX.parties[c[1]] || [])[0] || c[1] || '–'), `${c[1] === 'IND' ? 'combined' : esc(c[1] || '')}${c[2] && c[2] !== c[1] ? ` · ${esc(c[2])}` : ''}`, c[3], colourOf(c[1], c[2], e.key), blocLabel(c[2], e.key) || ''))).join('')
    + (u.o ? bar('Others', '', u.o, GREY) : '') + (u.nota != null ? bar('NOTA', '', u.nota, '#b5ada0') : '');
  const facts = `<div class="rfacts"><span><small>Turnout</small>${u.t != null ? `${u.t.toFixed(1)}%` : '–'}</span><span><small>Electors</small>${fmt(u.e)}</span><span><small>Votes</small>${fmt(total)}</span></div>`;
  const warn = [u.x ? 'Incomplete in the source: the figures below may not cover every candidate or vote.' : '', ...notes.map(sentence)].filter(Boolean);
  return `${warn.length ? `<p class="note warn">${warn.map(esc).join(' ')}</p>` : ''}${win}<div class="rrows">${bars}</div>${facts}`;
}
