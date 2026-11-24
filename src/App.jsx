import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
} from "recharts";

import INITIAL_DATA from "./data/initialData.json";

const STORAGE_KEY = "fibra5g-dados-planilha-v3";
const USERS_STORAGE_KEY_NAME = "users";
const DATA_STORAGE_KEY_NAME = "data";

async function apiGet(nome) {
  const res = await fetch(`/api/${nome}`);
  if (!res.ok) return null;
  const json = await res.json();
  if (!json || json.value === null || json.value === undefined) return null;
  return { value: json.value };
}
async function apiSet(nome, value) {
  await fetch(`/api/${nome}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  return { value };
}
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const BG = "#0E1110";
const SURFACE = "#171B19";
const SURFACE_2 = "#1E2320";
const BORDER = "#2B302D";
const TEXT = "#ECEFEC";
const TEXT_MUTED = "#8B958F";
const TEXT_FAINT = "#5E6863";
const RED = "#FF453A";
const RED_SOFT = "#FF453A22";
const GREEN = "#32D74B";
const BLUE = "#4DA6FF";
const PURPLE = "#BF8CFF";
const AMBER = "#FFB454";

const PLAN_COLOR = RED;
const REAL_COLOR = GREEN;

const EPO_CORES = { PROCISA: BLUE, CONCEPT: GREEN, SINAL: PURPLE, MULTIVALE: AMBER, "Não informado": TEXT_FAINT };
const STATUS_CONST_CORES = { "CONSTRUÍDO": GREEN, "CANCELADO": RED, "ANÁLISE PROJETO": BLUE, "ATUANDO": AMBER, "PENDENTE PROJETO": TEXT_FAINT, "PARALISADO": "#8F1D22" };
const STATUS_ENTR_CORES = { "ENTRONCADO": GREEN, "PENDENTE": AMBER, "CANCELADO": RED };

const USERS_STORAGE_KEY = "fibra5g-usuarios-v1";
const DEFAULT_USERS = [
  { login: "claro", senha: "claro", papel: "usuario", ativo: true },
  { login: "admin", senha: "E@ee20*15", papel: "master", ativo: true },
];

const TABS = [
  { id: "consolidado", label: "Consolidado Geral" },
  { id: "construcaoAno", label: "Construção · Ano" },
  { id: "entroncamentoAno", label: "Entroncamento · Ano" },
  { id: "construcaoMes", label: "Construção · Mês" },
  { id: "entroncamentoMes", label: "Entroncamento · Mês" },
  { id: "lancamento", label: "Lançamento" },
  { id: "analises", label: "Análises" },
  { id: "consulta", label: "Consulta" },
  { id: "comparativo", label: "Comparativo" },
];

function monthIndex(dateStr) {
  if (!dateStr) return null;
  const p = dateStr.split("-");
  return p.length < 2 ? null : parseInt(p[1], 10) - 1;
}
function yearOf(dateStr) {
  return dateStr ? parseInt(dateStr.slice(0, 4), 10) : null;
}
function pct(num, den) {
  return !den ? "0%" : Math.round((num / den) * 100) + "%";
}
function formatDateBR(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

const CSV_CAMPOS = [
  { key: "site", label: "SITE" },
  { key: "cid", label: "Cidade" },
  { key: "ano", label: "Ano Implantacao" },
  { key: "epo", label: "EPO" },
  { key: "cp", label: "Construcao Plan" },
  { key: "cr", label: "Construcao Real" },
  { key: "sc", label: "Status Construcao" },
  { key: "ep", label: "Entroncado Plan" },
  { key: "er", label: "Entroncado Real" },
  { key: "se", label: "Status Entroncamento" },
  { key: "lanc", label: "Total Lancamento" },
  { key: "qrm", label: "QRM" },
  { key: "gab", label: "Gabinete" },
  { key: "mod", label: "Modelo Infra" },
  { key: "etapa", label: "Etapa" },
  { key: "ofE", label: "Ofensor Entroncamento" },
  { key: "meta", label: "Meta" },
  { key: "sdca", label: "SDCA" },
  { key: "capex", label: "Projeto CAPEX" },
  { key: "compConstr", label: "Complemento Construcao" },
  { key: "obs", label: "Obs" },
  { key: "gabData", label: "Gabinete GAP (data)" },
  { key: "lat", label: "Latitude" },
  { key: "lon", label: "Longitude" },
];

function exportarCSV(rows) {
  const linhas = [CSV_CAMPOS.map((c) => c.label).join(";")];
  rows.forEach((r) => {
    const linha = CSV_CAMPOS.map((c) => {
      let v = r[c.key];
      if (v === null || v === undefined) v = "";
      return String(v).replace(/;/g, ",").replace(/\n/g, " ");
    });
    linhas.push(linha.join(";"));
  });
  const conteudo = "\uFEFF" + linhas.join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fibra5g_dashboard_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function excelDateToStr(v) {
  if (v instanceof Date) {
    if (v.getFullYear() < 1950) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  return null;
}
function cleanAno(v) {
  if (v === null || v === undefined) return "Não informado";
  const s = String(v).trim();
  if (s === "" || s === "-") return "Não informado";
  const n = parseInt(parseFloat(s), 10);
  return isNaN(n) ? s : String(n);
}
function cleanTxt(v, def) {
  if (v === null || v === undefined) return def;
  const s = String(v).trim();
  return s === "" ? def : s;
}
function cleanNum(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function countBy(rows, keyFn) {
  const cont = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    cont[k] = (cont[k] || 0) + 1;
  });
  return Object.entries(cont).map(([label, qtd]) => ({ label, qtd })).sort((a, b) => b.qtd - a.qtd);
}

// Índices de coluna (0 = A, 1 = B, ...) — usamos posição fixa em vez do nome do
// cabeçalho porque a planilha tem duas colunas chamadas "IDENTIFICDOR" (D e F),
// o que causaria uma sobrescrever a outra se lêssemos por nome.
const COL = {
  cid: 0, anel: 1, site: 2, ident: 3, mod: 6, ano: 7, cp: 8, cr: 9, sc: 10,
  compConstr: 11, ep: 13, er: 14, se: 15, ofE: 18, epo: 22, capex: 23, obs: 24, gab: 30, sdca: 36,
  qrm: 38, lanc: 40, meta: 41, etapa: 43, lat: 46, lon: 47, gabGap: 27,
};

function cleanCoord(v, tipo) {
  if (v === null || v === undefined || v === "") return null;
  let n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".").trim());
  if (!isFinite(n) || n === 0) return null;
  if (n > 0) n = -n; // São Paulo/Brasil: latitude e longitude negativas (corrige sinal digitado errado)
  if (tipo === "lat") return n >= -34 && n <= -1 ? n : null;
  return n >= -74 && n <= -34 ? n : null;
}

function parseWorkbookToRows(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  const rows = [];
  linhas.slice(1).forEach((l) => {
    const site = l[COL.site];
    const cidade = l[COL.cid];
    if (!site && !cidade) return;
    rows.push({
      site: cleanTxt(site, ""),
      cid: cleanTxt(cidade, "Não informado"),
      anel: cleanTxt(l[COL.anel], "Não informado"),
      ident: cleanTxt(l[COL.ident], ""),
      ano: cleanAno(l[COL.ano]),
      epo: cleanTxt(l[COL.epo], "Não informado"),
      cp: excelDateToStr(l[COL.cp]),
      cr: excelDateToStr(l[COL.cr]),
      sc: l[COL.sc] || null,
      compConstr: cleanTxt(l[COL.compConstr], "Não informado"),
      ep: excelDateToStr(l[COL.ep]),
      er: excelDateToStr(l[COL.er]),
      se: l[COL.se] || null,
      lanc: cleanNum(l[COL.lanc]),
      qrm: cleanTxt(l[COL.qrm], "Não informado"),
      gab: cleanTxt(l[COL.gab], "Não informado"),
      mod: cleanTxt(l[COL.mod], "Não informado"),
      etapa: cleanTxt(l[COL.etapa], "Não informado"),
      ofE: cleanTxt(l[COL.ofE], ""),
      meta: cleanTxt(l[COL.meta], ""),
      sdca: cleanTxt(l[COL.sdca], "Não informado"),
      capex: cleanTxt(l[COL.capex], "Não informado"),
      obs: cleanTxt(l[COL.obs], ""),
      gabData: excelDateToStr(l[COL.gabGap]),
      lat: cleanCoord(l[COL.lat], "lat"),
      lon: cleanCoord(l[COL.lon], "lon"),
    });
  });
  return rows;
}

/* ---------------- App / login ---------------- */

export default function App() {
  const [usuarios, setUsuarios] = useState(null);
  const [sessao, setSessao] = useState(null);
  const [erroLogin, setErroLogin] = useState("");

  const carregarUsuarios = useCallback(async () => {
    try {
      const res = await apiGet(USERS_STORAGE_KEY_NAME);
      if (res && res.value) {
        setUsuarios(JSON.parse(res.value));
      } else {
        await apiSet(USERS_STORAGE_KEY_NAME, JSON.stringify(DEFAULT_USERS));
        setUsuarios(DEFAULT_USERS);
      }
    } catch (e) {
      setUsuarios(DEFAULT_USERS);
    }
  }, []);

  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);

  async function salvarUsuarios(novaLista) {
    setUsuarios(novaLista);
    try {
      await apiSet(USERS_STORAGE_KEY_NAME, JSON.stringify(novaLista));
    } catch (e) { /* silencioso — o estado local já foi atualizado */ }
  }

  function fazerLogin(login, senha) {
    const l = login.trim().toLowerCase();
    const u = (usuarios || []).find((x) => x.login === l);
    if (u && u.ativo !== false && u.senha === senha) {
      setSessao({ login: l, papel: u.papel });
      setErroLogin("");
    } else {
      setErroLogin("Usuário ou senha inválidos.");
    }
  }

  if (!usuarios) {
    return <div style={{ minHeight: "100%", background: BG, color: TEXT_MUTED, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", fontSize: 13 }}>Carregando…</div>;
  }
  if (!sessao) return <TelaLogin onLogin={fazerLogin} erro={erroLogin} />;
  return <Dashboard sessao={sessao} onLogout={() => setSessao(null)} usuarios={usuarios} onUsuariosChange={salvarUsuarios} />;
}


/* ---------------- Visual: utilidades 3D / animação ---------------- */

const PALETA_GRAD = [RED, GREEN, BLUE, PURPLE, AMBER, TEXT_FAINT, "#8F1D22"];
function ajustarCor(hex, f) {
  const n = parseInt(hex.slice(1, 7), 16);
  const alvo = f < 0 ? 0 : 255, p = Math.abs(f);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round((alvo - v) * p + v));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
function volV(cor) { return PALETA_GRAD.includes(cor) ? `url(#gv-${cor.slice(1, 7)})` : cor; }
function volH(cor) { return PALETA_GRAD.includes(cor) ? `url(#gh-${cor.slice(1, 7)})` : cor; }

function DefsGradientes() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        {PALETA_GRAD.map((c) => (
          <React.Fragment key={c}>
            <linearGradient id={`gv-${c.slice(1, 7)}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={ajustarCor(c, 0.32)} />
              <stop offset="45%" stopColor={c} />
              <stop offset="100%" stopColor={ajustarCor(c, -0.38)} />
            </linearGradient>
            <linearGradient id={`gh-${c.slice(1, 7)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ajustarCor(c, 0.34)} />
              <stop offset="50%" stopColor={c} />
              <stop offset="100%" stopColor={ajustarCor(c, -0.36)} />
            </linearGradient>
          </React.Fragment>
        ))}
      </defs>
    </svg>
  );
}

function reduzirMovimento() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(alvo, dur = 900) {
  const [v, setV] = useState(typeof alvo === "number" ? 0 : null);
  const atual = useRef(0);
  useEffect(() => {
    if (typeof alvo !== "number") return;
    if (reduzirMovimento()) { atual.current = alvo; setV(alvo); return; }
    const de = atual.current;
    let raf, t0;
    function passo(t) {
      if (t0 === undefined) t0 = t;
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      const x = de + (alvo - de) * e;
      atual.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(passo);
    }
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, dur]);
  return v;
}

function MalhaRede({ suave }) {
  const k = suave ? 0.5 : 1;
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let w = 0, h = 0, raf, nos = [];
    const mouse = { x: -9999, y: -9999 };
    function dimensionar() {
      const r = cv.parentElement.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      cv.width = w * d; cv.height = h * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.max(24, Math.min(suave ? 60 : 90, Math.round((w * h) / (suave ? 24000 : 17000))));
      nos = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 1.6, quente: Math.random() < 0.2,
      }));
    }
    function desenhar() {
      ctx.clearRect(0, 0, w, h);
      for (const a of nos) {
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > w) a.vx *= -1;
        if (a.y < 0 || a.y > h) a.vy *= -1;
      }
      for (let i = 0; i < nos.length; i++) {
        const a = nos[i];
        for (let j = i + 1; j < nos.length; j++) {
          const b = nos[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 150) {
            const al = (1 - d / 150) * 0.32 * k;
            ctx.strokeStyle = a.quente || b.quente ? `rgba(255,69,58,${al})` : `rgba(139,149,143,${al * 0.7})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
        if (dm < 170) {
          ctx.strokeStyle = `rgba(255,120,110,${(1 - dm / 170) * 0.55 * k})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
        }
      }
      for (const a of nos) {
        ctx.beginPath();
        ctx.fillStyle = a.quente ? `rgba(255,69,58,${0.95 * k})` : `rgba(200,208,203,${0.55 * k})`;
        if (a.quente) { ctx.shadowColor = "#FF453A"; ctx.shadowBlur = 12; } else { ctx.shadowBlur = 0; }
        ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    function laco() { desenhar(); raf = requestAnimationFrame(laco); }
    function mover(e) { const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; }
    function sair() { mouse.x = -9999; mouse.y = -9999; }
    dimensionar();
    if (reduzirMovimento()) { desenhar(); } else { raf = requestAnimationFrame(laco); }
    window.addEventListener("resize", dimensionar);
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseout", sair);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", dimensionar);
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseout", sair);
    };
  }, [suave]); // eslint-disable-line
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}

