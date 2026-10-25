/* global h3 */
// Search across every seat of every map version (by printed name, later spelling or number), H3 ids, and the
// other states on the site (choosing one opens it).
import { esc } from '../scales.js';
import { units, fullName, resTag } from '../data/units.js';

const index = [];
const states = [];
let active = 0;

export function initSearch(ctx) {
  if (!ctx.cfg.features.search) { document.querySelector('.search').hidden = true; return; }
  const U = units();
  const L = ctx.cfg.boundaries.levels;
  for (const v of [...ctx.VERS].reverse()) {
    for (const level of ['pc', 'ac']) {
      for (const u of U.versions[v][level]) {
        const pc = level === 'ac' && u.pc != null ? U.versions[v].pc[u.pc] : null;
        index.push({
          ver: v, level, id: u.id, no: u.no, name: fullName(u), n: `${u.name} ${u.alt || ''}`.toLowerCase(),
          sub: [`No. ${u.no}`, resTag(u), pc ? `PC ${pc.name}` : '', u.hidden ? 'not drawn' : ''].filter(Boolean).join(' · '),
          tag: `${L[level].short} ${v}`,
        });
      }
    }
  }
  for (const s of ctx.cfg.states) {
    if (s.code !== ctx.STATE.code) states.push({ kind: 'state', code: s.code, name: s.name, n: s.name.toLowerCase(), sub: 'Open this state', tag: 'State' });
  }
  const input = document.getElementById('search');
  const box = document.getElementById('searchResults');
  const choose = (el) => {
    if (!el) return;
    box.hidden = true;
    input.blur();
    if (el.dataset.kind === 'hex') ctx.act.goToHex(el.dataset.id);
    else if (el.dataset.kind === 'state') ctx.act.switchState(el.dataset.code);
    else ctx.act.select(el.dataset.ver, el.dataset.level, +el.dataset.id);
  };
  input.addEventListener('input', () => run(input.value, box));
  input.addEventListener('focus', () => input.value && run(input.value, box));
  input.addEventListener('keydown', (e) => {
    const items = [...box.querySelectorAll('.sr')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('on', i === active));
      items[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') choose(items[active]);
    else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
  });
  box.addEventListener('click', (e) => choose(e.target.closest('.sr')));
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); input.focus(); input.select(); }
  });
}

function run(q, box) {
  q = q.trim();
  if (!q) { box.hidden = true; return; }
  const ql = q.toLowerCase();
  let hits = [];
  if (/^[0-9a-f]{15}$/i.test(q) && h3.isValidCell(ql)) {
    hits = [{ kind: 'hex', id: ql, name: ql, sub: `H${h3.getResolution(ql)} hexagon`, tag: 'Hex', i: -1 }];
  } else if (/^\d+$/.test(q)) {
    hits = index.filter((e) => e.no === +q).map((e) => ({ ...e, i: -1, score: e.level === 'ac' ? 0 : 1 }));
  } else {
    for (const e of index) {
      const i = e.n.indexOf(ql);
      if (i < 0) continue;
      const score = (i === 0 ? 0 : e.n[i - 1] === ' ' || e.n[i - 1] === '(' ? 1 : 2) * 10 + (e.level === 'pc' ? 0 : 1);
      hits.push({ ...e, i: e.name.toLowerCase().indexOf(ql), score });
    }
    hits.sort((a, b) => a.score - b.score || a.name.length - b.name.length);
    const st = states.filter((e) => e.n.includes(ql)).map((e) => ({ ...e, i: e.name.toLowerCase().indexOf(ql) }));
    hits = [...st, ...hits];   // a state named in the box comes first
  }
  hits = hits.slice(0, 30);
  active = 0;
  const item = (h, k) => {
    const nm = h.i >= 0 ? `${esc(h.name.slice(0, h.i))}<mark>${esc(h.name.slice(h.i, h.i + q.length))}</mark>${esc(h.name.slice(h.i + q.length))}` : esc(h.name);
    const data = h.kind === 'hex' ? `data-kind="hex" data-id="${h.id}"` : h.kind === 'state' ? `data-kind="state" data-code="${h.code}"`
      : `data-ver="${h.ver}" data-level="${h.level}" data-id="${h.id}"`;
    return `<button class="sr${k === 0 ? ' on' : ''}" ${data}><span class="t">${esc(h.tag)}</span><span><div class="n">${nm}</div><div class="m">${esc(h.sub)}</div></span></button>`;
  };
  box.innerHTML = hits.length ? hits.map(item).join('') : '<div class="sr-empty">No seat or state matches</div>';
  box.hidden = false;
}
