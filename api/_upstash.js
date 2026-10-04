// Helper compartilhado para falar com o Upstash Redis (REST API).
// Não é uma rota — o nome com "_" na frente faz a Vercel ignorá-lo como endpoint.

const BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function checarConfiguracao() {
  if (!BASE_URL || !TOKEN) {
    throw new Error(
      "Variáveis de ambiente UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN não configuradas na Vercel."
    );
  }
}

export async function upstashGet(chave) {
  checarConfiguracao();
  const res = await fetch(`${BASE_URL}/get/${encodeURIComponent(chave)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`Upstash GET falhou: ${res.status}`);
  const json = await res.json();
  return json.result ?? null;
}

export async function upstashSet(chave, valorTexto) {
  checarConfiguracao();
  const res = await fetch(`${BASE_URL}/set/${encodeURIComponent(chave)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: valorTexto,
  });
  if (!res.ok) throw new Error(`Upstash SET falhou: ${res.status}`);
  return true;
}