function AnelProgresso({ titulo, valor, total, cor, sub }) {
  const uid = React.useId().replace(/:/g, "");
  const p = total > 0 ? valor / total : 0;
  const anim = useCountUp(Math.round(p * 1000), 1100);
  const frac = (anim === null ? 0 : anim) / 1000;
  const R = 58, C = 2 * Math.PI * R;
  const camada = (corTopo, corBase, extra) => (
    <svg viewBox="0 0 160 160" width="100%" height="100%" style={extra}>
      <defs>
        <linearGradient id={`an-${uid}-${corTopo.slice(1)}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={ajustarCor(corTopo, 0.3)} />
          <stop offset="100%" stopColor={corTopo} />
        </linearGradient>
      </defs>
      <circle cx="80" cy="80" r={R} fill="none" stroke={corBase} strokeWidth="18" />
      <circle cx="80" cy="80" r={R} fill="none" stroke={`url(#an-${uid}-${corTopo.slice(1)})`} strokeWidth="18" strokeLinecap="round"
        strokeDasharray={`${Math.max(0.001, frac * C)} ${C}`} transform="rotate(-90 80 80)" />
    </svg>
  );
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ position: "relative", width: 168, height: 168, margin: "-26px auto -16px" }}>
        <div style={{ position: "absolute", inset: 0, transform: "translateY(10px) perspective(520px) rotateX(48deg)", opacity: 0.95 }}>
          {camada(ajustarCor(cor, -0.55), "#0B0D0C")}
        </div>
        <div style={{ position: "absolute", inset: 0, transform: "perspective(520px) rotateX(48deg)", filter: `drop-shadow(0 0 10px ${cor}66)` }}>
          {camada(cor, "#262B28")}
        </div>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 4 }}>
          <div className="num" style={{ fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: -0.5 }}>{(frac * 100).toFixed(0)}%</div>
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{titulo}</div>
      <div style={{ fontSize: 11.5, color: TEXT_FAINT }}>{sub}</div>
    </div>
  );
}

function TelaLogin({ onLogin, erro }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const cartaoRef = useRef(null);
  function tentarEntrar() {
    onLogin(login, senha);
  }
  function inclinar(e) {
    const el = cartaoRef.current;
    if (!el || reduzirMovimento()) return;
    const px = e.clientX / window.innerWidth - 0.5;
    const py = e.clientY / window.innerHeight - 0.5;
    el.style.transform = `perspective(1000px) rotateY(${(px * 9).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg)`;
  }
  return (
    <div onMouseMove={inclinar} style={{ position: "relative", overflow: "hidden", minHeight: "100vh", background: `radial-gradient(700px 480px at 18% 15%, #2A1517 0%, transparent 60%), radial-gradient(600px 460px at 88% 88%, #14231C 0%, transparent 58%), ${BG}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 24 }}>
      <MalhaRede />
      <div ref={cartaoRef} style={{ position: "relative", zIndex: 1, transition: "transform 0.18s ease-out", background: "linear-gradient(160deg, rgba(34,39,36,0.82), rgba(18,21,19,0.88))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "38px 34px", width: 340, boxShadow: `0 40px 90px rgba(0,0,0,0.6), 0 0 60px ${RED}22, inset 0 1px 0 rgba(255,255,255,0.07)`, borderTop: `3px solid ${RED}`, textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, margin: "0 auto 18px" }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: RED_SOFT, border: `1px solid ${RED}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: RED }}>5G</div>
          <div style={{ fontFamily: "Arial, sans-serif", fontStyle: "italic", fontWeight: 800, fontSize: 20, color: RED, letterSpacing: -0.5 }}>claro</div>
        </div>
        <div style={{ fontSize: 11, letterSpacing: 0.5, color: TEXT_MUTED, marginBottom: 4 }}>Implantação de Rede · Fibra Óptica</div>
        <h1 style={{ fontSize: 21, margin: "0 0 24px 0", color: TEXT, fontWeight: 700 }}>Acessar painel</h1>
        <Campo label="Usuário"><input value={login} onChange={(e) => setLogin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tentarEntrar()} style={{ ...inputStyle, textAlign: "center" }} autoFocus /></Campo>
        <Campo label="Senha"><input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tentarEntrar()} style={{ ...inputStyle, textAlign: "center" }} /></Campo>
        {erro && <div style={{ color: RED, fontSize: 13, marginBottom: 14 }}>{erro}</div>}
        <button onClick={tentarEntrar} style={botaoPrimario}>Entrar</button>
      </div>
    </div>
  );
}
function Campo({ label, children }) {
  return <label style={{ display: "block", marginBottom: 14, textAlign: "center" }}><div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 5 }}>{label}</div>{children}</label>;
}
const inputStyle = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE_2, color: TEXT, fontSize: 14, outline: "none" };
const botaoPrimario = { width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: `linear-gradient(135deg, ${RED} 0%, #D9342C 100%)`, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: `0 8px 20px ${RED}33` };
const botaoSecundario = { background: "linear-gradient(180deg, #252B28, #1B201E)", boxShadow: "0 3px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: TEXT, borderRadius: 7, padding: "9px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };

/* ---------------- Dashboard shell ---------------- */

