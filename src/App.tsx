import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { fetchProfile } from './db'
import { LanchoneteStoreProvider, useStore } from './store'
import { errorMessage, isSupabaseConfigured, supabase, usernameToEmail } from './supabase'
import { DashboardScreen } from './screens/DashboardScreen'
import { FinanceScreen } from './screens/FinanceScreen'
import { PayablesScreen } from './screens/PayablesScreen'
import { PdvScreen } from './screens/PdvScreen'
import { ProductsScreen } from './screens/ProductsScreen'
import { PurchasesScreen } from './screens/PurchasesScreen'
import { QueueScreen } from './screens/QueueScreen'
import { StockScreen } from './screens/StockScreen'
import { UsersScreen } from './screens/UsersScreen'
import { ROLE_LABEL, type Role, type User } from './types'
import './app.css'

type TabId =
  | 'pdv'
  | 'fila'
  | 'painel'
  | 'produtos'
  | 'estoque'
  | 'compras'
  | 'contas'
  | 'financeiro'
  | 'usuarios'

interface Tab {
  id: TabId
  label: string
  /** Perfis que enxergam a aba. */
  roles: Role[]
  /** Abas de operação (PDV) usam o tema escuro de caixa. */
  area: 'operacao' | 'gestao'
}

const TABS: Tab[] = [
  { id: 'pdv', label: 'PDV · Vender', roles: ['admin', 'pdv'], area: 'operacao' },
  { id: 'fila', label: 'Fila de pedidos', roles: ['admin', 'pdv'], area: 'operacao' },
  { id: 'painel', label: 'Painel', roles: ['admin'], area: 'gestao' },
  { id: 'produtos', label: 'Produtos', roles: ['admin'], area: 'gestao' },
  { id: 'estoque', label: 'Estoque', roles: ['admin'], area: 'gestao' },
  { id: 'compras', label: 'Compras', roles: ['admin'], area: 'gestao' },
  { id: 'contas', label: 'Contas a pagar', roles: ['admin'], area: 'gestao' },
  { id: 'financeiro', label: 'Financeiro', roles: ['admin'], area: 'gestao' },
  { id: 'usuarios', label: 'Usuários', roles: ['admin'], area: 'gestao' },
]

/** Raiz do app — confere a configuração e a sessão antes de abrir as telas. */
export default function App() {
  useEffect(() => {
    document.title = 'Lanchonete Martinica'
  }, [])

  if (!isSupabaseConfigured) return <MissingConfig />
  return <AuthGate />
}

/**
 * Sessão do Supabase Auth + perfil do usuário. Sem sessão (ou com perfil
 * inativo) mostra o login; com sessão, carrega os dados e abre o app.
 */
