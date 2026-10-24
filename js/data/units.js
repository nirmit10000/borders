// Seats of every map version: data/<state>/units.json
//   {state, name, bbox, years: {<variable>: [years]}, versions: {<ver>: {ac: [unit], pc: [unit]}}}
// unit: {id, no, name, alt?, res, res_printed?, pc? (AC: PC id), district?, hidden?, why?, caution?, bbox?,
//        lp?, area?, v?: {<variable>: [value per year]}, h8?, src, note?, x?: {<other ver>: [[id, pop, km2], ...]}}
// A unit is addressed as {ver, level, id}; ids are positions in its list (sorted by number).
import { getJSON } from './net.js';

let U = null;

export async function loadUnits(state) {
  U = await getJSON(`data/${state}/units.json`);
  return U;
}

export const units = () => U;
export const list = (ver, level) => U.versions[ver][level];
export const unit = (sel) => (sel ? U.versions[sel.ver][sel.level][sel.id] : null);
export const byNo = (ver, level, no) => U.versions[ver][level].find((u) => u.no === no) || null;
export const pcOf = (ver, ac) => (ac && ac.pc != null ? U.versions[ver].pc[ac.pc] : null);
export const acsOf = (ver, pc) => U.versions[ver].ac.filter((a) => a.pc === pc.id);

/** One variable's value for every unit of a version-level in one year (index = id), NaN where unknown. */
export function unitVals(ver, level, varId, year) {
  const yi = (U.years[varId] || []).indexOf(year);
  return Float64Array.from(U.versions[ver][level], (u) => {
    const a = u.v && u.v[varId];
    return a && yi >= 0 && a[yi] != null ? a[yi] : NaN;
  });
}

/** "Poona (Pune)": the name as printed, with the later spelling in brackets when it differs. */
export const fullName = (u) => (u.alt ? `${u.name} (${u.alt})` : u.name);
export const resTag = (u) => (u.res && u.res !== 'GEN' ? u.res : '');
