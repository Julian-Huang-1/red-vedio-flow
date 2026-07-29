import { InspirationBox } from '../../home/components/InspirationBox'
import { RecentWorkflowRail } from '../../home/components/RecentWorkflowRail'
import { SkillChips } from '../../home/components/SkillChips'
import { StartActions } from '../../home/components/StartActions'
import { StartHeader } from '../../home/components/StartHeader'
import styles from '../ComponentShowcase.module.less'
import type { ShowcaseItem } from './types'

export const homeShowcases: ShowcaseItem[] = [
  {
    id: 'home-header',
    title: 'StartHeader',
    category: 'home',
    description: '首页顶部品牌与操作入口，使用组合式 primitive 和 data-variant 样式。',
    preview: () => (
      <div className={styles.homePreview}>
        <StartHeader />
      </div>
    ),
  },
  {
    id: 'recent-workflow-rail',
    title: 'RecentWorkflowRail',
    category: 'home',
    description: '首页历史画布卡片轨道，支持占位和真实工作流两种状态。',
    preview: () => (
      <div className={styles.homePreview}>
        <RecentWorkflowRail workflows={[]} onOpenCanvas={() => undefined} />
      </div>
    ),
  },
  {
    id: 'home-start-actions',
    title: 'StartActions',
    category: 'home',
    description: '首页开始创作和快速体验操作区。',
    preview: () => <StartActions disabled={false} isCreating={false} onCreate={() => undefined} />,
  },
  {
    id: 'inspiration-box',
    title: 'InspirationBox',
    category: 'home',
    description: '首页灵感输入框和工具按钮组。',
    preview: () => <InspirationBox onSubmit={() => undefined} />,
  },
  {
    id: 'skill-chips',
    title: 'SkillChips',
    category: 'home',
    description: '首页 Skill 快捷入口列表。',
    preview: () => <SkillChips onSelect={() => undefined} />,
  },
]
