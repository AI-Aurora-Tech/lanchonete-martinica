import { useState } from 'react'
import { FoodImage } from '../components/FoodImage'
import { money, qty as fmtQty } from '../format'
import { parseNumber } from './PdvScreen'
import { productAvailability, productCost, uid, useStore } from '../store'
import {
  CATEGORY_LABEL,
  FOOD_KIND_LABEL,
  type FoodKind,
  type Product,
  type Ingredient,
  type ProductCategory,
  type RecipeItem,
} from '../types'

/**
 * Linha da ficha técnica enquanto é editada. A quantidade fica como texto
 * (para aceitar "0," e "0,18" durante a digitação) e, nos insumos a peso ou
 * volume, pode ser informada em g/ml (`small`) — o estoque segue em kg/L.
 */
interface RecipeLine {
  ingredientId: string
  text: string
  small: boolean
}

/** Rótulos da unidade de digitação: [unidade do estoque, unidade menor]. */
const UNIT_INPUT: Record<Ingredient['unit'], [string, string | null]> = {
  kg: ['kg', 'g'],
  l: ['L', 'ml'],
  un: ['un', null],
}

function numberText(n: number): string {
  return String(Number(n.toFixed(3))).replace('.', ',')
}

function toLine(item: RecipeItem, ingredients: Ingredient[]): RecipeLine {
  const ing = ingredients.find((i) => i.id === item.ingredientId)
  const small = !!ing && ing.unit !== 'un' && item.qty > 0 && item.qty < 1
  return {
    ingredientId: item.ingredientId,
    text: item.qty > 0 ? numberText(small ? item.qty * 1000 : item.qty) : '',
    small,
  }
}

/** Quantidade na unidade base do insumo (kg, L ou un). */
function lineQty(line: RecipeLine, ingredients: Ingredient[]): number {
  const value = parseNumber(line.text)
  const ing = ingredients.find((i) => i.id === line.ingredientId)
  return line.small && ing && ing.unit !== 'un' ? value / 1000 : value
}

function blankProduct(): Product {
  return {
    id: uid('prod'),
    name: '',
    description: '',
    category: 'lanches',
    price: 0,
    kind: 'burger',
    active: true,
    recipe: [],
  }
}

