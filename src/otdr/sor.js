/* ---------------------------------------------------------
   Leitor de arquivos .sor (OTDR) — Telcordia SR-4731 v1 e v2
   Extrai dados gerais, índice de refração e a tabela de eventos.
--------------------------------------------------------- */

class Reader {
  constructor(buf, pos = 0) {
    this.dv = new DataView(buf);
    this.u8 = new Uint8Array(buf);
    this.pos = pos;
  }
  need(n) {
    if (this.pos + n > this.u8.length) throw new Error("Fim inesperado do arquivo .sor");
  }
  u16() {
    this.need(2);
    const v = this.dv.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16() {
    this.need(2);
    const v = this.dv.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.dv.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.dv.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  str(n) {
    this.need(n);
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8[this.pos + i]);
    this.pos += n;
    return s;
  }
  cstr() {
    let s = "";
    while (true) {
      this.need(1);
      const c = this.u8[this.pos++];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  skip(n) {
    this.need(n);
    this.pos += n;
  }
}

export function eventLabel(ev) {
  if (ev.endOfFiber) return "Fim da fibra";
  if (ev.reflective) return "Reflexivo (conector/quebra)";
  return "Não reflexivo (emenda/curva)";
}

export function parseSor(buf) {
  const r = new Reader(buf);
  const warnings = [];

  // ---- bloco Map ----
  let mapName;
  try {
    mapName = r.cstr();
  } catch {
    mapName = "";
  }
  if (mapName !== "Map") {
    throw new Error("Não parece um arquivo .sor válido (bloco Map não encontrado).");
  }
  const mapRev = r.u16();
  const mapSize = r.i32();
  const nBlocks = r.u16();
  const blocks = [];
  for (let i = 0; i < nBlocks - 1; i++) {
    blocks.push({ name: r.cstr(), rev: r.u16(), size: r.i32() });
  }
  let offset = mapSize;
  for (const b of blocks) {
    b.start = offset;
    offset += b.size;
  }
  const v2 = mapRev >= 200;

  const openBlock = (name) => {
    const b = blocks.find((x) => x.name === name);
    if (!b) return null;
    const rr = new Reader(buf, b.start);
    // blocos da versão 2 começam com o próprio nome (terminado em \0)
    const hdr = name + "\0";
    let match = b.start + hdr.length <= rr.u8.length;
    for (let i = 0; match && i < hdr.length; i++) {
      if (rr.u8[b.start + i] !== hdr.charCodeAt(i)) match = false;
    }
    if (match) rr.pos += hdr.length;
    return rr;
  };

  // ---- GenParams (informativo) ----
  const gen = {};
  try {
    const g = openBlock("GenParams");
    if (g) {
      g.str(2); // idioma
      gen.cableId = g.cstr();
      gen.fiberId = g.cstr();
      if (v2) g.u16(); // tipo de fibra
      gen.nominalWavelength = g.u16();
      gen.origin = g.cstr();
      gen.end = g.cstr();
    }
  } catch {
    /* campos gerais são opcionais */
  }

  // ---- FxdParams (índice de refração, comprimento de onda) ----
  const fx = openBlock("FxdParams");
  if (!fx) throw new Error("Bloco FxdParams não encontrado no .sor.");
  fx.u32(); // data/hora
  fx.str(2); // unidade de distância
  const wavelengthNm = fx.u16() / 10;
  fx.i32(); // offset de aquisição
  if (v2) fx.i32(); // offset de aquisição (distância)
  const nPulse = fx.u16();
  fx.skip(nPulse * 2); // larguras de pulso
  fx.skip(nPulse * 4); // espaçamento entre amostras
  fx.skip(nPulse * 4); // nº de pontos
  let ior = fx.u32() / 100000;
  if (!ior || ior < 1 || ior > 2) {
    warnings.push("Índice de refração inválido no .sor; usei 1,4682.");
    ior = 1.4682;
  }

  // ---- KeyEvents ----
  const ke0 = openBlock("KeyEvents");
  if (!ke0) throw new Error("Bloco KeyEvents não encontrado no .sor.");
  const metersPerUnit = 0.0299792458 / ior; // 1 unidade = 100 ps (ida)
  const keBlock = blocks.find((x) => x.name === "KeyEvents");
  const keEnd = keBlock.start + keBlock.size;

  // O nº de marcadores por evento varia (5 na v2 do SR-4731; alguns arquivos
  // antigos têm 4). Testa as duas leituras e fica com a que fecha certinho.
  const readEvents = (markerBytes) => {
    const ke = openBlock("KeyEvents");
    const nEv = ke.u16();
    if (nEv > 5000) throw new Error("Quantidade de eventos inválida");
    const list = [];
    for (let i = 0; i < nEv; i++) {
      const n = ke.u16();
      if (n !== i + 1) throw new Error("Numeração de eventos fora de sequência");
      const t = ke.u32();
      const attCoef = ke.i16() / 1000;
      const lossDb = ke.i16() / 1000;
      const reflDb = ke.i32() / 1000;
      const code = ke.str(6);
      ke.str(2); // técnica de medição de perda
      ke.skip(markerBytes);
      const comment = ke.cstr();
      list.push({
        n,
        distM: t * metersPerUnit,
        attCoef,
        lossDb,
        reflDb,
        code,
        reflective: code[0] === "1" || code[0] === "2",
        endOfFiber: code[1] === "E" || code[1] === "D",
        comment: comment.trim(),
      });
    }
    return { list, endPos: ke.pos };
  };

  let events = [];
  let parsedOk = false;
  for (const markerBytes of v2 ? [20, 16] : [16, 20]) {
    try {
      const res = readEvents(markerBytes);
      // depois dos eventos vêm 26 bytes de resumo (perda total, ORL, ...)
      if (keEnd - res.endPos >= 0 && keEnd - res.endPos <= 64) {
        events = res.list;
        parsedOk = true;
        break;
      }
    } catch {
      /* tenta a outra variante */
    }
  }
  if (!parsedOk) throw new Error("Não consegui interpretar a tabela de eventos deste .sor.");
  if (!events.length) warnings.push("Nenhum evento encontrado no .sor.");

  const spanM = events.length ? events[events.length - 1].distM : 0;
  return {
    version: v2 ? 2 : 1,
    wavelengthNm,
    ior,
    ...gen,
    events,
    spanM,
    warnings,
  };
}
