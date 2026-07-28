import { useEffect, useRef, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'
import type { MaterialNodeData } from '@red-video-flow/workflow-core'
import { useWorkflowStore } from '../../../store/workflowStore'

type UseMaterialNodeOptions = {
  id: string
  data: MaterialNodeData
}

export function useMaterialNode({ id, data }: UseMaterialNodeOptions) {
  const inputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastPointerDownAtRef = useRef(0)
  const attachFile = useWorkflowStore((state) => state.attachFileToNode)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const beginEditNode = useWorkflowStore((state) => state.beginEditNode)
  const editingNodeId = useWorkflowStore((state) => state.editingNodeId)
  const composerNodeId = useWorkflowStore((state) => state.composerNodeId)
  const node = useWorkflowStore((state) => state.nodes.find((item) => item.id === id))
  const updateTextNode = useWorkflowStore((state) => state.updateTextNode)
  const canUpload = data.materialType === 'image' || data.materialType === 'video'
  const isTextEditing = data.materialType === 'text' && editingNodeId === id
  const shouldShowComposer = composerNodeId === id && editingNodeId !== id && node !== undefined

  const enterTextEdit = () => {
    beginEditNode(id)
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('focus-node-composer', { detail: { nodeId: id } }))
    }, 0)
  }

  const handleBodyPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (data.materialType !== 'text') return

    const now = window.performance.now()
    const previousPointerDownAt = lastPointerDownAtRef.current
    const isFastSecondClick = previousPointerDownAt > 0 && now - previousPointerDownAt < 360
    lastPointerDownAtRef.current = now
    if (!isFastSecondClick) return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleNodeMouseDownCapture = (event: MouseEvent<HTMLElement>) => {
    if (data.materialType !== 'text' || event.detail < 2) return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleNodeDoubleClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (data.materialType !== 'text') return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleBodyClick = (event: MouseEvent<HTMLDivElement>) => {
    if (data.materialType === 'text' && event.detail > 1) return
    selectNode(id)
  }

  const handleBodyDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (canUpload && !data.value.url) {
      event.stopPropagation()
      inputRef.current?.click()
      return
    }
    if (data.materialType !== 'text') return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) attachFile(id, file)
    event.target.value = ''
  }

  useEffect(() => {
    if (isTextEditing) window.setTimeout(() => textareaRef.current?.focus(), 0)
  }, [isTextEditing])

  return {
    canUpload,
    enterTextEdit,
    handleBodyClick,
    handleBodyDoubleClick,
    handleBodyPointerDown,
    handleFileChange,
    handleNodeDoubleClickCapture,
    handleNodeMouseDownCapture,
    inputRef,
    isTextEditing,
    node,
    shouldShowComposer,
    textareaRef,
    updateText: (value: string) => updateTextNode(id, value),
  }
}
