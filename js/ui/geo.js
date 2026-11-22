// Geodesy for the status bar and the ruler: distances on the WGS84 ellipsoid (Vincenty), areas on the
// authalic sphere, great-circle points for drawing, and coordinate formats.

const A = 6378137.0;               // WGS84 semi-major axis (m)
const F = 1 / 298.257223563;       // flattening
const B = A * (1 - F);
const R_AUTHALIC = 6371007.181;    // sphere with the ellipsoid's surface area (m)
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Ellipsoidal distance in metres between [lng, lat] points (Vincenty inverse; haversine if it fails to converge). */
export function distance([lng1, lat1], [lng2, lat2]) {
  const L = rad(lng2 - lng1);
  const U1 = Math.atan((1 - F) * Math.tan(rad(lat1)));
  const U2 = Math.atan((1 - F) * Math.tan(rad(lat2)));
  const sinU1 = Math.sin(U1); const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2); const cosU2 = Math.cos(U2);
  let lambda = L; let prev; let iter = 0;
  let sinSigma; let cosSigma; let sigma; let cosSqAlpha; let cos2SigmaM;
  do {
    const sinL = Math.sin(lambda); const cosL = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinL) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosL) ** 2);
    if (sinSigma === 0) return 0; // same point
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (F / 16) * cosSqAlpha * (4 + F * (4 - 3 * cosSqAlpha));
    prev = lambda;
    lambda = L + (1 - C) * F * sinAlpha * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - prev) > 1e-12 && ++iter < 200);
  if (iter >= 200) return haversine([lng1, lat1], [lng2, lat2]); // nearly antipodal points
  const uSq = (cosSqAlpha * (A * A - B * B)) / (B * B);
  const Ak = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bk = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const dSigma = Bk * sinSigma * (cos2SigmaM + (Bk / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2)
    - (Bk / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  return B * Ak * (sigma - dSigma);
}

export function haversine([lng1, lat1], [lng2, lat2]) {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R_AUTHALIC * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points along the great circle from a to b (inclusive), so long lines are drawn as they are measured. */
export function greatCircle(a, b, maxStepKm = 20) {
  const d = haversine(a, b) / 1000;
  const n = Math.min(256, Math.max(1, Math.ceil(d / maxStepKm)));
  if (n === 1) return [a, b];
  const [l1, p1] = a.map(rad); const [l2, p2] = b.map(rad);
  const delta = (2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2))) || 1e-12;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const s1 = Math.sin((1 - f) * delta) / Math.sin(delta); const s2 = Math.sin(f * delta) / Math.sin(delta);
    const x = s1 * Math.cos(p1) * Math.cos(l1) + s2 * Math.cos(p2) * Math.cos(l2);
    const y = s1 * Math.cos(p1) * Math.sin(l1) + s2 * Math.cos(p2) * Math.sin(l2);
    const z = s1 * Math.sin(p1) + s2 * Math.sin(p2);
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return out;
}

const E2 = F * (2 - F);
const E = Math.sqrt(E2);
const q = (phi) => { const s = Math.sin(phi); return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s))); };
const QP = q(Math.PI / 2);
/** sin of the authalic latitude: on the authalic sphere, areas equal the ellipsoid's. */
const sinAuthalic = (latDeg) => Math.max(-1, Math.min(1, q(rad(latDeg)) / QP));

/** Area in m² of a closed ring of [lng, lat] (spherical excess on the authalic sphere, with authalic
 * latitudes so it matches the WGS84 ellipsoid; edges densified). */
export function area(ring) {
  if (ring.length < 3) return 0;
  const pts = [];
  for (let i = 0; i < ring.length; i++) pts.push(...greatCircle(ring[i], ring[(i + 1) % ring.length], 5).slice(0, -1));
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [l1, p1] = pts[i]; const [l2, p2] = pts[(i + 1) % pts.length];
    s += rad(l2 - l1) * (2 + sinAuthalic(p1) + sinAuthalic(p2));
  }
  return Math.abs((s * R_AUTHALIC * R_AUTHALIC) / 2);
}

const group = (n) => Math.round(n).toLocaleString('en-IN');

/** "850 m", "12.43 km", "1,234 km" */
export function fmtLength(m) {
  if (m < 1000) return `${m < 10 ? m.toFixed(1) : Math.round(m)} m`;
  const km = m / 1000;
  return km < 100 ? `${km.toFixed(km < 10 ? 3 : 2)} km` : `${group(km)} km`;
}

/** "8,500 m²", "4.21 km²", "1,234 km²" */
export function fmtArea(m2) {
  if (m2 < 1e5) return `${group(m2)} m²`;
  const k = m2 / 1e6;
  return k < 100 ? `${k.toFixed(2)} km²` : `${group(k)} km²`;
}

/** Decimal degrees, latitude first, six places (about 0.1 m): 12.975372° N, 77.630956° E. */
export function fmtCoords(lng, lat) {
  const one = (v, pos, neg) => { const r = +v.toFixed(6); return `${Math.abs(r).toFixed(6)}° ${r >= 0 ? pos : neg}`; };
  return `${one(lat, 'N', 'S')}, ${one(lng, 'E', 'W')}`;
}
