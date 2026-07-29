import type { Node } from '@xyflow/react'
import { ArrowUp, Bot, FileText, X } from 'lucide-react'
import type { MaterialNodeData } from '@red-video-flow/workflow-core'
import { getNodeTypeContribution } from '../../../extension-system/nodeExtensions.logic'
import { useNodePromptComposer } from './NodePromptComposer.logic'
import { NodePromptComposerPrimitive as Composer } from './NodePromptComposer.primitives'
import styles from './NodePromptComposer.module.less'

type Props = {
  node: Node<MaterialNodeData, string>
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
        placeholder={composer.nodeDefinition?.promptPlaceholder ?? '描述希望生成的内容'}
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
      {composer.visualProviderOptionDefinitions.length > 0 ? (
        <div className={styles.providerOptions}>
          {composer.visualProviderOptionDefinitions.map((definition) => (
            <label className={styles.providerOption} key={definition.name}>
              <span>{definition.title}</span>
              {definition.enum ? (
                <select
                  value={String(
                    composer.selectedVisualProviderOptions[definition.name]
                    ?? definition.default
                    ?? '',
                  )}
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const value = definition.type === 'integer' || definition.type === 'number'
                      ? Number(rawValue)
                      : definition.type === 'boolean'
                        ? rawValue === 'true'
                        : rawValue
                    composer.setVisualProviderOption(definition.name, value)
                  }}
                >
                  {definition.enum.map((value, index) => (
                    <option value={String(value)} key={String(value)}>
                      {definition.enumNames?.[index] ?? String(value)}
                    </option>
                  ))}
                </select>
              ) : definition.type === 'boolean' ? (
                <select
                  value={String(
                    composer.selectedVisualProviderOptions[definition.name]
                    ?? definition.default
                    ?? false,
                  )}
                  onChange={(event) => (
                    composer.setVisualProviderOption(definition.name, event.target.value === 'true')
                  )}
                >
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              ) : (
                <input
                  type={definition.type === 'integer' || definition.type === 'number' ? 'number' : 'text'}
                  min={definition.minimum}
                  max={definition.maximum}
                  step={definition.type === 'integer' ? 1 : undefined}
                  value={String(
                    composer.selectedVisualProviderOptions[definition.name]
                    ?? definition.default
                    ?? '',
                  )}
                  onChange={(event) => {
                    const value = definition.type === 'integer' || definition.type === 'number'
                      ? Number(event.target.value)
                      : event.target.value
                    composer.setVisualProviderOption(definition.name, value)
                  }}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}
      <Composer.Footer>
        <div className={styles.footerMeta}>
          {composer.isVisualNode ? (
            <label className={styles.visualModel}>
              <Bot size={16} />
              <select
                value={composer.selectedVisualProviderId ?? ''}
                disabled={
                  composer.visualProviderStatus === 'loading'
                  || composer.availableVisualProviders.length === 0
                }
                onChange={(event) => composer.selectVisualProvider(event.target.value)}
                aria-label="选择视觉模型"
              >
                {composer.availableVisualProviders.length === 0 ? (
                  <option value="">
                    {composer.visualProviderStatus === 'loading' ? '扫描中' : '视觉模型'}
                  </option>
                ) : (
                  composer.availableVisualProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))
                )}
              </select>
            </label>
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
  const Icon = getNodeTypeContribution(data.materialType)?.icon ?? FileText

  if (data.materialType === 'image' && data.value.url) {
    return <img className={styles.materialPreview} src={data.value.url} alt={data.value.fileName ?? data.title} />
  }
  if (data.materialType === 'video' && data.value.url) {
    return <video className={styles.materialPreview} src={data.value.url} muted playsInline preload="metadata" />
  }
  return <Icon size={27} />
}
