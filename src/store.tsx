// ---------------------------------------------------------------------------
// Estado global da Lanchonete Martinica.
//
// Os dados vivem no Supabase. Este provider carrega o que o perfil logado pode
// ver, mantém tudo sincronizado em tempo real entre caixas e gestão, e expõe
// as ações. As regras que mexem em várias tabelas (venda, cancelamento,
// compra, despesa, ficha técnica) rodam no banco, em uma transação só — veja
// `supabase/migrations`.
// ---------------------------------------------------------------------------
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchIngredients,
  fetchOrder,
  fetchOrders,
  fetchPayables,
  fetchPayablesOfPurchase,
  fetchProducts,
  fetchPurchase,
  fetchPurchases,
  fetchUsers,
} from './db'
import { errorMessage, supabase } from './supabase'
import {
  PURCHASE_UNIT_FACTOR,
  type AppState,
  type Ingredient,
  type Order,
  type OrderStatus,
  type Payable,
  type Product,
  type Purchase,
  type PurchaseLine,
  type Role,
  type User,
} from './types'

/** Rascunho de despesa avulsa (vira conta a pagar). */
export interface Expense {
  description: string
  supplier?: string
  category: Payable['category']
  amount: number
  dueDate: string
  payment: Payable['payment']
  installments: number
  paid: boolean
}

/** Cadastro ou edição de usuário. Senha vazia na edição mantém a atual. */
export interface UserDraft {
  id?: string
  name: string
  username: string
  password: string
  role: Role
  active: boolean
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/** Soma o custo dos insumos da ficha técnica de um produto. */
export function productCost(product: Product, ingredients: Ingredient[]): number {
  return product.recipe.reduce((sum, line) => {
    const ing = ingredients.find((i) => i.id === line.ingredientId)
    return sum + (ing ? ing.avgCost * line.qty : 0)
  }, 0)
}

/**
 * Quantas porções do produto o estoque atual permite vender.
 *
 * É o gargalo da ficha técnica: se uma porção de batata usa 500 g e há 5 kg em
 * estoque, saem 10 porções. Retorna `null` quando o produto não tem ficha
 * técnica (não consome estoque).
 */
export function productAvailability(
  product: Product,
  ingredients: Ingredient[],
): number | null {
  if (product.recipe.length === 0) return null
  let min = Infinity
  for (const line of product.recipe) {
    const ing = ingredients.find((i) => i.id === line.ingredientId)
    if (!ing || line.qty <= 0) continue
    min = Math.min(min, Math.floor(ing.stock / line.qty))
  }
  return Number.isFinite(min) ? Math.max(0, min) : null
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Soma `months` meses a uma data ISO (YYYY-MM-DD), parando no fim do mês. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const first = new Date(y, (m ?? 1) - 1 + months, 1)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const date = new Date(first.getFullYear(), first.getMonth(), Math.min(d ?? 1, lastDay))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** Divide um valor em N parcelas, jogando a diferença de centavos na última. */
export function splitInstallments(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n))
  const base = Math.floor((total * 100) / count) / 100
  const parts = Array.from({ length: count }, () => base)
  parts[count - 1] = round2(total - base * (count - 1))
  return parts
}

export interface OrderDraft {
  channel: Order['channel']
  customer?: string
  table?: string
  /** Preço e custo são recalculados no banco a partir do cadastro. */
  items: Pick<Order['items'][number], 'productId' | 'qty' | 'notes'>[]
  discount: number
  payment: Order['payment']
  cashReceived?: number
}

export interface PurchaseDraft {
  supplier: string
  invoice?: string
  lines: PurchaseLine[]
  payment: Purchase['payment']
  dueDate: string
  installments: number
  notes?: string
}

/** Fatias do estado que podem ser recarregadas do banco. */
type Resource = 'ingredients' | 'products' | 'orders' | 'purchases' | 'payables' | 'users'