function Dashboard({ sessao, onLogout, usuarios, onUsuariosChange }) {
  const [dados, setDados] = useState(INITIAL_DATA);
  const [atualizadoEmAtual, setAtualizadoEmAtual] = useState(null);
  const [dadosAnterior, setDadosAnterior] = useState(null);
  const [atualizadoEmAnterior, setAtualizadoEmAnterior] = useState(null);
  const [origem, setOrigem] = useState("Base inicial");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [aba, setAba] = useState("consolidado");
  const [maisFiltros, setMaisFiltros] = useState(false);

  const carregarDoStorage = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await apiGet(DATA_STORAGE_KEY_NAME);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        setDados(parsed.atual.rows);
        setAtualizadoEmAtual(parsed.atual.atualizadoEm);
        setOrigem(parsed.atual.atualizadoEm ? `Atualizado em ${new Date(parsed.atual.atualizadoEm).toLocaleString("pt-BR")}` : "Base publicada");
        if (parsed.anterior) {
          setDadosAnterior(parsed.anterior.rows);
          setAtualizadoEmAnterior(parsed.anterior.atualizadoEm);
        } else {
          setDadosAnterior(null);
          setAtualizadoEmAnterior(null);
        }
        setMensagem("Dashboard atualizado com a base mais recente.");
      } else {
        setMensagem("Nenhuma base publicada ainda — exibindo a base inicial.");
      }
    } catch (e) {
      setMensagem("Nenhuma base publicada ainda — exibindo a base inicial.");
    } finally {
      setCarregando(false);
      setTimeout(() => setMensagem(""), 4000);
    }
  }, []);

  useEffect(() => { carregarDoStorage(); }, [carregarDoStorage]);

  async function publicarNovaPlanilha(file) {
    setCarregando(true);
    setMensagem("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const rows = parseWorkbookToRows(wb);
      const novoAtualizadoEm = Date.now();
      const payload = {
        atual: { rows, atualizadoEm: novoAtualizadoEm },
        anterior: { rows: dados, atualizadoEm: atualizadoEmAtual },
      };
      await apiSet(DATA_STORAGE_KEY_NAME, JSON.stringify(payload));
      setDadosAnterior(dados);
      setAtualizadoEmAnterior(atualizadoEmAtual);
      setDados(rows);
      setAtualizadoEmAtual(novoAtualizadoEm);
      setOrigem(`Atualizado em ${new Date(novoAtualizadoEm).toLocaleString("pt-BR")}`);
      setMensagem(`Planilha publicada: ${rows.length} sites carregados para todos os usuários.`);
    } catch (e) {
      setMensagem("Não foi possível ler essa planilha. Confira se as colunas seguem o padrão original.");
    } finally {
      setCarregando(false);
    }
  }

  const opts = useCallback((key) => {
    const s = new Set(dados.map((r) => r[key]));
    const arr = Array.from(s).filter((v) => v && v !== "Não informado").sort();
    arr.push(...Array.from(s).filter((v) => v === "Não informado"));
    return arr;
  }, [dados]);

  const anos = useMemo(() => opts("ano"), [opts]);
  const epos = useMemo(() => opts("epo"), [opts]);
  const qrms = useMemo(() => opts("qrm"), [opts]);
  const cidades = useMemo(() => opts("cid"), [opts]);
  const statusList = useMemo(() => opts("sc"), [opts]);
  const etapas = useMemo(() => opts("etapa"), [opts]);
  const gabinetes = useMemo(() => opts("gab"), [opts]);
  const sdcas = useMemo(() => opts("sdca"), [opts]);
  const capexList = useMemo(() => opts("capex"), [opts]);
  const statusEntrList = useMemo(() => opts("se"), [opts]);
  const compList = useMemo(() => opts("compConstr"), [opts]);

  const anoPadrao = anos.includes("2026") ? ["2026"] : [];
  const [f, setF] = useState({ ano: anoPadrao, epo: [], qrm: [], cid: [], sc: [], etapa: [], gab: [], sdca: [], capex: [], se: [], comp: [] });

  const aplicarFiltro = useCallback((lista) => lista.filter((r) =>
    (f.ano.length === 0 || f.ano.includes(r.ano)) &&
    (f.epo.length === 0 || f.epo.includes(r.epo)) &&
    (f.qrm.length === 0 || f.qrm.includes(r.qrm)) &&
    (f.cid.length === 0 || f.cid.includes(r.cid)) &&
    (f.sc.length === 0 || f.sc.includes(r.sc)) &&
    (f.etapa.length === 0 || f.etapa.includes(r.etapa)) &&
    (f.gab.length === 0 || f.gab.includes(r.gab)) &&
    (f.sdca.length === 0 || f.sdca.includes(r.sdca)) &&
    (f.capex.length === 0 || f.capex.includes(r.capex)) &&
    (f.se.length === 0 || f.se.includes(r.se)) &&
    (f.comp.length === 0 || f.comp.includes(r.compConstr))
  ), [f]);

  const dadosF = useMemo(() => aplicarFiltro(dados), [dados, aplicarFiltro]);
  const dadosAnteriorF = useMemo(() => (dadosAnterior ? aplicarFiltro(dadosAnterior) : null), [dadosAnterior, aplicarFiltro]);

  const hojeStr = new Date().toISOString().slice(0, 10);
  const anosFiltro = f.ano.length ? f.ano.map((a) => parseInt(a, 10)) : null;

  const ctx = { dadosF, dadosTodos: dados, hojeStr, anosFiltro, epos, sessao, dadosAnteriorF, atualizadoEmAtual, atualizadoEmAnterior };

  return (
    <div className="app-bg" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: TEXT, minHeight: "100vh", position: "relative" }}>
      <DefsGradientes />
      <div className="malha-fixa"><MalhaRede suave /></div>
      <style>{`
        .app-bg { background: radial-gradient(900px 520px at 8% -8%, rgba(255,69,58,0.12), transparent 60%), radial-gradient(800px 500px at 100% 0%, rgba(50,215,75,0.07), transparent 60%), ${BG}; }
        .app-bg::before { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 0; background-image: linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px); background-size: 44px 44px; -webkit-mask-image: radial-gradient(ellipse at 50% 0%, #000 0%, transparent 78%); mask-image: radial-gradient(ellipse at 50% 0%, #000 0%, transparent 78%); }
        .app-bg > div { position: relative; z-index: 1; }
        .app-bg > div.malha-fixa { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
        .kpi-glass { transition: transform 0.15s ease-out, box-shadow 0.25s ease; will-change: transform; }
        .kpi-glass:hover { box-shadow: 0 22px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.09) !important; }
        .kpi-glare { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity 0.25s; background: radial-gradient(220px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.13), transparent 65%); }
        .kpi-glass:hover .kpi-glare { opacity: 1; }
        .painel-glass:hover { box-shadow: 0 26px 52px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07) !important; }
        @keyframes tabIn { from { opacity: 0; transform: perspective(900px) rotateX(5deg) translateY(12px); } to { opacity: 1; transform: perspective(900px) rotateX(0) translateY(0); } }
        .tab-enter { animation: tabIn 0.45s cubic-bezier(0.2, 0.7, 0.2, 1) both; transform-origin: 50% 0; }
        .recharts-bar-rectangle path { filter: drop-shadow(0 5px 5px rgba(0,0,0,0.5)); }
        .recharts-tooltip-cursor { fill: rgba(255,255,255,0.05) !important; }
        .tab-pill { transition: all 0.2s ease; }
        .tab-pill:hover { transform: translateY(-1px); color: ${TEXT} !important; }
        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-thumb { background: #2E3532; border-radius: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        @media (prefers-reduced-motion: reduce) { .tab-enter, .fade-in { animation: none !important; } .kpi-glass { transition: none; } }
        .num { font-variant-numeric: tabular-nums; font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        select, input, button { font-family: inherit; }
        @keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: 400px 0; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeUp 0.35s ease both; }
        .card-hover { transition: border-color 0.2s ease, transform 0.2s ease; }
        .card-hover:hover { transform: translateY(-1px); }
        .btn-hover:hover { filter: brightness(1.08); }
        table.tbl { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        table.tbl th { text-align: left; color: ${TEXT_MUTED}; font-weight: 600; padding: 7px 10px; border-bottom: 1px solid ${BORDER}; position: sticky; top: 0; background: ${SURFACE}; }
        table.tbl td { padding: 6px 10px; border-bottom: 1px solid ${BORDER}; color: ${TEXT}; }
        table.tbl tr:hover td { background: ${SURFACE_2}; }
      `}</style>

      <div style={{ position: "relative", background: "linear-gradient(180deg, rgba(28,32,30,0.85) 0%, rgba(14,17,16,0.55) 100%)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: "18px 40px", display: "flex", alignItems: "center", gap: 16, borderBottom: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${RED}, ${GREEN}, transparent)`, backgroundSize: "200px 100%", animation: "shimmer 5s linear infinite" }} />
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(145deg, ${RED} 0%, #8E1E19 100%)`, boxShadow: `0 8px 18px ${RED}55, inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -3px 6px rgba(0,0,0,0.35)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>5G</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.5, color: TEXT_MUTED }}>Implantação de Rede · Fibra Óptica</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Construção &amp; Entroncamento — Projetos 5G</div>
        </div>
        <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: "right" }}>{sessao.login} · {sessao.papel === "master" ? "acesso master" : "acesso usuário"}</div>
        <button onClick={() => window.open("https://fernandes.api.br", "_blank", "noopener,noreferrer")} className="btn-hover" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>Cálculos de rota</button>
        <button onClick={onLogout} className="btn-hover" style={{ background: "transparent", border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>Sair</button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 40px", overflowX: "auto", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(18,21,19,0.6)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setAba(t.id)} className="btn-hover tab-pill" style={{
            padding: "8px 15px", borderRadius: 999, fontSize: 12.5, whiteSpace: "nowrap", cursor: "pointer",
            border: `1px solid ${aba === t.id ? RED + "AA" : "rgba(255,255,255,0.08)"}`,
            background: aba === t.id ? `linear-gradient(180deg, ${RED}33, ${RED}14)` : "rgba(255,255,255,0.02)",
            boxShadow: aba === t.id ? `0 6px 16px ${RED}33, inset 0 1px 0 rgba(255,255,255,0.12)` : "none",
            color: aba === t.id ? "#FFB0AA" : TEXT_MUTED, fontWeight: aba === t.id ? 700 : 500,
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ padding: "24px 40px 48px", maxWidth: 1400, margin: "0 auto" }}>
        {sessao.papel === "master" && (
          <PainelAdmin onPublicar={publicarNovaPlanilha} onAtualizar={carregarDoStorage} carregando={carregando} origem={origem} />
        )}
        {sessao.papel === "master" && (
          <PainelUsuarios usuarios={usuarios} onUsuariosChange={onUsuariosChange} sessao={sessao} />
        )}
        {mensagem && (
          <div className="fade-in" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${GREEN}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 18, color: TEXT }}>{mensagem}</div>
        )}

        <div style={{ position: "relative", zIndex: 41, display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <FiltroMultiSelect label="Ano de implantação" selected={f.ano} onChange={(v) => setF({ ...f, ano: v })} options={anos} />
          <FiltroMultiSelect label="EPO" selected={f.epo} onChange={(v) => setF({ ...f, epo: v })} options={epos} />
          <FiltroMultiSelect label="Status Construção" selected={f.sc} onChange={(v) => setF({ ...f, sc: v })} options={statusList} />
          <FiltroMultiSelect label="Status Entroncamento" selected={f.se} onChange={(v) => setF({ ...f, se: v })} options={statusEntrList} />
          <button onClick={() => setMaisFiltros(!maisFiltros)} className="btn-hover" style={{ ...botaoSecundario, alignSelf: "flex-end" }}>
            {maisFiltros ? "− Menos filtros" : "+ Mais filtros"}
          </button>
          {sessao.papel !== "master" && (
            <button onClick={carregarDoStorage} className="btn-hover" style={{ ...botaoSecundario, alignSelf: "flex-end" }}>{carregando ? "Atualizando…" : "Atualizar dashboard"}</button>
          )}
          <button onClick={() => exportarCSV(dadosF)} className="btn-hover" style={{ ...botaoSecundario, alignSelf: "flex-end" }}>Exportar CSV</button>
          <div style={{ marginLeft: "auto", fontSize: 12, color: TEXT_MUTED, alignSelf: "flex-end" }}>{dadosF.length} sites no filtro · {origem}</div>
        </div>
        {maisFiltros && (
          <div className="fade-in" style={{ position: "relative", zIndex: 40, display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <FiltroMultiSelect label="QRM" selected={f.qrm} onChange={(v) => setF({ ...f, qrm: v })} options={qrms} />
            <FiltroMultiSelect label="Cidade" selected={f.cid} onChange={(v) => setF({ ...f, cid: v })} options={cidades} />
            <FiltroMultiSelect label="Etapa" selected={f.etapa} onChange={(v) => setF({ ...f, etapa: v })} options={etapas} />
            <FiltroMultiSelect label="Gabinete" selected={f.gab} onChange={(v) => setF({ ...f, gab: v })} options={gabinetes} />
            <FiltroMultiSelect label="SDCA" selected={f.sdca} onChange={(v) => setF({ ...f, sdca: v })} options={sdcas} />
            <FiltroMultiSelect label="Projeto CAPEX" selected={f.capex} onChange={(v) => setF({ ...f, capex: v })} options={capexList} />
            <FiltroMultiSelect label="Complemento Construção" selected={f.comp} onChange={(v) => setF({ ...f, comp: v })} options={compList} />
          </div>
        )}

        <div key={aba} className="tab-enter">
        {aba === "consolidado" && <AbaConsolidado {...ctx} />}
        {aba === "construcaoAno" && <AbaAno {...ctx} tipo="construcao" />}
        {aba === "entroncamentoAno" && <AbaAno {...ctx} tipo="entroncamento" />}
        {aba === "construcaoMes" && <AbaMes {...ctx} tipo="construcao" />}
        {aba === "entroncamentoMes" && <AbaMes {...ctx} tipo="entroncamento" />}
        {aba === "lancamento" && <AbaLancamento {...ctx} />}
        {aba === "analises" && <AbaAnalises {...ctx} />}
        {aba === "consulta" && <AbaConsulta {...ctx} />}
        {aba === "comparativo" && <AbaComparativo {...ctx} />}
        </div>

        <footer style={{ marginTop: 20, fontSize: 11, color: TEXT_FAINT }}>
          "Construído"/"Entroncado" refletem o status atual da planilha, não a data em que ocorreram. Linhas sem EPO, Ano ou demais campos válidos aparecem como "Não informado".
        </footer>
      </div>
    </div>
  );
}

function PainelAdmin({ onPublicar, onAtualizar, carregando, origem }) {
  const [arquivo, setArquivo] = useState(null);
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${RED}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Painel do administrador</div>
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>{origem}</div>
      </div>
      <input type="file" accept=".xlsx,.xls" onChange={(e) => setArquivo(e.target.files?.[0] || null)} style={{ fontSize: 12, color: TEXT_MUTED }} />
      <button disabled={!arquivo || carregando} onClick={() => arquivo && onPublicar(arquivo)} className="btn-hover" style={{ ...botaoPrimario, width: "auto", padding: "9px 16px", opacity: !arquivo || carregando ? 0.5 : 1 }}>
        {carregando ? "Publicando…" : "Publicar planilha para todos"}
      </button>
      <button onClick={onAtualizar} disabled={carregando} className="btn-hover" style={botaoSecundario}>Atualizar visualização</button>
    </div>
  );
}

function PainelUsuarios({ usuarios, onUsuariosChange, sessao }) {
  const [aberto, setAberto] = useState(false);
  const [novoLogin, setNovoLogin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoPapel, setNovoPapel] = useState("usuario");
  const [erro, setErro] = useState("");
  const [edicaoSenha, setEdicaoSenha] = useState({}); // { [login]: valorDigitado }

  function persistir(lista) {
    onUsuariosChange(lista);
  }

  function adicionarUsuario() {
    const l = novoLogin.trim().toLowerCase();
    if (!l || !novaSenha) { setErro("Preencha usuário e senha."); return; }
    if (usuarios.some((u) => u.login === l)) { setErro("Já existe um usuário com esse login."); return; }
    persistir([...usuarios, { login: l, senha: novaSenha, papel: novoPapel, ativo: true }]);
    setNovoLogin(""); setNovaSenha(""); setNovoPapel("usuario"); setErro("");
  }

  function alterarPapel(login, papel) {
    persistir(usuarios.map((u) => (u.login === login ? { ...u, papel } : u)));
  }

  function alternarAtivo(login) {
    if (login === sessao.login) { setErro("Você não pode desativar seu próprio usuário enquanto está logado com ele."); return; }
    setErro("");
    persistir(usuarios.map((u) => (u.login === login ? { ...u, ativo: u.ativo === false ? true : false } : u)));
  }

  function salvarNovaSenha(login) {
    const nova = edicaoSenha[login];
    if (!nova) return;
    persistir(usuarios.map((u) => (u.login === login ? { ...u, senha: nova } : u)));
    setEdicaoSenha({ ...edicaoSenha, [login]: "" });
  }

  function removerUsuario(login) {
    if (login === sessao.login) { setErro("Você não pode remover seu próprio usuário enquanto está logado com ele."); return; }
    setErro("");
    persistir(usuarios.filter((u) => u.login !== login));
  }

  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BLUE}`, borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>Gerenciar usuários</div>
          <div style={{ fontSize: 12, color: TEXT_MUTED }}>{usuarios.filter((u) => u.ativo !== false).length} ativo(s) de {usuarios.length}</div>
        </div>
        <button onClick={() => setAberto(!aberto)} className="btn-hover" style={botaoSecundario}>{aberto ? "Ocultar" : "Abrir"}</button>
      </div>

      {aberto && (
        <div className="fade-in" style={{ marginTop: 16 }}>
          {erro && <div style={{ color: RED, fontSize: 12.5, marginBottom: 10 }}>{erro}</div>}

          <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${BORDER}`, borderRadius: 8, marginBottom: 16 }}>
            <table className="tbl">
              <thead><tr><th>Login</th><th>Papel</th><th>Status</th><th>Nova senha</th><th></th></tr></thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr key={u.login}>
                    <td>{u.login}{u.login === sessao.login && <span style={{ color: TEXT_FAINT }}> (você)</span>}</td>
                    <td>
                      <select value={u.papel} onChange={(e) => alterarPapel(u.login, e.target.value)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${BORDER}`, background: SURFACE_2, color: TEXT, fontSize: 12.5 }}>
                        <option value="usuario">usuário</option>
                        <option value="master">master</option>
                      </select>
                    </td>
                    <td>
                      <span style={{ color: u.ativo === false ? RED : GREEN, fontWeight: 600 }}>{u.ativo === false ? "Inativo" : "Ativo"}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <input type="text" placeholder="nova senha" value={edicaoSenha[u.login] || ""} onChange={(e) => setEdicaoSenha({ ...edicaoSenha, [u.login]: e.target.value })} style={{ ...inputStyle, width: 110, padding: "5px 8px", fontSize: 12.5 }} />
                        <button onClick={() => salvarNovaSenha(u.login)} className="btn-hover" style={{ ...botaoSecundario, padding: "5px 10px", fontSize: 12 }}>Salvar</button>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => alternarAtivo(u.login)} className="btn-hover" style={{ ...botaoSecundario, padding: "5px 10px", fontSize: 12 }}>{u.ativo === false ? "Reativar" : "Desativar"}</button>
                        <button onClick={() => removerUsuario(u.login)} className="btn-hover" style={{ ...botaoSecundario, padding: "5px 10px", fontSize: 12, color: RED }}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>Novo login</div>
              <input value={novoLogin} onChange={(e) => setNovoLogin(e.target.value)} style={{ ...inputStyle, width: 140 }} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>Senha</div>
              <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} style={{ ...inputStyle, width: 140 }} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>Papel</div>
              <select value={novoPapel} onChange={(e) => setNovoPapel(e.target.value)} style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE_2, color: TEXT, fontSize: 13 }}>
                <option value="usuario">usuário</option>
                <option value="master">master</option>
              </select>
            </div>
            <button onClick={adicionarUsuario} className="btn-hover" style={{ ...botaoPrimario, width: "auto", padding: "10px 16px" }}>Adicionar usuário</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FiltroSelect({ label, value, onChange, options, renderLabel }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT_MUTED }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${BORDER}`, background: SURFACE_2, fontSize: 13, color: TEXT, minWidth: 150, maxWidth: 200 }}>
        {options.map((o) => <option key={o} value={o}>{renderLabel ? renderLabel(o) : o}</option>)}
      </select>
    </label>
  );
}

