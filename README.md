# Lanchonete Martinica 🍔🧡

Sistema de gestão de lanchonete: **PDV**, **fila de pedidos**, **estoque por
ficha técnica**, **compras**, **contas a pagar** e **financeiro** — em um app
web único, com identidade visual em **laranja, preto e branco**.

Os dados ficam num banco **Postgres no [Supabase](https://supabase.com/)**,
com login pelo Supabase Auth, permissões por perfil direto no banco (RLS) e
**sincronização em tempo real**: vários caixas e a gestão podem trabalhar ao
mesmo tempo, e um pedido lançado num caixa aparece na hora na fila dos outros.

## 🌐 Onde acessar

**https://lanchonete-martinica.vercel.app**

A aplicação é publicada na **Vercel**: cada push na `main` atualiza a produção e
cada pull request ganha uma URL de preview própria.

A Vercel detecta o Vite sozinho (`npm run build` → `dist/`). O que ela
precisa é das **variáveis de ambiente do Supabase** — veja o passo 4 abaixo.
Sem elas, o app abre numa tela de "Configuração pendente".

## 🗄️ Colocando no ar com o Supabase

1. **Crie um projeto** em [supabase.com](https://supabase.com/dashboard).
2. **Crie as tabelas e regras.** No painel, abra *SQL Editor*, cole o conteúdo
   de [`supabase/migrations/20261013000000_init.sql`](supabase/migrations/20261013000000_init.sql)
   e execute. Para começar com o cardápio de exemplo (insumos, produtos e
   fichas técnicas), execute também [`supabase/seed.sql`](supabase/seed.sql).
   *(Com a [CLI do Supabase](https://supabase.com/docs/guides/cli):
   `npx supabase link --project-ref SEU-PROJETO` e `npx supabase db push`.)*
3. **Feche o cadastro público.** Em *Authentication → Sign In / Providers*,
   desligue **Allow new users to sign up**. Usuários são criados só pelo
   administrador, dentro do app.
4. **Configure o app.** Em *Project Settings → API* copie a *Project URL* e a
   chave *anon public* e cadastre na Vercel (*Settings → Environment
   Variables*) e no seu `.env.local` para rodar localmente:

   ```bash
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
   ```

   Depois de cadastrar na Vercel, faça um novo deploy para o build pegar as
   variáveis. A chave *anon* é pública por natureza; quem protege os dados
   são as políticas de acesso do banco.
5. **Publique a função de usuários** (criar login, trocar senha, desativar e
   excluir exigem a chave de serviço, que nunca vai para o navegador):

   ```bash
   npx supabase functions deploy manage-users --project-ref SEU-PROJETO
   ```

6. **Crie o primeiro administrador.** Em *Authentication → Users → Add user →
   Create new user*, informe o e-mail `admin@lanchonete-martinica.app`, uma
   senha forte e marque *Auto Confirm User*. **O primeiro usuário do sistema
   vira administrador automaticamente.** Entre no app com o usuário `admin` e
   essa senha e cadastre o restante da equipe em **Usuários**.

## 🚀 Rodando localmente

```bash
npm install
cp .env.example .env.local   # e preencha com os dados do Supabase
npm run dev                  # http://localhost:5173
```

Para ter um Supabase inteiro na sua máquina (precisa de Docker):

```bash
npx supabase start            # sobe banco, Auth, API e Realtime; aplica migração e seed
npx supabase functions serve  # serve a função manage-users
```

O `supabase start` mostra a URL da API e a chave *anon* para o `.env.local`.

Outros comandos:

```bash
npm run build             # build de produção em dist/
npm run build:standalone  # HTML único autocontido em dist-standalone/index.html
npm run preview           # serve o build de produção
npm run lint              # typecheck (tsc --noEmit)
```

O `build:standalone` gera **um arquivo HTML** com CSS e JS embutidos: dá para
copiar `dist-standalone/index.html` num pen drive e abrir com dois cliques no
computador do balcão, sem instalar nada. Ele fala com o mesmo Supabase (as
variáveis do `.env.local` entram no build), então precisa de internet.

## 🔑 Acesso e perfis

| Perfil | O que enxerga |
| --- | --- |
| Administrador | Tudo: painel, produtos, estoque, compras, contas a pagar, financeiro e usuários |
| Operador de PDV | Apenas a vitrine de vendas e a fila de pedidos |

- O login é **usuário e senha**. Por baixo, o Supabase Auth identifica cada
  pessoa por e-mail: o usuário `caixa` vira `caixa@lanchonete-martinica.app`
  (domínio configurável em `VITE_LOGIN_EMAIL_DOMAIN`; a função
  `manage-users` usa a variável `LOGIN_EMAIL_DOMAIN`, que precisa ter o mesmo
  valor). Quem digitar um e-mail completo entra com ele.
- Senhas ficam só no Supabase Auth, com hash — o app nunca as vê.
- As permissões valem **no banco** (RLS): o operador de PDV não consegue ler
  compras, contas ou o cadastro de usuários nem chamando a API direto.
- Desativar um usuário bloqueia o login dele e corta o acesso aos dados na
  hora, mesmo com a sessão já aberta.

## 🧾 PDV — a tela do operador

Tema escuro, separado da área de gestão.

- Vitrine com **imagem e preço de todos os itens de venda**, busca por nome e
  filtro por categoria (Lanches, Porções, Bebidas, Sobremesas, Combos).
- Cada card mostra **quantas porções o estoque ainda permite vender**; itens
  esgotados ficam bloqueados.
- Carrinho com quantidade, observação por item ("sem cebola"), tipo de
  atendimento (balcão, mesa, entrega), nome do cliente e desconto em R$.
- **Formas de pagamento**: dinheiro (com valor recebido, atalhos de cédula e
  cálculo automático de **troco**), Pix, débito, crédito, vale-refeição e
  fiado.
- O preço e o custo de cada item são conferidos **no banco** no momento da
  venda, a partir do cadastro.
- Ao finalizar, o sistema pergunta **"Deseja imprimir o pedido?"** e imprime um
  **comprovante não fiscal de 76 mm**, no formato de impressora térmica.

## 🍳 Fila de pedidos

Todo pedido nasce em **Na fila** e caminha por **Em preparo** → **Pronto** →
**baixa em Entregue**. O quadro mostra o tempo de espera de cada comanda
(destacando as que passam de 15 minutos) e as baixas do dia.

**Cancelar um pedido devolve os insumos ao estoque.**

## 📦 Estoque por ficha técnica

Cada produto tem uma **ficha técnica**: quanto de cada insumo sai do estoque a
cada porção vendida. A disponibilidade de um item é o **gargalo** da sua ficha.

> Uma porção de batata frita usa **500 g**. Comprando **5 kg de batata**, o
> estoque passa a ter **10 porções** para venda. Vendidas 2 porções, saem 1 kg
> do saldo e restam 8 porções.

Vale para todo insumo comprado a peso (carne, frango, calabresa, bacon, açaí) e
também para os vendidos por unidade (latas, long necks, pães, discos de pastel).

A tela **Estoque** mostra saldo, mínimo, custo médio e valor em estoque de cada
insumo, mais um painel de **porções disponíveis por produto**, com custo, preço
e margem.

## 🛒 Compras → contas a pagar

Ao registrar uma compra, o sistema faz três coisas de uma vez:

1. **Entrada no estoque**, convertendo a unidade de compra para a unidade base
   do insumo (kg/g, L/ml, un).
2. **Recálculo do custo médio ponderado** do insumo — o que mantém o CMV e as
   margens dos produtos sempre atualizados.
3. **Geração das contas a pagar**, uma por parcela, com o **vencimento** e a
   **forma de pagamento** escolhidos na compra (as parcelas seguintes vencem
   mês a mês).

Antes de confirmar, a tela mostra o **reflexo no estoque**: ao lançar 5 kg de
batata, ela informa quantas porções de cada produto aquilo rende.

## 💸 Contas a pagar e despesas

Reúne as parcelas geradas pelas compras e as **despesas avulsas** — aluguel,
energia, água, gás, internet, salários, impostos, manutenção, marketing e
outros — com baixa de pagamento, reabertura, filtros (em aberto, vencidas,
pagas) e destaque para o que está atrasado.

## 📊 Financeiro

O período é apresentado em **dois regimes**, para não contar o mesmo dinheiro
duas vezes:

- **Competência** — vendas brutas − descontos = receita líquida; − custo dos
  insumos vendidos (CMV) = lucro bruto; − despesas operacionais = resultado.
- **Caixa** — entradas das vendas recebidas − contas efetivamente pagas no
  período = saldo de caixa (as vendas fiado aparecem à parte, como a receber).

Complementam a visão: receita por dia, receita por forma de pagamento, despesas
por categoria, itens mais vendidos, ticket médio, compras de insumos e o total
de contas em aberto e vencidas.

## 👥 Perfis de usuário

- **Administrador** — painel, produtos, estoque, compras, contas a pagar,
  financeiro e usuários.
- **Operador de PDV** — apenas a vitrine de vendas e a fila de pedidos.

Cada área tem tema e navegação próprios: o caixa é escuro e focado no toque; a
gestão é clara e densa em informação.

## 🖼️ Imagens dos produtos

Cada produto pode ter uma **foto** (URL cadastrada em *Produtos*). Sem foto, o
app desenha uma **ilustração vetorial** conforme o tipo do item (hambúrguer,
batata frita, cachorro-quente, pastel, pizza, refrigerante, suco, café,
cerveja, água, sorvete, bolo, combo, salgado) — a vitrine nunca fica sem
imagem, e o app não depende de arquivos externos.

## 🧱 Stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite 5](https://vitejs.dev/) — dev server e build
- CSS puro, com variáveis de tema e grid responsivo
- [Supabase](https://supabase.com/) — Postgres, Auth, Realtime e Edge Functions

## 🗂️ Estrutura

```
supabase/
├── migrations/          # tabelas, regras de negócio (funções) e permissões (RLS)
├── seed.sql             # cardápio, insumos e fichas técnicas de exemplo
├── functions/
│   └── manage-users/    # Edge Function: criar, editar e excluir usuários
└── config.toml          # configuração do Supabase local (CLI)

src/
├── App.tsx              # sessão, login, perfis e navegação entre as telas
├── supabase.ts          # cliente do Supabase e login por nome de usuário
├── db.ts                # consultas e conversão das linhas do banco
├── store.tsx            # estado global, tempo real e ações
├── types.ts             # modelo de domínio
├── format.ts            # moeda, datas e quantidades em pt-BR
├── app.css              # identidade visual (laranja/preto/branco) e impressão
├── components/
│   ├── FoodImage.tsx    # foto do produto ou ilustração por tipo
│   └── Receipt.tsx      # comprovante não fiscal (só aparece na impressão)
└── screens/
    ├── PdvScreen.tsx        # vitrine + carrinho + pagamento + impressão
    ├── QueueScreen.tsx      # fila de produção e baixa dos pedidos
    ├── DashboardScreen.tsx  # painel de abertura da gestão
    ├── ProductsScreen.tsx   # produtos e ficha técnica
    ├── StockScreen.tsx      # insumos e porções disponíveis
    ├── PurchasesScreen.tsx  # compras → estoque + contas a pagar
    ├── PayablesScreen.tsx   # contas a pagar e despesas
    ├── FinanceScreen.tsx    # receitas, despesas e resultado
    └── UsersScreen.tsx      # perfis Admin e PDV
```

## 💾 Dados

Tudo fica no Postgres do Supabase. As operações que mexem em várias tabelas
rodam como **funções do banco, numa transação só**:

| Função | O que faz |
| --- | --- |
| `place_order` | Grava o pedido com preço e custo do cadastro e baixa o estoque pela ficha técnica |
| `set_order_status` | Avança o pedido na fila e marca a hora da entrega |
| `cancel_order` | Cancela e devolve os insumos ao estoque (uma vez só) |
| `register_purchase` | Entrada no estoque, custo médio ponderado e contas a pagar por parcela |
| `add_expense` | Despesa avulsa parcelada mês a mês |
| `save_product` | Produto e ficha técnica gravados juntos |

Como a baixa de estoque trava as linhas dos insumos durante a venda, dois
caixas vendendo o mesmo item ao mesmo tempo nunca se atropelam. Os números de
pedido e de compra são sequenciais e gerados pelo banco.

O administrador carrega o histórico completo de pedidos (o financeiro filtra
qualquer período); o caixa carrega só os pedidos abertos e os das últimas 36
horas. Backups ficam por conta do Supabase (*Database → Backups*).
