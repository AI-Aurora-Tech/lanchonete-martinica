// ---------------------------------------------------------------------------
// Conexão com o Supabase (banco, autenticação e tempo real).
//
// URL e chave pública vêm das variáveis de ambiente do Vite — veja
// `.env.example`. A chave "anon" é pública por natureza: quem protege os
// dados são as políticas de acesso (RLS) definidas em `supabase/migrations`.
// ---------------------------------------------------------------------------
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Domínio usado para transformar o nome de usuário em e-mail de login. */
const LOGIN_DOMAIN = import.meta.env.VITE_LOGIN_EMAIL_DOMAIN || 'lanchonete-martinica.app'

export const isSupabaseConfigured = Boolean(url && anonKey)

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
