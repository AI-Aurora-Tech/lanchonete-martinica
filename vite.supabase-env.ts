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

function pick(env: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return ''
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
  const url = pick(env, ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'])
  const anonKey = pick(env, [
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ])
  const loginDomain = pick(env, ['VITE_LOGIN_EMAIL_DOMAIN', 'LOGIN_EMAIL_DOMAIN'])
  if (anonKey) assertPublicKey(anonKey)

  return {
    __SUPABASE_URL__: JSON.stringify(url),
    __SUPABASE_ANON_KEY__: JSON.stringify(anonKey),
    __LOGIN_EMAIL_DOMAIN__: JSON.stringify(loginDomain),
  }
}
