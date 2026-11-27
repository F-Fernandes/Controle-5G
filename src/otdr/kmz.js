import JSZip from "jszip";
import { esc, fmtM, localText, haversine } from "./route.js";
import { eventLabel } from "./sor.js";

/* ---------------------------------------------------------
   Leitura de KMZ (zip) ou KML (xml): linhas e pontos, com a
   pasta (camada) de cada elemento
--------------------------------------------------------- */
function parseCoords(text) {
  return (text || "")
    .trim()
    .split(/\s+/)
    .map((t) => t.split(",").map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[1], c[0]]); // KML é lon,lat → [lat, lon]
}

function layerOf(pm) {
  const names = [];
  let p = pm.parentNode;
  while (p && p.nodeType === 1) {
    if (p.localName === "Folder") {
      const ne = Array.from(p.children).find((c) => c.localName === "name");
      names.unshift(((ne && ne.textContent) || "").trim() || "(sem nome)");
    }
    p = p.parentNode;
  }
  return names.join(" › ") || "(raiz)";
}

function lineKm(coords) {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += haversine(coords[i - 1], coords[i]);
  return s / 1000;
}

export function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Não consegui ler o KML (XML inválido).");
  }
  const lines = [];
  const points = [];
  const placemarks = Array.from(doc.getElementsByTagNameNS("*", "Placemark"));
  for (const pm of placemarks) {
    const nameEl = Array.from(pm.children).find((c) => c.localName === "name");
    const name = ((nameEl && nameEl.textContent) || "").trim();
    const layer = layerOf(pm);
    for (const ls of Array.from(pm.getElementsByTagNameNS("*", "LineString"))) {
      const ce = ls.getElementsByTagNameNS("*", "coordinates")[0];
      const coords = parseCoords(ce && ce.textContent);
      if (coords.length >= 2) lines.push({ name, coords, layer });
    }
    for (const pt of Array.from(pm.getElementsByTagNameNS("*", "Point"))) {
      const ce = pt.getElementsByTagNameNS("*", "coordinates")[0];
      const c = parseCoords(ce && ce.textContent)[0];
      if (c) points.push({ name, lat: c[0], lon: c[1], layer });
    }
  }
  const map = new Map();
  const get = (l) => {
    if (!map.has(l)) map.set(l, { name: l, lines: 0, points: 0, km: 0 });
    return map.get(l);
  };
  lines.forEach((l) => {
    const e = get(l.layer);
    e.lines += 1;
    e.km += lineKm(l.coords);
  });
  points.forEach((p) => {
    get(p.layer).points += 1;
  });
  return { lines, points, layers: Array.from(map.values()) };
}

export async function readKmz(file) {
  let kmlText;
  if (file.name.toLowerCase().endsWith(".kmz")) {
    const zip = await JSZip.loadAsync(file);
    const entry = zip.file("doc.kml") || zip.file(/\.kml$/i)[0];
    if (!entry) throw new Error("O KMZ não contém nenhum arquivo .kml.");
    kmlText = await entry.async("string");
  } else {
    kmlText = await file.text();
  }
  const parsed = parseKml(kmlText);
  if (!parsed.lines.length) throw new Error("Não encontrei linhas (traçado) no arquivo.");
  return { fileName: file.name, ...parsed };
}

/* ---------------------------------------------------------
   Exportação: KMZ novo com a rota única A→B, as caixas de
   emenda (com a posição na rota) e os pontos de atenuação
--------------------------------------------------------- */
const ICONS = {
  high: "http://maps.google.com/mapfiles/kml/paddle/red-circle.png",
  both: "http://maps.google.com/mapfiles/kml/paddle/purple-circle.png",
  A: "http://maps.google.com/mapfiles/kml/paddle/blu-circle.png",
  B: "http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png",
};

function fiberRow(label, e) {
  return (
    `${label}: ${fmtM(e.fiberM)} m na fibra · perda ${fmtM(e.lossDb, 2)} dB` +
    (e.reflective ? ` · refl. ${fmtM(e.reflDb, 1)} dB` : "") +
    ` · ${esc(eventLabel(e))}`
  );
}

function describeItem(it, level) {
  const rows = [];
  if (it.high) rows.push(`<b>ACIMA DO NÍVEL DE AJUSTE</b> (≥ ${fmtM(level, 2)} dB)`);
  if (it.a) rows.push(fiberRow("Fibra A", it.a));
  if (it.b) rows.push(fiberRow("Fibra B", it.b));
  rows.push(`Posição na rota: ${fmtM(it.routeM)} m`);
  rows.push(`Local: ${esc(localText(it))}`);
  rows.push(`Coordenada: ${it.lat.toFixed(6)}, ${it.lon.toFixed(6)}`);
  return rows.join("<br/>");
}

function titleOf(it) {
  const who = it.kind === "both" ? "A+B" : it.kind;
  const loss = Math.max(Math.abs(it.a ? it.a.lossDb : 0), Math.abs(it.b ? it.b.lossDb : 0));
  const end = (it.a || it.b).endOfFiber ? " (fim)" : "";
  return `#${it.n} ${who} ${fmtM(loss, 2)} dB${end}`;
}

