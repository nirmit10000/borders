// Status bar (bottom right, as in Google Earth): a scale bar, the camera's height, and the coordinates
// under the pointer in decimal degrees (on touch screens: the map's centre). Click the coordinates to copy them.
import { distance, fmtCoords } from './geo.js';

const NICE = [1, 2, 5];
const EARTH = 40075016.686; // equatorial circumference (m)

/** The largest 1-2-5 length (m) not longer than `max`. */
function niceLength(max) {
  const p = 10 ** Math.floor(Math.log10(max));
  let best = p;
  for (const k of NICE) if (k * p <= max) best = k * p;
  return best;
}

const group = (n) => Math.round(n).toLocaleString('en-IN');

export function initStatusBar(map, { el, toast = () => {}, maxBarPx = 110 }) {
  el.innerHTML = `<div class="sb-scale" title="Scale"><i></i><span></span></div>
    <span class="sb-cam" title="Approximate height of the viewpoint above the ground"></span>
    <button class="sb-coords" type="button" title="Latitude, longitude in decimal degrees · click to copy"></button>`;
  const bar = el.querySelector('.sb-scale i');
  const barLabel = el.querySelector('.sb-scale span');
  const cam = el.querySelector('.sb-cam');
  const coords = el.querySelector('.sb-coords');
  let last = null; // [lng, lat] shown
  const touch = window.matchMedia('(hover: none)').matches;

  function showCoords(ll, live = true) {
    last = ll;
    coords.textContent = fmtCoords(ll[0], ll[1]);
    coords.classList.toggle('dim', !live);
  }

  function update() {
    const c = map.getContainer();
    const w = c.clientWidth; const h = c.clientHeight;
    // scale: ground distance across a horizontal run near the bottom of the view (honest under tilt too)
    const y = Math.max(0, h - 30);
    const x0 = Math.max(0, w / 2 - maxBarPx / 2);
    const a = map.unproject([x0, y]); const b = map.unproject([x0 + maxBarPx, y]);
    const m = distance([a.lng, a.lat], [b.lng, b.lat]);
    if (Number.isFinite(m) && m > 0) {
      const len = niceLength(m);
      bar.style.width = `${Math.round((maxBarPx * len) / m)}px`;
      barLabel.textContent = len >= 1000 ? `${group(len / 1000)} km` : `${len} m`;
    }
    // camera height: distance from the camera to the centre of the view, times its vertical component
    const t = map.transform;
    const lat = map.getCenter().lat;
    const mpp = (EARTH * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** map.getZoom());
    const fov = ((t.fov ?? 36.87) * Math.PI) / 180;
    const camPx = t.cameraToCenterDistance ?? (0.5 / Math.tan(fov / 2)) * h;
    const alt = camPx * mpp * Math.cos((map.getPitch() * Math.PI) / 180);
    cam.textContent = `Camera: ${alt >= 1e5 ? `${group(alt / 1000)} km` : `${group(alt)} m`}`;
    if (touch || !last) { const ctr = map.getCenter(); showCoords([ctr.lng, ctr.lat], touch); }
  }

  map.on('move', update);
  map.on('resize', update);
  map.on('mousemove', (e) => showCoords([e.lngLat.lng, e.lngLat.lat]));
  map.getCanvas().addEventListener('mouseleave', () => { const ctr = map.getCenter(); showCoords([ctr.lng, ctr.lat], false); });
  coords.addEventListener('click', () => {
    if (!last) return;
    const text = `${last[1].toFixed(6)}, ${last[0].toFixed(6)}`;
    navigator.clipboard?.writeText(text).then(() => toast(`Copied ${text}`, { ttl: 2200 }));
  });
  update();
  return { update };
}
