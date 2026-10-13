import { useState } from 'react'
import { useStore, type UserDraft } from '../store'
import { ROLE_LABEL, type Role } from '../types'

function blankUser(): UserDraft {
  return { name: '', username: '', password: '', role: 'pdv', active: true }
}

/** Perfis de acesso: Admin (gestão completa) e PDV (apenas caixa e fila). */
export function UsersScreen({ currentUserId }: { currentUserId: string }) {
  const { users, saveUser, removeUser } = useStore()
  const [editing, setEditing] = useState<UserDraft | null>(null)

  return (
    <div className="lm-stack">
      <section className="lm-panel">
        <header className="lm-panel__head">
          <h2>Usuários e perfis</h2>
          <button
            type="button"
            className="lm-btn lm-btn--primary lm-btn--sm"
            onClick={() => setEditing(blankUser())}
          >
            + Novo usuário
          </button>
        </header>
        <div className="lm-tableWrap">
          <table className="lm-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    {u.id === currentUserId && <span className="lm-sub">sessão atual</span>}
                  </td>
                  <td>{u.username}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>
                    <span className={`lm-tag lm-tag--${u.active ? 'entregue' : 'cancelado'}`}>
                      {u.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="lm-actions">
                    <button
                      type="button"
                      className="lm-btn lm-btn--ghost lm-btn--sm"
                      onClick={() => setEditing({ ...u, password: '' })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="lm-btn lm-btn--danger lm-btn--sm"
                      disabled={u.id === currentUserId}
                      onClick={() => {
                        if (confirm(`Excluir o usuário "${u.name}"?`)) void removeUser(u.id)
                      }}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="lm-note lm-note--muted">
          O perfil <strong>Administrador</strong> abre a gestão completa (produtos, estoque,
          compras, contas e financeiro). O perfil <strong>Operador de PDV</strong> vê apenas a
          vitrine de vendas e a fila de pedidos.
        </p>
      </section>

      {editing && (
        <UserDialog
          user={editing}
          isSelf={editing.id === currentUserId}
          onCancel={() => setEditing(null)}
          onSave={async (u) => {
            if (await saveUser(u)) setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function UserDialog({
  user,
  isSelf,
  onSave,
  onCancel,
}: {
  user: UserDraft
  /** O próprio usuário logado: não pode se rebaixar nem se desativar. */
  isSelf: boolean
  onSave: (u: UserDraft) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(user)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isNew = !user.id

  return (
    <div className="lm-modal" role="dialog" aria-modal="true" aria-label="Usuário">
      <div className="lm-modal__box">
        <h2>{isNew ? 'Novo usuário' : 'Editar usuário'}</h2>
        <div className="lm-form lm-form--2">
          <label>
            Nome
            <input
              className="lm-input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Usuário (login)
            <input
              className="lm-input"
              value={draft.username}
              onChange={(e) => setDraft({ ...draft, username: e.target.value })}
              autoCapitalize="none"
            />
          </label>
          <label>
            {isNew ? 'Senha' : 'Nova senha'}
            <input
              className="lm-input"
              type="password"
              value={draft.password}
              onChange={(e) => setDraft({ ...draft, password: e.target.value })}
              placeholder={isNew ? 'Mínimo de 6 caracteres' : 'Deixe em branco para manter'}
              autoComplete="new-password"
            />
          </label>
          <label>
            Perfil
            <select
              className="lm-input"
              disabled={isSelf}
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="lm-check lm-span2">
            <input
              type="checkbox"
              disabled={isSelf}
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            Usuário ativo
          </label>
        </div>
        {error && <p className="lm-alert">{error}</p>}
        <div className="lm-modal__actions">
          <button type="button" className="lm-btn lm-btn--ghost" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="lm-btn lm-btn--primary"
            disabled={saving}
            onClick={async () => {
              const username = draft.username.trim().toLowerCase()
              if (!draft.name.trim() || !username || (isNew && !draft.password)) {
                setError(isNew ? 'Preencha nome, usuário e senha.' : 'Preencha nome e usuário.')
                return
              }
              if (!/^[a-z0-9._-]+$/.test(username)) {
                setError('O usuário aceita só letras minúsculas, números, ponto, hífen e sublinhado.')
                return
              }
              if (draft.password && draft.password.length < 6) {
                setError('A senha precisa ter pelo menos 6 caracteres.')
                return
              }
              setError('')
              setSaving(true)
              await onSave({ ...draft, name: draft.name.trim(), username })
              setSaving(false)
            }}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
