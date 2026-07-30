import { FileText, Image, Play } from 'lucide-react'
import { MaterialNode } from '../../components/workflow/nodes/MaterialNode'
import type { FrontendFeatureActivator } from '../../extension-system/types'

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.canvas.registerNodeType({
      id: 'material.text',
      order: 10,
      materialType: 'text',
      title: '文本节点',
      menuLabel: '文本',
      emptyText: '暂无文本内容',
      promptPlaceholder: '给 AI 的生成指令。例如：扩写成 60 秒都市逆袭短剧脚本。',
      icon: FileText,
      component: MaterialNode,
      defaultSize: { width: 360, height: 220 },
      editable: true,
    }),
    app.canvas.registerNodeType({
      id: 'material.image',
      order: 20,
      materialType: 'image',
      title: '图片节点',
      menuLabel: '图片',
      emptyText: '点击上传图片',
      promptPlaceholder: '描述要生成或修改的画面。例如：女主站在雨夜写字楼门口，电影感，竖屏。',
      icon: Image,
      component: MaterialNode,
      defaultSize: { width: 560, height: 280 },
      uploadable: true,
    }),
    app.canvas.registerNodeType({
      id: 'material.video',
      order: 30,
      materialType: 'video',
      title: '视频节点',
      menuLabel: '视频',
      emptyText: '点击上传视频',
      promptPlaceholder: '描述视频动作和镜头。例如：镜头缓慢推进，女主抬头看向镜头，6 秒。',
      icon: Play,
      component: MaterialNode,
      defaultSize: { width: 560, height: 280 },
      uploadable: true,
    }),
  ]

  return () => {
    for (const registration of registrations.reverse()) registration.dispose()
  }
}
