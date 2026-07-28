import { Clapperboard, FileText, Image, Library, Mic2, PanelsTopLeft, ScrollText, Video } from 'lucide-react'
import type { ElementType } from 'react'
import type { MaterialType } from '@red-video-flow/workflow-core'
import { useAddNodeMenu } from './AddNodeMenu.logic'
import { AddNodeMenuPrimitive as Menu } from './AddNodeMenu.primitives'

type NodeItem = {
  materialType?: MaterialType
  label: string
  icon: ElementType
  tag?: string
}

const nodeItems: NodeItem[] = [
  { materialType: 'text', label: '文本', icon: FileText },
  { materialType: 'image', label: '图片', icon: Image },
  { materialType: 'video', label: '视频', icon: Video },
  { label: '视频合成', icon: Clapperboard, tag: 'Beta' },
  { label: '导演台', icon: PanelsTopLeft, tag: 'New' },
  { label: '音频', icon: Mic2, tag: '即将支持' },
  { label: '脚本', icon: ScrollText, tag: '即将支持' },
  { label: '素材库', icon: Library, tag: 'New' },
]

export function AddNodeMenu() {
  const menu = useAddNodeMenu()

  if (!menu.isOpen) return null

  return (
    <Menu.Root
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      style={menu.position}
    >
      <Menu.SectionTitle>添加节点</Menu.SectionTitle>
      <Menu.ItemList>
        {nodeItems.map((item) => {
          const Icon = item.icon
          return (
            <Menu.Item
              key={item.label}
              unavailable={!item.materialType}
              onClick={() => {
                if (item.materialType) menu.createNode(item.materialType)
              }}
              disabled={!item.materialType}
            >
              <Icon size={22} />
              <span>{item.label}</span>
              {item.tag ? <small>{item.tag}</small> : null}
            </Menu.Item>
          )
        })}
      </Menu.ItemList>
      <Menu.SectionTitle>添加资源</Menu.SectionTitle>
      <Menu.ItemList>
        <Menu.Item unavailable disabled>
          <Image size={22} />
          <span>上传</span>
          <small>节点内可用</small>
        </Menu.Item>
        <Menu.Item unavailable disabled>
          <Library size={22} />
          <span>从生成历史选择</span>
          <small>即将支持</small>
        </Menu.Item>
      </Menu.ItemList>
    </Menu.Root>
  )
}
