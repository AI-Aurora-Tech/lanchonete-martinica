// ---------------------------------------------------------------------------
// Conexão com o Supabase (banco, autenticação e tempo real).
//
// URL e chave pública vêm das variáveis de ambiente (SUPABASE_URL e
// SUPABASE_ANON_KEY, com ou sem o prefixo VITE_) — veja `.env.example` e
// `vite.supabase-env.ts`. A chave "anon" é pública por natureza: quem protege os
// dados são as políticas de acesso (RLS) definidas em `supabase/migrations`.
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'

const url = __SUPABASE_URL__
const anonKey = __SUPABASE_ANON_KEY__

/** Domínio usado para transformar o nome de usuário em e-mail de login. */
const LOGIN_DOMAIN = __LOGIN_EMAIL_DOMAIN__ || 'lanchonete-martinica.app'

export const isSupabaseConfigured = Boolean(url && anonKey)

/** Variáveis que faltaram no build (para a tela de configuração pendente). */
export const missingConfig = [
  ...(url ? [] : ['SUPABASE_URL']),
  ...(anonKey ? [] : ['SUPABASE_ANON_KEY']),
]

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})

/**
 * O Supabase Auth identifica usuários por e-mail. Para o caixa continuar
 * entrando só com "usuário", `caixa` vira `caixa@<domínio>`. Quem digitar um
 * e-mail completo entra com ele mesmo.
 */
export function usernameToEmail(username: string): string {
  const clean = username.trim().toLowerCase()
  return clean.includes('@') ? clean : `${clean}@${LOGIN_DOMAIN}`
}

/** Mensagem legível para erros do Supabase / PostgREST / Edge Functions. */
export function errorMessage(error: unknown): string {
  if (!error) return 'Erro desconhecido.'
  if (typeof error === 'string') return error
  const e = error as { message?: string; code?: string }
  if (e.code === '42501') return 'Você não tem permissão para esta ação.'
  if (e.message === 'Failed to fetch') return 'Sem conexão com o servidor. Verifique a internet.'
  return e.message || 'Erro desconhecido.'
}
