/* ---------------------------------------------------------
   Geometria da rota, reservas de cabo e localização de eventos
   Coordenadas sempre como [lat, lon]; distâncias em metros.
--------------------------------------------------------- */

const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function haversine(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cumulative(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  }
  return cum;
}

/* ---------- junção dos trechos numa única rota ---------- */
export function buildRoute(lines, tolM = 30) {
  const warnings = [];
  const segs = lines
    .filter((l) => l.coords.length >= 2)
    .map((l, i) => ({ ...l, idx: i, used: false }));
  if (!segs.length) {
    return { coords: [], joints: [], warnings: ["Nenhuma linha encontrada no KMZ."], segments: 0 };
  }
  const endOf = (s, which) => (which === "start" ? s.coords[0] : s.coords[s.coords.length - 1]);

  // procura uma ponta livre (sem outro trecho encostado) para iniciar
  let startSeg = null;
  let startRev = false;
  for (const s of segs) {
    for (const which of ["start", "end"]) {
      if (startSeg) break;
      const p = endOf(s, which);
      const connected = segs.some(
        (o) =>
          o !== s &&
          (haversine(p, endOf(o, "start")) <= tolM || haversine(p, endOf(o, "end")) <= tolM)
      );
      if (!connected) {
        startSeg = s;
        startRev = which === "end";
      }
    }
  }
  if (!startSeg) {
    startSeg = segs[0];
    startRev = false;
    warnings.push("Não achei ponta livre no traçado; usei o primeiro trecho como início.");
  }

  const coords = [...(startRev ? [...startSeg.coords].reverse() : startSeg.coords)];
  startSeg.used = true;
  const joints = [];

  while (true) {
    const tail = coords[coords.length - 1];
    let best = null;
    for (const s of segs) {
      if (s.used) continue;
      for (const which of ["start", "end"]) {
        const d = haversine(tail, endOf(s, which));
        if (d <= tolM && (!best || d < best.d)) best = { s, rev: which === "end", d };
      }
    }
    if (!best) break;
    joints.push({ index: coords.length - 1 });
    best.s.used = true;
    const c = best.rev ? [...best.s.coords].reverse() : best.s.coords;
    coords.push(...(best.d < 0.5 ? c.slice(1) : c));
  }

  const unused = segs.filter((s) => !s.used);
  if (unused.length) {
    warnings.push(
      `${unused.length} trecho(s) não ligado(s) à rota principal (tolerância ${tolM} m): ` +
        unused
          .slice(0, 4)
          .map((s) => s.name || `trecho ${s.idx + 1}`)
          .join(", ") +
        (unused.length > 4 ? "…" : "")
    );
  }
  return { coords, joints, warnings, segments: segs.length };
}

/* ---------- projeção de um ponto sobre a rota ---------- */
export function projectOnRoute(p, coords, cum) {
  const kx = R * Math.cos(rad(p[0]));
  const ky = R;
  let best = { dist: Infinity, pos: 0, point: coords[0] };
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const ax = rad(a[1] - p[1]) * kx;
    const ay = rad(a[0] - p[0]) * ky;
    const bx = rad(b[1] - p[1]) * kx;
    const by = rad(b[0] - p[0]) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? (-ax * dx - ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.hypot(px, py);
    if (d < best.dist) {
      const segLen = cum[i + 1] - cum[i];
      best = {
        dist: d,
        pos: cum[i] + t * segLen,
        point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])],
      };
    }
  }
  return best;
}

/* ---------- ponto a uma distância x do início da rota ---------- */
export function pointAt(x, coords, cum) {
  const total = cum[cum.length - 1];
  if (x <= 0) return coords[0];
  if (x >= total) return coords[coords.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= x) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const t = seg > 0 ? (x - cum[lo]) / seg : 0;
  return [
    coords[lo][0] + t * (coords[hi][0] - coords[lo][0]),
    coords[lo][1] + t * (coords[hi][1] - coords[lo][1]),
  ];
}

/* ---------- caixas de emenda (marcadores + junções), sem duplicar ---------- */
export function dedupeBoxes(list, minGapM = 10) {
  const sorted = [...list].sort((a, b) => a.pos - b.pos);
  const out = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.pos - last.pos < minGapM) {
      if (b.source === "marcador" && last.source !== "marcador") out[out.length - 1] = b;
      continue;
    }
    out.push(b);
  }
  return out;
}

/* ---------- reservas de cabo e conversão fibra → rota ---------- */
export function buildReserves(boxes, total, o) {
  const list = boxes.map((b) => ({ pos: b.pos, reserve: o.boxReserveM, name: b.name }));
  if (o.everyM > 0 && o.everyReserveM > 0) {
    for (let x = o.everyM; x < total; x += o.everyM) {
      list.push({ pos: x, reserve: o.everyReserveM, name: null });
    }
  }
  return list.sort((a, b) => a.pos - b.pos);
}

export function fiberToRoute(D, reserves, total) {
  let fiber = 0;
  let route = 0;
  for (const rs of reserves) {
    const seg = rs.pos - route;
    if (D <= fiber + seg) return { x: route + (D - fiber), inReserve: false };
    fiber += seg;
    route = rs.pos;
    if (D <= fiber + rs.reserve) return { x: route, inReserve: true };
    fiber += rs.reserve;
  }
  const x = route + (D - fiber);
  return { x, inReserve: false, beyondM: Math.max(0, x - total) };
}

