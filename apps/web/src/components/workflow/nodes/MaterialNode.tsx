import { Handle, Position, type NodeProps } from '@xyflow/react'
import { FileText, Image, Play } from 'lucide-react'
import { type ElementType, useEffect, useRef } from 'react'
import { acceptedMimeTypes, type MaterialNodeData, type MaterialType } from '@red-video-flow/workflow-core'
import { useWorkflowStore } from '../../../store/workflowStore'
import styles from './MaterialNode.module.less'

const icons: Record<MaterialType, ElementType> = {
  text: FileText,
  image: Image,
  video: Play,
}

const emptyText: Record<MaterialType, string> = {
  text: '暂无文本内容',
  image: '点击上传图片',
  video: '点击上传视频',
}

const statusLabel: Record<MaterialNodeData['status'], string> = {
  empty: '空',
  ready: '就绪',
  running: '生成中',
  done: '完成',
  error: '异常',
}

const textStarterActions = [
  '自己编写内容',
  '文生视频',
  '图片反推提示词',
  '文字生音乐',
]

export function MaterialNode({ id, data, selected }: NodeProps<MaterialNodeData>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const attachFile = useWorkflowStore((state) => state.attachFileToNode)
  const selectNode = useWorkflowStore((state) => state.selectNode)
  const beginEditNode = useWorkflowStore((state) => state.beginEditNode)
  const editingNodeId = useWorkflowStore((state) => state.editingNodeId)
  const updateTextNode = useWorkflowStore((state) => state.updateTextNode)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const Icon = icons[data.materialType]
  const canUpload = data.materialType === 'image' || data.materialType === 'video'
  const isTextEditing = data.materialType === 'text' && editingNodeId === id
  const lastPointerDownAtRef = useRef(0)

  const enterTextEdit = () => {
    beginEditNode(id)
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('focus-node-composer', { detail: { nodeId: id } }))
    }, 0)
  }

  const handleBodyPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (data.materialType !== 'text') return

    const now = window.performance.now()
    const isFastSecondClick = now - lastPointerDownAtRef.current < 360
    lastPointerDownAtRef.current = now

    if (!isFastSecondClick) return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleNodeMouseDownCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (data.materialType !== 'text' || event.detail < 2) return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleNodeDoubleClickCapture = (event: React.MouseEvent<HTMLElement>) => {
    if (data.materialType !== 'text') return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleBodyClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (data.materialType === 'text' && event.detail > 1) return
    selectNode(id)
  }

  const handleBodyDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (canUpload && !data.value.url) {
      event.stopPropagation()
      inputRef.current?.click()
      return
    }

    if (data.materialType !== 'text') return
    event.stopPropagation()
    enterTextEdit()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) attachFile(id, file)
    event.target.value = ''
  }

  useEffect(() => {
    if (isTextEditing) {
      window.setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [isTextEditing])

  return (
    <article
      className={`${styles.nodeWrap} ${selected ? styles.selected : ''}`}
      onMouseDownCapture={handleNodeMouseDownCapture}
      onDoubleClickCapture={handleNodeDoubleClickCapture}
    >
      <div className={styles.title}>
        <Icon size={20} />
        <span>{data.title}</span>
        <span className={styles.status}>{statusLabel[data.status]}</span>
      </div>

      <div
        className={styles.body}
        onPointerDown={handleBodyPointerDown}
        onClick={handleBodyClick}
        onDoubleClick={handleBodyDoubleClick}
      >
        {isTextEditing ? (
          <textarea
            ref={textareaRef}
            className={`${styles.inlineEditor} nodrag nopan`}
            value={data.value.text ?? ''}
            placeholder="输入文本内容"
            onChange={(event) => updateTextNode(id, event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          />
        ) : (
          renderNodeBody(data, Icon, data.materialType === 'text' ? enterTextEdit : undefined)
        )}
      </div>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {canUpload ? (
        <input
          ref={inputRef}
          className="hidden"
          type="file"
          accept={acceptedMimeTypes[data.materialType]?.join(',')}
          onChange={handleFileChange}
        />
      ) : null}
    </article>
  )
}

function renderNodeBody(data: MaterialNodeData, Icon: ElementType, onTextStarterClick?: () => void) {
  if (data.materialType === 'text' && data.value.text) {
    return <p className={styles.textPreview}>{data.value.text}</p>
  }

  if (data.materialType === 'image' && data.value.url) {
    return (
      <img className={styles.mediaPreview} src={data.value.url} alt={data.value.fileName ?? '图片素材'} />
    )
  }

  if (data.materialType === 'video' && data.value.url) {
    return (
      <video
        className={styles.mediaPreview}
        src={data.value.url}
        playsInline
        controls
        preload="metadata"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      />
    )
  }

  if (data.value.text) {
    return (
      <div className={styles.generatedResult}>
        <Icon size={42} />
        <p>{data.value.text}</p>
      </div>
    )
  }

  return (
    <div className={styles.emptyState}>
      <Icon size={48} />
      <span>{emptyText[data.materialType]}</span>
      {data.materialType === 'text' ? (
        <div className={styles.starterActions}>
          <small>尝试：</small>
          {textStarterActions.map((action) => (
            <button
              key={action}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onTextStarterClick?.()
              }}
            >
              {action}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