function AuthGate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [user, setUser] = useState<User | null>(null)
  const [loginError, setLoginError] = useState('')

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) {
      setUser(null)
      return
    }
    let alive = true
    fetchProfile(userId)
      .then((profile) => {
        if (!alive) return
        if (!profile || !profile.active) {
          setLoginError(
            profile ? 'Este usuário está inativo. Fale com o administrador.' : 'Usuário sem perfil de acesso.',
          )
          void supabase.auth.signOut()
          return
        }
        setUser((prev) =>
          prev && prev.id === profile.id && prev.role === profile.role && prev.name === profile.name
            ? prev
            : profile,
        )
      })
      .catch((e) => {
        if (!alive) return
        setLoginError(errorMessage(e))
        void supabase.auth.signOut()
      })
    return () => {
      alive = false
    }
  }, [userId])

  const logout = useCallback(() => {
    setLoginError('')
    void supabase.auth.signOut()
  }, [])

  if (session === undefined || (session && !user && !loginError)) return <Loading />
  if (!session || !user) return <Login initialError={loginError} onAttempt={() => setLoginError('')} />

  return (
    <LanchoneteStoreProvider key={user.id} user={user}>
      <Shell user={user} onLogout={logout} />
    </LanchoneteStoreProvider>
  )
}

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { orders, ingredients, ready, error, dismissError } = useStore()

  const tabs = useMemo(() => TABS.filter((t) => t.roles.includes(user.role)), [user])
  const [tab, setTab] = useState<TabId>(user.role === 'admin' ? 'painel' : 'pdv')

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) {
      setTab(user.role === 'admin' ? 'painel' : 'pdv')
    }
  }, [user, tabs, tab])

  if (!ready) return <Loading />

  const area = TABS.find((t) => t.id === tab)?.area ?? 'gestao'
  const queueCount = orders.filter(
    (o) => o.status === 'fila' || o.status === 'preparo' || o.status === 'pronto',
  ).length
  const lowStock = ingredients.filter((i) => i.stock <= i.minStock).length

  return (
    <div className={`lm-app lm-app--${area}`}>
      <header className="lm-header">
        <div className="lm-header__brand">
          <Logo />
          <div>
            <strong>Lanchonete Martinica</strong>
            <span>{area === 'operacao' ? 'Frente de caixa' : 'Gestão'}</span>
          </div>
        </div>

        <nav className="lm-nav" aria-label="Seções">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`lm-nav__item${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
            >
              {t.label}
              {t.id === 'fila' && queueCount > 0 && <span className="lm-dot">{queueCount}</span>}
              {t.id === 'estoque' && lowStock > 0 && <span className="lm-dot is-warn">{lowStock}</span>}
            </button>
          ))}
        </nav>

        <div className="lm-header__user">
          <span>
            <strong>{user.name}</strong>
            <em>{ROLE_LABEL[user.role]}</em>
          </span>
          <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

      {error && (
        <div className="lm-toast" role="alert">
          <span>{error}</span>
          <button type="button" className="lm-btn lm-btn--ghost lm-btn--sm" onClick={dismissError}>
            Fechar
          </button>
        </div>
      )}

      <main className="lm-main">
        {tab === 'pdv' && <PdvScreen />}
        {tab === 'fila' && <QueueScreen />}
        {tab === 'painel' && <DashboardScreen onNavigate={(t) => setTab(t as TabId)} />}
        {tab === 'produtos' && <ProductsScreen />}
        {tab === 'estoque' && <StockScreen />}
        {tab === 'compras' && <PurchasesScreen />}
        {tab === 'contas' && <PayablesScreen />}
        {tab === 'financeiro' && <FinanceScreen />}
        {tab === 'usuarios' && <UsersScreen currentUserId={user.id} />}
      </main>
    </div>
  )
}

function Login({ initialError, onAttempt }: { initialError: string; onAttempt: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('Informe usuário e senha.')
      return
    }
    setBusy(true)
    setError('')
    onAttempt()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    })
    setBusy(false)
    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Usuário ou senha inválidos.'
          : errorMessage(authError),
      )
    }
  }

  const shown = error || initialError

  return (
    <div className="lm-login">
      <form className="lm-login__box" onSubmit={submit}>
        <Logo large />
        <h1>Lanchonete Martinica</h1>
        <p>Gestão de pedidos, estoque, compras e financeiro.</p>

        <label>
          Usuário
          <input
            className="lm-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            autoComplete="username"
            autoFocus
          />
        </label>
        <label>
          Senha
          <input
            className="lm-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {shown && <p className="lm-alert">{shown}</p>}

        <button type="submit" className="lm-btn lm-btn--primary lm-btn--block" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function Loading() {
  return (
    <div className="lm-login">
      <div className="lm-login__box lm-loading" aria-busy="true">
        <Logo large />
        <p>Carregando…</p>
      </div>
    </div>
  )
}

/** Build sem as variáveis do Supabase: explica o que falta configurar. */
function MissingConfig() {
  return (
    <div className="lm-login">
      <div className="lm-login__box">
        <Logo large />
        <h1>Configuração pendente</h1>
        <p>
          O app não encontrou a conexão com o banco de dados. Defina{' '}
          <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (em{' '}
          <code>.env.local</code> ou nas variáveis de ambiente da Vercel) e gere o build de novo.
        </p>
      </div>
    </div>
  )
}

function Logo({ large }: { large?: boolean }) {
  return (
    <svg
      className={`lm-logo${large ? ' lm-logo--lg' : ''}`}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Lanchonete Martinica"
    >
      <rect width="64" height="64" rx="16" fill="#141414" />
      <path d="M14 34c0-9 8-16 18-16s18 7 18 16z" fill="#ff6a00" />
      <rect x="12" y="34" width="40" height="6" rx="3" fill="#ffffff" />
      <path d="M14 40h36c0 7-8 12-18 12s-18-5-18-12z" fill="#ff6a00" />
      <circle cx="26" cy="26" r="2" fill="#ffffff" />
      <circle cx="34" cy="23" r="2" fill="#ffffff" />
      <circle cx="41" cy="27" r="2" fill="#ffffff" />
    </svg>
  )
}
