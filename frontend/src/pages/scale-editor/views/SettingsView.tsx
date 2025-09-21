import React from 'react'
import { useTranslation } from 'react-i18next'
import { useScaleEditor } from '../ScaleEditorContext'
import GeneralSettings from './settings/GeneralSettings'
import SecuritySettings from './settings/SecuritySettings'
import ConsentSettings from './settings/ConsentSettings'
import AISettings from './settings/AISettings'
import CollaboratorsPanel from '../components/CollaboratorsPanel'
import DangerZone from '../components/DangerZone'

const SettingsView: React.FC = () => {
  const { t } = useTranslation()
  const { state, dispatch } = useScaleEditor()
  if (!state.scale) return null

  const tab = state.settingsTab
  const setTab = (v: typeof state.settingsTab) => dispatch({ type: 'setSettingsTab', tab: v })

  return (
    <>
      <div className="tile" style={{ padding: 8, marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([
          { key:'general', label:'settings.nav.general' },
          { key:'security', label:'settings.nav.security' },
          { key:'consent', label:'settings.nav.consent' },
          { key:'ai', label:'settings.nav.ai' },
          { key:'team', label:'settings.nav.team' },
          { key:'danger', label:'settings.nav.danger' },
        ] as any[]).map(x => (
          <button key={x.key} type="button" className={`btn ${tab===x.key?'':'btn-ghost'}`} onClick={()=> setTab(x.key)}>{t(x.label)}</button>
        ))}
      </div>
      {tab==='general' && <GeneralSettings />}
      {tab==='security' && <SecuritySettings />}
      {tab==='consent' && <ConsentSettings />}
      {tab==='ai' && <AISettings />}
      {tab==='team' && (<div className="row"><CollaboratorsPanel /></div>)}
      {tab==='danger' && <DangerZone />}
    </>
  )
}

export default SettingsView

