import React, { useState, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Upload, Download } from "lucide-react";
import { parseSor, eventLabel } from "./otdr/sor.js";
import { readKmz, exportRouteKmz } from "./otdr/kmz.js";
import { buildGraph, findRoute } from "./otdr/graph.js";
import * as G from "./otdr/route.js";

const COLORS = { both: "#A78BFA", A: "#4C8DFF", B: "#F0C231" };
const HIGH = "#E5484D";
const KIND_LABEL = { both: "A + B (em comum)", A: "Só fibra A", B: "Só fibra B" };

const n = (v, d = 0) => {
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : d;
};

const card = { background: "#14171C", border: "1px solid #262B33" };
const mono = { fontFamily: "'JetBrains Mono', monospace" };
const ghostBtn = (enabled = true) => ({
  background: "#0B0D10",
  color: enabled ? "#C4CBD6" : "#5C6472",
  border: "1px solid #262B33",
});

/* ---------- componentes pequenos ---------- */
function FileSlot({ title, hint, accept, summary, onFile, onClear, error, accent }) {
  return (
    <label
      className="block rounded-lg p-3 cursor-pointer"
      style={{ background: "#0B0D10", border: `1px dashed ${summary ? accent : "#262B33"}` }}
    >
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files && e.target.files[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 text-sm" style={{ color: "#E9ECEF" }}>
        <Upload size={14} style={{ color: accent }} />
        <span className="flex-1">{title}</span>
        {summary && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClear();
            }}
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ color: "#C4544A", border: "1px solid #3a2a2a" }}
          >
            remover
          </button>
        )}
      </div>
      <div className="text-xs mt-1 break-words" style={{ color: error ? "#C4544A" : "#8A94A6" }}>
        {error || summary || hint}
      </div>
    </label>
  );
}

function Field({ label, value, onChange, unit, type = "number" }) {
  return (
    <div>
      <label className="text-[11px] mb-1 block" style={{ color: "#8A94A6" }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
          style={{
            ...mono,
            paddingRight: unit ? 30 : undefined,
            background: "#0B0D10",
            color: "#E9ECEF",
            border: "1px solid #262B33",
          }}
        />
        {unit && (
          <span
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px]"
            style={{ color: "#5C6472" }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function SideSelect({ label, value, onChange }) {
  return (
    <div>
      <label className="text-[11px] mb-1 block" style={{ color: "#8A94A6" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md px-2 py-1.5 text-sm outline-none"
        style={{ background: "#0B0D10", color: "#E9ECEF", border: "1px solid #262B33" }}
      >
        <option value="start">Ponta A</option>
        <option value="end">Ponta B</option>
      </select>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: color }} />
      {label}
    </span>
  );
}

function popupHtml(it) {
  const row = (lbl, e) =>
    e
      ? `${lbl}: ${G.fmtM(e.fiberM)} m na fibra · ${G.fmtM(e.lossDb, 2)} dB` +
        (e.reflective ? ` · refl. ${G.fmtM(e.reflDb, 1)} dB` : "") +
        ` · ${G.esc(eventLabel(e))}<br/>`
      : "";
  return (
    `<b>#${it.n} · ${KIND_LABEL[it.kind]}</b><br/>` +
    (it.high ? `<span style="color:#E5484D"><b>Acima do nível de ajuste</b></span><br/>` : "") +
    row("Fibra A", it.a) +
    row("Fibra B", it.b) +
    `Rota: ${G.fmtM(it.routeM)} m<br/>${G.esc(G.localText(it))}<br/>` +
    `<a href="https://www.google.com/maps?q=${it.lat},${it.lon}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>`
  );
}

const breakIcon = () =>
  L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;background:${HIGH};color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font:800 20px sans-serif;box-shadow:0 0 0 4px rgba(229,72,77,.35)">!</div>`,
  });

function breakPopup(r) {
  return (
    `<b style="color:${HIGH}">Possível rompimento</b><br/>` +
    `Fibra: ${G.fmtM(r.fiberM)} m a partir da ponta A<br/>` +
    `Rota: ${G.fmtM(r.routeM)} m (± ${G.fmtM(r.marginM, 0)} m)<br/>${G.esc(G.localText(r))}<br/>` +
    (r.inReserve ? `<i>A metragem cai dentro de uma sobra de cabo.</i><br/>` : "") +
    `<a href="https://www.google.com/maps?q=${r.lat},${r.lon}" target="_blank" rel="noreferrer">Abrir no Google Maps</a>`
  );
}

const endIcon = (letter, color) =>
  L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};color:#0B0D10;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font:700 12px sans-serif">${letter}</div>`,
  });