function FiltroMultiSelect({ label, selected, onChange, options }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function aoClicarFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  function alternar(v) {
    if (selected.includes(v)) onChange(selected.filter((x) => x !== v));
    else onChange([...selected, v]);
  }

  const resumo = selected.length === 0 ? "Todos" : selected.length === 1 ? selected[0] : `${selected.length} selecionados`;

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT_MUTED }}>
      {label}
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="btn-hover"
        style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${BORDER}`, background: SURFACE_2, fontSize: 13, color: TEXT, minWidth: 150, maxWidth: 200, textAlign: "left", cursor: "pointer" }}
      >
        {resumo}
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 8, zIndex: 30, minWidth: 210, maxHeight: 240, overflow: "auto", boxShadow: "0 12px 28px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <button type="button" onClick={() => onChange([])} className="btn-hover" style={{ ...botaoSecundario, padding: "3px 8px", fontSize: 11 }}>Todos</button>
            <button type="button" onClick={() => onChange(options)} className="btn-hover" style={{ ...botaoSecundario, padding: "3px 8px", fontSize: 11 }}>Marcar tudo</button>
          </div>
          {options.map((o) => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: TEXT, padding: "3px 2px", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => alternar(o)} />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, cor }) {
  const ref = useRef(null);
  const anim = useCountUp(typeof value === "number" ? value : null);
  const mostrado = typeof value === "number" ? Math.round(anim === null ? 0 : anim) : value;
  function mover(e) {
    const el = ref.current;
    if (!el || reduzirMovimento()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg) scale(1.03)`;
    el.style.setProperty("--mx", `${((px + 0.5) * 100).toFixed(0)}%`);
    el.style.setProperty("--my", `${((py + 0.5) * 100).toFixed(0)}%`);
  }
  function sair() { if (ref.current) ref.current.style.transform = ""; }
  const brilho = cor || RED;
  return (
    <div ref={ref} onMouseMove={mover} onMouseLeave={sair} className="kpi-glass" style={{ position: "relative", overflow: "hidden", background: "linear-gradient(155deg, rgba(36,41,38,0.6), rgba(20,24,22,0.68))", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px 18px", boxShadow: `0 14px 30px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 0 0 ${brilho}00` }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: cor ? `linear-gradient(90deg, ${cor}, ${cor}00)` : "transparent" }} />
      <div className="kpi-glare" />
      <div style={{ position: "relative", fontSize: 11.5, color: TEXT_MUTED, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div className="num" style={{ position: "relative", fontSize: 28, fontWeight: 700, color: cor || TEXT, letterSpacing: -0.5, textShadow: cor ? `0 0 18px ${cor}55` : "none" }}>{mostrado}</div>
      {sub && <div style={{ position: "relative", fontSize: 11.5, color: TEXT_FAINT, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PainelGrafico({ titulo, subtitulo, children }) {
  return (
    <div className="card-hover painel-glass" style={{ background: "linear-gradient(160deg, rgba(30,35,32,0.62), rgba(19,23,21,0.7))", backdropFilter: "blur(5px)", WebkitBackdropFilter: "blur(5px)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "18px 20px", marginBottom: 18, boxShadow: "0 18px 40px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ width: 3, height: 15, background: `linear-gradient(180deg, ${RED}, ${GREEN})`, borderRadius: 2, flexShrink: 0 }} />
        <div><div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>{titulo}</div>{subtitulo && <div style={{ fontSize: 11.5, color: TEXT_FAINT }}>{subtitulo}</div>}</div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = { background: "rgba(24,28,26,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 13, color: TEXT, boxShadow: "0 12px 30px rgba(0,0,0,0.5)" };

function RankingBar({ data, coresMap, height = 220, width = 130 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 24 }}>
        <CartesianGrid stroke={BORDER} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} width={width} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
        <Bar dataKey="qtd" radius={[0, 3, 3, 0]} maxBarSize={18}>
          <LabelList dataKey="qtd" position="right" fill={TEXT} fontSize={12} />
          {data.map((d, i) => <Cell key={i} fill={volH((coresMap && coresMap[d.label]) || TEXT_FAINT)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Tabela({ colunas, linhas, largo, altura }) {
  return (
    <div style={{ maxHeight: altura || 320, overflow: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
      <table className="tbl" style={largo ? { width: "max-content", minWidth: "100%" } : undefined}>
        <thead><tr>{colunas.map((c) => <th key={c.key} style={largo ? { whiteSpace: "nowrap" } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {linhas.map((r, i) => (
            <tr key={i}>{colunas.map((c) => <td key={c.key} style={largo ? { whiteSpace: "nowrap" } : undefined}>{r[c.key] ?? "—"}</td>)}</tr>
          ))}
          {linhas.length === 0 && <tr><td colSpan={colunas.length} style={{ color: TEXT_FAINT, textAlign: "center", padding: 16 }}>Nenhum registro no filtro atual.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Aba: Consolidado Geral ---------------- */

function AbaConsolidado({ dadosF }) {
  const total = dadosF.length;
  const construido = dadosF.filter((r) => r.sc === "CONSTRUÍDO").length;
  const entroncado = dadosF.filter((r) => r.se === "ENTRONCADO").length;
  const pendConstrucao = dadosF.filter((r) => ["ANÁLISE PROJETO", "PENDENTE PROJETO", "ATUANDO"].includes(r.sc)).length;
  const pendEntroncamento = dadosF.filter((r) => r.se === "PENDENTE").length;
  const pendLicenciamento = dadosF.filter((r) => r.gab === "PENDENTE").length;
  const pendProjeto = dadosF.filter((r) => r.sc === "PENDENTE PROJETO").length;

  const epoRanking = useMemoLike(dadosF, (r) => r.epo);
  const statusRanking = useMemoLike(dadosF, (r) => r.sc || "Sem status");
  const detalheSites = dadosF.slice(0, 100);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Total de sites" value={total} />
        <KpiCard label="Pend. Construção" value={pendConstrucao} />
        <KpiCard label="Pend. Entroncamento" value={pendEntroncamento} />
        <KpiCard label="Construído" value={construido} sub={pct(construido, total) + " do total"} cor={GREEN} />
        <KpiCard label="Entroncado" value={entroncado} sub={pct(entroncado, total) + " do total"} cor={GREEN} />
        <KpiCard label="Pend. Licenciamento" value={pendLicenciamento} cor={AMBER} />
        <KpiCard label="Pend. Projeto" value={pendProjeto} sub={pct(pendProjeto, total) + " do total"} cor={RED} />
      </div>
      <PainelGrafico titulo="Avanço do projeto" subtitulo="Percentual sobre o total de sites no filtro atual">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, padding: "6px 0 2px" }}>
          <AnelProgresso titulo="Construído" valor={construido} total={total} cor={GREEN} sub={`${construido} de ${total} sites`} />
          <AnelProgresso titulo="Entroncado" valor={entroncado} total={total} cor={GREEN} sub={`${entroncado} de ${total} sites`} />
          <AnelProgresso titulo="Pend. Projeto" valor={pendProjeto} total={total} cor={RED} sub={`${pendProjeto} de ${total} sites`} />
        </div>
      </PainelGrafico>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PainelGrafico titulo="Sites por EPO" subtitulo="Total no filtro atual"><RankingBar data={epoRanking} coresMap={EPO_CORES} /></PainelGrafico>
        <PainelGrafico titulo="Status de Construção" subtitulo="Distribuição geral"><RankingBar data={statusRanking} coresMap={STATUS_CONST_CORES} /></PainelGrafico>
      </div>
      <PainelGrafico titulo="Detalhe de sites" subtitulo={`De acordo com os filtros aplicados acima · mostrando até 100 de ${dadosF.length}`}>
        <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "etapa", label: "Etapa" }, { key: "sc", label: "Status" }]} linhas={detalheSites} />
      </PainelGrafico>
    </div>
  );
}

function useMemoLike(rows, keyFn) {
  return useMemo(() => countBy(rows, keyFn), [rows]);
}

/* ---------------- Aba: Construção/Entroncamento · Ano ---------------- */

function AbaAno({ dadosF, anosFiltro, epos, tipo }) {
  const planKey = tipo === "construcao" ? "cp" : "ep";
  const realStatusKey = tipo === "construcao" ? "sc" : "se";
  const realStatusOk = tipo === "construcao" ? "CONSTRUÍDO" : "ENTRONCADO";
  const coresStatus = tipo === "construcao" ? STATUS_CONST_CORES : STATUS_ENTR_CORES;
  const tituloReal = tipo === "construcao" ? "Construído" : "Entroncado";
  const [selCol, setSelCol] = useState(null);
  function alternarCol(i, tipoCol) { setSelCol((x) => (x && x.mes === i && x.tipo === tipoCol ? null : { mes: i, tipo: tipoCol })); }

  const serie = useMemo(() => {
    const meses = MESES.map((label) => ({ mes: label, Plan: 0, Real: 0 }));
    dadosF.forEach((r) => {
      const pi = monthIndex(r[planKey]);
      if (pi !== null && (anosFiltro === null || anosFiltro.includes(yearOf(r[planKey])))) {
        meses[pi].Plan += 1;
        if (r[realStatusKey] === realStatusOk) meses[pi].Real += 1;
      }
    });
    return meses;
  }, [dadosF, anosFiltro]); // eslint-disable-line

  const totalNoAno = serie.reduce((a, m) => a + m.Plan, 0);
  const realNoAno = serie.reduce((a, m) => a + m.Real, 0);
  const statusRanking = useMemoLike(dadosF, (r) => r[realStatusKey] || "Sem status");
  const epoRanking = useMemoLike(dadosF, (r) => r.epo);
  const totalComPlan = dadosF.filter((r) => r[planKey]).length;
  const baseTabela = selCol
    ? dadosF.filter((r) => {
        const pi = monthIndex(r[planKey]);
        return pi === selCol.mes && (anosFiltro === null || anosFiltro.includes(yearOf(r[planKey]))) && (selCol.tipo === "Plan" || r[realStatusKey] === realStatusOk);
      })
    : dadosF.filter((r) => r[planKey]);
  const tabela = baseTabela.slice(0, 100);
  const destaque = (i, t) => (selCol ? (selCol.mes === i && selCol.tipo === t ? 1 : 0.22) : 1);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Sites no ano (Plan)" value={totalNoAno} />
        <KpiCard label={tituloReal} value={realNoAno} sub={pct(realNoAno, totalNoAno) + " do planejado"} cor={GREEN} />
      </div>
      <PainelGrafico titulo={`${tipo === "construcao" ? "Construção" : "Entroncamento"} — Plan x Real por mês`} subtitulo="Plan = planejado para o mês · Real = já concluído hoje, independente de quando · clique em uma coluna para ver só os sites dela no detalhe">
        <ResponsiveContainer width="100%" height={270}>
          <ComposedChart data={serie} margin={{ left: -10 }}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
            <Legend wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }} />
            <Bar dataKey="Plan" fill={volV(PLAN_COLOR)} radius={[3, 3, 0, 0]} maxBarSize={26} cursor="pointer" onClick={(d, i) => alternarCol(i, "Plan")}>
              <LabelList dataKey="Plan" position="top" fill={TEXT_MUTED} fontSize={11} />
              {serie.map((m, i) => <Cell key={i} fill={volV(PLAN_COLOR)} fillOpacity={destaque(i, "Plan")} stroke={selCol && selCol.mes === i && selCol.tipo === "Plan" ? "#fff" : "none"} strokeWidth={2} />)}
            </Bar>
            <Bar dataKey="Real" fill={volV(REAL_COLOR)} radius={[3, 3, 0, 0]} maxBarSize={26} cursor="pointer" onClick={(d, i) => alternarCol(i, "Real")}>
              <LabelList dataKey="Real" position="top" fill={TEXT_MUTED} fontSize={11} />
              {serie.map((m, i) => <Cell key={i} fill={volV(REAL_COLOR)} fillOpacity={destaque(i, "Real")} stroke={selCol && selCol.mes === i && selCol.tipo === "Real" ? "#fff" : "none"} strokeWidth={2} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </PainelGrafico>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PainelGrafico titulo="Status" subtitulo="Distribuição no filtro atual"><RankingBar data={statusRanking} coresMap={coresStatus} /></PainelGrafico>
        <PainelGrafico titulo="Ranking por EPO" subtitulo="Total no filtro atual"><RankingBar data={epoRanking} coresMap={EPO_CORES} /></PainelGrafico>
      </div>
      <PainelGrafico titulo="Detalhe de sites" subtitulo={selCol ? `Coluna selecionada: ${selCol.tipo} · ${MESES[selCol.mes]} · ${baseTabela.length} site(s)${baseTabela.length > 100 ? " (mostrando 100)" : ""}` : `De acordo com os filtros aplicados acima · mostrando até 100 de ${totalComPlan}`}>
        {selCol && (
          <div style={{ marginBottom: 10 }}>
            <button className="btn-hover" style={botaoSecundario} onClick={() => setSelCol(null)}>Limpar seleção da coluna</button>
          </div>
        )}
        <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "etapa", label: "Etapa" }, { key: realStatusKey, label: "Status" }]} linhas={tabela} />
      </PainelGrafico>
    </div>
  );
}

/* ---------------- Aba: Construção/Entroncamento · Mês (mês atual) ---------------- */

function AbaMes({ dadosF, dadosTodos, hojeStr, anosFiltro, tipo }) {
  const planKey = tipo === "construcao" ? "cp" : "ep";
  const statusKey = tipo === "construcao" ? "sc" : "se";
  const statusOk = tipo === "construcao" ? "CONSTRUÍDO" : "ENTRONCADO";
  const anoAtualSistema = parseInt(hojeStr.slice(0, 4), 10);
  const anosDisponiveis = anosFiltro && anosFiltro.length ? anosFiltro : [anoAtualSistema];
  const [anoSel, setAnoSel] = useState(anosDisponiveis[0]);
  const mesAtualSistema = parseInt(hojeStr.slice(5, 7), 10) - 1;
  const [mesSel, setMesSel] = useState(mesAtualSistema);

  useEffect(() => {
    if (!anosDisponiveis.includes(anoSel)) setAnoSel(anosDisponiveis[0]);
  }, [anosFiltro]); // eslint-disable-line

  const doMes = dadosF.filter((r) => yearOf(r[planKey]) === anoSel && monthIndex(r[planKey]) === mesSel);
  const concluidos = doMes.filter((r) => r[statusKey] === statusOk).length;
  const pendentes = doMes.length - concluidos;

  const statusRanking = useMemoLike(doMes, (r) => r[statusKey] || "Sem status");
  const coresStatus = tipo === "construcao" ? STATUS_CONST_CORES : STATUS_ENTR_CORES;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <FiltroSelect label="Ano de referência" value={String(anoSel)} onChange={(v) => setAnoSel(parseInt(v, 10))} options={anosDisponiveis.map((a) => String(a))} />
        <FiltroSelect label="Mês de referência" value={String(mesSel)} onChange={(v) => setMesSel(parseInt(v, 10))} options={MESES.map((m, i) => String(i))} renderLabel={(v) => MESES[parseInt(v, 10)]} />
        <div style={{ fontSize: 12, color: TEXT_MUTED }}>
          Exibindo <b style={{ color: TEXT }}>{MESES[mesSel]}/{anoSel}</b>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Planejados no mês" value={doMes.length} />
        <KpiCard label="Concluídos" value={concluidos} sub={pct(concluidos, doMes.length) + " do mês"} cor={GREEN} />
        <KpiCard label="Ainda pendentes" value={pendentes} cor={RED} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PainelGrafico titulo="Status no mês" subtitulo="Sites planejados para este mês"><RankingBar data={statusRanking} coresMap={coresStatus} /></PainelGrafico>
        <PainelGrafico titulo="Detalhe" subtitulo="Sites do mês de referência">
          <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "epo", label: "EPO" }, { key: statusKey, label: "Status" }, { key: "cid", label: "Cidade" }]} linhas={doMes.slice(0, 30)} />
        </PainelGrafico>
      </div>
      <MapaSites sites={doMes} dadosTodos={dadosTodos} modoInicial={tipo === "construcao" ? "sc" : "se"} rotulo={`${MESES[mesSel]}/${anoSel}`} />
    </div>
  );
}

/* ---------------- Aba: Lançamento ---------------- */

function AbaLancamento({ dadosF, anosFiltro }) {
  const eposPresentes = useMemo(() => {
    const s = new Set(dadosF.map((r) => r.epo));
    const arr = Array.from(s).filter((e) => e !== "Não informado").sort();
    arr.push(...Array.from(s).filter((e) => e === "Não informado"));
    return arr;
  }, [dadosF]);

  const serie = useMemo(() => {
    const meses = MESES.map((label) => {
      const row = { mes: label };
      eposPresentes.forEach((e) => (row[e] = 0));
      return row;
    });
    dadosF.forEach((r) => {
      const mi = monthIndex(r.cp);
      if (mi === null) return;
      if (anosFiltro !== null && !anosFiltro.includes(yearOf(r.cp))) return;
      meses[mi][r.epo] = (meses[mi][r.epo] || 0) + (r.lanc || 0);
    });
    return meses;
  }, [dadosF, eposPresentes, anosFiltro]);

  const totalGeral = serie.reduce((acc, m) => acc + eposPresentes.reduce((a, e) => a + (m[e] || 0), 0), 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Total lançado no ano" value={totalGeral} />
        <KpiCard label="EPOs no filtro atual" value={eposPresentes.length} />
      </div>
      <PainelGrafico titulo="Lançamento mensal" subtitulo={eposPresentes.length === 1 ? `Somente EPO ${eposPresentes[0]} (filtro ativo)` : "Soma de todas as EPOs, mês a mês (mês da Construção Plan)"}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={serie} margin={{ left: -10 }}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
            <Legend wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }} />
            {eposPresentes.map((e) => (
              <Bar key={e} dataKey={e} stackId="epo" fill={volV(EPO_CORES[e] || TEXT_FAINT)} maxBarSize={26}>
                <LabelList dataKey={e} position="center" fill="#0E1110" fontSize={10.5} formatter={(v) => (v ? v : "")} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </PainelGrafico>
    </div>
  );
}

/* ---------------- Aba: Consulta ---------------- */

function AbaConsulta({ dadosF }) {
  const [q, setQ] = useState("");
  const { encontrados, duplicados } = useMemo(() => {
    if (!q.trim()) return { encontrados: [], duplicados: 0 };
    const term = q.trim().toUpperCase();
    const brutos = dadosF.filter((r) => r.site.toUpperCase() === term || r.site.toUpperCase().includes(term));
    const vistos = new Set();
    const unicos = [];
    for (const r of brutos) {
      if (vistos.has(r.site)) continue;
      vistos.add(r.site);
      unicos.push(r);
      if (unicos.length >= 5) break;
    }
    return { encontrados: unicos, duplicados: brutos.length - unicos.length };
  }, [dadosF, q]);

  return (
    <PainelGrafico titulo="Consulta de site" subtitulo="Digite o código do SITE para ver o registro completo">
      <input placeholder="Ex.: SMAIA03" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inputStyle, width: 280, marginBottom: 16 }} />
      {q.trim() && encontrados.length === 0 && <div style={{ color: TEXT_FAINT, fontSize: 13 }}>Nenhum site encontrado com esse código no filtro atual.</div>}
      {duplicados > 0 && <div style={{ color: AMBER, fontSize: 12, marginBottom: 10 }}>A planilha tem {duplicados} registro(s) duplicado(s) para este SITE — exibindo a primeira ocorrência.</div>}
      {encontrados.map((r) => (
        <div key={r.site} style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{r.site} <span style={{ color: TEXT_FAINT, fontWeight: 400, fontSize: 12 }}>· {r.cid}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, fontSize: 12.5 }}>
            <Campo2 label="Anel FO" v={r.anel} /><Campo2 label="Projeto CAPEX" v={r.capex} /><Campo2 label="Ano implantação" v={r.ano} /><Campo2 label="EPO" v={r.epo} /><Campo2 label="QRM" v={r.qrm} />
            <Campo2 label="Modelo infra" v={r.mod} /><Campo2 label="Etapa" v={r.etapa} /><Campo2 label="Gabinete" v={r.gab} />
            <Campo2 label="Construção Plan" v={formatDateBR(r.cp)} /><Campo2 label="Construção Real" v={formatDateBR(r.cr)} /><Campo2 label="Status Construção" v={r.sc} />
            <Campo2 label="Entroncado Plan" v={formatDateBR(r.ep)} /><Campo2 label="Entroncado Real" v={formatDateBR(r.er)} /><Campo2 label="Status Entroncamento" v={r.se} />
            <Campo2 label="Complemento Construção" v={r.compConstr} /><Campo2 label="Obs" v={r.obs} /><Campo2 label="Meta" v={r.meta} /><Campo2 label="Total Lançamento" v={r.lanc} /><Campo2 label="Ofensor Entroncamento" v={r.ofE} />
            <Campo2 label="Coordenadas" v={r.lat != null && r.lon != null ? `${r.lat}, ${r.lon}` : null} />
          </div>
          {r.lat != null && r.lon != null && (
            <button className="btn-hover" style={{ ...botaoSecundario, marginTop: 12 }} onClick={() => window.open(`https://www.google.com/maps?q=${r.lat},${r.lon}`, "_blank", "noopener,noreferrer")}>Abrir no Google Maps</button>
          )}
        </div>
      ))}
    </PainelGrafico>
  );
}
function Campo2({ label, v }) {
  return <div><div style={{ color: TEXT_FAINT, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div><div style={{ color: TEXT }}>{v || "—"}</div></div>;
}

/* ---------------- Mapa dos sites (usado em Construção·Mês e Entroncamento·Mês) ---------------- */

const TILT_A = 54, TILT_P = 1000;
const CORES_MAPA = {
  sc: { titulo: "Status Construção", cores: STATUS_CONST_CORES, get: (r) => r.sc || "Sem status" },
  se: { titulo: "Status Entroncamento", cores: STATUS_ENTR_CORES, get: (r) => r.se || "Sem status" },
  epo: { titulo: "EPO", cores: EPO_CORES, get: (r) => r.epo },
};
function mercX(lon, z) { return ((lon + 180) / 360) * 256 * Math.pow(2, z); }
function mercY(lat, z) {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z);
}
function lonDeX(x, z) { return (x / (256 * Math.pow(2, z))) * 360 - 180; }
function latDeY(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (256 * Math.pow(2, z));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
const BASES = {
  satelite: { nome: "Satélite", attr: "Imagens © Esri, Maxar, Earthstar Geographics", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, ref: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}` },
};
const suave = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function MapaSites({ sites: dadosF, dadosTodos, modoInicial, rotulo }) {
  const [modo, setModo] = useState(modoInicial || "sc");
  const base = "satelite";
  const [mostrarSusp, setMostrarSusp] = useState(false);
  const [vista, setVista] = useState({ lat: -23.55, lon: -46.63, z: 8 });
  const [tam, setTam] = useState({ w: 0, h: 580 });
  const [angulo, setAngulo] = useState(0);
  const [planoGrande, setPlanoGrande] = useState(false);
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState(null);
  const [busca, setBusca] = useState("");
  const [msg, setMsg] = useState("");
  const [tick, setTick] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const itensRef = useRef([]);
  const arrasto = useRef(null);
  const voo = useRef(null);
  const vistaRef = useRef(vista);
  const planoRef = useRef({ w: 0, h: 0 });
  const anguloRef = useRef(0);

  const plano = planoGrande ? { w: Math.round(tam.w * 1.9), h: Math.round(tam.h * 2.6) } : { w: tam.w, h: tam.h };
  vistaRef.current = vista;
  planoRef.current = plano;
  anguloRef.current = angulo;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const medir = () => setTam({ w: Math.round(el.getBoundingClientRect().width), h: 580 });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const latSusp = useMemo(() => {
    const m = new Map();
    (dadosTodos || []).forEach((r) => {
      if (r.lat == null || r.lon == null) return;
      let s = m.get(r.lat);
      if (!s) { s = new Set(); m.set(r.lat, s); }
      s.add(r.lon);
    });
    const out = new Set();
    m.forEach((s, lat) => { if (s.size >= 10) out.add(lat); });
    return out;
  }, [dadosTodos]);

  const { pontos, semCoord, ocultos } = useMemo(() => {
    const p = []; let sem = 0, oc = 0;
    dadosF.forEach((r) => {
      if (r.lat == null || r.lon == null) { sem++; return; }
      const susp = latSusp.has(r.lat);
      if (susp && !mostrarSusp) { oc++; return; }
      p.push({ r, lat: r.lat, lon: r.lon, susp });
    });
    return { pontos: p, semCoord: sem, ocultos: oc };
  }, [dadosF, latSusp, mostrarSusp]);

  const cfg = CORES_MAPA[modo];
  const legenda = useMemo(() => {
    const c = {};
    pontos.forEach((p) => { const v = cfg.get(p.r); c[v] = (c[v] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [pontos, cfg]);

  /* ---- coordenadas: tela -> plano (inverte a inclinação 3D) ---- */
  function pontoPlano(cx, cy) {
    const el = boxRef.current;
    const r = el.getBoundingClientRect();
    const pl = planoRef.current;
    let X = cx - r.left - r.width / 2;
    let Y = cy - r.top - r.height / 2;
    const a = (anguloRef.current * Math.PI) / 180;
    let x = X, y = Y;
    if (anguloRef.current > 0.01) {
      y = (Y * TILT_P) / (TILT_P * Math.cos(a) + Y * Math.sin(a));
      x = (X * (TILT_P - y * Math.sin(a))) / TILT_P;
    }
    return { x: x + pl.w / 2, y: y + pl.h / 2 };
  }

  function cancelarVoo() { if (voo.current) cancelAnimationFrame(voo.current); voo.current = null; }
  function voar(lat, lon, z, dur = 700) {
    cancelarVoo();
    const zz = Math.max(3, Math.min(18, z));
    if (reduzirMovimento()) { setVista({ lat, lon, z: zz }); return; }
    const de = { ...vistaRef.current };
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = suave(k);
      setVista({ lat: de.lat + (lat - de.lat) * e, lon: de.lon + (lon - de.lon) * e, z: de.z + (zz - de.z) * e });
      if (k < 1) voo.current = requestAnimationFrame(passo);
    };
    voo.current = requestAnimationFrame(passo);
  }
  function ajustar() {
    if (!pontos.length || !tam.w) return;
    const q = (arr, f) => arr[Math.floor((arr.length - 1) * f)];
    const lats = pontos.map((p) => p.lat).sort((a, b) => a - b);
    const lons = pontos.map((p) => p.lon).sort((a, b) => a - b);
    const a = q(lats, 0.01), b = q(lats, 0.99), c = q(lons, 0.01), d = q(lons, 0.99);
    const fx = Math.max((mercX(d, 0) - mercX(c, 0)) / 256, 1e-7);
    const fy = Math.max((mercY(a, 0) - mercY(b, 0)) / 256, 1e-7);
    const z = Math.log2(Math.min(tam.w / (256 * fx), tam.h / (256 * fy))) - 0.25;
    voar((a + b) / 2, (c + d) / 2, Math.max(5, Math.min(15, z)), 800);
  }
  useEffect(() => { if (tam.w > 0) ajustar(); }, [pontos, tam.w > 0]); // eslint-disable-line

  function zoomEm(p, nz) {
    cancelarVoo();
    const v = vistaRef.current, pl = planoRef.current;
    nz = Math.max(3, Math.min(18, nz));
    const wx = mercX(v.lon, v.z) + (p.x - pl.w / 2), wy = mercY(v.lat, v.z) + (p.y - pl.h / 2);
    const lon = lonDeX(wx, v.z), lat = latDeY(wy, v.z);
    const ncx = mercX(lon, nz) - (p.x - pl.w / 2), ncy = mercY(lat, nz) - (p.y - pl.h / 2);
    setVista({ lon: lonDeX(ncx, nz), lat: latDeY(ncy, nz), z: nz });
  }
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    function roda(e) {
      e.preventDefault();
      const p = pontoPlano(e.clientX, e.clientY);
      zoomEm(p, vistaRef.current.z - e.deltaY * 0.0018);
    }
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, []); // eslint-disable-line

  function alternar3D() {
    const de = anguloRef.current;
    const alvo = de > 1 ? 0 : TILT_A;
    if (alvo > 0) setPlanoGrande(true);
    if (reduzirMovimento()) { setAngulo(alvo); if (alvo === 0) setPlanoGrande(false); return; }
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / 800);
      setAngulo(de + (alvo - de) * suave(k));
      if (k < 1) requestAnimationFrame(passo);
      else if (alvo === 0) setPlanoGrande(false);
    };
    requestAnimationFrame(passo);
  }

  /* ---- pulsar o site selecionado ---- */
  useEffect(() => {
    if (!sel || reduzirMovimento()) return;
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, [sel]);

  /* ---- desenho dos marcadores ---- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !plano.w) return;
    const dpr = planoGrande ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    cv.width = plano.w * dpr; cv.height = plano.h * dpr;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ox = mercX(vista.lon, vista.z) - plano.w / 2;
    const oy = mercY(vista.lat, vista.z) - plano.h / 2;
    const itens = [];
    const dentro = (x, y) => x > -40 && y > -40 && x < plano.w + 40 && y < plano.h + 40;
    if (vista.z < 13) {
      const cel = 46, mapa = new Map();
      for (const p of pontos) {
        const x = mercX(p.lon, vista.z) - ox, y = mercY(p.lat, vista.z) - oy;
        if (!dentro(x, y)) continue;
        const k = Math.floor(x / cel) + "_" + Math.floor(y / cel);
        let g = mapa.get(k);
        if (!g) { g = { sx: 0, sy: 0, n: 0, lat: 0, lon: 0, cont: {}, lista: [] }; mapa.set(k, g); }
        g.sx += x; g.sy += y; g.n++; g.lat += p.lat; g.lon += p.lon;
        const v = cfg.get(p.r); g.cont[v] = (g.cont[v] || 0) + 1; g.lista.push(p);
      }
      mapa.forEach((g) => {
        const dom = Object.entries(g.cont).sort((a, b) => b[1] - a[1])[0][0];
        itens.push({ x: g.sx / g.n, y: g.sy / g.n, n: g.n, cor: cfg.cores[dom] || TEXT_FAINT, lista: g.lista, lat: g.lat / g.n, lon: g.lon / g.n, cont: g.cont, r: g.n === 1 ? g.lista[0].r : null, susp: g.n === 1 && g.lista[0].susp });
      });
    } else {
      for (const p of pontos) {
        const x = mercX(p.lon, vista.z) - ox, y = mercY(p.lat, vista.z) - oy;
        if (!dentro(x, y)) continue;
        itens.push({ x, y, n: 1, cor: cfg.cores[cfg.get(p.r)] || TEXT_FAINT, lista: [p], lat: p.lat, lon: p.lon, cont: { [cfg.get(p.r)]: 1 }, r: p.r, susp: p.susp });
      }
    }
    itens.forEach((it) => { it.rad = it.n > 1 ? Math.min(34, 11 + Math.sqrt(it.n) * 2.6) : 5.5; });
    itensRef.current = itens;
    for (const it of itens) {
      if (it.n > 1) {
        const g = ctx.createRadialGradient(it.x - it.rad * 0.3, it.y - it.rad * 0.35, 1, it.x, it.y, it.rad);
        g.addColorStop(0, ajustarCor(it.cor, 0.35)); g.addColorStop(1, ajustarCor(it.cor, -0.2));
        ctx.shadowColor = it.cor; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(it.x, it.y, it.rad, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "700 12px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(it.n), it.x, it.y + 0.5);
      } else {
        ctx.beginPath(); ctx.arc(it.x, it.y, it.rad, 0, Math.PI * 2);
        if (it.susp) { ctx.lineWidth = 1.6; ctx.strokeStyle = it.cor + "CC"; ctx.stroke(); }
        else {
          ctx.shadowColor = it.cor; ctx.shadowBlur = 10; ctx.fillStyle = it.cor; ctx.fill(); ctx.shadowBlur = 0;
          ctx.lineWidth = 1.2; ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.stroke();
        }
      }
    }
    if (sel) {
      const it = itens.find((x) => x.n === 1 && x.r === sel);
      if (it) {
        const f = (Date.now() % 1400) / 1400;
        ctx.beginPath(); ctx.arc(it.x, it.y, 9 + f * 20, 0, Math.PI * 2);
        ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,255,255,${(1 - f) * 0.9})`; ctx.stroke();
        ctx.beginPath(); ctx.arc(it.x, it.y, 8.5, 0, Math.PI * 2);
        ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke();
      }
    }
  }, [vista, plano.w, plano.h, planoGrande, pontos, cfg, sel, tick]); // eslint-disable-line

  function acharItem(p) {
    let melhor = null, md = 1e9;
    for (const it of itensRef.current) {
      const d = Math.hypot(it.x - p.x, it.y - p.y);
      if (d <= it.rad + 4 && d < md) { md = d; melhor = it; }
    }
    return melhor;
  }
  function aoPressionar(e) {
    cancelarVoo();
    arrasto.current = { p: pontoPlano(e.clientX, e.clientY), mov: 0 };
    boxRef.current.setPointerCapture(e.pointerId);
    setArrastando(true);
    setHover(null);
  }
  function aoMover(e) {
    const p = pontoPlano(e.clientX, e.clientY);
    const a = arrasto.current;
    if (a) {
      const dx = p.x - a.p.x, dy = p.y - a.p.y;
      a.mov += Math.abs(dx) + Math.abs(dy);
      a.p = p;
      const v = vistaRef.current;
      const ncx = mercX(v.lon, v.z) - dx, ncy = mercY(v.lat, v.z) - dy;
      setVista({ lon: lonDeX(ncx, v.z), lat: latDeY(ncy, v.z), z: v.z });
      return;
    }
    const it = acharItem(p);
    const r = boxRef.current.getBoundingClientRect();
    setHover(it ? { sx: e.clientX - r.left, sy: e.clientY - r.top, it } : null);
  }
  function aoSoltar(e) {
    const a = arrasto.current;
    arrasto.current = null;
    setArrastando(false);
    if (a && a.mov < 5) {
      const it = acharItem(pontoPlano(e.clientX, e.clientY));
      if (it) {
        if (it.n > 1) voar(it.lat, it.lon, vistaRef.current.z + 2.4, 650);
        else { setSel(it.r); }
      }
    }
  }

  function buscar() {
    const termo = busca.trim().toUpperCase();
    if (!termo) return;
    const r = dadosF.find((x) => x.site.toUpperCase() === termo) || dadosF.find((x) => x.site.toUpperCase().includes(termo));
    if (!r) { setMsg("Site não encontrado entre os sites deste mês."); return; }
    if (r.lat == null || r.lon == null) { setMsg(`${r.site} não tem coordenada na planilha.`); setSel(r); return; }
    if (latSusp.has(r.lat) && !mostrarSusp) { setMostrarSusp(true); setMsg(`${r.site} tem latitude suspeita — coordenadas suspeitas foram incluídas no mapa.`); }
    else setMsg("");
    setSel(r);
    voar(r.lat, r.lon, 16.5, 900);
  }

  /* ---- camada de tiles ---- */
  const tz = Math.max(0, Math.min(18, Math.round(vista.z)));
  const esc = Math.pow(2, vista.z - tz);
  const tt = 256 * esc;
  const tox = mercX(vista.lon, vista.z) - plano.w / 2;
  const toy = mercY(vista.lat, vista.z) - plano.h / 2;
  const tiles = [];
  if (plano.w) {
    const n = Math.pow(2, tz);
    const x0 = Math.floor(tox / tt), x1 = Math.floor((tox + plano.w) / tt);
    const y0 = Math.max(0, Math.floor(toy / tt)), y1 = Math.min(n - 1, Math.floor((toy + plano.h) / tt));
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const mx = ((tx % n) + n) % n;
      tiles.push({ k: `${base}/${tz}/${tx}/${ty}`, left: tx * tt - tox, top: ty * tt - toy, src: BASES[base].url(tz, mx, ty), ref: BASES[base].ref ? BASES[base].ref(tz, mx, ty) : null });
    }
  }

  const k3d = angulo / TILT_A;
  const comCoord = dadosF.length - semCoord;
  const btnMapa = { background: "rgba(24,28,26,0.88)", border: "1px solid rgba(255,255,255,0.14)", color: TEXT, borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 16, fontWeight: 700, backdropFilter: "blur(6px)" };

  return (
    <div>
      <PainelGrafico titulo={`Localização dos sites · ${rotulo}`} subtitulo="Somente os sites do mês e dos filtros selecionados · arraste para mover · roda do mouse para zoom · clique em um grupo para aproximar ou em um site para ver os detalhes">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>Localizar site do mês</div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscar()} placeholder="Ex.: SMAIA03" style={{ ...inputStyle, width: 170 }} />
              <button onClick={buscar} className="btn-hover" style={botaoSecundario}>Localizar</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 4 }}>Colorir por</div>
            <select value={modo} onChange={(e) => setModo(e.target.value)} style={{ ...inputStyle, width: 190 }}>
              {Object.entries(CORES_MAPA).map(([k, v]) => <option key={k} value={k}>{v.titulo}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: TEXT_MUTED, cursor: "pointer", paddingBottom: 9 }}>
            <input type="checkbox" checked={mostrarSusp} onChange={(e) => setMostrarSusp(e.target.checked)} /> Incluir coordenadas suspeitas
          </label>
          <div style={{ marginLeft: "auto", fontSize: 12, color: TEXT_MUTED, paddingBottom: 9, textAlign: "right" }}>
            <b style={{ color: TEXT }}>{pontos.length}</b> no mapa · {semCoord} sem coordenada{ocultos > 0 && <> · <span style={{ color: AMBER }}>{ocultos} suspeitos ocultos</span></>}
          </div>
        </div>
        {msg && <div style={{ color: AMBER, fontSize: 12.5, marginBottom: 8 }}>{msg}</div>}
        {ocultos > 0 && !mostrarSusp && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "rgba(255,180,84,0.08)", border: "1px solid rgba(255,180,84,0.35)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: AMBER, marginBottom: 10 }}>
            <span>{ocultos} de {dadosF.length} sites deste mês têm latitude repetida em muitos outros sites (provável erro na planilha) e não foram plotados.</span>
            <button className="btn-hover" style={{ ...botaoSecundario, padding: "5px 10px" }} onClick={() => setMostrarSusp(true)}>Mostrar mesmo assim</button>
          </div>
        )}
        {comCoord === 0 && dadosF.length > 0 && (
          <div style={{ color: AMBER, fontSize: 12.5, marginBottom: 8 }}>Nenhum site deste mês tem latitude/longitude. Se a base publicada é antiga, o master precisa publicar novamente a planilha com as colunas de coordenadas (AU e AV).</div>
        )}

        <div style={{ position: "relative" }}>
          <div
            ref={boxRef}
            onPointerDown={aoPressionar} onPointerMove={aoMover} onPointerUp={aoSoltar}
            onPointerLeave={() => { if (!arrasto.current) setHover(null); }}
            style={{ position: "relative", height: tam.h, overflow: "hidden", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "radial-gradient(ellipse at 50% 40%, #1A201D 0%, #0B0E0D 100%)", cursor: arrastando ? "grabbing" : hover ? "pointer" : "grab", touchAction: "none", userSelect: "none",
              WebkitMaskImage: k3d > 0.01 ? `linear-gradient(to bottom, rgba(0,0,0,${1 - k3d}) 0%, #000 ${6 + 34 * k3d}%)` : "none",
              maskImage: k3d > 0.01 ? `linear-gradient(to bottom, rgba(0,0,0,${1 - k3d}) 0%, #000 ${6 + 34 * k3d}%)` : "none" }}
          >
            <div style={{ position: "absolute", width: plano.w, height: plano.h, left: (tam.w - plano.w) / 2, top: (tam.h - plano.h) / 2, transformOrigin: "50% 50%", transform: `perspective(${TILT_P}px) rotateX(${angulo}deg)` }}>
              <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
                {tiles.map((t) => (
                  <React.Fragment key={t.k}>
                    <img src={t.src} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }}
                      style={{ position: "absolute", left: t.left, top: t.top, width: tt + 0.6, height: tt + 0.6, pointerEvents: "none", userSelect: "none" }} />
                    {t.ref && <img src={t.ref} alt="" draggable={false} onError={(e) => { e.currentTarget.style.display = "none"; }}
                      style={{ position: "absolute", left: t.left, top: t.top, width: tt + 0.6, height: tt + 0.6, pointerEvents: "none", userSelect: "none" }} />}
                  </React.Fragment>
                ))}
              </div>
              <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: plano.w, height: plano.h, pointerEvents: "none" }} />
            </div>
          </div>

          <div style={{ position: "absolute", left: 12, top: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            <button style={btnMapa} onClick={() => voar(vista.lat, vista.lon, vista.z + 1, 350)} title="Aproximar">+</button>
            <button style={btnMapa} onClick={() => voar(vista.lat, vista.lon, vista.z - 1, 350)} title="Afastar">−</button>
            <button style={{ ...btnMapa, fontSize: 11 }} onClick={ajustar} title="Ajustar aos sites">⤢</button>
          </div>
          <button onClick={alternar3D} className="btn-hover" style={{ ...btnMapa, position: "absolute", right: 12, top: 12, width: "auto", padding: "0 14px", fontSize: 12.5, background: angulo > 1 ? `${RED}CC` : btnMapa.background }}>
            {angulo > 1 ? "Visão 2D" : "Visão 3D"}
          </button>
          <div style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(14,17,16,0.82)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 12px", backdropFilter: "blur(6px)", fontSize: 11.5, maxWidth: 260 }}>
            <div style={{ color: TEXT_FAINT, marginBottom: 4, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.4 }}>{cfg.titulo}</div>
            {legenda.map(([nome, qtd]) => (
              <div key={nome} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: cfg.cores[nome] || TEXT_FAINT, boxShadow: `0 0 8px ${cfg.cores[nome] || TEXT_FAINT}` }} />
                <span style={{ color: TEXT_MUTED, flex: 1 }}>{nome}</span><span className="num" style={{ color: TEXT }}>{qtd}</span>
              </div>
            ))}
            {mostrarSusp && <div style={{ color: AMBER, marginTop: 4 }}>◯ anel vazado = coordenada suspeita</div>}
          </div>
          <div style={{ position: "absolute", right: 8, bottom: 6, fontSize: 10, color: TEXT_FAINT }}>{BASES[base].attr}</div>

          {hover && (
            <div style={{ position: "absolute", left: Math.min(hover.sx + 14, Math.max(0, tam.w - 230)), top: Math.max(8, hover.sy - 10), pointerEvents: "none", background: "rgba(14,17,16,0.95)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "8px 11px", fontSize: 12, minWidth: 150, boxShadow: "0 12px 30px rgba(0,0,0,0.5)" }}>
              {hover.it.n === 1 ? (
                <>
                  <div style={{ fontWeight: 700, color: TEXT }}>{hover.it.r.site}</div>
                  <div style={{ color: TEXT_MUTED }}>{hover.it.r.cid}</div>
                  <div style={{ color: TEXT_MUTED }}>Constr.: {hover.it.r.sc || "—"} · Entr.: {hover.it.r.se || "—"}</div>
                  {hover.it.susp && <div style={{ color: AMBER }}>Coordenada suspeita</div>}
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 700, color: TEXT }}>{hover.it.n} sites</div>
                  {Object.entries(hover.it.cont).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([nome, q]) => (
                    <div key={nome} style={{ color: TEXT_MUTED }}>{nome}: <b style={{ color: TEXT }}>{q}</b></div>
                  ))}
                  <div style={{ color: TEXT_FAINT, marginTop: 3 }}>Clique para aproximar</div>
                </>
              )}
            </div>
          )}
        </div>
      </PainelGrafico>

      {sel && (
        <PainelGrafico titulo={`Site ${sel.site}`} subtitulo={sel.cid}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, fontSize: 12.5 }}>
            <Campo2 label="Anel FO" v={sel.anel} /><Campo2 label="EPO" v={sel.epo} /><Campo2 label="Ano implantação" v={sel.ano} /><Campo2 label="Etapa" v={sel.etapa} />
            <Campo2 label="Construção Plan" v={formatDateBR(sel.cp)} /><Campo2 label="Construção Real" v={formatDateBR(sel.cr)} /><Campo2 label="Status Construção" v={sel.sc} />
            <Campo2 label="Entroncado Plan" v={formatDateBR(sel.ep)} /><Campo2 label="Entroncado Real" v={formatDateBR(sel.er)} /><Campo2 label="Status Entroncamento" v={sel.se} />
            <Campo2 label="Latitude" v={sel.lat != null ? String(sel.lat) : null} /><Campo2 label="Longitude" v={sel.lon != null ? String(sel.lon) : null} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            {sel.lat != null && sel.lon != null && (
              <>
                <button className="btn-hover" style={botaoSecundario} onClick={() => window.open(`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${sel.lat},${sel.lon}`, "_blank", "noopener,noreferrer")}>Abrir no Street View</button>
                <button className="btn-hover" style={botaoSecundario} onClick={() => window.open(`https://www.google.com/maps?q=${sel.lat},${sel.lon}`, "_blank", "noopener,noreferrer")}>Abrir no Google Maps</button>
              </>
            )}
            <button className="btn-hover" style={botaoSecundario} onClick={() => setSel(null)}>Fechar</button>
          </div>
        </PainelGrafico>
      )}
    </div>
  );
}

