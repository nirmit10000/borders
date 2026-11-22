// Ruler: measure distances (and the area of a closed shape) on the map.
//   click / tap        add a point            Backspace or Undo   remove the last point
//   click the 1st point close the shape (area) double-click / Done finish
//   Esc / Clear        start again            the tool button     leave the ruler
// Distances are on the WGS84 ellipsoid (Vincenty); lines are drawn along great circles.
import { distance, greatCircle, area as ringArea, fmtLength, fmtArea } from './geo.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const SNAP_PX = 12;

export function initMeasure(map, { card, colour = '#f2c46d', halo = 'rgba(0,0,0,0.75)', font = 'Noto Sans Regular', onChange = () => {} }) {
  const st = { active: false, pts: [], closed: false, done: false, hover: null };

  map.addSource('measure', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'measure-fill', type: 'fill', source: 'measure', filter: ['==', ['get', 'k'], 'area'], paint: { 'fill-color': colour, 'fill-opacity': 0.22 } });
  map.addLayer({ id: 'measure-casing', type: 'line', source: 'measure', filter: ['==', ['get', 'k'], 'line'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': 'rgba(0,0,0,0.55)', 'line-width': 5 } });
  map.addLayer({ id: 'measure-line', type: 'line', source: 'measure', filter: ['==', ['get', 'k'], 'line'], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': colour, 'line-width': 2.5 } });
  map.addLayer({ id: 'measure-live', type: 'line', source: 'measure', filter: ['==', ['get', 'k'], 'live'], paint: { 'line-color': colour, 'line-width': 2, 'line-dasharray': [2, 2] } });
  map.addLayer({ id: 'measure-pts', type: 'circle', source: 'measure', filter: ['==', ['get', 'k'], 'pt'], paint: { 'circle-radius': ['case', ['get', 'first'], 6, 4.5], 'circle-color': '#ffffff', 'circle-stroke-color': colour, 'circle-stroke-width': 2.5 } });
  map.addLayer({
    id: 'measure-labels', type: 'symbol', source: 'measure', filter: ['==', ['get', 'k'], 'label'],
    layout: { 'text-field': ['get', 't'], 'text-font': [font], 'text-size': 12, 'text-offset': [0, -0.9], 'text-allow-overlap': true, 'text-ignore-placement': true },
    paint: { 'text-color': '#ffffff', 'text-halo-color': halo, 'text-halo-width': 1.6 },
  });

  const segLen = () => st.pts.slice(1).map((p, i) => distance(st.pts[i], p));
  const total = () => segLen().reduce((a, b) => a + b, 0) + (st.closed ? distance(st.pts[st.pts.length - 1], st.pts[0]) : 0);

  function draw() {
    const f = [];
    const pts = st.pts;
    const path = [];
    for (let i = 1; i < pts.length; i++) path.push(...greatCircle(pts[i - 1], pts[i]).slice(i > 1 ? 1 : 0));
    if (st.closed && pts.length > 2) path.push(...greatCircle(pts[pts.length - 1], pts[0]).slice(1));
    if (path.length > 1) f.push({ type: 'Feature', properties: { k: 'line' }, geometry: { type: 'LineString', coordinates: path } });
    if (st.closed && pts.length > 2) f.push({ type: 'Feature', properties: { k: 'area' }, geometry: { type: 'Polygon', coordinates: [[...path]] } });
    if (st.active && !st.closed && !st.done && st.hover && pts.length) {
      f.push({ type: 'Feature', properties: { k: 'live' }, geometry: { type: 'LineString', coordinates: greatCircle(pts[pts.length - 1], st.hover) } });
    }
    pts.forEach((p, i) => f.push({ type: 'Feature', properties: { k: 'pt', first: i === 0 && !st.closed }, geometry: { type: 'Point', coordinates: p } }));
    const segs = segLen();
    if (st.closed && pts.length > 2) segs.push(distance(pts[pts.length - 1], pts[0]));
    if (segs.length > 1) {
      segs.forEach((d, i) => {
        const a = pts[i]; const b = pts[(i + 1) % pts.length];
        const mid = greatCircle(a, b);
        f.push({ type: 'Feature', properties: { k: 'label', t: fmtLength(d) }, geometry: { type: 'Point', coordinates: mid[Math.floor(mid.length / 2)] } });
      });
    }
    if (pts.length > 1 && !st.closed) f.push({ type: 'Feature', properties: { k: 'label', t: fmtLength(total()) }, geometry: { type: 'Point', coordinates: pts[pts.length - 1] } });
    map.getSource('measure').setData({ type: 'FeatureCollection', features: f });
    renderCard();
  }

  function renderCard() {
    if (!st.active) { card.hidden = true; return; }
    card.hidden = false;
    const n = st.pts.length;
    const live = !st.closed && !st.done && st.hover && n ? distance(st.pts[n - 1], st.hover) : 0;
    let head;
    if (!n) head = '<b>Measure</b><span>Click the map to add points</span>';
    else if (st.closed) head = `<b>${fmtArea(ringArea(st.pts))}</b><span>area · perimeter ${fmtLength(total())}</span>`;
    else if (st.done) head = `<b>${fmtLength(total())}</b><span>path of ${n} points · click the map to start a new one</span>`;
    else head = `<b>${fmtLength(total() + live)}</b><span>${n} point${n > 1 ? 's' : ''}${live ? ` · +${fmtLength(live)} to the pointer` : ''}${n > 2 ? ' · click the first point to close' : ' · double-click to finish'}</span>`;
    card.innerHTML = `<div class="mc-text">${head}</div>
      <div class="mc-acts"><button data-m="undo" ${n ? '' : 'disabled'}>Undo</button><button data-m="clear" ${n ? '' : 'disabled'}>Clear</button><button data-m="exit" class="on">Done</button></div>`;
  }

  function start() {
    st.active = true; st.pts = []; st.closed = false; st.done = false; st.hover = null;
    map.getCanvas().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();
    draw(); onChange(true);
  }
  function stop() {
    st.active = false; st.pts = []; st.closed = false; st.done = false; st.hover = null;
    map.getCanvas().style.cursor = '';
    map.doubleClickZoom.enable();
    draw(); onChange(false);
  }
  const undo = () => { if (st.closed) st.closed = false; else st.pts.pop(); st.done = false; draw(); };
  const clear = () => { st.pts = []; st.closed = false; st.done = false; draw(); };

  map.on('click', (e) => {
    if (!st.active) return;
    if (st.done || st.closed) { st.pts = []; st.closed = false; st.done = false; }
    const ll = [e.lngLat.lng, e.lngLat.lat];
    if (st.pts.length > 2) {
      const first = map.project(st.pts[0]);
      if (Math.hypot(first.x - e.point.x, first.y - e.point.y) < SNAP_PX) { st.closed = true; draw(); return; }
    }
    st.pts.push(ll);
    draw();
  });
  map.on('dblclick', (e) => {
    if (!st.active) return;
    e.preventDefault();
    // the double-click's own clicks added points on top of the last one: drop them
    while (st.pts.length > 1) {
      const a = map.project(st.pts[st.pts.length - 1]); const b = map.project(st.pts[st.pts.length - 2]);
      if (Math.hypot(a.x - b.x, a.y - b.y) >= SNAP_PX) break;
      st.pts.pop();
    }
    st.done = true; draw();
  });
  map.on('mousemove', (e) => {
    if (!st.active) return;
    map.getCanvas().style.cursor = 'crosshair';
    if (st.closed || st.done || !st.pts.length) return;
    st.hover = [e.lngLat.lng, e.lngLat.lat];
    draw();
  });
  card.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    if (b.dataset.m === 'undo') undo();
    else if (b.dataset.m === 'clear') clear();
    else stop();
  });
  document.addEventListener('keydown', (e) => {
    if (!st.active || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.key === 'Escape') { if (st.pts.length) clear(); else stop(); }
    else if (e.key === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.key === 'Enter') { st.done = true; draw(); }
  });
  return { start, stop, toggle: () => (st.active ? stop() : start()), get active() { return st.active; } };
}
