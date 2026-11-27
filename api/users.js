import { upstashGet, upstashSet } from "./_upstash.js";

const CHAVE = "fibra5g:users";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const valor = await upstashGet(CHAVE);
      res.status(200).json({ value: valor });
      return;
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const valor = body && body.value;
      if (typeof valor !== "string") {
        res.status(400).json({ erro: "Campo 'value' (string) é obrigatório." });
        return;
      }
      await upstashSet(CHAVE, valor);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ erro: "Método não suportado." });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
}