/* ---------------- Aba: Pareto ---------------- */

/* ---------------- Aba: Análises ---------------- */

function metaChave(ano, mesIdx) { return String(ano % 100).padStart(2, "0") + "M" + String(mesIdx + 1).padStart(2, "0"); }

function AbaAnalises({ dadosF, hojeStr }) {
  const [sel, setSel] = useState("adiantar");
  const ano = parseInt(hojeStr.slice(0, 4), 10);
  const mes = parseInt(hojeStr.slice(5, 7), 10) - 1;
  const proxAno = mes === 11 ? ano + 1 : ano;
  const proxMes = (mes + 1) % 12;
  const metasJanela = [metaChave(ano, mes), metaChave(proxAno, proxMes)];
  const mesAtual = hojeStr.slice(0, 7);
  const inicioMes = mesAtual + "-01";
  const rotuloMes = `${MESES[mes]}/${ano}`;

  const A = useMemo(() => {
    const gabN = (r) => String(r.gab || "").toUpperCase().trim();
    const semInfo = (r) => ["SEM INFO", "NÃO INFORMADO", ""].includes(gabN(r));
    const construidoPend = dadosF.filter((r) => r.sc === "CONSTRUÍDO" && r.se === "PENDENTE");
    const adiantar = construidoPend.filter((r) => gabN(r) === "GABINETE OK" || semInfo(r));
    const naoOk = construidoPend.filter((r) => gabN(r) !== "GABINETE OK" && r.gabData);
    const oport = naoOk.filter((r) => r.gabData.slice(0, 7) === mesAtual);
    const vencidas = naoOk.filter((r) => r.gabData < inicioMes);
    const meta = dadosF.filter((r) =>
      r.sc !== "CANCELADO" && r.se !== "CANCELADO" &&
      (r.se === "PENDENTE" || r.sc !== "CONSTRUÍDO") &&
      String(r.etapa || "").toUpperCase().trim() === "OT" &&
      metasJanela.includes(String(r.meta || "").toUpperCase().trim()));
    const naoConstruidos = dadosF.filter((r) => r.sc !== "CONSTRUÍDO" && r.sc !== "CANCELADO" && r.se !== "CANCELADO" && (gabN(r) === "GABINETE OK" || semInfo(r)));
    const dias = (d) => Math.floor((new Date(hojeStr) - new Date(d)) / 86400000);
    const porData = (campo) => (a, b) => (a[campo] || "9999").localeCompare(b[campo] || "9999") || a.site.localeCompare(b.site);
    return {
      adiantar: { orig: [...adiantar].sort(porData("ep")), semInfo },
      oport: { orig: [...oport].sort(porData("gabData")), semInfo },
      vencidas: { orig: [...vencidas].sort((a, b) => a.gabData.localeCompare(b.gabData)), dias },
      meta: { orig: [...meta].sort((a, b) => String(a.meta).localeCompare(String(b.meta)) || a.site.localeCompare(b.site)) },
      naoConstruidos: { orig: [...naoConstruidos].sort((a, b) => String(a.sc).localeCompare(String(b.sc)) || (a.cp || "9999").localeCompare(b.cp || "9999") || a.site.localeCompare(b.site)) },
    };
  }, [dadosF, mesAtual, inicioMes, hojeStr]); // eslint-disable-line

  const CFG = {
    adiantar: {
      titulo: "Adiantar entroncamento", cor: GREEN,
      regra: "Construído · entroncamento pendente · gabinete OK ou SEM INFO. São os casos em que dá para tentar antecipar o entroncamento.",
      colunas: [{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "epo", label: "EPO" }, { key: "gab", label: "Gabinete" }, { key: "gabD", label: "Data gabinete" }, { key: "epD", label: "Entr. Plan" }, { key: "ofE", label: "Ofensor entroncamento" }, { key: "meta", label: "Meta" }],
    },
    oport: {
      titulo: "Oportunidades do mês", cor: AMBER,
      regra: `Construído · entroncamento pendente · gabinete ainda não OK · data de gabinete (col. AB) em ${rotuloMes}. Ao concretizar o gabinete, o site passa para "Adiantar entroncamento".`,
      colunas: [{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "epo", label: "EPO" }, { key: "gab", label: "Gabinete" }, { key: "gabD", label: "Data gabinete" }, { key: "epD", label: "Entr. Plan" }, { key: "ofE", label: "Ofensor entroncamento" }, { key: "nota", label: "Observação" }],
    },
    vencidas: {
      titulo: "Gabinete com data vencida", cor: RED,
      regra: `Construído · entroncamento pendente · gabinete ainda não OK · data de gabinete anterior a ${rotuloMes}. Datas para remanejar.`,
      colunas: [{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "epo", label: "EPO" }, { key: "gab", label: "Gabinete" }, { key: "gabD", label: "Data gabinete" }, { key: "atraso", label: "Atraso (dias)" }, { key: "epD", label: "Entr. Plan" }, { key: "ofE", label: "Ofensor entroncamento" }],
    },
    meta: {
      titulo: "OT com meta próxima", cor: BLUE,
      regra: `Etapa OT com meta em ${metasJanela.join(" ou ")} · entroncamento pendente ou construção diferente de construído (sem cancelados). Candidatos a remanejar data.`,
      colunas: [{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "epo", label: "EPO" }, { key: "meta", label: "Meta" }, { key: "etapa", label: "Etapa" }, { key: "sc", label: "Status construção" }, { key: "se", label: "Status entroncamento" }, { key: "cpD", label: "Constr. Plan" }, { key: "epD", label: "Entr. Plan" }, { key: "ofE", label: "Ofensor entroncamento" }],
    },
    naoConstruidos: {
      titulo: "Não construídos com gabinete liberado", cor: PURPLE,
      regra: "Construção diferente de construído (sem cancelados) · gabinete OK ou SEM INFO. Casos para priorizar a construção.",
      colunas: [{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "epo", label: "EPO" }, { key: "sc", label: "Status construção" }, { key: "gab", label: "Gabinete" }, { key: "compConstr", label: "Complemento construção" }, { key: "cpD", label: "Constr. Plan" }, { key: "epD", label: "Entr. Plan" }, { key: "se", label: "Status entroncamento" }],
    },
  };

  function exibir(chave, r) {
    return {
      ...r,
      gabD: formatDateBR(r.gabData),
      epD: formatDateBR(r.ep),
      cpD: formatDateBR(r.cp),
      atraso: r.gabData ? A.vencidas.dias(r.gabData) : null,
      nota: chave === "oport" && A.oport.semInfo(r) ? "Gabinete SEM INFO: também aparece em Adiantar entroncamento" : "",
      ofE: r.ofE || null, meta: r.meta || null,
    };
  }
  const atual = CFG[sel];
  const linhas = useMemo(() => A[sel].orig.map((r) => exibir(sel, r)), [A, sel]); // eslint-disable-line

  return (
    <div>
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 14 }}>
        Hoje: <b style={{ color: TEXT }}>{formatDateBR(hojeStr)}</b> · mês vigente <b style={{ color: TEXT }}>{rotuloMes}</b> · janela de meta <b style={{ color: TEXT }}>{metasJanela.join(" e ")}</b> · as análises respeitam os filtros do topo
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        {Object.keys(CFG).map((k) => {
          const c = CFG[k], ativo = sel === k;
          return (
            <button key={k} onClick={() => setSel(k)} className="kpi-glass" style={{ textAlign: "left", cursor: "pointer", position: "relative", overflow: "hidden", borderRadius: 14, padding: "16px 18px", color: TEXT, fontFamily: "inherit",
              background: ativo ? `linear-gradient(155deg, ${c.cor}26, rgba(20,24,22,0.8))` : "linear-gradient(155deg, rgba(36,41,38,0.6), rgba(20,24,22,0.68))",
              border: `1px solid ${ativo ? c.cor : "rgba(255,255,255,0.08)"}`, boxShadow: ativo ? `0 0 0 1px ${c.cor}55, 0 14px 30px ${c.cor}22` : "0 10px 24px rgba(0,0,0,0.3)" }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, background: `linear-gradient(90deg, ${c.cor}, ${c.cor}00)` }} />
              <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 6, fontWeight: 600 }}>{c.titulo}</div>
              <div className="num" style={{ fontSize: 30, fontWeight: 700, color: c.cor, textShadow: `0 0 18px ${c.cor}55` }}>{A[k].orig.length}</div>
              <div style={{ fontSize: 11, color: TEXT_FAINT, marginTop: 2 }}>sites</div>
            </button>
          );
        })}
      </div>
      <PainelGrafico titulo={atual.titulo} subtitulo={atual.regra}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED }}><b style={{ color: TEXT }}>{linhas.length}</b> site(s) · role a tabela para ver todos</div>
          <button className="btn-hover" style={botaoSecundario} onClick={() => exportarCSV(A[sel].orig)} disabled={linhas.length === 0}>Exportar CSV ({linhas.length})</button>
        </div>
        <Tabela colunas={atual.colunas} linhas={linhas} largo altura={560} />
      </PainelGrafico>
    </div>
  );
}

