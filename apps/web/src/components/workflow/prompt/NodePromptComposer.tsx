import type { Node } from '@xyflow/react'
import { ArrowUp, Bot, FileText, Image, Play, X } from 'lucide-react'
import type { ElementType } from 'react'
import type { MaterialNodeData, MaterialType } from '@red-video-flow/workflow-core'
import { useNodePromptComposer } from './NodePromptComposer.logic'
import { NodePromptComposerPrimitive as Composer } from './NodePromptComposer.primitives'
import styles from './NodePromptComposer.module.less'

const icons: Record<MaterialType, ElementType> = {
  text: FileText,
  image: Image,
  video: Play,
}

const placeholders: Record<MaterialType, string> = {
  text: '给 AI 的生成指令。例如：扩写成 60 秒都市逆袭短剧脚本。',
  image: '描述要生成或修改的画面。例如：女主站在雨夜写字楼门口，电影感，竖屏。',
  video: '描述视频动作和镜头。例如：镜头缓慢推进，女主抬头看向镜头，6 秒。',
}

type Props = {
  node: Node<MaterialNodeData, 'material'>
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation()

export function NodePromptComposer({ node }: Props) {
  const composer = useNodePromptComposer(node)

  return (
    <Composer.Root
      data-material-type={node.data.materialType}
      data-state={node.data.status === 'running' ? 'running' : 'idle'}
      style={{ width: Math.max(node.width ?? 520, 520) }}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
    >
      <Composer.Close onClick={composer.close}>
        <X size={20} />
      </Composer.Close>
      {composer.visibleInputMaterials.length > 0 ? (
        <Composer.Materials>
          {composer.visibleInputMaterials.map((inputMaterial, index) => (
            <Composer.Material
              key={inputMaterial.id}
              data-material-type={inputMaterial.data.materialType}
              title={inputMaterial.data.title}
            >
              <span className={styles.counter}>{index + 1}</span>
              <MaterialPreview data={inputMaterial.data} />
            </Composer.Material>
          ))}
          {composer.hiddenInputMaterialCount > 0 ? (
            <Composer.Material data-overflow>
              +{composer.hiddenInputMaterialCount}
            </Composer.Material>
          ) : null}
        </Composer.Materials>
      ) : null}
      <Composer.Input
        inputRef={composer.textareaRef}
        value={composer.prompt}
        placeholder={placeholders[node.data.materialType]}
        onMouseDown={stopPropagation}
        onMouseUp={stopPropagation}
        onPointerDown={stopPropagation}
        onPointerUp={stopPropagation}
        onClick={stopPropagation}
        onDoubleClick={stopPropagation}
        onContextMenu={stopPropagation}
        onChange={(event) => composer.setPrompt(event.target.value)}
        onKeyDown={composer.handleKeyDown}
      />
      <Composer.Footer>
        <div className={styles.footerMeta}>
          {composer.isVisualNode ? (
            <span className={styles.visualModel}>
              <Bot size={16} />
              {composer.visualModelLabel}
            </span>
          ) : (
            <label className={styles.agentSelect}>
              <Bot size={16} />
              <select
                value={composer.selectedAgentId ?? ''}
                disabled={composer.agentStatus === 'loading' || composer.availableAgents.length === 0}
                onChange={(event) => composer.selectAgent(event.target.value)}
                aria-label="选择本地 Agent"
              >
                {composer.availableAgents.length === 0 ? (
                  <option value="">{composer.agentStatus === 'loading' ? '扫描中' : '本地 Agent'}</option>
                ) : (
                  composer.availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
        </div>
        <div className={styles.footerActions}>
          <Composer.Submit
            data-disabled={composer.sendDisabled || undefined}
            onPointerDown={stopPropagation}
            onClick={(event) => {
              event.stopPropagation()
              composer.submit()
            }}
            disabled={composer.sendDisabled}
          >
            <ArrowUp size={24} />
          </Composer.Submit>
        </div>
      </Composer.Footer>
    </Composer.Root>
  )
}

function MaterialPreview({ data }: { data: MaterialNodeData }) {
  const Icon = icons[data.materialType]

  if (data.materialType === 'image' && data.value.url) {
    return <img className={styles.materialPreview} src={data.value.url} alt={data.value.fileName ?? data.title} />
  }
  if (data.materialType === 'video' && data.value.url) {
    return <video className={styles.materialPreview} src={data.value.url} muted playsInline preload="metadata" />
  }
  return <Icon size={27} />
}
