import React from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ScaleEditorProvider, useScaleEditor } from './ScaleEditorContext'
import ItemsView from './views/ItemsView'
import SettingsView from './views/SettingsView'
import ShareView from './views/ShareView'

const Layout: React.FC = () => {
  const { t } = useTranslation()
  const { state, dispatch, scaleId } = useScaleEditor()
  const { view, message } = state

  return (
    <div className="container">
      <div className="hero">
        <div className="glitch" data-text={t('manage')}>{t('manage')}</div>
        <div className="muted">{t('editor.flow_hint')}</div>
      </div>

      <div className="cta-row" style={{justifyContent:'flex-end', marginBottom:12}}>
        <Link className="btn btn-ghost" to={`/admin/scale/${encodeURIComponent(scaleId)}/legacy`}>{t('editor.legacy_view')}</Link>
      </div>

      <div className="tabs-nav" style={{marginBottom:12}}>
        <button className="tab" onClick={()=> dispatch({ type: 'setView', view: 'editor' })} style={{borderColor: view==='editor'?'rgba(125,211,252,0.65)':''}}>{t('editor.items_tab')}</button>
        <button className="tab" onClick={()=> dispatch({ type: 'setView', view: 'settings' })} style={{borderColor: view==='settings'?'rgba(125,211,252,0.65)':''}}>{t('editor.settings_tab')}</button>
        <button className="tab" onClick={()=> dispatch({ type: 'setView', view: 'share' })} style={{borderColor: view==='share'?'rgba(125,211,252,0.65)':''}}>{t('editor.share_tab')}</button>
      </div>

      {view==='editor' && <ItemsView />}
      {view==='settings' && <SettingsView />}
      {view==='share' && <ShareView />}

      {message && <div className="muted" style={{marginTop:12}}>{message}</div>}
    </div>
  )
}

export const ScaleEditorPage: React.FC<{ scaleId: string }> = ({ scaleId }) => (
  <ScaleEditorProvider scaleId={scaleId}>
    <Layout />
  </ScaleEditorProvider>
)

export default ScaleEditorPage
