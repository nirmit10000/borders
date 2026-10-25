// A "lens" is what the map is coloured by: a series, a year, and how to read it (value, change
// between years, per km²). Hex and seat numbers both go through it, so legend, panel and tooltip agree.
import * as HX from './data/hexstore.js';
import { unitVals, units } from './data/units.js';

let CFG = null;
let BY_ID = new Map();

export function initLens(cfg) {
  CFG = cfg;
  BY_ID = new Map(cfg.variables.map((s) => [s.id, s]));
}

export const seriesById = (id) => BY_ID.get(id) || null;
export const allSeries = () => CFG.variables;

export function lensOf(st, over = {}) {
  const o = { ...st, ...over };
  const s = BY_ID.get(o.var);
  if (!s) return { none: true, id: 'none', label: 'Outline only', years: [] };
  const years = s.years || [];
  const dflt = years.includes(s.default_year) ? s.default_year : years[years.length - 1];
  const year = years.includes(o.year) ? o.year : dflt;
  const canChange = years.length >= 2 && CFG.features.change_mode;
  const mode = canChange && o.mode === 'change' ? 'change' : 'value';
  let from = null;
  if (mode === 'change') {
    from = years.includes(o.from) && o.from < year ? o.from : years[0];
    if (from === year) from = years[0];
  }
  const density = !!(o.density && s.density && CFG.features.density_toggle);
  const pctChange = mode === 'change' && s.agg === 'sum';
  let unitLabel = s.unit || '';
  if (density) unitLabel = `${s.unit ? `${s.unit} ` : ''}per km²`;
  if (mode === 'change') unitLabel = pctChange ? '% change' : `change${s.unit ? ` (${s.unit})` : ''}`;
  return {
    id: s.id, series: s, label: s.label, note: s.note, evidence: s.evidence || '', projection: s.projection_from && year >= s.projection_from,
    years, year, from, mode, density, pctChange,
    diverging: mode === 'change', ramp: s.ramp, format: density ? 'dec2' : s.format, agg: s.agg, unitLabel,
    title: `${s.label}${density ? ' per km²' : ''}${mode === 'change' ? `, change ${from}–${year}` : `, ${year}`}`,
  };
}

export function resAvailable(lens, res) {
  if (lens.none) return true;
  const ys = lens.series.res_years[String(res)];
  if (!ys) return false;
  return (lens.mode === 'change' ? [lens.year, lens.from] : [lens.year]).every((y) => ys.includes(y));
}

function combine(v, v0, lens, area) {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    let x = v[i];
    const a = area ? (typeof area === 'number' ? area : area[i]) : 1;
    if (lens.mode === 'change') {
      const y0 = v0[i];
      if (lens.pctChange) x = y0 > 0 ? ((x - y0) / y0) * 100 : NaN;
      else x = lens.density ? (x - y0) / a : x - y0;
    } else if (lens.density) x /= a;
    out[i] = x;
  }
  return out;
}

export async function hexValues(cs, lens) {
  if (lens.none || !resAvailable(lens, cs.res)) return null;
  const [v, v0] = await Promise.all([
    HX.values(cs, lens.series, lens.year),
    lens.mode === 'change' ? HX.values(cs, lens.series, lens.from) : null,
  ]);
  if (!v) return null;
  return combine(v, v0, lens, lens.density ? cs.area : null);
}

/** Values for every seat of a version-level (index = id), or null. */
export function unitValues(ver, level, lens) {
  if (lens.none) return null;
  const v = unitVals(ver, level, lens.id, lens.year);
  const v0 = lens.mode === 'change' ? unitVals(ver, level, lens.id, lens.from) : null;
  const area = lens.density ? units().versions[ver][level].map((u) => u.area || NaN) : null;
  return combine(v, v0, lens, area);
}