function AbaPareto({ dadosF }) {
  const dados = useMemo(() => {
    const cont = countBy(dadosF.filter((r) => r.ofE), (r) => r.ofE);
    const total = cont.reduce((a, d) => a + d.qtd, 0);
    let acum = 0;
    return cont.map((d) => {
      acum += d.qtd;
      return { ...d, acumPct: total ? Math.round((acum / total) * 1000) / 10 : 0 };
    });
  }, [dadosF]);

  return (
    <PainelGrafico titulo="Pareto de ofensores — Entroncamento" subtitulo='Única coluna de "ofensor" com dados preenchidos na planilha atual é a de Entroncamento; a de Construção está vazia nesta base'>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={dados} margin={{ left: -10, right: 10 }}>
          <CartesianGrid stroke={BORDER} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
          <Legend wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }} />
          <Bar yAxisId="left" dataKey="qtd" name="Ocorrências" fill={RED} radius={[3, 3, 0, 0]} maxBarSize={40}>
            <LabelList dataKey="qtd" position="top" fill={TEXT} fontSize={12} />
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="acumPct" name="% acumulado" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }}>
            <LabelList dataKey="acumPct" position="top" fill={GREEN} fontSize={11} formatter={(v) => `${v}%`} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </PainelGrafico>
  );
}

