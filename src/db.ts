// ---------------------------------------------------------------------------
// Leitura do banco: consultas ao Supabase e conversão das linhas (snake_case,
// colunas numéricas) para os tipos usados pelas telas.
// ---------------------------------------------------------------------------
import { supabase } from './supabase'
import type {
  Ingredient,
  Order,
  OrderItem,
  Payable,
  Product,
  Purchase,
  PurchaseLine,
  User,
} from './types'

/** O PostgREST devolve no máximo 1000 linhas por consulta; buscamos em páginas. */
const PAGE = 1000

async function fetchAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

const num = (v: unknown): number => (v == null ? 0 : Number(v))
const opt = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v)

// ------------------------------------------------------------------ linhas ---

interface IngredientRow {
  id: string
  name: string
  unit: Ingredient['unit']
  stock: number
  min_stock: number
  avg_cost: number
}

interface ProductRow {
  id: string
  name: string
  description: string
  category: Product['category']
  price: number
  kind: Product['kind']
  image: string | null
  active: boolean
  recipe_items: { ingredient_id: string; qty: number }[]
}

interface OrderItemRow {
  id: number
  product_id: string | null
  name: string
  qty: number
  unit_price: number
  unit_cost: number
  notes: string | null
}

interface OrderRow {
  id: string
  number: number
  created_at: string
  channel: Order['channel']
  customer: string | null
  table_label: string | null
  subtotal: number
  discount: number
  total: number
  payment: Order['payment']
  cash_received: number | null
  change: number | null
  status: Order['status']
  operator: string
  delivered_at: string | null
  canceled_at: string | null
  order_items: OrderItemRow[]
}

interface PurchaseLineRow {
  id: number
  ingredient_id: string | null
  name: string
  qty: number
  unit: PurchaseLine['unit']
  unit_cost: number
  base_qty: number
}

interface PurchaseRow {
  id: string
  number: number
  created_at: string
  supplier: string
  invoice: string | null
  total: number
  payment: Purchase['payment']
  due_date: string
  installments: number
  notes: string | null
  purchase_lines: PurchaseLineRow[]
}

interface PayableRow {
  id: string
  description: string
  supplier: string | null
  origin: Payable['origin']
  category: Payable['category']
  purchase_id: string | null
  amount: number
  due_date: string
  payment: Payable['payment']
  status: Payable['status']
  paid_at: string | null
  installment_n: number | null
  installment_of: number | null
  created_at: string
}

// -------------------------------------------------------------- conversão ---

function toIngredient(r: IngredientRow): Ingredient {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    stock: num(r.stock),
    minStock: num(r.min_stock),
    avgCost: num(r.avg_cost),
  }
}

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    price: num(r.price),
    kind: r.kind,
    image: opt(r.image),
    active: r.active,
    recipe: (r.recipe_items ?? []).map((i) => ({ ingredientId: i.ingredient_id, qty: num(i.qty) })),
  }
}

function toOrderItem(r: OrderItemRow): OrderItem {
  return {
    productId: r.product_id ?? '',
    name: r.name,
    qty: num(r.qty),
    unitPrice: num(r.unit_price),
    unitCost: num(r.unit_cost),
    notes: opt(r.notes),
  }
}

function toOrder(r: OrderRow): Order {
  return {
    id: r.id,
    number: num(r.number),
    createdAt: r.created_at,
    channel: r.channel,
    customer: opt(r.customer),
    table: opt(r.table_label),
    items: [...(r.order_items ?? [])].sort((a, b) => a.id - b.id).map(toOrderItem),
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    total: num(r.total),
    payment: r.payment,
    cashReceived: r.cash_received == null ? undefined : num(r.cash_received),
    change: r.change == null ? undefined : num(r.change),
    status: r.status,
    operator: r.operator,
    deliveredAt: opt(r.delivered_at),
    canceledAt: opt(r.canceled_at),
  }
}

