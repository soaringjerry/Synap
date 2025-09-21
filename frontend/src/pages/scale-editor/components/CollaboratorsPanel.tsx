import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import { adminListCollaborators, adminAddCollaborator, adminRemoveCollaborator, Collaborator } from '../../../api/client'
import { useScaleEditor } from '../ScaleEditorContext'

const roles: Array<'editor'|'viewer'> = ['editor','viewer']

export const CollaboratorsPanel: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { scaleId } = useScaleEditor()
  const [list, setList] = useState<Collaborator[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor'|'viewer'>('editor')
  const [loading, setLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)

  const load = useMemo(() => async () => {
    try {
      const res = await adminListCollaborators(scaleId)
      setList(res.collaborators || [])
    } catch (e: any) {
      toast.error(e?.message || String(e))
    }
  }, [scaleId, toast])

  useEffect(() => { load() }, [load])

  const add = async () => {
    const e = email.trim()
    if (!e) return
    setLoading(true)
    setInviteEmail(null)
    try {
      await adminAddCollaborator(scaleId, { email: e, role })
      setEmail('')
      await load()
      toast.success(t('team.added'))
    } catch (err: any) {
      const msg = err?.message || String(err)
      toast.error(msg)
      if (/user not found/i.test(msg)) setInviteEmail(e)
    } finally {
      setLoading(false)
    }
  }

  const remove = async (user_id: string) => {
    try {
      await adminRemoveCollaborator(scaleId, user_id)
      await load()
      toast.success(t('deleted'))
    } catch (e: any) {
      toast.error(e?.message || String(e))
    }
  }

  const updateRole = async (c: Collaborator, nextRole: 'editor'|'viewer') => {
    try {
      await adminAddCollaborator(scaleId, { email: c.email, role: nextRole })
      await load()
      toast.success(t('save_success'))
    } catch (e: any) {
      toast.error(e?.message || String(e))
    }
  }

  return (
    <div className="card span-12">
      <h4 className="section-title" style={{ marginTop: 0 }}>{t('team.title')}</h4>
      <div className="item">
        <div className="label">{t('team.email')}</div>
        <input className="input" value={email} onChange={e=> setEmail(e.target.value)} placeholder="user@example.com" inputMode="email" />
      </div>
      <div className="item">
        <div className="label">{t('team.role')}</div>
        <select className="input" value={role} onChange={e=> setRole(e.target.value as any)}>
          {roles.map(r => <option key={r} value={r}>{t(`team.role_${r}`)}</option>)}
        </select>
      </div>
      <div className="cta-row" style={{ gap: 8 }}>
        <button className="btn" onClick={add} disabled={loading || !email.trim()}>{t('team.add')}</button>
        {inviteEmail && (
          <span className="muted">
            {t('team.user_not_found')}{' '}
            <a href={`/auth`} target="_blank" rel="noreferrer">{t('team.invite_register')}</a>
          </span>
        )}
      </div>

      <div className="tile" style={{ padding: 8, marginTop: 12 }}>
        {list.length === 0 && <div className="muted">{t('team.empty')}</div>}
        {list.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 120px', gap:8, alignItems:'center' }}>
            <div className="muted">{t('email')}</div>
            <div className="muted">{t('team.role')}</div>
            <div />
            {list.map(c => (
              <React.Fragment key={c.user_id}>
                <div>{c.email}</div>
                <div>
                  <select className="input" value={c.role} onChange={e => updateRole(c, e.target.value as any)}>
                    {roles.map(r => <option key={r} value={r}>{t(`team.role_${r}`)}</option>)}
                  </select>
                </div>
                <div className="cta-row" style={{ justifyContent:'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => remove(c.user_id)}>{t('delete')}</button>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default CollaboratorsPanel