/* ---------------- Aba: Comparativo (última publicação x atual) ---------------- */

const CAMPOS_COMPARAVEIS = [
  { key: "sc", label: "Status Construção" },
  { key: "se", label: "Status Entroncamento" },
  { key: "cp", label: "Construção Plan", data: true },
  { key: "cr", label: "Construção Real", data: true },
  { key: "ep", label: "Entroncado Plan", data: true },
  { key: "er", label: "Entroncado Real", data: true },
  { key: "epo", label: "EPO" },
  { key: "gab", label: "Gabinete" },
  { key: "sdca", label: "SDCA" },
  { key: "etapa", label: "Etapa" },
];

function mapaPorSite(rows) {
  const m = new Map();
  rows.forEach((r) => { if (r.site) m.set(r.site, r); }); // último ganha em caso de duplicidade
  return m;
}

function AbaComparativo({ dadosF, dadosAnteriorF, atualizadoEmAtual, atualizadoEmAnterior }) {
  if (!dadosAnteriorF) {
    return (
      <PainelGrafico titulo="Comparativo — última publicação x atual" subtitulo="Ainda não há uma versão anterior para comparar">
        <div style={{ color: TEXT_MUTED, fontSize: 13, padding: "10px 0" }}>
          A comparação passa a aparecer automaticamente a partir da próxima vez que o administrador publicar uma planilha nova — o sistema guarda a versão que estava no ar antes da publicação para comparar com a atual.
        </div>
      </PainelGrafico>
    );
  }

  const { novos, removidos, alterados, deltaTotais } = useMemo(() => {
    const mAnt = mapaPorSite(dadosAnteriorF);
    const mAtu = mapaPorSite(dadosF);

    const novos = [];
    const alterados = [];
    mAtu.forEach((r, site) => {
      const ant = mAnt.get(site);
      if (!ant) { novos.push(r); return; }
      const mudancas = [];
      CAMPOS_COMPARAVEIS.forEach((c) => {
        const de = ant[c.key] || null;
        const para = r[c.key] || null;
        if (de !== para) {
          mudancas.push(`${c.label}: ${c.data ? (formatDateBR(de) || "—") : (de || "—")} → ${c.data ? (formatDateBR(para) || "—") : (para || "—")}`);
        }
      });
      if (mudancas.length > 0) alterados.push({ ...r, mudancas: mudancas.join(" · ") });
    });
    const removidos = [];
    mAnt.forEach((r, site) => { if (!mAtu.has(site)) removidos.push(r); });

    const construidoAnt = dadosAnteriorF.filter((r) => r.sc === "CONSTRUÍDO").length;
    const construidoAtu = dadosF.filter((r) => r.sc === "CONSTRUÍDO").length;
    const entroncadoAnt = dadosAnteriorF.filter((r) => r.se === "ENTRONCADO").length;
    const entroncadoAtu = dadosF.filter((r) => r.se === "ENTRONCADO").length;

    return {
      novos, removidos, alterados,
      deltaTotais: {
        total: { ant: dadosAnteriorF.length, atu: dadosF.length },
        construido: { ant: construidoAnt, atu: construidoAtu },
        entroncado: { ant: entroncadoAnt, atu: entroncadoAtu },
      },
    };
  }, [dadosF, dadosAnteriorF]);

  function DeltaCard({ label, ant, atu }) {
    const delta = atu - ant;
    const cor = delta > 0 ? GREEN : delta < 0 ? RED : TEXT_MUTED;
    const sinal = delta > 0 ? "+" : "";
    return (
      <div className="card-hover" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px" }}>
        <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 6 }}>{label}</div>
        <div className="num" style={{ fontSize: 24, fontWeight: 700, color: TEXT }}>{ant} → {atu}</div>
        <div style={{ fontSize: 12, color: cor, marginTop: 3, fontWeight: 600 }}>{sinal}{delta} desde a última publicação</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 14 }}>
        Comparando publicação de <b style={{ color: TEXT }}>{atualizadoEmAnterior ? new Date(atualizadoEmAnterior).toLocaleString("pt-BR") : "base inicial"}</b> com a atual de <b style={{ color: TEXT }}>{atualizadoEmAtual ? new Date(atualizadoEmAtual).toLocaleString("pt-BR") : "—"}</b>. Considera os filtros aplicados no topo. Sites com SITE duplicado são consolidados pela última ocorrência.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 18 }}>
        <DeltaCard label="Total de sites" ant={deltaTotais.total.ant} atu={deltaTotais.total.atu} />
        <DeltaCard label="Construído" ant={deltaTotais.construido.ant} atu={deltaTotais.construido.atu} />
        <DeltaCard label="Entroncado" ant={deltaTotais.entroncado.ant} atu={deltaTotais.entroncado.atu} />
        <KpiCard label="Sites alterados" value={alterados.length} cor={AMBER} />
        <KpiCard label="Sites novos" value={novos.length} cor={GREEN} />
        <KpiCard label="Sites removidos" value={removidos.length} cor={RED} />
      </div>

      <PainelGrafico titulo="Sites com alteração" subtitulo="Campos que mudaram desde a última publicação — todos os registros">
        <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "mudancas", label: "O que mudou" }]} linhas={alterados} />
      </PainelGrafico>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PainelGrafico titulo="Sites novos" subtitulo="Presentes só na base atual">
          <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "sc", label: "Status" }]} linhas={novos} />
        </PainelGrafico>
        <PainelGrafico titulo="Sites removidos" subtitulo="Presentes só na base anterior">
          <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "sc", label: "Status" }]} linhas={removidos} />
        </PainelGrafico>
      </div>
    </div>
  );
}