const fmtPt = (p) => (p ? `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : "não definida");

/* ---------------------------------------------------------
   Aba principal
--------------------------------------------------------- */
export default function OtdrTab({ active }) {
  const [kmz, setKmz] = useState(null);
  const [sorA, setSorA] = useState(null);
  const [sorB, setSorB] = useState(null);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);
  const [pick, setPick] = useState(null);
  const [layerOff, setLayerOff] = useState({});

  const [sideA, setSideA] = useState("start");
  const [sideB, setSideB] = useState("start");
  const [offA, setOffA] = useState("0");
  const [offB, setOffB] = useState("0");
  const [boxRes, setBoxRes] = useState("30");
  const [everyM, setEveryM] = useState("500");
  const [everyRes, setEveryRes] = useState("60");
  const [boxFilter, setBoxFilter] = useState("");
  const [boxMaxDist, setBoxMaxDist] = useState("40");
  const [useMarkers, setUseMarkers] = useState(true);
  const [useJoints, setUseJoints] = useState(false);
  const [joinTol, setJoinTol] = useState("30");
  const [threshold, setThreshold] = useState("0.1");
  const [matchTol, setMatchTol] = useState("15");
  const [hiLevel, setHiLevel] = useState("0.5");
  const [breakM, setBreakM] = useState("");
  const [breakMargin, setBreakMargin] = useState("100");

  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef({});
  const pickRef = useRef(null);

  /* ---------- upload / limpar ---------- */
  const loadKmz = async (file) => {
    try {
      setBusy(true);
      const k = await readKmz(file);
      setKmz(k);
      setPointA(null);
      setPointB(null);
      setLayerOff({});
      setErr((e) => ({ ...e, kmz: null }));
    } catch (e) {
      setErr((p) => ({ ...p, kmz: e.message }));
    } finally {
      setBusy(false);
    }
  };

  const loadSor = async (slot, file) => {
    try {
      const parsed = parseSor(await file.arrayBuffer());
      const v = { name: file.name, ...parsed };
      if (slot === "A") setSorA(v);
      else setSorB(v);
      setErr((p) => ({ ...p, [slot]: null }));
    } catch (e) {
      setErr((p) => ({ ...p, [slot]: e.message }));
    }
  };

  const clearKmz = () => {
    setKmz(null);
    setPointA(null);
    setPointB(null);
    setPick(null);
    setLayerOff({});
    setBreakM("");
    setErr((p) => ({ ...p, kmz: null, export: null }));
  };
  const clearAll = () => {
    clearKmz();
    setSorA(null);
    setSorB(null);
    setErr({});
  };

  /* ---------- camadas, trechos e pontas ---------- */
  const activeLines = useMemo(
    () => (kmz ? kmz.lines.filter((l) => !layerOff[l.layer]) : []),
    [kmz, layerOff]
  );
  const activePoints = useMemo(
    () => (kmz ? kmz.points.filter((p) => !layerOff[p.layer]) : []),
    [kmz, layerOff]
  );

  const baseGraph = useMemo(
    () => (activeLines.length ? buildGraph(activeLines, n(joinTol, 30)) : null),
    [activeLines, joinTol]
  );
  const freeEnds = baseGraph ? baseGraph.freeEnds : [];
  const autoEnds = !pointA && !pointB && freeEnds.length === 2;
  const endA = pointA || (autoEnds ? freeEnds[0] : null);
  const endB = pointB || (autoEnds ? freeEnds[1] : null);

  const routeRes = useMemo(
    () => (endA && endB && activeLines.length ? findRoute(activeLines, endA, endB, n(joinTol, 30)) : null),
    [activeLines, endA, endB, joinTol]
  );

  const route = useMemo(() => {
    if (!routeRes || routeRes.error) return null;
    const cum = G.cumulative(routeRes.coords);
    return { ...routeRes, cum, total: cum[cum.length - 1] };
  }, [routeRes]);

  const swapEnds = () => {
    if (!endA || !endB) return;
    setPointA({ lat: endB.lat, lon: endB.lon });
    setPointB({ lat: endA.lat, lon: endA.lon });
  };

  /* ---------- caixas de emenda ---------- */
  const boxes = useMemo(() => {
    if (!route) return [];
    const list = [];
    if (useMarkers) {
      const terms = boxFilter
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      for (const p of activePoints) {
        const nm = (p.name || "").toLowerCase();
        if (terms.length && !terms.some((t) => nm.includes(t))) continue;
        const pr = G.projectOnRoute([p.lat, p.lon], route.coords, route.cum);
        if (pr.dist <= n(boxMaxDist, 40)) {
          list.push({
            name: p.name || "Caixa",
            pos: pr.pos,
            latlon: pr.point,
            orig: [p.lat, p.lon],
            source: "marcador",
          });
        }
      }
    }
    if (useJoints) {
      route.joints.forEach((j, i) =>
        list.push({
          name: `Junção ${i + 1}`,
          pos: route.cum[j.index],
          latlon: route.coords[j.index],
          source: "junção",
        })
      );
    }
    return G.dedupeBoxes(list);
  }, [route, activePoints, useMarkers, useJoints, boxFilter, boxMaxDist]);

  const ctx = useMemo(
    () => (route ? { coords: route.coords, cum: route.cum, total: route.total, boxes } : null),
    [route, boxes]
  );

  /* ---------- eventos dos .sor ---------- */
  const reserveOpts = {
    boxReserveM: n(boxRes, 30),
    everyM: n(everyM, 500),
    everyReserveM: n(everyRes, 60),
  };
  const rKey = `${boxRes}|${everyM}|${everyRes}`;

  const locA = useMemo(
    () =>
      ctx && sorA ? G.locateEvents(sorA, ctx, { ...reserveOpts, side: sideA, offsetM: n(offA) }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, sorA, sideA, offA, rKey]
  );
  const locB = useMemo(
    () =>
      ctx && sorB ? G.locateEvents(sorB, ctx, { ...reserveOpts, side: sideB, offsetM: n(offB) }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, sorB, sideB, offB, rKey]
  );

  const mergedRaw = useMemo(() => {
    if (!ctx || (!locA && !locB)) return [];
    const th = n(threshold, 0.1);
    const a = locA ? G.filterEvents(locA.events, th) : [];
    const b = locB ? G.filterEvents(locB.events, th) : [];
    return G.mergeFibers(a, b, n(matchTol, 15), ctx);
  }, [ctx, locA, locB, threshold, matchTol]);

  // destaca em vermelho as perdas iguais ou acima do nível escolhido
  const level = n(hiLevel, 0.5);
  const merged = useMemo(
    () =>
      mergedRaw.map((it) => {
        const maxLoss = Math.max(Math.abs(it.a ? it.a.lossDb : 0), Math.abs(it.b ? it.b.lossDb : 0));
        return { ...it, maxLoss, high: maxLoss >= level };
      }),
    [mergedRaw, level]
  );
  const highCount = merged.filter((it) => it.high).length;

  // possível rompimento: metragem da fibra a partir da ponta A (já é distância líquida)
  const rupture = useMemo(() => {
    const D = n(breakM, 0);
    if (!ctx || !(D > 0)) return null;
    return G.locateBreak(
      D,
      ctx,
      { boxReserveM: n(boxRes, 30), everyM: n(everyM, 500), everyReserveM: n(everyRes, 60) },
      Math.max(0, n(breakMargin, 100))
    );
  }, [ctx, breakM, breakMargin, boxRes, everyM, everyRes]);

  /* ---------- mapa ---------- */
  useEffect(() => {
    pickRef.current = pick;
    if (mapRef.current) mapRef.current.getContainer().style.cursor = pick ? "crosshair" : "";
  }, [pick]);

  useEffect(() => {
    if (mapRef.current || !mapEl.current) return undefined;
    const map = L.map(mapEl.current).setView([-15.78, -47.93], 4);
    const sat = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Imagens © Esri" }
    );
    const streets = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap",
    });
    streets.addTo(map);
    L.control.layers({ Ruas: streets, Satélite: sat }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on("click", (e) => {
      const mode = pickRef.current;
      if (!mode) return;
      const p = { lat: e.latlng.lat, lon: e.latlng.lng };
      if (mode === "A") setPointA(p);
      else setPointB(p);
      setPick(null);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 60);
  }, [active]);

  useEffect(() => {
    const map = mapRef.current;
    const g = layerRef.current;
    if (!map || !g) return;
    g.clearLayers();
    markersRef.current = {};

    // trechos ativos (de fundo)
    activeLines.forEach((l) =>
      L.polyline(l.coords, {
        color: route ? "#6B7685" : "#1E9EA8",
        weight: route ? 2 : 3,
        opacity: route ? 0.6 : 0.9,
      }).addTo(g)
    );
    // pontas livres (ajuda a escolher A e B)
    if (!route) {
      freeEnds.slice(0, 60).forEach((p) =>
        L.circleMarker([p.lat, p.lon], {
          radius: 4,
          color: "#fff",
          weight: 1,
          fillColor: "#0B0D10",
          fillOpacity: 1,
        })
          .bindTooltip("ponta livre do traçado")
          .addTo(g)
      );
    }
    if (route) {
      L.polyline(route.coords, { color: "#1E9EA8", weight: 5, opacity: 0.95 }).addTo(g);
      boxes.forEach((b) =>
        L.circleMarker(b.latlon, {
          radius: 5,
          color: "#0B0D10",
          weight: 1,
          fillColor: "#D97A29",
          fillOpacity: 1,
        })
          .bindTooltip(`${b.name} · ${G.fmtM(b.pos, 0)} m`)
          .addTo(g)
      );
    }
    merged.forEach((it) => {
      const m = L.circleMarker([it.lat, it.lon], {
        radius: it.high ? 10 : 8,
        color: "#ffffff",
        weight: 2,
        fillColor: it.high ? HIGH : COLORS[it.kind],
        fillOpacity: 1,
      })
        .bindPopup(popupHtml(it))
        .addTo(g);
      markersRef.current[it.id] = m;
    });
    const aPos = route ? route.coords[0] : endA ? [endA.lat, endA.lon] : null;
    const bPos = route ? route.coords[route.coords.length - 1] : endB ? [endB.lat, endB.lon] : null;
    if (rupture) {
      L.polyline(rupture.zone, { color: HIGH, weight: 9, opacity: 0.55 }).addTo(g);
      L.marker([rupture.lat, rupture.lon], { icon: breakIcon(), zIndexOffset: 1000 })
        .bindPopup(breakPopup(rupture))
        .addTo(g);
    }
    if (aPos) L.marker(aPos, { icon: endIcon("A", "#4FAE7A"), interactive: false }).addTo(g);
    if (bPos) L.marker(bPos, { icon: endIcon("B", "#E3B84A"), interactive: false }).addTo(g);
  }, [activeLines, freeEnds, route, boxes, merged, endA, endB, rupture]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !kmz) return;
    const pts = kmz.lines.flatMap((l) => l.coords);
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
  }, [kmz]);

  const focusItem = (it) => {
    const m = markersRef.current[it.id];
    const map = mapRef.current;
    if (!m || !map) return;
    if (mapEl.current) mapEl.current.scrollIntoView({ behavior: "smooth", block: "center" });
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 18));
    setTimeout(() => m.openPopup(), 450);
  };

  /* ---------- exportar ---------- */
  const download = async () => {
    try {
      const base = kmz.fileName.replace(/\.(kmz|kml)$/i, "");
      const blob = await exportRouteKmz({
        title: `${base} - rota A-B com atenuações`,
        coords: route.coords,
        totalM: route.total,
        boxes,
        items: merged,
        level,
        rupture,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}_rota_atenuacoes.kmz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      setErr((p) => ({ ...p, export: null }));
    } catch (e) {
      setErr((p) => ({ ...p, export: e.message }));
    }
  };

  /* ---------- diagnóstico ---------- */
  const diag = (sor, loc, off) => {
    if (!sor || !loc || !ctx) return null;
    const span = sor.spanM - off;
    const expected = ctx.total + loc.reserveM;
    return { span, expected, diff: span - expected };
  };
  const dA = diag(sorA, locA, n(offA));
  const dB = diag(sorB, locB, n(offB));

  const beyond = merged.filter((it) => (it.a && it.a.beyondM > 5) || (it.b && it.b.beyondM > 5)).length;
  const warnings = [];
  if (route) {
    warnings.push(...route.warnings);
    if (route.gaps.length)
      warnings.push(
        `${route.gaps.length} vazio(s) entre trechos foram ligados em linha reta (maior: ${G.fmtM(route.maxGapM, 0)} m).`
      );
    if (route.usedTol > n(joinTol, 30))
      warnings.push(`A tolerância de ligação foi aumentada automaticamente para ${route.usedTol} m.`);
    if (!boxes.length)
      warnings.push("Nenhuma caixa de emenda identificada; as reservas por caixa não foram aplicadas.");
  }
  if (beyond) warnings.push(`${beyond} evento(s) ficam além do fim da rota (fibra medida maior que o traçado).`);

  const sorSummary = (s) =>
    s
      ? `${s.name} · ${s.wavelengthNm} nm · ${s.events.length} eventos · ${G.fmtM(s.spanM, 0)} m`
      : null;
  const kmzSummary = kmz
    ? `${kmz.fileName} · ${kmz.lines.length} trecho(s) · ${kmz.points.length} ponto(s)`
    : null;

  const setAllLayers = (on) => {
    if (!kmz) return;
    const next = {};
    if (!on) kmz.layers.forEach((l) => (next[l.name] = true));
    setLayerOff(next);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Arquivos */}
      <div className="rounded-xl p-5" style={card}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-medium" style={{ color: "#E9ECEF" }}>
            Arquivos
          </div>
          <button
            onClick={clearAll}
            disabled={!kmz && !sorA && !sorB}
            className="text-xs px-3 py-1.5 rounded-md"
            style={ghostBtn(!!(kmz || sorA || sorB))}
          >
            Limpar tudo
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FileSlot
            title="Traçado (KMZ/KML)"
            hint="Trechos e marcadores das caixas"
            accept=".kmz,.kml"
            summary={busy ? "Lendo arquivo…" : kmzSummary}
            error={err.kmz}
            onFile={loadKmz}
            onClear={clearKmz}
            accent="#1E9EA8"
          />
          <FileSlot
            title="Fibra A (.sor)"
            hint="Medição OTDR da primeira fibra"
            accept=".sor,.SOR"
            summary={sorSummary(sorA)}
            error={err.A}
            onFile={(f) => loadSor("A", f)}
            onClear={() => setSorA(null)}
            accent={COLORS.A}
          />
          <FileSlot
            title="Fibra B (.sor) — opcional"
            hint="Segunda fibra, para achar pontos em comum"
            accept=".sor,.SOR"
            summary={sorSummary(sorB)}
            error={err.B}
            onFile={(f) => loadSor("B", f)}
            onClear={() => setSorB(null)}
            accent={COLORS.B}
          />
        </div>
        {[...(sorA ? sorA.warnings : []), ...(sorB ? sorB.warnings : [])].map((w, i) => (
          <p key={i} className="text-xs mt-2" style={{ color: "#E3B84A" }}>
            {w}
          </p>
        ))}
      </div>

      {/* Camadas do KMZ */}
      {kmz && kmz.layers.length > 1 && (
        <details className="rounded-xl p-5" style={card} open={kmz.layers.length <= 12}>
          <summary className="text-sm font-medium cursor-pointer" style={{ color: "#E9ECEF" }}>
            Camadas do KMZ{" "}
            <span style={{ color: "#5C6472" }}>
              ({kmz.layers.filter((l) => !layerOff[l.name]).length} de {kmz.layers.length} ativas)
            </span>
          </summary>
          <p className="text-xs mt-2 mb-3" style={{ color: "#8A94A6" }}>
            Marque só as pastas que fazem parte desta rota (cabos e caixas). Pastas de outras rotas
            atrapalham a ligação dos trechos.
          </p>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setAllLayers(true)} className="text-xs px-2.5 py-1 rounded-md" style={ghostBtn()}>
              Marcar todas
            </button>
            <button onClick={() => setAllLayers(false)} className="text-xs px-2.5 py-1 rounded-md" style={ghostBtn()}>
              Desmarcar todas
            </button>
          </div>
          <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 260 }}>
            {kmz.layers.map((l) => (
              <label
                key={l.name}
                className="flex items-start gap-2 text-xs py-1"
                style={{ color: layerOff[l.name] ? "#5C6472" : "#C4CBD6" }}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!layerOff[l.name]}
                  onChange={(e) => setLayerOff((p) => ({ ...p, [l.name]: !e.target.checked }))}
                />
                <span className="flex-1 break-words">{l.name}</span>
                <span className="whitespace-nowrap" style={{ ...mono, color: "#5C6472" }}>
                  {l.lines > 0 && `${l.lines} lin · ${G.fmtM(l.km, 1)} km`}
                  {l.lines > 0 && l.points > 0 && " · "}
                  {l.points > 0 && `${l.points} pts`}
                </span>
              </label>
            ))}
          </div>
        </details>
      )}

      {/* Mapa */}
      <div className="rounded-xl p-3" style={card}>
        {kmz && (
          <div className="px-1 pb-3 mb-3" style={{ borderBottom: "1px solid #262B33" }}>
            <div className="flex flex-wrap items-end gap-2">
              <button
                onClick={() => setPick(pick === "A" ? null : "A")}
                className="text-xs px-3 py-2 rounded-md"
                style={
                  pick === "A"
                    ? { background: "#4FAE7A", color: "#0B0D10", border: "1px solid #4FAE7A", fontWeight: 600 }
                    : ghostBtn()
                }
              >
                {pick === "A" ? "Toque no mapa: ponta A…" : "Definir A"}
              </button>
              <button
                onClick={() => setPick(pick === "B" ? null : "B")}
                className="text-xs px-3 py-2 rounded-md"
                style={
                  pick === "B"
                    ? { background: "#E3B84A", color: "#0B0D10", border: "1px solid #E3B84A", fontWeight: 600 }
                    : ghostBtn()
                }
              >
                {pick === "B" ? "Toque no mapa: ponta B…" : "Definir B"}
              </button>
              <button
                onClick={swapEnds}
                disabled={!endA || !endB}
                className="text-xs px-3 py-2 rounded-md"
                style={ghostBtn(!!(endA && endB))}
              >
                Inverter A e B
              </button>
              <button
                onClick={() => {
                  setPointA(null);
                  setPointB(null);
                }}
                disabled={!pointA && !pointB}
                className="text-xs px-3 py-2 rounded-md"
                style={ghostBtn(!!(pointA || pointB))}
              >
                Limpar pontas
              </button>
              <div style={{ width: 170 }}>
                <Field label="Destacar perdas acima de" value={hiLevel} onChange={setHiLevel} unit="dB" />
              </div>
              <div style={{ width: 190 }}>
                <Field label="Metragem da fibra (rompimento)" value={breakM} onChange={setBreakM} unit="m" />
              </div>
              <div style={{ width: 110 }}>
                <Field label="Margem ±" value={breakMargin} onChange={setBreakMargin} unit="m" />
              </div>
              <button
                onClick={() => {
                  const e = (sorA ? sorA.events : []).find((ev) => ev.endOfFiber) ||
                    (sorA && sorA.events.length ? sorA.events[sorA.events.length - 1] : null);
                  if (e) setBreakM(String(Math.max(0, Math.round((e.distM - n(offA)) * 10) / 10)));
                }}
                disabled={!sorA}
                className="text-xs px-3 py-2 rounded-md"
                style={ghostBtn(!!sorA)}
              >
                Usar fim da fibra do .sor
              </button>
              {breakM && (
                <button onClick={() => setBreakM("")} className="text-xs px-3 py-2 rounded-md" style={ghostBtn()}>
                  Limpar rompimento
                </button>
              )}
            </div>
            {rupture && (
              <div className="text-xs mt-2" style={{ color: HIGH }}>
                ! Rompimento a {G.fmtM(rupture.routeM, 0)} m da ponta A (± {G.fmtM(rupture.marginM, 0)} m) ·{" "}
                {G.localText(rupture)}
                {rupture.inReserve && " · dentro de uma sobra de cabo"}
                {rupture.beyondM > 5 &&
                  ` · metragem excede a rota em ${G.fmtM(rupture.beyondM, 0)} m (rota + sobras = ${G.fmtM(rupture.expectedFiberM, 0)} m)`}
              </div>
            )}
            <div className="text-[11px] mt-2 flex flex-wrap gap-x-4 gap-y-0.5" style={{ ...mono, color: "#8A94A6" }}>
              <span>A: {fmtPt(endA)}</span>
              <span>B: {fmtPt(endB)}</span>
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: "#5C6472" }}>
              {autoEnds
                ? "O traçado tem só duas pontas livres; usei como A e B. A ponta A é onde o OTDR foi ligado: se foi do outro lado, use Inverter."
                : "Toque em Definir A (ou B) e depois no mapa, sobre o traçado. A ponta A é onde o OTDR foi ligado."}
            </p>
            {routeRes && routeRes.error && (
              <p className="text-xs mt-1.5" style={{ color: "#C4544A" }}>
                {routeRes.error}
              </p>
            )}
          </div>
        )}
        <div ref={mapEl} style={{ height: 460, borderRadius: 8, overflow: "hidden", background: "#0B0D10" }} />
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 px-1 text-[11px]" style={{ color: "#8A94A6" }}>
          <Legend color="#1E9EA8" label="Rota A→B" />
          <Legend color="#6B7685" label="Outros trechos" />
          <Legend color="#D97A29" label="Caixa de emenda" />
          <Legend color={COLORS.A} label="Fibra A" />
          <Legend color={COLORS.B} label="Fibra B" />
          <Legend color={COLORS.both} label="Em comum (A+B)" />
          <Legend color={HIGH} label="Acima do nível" />
        </div>
      </div>

      {/* Avisos e diagnóstico */}
      {(warnings.length > 0 || dA || dB || route) && (
        <div className="rounded-xl p-4 text-xs flex flex-col gap-1.5" style={card}>
          {route && (
            <div style={{ color: "#C4CBD6" }}>
              Rota A→B: <b style={mono}>{G.fmtM(route.total, 0)} m</b> · {route.segments} trecho(s) ·{" "}
              {boxes.length} caixa(s)
            </div>
          )}
          {[
            ["A", dA],
            ["B", dB],
          ].map(
            ([lbl, d]) =>
              d && (
                <div key={lbl} style={{ color: "#8A94A6" }}>
                  Fibra {lbl}: medida <span style={mono}>{G.fmtM(d.span, 0)} m</span> · esperado pela rota +
                  reservas <span style={mono}>{G.fmtM(d.expected, 0)} m</span> · diferença{" "}
                  <span style={{ ...mono, color: Math.abs(d.diff) > 100 ? "#E3B84A" : "#4FAE7A" }}>
                    {d.diff >= 0 ? "+" : ""}
                    {G.fmtM(d.diff, 0)} m
                  </span>
                </div>
              )
          )}
          {warnings.map((w, i) => (
            <div key={i} style={{ color: "#E3B84A" }}>
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Parâmetros */}
      <details className="rounded-xl p-5" style={card} open>
        <summary className="text-sm font-medium cursor-pointer" style={{ color: "#E9ECEF" }}>
          Parâmetros
        </summary>
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SideSelect label="Fibra A medida a partir da" value={sideA} onChange={setSideA} />
            <Field label="Offset da fibra A (lançamento)" value={offA} onChange={setOffA} unit="m" />
            <SideSelect label="Fibra B medida a partir da" value={sideB} onChange={setSideB} />
            <Field label="Offset da fibra B (lançamento)" value={offB} onChange={setOffB} unit="m" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Reserva por caixa" value={boxRes} onChange={setBoxRes} unit="m" />
            <Field label="Reserva a cada" value={everyM} onChange={setEveryM} unit="m" />
            <Field label="Tamanho da reserva" value={everyRes} onChange={setEveryRes} unit="m" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Perda mínima exibida" value={threshold} onChange={setThreshold} unit="dB" />
            <Field label="Tolerância ponto em comum" value={matchTol} onChange={setMatchTol} unit="m" />
            <Field label="Ligar trechos até" value={joinTol} onChange={setJoinTol} unit="m" />
            <Field label="Distância máx. caixa–rota" value={boxMaxDist} onChange={setBoxMaxDist} unit="m" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Field
              label="Caixas: nome contém (separe por vírgula; vazio = todos)"
              value={boxFilter}
              onChange={setBoxFilter}
              type="text"
            />
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs" style={{ color: "#C4CBD6" }}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={useMarkers} onChange={(e) => setUseMarkers(e.target.checked)} />
                Marcadores do KMZ
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={useJoints} onChange={(e) => setUseJoints(e.target.checked)} />
                Junções entre trechos
              </label>
            </div>
          </div>
        </div>
      </details>

      {/* Tabela */}
      <div className="rounded-xl p-5" style={card}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="text-sm font-medium" style={{ color: "#E9ECEF" }}>
            Pontos de atenuação <span style={{ color: "#5C6472" }}>({merged.length})</span>
            {merged.length > 0 && (
              <span className="text-xs font-normal" style={{ color: highCount ? HIGH : "#5C6472" }}>
                {" "}
                · {highCount} acima de {G.fmtM(level, 2)} dB
              </span>
            )}
          </div>
          <button
            onClick={download}
            disabled={!route}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-md"
            style={{
              background: route ? "#1E9EA8" : "#0B0D10",
              color: route ? "#0B0D10" : "#5C6472",
              border: "1px solid #262B33",
              fontWeight: 500,
            }}
          >
            <Download size={14} />
            {merged.length ? "Baixar KMZ da rota com atenuações" : "Baixar KMZ da rota"}
          </button>
        </div>
        {err.export && (
          <p className="text-xs mb-2" style={{ color: "#C4544A" }}>
            {err.export}
          </p>
        )}
        {!merged.length ? (
          <p className="text-sm" style={{ color: "#5C6472" }}>
            {kmz && !route
              ? "Defina as pontas A e B para montar a rota."
              : "Envie o KMZ e ao menos um arquivo .sor para ver os pontos no mapa."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ minWidth: 560, color: "#C4CBD6" }}>
              <thead>
                <tr style={{ color: "#8A94A6", textAlign: "left" }}>
                  <th className="pb-2 pr-3 font-normal">#</th>
                  <th className="pb-2 pr-3 font-normal">Fibra</th>
                  <th className="pb-2 pr-3 font-normal">Rota (m)</th>
                  <th className="pb-2 pr-3 font-normal">Perda (dB)</th>
                  <th className="pb-2 font-normal">Local</th>
                </tr>
              </thead>
              <tbody>
                {merged.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => focusItem(it)}
                    className="cursor-pointer"
                    style={{ borderTop: "1px solid #262B33" }}
                  >
                    <td className="py-2 pr-3" style={mono}>
                      {it.n}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span
                        className="inline-block rounded-full mr-1.5 align-middle"
                        style={{ width: 9, height: 9, background: it.high ? HIGH : COLORS[it.kind] }}
                      />
                      {it.kind === "both" ? "A+B" : it.kind}
                    </td>
                    <td className="py-2 pr-3" style={mono}>
                      {G.fmtM(it.routeM)}
                    </td>
                    <td
                      className="py-2 pr-3 whitespace-nowrap"
                      style={{ ...mono, color: it.high ? HIGH : undefined, fontWeight: it.high ? 600 : undefined }}
                    >
                      {it.a && G.fmtM(it.a.lossDb, 2)}
                      {it.a && it.b && " / "}
                      {it.b && G.fmtM(it.b.lossDb, 2)}
                      {(it.a || it.b).endOfFiber && " (fim)"}
                    </td>
                    <td className="py-2">
                      {G.localText(it)}
                      {((it.a && it.a.inReserve) || (it.b && it.b.inReserve)) && (
                        <span style={{ color: "#E3B84A" }}> · dentro de reserva</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] mt-3" style={{ color: "#5C6472" }}>
          Posições estimadas: a distância medida na fibra é convertida para a rota descontando as reservas
          de cabo informadas. Confirme em campo antes de intervir.
        </p>
      </div>
    </div>
  );
}
