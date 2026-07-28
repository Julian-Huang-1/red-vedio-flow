import { Sparkles } from 'lucide-react'
import styles from './AgentDrawer.module.less'

type Props = {
  suggestions: string[]
}

export function AgentSkillPicker({ suggestions }: Props) {
  return (
    <section className={styles.skillBlock}>
      <div className={styles.blockTitle}>
        <span>选一个 Skill，让创作更快一步</span>
        <button type="button">换一批</button>
      </div>
      <div className={styles.skillGrid}>
        {suggestions.map((skill) => (
          <button key={skill} type="button">
            <Sparkles size={15} />
            {skill}
          </button>
        ))}
      </div>
    </section>
  )
}
