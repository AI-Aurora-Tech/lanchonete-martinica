// ---------------------------------------------------------------------------
// Edge Function `manage-users` — cadastro de usuários pelo administrador.
//
// Criar login, trocar senha, desativar ou excluir alguém exige a chave de
// serviço do Supabase, que nunca pode ir para o navegador. Por isso essas
// operações passam por aqui: a função confere que quem chama é um
// administrador ativo e só então fala com o Supabase Auth.
//
// Corpo da requisição (JSON):
//   { action: 'create', name, username, password, role, active }
//   { action: 'update', id, name, username, password?, role, active }
//   { action: 'delete', id }
// ---------------------------------------------------------------------------
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Mesmo domínio usado pelo app (VITE_LOGIN_EMAIL_DOMAIN). */
const LOGIN_DOMAIN = Deno.env.get('LOGIN_EMAIL_DOMAIN') || 'lanchonete-martinica.app'

/** "Banimento" longo = usuário desativado não consegue mais entrar. */
const BANNED = '876000h'

type Role = 'admin' | 'pdv'

interface Body {
  action?: 'create' | 'update' | 'delete'
  id?: string
  name?: string
  username?: string
  password?: string
  role?: Role
  active?: boolean
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Método não permitido.' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  try {
    // 1. Quem está chamando?
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) throw new HttpError(401, 'Sessão expirada. Entre novamente.')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) throw new HttpError(401, 'Sessão expirada. Entre novamente.')
    const callerId = auth.user.id

    const { data: caller } = await admin
      .from('profiles')
      .select('role, active')
      .eq('id', callerId)
      .maybeSingle()
    if (!caller || caller.role !== 'admin' || !caller.active) {
      throw new HttpError(403, 'Apenas administradores gerenciam usuários.')
    }

    // 2. O que fazer?
    const body = (await req.json()) as Body

    if (body.action === 'delete') {
      if (!body.id) throw new HttpError(400, 'Usuário não informado.')
      if (body.id === callerId) throw new HttpError(400, 'Você não pode excluir o próprio usuário.')
      const { error } = await admin.auth.admin.deleteUser(body.id)
      if (error) throw error
      return reply(200, { ok: true })
    }

    const name = body.name?.trim() ?? ''
    const username = body.username?.trim().toLowerCase() ?? ''
    const role: Role = body.role === 'admin' ? 'admin' : 'pdv'
    const active = body.active !== false
    const password = body.password ?? ''

    if (!name || !username) throw new HttpError(400, 'Preencha nome e usuário.')
    if (!/^[a-z0-9._-]+$/.test(username)) {
      throw new HttpError(400, 'O usuário aceita só letras minúsculas, números, ponto, hífen e sublinhado.')
    }
    if (password && password.length < 6) {
      throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.')
    }

    const { data: taken } = await admin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (taken && taken.id !== body.id) {
      throw new HttpError(409, `Já existe um usuário "${username}".`)
    }

    const email = `${username}@${LOGIN_DOMAIN}`
    let id = body.id

    if (body.action === 'create') {
      if (!password) throw new HttpError(400, 'Informe a senha do novo usuário.')
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, username },
      })
      if (error) throw error
      id = data.user.id
      if (!active) {
        await admin.auth.admin.updateUserById(id, { ban_duration: BANNED })
      }
    } else if (body.action === 'update') {
      if (!id) throw new HttpError(400, 'Usuário não informado.')
      if (id === callerId && (role !== 'admin' || !active)) {
        throw new HttpError(400, 'Você não pode rebaixar nem desativar o próprio usuário.')
      }
      const { data: current, error: findError } = await admin.auth.admin.getUserById(id)
      if (findError) throw findError
      // Usuários criados direto no painel do Supabase podem ter um e-mail real:
      // nesse caso o e-mail é mantido e só o nome de usuário muda.
      const keepEmail = !current.user.email?.endsWith(`@${LOGIN_DOMAIN}`)
      const { error } = await admin.auth.admin.updateUserById(id, {
        ...(keepEmail ? {} : { email, email_confirm: true }),
        ...(password ? { password } : {}),
        user_metadata: { name, username },
        ban_duration: active ? 'none' : BANNED,
      })
      if (error) throw error
    } else {
      throw new HttpError(400, 'Ação inválida.')
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update({ name, username, role, active })
      .eq('id', id)
    if (profileError) throw profileError

    return reply(200, { ok: true, id })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 400
    const message = e instanceof Error ? e.message : 'Erro inesperado.'
    return reply(status, { error: message })
  }
})