/** Tabela alterada (tempo real) → fatia a recarregar. */
const TABLE_RESOURCE: Record<string, Resource> = {
  ingredients: 'ingredients',
  products: 'products',
  recipe_items: 'products',
  orders: 'orders',
  order_items: 'orders',
  purchases: 'purchases',
  purchase_lines: 'purchases',
  payables: 'payables',
  profiles: 'users',
}

interface StoreValue extends AppState {
  /** Primeira carga concluída. */
  ready: boolean
  /** Último erro de uma ação (mostrado num aviso na tela). */
  error: string | null
  dismissError: () => void
  /** Registra a venda, baixa o estoque e coloca o pedido na fila. */
  placeOrder: (draft: OrderDraft) => Promise<Order | null>
  setOrderStatus: (id: string, status: OrderStatus) => Promise<boolean>
  cancelOrder: (id: string) => Promise<boolean>
  /** Entrada de mercadoria: soma estoque, recalcula custo médio e gera contas. */
  registerPurchase: (
    draft: PurchaseDraft,
  ) => Promise<{ purchase: Purchase; payables: Payable[] } | null>
  addExpense: (draft: Expense) => Promise<boolean>
  payPayable: (id: string, date?: string) => Promise<boolean>
  reopenPayable: (id: string) => Promise<boolean>
  removePayable: (id: string) => Promise<boolean>
  saveProduct: (product: Product) => Promise<boolean>
  removeProduct: (id: string) => Promise<boolean>
  saveIngredient: (ingredient: Ingredient) => Promise<boolean>
  removeIngredient: (id: string) => Promise<boolean>
  adjustStock: (id: string, newStock: number) => Promise<boolean>
  saveUser: (user: UserDraft) => Promise<boolean>
  removeUser: (id: string) => Promise<boolean>
}

const EMPTY: AppState = {
  ingredients: [],
  products: [],
  orders: [],
  purchases: [],
  payables: [],
  users: [],
}

const StoreContext = createContext<StoreValue | null>(null)

/** Lança o erro de uma resposta do Supabase, se houver. */
function check<T extends { error: unknown }>(res: T): T {
  if (res.error) throw res.error
  return res
}

