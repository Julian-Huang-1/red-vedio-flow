import { Crown, HelpCircle, Store, WandSparkles, Zap } from 'lucide-react'
import { StartHeaderPrimitive as Header } from './HomePrimitives'

export function StartHeader() {
  return (
    <Header.Root>
      <Header.Brand>
        <Header.LogoMark />
        <span>red-vedio-flow</span>
      </Header.Brand>
      <Header.Nav aria-label="开始页导航">
        <Header.Action variant="challenge">
          <Crown size={15} />
          创作者挑战赛
        </Header.Action>
        <Header.Action title="实验室">
          <WandSparkles size={17} />
        </Header.Action>
        <Header.Action title="帮助">
          <HelpCircle size={17} />
        </Header.Action>
        <Header.Action variant="market">
          <Store size={16} />
          会员超市
        </Header.Action>
        <Header.Action variant="member">
          <Zap size={14} />
          开通会员
        </Header.Action>
      </Header.Nav>
    </Header.Root>
  )
}
