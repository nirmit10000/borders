// Sidebar: breadcrumb, the state's two maps (landing), a selected seat (its counterparts on the other
// map, population, reservation, source), the clicked hexagon / "you are here", and About.
// Pure rendering from state + data; actions go through ctx.act (structure from India Hex).
import { esc, fmtValue, compact } from '../scales.js';
import { units, unit, list, fullName, resTag } from '../data/units.js';
import { lensOf, seriesById, allSeries } from '../lens.js';
import { lineKey } from './controls.js';
import { fmtCoords } from './geo.js';

let tok = 0;
let CTX = null;
const ICON = {
  zoom: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  link: '<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  gmap: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  earth: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

export function initPanel(ctx) {
  CTX = ctx;
  const click = (e) => {
    const t = e.target.closest('[data-sel],[data-act],[data-lv],[data-lvl]');
    if (!t) return;
    if (t.dataset.sel) {
      if (t.dataset.sel === 'home') ctx.act.clearSelection();
      else { const [v, l, id] = t.dataset.sel.split(':'); ctx.act.select(v, l, +id); }
    } else if (t.dataset.lv) ctx.S.set({ listVer: t.dataset.lv, filter: '', limit: 60 });
    else if (t.dataset.lvl) ctx.S.set({ level: t.dataset.lvl, filter: '', limit: 60 });
    else ctx.act.run(t.dataset.act);
  };
  for (const id of ['panel', 'crumbs']) document.getElementById(id).addEventListener('click', click);
  document.getElementById('panel').addEventListener('input', (e) => {
    if (e.target.id === 'listFilter') ctx.S.set({ filter: e.target.value, limit: 60 });
  });
  document.getElementById('panel').addEventListener('change', (e) => {
    if (e.target.id === 'statePick') ctx.act.switchState(e.target.value);
  });
}

// ------------------------------------------------------------------------------------------------
const VL = (v) => CTX.VMETA[v].label;
const LEVEL = (l) => CTX.cfg.boundaries.levels[l];
const tag = (u) => (resTag(u) ? `<span class="rtag">${resTag(u)}</span>` : '');
const approx = (v) => (CTX.VMETA[v].approximate ? `<span class="badge" title="Boundary placed by a fitted transform. ${esc(CTX.VMETA[v].short_note || '')}">approximate lines</span>` : '');

function statePicker() {
  const { cfg, STATE } = CTX;
  if (cfg.states.length < 2) return '';
  const opts = cfg.states.map((s) => `<option value="${s.code}"${s.code === STATE.code ? ' selected' : ''}>${esc(s.name)}${s.status === 'draft' ? ' (draft)' : ''}</option>`).join('');
  return `<label class="statepick"><span>State</span><select id="statePick" aria-label="Choose a state">${opts}</select><small>${cfg.states.length} states</small></label>`;
}
const seatBtn = (v, l, u) => `<button data-sel="${v}:${l}:${u.id}">${esc(fullName(u))}</button>`;

function crumbs(st) {
  const parts = [[CTX.STATE.name, 'home']];
  if (st.sel) {
    const u = unit(st.sel);
    parts.push([VL(st.sel.ver), null]);
    if (st.sel.level === 'ac' && u.pc != null) parts.push([`PC ${list(st.sel.ver, 'pc')[u.pc].name}`, `${st.sel.ver}:pc:${u.pc}`]);
    parts.push([u.name, null]);
  } else if (st.panel === 'about') parts.push(['About', null]);
  document.getElementById('crumbs').innerHTML = parts.map(([n, s], i) => (i === parts.length - 1 || !s
    ? `<span>${esc(n)}</span>${i < parts.length - 1 ? '<span class="sep">/</span>' : ''}` : `<button data-sel="${s}">${esc(n)}</button><span class="sep">/</span>`)).join('');
}

function googleLinks(lng, lat, z) {
  if (!CTX.cfg.features.google_links) return '';
  const gm = `https://www.google.com/maps/@${lat},${lng},${Math.round(z)}z/data=!3m1!1e3`;
  const ge = `https://earth.google.com/web/@${lat},${lng},300a,${Math.round(40000000 / 2 ** z)}d,35y,0h,0t,0r`;
  return `<a class="icon" href="${gm}" target="_blank" rel="noopener" title="Open in Google Maps (satellite)">${ICON.gmap}</a>
    <a class="icon" href="${ge}" target="_blank" rel="noopener" title="Open in Google Earth">${ICON.earth}</a>`;
}

function resCounts(v, l) {
  const c = { SC: 0, ST: 0 };
  for (const u of list(v, l)) if (c[u.res] != null) c[u.res]++;
  return `${c.SC} SC · ${c.ST} ST`;
}

// ---- landing ------------------------------------------------------------------------------------
function landing(st) {
  const { VERS, VMETA, STATE } = CTX;
  const nAc = list(VERS[0], 'ac').length; const nPc = list(VERS[0], 'pc').length;
  const cards = VERS.map((v) => {
    const m = VMETA[v];
    return `<div class="vcard">
      <div class="vhead">${lineKey(v)}<span class="vname">${esc(m.label)}</span>${approx(v)}</div>
      <div class="vlong">${esc(m.long)}${m.used ? `, ${esc(m.used)}` : ''}.</div>
      <div class="vfacts">${list(v, 'ac').length} Assembly seats (${resCounts(v, 'ac')}) · ${list(v, 'pc').length} Lok Sabha (${resCounts(v, 'pc')})</div>
      ${m.hide ? `<div class="vwarn">${esc(m.hide.reason)}</div>` : ''}
      <details class="vsrc"><summary>Sources</summary><ul>${m.sources.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>
    </div>`;
  }).join('');
  return `${statePicker()}<h1 class="title" style="margin-top:14px">Two maps</h1>
    <p class="lede">${nAc} Assembly and ${nPc} Lok Sabha seats, drawn by ${VERS.length === 2 ? 'two Orders' : `${VERS.length} Orders`}. Hover anywhere to see the seat on every map; click a seat to see where its people were, or went.</p>
    <div class="vcards">${cards}</div>
    ${seatList(st)}`;
}

function seatList(st) {
  const { VERS } = CTX;
  const v = VERS.includes(st.listVer) ? st.listVer : CTX.PRIMARY;
  const l = st.level;
  let rows = list(v, l);
  if (st.filter) {
    const q = st.filter.toLowerCase().trim();
    rows = rows.filter((u) => u.name.toLowerCase().includes(q) || (u.alt || '').toLowerCase().includes(q) || String(u.no) === q);
  }
  const lim = st.limit || 60;
  const row = (u) => {
    const pc = l === 'ac' && u.pc != null ? list(v, 'pc')[u.pc] : null;
    return `<button class="row" data-sel="${v}:${l}:${u.id}"><span class="rk">${u.no}</span><span class="nm">${esc(fullName(u))}${resTag(u) ? ` <small>${resTag(u)}</small>` : ''}${u.hidden ? ' <small>not drawn</small>' : ''}</span><span class="vl">${pc ? `<small>${esc(pc.name)}</small>` : (u.district ? `<small>${esc(u.district)}</small>` : '')}</span></button>`;
  };
  return `<h2 class="h2">Seats</h2>
    <div class="tabs">${VERS.map((x) => `<button data-lv="${x}" class="${x === v ? 'on' : ''}">${lineKey(x)}${esc(VL(x))}</button>`).join('')}
      <span class="tabs-gap"></span>${['ac', 'pc'].map((x) => `<button data-lvl="${x}" class="${x === l ? 'on' : ''}">${esc(LEVEL(x).short)}<small>${list(v, x).length}</small></button>`).join('')}</div>
    <input class="filter" id="listFilter" placeholder="Filter by name or number" value="${esc(st.filter)}">
    <div class="rows">${rows.slice(0, lim).map(row).join('') || '<div class="note">No matches.</div>'}</div>
    ${rows.length > lim ? `<button class="more" data-act="more">Show all ${rows.length}</button>` : ''}`;
}

// ---- a selected seat ----------------------------------------------------------------------------
function hero(st) {
  const u = unit(st.sel);
  const { ver: v, level: l } = st.sel;
  const links = [];
  if (l === 'ac' && u.pc != null) links.push(`<span>PC</span>${seatBtn(v, 'pc', list(v, 'pc')[u.pc])}`);
  if (u.district) links.push(`<span>District</span><span class="plain">${esc(u.district)}</span>`);
  const z = l === 'pc' ? 9 : 11;
  return `<div class="kicker">${lineKey(v)} ${esc(VL(v))} · ${esc(LEVEL(l).one)} · No. <b>${u.no}</b>${u.area ? ` · ${Math.round(u.area).toLocaleString('en-IN')} km²` : ''}</div>
    <h1 class="title${u.name.length > 20 ? ' small' : ''}">${esc(u.name)}${tag(u)}</h1>
    ${u.alt ? `<div class="alt">later spelled <b>${esc(u.alt)}</b></div>` : ''}
    <div class="meta">${links.join('')}${approx(v)}</div>
    <div class="acts">
      ${u.bbox ? `<button class="icon" data-act="zoom" title="Zoom to">${ICON.zoom}</button>` : ''}
      <button class="icon" data-act="copy" title="Copy link">${ICON.link}</button>
      ${u.lp ? googleLinks(u.lp[0], u.lp[1], z) : ''}
    </div>`;
}

/** Where the seat's people were (for the newer map) or went (for the older map), on each other version. */
function lineage(st) {
  const u = unit(st.sel);
  const { ver: v, level: l } = st.sel;
  if (u.hidden) {
    return `<div class="note warn">${esc(u.why || CTX.VMETA[v].hide?.reason || 'This seat is not drawn.')} It belongs to ${esc(fullName(list(v, 'pc')[u.pc]))} on this map.</div>`;
  }
  const year = allSeries().find((x) => x.lineage_year)?.lineage_year;
  const order = CTX.VERS;
  return Object.entries(u.x || {}).map(([ov, rows]) => {
    const tot = rows.reduce((t, r) => t + r[1], 0);
    if (!tot) return '';
    const later = order.indexOf(ov) > order.indexOf(v);
    const head = later ? `Where its people went on the ${esc(VL(ov))}` : `Where its people were on the ${esc(VL(ov))}`;
    const big = rows[0];
    const top = big ? (100 * big[1]) / tot : 0;
    const n = rows.filter((r) => r[1] / tot >= 0.01).length;
    const pct = (x) => `${x >= 99 || x < 10 ? x.toFixed(1) : Math.round(x)}%`;
    const lede = n <= 1 ? `${pct(top)} of them in one seat.` : `${n} seats hold at least 1% each; the largest holds ${pct(top)}.`;
    const body = rows.map(([oid, pop, km2]) => {
      const share = pop / tot;
      if (share < 0.002 && km2 < 1) return '';
      const o = oid >= 0 ? list(ov, l)[oid] : null;
      const name = o ? `<button class="nm-btn" data-sel="${ov}:${l}:${oid}">${esc(fullName(o))}</button>${resTag(o) ? ` <small>${resTag(o)}</small>` : ''}` : `<span class="t2">${esc(CTX.VMETA[ov].hide ? `ground where no Assembly seat is drawn${CTX.VMETA[ov].hide.place ? ` (${CTX.VMETA[ov].hide.place})` : ''}` : 'outside every seat')}</span>`;
      return `<div class="lrow"><span class="rk">${o ? o.no : '–'}</span><span class="nm">${name}</span><span class="vl">${(share * 100).toFixed(share < 0.1 || share > 0.99 ? 1 : 0)}%</span>
        <span class="br"><i style="width:${Math.max(1.5, share * 100)}%"></i></span><span class="sub">${compact(pop)} people · ${km2.toLocaleString('en-IN', { maximumFractionDigits: 1 })} km²</span></div>`;
    }).join('');
    return `<h2 class="h2">${head}</h2><p class="lede-s">${lede}</p><div class="lrows">${body}</div>
      <p class="note">Shares of the ${year} population (GHSL, modelled), counted by hexagon centre (H8, about 0.74 km²).${CTX.VMETA[v].approximate || CTX.VMETA[ov].approximate ? ' The 1976 lines are approximate, so small shares near a boundary may be placement error.' : ''}</p>`;
  }).join('');
}

/** A tiny line chart of a series (no axes; first and last values labelled). */
function sparkline(vals, years, lens) {
  const pts = vals.map((v, i) => [i, v]).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) return '';
  const W = 344; const H = 54; const lo = Math.min(...pts.map((p) => p[1])); const hi = Math.max(...pts.map((p) => p[1]));
  const x = (i) => 4 + (i / (vals.length - 1)) * (W - 8);
  const y = (v) => H - 6 - ((v - lo) / ((hi - lo) || 1)) * (H - 16);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H + 12}" width="100%"><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="3" fill="var(--accent)"/>
    <text x="4" y="${H + 11}" font-size="10" fill="var(--ink-3)">${years[0]}</text>
    <text x="${W - 4}" y="${H + 11}" font-size="10" fill="var(--ink-3)" text-anchor="end">${years[years.length - 1]}</text></svg>`;
}

/** One block per variable: values over the years, change since the first year, the note and evidence. */
function varBlocks(st) {
  const u = unit(st.sel);
  if (!u.v) return '';
  return allSeries().map((s) => {
    const vals = u.v[s.id];
    if (!vals) return '';
    const years = units().years[s.id];
    const lens = lensOf({ ...st, var: s.id, mode: 'value', density: false, year: years[years.length - 1] });
    const first = vals.findIndex(Number.isFinite);
    const fmt = (v) => (s.agg === 'sum' && v >= 1e5 ? compact(v) : fmtValue(v, lens));
    const change = (v) => {
      const b = vals[first];
      if (!Number.isFinite(v) || !Number.isFinite(b)) return '';
      const d = s.agg === 'sum' && b > 0 ? ((v - b) / b) * 100 : v - b;
      const txt = s.agg === 'sum' && b > 0 ? `${Math.abs(d).toFixed(1)}%` : fmtValue(Math.abs(d), lens);
      return `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${txt}</span> since ${years[first]}`;
    };
    const proj = (y) => s.projection_from && y >= s.projection_from;
    let body;
    if (years.length <= 6) {
      body = `<div class="figs">${years.map((y, i) => `<div class="fig"><div class="fl">${y}${proj(y) ? ' · projection' : ''}</div><div class="fv">${fmt(vals[i])}</div>
        <div class="fd">${i > first ? change(vals[i]) : (u.area && s.density ? `${Math.round(vals[i] / u.area).toLocaleString('en-IN')} per km²` : '')}</div></div>`).join('')}</div>`;
    } else {
      const li = vals.length - 1;
      body = `<div class="figs"><div class="fig"><div class="fl">${years[li]}</div><div class="fv">${fmt(vals[li])}<small>${esc(s.unit)}</small></div><div class="fd">${change(vals[li])}</div></div>
        <div class="fig"><div class="fl">${years[first]}</div><div class="fv">${fmt(vals[first])}</div><div class="fd">${s.agg === 'mean' ? 'mean of its hexagons' : ''}</div></div></div>${sparkline(vals, years, lens)}`;
    }
    return `<h2 class="h2">${esc(s.label)} <small>${esc(s.evidence || '')}</small></h2>${body}
      <p class="note">${esc(s.note)}. ${s.agg === 'sum' ? 'Summed over' : 'Averaged over'} the H8 hexagons whose centre is in this seat.</p>`;
  }).join('');
}

function reservationNote(st) {
  const u = unit(st.sel);
  const tmpl = CTX.VMETA[st.sel.ver].res_note;
  if (!u.res_printed || !tmpl) return '';
  const word = (r) => (r === 'GEN' ? 'general' : r);
  return `<div class="note warn"><b>Reservation.</b> ${esc(tmpl.replace('{res}', word(u.res)).replace('{printed}', word(u.res_printed)))}</div>`;
}

function cautionNote(st) {
  const u = unit(st.sel);
  return u.caution ? `<div class="note warn"><b>Uncertain lines.</b> ${esc(u.caution)}</div>` : '';
}

function members(st) {
  const u = unit(st.sel);
  const { ver: v, level: l } = st.sel;
  if (l === 'pc') {
    const acs = list(v, 'ac').filter((a) => a.pc === u.id);
    return `<h2 class="h2">Assembly segments <small>${acs.length}</small></h2><div class="rows">${acs.map((a) => `<button class="row" data-sel="${v}:ac:${a.id}"><span class="rk">${a.no}</span><span class="nm">${esc(fullName(a))}${resTag(a) ? ` <small>${resTag(a)}</small>` : ''}${a.hidden ? ' <small>not drawn</small>' : ''}</span><span class="vl"></span></button>`).join('')}</div>`;
  }
  if (u.pc == null) return '';
  const sib = list(v, 'ac').filter((a) => a.pc === u.pc && a.id !== u.id);
  return `<h2 class="h2">Other segments of ${esc(list(v, 'pc')[u.pc].name)}</h2><div class="rows">${sib.map((a) => `<button class="row" data-sel="${v}:ac:${a.id}"><span class="rk">${a.no}</span><span class="nm">${esc(fullName(a))}${resTag(a) ? ` <small>${resTag(a)}</small>` : ''}</span><span class="vl"></span></button>`).join('')}</div>`;
}

function sourceLine(st) {
  const u = unit(st.sel);
  return `<p class="note src"><b>Source:</b> ${esc(u.src)}${u.note ? `. ${esc(u.note)}` : ''}</p>`;
}

// ---- hexagon / you are here ------------------------------------------------------------------------
async function hexBand(st) {
  const info = await CTX.act.hexInfo(st.hex);
  if (!info) return '';
  const rows = [...CTX.VERS].reverse().map((v) => {
    const a = info.f[`${v}.ac`]; const p = info.f[`${v}.pc`];
    const ac = a >= 0 ? list(v, 'ac')[a] : null; const pc = p >= 0 ? list(v, 'pc')[p] : null;
    const acTxt = ac ? `AC ${ac.no} ${seatBtn(v, 'ac', ac)}` : `<span class="t2">${pc?.acs_hidden ? 'AC not drawn here' : 'no AC'}</span>`;
    const pcTxt = pc ? `PC ${pc.no} ${seatBtn(v, 'pc', pc)}` : '';
    return `<div class="hrow"><span class="vtag">${lineKey(v)}${esc(VL(v))}</span><div>${acTxt}<br>${pcTxt}</div></div>`;
  }).join('');
  const blocks = allSeries().map((s) => {
    const vals = info.vars[s.id] || [];
    const lens = lensOf({ ...st, var: s.id, mode: 'value', density: false });
    if (s.years.length <= 6) {
      return `<div class="fl" style="margin-top:12px">${esc(s.label)} in this hexagon (${esc(s.evidence || '')})</div><div class="figs pop5">${s.years.map((y, i) => `<div class="fig"><div class="fl">${y}${s.projection_from && y >= s.projection_from ? ' · proj.' : ''}</div><div class="fv">${Number.isFinite(vals[i]) ? fmtValue(vals[i], lens) : '–'}</div></div>`).join('')}</div>`;
    }
    const li = vals.length - 1;
    return `<div class="fl" style="margin-top:12px">${esc(s.label)} in this hexagon (${esc(s.unit)}, ${esc(s.evidence || '')})</div>
      <div class="figs pop5"><div class="fig"><div class="fl">${s.years[li]}</div><div class="fv">${Number.isFinite(vals[li]) ? fmtValue(vals[li], lens) : '–'}</div></div></div>${sparkline(vals, s.years, lens)}`;
  }).join('');
  const here = st.here ? `<div class="kicker"><b>You are here</b> · accurate to ${st.here.acc < 1000 ? `${Math.round(st.here.acc)} m` : `${(st.here.acc / 1000).toFixed(1)} km`}</div>` : '';
  return `<section class="band"><button class="icon close" data-act="closehex" title="Close">${ICON.x}</button>
    ${here}<div class="kicker">H${info.res} hexagon · ${info.area.toFixed(2)} km²</div>
    <h2 class="title mono">${info.h}</h2>
    <div class="coords">${st.here ? `${esc(fmtCoords(st.here.lng, st.here.lat))} <small>your position</small>` : `${esc(fmtCoords(info.lng, info.lat))} <small>hexagon centre</small>`}</div>
    <div class="hrows">${rows}</div>
    <div class="acts"><button class="icon" data-act="copyhex" title="Copy H3 id">${ICON.link}</button>${googleLinks(info.lng, info.lat, { 6: 11, 7: 13, 8: 15 }[info.res])}</div>
    ${blocks}</section>`;
}

// ---- about ----------------------------------------------------------------------------------------
function about() {
  const { cfg, VERS, VMETA } = CTX;
  const s = allSeries().find((x) => x.lineage_year);
  return `<div class="kicker">About</div><h1 class="title small">${esc(cfg.site.title)}</h1>
    <p class="lede">${esc(cfg.site.tagline)}.</p>
    <ol class="steps">
      <li>Choose a map version (or both) and Assembly or Lok Sabha at the top. Older lines are dashed.</li>
      <li>Hover anywhere: the box lists the seat on every map at that spot.</li>
      <li>Click a seat for where its people were or went on the other map, its population and its source.</li>
      <li>Swipe compares the maps side by side. Find me shows your seat on both.</li>
    </ol>
    <h2 class="h2">Map versions</h2>
    ${VERS.map((v) => `<p class="note"><b>${lineKey(v)} ${esc(VMETA[v].label)}</b>: ${esc(VMETA[v].long)}, ${esc(VMETA[v].used)}. Evidence: ${esc(VMETA[v].evidence)}.<br>${VMETA[v].sources.map(esc).join('<br>')}${VMETA[v].hide ? `<br>${esc(VMETA[v].hide.reason)}` : ''}${VMETA[v].from_file ? `<br>${esc(VMETA[v].from_file.reason)}` : ''}</p>`).join('')}
    <h2 class="h2">Methods</h2>
    <p class="note">On every map the Assembly seats tile their Lok Sabha seat exactly. A hexagon belongs to the seat that contains its centre. "Where its people were or went" counts the ${s ? s.lineage_year : ''} population of the H8 hexagons the two seats share.</p>
    ${VERS.flatMap((v) => VMETA[v].notes || []).map((n) => `<p class="note">${esc(n)}</p>`).join('')}
    ${VERS.map((v) => Object.entries(VMETA[v].rebuild || {}).length ? `<h2 class="h2">City seats, ${esc(VMETA[v].label)}</h2>
      <p class="note">For each city, the source map and a redraw from the Order's ward lists are scored on the same ground: half the summed gap between each seat's share of the people (GHSL, modelled) and its share of ${esc(Object.values(VMETA[v].rebuild)[0].referee)} (0 = identical). The lower score is shown.</p>
      <table class="ctable"><thead><tr><th>City</th>${['source map', 'ward lists, per PC', 'ward lists, whole city'].map((c) => `<th>${esc(c)}</th>`).join('')}<th>Shown</th></tr></thead><tbody>
      ${Object.entries(VMETA[v].rebuild).map(([city, r]) => `<tr><td>${esc(city)}</td>${['source map', 'ward lists, per PC', 'ward lists, whole city'].map((c) => `<td class="${r.shown === c ? 'best' : ''}">${r.scores[c] != null ? r.scores[c].toFixed(2) : '–'}</td>`).join('')}<td>${esc(r.shown)}</td></tr>`).join('')}
      </tbody></table>` : '').join('')}
    ${allSeries().map((x) => `<p class="note"><b>${esc(x.label)}</b> (${esc(x.evidence || '')}): ${esc(x.note)}, ${x.years[0]}–${x.years[x.years.length - 1]}.</p>`).join('')}
    <h2 class="h2">Credits</h2>
    <p class="note">${esc(cfg.site.data_credit)}. Basemaps: OpenFreeMap / OpenMapTiles / OpenStreetMap contributors; Esri. Map code adapted from India Hex.</p>
    <p class="note">Data version ${esc(cfg.version)}</p>
    <button class="textbtn" data-act="back" style="margin-top:16px">Back</button>`;
}

let lastPlace = null;

/** Progressive render: sections fill in as their data arrives (kept while it does, so nothing flickers). */
export async function renderPanel() {
  const t = ++tok;
  const st = CTX.S.get();
  crumbs(st);
  const panel = document.getElementById('panel');
  if (st.panel === 'about') { panel.innerHTML = about(); return; }
  const focused = document.activeElement?.id === 'listFilter';
  const place = JSON.stringify([st.sel, st.hex, st.panel]);
  const keep = place === lastPlace ? panel.scrollTop : 0;
  lastPlace = place;
  let html = '<div id="sec-band"></div>';
  if (st.sel) html += hero(st) + cautionNote(st) + reservationNote(st) + lineage(st) + varBlocks(st) + members(st) + sourceLine(st);
  else html += landing(st);
  panel.innerHTML = html;
  panel.scrollTop = keep;
  if (focused) { const f = document.getElementById('listFilter'); if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }
  if (st.hex) {
    const band = await hexBand(st);
    if (t === tok) { const el = document.getElementById('sec-band'); if (el) el.innerHTML = band; }
  }
}
