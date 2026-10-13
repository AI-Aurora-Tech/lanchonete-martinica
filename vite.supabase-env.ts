// ---------------------------------------------------------------------------
// Variáveis do Supabase usadas pelo app no navegador.
//
// Aceita os nomes com e sem o prefixo VITE_ (e os criados pela integração
// Supabase da Vercel), mas embute no build SOMENTE a URL e a chave pública.
// Nunca usamos `envPrefix` para isso: ele exporia qualquer variável com o
// mesmo prefixo — inclusive SUPABASE_SERVICE_ROLE_KEY, que dá acesso total
// ao banco.
// ---------------------------------------------------------------------------
import { loadEnv } from 'vite'

const URL_NAMES = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']
const KEY_NAMES = [
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]

/** Primeiro nome da lista que tem valor (e qual foi). */
function pick(env: Record<string, string>, names: string[]): { name: string; value: string } {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return { name, value }
  }
  return { name: '', value: '' }
}

/**
 * Diz no log do build (sem mostrar valores) o que foi encontrado. Se faltar
 * algo, lista as variáveis parecidas que existem — ajuda a achar nome errado
 * ou variável cadastrada só para outro ambiente da Vercel.
 */
function report(env: Record<string, string>, url: { name: string }, key: { name: string }) {
  const where = env.VERCEL_ENV ? ` (ambiente Vercel: ${env.VERCEL_ENV})` : ''
  console.log(
    `[supabase] URL: ${url.name || 'NÃO ENCONTRADA'} · chave pública: ${key.name || 'NÃO ENCONTRADA'}${where}`,
  )
  if (!url.name || !key.name) {
    const similar = Object.keys(env).filter((k) => /supabase/i.test(k))
    console.warn(
      `[supabase] Faltam variáveis. Nomes aceitos — URL: ${URL_NAMES.join(', ')}; ` +
        `chave: ${KEY_NAMES.join(', ')}. ` +
        `Variáveis com "supabase" no nome presentes neste build: ${similar.join(', ') || 'nenhuma'}.`,
    )
  }
}

/** Recusa no build uma chave de serviço colocada por engano no lugar da pública. */
function assertPublicKey(key: string) {
  let role = ''
  try {
    const payload = key.split('.')[1]
    if (payload) role = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role ?? ''
  } catch {
    // não é JWT (ex.: chave sb_publishable_…)
  }
  if (key.startsWith('sb_secret_') || role === 'service_role') {
    throw new Error(
      'A chave configurada para o app é a chave SECRETA (service_role) do Supabase. ' +
        'Use a chave pública "anon" / "publishable" em SUPABASE_ANON_KEY.',
    )
  }
}

/** Entradas para o `define` do Vite. */
export function supabaseDefines(mode: string): Record<string, string> {
  const env = loadEnv(mode, '.', '')
  const url = pick(env, URL_NAMES)
  const anonKey = pick(env, KEY_NAMES)
  const loginDomain = pick(env, ['VITE_LOGIN_EMAIL_DOMAIN', 'LOGIN_EMAIL_DOMAIN'])
  report(env, url, anonKey)
  if (anonKey.value) assertPublicKey(anonKey.value)

  return {
    __SUPABASE_URL__: JSON.stringify(url.value),
    __SUPABASE_ANON_KEY__: JSON.stringify(anonKey.value),
    __LOGIN_EMAIL_DOMAIN__: JSON.stringify(loginDomain.value),
  }
}