/** Cadastro dos itens de venda e da ficha técnica que liga cada um ao estoque. */
export function ProductsScreen() {
  const { products, ingredients, saveProduct, removeProduct } = useStore()
  const [editing, setEditing] = useState<Product | null>(null)

  return (
    <div className="lm-stack">
      <section className="lm-panel">
        <header className="lm-panel__head">
          <h2>Produtos de venda</h2>
          <button
            type="button"
            className="lm-btn lm-btn--primary lm-btn--sm"
            onClick={() => setEditing(blankProduct())}
          >
            + Novo produto
          </button>
        </header>
        <div className="lm-tableWrap">
          <table className="lm-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Categoria</th>
                <th>Preço</th>
                <th>Custo</th>
                <th>Margem</th>
                <th>Disponível</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cost = productCost(p, ingredients)
                const portions = productAvailability(p, ingredients)
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="lm-productCell">
                        <span className="lm-thumb">
                          <FoodImage kind={p.kind} image={p.image} alt={p.name} />
                        </span>
                        <span>
                          {p.name}
                          <span className="lm-sub">{p.description}</span>
                        </span>
                      </div>
                    </td>
                    <td>{CATEGORY_LABEL[p.category]}</td>
                    <td>{money(p.price)}</td>
                    <td>{money(cost)}</td>
                    <td>
                      {p.price > 0 ? `${Math.round(((p.price - cost) / p.price) * 100)}%` : '—'}
                    </td>
                    <td>{portions == null ? 'Sob demanda' : `${portions}`}</td>
                    <td>
                      <span className={`lm-tag lm-tag--${p.active ? 'entregue' : 'cancelado'}`}>
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="lm-actions">
                      <button
                        type="button"
                        className="lm-btn lm-btn--ghost lm-btn--sm"
                        onClick={() => setEditing({ ...p, recipe: p.recipe.map((r) => ({ ...r })) })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="lm-btn lm-btn--danger lm-btn--sm"
                        onClick={() => {
                          if (confirm(`Excluir o produto "${p.name}"?`)) void removeProduct(p.id)
                        }}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <ProductDialog
          product={editing}
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            if (await saveProduct(p)) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ProductDialog({
  product,
  onSave,
  onCancel,
}: {
  product: Product
  onSave: (p: Product) => void
  onCancel: () => void
}) {
  const { ingredients } = useStore()
  const [draft, setDraft] = useState<Product>(product)
  const [price, setPrice] = useState(
    product.price > 0 ? product.price.toFixed(2).replace('.', ',') : '',
  )
  const [error, setError] = useState('')
  const [lines, setLines] = useState<RecipeLine[]>(() =>
    product.recipe.map((r) => toLine(r, ingredients)),
  )

  function patch(p: Partial<Product>) {
    setDraft((prev) => ({ ...prev, ...p }))
  }

  function updateLine(index: number, change: Partial<RecipeLine>) {
    setLines((prev) => prev.map((l, j) => (j === index ? { ...l, ...change } : l)))
  }

  const recipe: RecipeItem[] = lines.map((l) => ({
    ingredientId: l.ingredientId,
    qty: lineQty(l, ingredients),
  }))
  const cost = productCost({ ...draft, recipe }, ingredients)

  return (
    <div className="lm-modal" role="dialog" aria-modal="true" aria-label="Produto">
      <div className="lm-modal__box lm-modal__box--wide">
        <h2>{product.name ? 'Editar produto' : 'Novo produto'}</h2>

        <div className="lm-productEdit">
          <div className="lm-productEdit__preview">
            <span className="lm-thumb lm-thumb--lg">
              <FoodImage kind={draft.kind} image={draft.image} alt={draft.name} />
            </span>
            <span className="lm-productEdit__price">{money(parseNumber(price))}</span>
          </div>

          <div className="lm-form lm-form--2">
            <label className="lm-span2">
              Nome
              <input
                className="lm-input"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label className="lm-span2">
              Descrição
              <input
                className="lm-input"
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <label>
              Categoria
              <select
                className="lm-input"
                value={draft.category}
                onChange={(e) => patch({ category: e.target.value as ProductCategory })}
              >
                {(Object.keys(CATEGORY_LABEL) as ProductCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Preço de venda (R$)
              <input
                className="lm-input"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
            <label>
              Ilustração
              <select
                className="lm-input"
                value={draft.kind}
                onChange={(e) => patch({ kind: e.target.value as FoodKind })}
              >
                {(Object.keys(FOOD_KIND_LABEL) as FoodKind[]).map((k) => (
                  <option key={k} value={k}>
                    {FOOD_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Foto (URL) — opcional
              <input
                className="lm-input"
                value={draft.image ?? ''}
                onChange={(e) => patch({ image: e.target.value.trim() || undefined })}
                placeholder="https://…"
              />
            </label>
            <label className="lm-check lm-span2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => patch({ active: e.target.checked })}
              />
              Item ativo (aparece na vitrine do PDV)
            </label>
          </div>
        </div>

        <section className="lm-recipe">
          <header>
            <h3>Ficha técnica</h3>
            <span>Quanto de cada insumo sai do estoque a cada porção vendida</span>
          </header>
          {lines.length === 0 && (
            <p className="lm-empty">
              Sem ficha técnica: o item não baixa estoque e aparece como “sob demanda”.
            </p>
          )}
          <ul>
            {lines.map((line, i) => {
              const ing = ingredients.find((x) => x.id === line.ingredientId)
              const [bigUnit, smallUnit] = ing ? UNIT_INPUT[ing.unit] : ['—', null]
              const qtyBase = recipe[i].qty
              return (
                <li key={i}>
                  <select
                    className="lm-input"
                    value={line.ingredientId}
                    onChange={(e) => {
                      const next = ingredients.find((x) => x.id === e.target.value)
                      updateLine(i, {
                        ingredientId: e.target.value,
                        // Insumo por unidade não tem g/ml.
                        small: next?.unit === 'un' ? false : line.small,
                      })
                    }}
                    aria-label="Insumo"
                  >
                    <option value="">Selecione…</option>
                    {ingredients.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    className="lm-input lm-input--small"
                    inputMode="decimal"
                    value={line.text}
                    placeholder={line.small ? 'ex.: 180' : 'ex.: 0,18'}
                    onChange={(e) => updateLine(i, { text: e.target.value })}
                    aria-label="Quantidade por porção"
                  />
                  {smallUnit ? (
                    <select
                      className="lm-input lm-input--small"
                      value={line.small ? 'small' : 'big'}
                      onChange={(e) => {
                        const small = e.target.value === 'small'
                        if (small === line.small) return
                        // Mantém a mesma quantidade ao trocar de unidade.
                        const value = parseNumber(line.text)
                        updateLine(i, {
                          small,
                          text: line.text === '' ? '' : numberText(small ? value * 1000 : value / 1000),
                        })
                      }}
                      aria-label="Unidade da quantidade"
                    >
                      <option value="small">{smallUnit}</option>
                      <option value="big">{bigUnit}</option>
                    </select>
                  ) : (
                    <span className="lm-recipe__unit">{bigUnit}</span>
                  )}
                  <span className="lm-recipe__cost">
                    {ing ? money(ing.avgCost * qtyBase) : money(0)}
                    {ing && line.small && qtyBase > 0 && (
                      <em className="lm-recipe__base">
                        = {fmtQty(qtyBase)} {bigUnit}
                      </em>
                    )}
                  </span>
                  <button
                    type="button"
                    className="lm-btn lm-btn--ghost lm-btn--sm"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            className="lm-btn lm-btn--ghost lm-btn--sm"
            onClick={() => setLines([...lines, { ingredientId: '', text: '', small: true }])}
          >
            + Adicionar insumo
          </button>
          <p className="lm-note">
            Custo da ficha: <strong>{money(cost)}</strong>
            {parseNumber(price) > 0 && (
              <>
                {' '}
                · margem{' '}
                <strong>
                  {Math.round(((parseNumber(price) - cost) / parseNumber(price)) * 100)}%
                </strong>
              </>
            )}
          </p>
          <p className="lm-note lm-note--muted">
            Exemplo: uma porção de batata usa <strong>500 g</strong> (ou{' '}
            <strong>0,5 kg</strong>). Com <strong>{fmtQty(5)} kg</strong> comprados, o estoque
            passa a ter <strong>10 porções</strong> para venda.
          </p>
        </section>

        {error && <p className="lm-alert">{error}</p>}
        <div className="lm-modal__actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            onClick={() => {
              if (!draft.name.trim()) {
                setError('Informe o nome do produto.')
                return
              }
              if (parseNumber(price) <= 0) {
                setError('Informe um preço de venda maior que zero.')
                return
              }
              const invalid = lines.findIndex(
                (l, i) => l.ingredientId && l.text.trim() !== '' && !(recipe[i].qty > 0),
              )
              if (invalid >= 0) {
                setError(`Quantidade inválida na linha ${invalid + 1} da ficha técnica.`)
                return
              }
              onSave({
                ...draft,
                name: draft.name.trim(),
                price: parseNumber(price),
                recipe: recipe.filter((r) => r.ingredientId && r.qty > 0),
              })
            }}
          >
            Salvar produto
          </button>
        </div>
      </div>
    </div>
  )
}