const lonlat = (lat, lon) => `${lon},${lat},0`;

export function buildRouteKml({ title, coords, totalM, boxes, items, level = 0.5, rupture = null }) {
  const styles =
    Object.entries(ICONS)
      .map(
        ([k, href]) =>
          `<Style id="otdr-${k}"><IconStyle><scale>1.1</scale><Icon><href>${href}</href></Icon></IconStyle></Style>`
      )
      .join("") +
    `<Style id="rota"><LineStyle><color>ffa89e1e</color><width>4</width></LineStyle></Style>` +
    `<Style id="caixa"><IconStyle><color>ff297ad9</color><scale>0.8</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle><LabelStyle><scale>0.8</scale></LabelStyle></Style>` +
    `<Style id="rompimento"><IconStyle><color>ff4d48e5</color><scale>1.4</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/caution.png</href></Icon></IconStyle></Style>` +
    `<Style id="zona"><LineStyle><color>ff4d48e5</color><width>8</width></LineStyle></Style>` +
    `<Style id="pontaA"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/A.png</href></Icon></IconStyle></Style>` +
    `<Style id="pontaB"><IconStyle><Icon><href>http://maps.google.com/mapfiles/kml/paddle/B.png</href></Icon></IconStyle></Style>`;

  const first = coords[0];
  const last = coords[coords.length - 1];
  const route =
    `<Folder><name>Rota A-B</name>` +
    `<Placemark><name>Rota A-B (${fmtM(totalM / 1000, 3)} km)</name><styleUrl>#rota</styleUrl>` +
    `<LineString><tessellate>1</tessellate><coordinates>${coords
      .map((c) => lonlat(c[0], c[1]))
      .join(" ")}</coordinates></LineString></Placemark>` +
    `<Placemark><name>Ponta A</name><styleUrl>#pontaA</styleUrl><Point><coordinates>${lonlat(first[0], first[1])}</coordinates></Point></Placemark>` +
    `<Placemark><name>Ponta B</name><styleUrl>#pontaB</styleUrl><Point><coordinates>${lonlat(last[0], last[1])}</coordinates></Point></Placemark>` +
    `</Folder>`;

  const boxFolder =
    `<Folder><name>Caixas de emenda</name>` +
    boxes
      .map((b) => {
        const at = b.orig || b.latlon;
        return (
          `<Placemark><name>${esc(b.name)}</name><styleUrl>#caixa</styleUrl>` +
          `<description><![CDATA[Posição na rota: ${fmtM(b.pos)} m a partir da ponta A]]></description>` +
          `<Point><coordinates>${lonlat(at[0], at[1])}</coordinates></Point></Placemark>`
        );
      })
      .join("") +
    `</Folder>`;

  const atnFolder = items.length
    ? `<Folder><name>Atenuações OTDR</name>` +
      items
        .map(
          (it) =>
            `<Placemark><name>${esc(titleOf(it))}</name>` +
            `<description><![CDATA[${describeItem(it, level)}]]></description>` +
            `<styleUrl>#otdr-${it.high ? "high" : it.kind}</styleUrl>` +
            `<Point><coordinates>${lonlat(it.lat, it.lon)}</coordinates></Point></Placemark>`
        )
        .join("") +
      `</Folder>`
    : "";

  const ruptureFolder = rupture
    ? `<Folder><name>Possível rompimento</name>` +
      `<Placemark><name>! Possível rompimento (${fmtM(rupture.fiberM, 0)} m na fibra)</name><styleUrl>#rompimento</styleUrl>` +
      `<description><![CDATA[Metragem na fibra (a partir da ponta A): ${fmtM(rupture.fiberM)} m<br/>` +
      `Posição na rota: ${fmtM(rupture.routeM)} m<br/>Margem: ± ${fmtM(rupture.marginM, 0)} m<br/>` +
      `Local: ${esc(localText(rupture))}<br/>Coordenada: ${rupture.lat.toFixed(6)}, ${rupture.lon.toFixed(6)}]]></description>` +
      `<Point><coordinates>${lonlat(rupture.lat, rupture.lon)}</coordinates></Point></Placemark>` +
      `<Placemark><name>Zona provável (± ${fmtM(rupture.marginM, 0)} m)</name><styleUrl>#zona</styleUrl>` +
      `<LineString><tessellate>1</tessellate><coordinates>${rupture.zone
        .map((c) => lonlat(c[0], c[1]))
        .join(" ")}</coordinates></LineString></Placemark></Folder>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(title)}</name>` +
    styles +
    route +
    boxFolder +
    atnFolder +
    ruptureFolder +
    `</Document></kml>`
  );
}

export async function exportRouteKmz(args) {
  const zip = new JSZip();
  zip.file("doc.kml", buildRouteKml(args));
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.google-earth.kmz",
  });
}
