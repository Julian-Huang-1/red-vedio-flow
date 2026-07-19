import type { WorkflowDocument } from '@red-video-flow/workflow-core'
import { RecentWorkflowRailPrimitive as Rail } from './HomePrimitives'

const historyCardTones = ['orange', 'blue', 'mono'] as const
const placeholderCards = [
  { title: '等待第一张画布', subtitle: '创建后会自动沉淀到这里' },
  { title: '暂无画布', subtitle: '点击开始创作，新建你的第一个视频工作流' },
  { title: '历史画布入口', subtitle: '最近编辑的画布会优先展示' },
]

type RecentWorkflowRailProps = {
  workflows: WorkflowDocument[]
  onOpenCanvas: (workflowId: string) => void
}

export function RecentWorkflowRail({ workflows, onOpenCanvas }: RecentWorkflowRailProps) {
  return (
    <>
      <Rail.Root aria-label="历史画布">
        <Rail.Arrow title="上一张">‹</Rail.Arrow>
        {(workflows.length ? workflows : placeholderCards).map((item, index) => {
          if (!('id' in item)) {
            return (
              <Rail.Card
                as="div"
                key={item.title}
                placeholder
                tone={historyCardTones[index]}
              >
                <Rail.Logo>red</Rail.Logo>
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.subtitle}</p>
                </div>
                <Rail.Scene>{index === 1 ? 'NEW' : `0${index + 1}`}</Rail.Scene>
              </Rail.Card>
            )
          }

          const canvasTitle = item.title === '默认工作流' ? '未命名工作区' : item.title
          const updatedAt = new Date(item.updatedAt).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })

          return (
            <Rail.Card
              key={item.id}
              tone={historyCardTones[index]}
              onClick={() => onOpenCanvas(item.id)}
            >
              <Rail.Logo>red</Rail.Logo>
              <div>
                <h2>{canvasTitle}</h2>
                <p>{item.graph.nodes.length} 个节点 · 更新于 {updatedAt}</p>
              </div>
              <Rail.Scene>画布 {index + 1}</Rail.Scene>
            </Rail.Card>
          )
        })}
        <Rail.Arrow title="下一张">›</Rail.Arrow>
      </Rail.Root>
      {workflows.length > 1 ? (
        <Rail.Dots aria-hidden="true">
          {workflows.map((workflow, index) => (
            <Rail.Dot key={workflow.id} active={index === 0} />
          ))}
        </Rail.Dots>
      ) : null}
    </>
  )
}
