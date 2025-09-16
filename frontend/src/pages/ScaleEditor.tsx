import React from 'react'
import { useParams } from 'react-router-dom'
import ScaleEditorPage from './scale-editor/ScaleEditorPage'

export function ScaleEditor() {
  const { id = '' } = useParams()
  return <ScaleEditorPage scaleId={id} />
}

export default ScaleEditor
