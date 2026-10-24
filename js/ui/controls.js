// Map chrome, generated from config.json and kept in sync with the store (structure from India Hex):
//   version bar (top)        which map: each version or both, Assembly or Lok Sabha; the line key;
//                            legend and years when the map is coloured
//   Layers      (top-left)   colour by, hexagons, fill, display options
//   tools       (right)      zoom, home, find me, compass, 3D, swipe, export, full screen
//   bases       (bottom-left) Map / Satellite / Terrain tabs + a Labels popover
import { esc, legendNum, RAMPS, SEQUENTIAL, DIVERGING, rampFor } from '../scales.js';
import { lensOf } from '../lens.js';

let CTX = null;
let playTimer = null;

const I = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>',
  locate: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7.5"/></svg>',
  compass: '<svg viewBox="0 0 24 24"><path d="M12 3l3.5 9h-7z" fill="currentColor" stroke="none" opacity=".9"/><path d="M12 21l-3.5-9h7z"/></svg>',
  three: '<span class="txt">3D</span>',
  compare: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 3v18"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  full: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/></svg>',
  ruler: '<svg viewBox="0 0 24 24"><path d="M3.5 16.5l13-13 4 4-13 13z"/><path d="M7 13l1.8 1.8M9.5 10.5l1.8 1.8M12 8l1.8 1.8M14.5 5.5l1.8 1.8"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>',
};

const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

