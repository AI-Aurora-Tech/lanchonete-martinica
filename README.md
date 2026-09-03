# Lanchonete Martinica 🍔🧡

Sistema de gestão de lanchonete: **PDV**, **fila de pedidos**, **estoque por
ficha técnica**, **compras**, **contas a pagar** e **financeiro** — em um app
web único, com identidade visual em **laranja, preto e branco**.

Roda sem banco de dados e sem servidor de aplicação: todo o estado (produtos,
insumos, pedidos, compras, contas e usuários) é guardado no `localStorage` do
navegador.

> Projeto de demonstração. A lanchonete, os produtos e os fornecedores são
> fictícios.

## 🌐 Onde acessar

A aplicação é publicada na **Vercel**: cada push na `main` atualiza a produção e
cada pull request ganha uma URL de preview própria.

Não há nada a configurar no repositório — a Vercel detecta o Vite sozinho
(`npm run build` → `dist/`) e o app vive na raiz do domínio. O `base: './'` do
Vite deixa o mesmo build funcionar tanto na raiz quanto num subcaminho.

## 🚀 Rodando localmente

```bash
npm install
npm run dev      # http://localhost:5173
```

Outros comandos:

```bash
npm run build             # build de produção em dist/
npm run build:standalone  # HTML único autocontido em dist-standalone/index.html
npm run preview           # serve o build de produção
npm run lint              # typecheck (tsc --noEmit)
```

O `build:standalone` gera **um arquivo HTML** com CSS e JS embutidos: dá para
copiar `dist-standalone/index.html` num pen drive e abrir com dois cliques no
computador do balcão, sem instalar nada.

## 🔑 Acessos de demonstração

| Perfil | Usuário | Senha | O que enxerga |
| --- | --- | --- | --- |
| Administrador | `admin` | `martinica` | Tudo: painel, produtos, estoque, compras, contas a pagar, financeiro e usuários |
| Operador de PDV | `caixa` | `1234` | Apenas a vitrine de vendas e a fila de pedidos |

O cadastro de usuários é editável em **Usuários** (pelo Admin).

> ⚠️ A autenticação é local e de demonstração: usuários e senhas ficam em texto
> puro no `localStorage` do navegador. Não use como está para controle de
> acesso real.

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
- Persistência em `localStorage` — sem backend

## 🗂️ Estrutura

```
src/
├── App.tsx              # login, perfis e navegação entre as telas
├── store.tsx            # estado global + regras de negócio + persistência
├── seed.ts              # cardápio, insumos e usuários iniciais
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

Tudo fica no `localStorage` do navegador, sob a chave
`lanchonete-martinica:v1`. Isso significa que:

- os dados são **por navegador e por máquina** — não sincronizam entre caixas;
- limpar os dados do site apaga o histórico;
- em **Usuários → Dados do sistema** há o botão **Restaurar dados de
  demonstração**, que zera pedidos, compras e contas e devolve o cadastro
  inicial.

Para operar com vários caixas ao mesmo tempo, o passo natural é trocar a
camada de persistência de `src/store.tsx` por um backend (Postgres/Supabase,
por exemplo), mantendo a mesma interface de ações.