function toPurchase(r: PurchaseRow): Purchase {
  return {
    id: r.id,
    number: num(r.number),
    createdAt: r.created_at,
    supplier: r.supplier,
    invoice: opt(r.invoice),
    lines: [...(r.purchase_lines ?? [])]
      .sort((a, b) => a.id - b.id)
      .map((l) => ({
        ingredientId: l.ingredient_id ?? '',
        name: l.name,
        qty: num(l.qty),
        unit: l.unit,
        unitCost: num(l.unit_cost),
        baseQty: num(l.base_qty),
      })),
    total: num(r.total),
    payment: r.payment,
    dueDate: r.due_date,
    installments: num(r.installments),
    notes: opt(r.notes),
  }
}

function toPayable(r: PayableRow): Payable {
  return {
    id: r.id,
    description: r.description,
    supplier: opt(r.supplier),
    origin: r.origin,
    category: r.category,
    purchaseId: opt(r.purchase_id),
    amount: num(r.amount),
    dueDate: r.due_date,
    payment: r.payment,
    status: r.status,
    paidAt: opt(r.paid_at),
    installment:
      r.installment_n != null && r.installment_of != null
        ? { n: r.installment_n, of: r.installment_of }
        : undefined,
    createdAt: r.created_at,
  }
}

// --------------------------------------------------------------- consultas ---

const ORDER_SELECT = '*, order_items(*)'
const PURCHASE_SELECT = '*, purchase_lines(*)'

export async function fetchIngredients(): Promise<Ingredient[]> {
  const rows = await fetchAll<IngredientRow>((a, b) =>
    supabase.from('ingredients').select('*').order('name').range(a, b),
  )
  return rows.map(toIngredient)
}

export async function fetchProducts(): Promise<Product[]> {
  const rows = await fetchAll<ProductRow>((a, b) =>
    supabase
      .from('products')
      .select('*, recipe_items(ingredient_id, qty)')
      .order('created_at')
      .order('id')
      .range(a, b),
  )
  return rows.map(toProduct)
}

/**
 * Pedidos, do mais recente para o mais antigo. O administrador recebe o
 * histórico inteiro (o financeiro filtra qualquer período); o caixa, só os
 * pedidos em aberto e os das últimas 36 horas — o que a fila precisa.
 */
export async function fetchOrders(fullHistory: boolean): Promise<Order[]> {
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString()
  const rows = await fetchAll<OrderRow>((a, b) => {
    let q = supabase.from('orders').select(ORDER_SELECT)
    if (!fullHistory) q = q.or(`created_at.gte.${since},status.in.(fila,preparo,pronto)`)
    return q.order('created_at', { ascending: false }).order('id').range(a, b)
  })
  return rows.map(toOrder)
}

export async function fetchOrder(id: string): Promise<Order> {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single()
  if (error) throw error
  return toOrder(data as OrderRow)
}

export async function fetchPurchases(): Promise<Purchase[]> {
  const rows = await fetchAll<PurchaseRow>((a, b) =>
    supabase
      .from('purchases')
      .select(PURCHASE_SELECT)
      .order('created_at', { ascending: false })
      .order('id')
      .range(a, b),
  )
  return rows.map(toPurchase)
}

export async function fetchPurchase(id: string): Promise<Purchase> {
  const { data, error } = await supabase.from('purchases').select(PURCHASE_SELECT).eq('id', id).single()
  if (error) throw error
  return toPurchase(data as PurchaseRow)
}

export async function fetchPayables(): Promise<Payable[]> {
  const rows = await fetchAll<PayableRow>((a, b) =>
    supabase
      .from('payables')
      .select('*')
      .order('created_at', { ascending: false })
      .order('due_date')
      .order('id')
      .range(a, b),
  )
  return rows.map(toPayable)
}

export async function fetchPayablesOfPurchase(purchaseId: string): Promise<Payable[]> {
  const { data, error } = await supabase
    .from('payables')
    .select('*')
    .eq('purchase_id', purchaseId)
    .order('due_date')
  if (error) throw error
  return (data as PayableRow[]).map(toPayable)
}

export async function fetchUsers(): Promise<User[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, role, active')
    .order('name')
  if (error) throw error
  return data as User[]
}

export async function fetchProfile(id: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, username, role, active')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as User | null) ?? null
}
