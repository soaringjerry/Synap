import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../../../components/Toast'
import {
  adminCreateItem,
  adminDeleteItem,
  adminReorderItems,
  adminUpdateItem,
} from '../../../api/client'
import { adminGetScaleItems, adminImportItemsCSV } from '../../../api/client'
import { useScaleEditor } from '../ScaleEditorContext'
import { LIKERT_PRESETS } from '../constants'

const ITEM_TYPES: Array<'likert'|'single'|'multiple'|'dropdown'|'rating'|'short_text'|'long_text'|'numeric'|'date'|'time'|'slider'> = [
  'likert','single','multiple','dropdown','rating','short_text','long_text','numeric','date','time','slider',
]

const ItemsView: React.FC = () => {
  const { t } = useTranslation()
  const toast = useToast()
  const { state, dispatch, scaleId } = useScaleEditor()
  const { items, selectedItemId, likertDefaults } = state

  const selectedItem = useMemo(() => items.find(x => x.id === selectedItemId) || null, [items, selectedItemId])

  const [newOpen, setNewOpen] = useState(false)
  const newStemEnRef = useRef<HTMLInputElement | null>(null)
  const [newStemEn, setNewStemEn] = useState('')
  const [newStemZh, setNewStemZh] = useState('')
  const [newReverse, setNewReverse] = useState(false)
  const [newType, setNewType] = useState<'likert'|'single'|'multiple'|'dropdown'|'rating'|'short_text'|'long_text'|'numeric'|'date'|'time'|'slider'>('likert')
  const [newRequired, setNewRequired] = useState(false)
  const [newOptsEn, setNewOptsEn] = useState('')
  const [newOptsZh, setNewOptsZh] = useState('')
  const [newMin, setNewMin] = useState('')
  const [newMax, setNewMax] = useState('')
  const [newStep, setNewStep] = useState('')
  const [newPhEn, setNewPhEn] = useState('')
  const [newPhZh, setNewPhZh] = useState('')
  const [likertLabelsEn, setLikertLabelsEn] = useState<string>(likertDefaults.en)
  const [likertLabelsZh, setLikertLabelsZh] = useState<string>(likertDefaults.zh)
  const [likertShowNumbers, setLikertShowNumbers] = useState<boolean>(likertDefaults.showNumbers)
  const [likertPreset, setLikertPreset] = useState<string>(likertDefaults.preset)

  useEffect(() => {
    setLikertLabelsEn(likertDefaults.en)
    setLikertLabelsZh(likertDefaults.zh)
    setLikertShowNumbers(likertDefaults.showNumbers)
    setLikertPreset(likertDefaults.preset)
  }, [likertDefaults])

  useEffect(() => {
    if (!newOpen) return
    const el = newStemEnRef.current
    if (!el) return
    const pos = el.value.length
    el.focus()
    try { el.setSelectionRange(pos, pos) } catch {}
  }, [newOpen, newStemEn])

  const updateItems = useCallback((updater: (current: any[]) => any[]) => {
    dispatch({ type: 'setItems', items: updater(state.items) })
  }, [dispatch, state.items])

  const setSelectedItem = useCallback((id: string | null) => {
    dispatch({ type: 'selectItem', itemId: id })
  }, [dispatch])

  const setMessage = useCallback((msg: string) => {
    dispatch({ type: 'setMessage', message: msg })
  }, [dispatch])

  const saveItem = useCallback(async (item: any) => {
    try {
      const upd:any = { reverse_scored: !!item.reverse_scored, stem_i18n: item.stem_i18n, type: item.type, required: !!item.required }
      if (!item.type || item.type==='likert') {
        if (item.likert_labels_i18n) upd.likert_labels_i18n = item.likert_labels_i18n
        if (typeof item.likert_show_numbers==='boolean') upd.likert_show_numbers = !!item.likert_show_numbers
      }
      if (item.type==='single' || item.type==='multiple' || item.type==='dropdown') upd.options_i18n = item.options_i18n
      if (item.type==='rating' || item.type==='numeric' || item.type==='slider') { upd.min = item.min; upd.max = item.max; upd.step = item.step }
      if (item.type==='short_text' || item.type==='long_text') upd.placeholder_i18n = item.placeholder_i18n
      await adminUpdateItem(item.id, upd)
      toast.success(t('save_success'))
      updateItems(arr=> arr.map(x=> x.id===item.id? { ...x, ...upd }: x))
    } catch(e:any) { setMessage(e.message||String(e)); toast.error(e.message||String(e)) }
  }, [t, toast, updateItems, setMessage])

  const removeItem = useCallback(async (itemId: string) => {
    if (!confirm(t('confirm_delete_item'))) return
    try {
      await adminDeleteItem(itemId)
      dispatch({ type: 'removeItem', itemId })
      toast.success(t('delete_success'))
    } catch (e:any) {
      setMessage(e.message||String(e))
      toast.error(e.message||String(e))
    }
  }, [dispatch, setMessage, t, toast])

  const addItem = useCallback(async () => {
    try {
      const payload: any = { scale_id: scaleId, reverse_scored: newReverse, stem_i18n: { en: newStemEn, zh: newStemZh }, type: newType, required: newRequired }
      if (newType==='single' || newType==='multiple' || newType==='dropdown') {
        payload.options_i18n = { en: newOptsEn.split(/\n/).map(s=>s.trim()).filter(Boolean), zh: newOptsZh.split(/\n/).map(s=>s.trim()).filter(Boolean) }
      }
      if (newType==='likert') {
        const en = likertLabelsEn.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
        const zh = likertLabelsZh.split(/[,，]/).map(s=>s.trim()).filter(Boolean)
        const ll: any = {}
        if (en.length) ll.en = en
        if (zh.length) ll.zh = zh
        if (Object.keys(ll).length>0) payload.likert_labels_i18n = ll
        payload.likert_show_numbers = !!likertShowNumbers
      }
      if (newType==='rating' || newType==='numeric' || newType==='slider') {
        if (newMin !== '') payload.min = Number(newMin)
        if (newMax !== '') payload.max = Number(newMax)
        if (newStep !== '') payload.step = Number(newStep)
      }
      if (newType==='short_text' || newType==='long_text') {
        payload.placeholder_i18n = { en: newPhEn, zh: newPhZh }
      }
      const res = await adminCreateItem(payload)
      dispatch({ type: 'appendItem', item: res })
      setNewStemEn(''); setNewStemZh(''); setNewReverse(false); setNewType('likert'); setNewRequired(false); setNewOptsEn(''); setNewOptsZh(''); setNewMin(''); setNewMax(''); setNewStep(''); setNewPhEn(''); setNewPhZh('')
      setNewOpen(false)
      toast.success(t('create_success'))
    } catch(e:any) { setMessage(e.message||String(e)); toast.error(e.message||String(e)) }
  }, [dispatch, likertLabelsEn, likertLabelsZh, likertShowNumbers, newMax, newMin, newOptsEn, newOptsZh, newPhEn, newPhZh, newRequired, newReverse, newStep, newStemEn, newStemZh, newType, scaleId, setMessage, t, toast])

  const moveItem = useCallback((idx: number, delta: number) => {
    updateItems(arr => {
      const next = [...arr]
      const target = idx + delta
      if (target < 0 || target >= next.length) return next
      const tmp = next[idx]
      next[idx] = next[target]
      next[target] = tmp
      return next
    })
  }, [updateItems])

  const saveOrder = useCallback(async () => {
    try {
      await adminReorderItems(scaleId, items.map((x:any)=> x.id))
      toast.success(t('save_success'))
    } catch(e:any) { setMessage(e.message||String(e)); toast.error(e.message||String(e)) }
  }, [items, scaleId, setMessage, t, toast])

  const shareLink = useCallback((itemId: string) => {
    setSelectedItem(itemId)
    setNewOpen(false)
  }, [setSelectedItem])

  return (
    <div className="row">
      <div className="card span-4">
        <div className="cta-row" style={{justifyContent:'space-between'}}>
          <div className="section-title">{t('your_items')}</div>
          <div className="cta-row">
            <button type="button" className="btn" onClick={saveOrder}>{t('editor.save_order')}</button>
            <a className="btn" href={`/api/export?format=items&scale_id=${encodeURIComponent(scaleId)}`} target="_blank" rel="noreferrer">{t('export_items_csv')||'Export Items CSV'}</a>
            <label className="btn" style={{cursor:'pointer'}}>
              {t('editor.import_csv')||'Import CSV'}
              <input type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={async e=>{
                try {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const text = await f.text()
                  await adminImportItemsCSV(scaleId, text)
                  const res = await adminGetScaleItems(scaleId)
                  dispatch({ type: 'setItems', items: res.items })
                  toast.success(t('import_success')||'Imported')
                  ;(e.target as HTMLInputElement).value = ''
                } catch(err:any) { setMessage(err.message||String(err)); toast.error(err.message||String(err)) }
              }} />
            </label>
            <button type="button" className="btn btn-primary" onClick={()=> { setNewOpen(true); setSelectedItem(null) }}>{t('add_item')}</button>
          </div>
        </div>
        {items.length===0 && <div className="muted">{t('no_items')}</div>}
        {/* Scrollable items list: constrained height with independent vertical scroll */}
        <div style={{ marginTop:8, maxHeight:'70vh', overflowY:'auto', paddingRight:4 }}>
          {items.map((it:any, idx:number)=> (
            <div key={it.id} className="tile" style={{padding:10, marginTop:8, border: selectedItemId===it.id? '1px solid var(--accent)' : '1px solid transparent'}}>
              <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}>
                <div style={{minWidth:0, flex:1}}>
                  <div style={{fontWeight:600, overflow:'hidden', textOverflow:'ellipsis'}}>{it.stem_i18n?.en || it.stem || it.id}</div>
                  <div className="muted" style={{fontSize:12}}>{it.type || 'likert'} · {it.required? t('required'): t('optional')}</div>
                </div>
                <div className="cta-row" style={{gap:6}}>
                  <button type="button" className="btn btn-ghost" onClick={()=> shareLink(it.id)}>{t('edit')}</button>
                  <button type="button" className="btn btn-ghost" onClick={()=> moveItem(idx, -1)} disabled={idx===0}>↑</button>
                  <button type="button" className="btn btn-ghost" onClick={()=> moveItem(idx, 1)} disabled={idx===items.length-1}>↓</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card span-8">
        {selectedItem ? (
          <div className="item-editor-grid">
            <div className="item span-12"><h4 style={{margin:0}}>{t('editor.edit_item')}</h4></div>
            <div className="item span-12 muted">{t('label.id')}: <b>{selectedItem.id}</b></div>
            <div className="item span-6"><div className="label">{t('stem_en')}</div><input className="input" value={selectedItem.stem_i18n?.en||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, stem_i18n: {...(x.stem_i18n||{}), en: e.target.value }}:x))} /></div>
            <div className="item span-6"><div className="label">{t('stem_zh')}</div><input className="input" value={selectedItem.stem_i18n?.zh||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, stem_i18n: {...(x.stem_i18n||{}), zh: e.target.value }}:x))} /></div>
            <div className="item span-12 muted">{t('label.type')}: <b>{selectedItem.type||'likert'}</b></div>
            {(!selectedItem.type || selectedItem.type==='likert') && (
              <>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-4" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!selectedItem.required} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, required: e.target.checked }:x))} /> {t('required')}</label></div>
                    <div className="group-item span-4" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!selectedItem.reverse_scored} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, reverse_scored: e.target.checked }:x))} /> {t('reverse_scored')}</label></div>
                    <div className="group-item span-4"></div>
                  </div>
                </div>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-12">
                      <div className="label">{t('label.likert_anchors_item')}</div>
                      <div className="muted" style={{marginBottom:6}}>{t('likert.presets.title')}</div>
                      <select className="select" value="" onChange={e=> {
                        const key = e.target.value
                        if (!key) {
                          updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, likert_labels_i18n: { en: [], zh: [] }}:x))
                          return
                        }
                        const preset = LIKERT_PRESETS[key]
                        if (!preset) return
                        updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {
                          ...x,
                          likert_labels_i18n: {
                            en: [...preset.en],
                            zh: [...preset.zh],
                          },
                        }:x))
                      }}>
                        <option value="">{t('likert.presets.custom')}</option>
                        {Object.keys(LIKERT_PRESETS).map(key=> (
                          <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="group-item span-6"><div className="label">{t('lang_en')}</div><input className="input" value={((selectedItem as any).likert_labels_i18n?.en && (selectedItem as any).likert_labels_i18n.en.length>0) ? (selectedItem as any).likert_labels_i18n.en.join(', ') : likertLabelsEn} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), en: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.likert_anchors_en')} /></div>
                    <div className="group-item span-6"><div className="label">{t('lang_zh')}</div><input className="input" value={((selectedItem as any).likert_labels_i18n?.zh && (selectedItem as any).likert_labels_i18n.zh.length>0) ? (selectedItem as any).likert_labels_i18n.zh.join('，') : likertLabelsZh} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, likert_labels_i18n: {...(((x as any).likert_labels_i18n)||{}), zh: e.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.likert_anchors_zh')} /></div>
                    <div className="group-item span-12" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={!!(selectedItem as any).likert_show_numbers} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, likert_show_numbers: e.target.checked }:x))} /> {t('likert.show_numbers')}</label></div>
                  </div>
                </div>
              </>
            )}
            {(selectedItem.type==='single' || selectedItem.type==='multiple' || selectedItem.type==='dropdown') && (
              <>
                <div className="item span-12 tile-ghost">
                  <div className="group-grid">
                    <div className="group-item span-6"><div className="label">{t('label.options_en')}</div><textarea className="input" rows={3} value={(selectedItem as any).options_i18n?.en?.join('\n')||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), en: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.options_en_placeholder') as string} /></div>
                    <div className="group-item span-6"><div className="label">{t('label.options_zh')}</div><textarea className="input" rows={3} value={(selectedItem as any).options_i18n?.zh?.join('\n')||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, options_i18n: {...(((x as any).options_i18n)||{}), zh: e.target.value.split(/\n/).map(s=>s.trim()).filter(Boolean) }}:x))} placeholder={t('hint.options_zh_placeholder') as string} /></div>
                  </div>
                </div>
              </>
            )}
            {(selectedItem.type==='rating' || selectedItem.type==='numeric' || selectedItem.type==='slider') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-4"><div className="label">{t('label.min')}</div><input className="input" type="number" value={(selectedItem.min??'') as any} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, min: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.max')}</div><input className="input" type="number" value={(selectedItem.max??'') as any} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, max: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                  <div className="group-item span-4"><div className="label">{t('label.step')}</div><input className="input" type="number" value={(selectedItem.step??'') as any} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, step: e.target.value===''? undefined : Number(e.target.value) }:x))} /></div>
                </div>
              </div>
            )}
            {(selectedItem.type==='short_text' || selectedItem.type==='long_text') && (
              <div className="item span-12 tile-ghost">
                <div className="group-grid">
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_en')}</div><input className="input" value={(selectedItem as any).placeholder_i18n?.en||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), en: e.target.value }}:x))} /></div>
                  <div className="group-item span-6"><div className="label">{t('label.placeholder_zh')}</div><input className="input" value={(selectedItem as any).placeholder_i18n?.zh||''} onChange={e=> updateItems(arr=> arr.map(x=> x.id===selectedItem.id? {...x, placeholder_i18n: {...(((x as any).placeholder_i18n)||{}), zh: e.target.value }}:x))} /></div>
                </div>
              </div>
            )}
            <div className="item span-12" style={{display:'flex', justifyContent:'flex-end', gap:12}}>
              <button type="button" className="btn btn-ghost" onClick={()=> removeItem(selectedItem.id)}>{t('delete')}</button>
              <button type="button" className="btn btn-primary" onClick={()=> saveItem(selectedItem)}>{t('save')}</button>
            </div>
          </div>
        ) : newOpen ? (
          <div className="item-editor-grid">
            <div className="item span-12"><h4 style={{margin:0}}>{t('add_item')}</h4></div>
            <div className="item span-6"><div className="label">{t('stem_en')}</div><input ref={newStemEnRef} className="input" value={newStemEn} onChange={e=> setNewStemEn(e.target.value)} /></div>
            <div className="item span-6"><div className="label">{t('stem_zh')}</div><input className="input" value={newStemZh} onChange={e=> setNewStemZh(e.target.value)} /></div>
            <div className="item span-4"><div className="label">{t('label.type')}</div>
              <select className="select" value={newType} onChange={e=> setNewType(e.target.value as any)}>
                {ITEM_TYPES.map(x=> <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
            <div className="item span-4">
              <label style={{display:'inline-flex',alignItems:'center',gap:8}}><input className="checkbox" type="checkbox" checked={newRequired} onChange={e=> setNewRequired(e.target.checked)} /> {t('required')}</label>
            </div>
            <div className="item span-4">
              <label style={{display:'inline-flex',alignItems:'center',gap:8}}><input className="checkbox" type="checkbox" checked={newReverse} onChange={e=> setNewReverse(e.target.checked)} /> {t('reverse_scored')}</label>
            </div>
            {newType==='likert' && (
              <>
                <div className="item span-12">
                  <div className="label">{t('likert.presets.title')}</div>
                  <select className="select" value={likertPreset} onChange={e=> {
                    const key = e.target.value
                    setLikertPreset(key)
                    const preset = LIKERT_PRESETS[key]
                    if (preset) {
                      setLikertLabelsEn(preset.en.join(', '))
                      setLikertLabelsZh(preset.zh.join('，'))
                    }
                  }}>
                    {Object.keys(LIKERT_PRESETS).map(key=> (
                      <option key={key} value={key}>{t(`likert.presets.${key}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="item span-6"><div className="label">{t('lang_en')}</div><input className="input" value={likertLabelsEn} onChange={e=> setLikertLabelsEn(e.target.value)} /></div>
                <div className="item span-6"><div className="label">{t('lang_zh')}</div><input className="input" value={likertLabelsZh} onChange={e=> setLikertLabelsZh(e.target.value)} /></div>
                <div className="item span-12" style={{display:'flex',alignItems:'center',gap:8}}><label><input className="checkbox" type="checkbox" checked={likertShowNumbers} onChange={e=> setLikertShowNumbers(e.target.checked)} /> {t('likert.show_numbers')}</label></div>
              </>
            )}
            {(newType==='single' || newType==='multiple' || newType==='dropdown') && (
              <>
                <div className="item span-6"><div className="label">{t('label.options_en')}</div><textarea className="input" rows={3} value={newOptsEn} onChange={e=> setNewOptsEn(e.target.value)} placeholder={t('hint.options_en_placeholder') as string} /></div>
                <div className="item span-6"><div className="label">{t('label.options_zh')}</div><textarea className="input" rows={3} value={newOptsZh} onChange={e=> setNewOptsZh(e.target.value)} placeholder={t('hint.options_zh_placeholder') as string} /></div>
              </>
            )}
            {(newType==='rating' || newType==='numeric' || newType==='slider') && (
              <>
                <div className="item span-4"><div className="label">{t('label.min')}</div><input className="input" type="number" value={newMin} onChange={e=> setNewMin(e.target.value)} /></div>
                <div className="item span-4"><div className="label">{t('label.max')}</div><input className="input" type="number" value={newMax} onChange={e=> setNewMax(e.target.value)} /></div>
                <div className="item span-4"><div className="label">{t('label.step')}</div><input className="input" type="number" value={newStep} onChange={e=> setNewStep(e.target.value)} /></div>
              </>
            )}
            {(newType==='short_text' || newType==='long_text') && (
              <>
                <div className="item span-6"><div className="label">{t('label.placeholder_en')}</div><input className="input" value={newPhEn} onChange={e=> setNewPhEn(e.target.value)} /></div>
                <div className="item span-6"><div className="label">{t('label.placeholder_zh')}</div><input className="input" value={newPhZh} onChange={e=> setNewPhZh(e.target.value)} /></div>
              </>
            )}
            <div className="item span-12" style={{display:'flex',justifyContent:'flex-end',gap:12}}>
              <button type="button" className="btn btn-ghost" onClick={()=> setNewOpen(false)}>{t('cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={addItem}>{t('create')}</button>
            </div>
          </div>
        ) : (
          <div className="muted" style={{padding:16}}>{t('editor.select_item_to_edit')}</div>
        )}
      </div>
    </div>
  )
}

export default ItemsView
