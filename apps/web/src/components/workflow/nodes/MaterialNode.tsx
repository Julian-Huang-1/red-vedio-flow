import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import { FileText, Image, Play } from 'lucide-react'
import type { ElementType } from 'react'
import { acceptedMimeTypes, type MaterialNodeData, type MaterialType } from '@red-video-flow/workflow-core'
import { NodePromptComposer } from '../prompt/NodePromptComposer'
import { useMaterialNode } from './MaterialNode.logic'
import { MaterialNodePrimitive as NodeUi } from './MaterialNode.primitives'
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

const textStarterActions = ['自己编写内容', '文生视频', '图片反推提示词', '文字生音乐']

type MaterialFlowNode = Node<MaterialNodeData, 'material'>

export function MaterialNode({ id, data, selected }: NodeProps<MaterialFlowNode>) {
  const materialNode = useMaterialNode({ id, data })
  const Icon = icons[data.materialType]

  return (
    <NodeUi.Root
      selected={selected}
      data-material-type={data.materialType}
      data-status={data.status}
      data-editing={materialNode.isTextEditing || undefined}
      onMouseDownCapture={materialNode.handleNodeMouseDownCapture}
      onDoubleClickCapture={materialNode.handleNodeDoubleClickCapture}
    >
      <NodeUi.Title>
        <Icon size={20} />
        <span>{data.title}</span>
        <NodeUi.Status>{statusLabel[data.status]}</NodeUi.Status>
      </NodeUi.Title>

      <NodeUi.Body
        onPointerDown={materialNode.handleBodyPointerDown}
        onClick={materialNode.handleBodyClick}
        onDoubleClick={materialNode.handleBodyDoubleClick}
      >
        {materialNode.isTextEditing ? (
          <NodeUi.Editor
            editorRef={materialNode.textareaRef}
            value={data.value.text ?? ''}
            placeholder="输入文本内容"
            onChange={(event) => materialNode.updateText(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
          />
        ) : (
          <MaterialNodeBody data={data} icon={Icon} onTextStarterClick={materialNode.enterTextEdit} />
        )}
      </NodeUi.Body>

      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      {materialNode.canUpload ? (
        <NodeUi.FileInput
          inputRef={materialNode.inputRef}
          accept={acceptedMimeTypes[data.materialType]?.join(',')}
          onChange={materialNode.handleFileChange}
        />
      ) : null}

      {materialNode.shouldShowComposer && materialNode.node ? (
        <NodePromptComposer node={materialNode.node} />
      ) : null}
    </NodeUi.Root>
  )
}

function MaterialNodeBody({
  data,
  icon: Icon,
  onTextStarterClick,
}: {
  data: MaterialNodeData
  icon: ElementType
  onTextStarterClick: () => void
}) {
  if (data.materialType === 'text' && data.value.text) {
    return <p className={styles.textPreview}>{data.value.text}</p>
  }

  if (data.materialType === 'image' && data.value.url) {
    return <img className={styles.mediaPreview} src={data.value.url} alt={data.value.fileName ?? '图片素材'} />
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
                onTextStarterClick()
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
