# Painel de Construção & Entroncamento — Fibra 5G

Dashboard React (Vite) com login, upload de planilha pelo admin, comparativo
entre publicações e gráficos de acompanhamento. Feito para rodar na Vercel,
com o Upstash Redis guardando os dados compartilhados entre todos os usuários.

## Variáveis de ambiente (já configuradas no projeto da Vercel)

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Se for reconfigurar do zero, veja `.env.example`.

## Login inicial

- Usuário comum: `claro` / `claro`
- Master (admin): `admin` / `E@ee20*15`

(Essas senhas podem já ter sido trocadas pelo "Gerenciar usuários" — se mudou,
use as novas.)

## Estrutura do projeto

```
├── api/              → funções serverless (fala com o Upstash Redis)
│   ├── _upstash.js
│   ├── data.js
│   └── users.js
├── src/
│   ├── App.jsx        → todo o dashboard (abas, gráficos, login, admin)
│   ├── main.jsx
│   └── data/initialData.json  → base inicial (planilha convertida)
├── index.html
├── package.json
└── vite.config.js
```

## Atualizando o código depois de um deploy já no ar

1. Peça a alteração ao assistente, que devolve o(s) arquivo(s) atualizados
   (geralmente só `src/App.jsx`).
2. Substitua esse arquivo no GitHub (pelo site, usando "Add file" → "Upload
   files", ou editando direto).
3. A Vercel detecta o commit e republica sozinha em 1-2 minutos.

Atualizar os **dados** da planilha é outro processo, independente deste: use
o botão de publicar planilha dentro do próprio dashboard, logado como master.
