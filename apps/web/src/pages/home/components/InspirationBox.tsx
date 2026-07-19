import { Box, ImagePlus, Plus, RotateCcw, Send } from 'lucide-react'
import { InspirationBoxPrimitive as Composer } from './HomePrimitives'

type InspirationBoxProps = {
  onSubmit: () => void
}

export function InspirationBox({ onSubmit }: InspirationBoxProps) {
  return (
    <Composer.Root
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <textarea name="inspiration" placeholder="请输入你的创作灵感，或从下方挑选一个 Skill 开始" />
      <Composer.Footer>
        <Composer.Tools>
          <Composer.IconButton title="添加素材">
            <Plus size={20} />
          </Composer.IconButton>
          <Composer.IconButton title="素材库">
            <Box size={18} />
          </Composer.IconButton>
          <Composer.IconButton title="导入图片">
            <ImagePlus size={18} />
          </Composer.IconButton>
          <Composer.IconButton title="重置">
            <RotateCcw size={17} />
          </Composer.IconButton>
        </Composer.Tools>
        <Composer.Submit title="开始创作">
          <Send size={18} />
        </Composer.Submit>
      </Composer.Footer>
    </Composer.Root>
  )
}
