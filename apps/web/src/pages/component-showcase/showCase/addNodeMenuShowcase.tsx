import { FileText, Image, Play, Plus } from 'lucide-react'
import styles from '../ComponentShowcase.module.less'
import type { ShowcaseItem } from './types'

export const addNodeMenuShowcase: ShowcaseItem = {
  id: 'add-node-menu',
  title: 'AddNodeMenu',
  category: 'workflow',
  description: '右键或双击画布时使用的节点创建菜单。',
  preview: () => (
    <div className={styles.fakeMenu}>
      <span>添加节点</span>
      <button><FileText size={18} />文本</button>
      <button><Image size={18} />图片</button>
      <button><Play size={18} />视频</button>
      <span>添加资源</span>
      <button><Plus size={18} />上传</button>
    </div>
  ),
}
