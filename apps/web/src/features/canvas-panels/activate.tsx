import { Clock3, HelpCircle, Library, Sparkles, UserRound } from 'lucide-react'
import type { FrontendFeatureActivator } from '../../extension-system/types'
import {
  AssetLibraryPanel,
  CharacterLibraryPanel,
  HistoryPanel,
  ShortcutsPanel,
  ToolboxPanel,
} from './CanvasPanelContents'

export const activate: FrontendFeatureActivator = (app) => {
  const registrations = [
    app.canvas.registerPanel({
      id: 'toolbox',
      order: 10,
      title: '工具箱',
      icon: Sparkles,
      component: ToolboxPanel,
    }),
    app.canvas.registerPanel({
      id: 'assets',
      order: 20,
      title: '素材库',
      icon: Library,
      component: AssetLibraryPanel,
    }),
    app.canvas.registerPanel({
      id: 'characters',
      order: 30,
      title: '角色库',
      icon: UserRound,
      component: CharacterLibraryPanel,
    }),
    app.canvas.registerPanel({
      id: 'history',
      order: 40,
      title: '历史记录',
      icon: Clock3,
      component: HistoryPanel,
    }),
    app.canvas.registerPanel({
      id: 'shortcuts',
      order: 50,
      title: '快捷键',
      icon: HelpCircle,
      component: ShortcutsPanel,
    }),
  ]

  return () => {
    for (const registration of registrations.reverse()) registration.dispose()
  }
}
