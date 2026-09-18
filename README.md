# Painel de Construção & Entroncamento — Fibra 5G

Dashboard React (Vite) com login, upload de planilha pelo admin, comparativo
entre publicações e gráficos de acompanhamento. Feito para rodar na Vercel,
com o Upstash Redis guardando os dados compartilhados entre todos os usuários.

## 1. Criar o banco de dados (Upstash Redis) — grátis

1. Acesse https://upstash.com e crie uma conta (dá pra logar com GitHub/Google).
2. Crie um novo banco **Redis** (Region: escolha a mais próxima, ex. `sa-east-1` se disponível).
3. Na página do banco, vá em **REST API** e copie:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

Guarde os dois valores — vai precisar deles no passo 3.

## 2. Subir o projeto pro GitHub

```bash
cd fibra5g-dashboard
git init
git add .
git commit -m "primeira versão do dashboard"
```

Crie um repositório novo no GitHub e siga as instruções que ele mesmo mostra
para enviar (`git remote add origin ...` e `git push`).

## 3. Conectar na Vercel

1. Acesse https://vercel.com, faça login com GitHub.
2. "Add New" → "Project" → selecione o repositório que você acabou de criar.
3. Nas configurações do projeto, antes de clicar em Deploy, abra
   **Environment Variables** e adicione:
   - `UPSTASH_REDIS_REST_URL` → (o valor copiado no passo 1)
   - `UPSTASH_REDIS_REST_TOKEN` → (o valor copiado no passo 1)
4. Clique em **Deploy**. A Vercel detecta o Vite automaticamente
   (build command `vite build`, output `dist`) e também publica sozinha
   tudo que está na pasta `/api` como funções serverless.

Em poucos minutos você terá uma URL do tipo `seu-projeto.vercel.app` já
funcionando, com login, upload de planilha e tudo mais.

## 4. Colocar no seu domínio próprio

No painel do projeto na Vercel: **Settings → Domains → Add** e digite o
domínio ou subdomínio que quiser (ex. `dashboard.fernandes.api.br`). A Vercel
mostra exatamente qual registro DNS (CNAME ou A) adicionar no painel do seu
provedor de domínio. Depois de propagar (geralmente minutos a poucas horas),
o dashboard fica disponível ali.

## 5. Login inicial

- Usuário comum: `claro` / `claro`
- Master (admin): `admin` / `E@ee20*15`

Assim que logar como master, você pode trocar essas senhas, criar novos
usuários e desativar os que não usar mais, pela própria tela do dashboard
("Gerenciar usuários").

## Como funciona a atualização "ao vivo"

Quando o master publica uma planilha nova:
1. O navegador lê o `.xlsx` e converte os dados.
2. Envia para `/api/data`, que grava no Upstash Redis.
3. Qualquer pessoa com o dashboard aberto, ao clicar em "Atualizar dashboard"
   (ou reabrir a página), busca a versão mais recente do Upstash.

Não existe "empurrar" automático para telas já abertas sem interação (isso
exigiria WebSockets/polling constante) — cada pessoa atualiza puxando a
versão mais nova quando quiser.

## Testar localmente antes de fazer deploy

```bash
npm install -g vercel   # se ainda não tiver
npm install
vercel dev
```

O comando `vercel dev` sobe tanto o front quanto as funções em `/api`
juntos, simulando o ambiente da Vercel na sua máquina. Crie um arquivo
`.env` (copiando `.env.example`) com as mesmas variáveis do Upstash para
isso funcionar localmente.

## Estrutura do projeto

```
├── api/              → funções serverless (fala com o Upstash Redis)
│   ├── _upstash.js
│   ├── data.js
│   └── users.js
├── src/
│   ├── App.jsx        → todo o dashboard (abas, gráficos, login, admin)
│   ├── main.jsx
│   └── data/initialData.json  → base inicial (planilha atual convertida)
├── index.html
├── package.json
└── vite.config.js
```
