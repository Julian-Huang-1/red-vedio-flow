import { Image, Library } from 'lucide-react'
import { useAddNodeMenu } from './AddNodeMenu.logic'
import { AddNodeMenuPrimitive as Menu } from './AddNodeMenu.primitives'

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
        {menu.nodeTypes.map((nodeType) => {
          const Icon = nodeType.icon
          return (
            <Menu.Item
              key={nodeType.id}
              onClick={() => menu.createNode(nodeType.materialType)}
            >
              <Icon size={22} />
              <span>{nodeType.menuLabel}</span>
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
