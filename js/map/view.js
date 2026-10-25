/* global maplibregl, deck, h3 */
// One map: MapLibre (basemap, overlays, both versions' boundaries, selection, labels) + a deck.gl
// layer for hexagons in the same WebGL context (from India Hex). Every version and level has its own
// source, an invisible fill (so hover can read every version at a point) and a line layer whose
// opacity fades when versions are switched. The main map and the swipe map are both MapViews.
import { groupLayers } from './overlays.js';

const EMPTY = { type: 'FeatureCollection', features: [] };
const LEVELS = ['pc', 'ac'];
const FALLBACK_GLYPHS = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const FADE = { duration: 350, delay: 0 };

function signedArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return a;
}

/** World polygon with the selected unit cut out (holes wound opposite to the outer ring). */
function maskFor(feature) {
  const world = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  const ws = Math.sign(signedArea(world));
  const holes = polys.map((p) => (Math.sign(signedArea(p[0])) === ws ? [...p[0]].reverse() : p[0]));
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...holes] } };
}

export class MapView {
  constructor(container, { cfg, vs, versions, interactive = true, view }) {
    this.cfg = cfg;
    this.vs = vs;
    this.versions = versions;          // e.g. ['1976', '2008']
    this.dark = true;
    this.lineScale = 1;
    this.shown = { level: 'ac', vers: Object.fromEntries(versions.map((v) => [v, true])), outline: true };
    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        glyphs: vs?.glyphs || FALLBACK_GLYPHS,
        ...(vs?.sprite ? { sprite: vs.sprite } : {}),
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }],
      },
      ...view,
      interactive,
      minZoom: 4,
      maxZoom: 18.5,
      maxPitch: 70,
      dragRotate: true,
      pitchWithRotate: true,
      attributionControl: interactive ? { compact: true } : false,
      preserveDrawingBuffer: true, // PNG export
      fadeDuration: 150,
    });
    this.overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
    this.map.addControl(this.overlay);
    this.ready = new Promise((resolve) => this.map.on('load', () => { this._setup(); resolve(); }));
    this.hexLayerProps = null;
  }

  _setup() {
    const m = this.map;
    const anchor = (id) => m.addLayer({ id, type: 'background', layout: { visibility: 'none' }, paint: {} });
    for (const v of this.versions) for (const l of LEVELS) m.addSource(`b-${v}-${l}`, { type: 'geojson', data: EMPTY, tolerance: 0.25 });
    for (const s of ['outline', 'mask', 'sel', 'cp', 'hexsel', 'labels', 'here']) m.addSource(s, { type: 'geojson', data: EMPTY });

    anchor('z-base');
    for (const v of this.versions) {
      for (const l of LEVELS) {
        m.addLayer({
          id: `fill-${v}-${l}`, type: 'fill', source: `b-${v}-${l}`,
          paint: {
            'fill-color': ['coalesce', ['feature-state', 'fc'],
              ['case', ['boolean', ['feature-state', 'hover'], false], 'rgba(242,196,109,0.16)', 'rgba(0,0,0,0)']],
            'fill-opacity': 0.6,
          },
        });
      }
    }
    // seats raised in 3D when the map is coloured by seat (no hexagons)
    for (const v of this.versions) {
      for (const l of LEVELS) {
        m.addLayer({
          id: `ext-${v}-${l}`, type: 'fill-extrusion', source: `b-${v}-${l}`, layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': ['coalesce', ['feature-state', 'fc'], '#888888'],
            'fill-extrusion-height': ['coalesce', ['feature-state', 'h'], 0],
            'fill-extrusion-opacity': 0.88, 'fill-extrusion-vertical-gradient': true,
          },
        });
      }
    }
    m.addLayer({ id: 'mask-fill', type: 'fill', source: 'mask', paint: { 'fill-color': 'rgba(0,0,0,0.4)' } });
    // selection: a tint and a soft glow UNDER the boundary lines, so both maps' lines stay readable on top
    m.addLayer({ id: 'cp-glow', type: 'line', source: 'cp', layout: { 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 5, 12, 9], 'line-blur': 4, 'line-opacity': 0.6 } });
    m.addLayer({ id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-opacity': 0.2, 'fill-opacity-transition': FADE } });
    m.addLayer({ id: 'sel-glow', type: 'line', source: 'sel', layout: { 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 9, 12, 16], 'line-blur': 7, 'line-opacity': 0.75 } });
    m.addLayer({ id: 'sel-core', type: 'line', source: 'sel', layout: { 'line-join': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 3.5, 12, 6], 'line-opacity': 0.6 } });
    anchor('z-lines');
    // newest (solid) first, older (dashed) on top: where a line did not move, the solid shows through the dashes.
    // Every line has a solid casing underneath, which keeps it legible on imagery.
    for (const v of [...this.versions].reverse()) {
      for (const l of LEVELS) {
        m.addLayer({ id: `case-${v}-${l}`, type: 'line', source: `b-${v}-${l}`, layout: { 'line-join': 'round' }, paint: { 'line-opacity': 0, 'line-opacity-transition': FADE } });
      }
    }
    for (const v of [...this.versions].reverse()) {
      for (const l of LEVELS) {
        m.addLayer({ id: `line-${v}-${l}`, type: 'line', source: `b-${v}-${l}`, layout: { 'line-join': 'round' }, paint: { 'line-opacity': 0, 'line-opacity-transition': FADE } });
      }
    }
    m.addLayer({ id: 'line-outline', type: 'line', source: 'outline', layout: { 'line-join': 'round' }, paint: {} });
    m.addLayer({ id: 'hexsel-line', type: 'line', source: 'hexsel', paint: { 'line-color': '#7dd3fc', 'line-width': 3 } });
    m.addLayer({ id: 'here-acc', type: 'fill', source: 'here', filter: ['==', ['get', 'k'], 'acc'], paint: { 'fill-color': '#2f7de1', 'fill-opacity': 0.12 } });
    m.addLayer({ id: 'here-acc-line', type: 'line', source: 'here', filter: ['==', ['get', 'k'], 'acc'], paint: { 'line-color': '#2f7de1', 'line-width': 1, 'line-opacity': 0.6 } });
    m.addLayer({ id: 'here-h7', type: 'line', source: 'here', filter: ['==', ['get', 'k'], 'h7'], paint: { 'line-color': '#7dd3fc', 'line-width': 1.6, 'line-dasharray': [2, 1.5] } });
    m.addLayer({ id: 'here-dot', type: 'circle', source: 'here', filter: ['==', ['get', 'k'], 'dot'], paint: { 'circle-radius': 7, 'circle-color': '#2f7de1', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 } });
    m.addLayer({
      id: 'unit-labels', type: 'symbol', source: 'labels',
      layout: {
        'text-field': ['get', 'n'],
        'text-font': [this.vs ? 'Noto Sans Italic' : 'Noto Sans Medium'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 10.5, 9, 12, 12, 14],
        'text-max-width': 8, 'text-padding': 6, 'symbol-sort-key': ['get', 'r'], 'text-letter-spacing': 0.02,
      },
      paint: { 'text-halo-width': 1.4, 'text-opacity-transition': FADE },
    });
    anchor('z-symbols');

    this.ovGroups = {};
    if (this.vs?.source) {
      m.addSource('ov', this.vs.source);
      this.ovGroups = groupLayers(this.vs, this.cfg.overlays.groups);
      for (const layers of Object.values(this.ovGroups)) {
        for (const L of layers) {
          try { m.addLayer(L, L.type === 'symbol' ? 'z-symbols' : 'z-lines'); } catch (e) { /* layer uses unsupported paint */ }
        }
      }
    }
    for (const [id, r] of Object.entries(this.cfg.overlays.raster || {})) {
      m.addSource(`ovr-${id}`, { type: 'raster', tiles: r.tiles, tileSize: 256, maxzoom: r.maxzoom || 19 });
      m.addLayer({ id: `ovr-${id}`, type: 'raster', source: `ovr-${id}`, layout: { visibility: 'none' } }, 'z-lines');
    }
  }

  // ---- basemap / palette / overlays -------------------------------------------------------------
  setBasemap(bm) {
    const m = this.map;
    const style = m.getStyle();
    for (const l of style.layers) if (l.id.startsWith('bm-') || l.id.startsWith('bmv-')) m.removeLayer(l.id);
    for (const s of Object.keys(style.sources)) if (s.startsWith('bm-')) m.removeSource(s);
    if (bm.vector && this.vs?.source) {
      for (const L of this.vs.style.layers) {
        if (L.source && L.source !== this.vs.sourceId) continue;
        const layout = { ...(L.layout || {}) };
        if (JSON.stringify(layout['text-field'] || '').includes('name')) layout['text-field'] = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
        const layer = { ...L, id: `bmv-${L.id}`, layout, ...(L.source ? { source: 'ov' } : {}) };
        try { m.addLayer(layer, L.type === 'symbol' ? 'z-symbols' : 'z-base'); } catch (e) { /* unsupported layer */ }
      }
    } else {
      m.addSource('bm-0', { type: 'raster', tiles: bm.tiles, tileSize: 256, maxzoom: bm.maxzoom || 19, attribution: bm.attribution || '' });
      m.addLayer({ id: 'bm-0', type: 'raster', source: 'bm-0', paint: { 'raster-fade-duration': 150 } }, 'z-base');
    }
    this.dark = !!bm.dark;
    this.applyPalette();
  }

  get pal() { return this.cfg.palette[this.dark ? 'dark' : 'light']; }

  /** Colours, widths and dashes from the palette; opacity from what is shown (see setLines). */
  applyPalette() {
    const m = this.map;
    const p = this.pal;
    for (const v of this.versions) {
      for (const l of LEVELS) {
        const [col, , w8, w12, dash] = p[v][l];
        const hw = (w) => ['case', ['boolean', ['feature-state', 'hover'], false], w + 1.2, w];
        m.setPaintProperty(`line-${v}-${l}`, 'line-color', col);
        m.setPaintProperty(`line-${v}-${l}`, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, hw(w8 * 0.55), 8, hw(w8), 12, hw(w12), 16, hw(w12 * 1.3)]);
        m.setPaintProperty(`line-${v}-${l}`, 'line-dasharray', dash && dash.length ? dash : [1, 0]);
        const [cc, extra] = (p.casing && p.casing[v]) || ['rgba(0,0,0,0)', 0];
        m.setPaintProperty(`case-${v}-${l}`, 'line-color', cc);
        m.setPaintProperty(`case-${v}-${l}`, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, w8 * 0.55 + extra * 0.6, 8, w8 + extra, 12, w12 + extra, 16, w12 * 1.3 + extra]);
      }
    }
    const [oc, oo, ow8, ow12] = p.outline;
    m.setPaintProperty('line-outline', 'line-color', oc);
    m.setPaintProperty('line-outline', 'line-opacity', this.shown.outline ? oo : 0);
    m.setPaintProperty('line-outline', 'line-width', ['interpolate', ['linear'], ['zoom'], 5, ow8 * 0.6, 8, ow8, 12, ow12]);
    m.setPaintProperty('sel-fill', 'fill-color', p.selection);
    for (const id of ['sel-glow', 'sel-core']) m.setPaintProperty(id, 'line-color', p.selection);
    m.setPaintProperty('cp-glow', 'line-color', p.counterpart);
    m.setPaintProperty('mask-fill', 'fill-color', p.mask);
    m.setPaintProperty('unit-labels', 'text-color', p.label);
    m.setPaintProperty('unit-labels', 'text-halo-color', p.label_halo);
    this._lineOpacity();
  }

  /** Which versions' lines are drawn, and at which level: {level, vers: {ver: bool}, outline}. */
  setLines(shown) {
    this.shown = { ...this.shown, ...shown };
    this._lineOpacity();
    const p = this.pal;
    this.map.setPaintProperty('line-outline', 'line-opacity', this.shown.outline ? p.outline[1] : 0);
  }

  _lineOpacity() {
    const p = this.pal;
    for (const v of this.versions) {
      for (const l of LEVELS) {
        const on = this.shown.vers[v] && l === this.shown.level;
        this.map.setPaintProperty(`line-${v}-${l}`, 'line-opacity', on ? Math.min(1, p[v][l][1] * this.lineScale) : 0);
        this.map.setPaintProperty(`case-${v}-${l}`, 'line-opacity', on ? 1 : 0);
      }
    }
  }

  setLineScale(f) { this.lineScale = f; this._lineOpacity(); }

  setOverlays(on) {
    for (const [g, layers] of Object.entries(this.ovGroups)) {
      for (const L of layers) if (this.map.getLayer(L.id)) this.map.setLayoutProperty(L.id, 'visibility', on.includes(g) ? 'visible' : 'none');
    }
    for (const id of Object.keys(this.cfg.overlays.raster || {})) {
      this.map.setLayoutProperty(`ovr-${id}`, 'visibility', on.includes(id) ? 'visible' : 'none');
    }
  }

  // ---- boundaries ------------------------------------------------------------------------------
  setBoundaryData(ver, level, fc) { this.map.getSource(`b-${ver}-${level}`).setData(fc); }
  setOutline(fc) { this.map.getSource('outline').setData(fc); }

  setFillOpacity(op) {
    this.fillOpacity = op;
    for (const v of this.versions) for (const l of LEVELS) this.map.setPaintProperty(`fill-${v}-${l}`, 'fill-opacity', op);
  }

  /**
   * colours: Map(unitId -> css colour) on one version-level, or null to clear every level.
   * heights: Map(unitId -> metres) to raise those seats in 3D, or null (flat).
   */
  setUnitColours(ver, level, colours, heights = null) {
    for (const v of this.versions) for (const l of LEVELS) this.map.removeFeatureState({ source: `b-${v}-${l}` });
    if (colours) for (const [id, c] of colours) this.map.setFeatureState({ source: `b-${ver}-${level}`, id }, { fc: c, h: heights?.get(id) ?? 0 });
    for (const v of this.versions) {
      for (const l of LEVELS) {
        const on = !!heights && v === ver && l === level;
        this.map.setLayoutProperty(`ext-${v}-${l}`, 'visibility', on ? 'visible' : 'none');
        this.map.setPaintProperty(`fill-${v}-${l}`, 'fill-opacity', on ? 0 : this.fillOpacity ?? 0.6);
      }
    }
  }

  setUnitHover(ver, level, id, on) {
    if (id == null) return;
    this.map.setFeatureState({ source: `b-${ver}-${level}`, id }, { hover: on });
  }

  /** The selected seat: tint (only when the map is not coloured by data) and glow, both under the lines. */
  setSelection(feature, mask, tint = true) {
    this.map.getSource('sel').setData(feature || EMPTY);
    this.map.getSource('mask').setData(feature && mask ? maskFor(feature) : EMPTY);
    this.map.setPaintProperty('sel-fill', 'fill-opacity', tint ? 0.2 : 0);
  }

  /** The other version's seats that took part of the selected one (dashed accent). */
  setCounterparts(features) {
    this.map.getSource('cp').setData(features && features.length ? { type: 'FeatureCollection', features } : EMPTY);
  }

  setHexSelection(h3id) {
    if (!h3id) { this.map.getSource('hexsel').setData(EMPTY); return; }
    const ring = h3.cellToBoundary(h3id, true);
    ring.push(ring[0]);
    this.map.getSource('hexsel').setData({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } });
  }

  setHere(here) {
    if (!here) { this.map.getSource('here').setData(EMPTY); return; }
    const { lat, lng, acc, h7 } = here;
    const r = Math.max(acc || 0, 15);
    const ring = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      ring.push([lng + (r / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (r / 110540) * Math.sin(a)]);
    }
    const feats = [
      { type: 'Feature', properties: { k: 'acc' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      { type: 'Feature', properties: { k: 'dot' }, geometry: { type: 'Point', coordinates: [lng, lat] } },
    ];
    if (h7) {
      const b = h3.cellToBoundary(h7, true); b.push(b[0]);
      feats.push({ type: 'Feature', properties: { k: 'h7' }, geometry: { type: 'Polygon', coordinates: [b] } });
    }
    this.map.getSource('here').setData({ type: 'FeatureCollection', features: feats });
  }

  /** Labels of one version-level; `text(u)` gives the label text. */
  setLabels(list, minzoom, visible, text) {
    this.map.getSource('labels').setData({
      type: 'FeatureCollection',
      features: list.filter((u) => u.lp && !u.hidden).map((u) => ({ type: 'Feature', properties: { n: text(u), r: -(u.h8 || 0) }, geometry: { type: 'Point', coordinates: u.lp } })),
    });
    this.map.setLayerZoomRange('unit-labels', minzoom, 24);
    this.map.setLayoutProperty('unit-labels', 'visibility', visible ? 'visible' : 'none');
  }

  // ---- hexagons (deck.gl) ----------------------------------------------------------------------
  setHexes({ cs, fill, elev, threeD, lines, version }) {
    if (!cs || !cs.n) { this.overlay.setProps({ layers: [] }); this.hexLayerProps = null; return; }
    const lineRGBA = this.dark ? [255, 255, 255, 80] : [40, 38, 34, 70];
    const data = cs.idx || (cs.idx = Uint32Array.from({ length: cs.n }, (_, i) => i));
    const props = {
      id: 'hex',
      beforeId: 'mask-fill',
      data,
      getHexagon: (i) => cs.h[i],
      highPrecision: cs.n < 15000 ? true : 'auto',
      filled: true,
      stroked: lines && !threeD,
      extruded: !!threeD,
      getFillColor: fill ? (i, { target }) => { const o = 4 * i; target[0] = fill[o]; target[1] = fill[o + 1]; target[2] = fill[o + 2]; target[3] = fill[o + 3]; return target; } : [0, 0, 0, 0],
      getLineColor: lineRGBA,
      lineWidthUnits: 'meters',
      getLineWidth: { 6: 150, 7: 56, 8: 21 }[cs.res] || 30,
      lineWidthMaxPixels: 1.4,
      getElevation: elev ? (i) => elev[i] : 0,
      elevationScale: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 214, 140, 150],
      material: { ambient: 0.55, diffuse: 0.6, shininess: 24, specularColor: [40, 40, 40] },
      updateTriggers: { getFillColor: version, getElevation: version, getLineColor: this.dark },
    };
    this.hexLayerProps = props;
    this.overlay.setProps({ layers: [new deck.H3HexagonLayer(props)] });
  }

  /** {hex: index|null, at: {ver: {ac: id|null, pc: id|null}}} under a screen point. */
  pick(point) {
    let hex = null;
    if (this.hexLayerProps) {
      const info = this.overlay.pickObject({ x: point.x, y: point.y, radius: 1, layerIds: ['hex'] });
      if (info && info.index >= 0) hex = info.index;
    }
    const at = {};
    for (const v of this.versions) {
      at[v] = {};
      for (const l of LEVELS) {
        const f = this.map.queryRenderedFeatures(point, { layers: [`fill-${v}-${l}`] })[0];
        at[v][l] = f ? f.id : null;
      }
    }
    return { hex, at };
  }
}
