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
  { id: "metaMes", label: "Meta Mês" },
  { id: "lancamento", label: "Lançamento" },
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
  compConstr: 11, ep: 13, er: 14, se: 15, ofE: 18, epo: 22, gab: 30, sdca: 36,
  qrm: 38, lanc: 40, meta: 41, etapa: 43,
};

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
      compConstr: cleanTxt(l[COL.compConstr], ""),
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

function TelaLogin({ onLogin, erro }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  function tentarEntrar() {
    onLogin(login, senha);
  }
  return (
    <div style={{ minHeight: "100%", background: `radial-gradient(600px 400px at 20% 20%, #1A2320 0%, ${BG} 60%), radial-gradient(500px 400px at 85% 80%, #241416 0%, ${BG} 55%), ${BG}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: 24 }}>
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "38px 34px", width: 340, boxShadow: "0 40px 90px rgba(0,0,0,0.55)", borderTop: `3px solid ${RED}`, textAlign: "center" }}>
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
const botaoSecundario = { background: SURFACE_2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "9px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };

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
    const arr = Array.from(s).filter((v) => v !== "Não informado").sort();
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

  const anoPadrao = anos.includes("2026") ? ["2026"] : [];
  const [f, setF] = useState({ ano: anoPadrao, epo: [], qrm: [], cid: [], sc: [], etapa: [], gab: [], sdca: [] });

  const aplicarFiltro = useCallback((lista) => lista.filter((r) =>
    (f.ano.length === 0 || f.ano.includes(r.ano)) &&
    (f.epo.length === 0 || f.epo.includes(r.epo)) &&
    (f.qrm.length === 0 || f.qrm.includes(r.qrm)) &&
    (f.cid.length === 0 || f.cid.includes(r.cid)) &&
    (f.sc.length === 0 || f.sc.includes(r.sc)) &&
    (f.etapa.length === 0 || f.etapa.includes(r.etapa)) &&
    (f.gab.length === 0 || f.gab.includes(r.gab)) &&
    (f.sdca.length === 0 || f.sdca.includes(r.sdca))
  ), [f]);

  const dadosF = useMemo(() => aplicarFiltro(dados), [dados, aplicarFiltro]);
  const dadosAnteriorF = useMemo(() => (dadosAnterior ? aplicarFiltro(dadosAnterior) : null), [dadosAnterior, aplicarFiltro]);

  const hojeStr = new Date().toISOString().slice(0, 10);
  const anosFiltro = f.ano.length ? f.ano.map((a) => parseInt(a, 10)) : null;

  const ctx = { dadosF, hojeStr, anosFiltro, epos, sessao, dadosAnteriorF, atualizadoEmAtual, atualizadoEmAnterior };

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: BG, color: TEXT, minHeight: "100%" }}>
      <style>{`
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

      <div style={{ position: "relative", background: `linear-gradient(180deg, ${SURFACE} 0%, ${BG} 100%)`, padding: "18px 40px", display: "flex", alignItems: "center", gap: 16, borderBottom: `1px solid ${BORDER}`, overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${RED}, ${GREEN}, transparent)`, backgroundSize: "200px 100%", animation: "shimmer 5s linear infinite" }} />
        <div style={{ width: 34, height: 34, borderRadius: 9, background: RED_SOFT, border: `1px solid ${RED}55`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: RED }}>5G</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, letterSpacing: 0.5, color: TEXT_MUTED }}>Implantação de Rede · Fibra Óptica</div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Construção &amp; Entroncamento — Projetos 5G</div>
        </div>
        <div style={{ fontSize: 12, color: TEXT_MUTED, textAlign: "right" }}>{sessao.login} · {sessao.papel === "master" ? "acesso master" : "acesso usuário"}</div>
        <button onClick={() => window.open("https://fernandes.api.br", "_blank", "noopener,noreferrer")} className="btn-hover" style={{ background: SURFACE_2, border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>Cálculos de rota</button>
        <button onClick={onLogout} className="btn-hover" style={{ background: "transparent", border: `1px solid ${BORDER}`, color: TEXT, borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer" }}>Sair</button>
      </div>

      <div style={{ display: "flex", gap: 6, padding: "10px 40px", overflowX: "auto", borderBottom: `1px solid ${BORDER}`, background: SURFACE }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setAba(t.id)} className="btn-hover" style={{
            padding: "7px 13px", borderRadius: 7, fontSize: 12.5, whiteSpace: "nowrap", cursor: "pointer",
            border: `1px solid ${aba === t.id ? RED : BORDER}`,
            background: aba === t.id ? RED_SOFT : "transparent",
            color: aba === t.id ? "#FF8A82" : TEXT_MUTED, fontWeight: aba === t.id ? 700 : 500,
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

        <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <FiltroMultiSelect label="Ano de implantação" selected={f.ano} onChange={(v) => setF({ ...f, ano: v })} options={anos} />
          <FiltroMultiSelect label="EPO" selected={f.epo} onChange={(v) => setF({ ...f, epo: v })} options={epos} />
          <FiltroMultiSelect label="Status Construção" selected={f.sc} onChange={(v) => setF({ ...f, sc: v })} options={statusList} />
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
          <div className="fade-in" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
            <FiltroMultiSelect label="QRM" selected={f.qrm} onChange={(v) => setF({ ...f, qrm: v })} options={qrms} />
            <FiltroMultiSelect label="Cidade" selected={f.cid} onChange={(v) => setF({ ...f, cid: v })} options={cidades} />
            <FiltroMultiSelect label="Etapa" selected={f.etapa} onChange={(v) => setF({ ...f, etapa: v })} options={etapas} />
            <FiltroMultiSelect label="Gabinete" selected={f.gab} onChange={(v) => setF({ ...f, gab: v })} options={gabinetes} />
            <FiltroMultiSelect label="SDCA" selected={f.sdca} onChange={(v) => setF({ ...f, sdca: v })} options={sdcas} />
          </div>
        )}

        {aba === "consolidado" && <AbaConsolidado {...ctx} />}
        {aba === "construcaoAno" && <AbaAno {...ctx} tipo="construcao" />}
        {aba === "entroncamentoAno" && <AbaAno {...ctx} tipo="entroncamento" />}
        {aba === "construcaoMes" && <AbaMes {...ctx} tipo="construcao" />}
        {aba === "entroncamentoMes" && <AbaMes {...ctx} tipo="entroncamento" />}
        {aba === "metaMes" && <AbaMetaMes {...ctx} />}
        {aba === "lancamento" && <AbaLancamento {...ctx} />}
        {aba === "consulta" && <AbaConsulta {...ctx} />}
        {aba === "comparativo" && <AbaComparativo {...ctx} />}

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
  return (
    <div className="card-hover" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "16px 18px", borderTop: cor ? `3px solid ${cor}` : `3px solid transparent` }}>
      <div style={{ fontSize: 11.5, color: TEXT_MUTED, marginBottom: 6, fontWeight: 500 }}>{label}</div>
      <div className="num" style={{ fontSize: 26, fontWeight: 700, color: cor || TEXT, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: TEXT_FAINT, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PainelGrafico({ titulo, subtitulo, children }) {
  return (
    <div className="card-hover" style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "18px 20px", marginBottom: 18 }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "baseline", gap: 10 }}>
        <div style={{ width: 3, height: 15, background: `linear-gradient(180deg, ${RED}, ${GREEN})`, borderRadius: 2, flexShrink: 0 }} />
        <div><div style={{ fontSize: 14.5, fontWeight: 600, color: TEXT }}>{titulo}</div>{subtitulo && <div style={{ fontSize: 11.5, color: TEXT_FAINT }}>{subtitulo}</div>}</div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = { background: SURFACE_2, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, color: TEXT };

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
          {data.map((d, i) => <Cell key={i} fill={(coresMap && coresMap[d.label]) || TEXT_FAINT} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Tabela({ colunas, linhas, largo }) {
  return (
    <div style={{ maxHeight: 320, overflow: "auto", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Total de sites" value={total} />
        <KpiCard label="Pend. Construção" value={pendConstrucao} />
        <KpiCard label="Pend. Entroncamento" value={pendEntroncamento} />
        <KpiCard label="Construído" value={construido} sub={pct(construido, total) + " do total"} cor={GREEN} />
        <KpiCard label="Entroncado" value={entroncado} sub={pct(entroncado, total) + " do total"} cor={GREEN} />
        <KpiCard label="Pend. Licenciamento" value={pendLicenciamento} cor={AMBER} />
        <KpiCard label="Pend. Projeto" value={pendProjeto} sub={pct(pendProjeto, total) + " do total"} cor={RED} />
      </div>
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
  const tabela = dadosF.filter((r) => r[planKey]).slice(0, 100);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        <KpiCard label="Sites no ano (Plan)" value={totalNoAno} />
        <KpiCard label={tituloReal} value={realNoAno} sub={pct(realNoAno, totalNoAno) + " do planejado"} cor={GREEN} />
      </div>
      <PainelGrafico titulo={`${tipo === "construcao" ? "Construção" : "Entroncamento"} — Plan x Real por mês`} subtitulo="Plan = planejado para o mês · Real = já concluído hoje, independente de quando">
        <ResponsiveContainer width="100%" height={270}>
          <ComposedChart data={serie} margin={{ left: -10 }}>
            <CartesianGrid stroke={BORDER} vertical={false} />
            <XAxis dataKey="mes" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={{ stroke: BORDER }} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
            <Legend wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }} />
            <Bar dataKey="Plan" fill={PLAN_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26}>
              <LabelList dataKey="Plan" position="top" fill={TEXT_MUTED} fontSize={11} />
            </Bar>
            <Bar dataKey="Real" fill={REAL_COLOR} radius={[3, 3, 0, 0]} maxBarSize={26}>
              <LabelList dataKey="Real" position="top" fill={TEXT_MUTED} fontSize={11} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </PainelGrafico>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <PainelGrafico titulo="Status" subtitulo="Distribuição no filtro atual"><RankingBar data={statusRanking} coresMap={coresStatus} /></PainelGrafico>
        <PainelGrafico titulo="Ranking por EPO" subtitulo="Total no filtro atual"><RankingBar data={epoRanking} coresMap={EPO_CORES} /></PainelGrafico>
      </div>
      <PainelGrafico titulo="Detalhe de sites" subtitulo={`De acordo com os filtros aplicados acima · mostrando até 100 de ${totalComPlan}`}>
        <Tabela colunas={[{ key: "site", label: "SITE" }, { key: "cid", label: "Cidade" }, { key: "etapa", label: "Etapa" }, { key: realStatusKey, label: "Status" }]} linhas={tabela} />
      </PainelGrafico>
    </div>
  );
}

/* ---------------- Aba: Construção/Entroncamento · Mês (mês atual) ---------------- */

function AbaMes({ dadosF, hojeStr, anosFiltro, tipo }) {
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
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
              <Bar key={e} dataKey={e} stackId="epo" fill={EPO_CORES[e] || TEXT_FAINT} maxBarSize={26}>
                <LabelList dataKey={e} position="center" fill="#0E1110" fontSize={10.5} formatter={(v) => (v ? v : "")} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </PainelGrafico>
    </div>
  );
}

/* ---------------- Aba: Meta Mês ---------------- */

function AbaMetaMes({ dadosF }) {
  const grupos = useMemo(() => {
    const cont = {};
    dadosF.forEach((r) => {
      if (!r.meta) return;
      if (!cont[r.meta]) cont[r.meta] = { meta: r.meta, total: 0, concluido: 0 };
      cont[r.meta].total += 1;
      if (r.sc === "CONSTRUÍDO") cont[r.meta].concluido += 1;
    });
    return Object.values(cont).sort((a, b) => a.meta.localeCompare(b.meta));
  }, [dadosF]);

  const semMeta = dadosF.filter((r) => !r.meta).length;

  return (
    <div>
      <div style={{ fontSize: 12, color: TEXT_MUTED, marginBottom: 14 }}>
        Agrupamento pelo campo "META" da planilha (lote de referência, ex.: 26M01 = 2026 / mês 01). {semMeta} sites no filtro não têm meta atribuída.
      </div>
      <PainelGrafico titulo="Sites por lote de meta" subtitulo="Total planejado x já construído, por lote">
        <ResponsiveContainer width="100%" height={Math.max(220, grupos.length * 26)}>
          <BarChart data={grupos} layout="vertical" margin={{ left: 20, right: 24 }}>
            <CartesianGrid stroke={BORDER} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12, fill: TEXT_MUTED }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="meta" tick={{ fontSize: 11, fill: TEXT_MUTED }} axisLine={false} tickLine={false} width={60} />
            <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: TEXT }} />
            <Legend wrapperStyle={{ fontSize: 12, color: TEXT_MUTED }} />
            <Bar dataKey="total" name="Total" fill={PLAN_COLOR} maxBarSize={14} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="total" position="right" fill={TEXT} fontSize={11} />
            </Bar>
            <Bar dataKey="concluido" name="Construído" fill={REAL_COLOR} maxBarSize={14} radius={[0, 3, 3, 0]}>
              <LabelList dataKey="concluido" position="right" fill={TEXT} fontSize={11} />
            </Bar>
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
            <Campo2 label="Anel FO" v={r.anel} /><Campo2 label="Ano implantação" v={r.ano} /><Campo2 label="EPO" v={r.epo} /><Campo2 label="QRM" v={r.qrm} />
            <Campo2 label="Modelo infra" v={r.mod} /><Campo2 label="Etapa" v={r.etapa} /><Campo2 label="Gabinete" v={r.gab} />
            <Campo2 label="Construção Plan" v={formatDateBR(r.cp)} /><Campo2 label="Construção Real" v={formatDateBR(r.cr)} /><Campo2 label="Status Construção" v={r.sc} />
            <Campo2 label="Entroncado Plan" v={formatDateBR(r.ep)} /><Campo2 label="Entroncado Real" v={formatDateBR(r.er)} /><Campo2 label="Status Entroncamento" v={r.se} />
            <Campo2 label="Meta" v={r.meta} /><Campo2 label="Total Lançamento" v={r.lanc} /><Campo2 label="Ofensor Entroncamento" v={r.ofE} />
          </div>
        </div>
      ))}
    </PainelGrafico>
  );
}
function Campo2({ label, v }) {
  return <div><div style={{ color: TEXT_FAINT, fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</div><div style={{ color: TEXT }}>{v || "—"}</div></div>;
}

/* ---------------- Aba: Pareto ---------------- */

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
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