export function initControls(ctx) {
  CTX = ctx;
  const { S, cfg } = ctx;

  // ---- Layers panel ----
  const lens = document.getElementById('lens');
  document.getElementById('lensToggle').onclick = () => {
    lens.classList.toggle('closed');
    document.getElementById('lensToggle').setAttribute('aria-expanded', String(!lens.classList.contains('closed')));
  };
  if (isMobile()) lens.classList.add('closed');
  const body = document.getElementById('lensBody');
  body.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (!b) return;
    let v = b.dataset.v;
    if (b.dataset.k === 'res') v = /^\d$/.test(v) ? +v : v;
    if (b.dataset.k === 'density') { S.set({ density: !S.get().density }); return; }
    if (b.dataset.k === 'var') { S.set({ var: v, mode: 'value', density: false }); return; }
    if (b.dataset.k === 'rev') { S.set({ rev: !S.get().rev }); return; }
    S.set({ [b.dataset.k]: v });
  });
  body.addEventListener('input', (e) => {
    if (e.target.id === 'opacity') S.set({ opacity: +e.target.value });
    else if (e.target.id === 'height') S.set({ height: +e.target.value });
    else if (e.target.id === 'lineScale') S.set({ lineScale: +e.target.value });
  });
  body.addEventListener('change', (e) => {
    const k = e.target.dataset?.tog;
    if (k === 'theme') S.set({ theme: e.target.checked ? 'dark' : 'light' });
    else if (k) S.set({ [k]: e.target.checked });
  });

  // ---- version bar ----
  const bar = document.getElementById('lensbar');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]');
    if (b) { S.set({ [b.dataset.k]: b.dataset.v }); return; }
    if (e.target.closest('.swipe-x')) { S.set({ compare: false }); return; }
    if (e.target.closest('.play')) { togglePlay(); return; }
    const y = e.target.closest('[data-year]');
    if (y) {
      const yr = +y.dataset.year;
      const l = lensOf(S.get());
      if (l.mode === 'change' && yr < l.year) S.set({ from: yr });
      else S.set({ year: yr });
    }
  });

  // ---- tools ----
  const f = cfg.features;
  const groups = [
    [['layers', I.layers, 'Layers'], ['zin', I.plus, 'Zoom in'], ['zout', I.minus, 'Zoom out'], ['north', I.compass, 'Reset north and tilt']],
    [['home', I.home, `All of ${ctx.STATE.name}`], ...(f.locate_me ? [['locate', I.locate, 'Find me']] : []), ...(f.measure ? [['measure', I.ruler, 'Measure distance and area']] : [])],
    [...(f.compare ? [['compare', I.compare, `Swipe: ${ctx.VMETA[ctx.VERS[0]].label} | ${ctx.VMETA[ctx.VERS[ctx.VERS.length - 1]].label}`]] : []),
      ...(f.three_d ? [['3d', I.three, '3D hexagons']] : []),
      ...(f.export_png ? [['png', I.camera, 'Save map as PNG']] : []), ['full', I.full, 'Full screen']],
  ];
  const tools = document.getElementById('tools');
  tools.innerHTML = groups.map((g) => `<div class="tgroup">${g.map(([id, ic, t]) => `<button data-tool="${id}" title="${esc(t)}" aria-label="${esc(t)}">${ic}</button>`).join('')}</div>`).join('');
  tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    if (b.dataset.tool === 'layers') { lens.classList.toggle('closed'); return; }
    ctx.act.tool(b.dataset.tool);
  });
  ctx.view.map.on('rotate', renderCompass);
  ctx.view.map.on('pitch', renderCompass);

  // ---- bases ----
  const bases = document.getElementById('bases');
  bases.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bm]');
    if (b) { S.set({ basemap: b.dataset.bm }); return; }
    if (e.target.closest('#ovBtn')) document.getElementById('ovPop').hidden = !document.getElementById('ovPop').hidden;
  });
  bases.addEventListener('change', (e) => {
    const id = e.target.dataset?.ov;
    if (!id) return;
    const cur = S.get().overlays.filter((x) => x !== id);
    S.set({ overlays: e.target.checked ? [...cur, id] : cur });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#bases')) { const p = document.getElementById('ovPop'); if (p) p.hidden = true; } });

  S.on(null, (st, prev, changed) => {
    if (['res', 'scope', 'mask', 'labels', 'outline', 'hexLines', 'cbSafe', 'theme', 'sel', 'var', 'mode', 'density', 'ramp', 'rev', 'breaks', 'threeD', 'heightBy'].some((k) => changed.has(k))) renderLens();
    if (['ver', 'level', 'compare', 'var', 'year', 'mode', 'from', 'density', 'basemap', 'theme'].some((k) => changed.has(k))) { renderBar(); renderTimeline(); }
    if (['basemap', 'overlays'].some((k) => changed.has(k))) renderBases();
    if (['threeD', 'compare'].some((k) => changed.has(k))) renderTools();
  });
  renderLens(); renderBar(); renderBases(); renderTimeline(); renderTools();
}

// ------------------------------------------------------------------------------------------------
function seg(key, items, cur, cls = '') {
  return `<div class="seg ${cls}">${items.map(([v, label, dis, title]) => `<button data-k="${key}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}" ${dis ? 'disabled' : ''} ${title ? `title="${esc(title)}"` : ''}>${label}</button>`).join('')}</div>`;
}

function markShownRes() {
  const shown = CTX.rt.shownRes;
  document.querySelectorAll('#lensBody [data-k="res"]').forEach((b) => b.classList.toggle('shown', shown != null && String(shown) === b.dataset.v));
}

function tog(key, label, on) {
  return `<label class="tog">${label}<input type="checkbox" data-tog="${key}" ${on ? 'checked' : ''}><i></i></label>`;
}

/** A short line sample in each version's style (from the palette; dashed for the older map). */
export function lineKey(v) {
  const p = CTX?.cfg.palette[CTX.S.get().theme === 'dark' ? 'dark' : 'light'][v]?.ac;
  if (!p) return '';
  const [col, , , , dash] = p;
  const da = dash && dash.length ? ` stroke-dasharray="${dash.map((d) => (d * 2.4).toFixed(1)).join(' ')}"` : '';
  return `<svg class="vkey" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" stroke="${col}" stroke-width="2.6"${da}/></svg>`;
}

/** A small gradient sample of a ramp, for the picker. */
function swatch(colors) {
  return `<i class="sw" style="background:linear-gradient(90deg,${colors.join(',')})"></i>`;
}

/** Layers panel: colouring (variable, mode, colours, breaks), 3D, hexagons, display. */
export function renderLens() {
  const { S, cfg, rt } = CTX;
  const st = S.get();
  const f = cfg.features;
  const l = lensOf(st);
  const AREA = { 6: '≈36 km²', 7: '≈5.2 km²', 8: '≈0.74 km²' };
  const resItems = [['off', 'Off', false, 'No hexagons'], ['auto', 'Auto', false, 'Resolution follows the zoom or the size of the selected seat'],
    ...cfg.hex.resolutions.map((r) => [r, `H${r}`, false, `H${r} cells, ${AREA[r] || ''} each`])];
  const chips = [];
  if (!l.none && l.years.length >= 2 && f.change_mode) {
    chips.push(`<button class="chip${l.mode === 'value' ? ' on' : ''}" data-k="mode" data-v="value">Value</button>`);
    chips.push(`<button class="chip${l.mode === 'change' ? ' on' : ''}" data-k="mode" data-v="change" title="Difference between two years">Change</button>`);
  }
  if (!l.none && l.series.density && f.density_toggle) chips.push(`<button class="chip${l.density ? ' on' : ''}" data-k="density" title="Divide by area">Per km²</button>`);
  const ramps = l.none ? [] : (l.diverging ? DIVERGING : SEQUENTIAL);
  const colourBlock = l.none ? '' : `
      <div class="lab" style="margin-top:9px">Colours <span><button class="chip mini${st.rev ? ' on' : ''}" data-k="rev" title="Reverse the colours">Reverse</button></span></div>
      <div class="ramps">${[['auto', 'Default'], ...ramps].map(([id, label]) => {
    const cols = id === 'auto' ? rampFor(l, st.cbSafe, 'auto', st.rev) : (st.rev ? [...RAMPS[id]].reverse() : RAMPS[id]);
    const on = id === st.ramp || (st.ramp !== 'auto' && id === 'auto' && !ramps.some(([r]) => r === st.ramp)) || (id === 'auto' && st.ramp === 'auto');
    return `<button data-k="ramp" data-v="${id}" class="rampbtn${on ? ' on' : ''}" title="${esc(label)}" aria-label="${esc(label)} colours">${swatch(cols)}<span>${esc(label)}</span></button>`;
  }).join('')}</div>
      <div class="lab" style="margin-top:9px">Breaks</div>
      ${seg('breaks', [['quantile', 'Quantiles', false, 'Each colour holds about the same number of cells or seats'], ['equal', 'Equal steps', false, 'Equal steps of the value: outliers stand out'], ['log', 'Log steps', false, 'Equal steps of the logarithm: suits skewed data such as night lights']], st.breaks, 'sm')}`;
  const heightBlock = !st.threeD ? '' : `
    <div><div class="lab">3D height</div>
      ${seg('heightBy', [['value', 'By value', false, 'Height in proportion to the value: the real differences'], ['class', 'By colour class', false, 'Height by colour class: each step the same']], st.heightBy, 'sm')}
      <div class="slider" style="margin-top:6px">Taller<input type="range" id="height" min="0.3" max="5" step="0.1" value="${st.height}" aria-label="3D height"></div></div>`;
  document.getElementById('lensBody').innerHTML = `
    <div><div class="lab">Colour by</div>${seg('var', [['none', 'Nothing'], ...cfg.variables.map((s) => [s.id, esc(s.label)])], st.var)}
      ${chips.length ? `<div class="chips" style="margin-top:6px">${chips.join('')}</div>` : ''}
      ${!l.none ? `<div class="hint">${esc(l.note)} · ${esc(l.evidence || '')}</div>` : ''}
      ${colourBlock}</div>
    ${heightBlock}
    <div><div class="lab">Hexagons <span id="hexHint">${esc(st.res === 'off' ? '' : rt.hexHint || '')}</span></div>${seg('res', resItems, st.res)}
      ${st.res !== 'off' ? `<div style="margin-top:5px">${seg('scope', [['sel', 'Selected seat', false, st.sel ? 'Only the cells of the selected seat' : 'Nothing is selected yet: cells in view are shown'], ['view', 'Everything in view', false, 'All cells on screen']], st.scope, 'sm')}</div>` : ''}</div>
    <div class="slider">Fill<input type="range" id="opacity" min="0.1" max="1" step="0.02" value="${st.opacity}" aria-label="Fill opacity"></div>
    <details class="drawer"${rt.drawerOpen ? ' open' : ''} id="drawer"><summary>Display options <span>＋</span></summary>
      ${tog('labels', 'Seat names', st.labels)}
      ${tog('outline', 'State border', st.outline)}
      ${tog('mask', 'Dim outside selection', st.mask)}
      ${tog('hexLines', 'Hexagon outlines', st.hexLines)}
      ${f.colourblind_ramps ? tog('cbSafe', 'Colour-blind-safe default colours', st.cbSafe) : ''}
      ${tog('theme', 'Dark interface', st.theme === 'dark')}
      <div class="slider">Lines<input type="range" id="lineScale" min="0.3" max="1.8" step="0.05" value="${st.lineScale}" aria-label="Boundary strength"></div>
    </details>`;
  document.getElementById('drawer').addEventListener('toggle', (e) => { rt.drawerOpen = e.target.open; });
  markShownRes();
}

/** Version bar: which map(s), which level, the line key, then legend + years when coloured. */
function renderBar() {
  const { S, cfg, VERS, VMETA } = CTX;
  const st = S.get();
  const first = VERS[0]; const last = VERS[VERS.length - 1];
  const verRow = st.compare
    ? `<div class="swipe-note">${lineKey(first)}<b>${esc(VMETA[first].label)}</b><span>left</span><span class="sep">|</span><span>right</span><b>${esc(VMETA[last].label)}</b>${lineKey(last)}<button class="swipe-x" title="Close swipe" aria-label="Close swipe">✕</button></div>`
    : seg('ver', [...VERS.slice(0, 1).map((v) => [v, `${lineKey(v)}${esc(VMETA[v].label)}`, false, VMETA[v].long]), ['both', 'Both', false, 'Both maps, one over the other'],
      ...VERS.slice(1).map((v) => [v, `${lineKey(v)}${esc(VMETA[v].label)}`, false, VMETA[v].long])], st.ver, 'ver');
  const lv = seg('level', Object.entries(cfg.boundaries.levels).reverse().map(([id, l]) => [id, esc(l.label)]), st.level, 'lvl');
  const approx = VERS.filter((v) => VMETA[v].approximate && (st.compare || st.ver === 'both' || st.ver === v));
  document.getElementById('lbRow').innerHTML = `${verRow}${lv}`;
  const note = approx.filter((v) => VMETA[v].short_note).map((v) => `<div class="vnote">${lineKey(v)}${esc(VMETA[v].short_note)}</div>`).join('');
  document.getElementById('picker').hidden = true;
  document.getElementById('vnote').innerHTML = note;
  updateLegend();
}

export function legendHTML() {
  const lg = CTX?.rt.legend;
  if (!lg || lg.lens.none) return '';
  const cov = lg.coverage;
  if (cov && cov.n && !cov.fin) return `<div class="lnote nodata">No ${esc(lg.lens.label.toLowerCase())} data for these ${cov.n.toLocaleString('en-IN')} cells.</div>`;
  if (!lg.sc) return '';
  const { sc, lens, scopeLabel } = lg;
  const part = cov && cov.fin < cov.n ? ` · data for ${cov.fin.toLocaleString('en-IN')} of ${cov.n.toLocaleString('en-IN')} cells` : '';
  const full = `${lens.title}${lens.unitLabel ? ` (${lens.unitLabel})` : ''}. Breaks relative to ${scopeLabel}. ${lens.note}.`;
  return `<div class="ramp">${sc.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
    <div class="ticks"><span></span>${sc.breaks.map((b) => `<span>${esc(legendNum(b, lens))}</span>`).join('')}<span></span></div>
    <div class="lnote" title="${esc(full)}">${esc(lens.label)}${lens.evidence ? ` (${esc(lens.evidence)})` : ''} · ${esc(lens.unitLabel || '')} · ${lens.mode === 'change' ? `${lens.from}–${lens.year}` : lens.year}${lens.projection ? ' (projection)' : ''} · relative to ${esc(scopeLabel)}${part}</div>`;
}

export function updateLegend() {
  if (!CTX) return;
  const el = document.getElementById('legend');
  if (el) { el.innerHTML = legendHTML(); el.hidden = !el.innerHTML.trim(); }
  const st = CTX.S.get();
  const hintEl = document.getElementById('hexHint');
  if (hintEl) hintEl.textContent = st.res === 'off' ? '' : CTX.rt.hexHint || '';
  markShownRes();
}

function renderBases() {
  const { S, cfg } = CTX;
  const st = S.get();
  const ovs = [...Object.entries(cfg.overlays.groups || {}), ...Object.entries(cfg.overlays.raster || {})];
  const off = cfg.basemaps.find((b) => b.id === st.basemap)?.overlays_off || [];
  const pop = document.getElementById('ovPop');
  const open = !!pop && !pop.hidden;
  const on = st.overlays.filter((o) => !off.includes(o)).length;
  document.getElementById('bases').innerHTML = `
    <div class="tabs-bm" role="tablist">${cfg.basemaps.filter((b) => b.show !== false).map((b) => `<button role="tab" aria-selected="${st.basemap === b.id}" class="${st.basemap === b.id ? 'on' : ''}" data-bm="${b.id}">${esc(b.label)}</button>`).join('')}</div>
    <div class="ov-wrap"><button class="ov-btn" id="ovBtn" aria-haspopup="true">Labels${on ? ` · ${on}` : ''}</button>
      <div class="ov-pop" id="ovPop"${open ? '' : ' hidden'}>${ovs.map(([id, o]) => {
    const dis = off.includes(id);
    return `<label class="tog${dis ? ' dis' : ''}" ${dis ? 'title="Already part of this map style"' : ''}>${esc(o.label)}<input type="checkbox" data-ov="${id}" ${st.overlays.includes(id) && !dis ? 'checked' : ''} ${dis ? 'disabled' : ''}><i></i></label>`;
  }).join('')}</div></div>`;
}

function renderCompass() {
  const m = CTX.view.map;
  const b = document.querySelector('[data-tool="north"]');
  if (!b) return;
  b.querySelector('svg').style.transform = `rotate(${-m.getBearing()}deg)`;
  b.classList.toggle('on', Math.abs(m.getBearing()) > 0.5 || m.getPitch() > 1);
}

function renderTools() {
  const st = CTX.S.get();
  document.querySelectorAll('[data-tool="3d"]').forEach((b) => b.classList.toggle('on', !!st.threeD));
  document.querySelectorAll('[data-tool="compare"]').forEach((b) => b.classList.toggle('on', !!st.compare));
  document.querySelectorAll('[data-tool="measure"]').forEach((b) => b.classList.toggle('on', !!CTX.rt.measuring));
  renderCompass();
}

export function renderTimeline() {
  const st = CTX.S.get();
  const lens = lensOf(st);
  const el = document.getElementById('timeline');
  if (!CTX.cfg.features.timeline || lens.none || lens.years.length < 2) { el.hidden = true; stopPlay(); return; }
  el.hidden = false;
  el.innerHTML = `<button class="play" aria-label="${playTimer ? 'Pause' : 'Play through the years'}">${playTimer ? I.pause : I.play}</button>
    <div class="years">${lens.years.map((y) => {
    let cls = y === lens.year ? 'on' : '';
    if (lens.mode === 'change') { if (y === lens.from) cls = 'from'; else if (y > lens.from && y < lens.year) cls = 'span'; }
    const proj = lens.series.projection_from && y >= lens.series.projection_from;
    return `<button data-year="${y}" class="${cls}" ${proj ? 'title="Projection"' : ''}>${String(y).slice(lens.years.length > 8 ? 2 : 0)}${proj ? '<sup>p</sup>' : ''}</button>`;
  }).join('')}</div>`;
}

function togglePlay() {
  if (playTimer) { stopPlay(); return; }
  const step = () => {
    const lens = lensOf(CTX.S.get());
    const ys = lens.years;
    const i = ys.indexOf(lens.year);
    if (i >= ys.length - 1) { stopPlay(); return; }
    CTX.S.set({ year: ys[i + 1] });
    if (ys[i + 2] != null) CTX.act.prefetchYear(ys[i + 2]);
  };
  const lens = lensOf(CTX.S.get());
  if (lens.year === lens.years[lens.years.length - 1]) CTX.S.set({ year: lens.mode === 'change' ? lens.years[1] : lens.years[0] });
  playTimer = setInterval(step, 1300);
  renderTimeline();
}

function stopPlay() {
  if (playTimer) { clearInterval(playTimer); playTimer = null; renderTimeline(); }
}
