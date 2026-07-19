import { SkillChipsPrimitive as Chips } from './HomePrimitives'

const skillChips = ['皮克斯动画广告', '爆款拉片复刻', '新中式美学TVC', '古典武侠电影全流程', '游戏实机PV', '精品女频短剧一键成片']

type SkillChipsProps = {
  onSelect: () => void
}

export function SkillChips({ onSelect }: SkillChipsProps) {
  return (
    <Chips.Root>
      {skillChips.map((skill) => (
        <Chips.Chip key={skill} onClick={onSelect}>
          <Chips.Thumb />
          {skill}
        </Chips.Chip>
      ))}
      <Chips.Chip onClick={onSelect}>全部 Skill ›</Chips.Chip>
    </Chips.Root>
  )
}
