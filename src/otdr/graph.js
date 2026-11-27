/* ---------------------------------------------------------
   Rota única A→B a partir de vários trechos soltos do KMZ.
   Cada trecho vira uma sequência de nós (a cada ~25 m); nós de
   trechos diferentes a menos de "tol" metros são ligados por uma
   "ponte". O caminho mais curto entre A e B forma a rota.
--------------------------------------------------------- */
import { haversine } from "./route.js";

class MinHeap {
  constructor() {
    this.a = [];
  }
  push(item) {
    const a = this.a;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

function densifyLine(coords, stepM) {
  const out = [{ lat: coords[0][0], lon: coords[0][1], orig: true }];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const d = haversine(a, b);
    const k = Math.max(1, Math.ceil(d / stepM));
    for (let j = 1; j < k; j++) {
      const t = j / k;
      out.push({ lat: a[0] + t * (b[0] - a[0]), lon: a[1] + t * (b[1] - a[1]), orig: false });
    }
    out.push({ lat: b[0], lon: b[1], orig: true });
  }
  return out;
}

export function buildGraph(lines, tolM, stepM = 25) {
  const nodes = [];
  const meta = [];
  const adj = [];
  const lineEnds = [];

  lines.forEach((ln, li) => {
    const dense = densifyLine(ln.coords, stepM);
    let prev = -1;
    const first = nodes.length;
    for (const p of dense) {
      const id = nodes.length;
      nodes.push([p.lat, p.lon]);
      meta.push({ line: li, orig: p.orig });
      adj.push([]);
      if (prev >= 0) {
        const w = haversine(nodes[prev], nodes[id]);
        adj[prev].push([id, w, 0]);
        adj[id].push([prev, w, 0]);
      }
      prev = id;
    }
    lineEnds.push([first, nodes.length - 1]);
  });

  // grade espacial para achar vizinhos de outros trechos
  const cell = (Math.max(tolM, 1) / 111320) * 1.2;
  const grid = new Map();
  const key = (cx, cy) => `${cx}|${cy}`;
  nodes.forEach((p, i) => {
    const k = key(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });

  const bridged = new Set();
  nodes.forEach((p, i) => {
    const cx = Math.floor(p[0] / cell);
    const cy = Math.floor(p[1] / cell);
    const best = new Map(); // trecho → [nó, distância]
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(key(cx + dx, cy + dy));
        if (!arr) continue;
        for (const j of arr) {
          if (meta[j].line === meta[i].line) continue;
          const d = haversine(p, nodes[j]);
          if (d > tolM) continue;
          const cur = best.get(meta[j].line);
          if (!cur || d < cur[1]) best.set(meta[j].line, [j, d]);
        }
      }
    }
    for (const [, [j, d]] of best) {
      adj[i].push([j, d + 1, 1]);
      bridged.add(i);
      bridged.add(j);
    }
  });

  // pontas livres: extremidades de trechos sem nenhum outro trecho por perto
  const freeEnds = [];
  lineEnds.forEach(([a, b], li) => {
    for (const id of [a, b]) {
      if (!bridged.has(id)) freeEnds.push({ lat: nodes[id][0], lon: nodes[id][1], line: li });
    }
  });

  return { nodes, meta, adj, freeEnds, tolM };
}

export function nearestNode(graph, p) {
  let best = -1;
  let bd = Infinity;
  const kx = Math.cos((p[0] * Math.PI) / 180);
  graph.nodes.forEach((n, i) => {
    const dy = n[0] - p[0];
    const dx = (n[1] - p[1]) * kx;
    const d2 = dx * dx + dy * dy;
    if (d2 < bd) {
      bd = d2;
      best = i;
    }
  });
  return { id: best, distM: best >= 0 ? haversine(graph.nodes[best], p) : Infinity };
}

export function shortestPath(graph, s, t) {
  const n = graph.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const viaGap = new Uint8Array(n);
  dist[s] = 0;
  const h = new MinHeap();
  h.push([0, s]);
  while (h.size) {
    const [d, u] = h.pop();
    if (d > dist[u]) continue;
    if (u === t) break;
    for (const [v, w, gap] of graph.adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) {
        dist[v] = nd;
        prev[v] = u;
        viaGap[v] = gap;
        h.push([nd, v]);
      }
    }
  }
  if (!isFinite(dist[t])) return null;
  const path = [];
  for (let v = t; v !== -1; v = prev[v]) path.push(v);
  path.reverse();
  return { path, viaGap };
}

/* Procura a rota A→B; se não houver caminho, vai aumentando a tolerância
   de ligação entre trechos até conseguir (limite de 1000 m). */
export function findRoute(lines, A, B, baseTolM) {
  const tols = [baseTolM, 60, 100, 200, 500, 1000].filter((t, i, arr) => t >= baseTolM && arr.indexOf(t) === i);
  for (const tol of tols) {
    const g = buildGraph(lines, tol);
    if (!g.nodes.length) return { error: "Nenhum trecho ativo." };
    const sa = nearestNode(g, [A.lat, A.lon]);
    const sb = nearestNode(g, [B.lat, B.lon]);
    if (sa.id === sb.id) return { error: "As pontas A e B caíram no mesmo ponto." };
    const sp = shortestPath(g, sa.id, sb.id);
    if (!sp) continue;

    const { path, viaGap } = sp;
    const coords = [];
    const joints = [];
    const gaps = [];
    const linesUsed = new Set();
    path.forEach((id, k) => {
      const m = g.meta[id];
      linesUsed.add(m.line);
      const prevLine = k > 0 ? g.meta[path[k - 1]].line : m.line;
      const nextLine = k < path.length - 1 ? g.meta[path[k + 1]].line : m.line;
      if (m.orig || k === 0 || k === path.length - 1 || prevLine !== m.line || nextLine !== m.line) {
        coords.push([g.nodes[id][0], g.nodes[id][1]]);
      }
      if (k > 0 && viaGap[id]) {
        gaps.push({ lengthM: haversine(g.nodes[path[k - 1]], g.nodes[id]), index: coords.length - 1 });
      }
      if (nextLine !== m.line && k < path.length - 1) joints.push({ index: coords.length - 1 });
    });

    const warnings = [];
    if (sa.distM > 100) warnings.push(`A ponta A ficou a ${Math.round(sa.distM)} m do traçado mais próximo.`);
    if (sb.distM > 100) warnings.push(`A ponta B ficou a ${Math.round(sb.distM)} m do traçado mais próximo.`);
    return {
      coords,
      joints,
      gaps,
      segments: linesUsed.size,
      usedTol: tol,
      maxGapM: gaps.reduce((mx, g2) => Math.max(mx, g2.lengthM), 0),
      warnings,
    };
  }
  return {
    error:
      "Não achei caminho entre A e B mesmo ligando trechos a até 1000 m. Confira as camadas ativas e as pontas escolhidas.",
  };
}
