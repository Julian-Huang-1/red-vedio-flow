import { addNodeMenuShowcase } from './addNodeMenuShowcase'
import { agentDrawerShowcase } from './agentDrawerShowcase'
import { homeShowcases } from './homeShowcases'
import { materialNodeShowcases } from './materialNodeShowcases'
import type { ShowcaseItem } from './types'

export type { ShowcaseItem } from './types'

export const showcaseItems: ShowcaseItem[] = [
  ...materialNodeShowcases,
  agentDrawerShowcase,
  addNodeMenuShowcase,
  ...homeShowcases,
]