export function LanchoneteStoreProvider({
  user,
  children,
}: {
  /** Perfil logado — define o que é carregado. */
  user: User
  children: ReactNode
}) {
  const isAdmin = user.role === 'admin'
  const [state, setState] = useState<AppState>(EMPTY)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ref = useRef(state)
  ref.current = state

  const loaders = useMemo<Record<Resource, () => Promise<Partial<AppState>>>>(
    () => ({
      ingredients: async () => ({ ingredients: await fetchIngredients() }),
      products: async () => ({ products: await fetchProducts() }),
      orders: async () => ({ orders: await fetchOrders(isAdmin) }),
      purchases: async () => ({ purchases: isAdmin ? await fetchPurchases() : [] }),
      payables: async () => ({ payables: isAdmin ? await fetchPayables() : [] }),
      users: async () => ({ users: isAdmin ? await fetchUsers() : [user] }),
    }),
    [isAdmin, user],
  )

  const reload = useCallback(
    async (...resources: Resource[]) => {
      try {
        const parts = await Promise.all([...new Set(resources)].map((r) => loaders[r]()))
        setState((prev) => Object.assign({ ...prev }, ...parts))
      } catch (e) {
        setError(errorMessage(e))
      }
    },
    [loaders],
  )

  // Carga inicial + assinatura de tempo real. Mudanças feitas em outro caixa
  // chegam aqui e recarregam só a fatia afetada (agrupadas em 300 ms).
  useEffect(() => {
    let alive = true
    let loaded = false
    const pending = new Set<Resource>()
    let timer: ReturnType<typeof setTimeout> | undefined

    const flush = () => {
      const list = [...pending]
      pending.clear()
      if (alive && list.length > 0) void reload(...list)
    }

    const channel = supabase
      .channel('lanchonete-martinica')
      .on('postgres_changes', { event: '*', schema: 'public' }, (payload) => {
        const resource = TABLE_RESOURCE[payload.table]
        if (!resource) return
        pending.add(resource)
        clearTimeout(timer)
        timer = setTimeout(flush, 300)
      })
      .subscribe((status) => {
        // Ao reconectar, recarrega tudo para não perder o que mudou no meio.
        if (status === 'SUBSCRIBED' && alive && loaded) {
          void reload(...(Object.keys(loaders) as Resource[]))
        }
      })

    void reload(...(Object.keys(loaders) as Resource[])).finally(() => {
      loaded = true
      if (alive) setReady(true)
    })

    return () => {
      alive = false
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [loaders, reload])

  /** Executa uma ação; em caso de erro, mostra o aviso e devolve `null`. */
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      setError(null)
      return await fn()
    } catch (e) {
      setError(errorMessage(e))
      return null
    }
  }, [])

  /** Variante para ações sem retorno: `true` quando deu certo. */
  const act = useCallback(
    async (fn: () => Promise<unknown>, ...after: Resource[]) => {
      const ok = (await run(async () => (await fn(), true))) ?? false
      if (ok && after.length > 0) await reload(...after)
      return ok
    },
    [run, reload],
  )

  const placeOrder = useCallback(
    (draft: OrderDraft) =>
      run(async () => {
        const { data: id } = check(
          await supabase.rpc('place_order', {
            draft: {
              channel: draft.channel,
              customer: draft.customer ?? null,
              table: draft.table ?? null,
              discount: round2(Math.max(0, draft.discount)),
              payment: draft.payment,
              cashReceived: draft.payment === 'dinheiro' ? draft.cashReceived ?? null : null,
              items: draft.items.map((i) => ({
                productId: i.productId,
                qty: i.qty,
                notes: i.notes ?? null,
              })),
            },
          }),
        )
        const order = await fetchOrder(id as string)
        void reload('orders', 'ingredients')
        return order
      }),
    [run, reload],
  )

  const setOrderStatus = useCallback(
    (id: string, status: OrderStatus) =>
      act(
        async () => check(await supabase.rpc('set_order_status', { p_order_id: id, p_status: status })),
        'orders',
      ),
    [act],
  )

  const cancelOrder = useCallback(
    (id: string) =>
      act(
        async () => check(await supabase.rpc('cancel_order', { p_order_id: id })),
        'orders',
        'ingredients',
      ),
    [act],
  )

  const registerPurchase = useCallback(
    (draft: PurchaseDraft) =>
      run(async () => {
        const { data: id } = check(
          await supabase.rpc('register_purchase', {
            draft: {
              supplier: draft.supplier,
              invoice: draft.invoice ?? null,
              payment: draft.payment,
              dueDate: draft.dueDate,
              installments: draft.installments,
              notes: draft.notes ?? null,
              lines: draft.lines.map((l) => ({
                ingredientId: l.ingredientId,
                qty: l.qty,
                unit: l.unit,
                unitCost: l.unitCost,
              })),
            },
          }),
        )
        const [purchase, payables] = await Promise.all([
          fetchPurchase(id as string),
          fetchPayablesOfPurchase(id as string),
        ])
        void reload('purchases', 'payables', 'ingredients')
        return { purchase, payables }
      }),
    [run, reload],
  )

  const addExpense = useCallback(
    (draft: Expense) =>
      act(
        async () =>
          check(
            await supabase.rpc('add_expense', {
              draft: { ...draft, amount: round2(draft.amount), supplier: draft.supplier ?? null },
            }),
          ),
        'payables',
      ),
    [act],
  )

  const payPayable = useCallback(
    (id: string, date?: string) =>
      act(
        async () =>
          check(
            await supabase
              .from('payables')
              .update({ status: 'pago', paid_at: date ?? new Date().toISOString().slice(0, 10) })
              .eq('id', id),
          ),
        'payables',
      ),
    [act],
  )

  const reopenPayable = useCallback(
    (id: string) =>
      act(
        async () =>
          check(await supabase.from('payables').update({ status: 'aberto', paid_at: null }).eq('id', id)),
        'payables',
      ),
    [act],
  )

  const removePayable = useCallback(
    (id: string) =>
      act(async () => check(await supabase.from('payables').delete().eq('id', id)), 'payables'),
    [act],
  )

  const saveProduct = useCallback(
    (product: Product) =>
      act(
        async () =>
          check(
            await supabase.rpc('save_product', {
              p: { ...product, image: product.image ?? null },
            }),
          ),
        'products',
      ),
    [act],
  )

  const removeProduct = useCallback(
    (id: string) =>
      act(async () => check(await supabase.from('products').delete().eq('id', id)), 'products'),
    [act],
  )

  const saveIngredient = useCallback(
    (ingredient: Ingredient) =>
      act(async () => {
        const current = ref.current.ingredients.find((i) => i.id === ingredient.id)
        const row = {
          id: ingredient.id,
          name: ingredient.name,
          unit: ingredient.unit,
          min_stock: ingredient.minStock,
          avg_cost: ingredient.avgCost,
          stock: round3(Math.max(0, ingredient.stock)),
        }
        if (!current) {
          check(await supabase.from('ingredients').insert(row))
          return
        }
        // Só regrava o saldo se ele foi mesmo editado: assim uma venda feita
        // enquanto o formulário estava aberto não é desfeita.
        const { stock, ...rest } = row
        const patch = stock === current.stock ? rest : row
        check(await supabase.from('ingredients').update(patch).eq('id', ingredient.id))
      }, 'ingredients'),
    [act],
  )

  const removeIngredient = useCallback(
    (id: string) =>
      act(
        async () => check(await supabase.from('ingredients').delete().eq('id', id)),
        'ingredients',
        'products',
      ),
    [act],
  )

  const adjustStock = useCallback(
    (id: string, newStock: number) =>
      act(
        async () =>
          check(
            await supabase
              .from('ingredients')
              .update({ stock: round3(Math.max(0, newStock)) })
              .eq('id', id),
          ),
        'ingredients',
      ),
    [act],
  )

  const saveUser = useCallback(
    (draft: UserDraft) =>
      act(async () => {
        const { data, error } = await supabase.functions.invoke('manage-users', {
          body: { action: draft.id ? 'update' : 'create', ...draft },
        })
        if (error) throw new Error(await functionError(error))
        if (data?.error) throw new Error(data.error)
      }, 'users'),
    [act],
  )

  const removeUser = useCallback(
    (id: string) =>
      act(async () => {
        const { data, error } = await supabase.functions.invoke('manage-users', {
          body: { action: 'delete', id },
        })
        if (error) throw new Error(await functionError(error))
        if (data?.error) throw new Error(data.error)
      }, 'users'),
    [act],
  )

  const value = useMemo<StoreValue>(
    () => ({
      ...state,
      ready,
      error,
      dismissError: () => setError(null),
      placeOrder,
      setOrderStatus,
      cancelOrder,
      registerPurchase,
      addExpense,
      payPayable,
      reopenPayable,
      removePayable,
      saveProduct,
      removeProduct,
      saveIngredient,
      removeIngredient,
      adjustStock,
      saveUser,
      removeUser,
    }),
    [
      state,
      ready,
      error,
      placeOrder,
      setOrderStatus,
      cancelOrder,
      registerPurchase,
      addExpense,
      payPayable,
      reopenPayable,
      removePayable,
      saveProduct,
      removeProduct,
      saveIngredient,
      removeIngredient,
      adjustStock,
      saveUser,
      removeUser,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

/** Extrai a mensagem que a Edge Function devolveu junto com o status de erro. */
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (body?.error) return String(body.error)
    } catch {
      // corpo não é JSON — cai na mensagem genérica
    }
  }
  return errorMessage(error)
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore precisa estar dentro de <LanchoneteStoreProvider>')
  return ctx
}

export { PURCHASE_UNIT_FACTOR }
