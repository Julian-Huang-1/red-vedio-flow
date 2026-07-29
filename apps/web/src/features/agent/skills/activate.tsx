import { AgentSkillPicker } from '../../../components/layout/AgentSkillPicker'
import type { FrontendFeatureActivator } from '../../../extension-system/types'

const skillSuggestions = [
  '皮克斯动画广告',
  '爆款拉片复刻',
  '新中式美学TVC',
  '古典武侠电影全流程导演',
]

function AgentSkillPickerContribution() {
  return <AgentSkillPicker suggestions={skillSuggestions} />
}

export const activate: FrontendFeatureActivator = (app) =>
  app.ui.contribute(
    'agent.drawer.context',
    'agent.drawer.skill-picker',
    AgentSkillPickerContribution,
  )