export function totalReserve(reserves) {
  return reserves.reduce((s, r) => s + r.reserve, 0);
}

/* ---------- caixa anterior / seguinte a uma posição ---------- */
export function surroundingBoxes(x, boxes) {
  let prev = null;
  let next = null;
  for (const b of boxes) {
    if (b.pos <= x) prev = b;
    else {
      next = b;
      break;
    }
  }
  return { prev, next };
}

/* ---------- posiciona os eventos de uma fibra na rota ---------- */
export function locateEvents(sor, ctx, o) {
  const { coords, cum, total, boxes } = ctx;
  const rev = o.side === "end";
  const bx = rev
    ? boxes.map((b) => ({ ...b, pos: total - b.pos })).sort((a, b) => a.pos - b.pos)
    : boxes;
  const reserves = buildReserves(bx, total, o);
  const events = sor.events.map((ev) => {
    const D = Math.max(0, ev.distM - o.offsetM);
    const res = fiberToRoute(D, reserves, total);
    const xr = Math.max(0, Math.min(total, res.x));
    const x = rev ? total - xr : xr;
    const [lat, lon] = pointAt(x, coords, cum);
    const { prev, next } = surroundingBoxes(x, boxes);
    return {
      ...ev,
      fiberM: ev.distM - o.offsetM,
      routeM: x,
      lat,
      lon,
      inReserve: res.inReserve,
      beyondM: res.beyondM || 0,
      prev,
      next,
    };
  });
  return { events, reserveM: totalReserve(reserves) };
}

export function filterEvents(events, thresholdDb) {
  return events.filter(
    (e) => e.fiberM > 0.5 && (e.endOfFiber || Math.abs(e.lossDb) >= thresholdDb)
  );
}

/* ---------- compara eventos das fibras A e B ---------- */
export function mergeFibers(aEvents, bEvents, tolM, ctx) {
  const pairs = [];
  aEvents.forEach((a, i) =>
    bEvents.forEach((b, j) => {
      const d = Math.abs(a.routeM - b.routeM);
      if (d <= tolM) pairs.push({ i, j, d });
    })
  );
  pairs.sort((p, q) => p.d - q.d);
  const usedA = new Set();
  const usedB = new Set();
  const items = [];
  for (const p of pairs) {
    if (usedA.has(p.i) || usedB.has(p.j)) continue;
    usedA.add(p.i);
    usedB.add(p.j);
    const a = aEvents[p.i];
    const b = bEvents[p.j];
    const x = (a.routeM + b.routeM) / 2;
    const [lat, lon] = pointAt(x, ctx.coords, ctx.cum);
    const { prev, next } = surroundingBoxes(x, ctx.boxes);
    items.push({ kind: "both", a, b, routeM: x, lat, lon, prev, next });
  }
  aEvents.forEach((a, i) => {
    if (!usedA.has(i))
      items.push({ kind: "A", a, b: null, routeM: a.routeM, lat: a.lat, lon: a.lon, prev: a.prev, next: a.next });
  });
  bEvents.forEach((b, j) => {
    if (!usedB.has(j))
      items.push({ kind: "B", a: null, b, routeM: b.routeM, lat: b.lat, lon: b.lon, prev: b.prev, next: b.next });
  });
  items.sort((p, q) => p.routeM - q.routeM);
  items.forEach((it, i) => {
    it.id = `ev${i}`;
    it.n = i + 1;
  });
  return items;
}

/* ---------- trecho da rota entre duas posições ---------- */
export function sliceRoute(coords, cum, x0, x1) {
  const out = [pointAt(x0, coords, cum)];
  for (let i = 0; i < coords.length; i++) {
    if (cum[i] > x0 && cum[i] < x1) out.push(coords[i]);
  }
  out.push(pointAt(x1, coords, cum));
  return out;
}

/* ---------- possível rompimento: metragem na fibra (a partir de A) ---------- */
export function locateBreak(D, ctx, o, marginM) {
  const { coords, cum, total, boxes } = ctx;
  const reserves = buildReserves(boxes, total, o);
  const res = fiberToRoute(D, reserves, total);
  const x = Math.max(0, Math.min(total, res.x));
  const [lat, lon] = pointAt(x, coords, cum);
  const { prev, next } = surroundingBoxes(x, boxes);
  const reserveM = totalReserve(reserves);
  const x0 = Math.max(0, x - marginM);
  const x1 = Math.min(total, x + marginM);
  return {
    fiberM: D,
    routeM: x,
    lat,
    lon,
    prev,
    next,
    inReserve: res.inReserve,
    beyondM: res.beyondM || 0,
    reserveM,
    expectedFiberM: total + reserveM,
    marginM,
    zone: sliceRoute(coords, cum, x0, x1),
  };
}

/* ---------- formatação ---------- */
export const fmtM = (v, d = 1) =>
  Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function localText(it) {
  const parts = [];
  if (it.prev) parts.push(`${fmtM(it.routeM - it.prev.pos, 0)} m após ${it.prev.name}`);
  else parts.push(`${fmtM(it.routeM, 0)} m do início`);
  if (it.next) parts.push(`${fmtM(it.next.pos - it.routeM, 0)} m antes de ${it.next.name}`);
  return parts.join(" · ");
}
