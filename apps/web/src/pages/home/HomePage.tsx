import { InspirationBox } from './components/InspirationBox'
import { RecentWorkflowRail } from './components/RecentWorkflowRail'
import { SkillChips } from './components/SkillChips'
import { StartActions } from './components/StartActions'
import { StartHeader } from './components/StartHeader'
import { useHomePage } from './HomePage.logic'
import styles from '../../App.module.less'

export function HomePage() {
  const page = useHomePage()

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-canvas text-white"
      data-state={page.error ? 'error' : page.isBusy ? 'busy' : 'ready'}
    >
      <section className={styles.startScreen}>
        <StartHeader />
        <RecentWorkflowRail workflows={page.recentWorkflows} onOpenCanvas={page.openCanvas} />
        <StartActions
          disabled={page.isBusy}
          isCreating={page.isCreating}
          onCreate={page.createCanvas}
        />
        <InspirationBox onSubmit={page.createCanvas} />
        <SkillChips onSelect={page.createCanvas} />

        {page.error ? <p className={styles.startError}>{page.error}</p> : null}
      </section>
    </main>
  )
}
