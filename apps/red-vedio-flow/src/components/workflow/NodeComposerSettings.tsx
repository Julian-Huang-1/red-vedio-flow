import { useState } from 'react'
import type {
  GenerationConfig,
  ModelParameterField,
  ModelSelection,
} from '@red-video-flow/workflow-core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  createGenerationConfig,
  getComposerModel,
  getComposerModels,
} from './modelCatalog'
import type { WorkflowNodeKind } from './workflowTypes'

type NodeComposerSettingsProps = {
  kind: WorkflowNodeKind
  model: ModelSelection
  generationConfig: GenerationConfig
  onModelChange: (model: ModelSelection, config: GenerationConfig) => void
  onGenerationConfigChange: (config: GenerationConfig) => void
}

export function NodeComposerSettings({
  kind,
  model,
  generationConfig,
  onModelChange,
  onGenerationConfigChange,
}: NodeComposerSettingsProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const models = getComposerModels(kind)
  const definition = getComposerModel(model) ?? models[0]
  if (!definition) return null

  const fields = definition.parameterSchema.fields.filter(
    (field) => showAdvanced || !field.advanced,
  )
  const values = generationConfig as unknown as Record<string, unknown>

  const updateField = (key: string, value: unknown) => {
    onGenerationConfigChange({
      ...generationConfig,
      [key]: value,
    } as GenerationConfig)
  }

  return (
    <section
      className="mt-3 border-t pt-3"
      data-workflow-composer-settings=""
      data-advanced={showAdvanced ? '' : undefined}
    >
      <div className="grid grid-cols-2 gap-2.5">
        <FieldShell label="模型" htmlFor="composer-model">
          <Select
            value={`${model.providerId}:${model.modelId}`}
            onValueChange={(value) => {
              const next = models.find(
                (candidate) => `${candidate.providerId}:${candidate.id}` === value,
              )
              if (!next) return
              onModelChange(
                { providerId: next.providerId, modelId: next.id },
                createGenerationConfig(next),
              )
            }}
          >
            <SelectTrigger id="composer-model" className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((candidate) => (
                <SelectItem
                  key={`${candidate.providerId}:${candidate.id}`}
                  value={`${candidate.providerId}:${candidate.id}`}
                >
                  {candidate.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>

        {fields.map((field) => (
          <ParameterField
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      {definition.parameterSchema.fields.some((field) => field.advanced) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-[11px] text-muted-foreground"
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? '收起高级参数' : '显示高级参数'}
        </Button>
      ) : null}
    </section>
  )
}

function ParameterField({
  field,
  value,
  onChange,
}: {
  field: ModelParameterField
  value: unknown
  onChange: (value: unknown) => void
}) {
  const id = `composer-parameter-${field.key}`

  if (field.type === 'select') {
    return (
      <FieldShell label={field.label} htmlFor={id} description={field.description}>
        <Select
          value={typeof value === 'string' ? value : undefined}
          onValueChange={onChange}
        >
          <SelectTrigger id={id} className="h-8 text-xs">
            <SelectValue placeholder="默认" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldShell>
    )
  }

  if (field.type === 'boolean') {
    const checked = value === true
    return (
      <FieldShell label={field.label} htmlFor={id} description={field.description}>
        <Button
          id={id}
          type="button"
          variant={checked ? 'secondary' : 'outline'}
          className="h-8 w-full justify-between px-3 text-xs font-normal"
          aria-pressed={checked}
          onClick={() => onChange(!checked)}
        >
          {checked ? '开启' : '关闭'}
          <span
            className="size-1.5 rounded-full bg-current"
            aria-hidden
          />
        </Button>
      </FieldShell>
    )
  }

  return (
    <FieldShell label={field.label} htmlFor={id} description={field.description}>
      <Input
        id={id}
        className="h-8 text-xs"
        type={field.type === 'number' ? 'number' : 'text'}
        value={typeof value === 'number' || typeof value === 'string' ? value : ''}
        min={field.type === 'number' ? field.min : undefined}
        max={field.type === 'number' ? field.max : undefined}
        step={field.type === 'number' ? field.step : undefined}
        placeholder={field.placeholder}
        onChange={(event) => {
          if (field.type === 'number') {
            onChange(event.target.value === '' ? undefined : event.target.valueAsNumber)
          } else {
            onChange(event.target.value || undefined)
          }
        }}
      />
    </FieldShell>
  )
}

function FieldShell({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string
  htmlFor: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 space-y-1.5" data-workflow-composer-field="">
      <Label htmlFor={htmlFor} className="block text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
      {description ? (
        <p className="text-[10px] leading-4 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
