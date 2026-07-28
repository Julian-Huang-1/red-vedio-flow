import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft, Check, Clipboard, Search } from 'lucide-react'
import { useComponentShowcase, useCopyFeedback } from './ComponentShowcase.logic'
import { ComponentShowcasePrimitive as Showcase } from './ComponentShowcase.primitives'
import type { ShowcaseItem } from './showcaseRegistry'
import styles from './ComponentShowcase.module.less'

export function ComponentShowcase() {
  const showcase = useComponentShowcase()

  return (
    <ReactFlowProvider>
      <Showcase.Root>
        <Showcase.Sidebar>
          <a className={styles.backLink} href="/">
            <ArrowLeft size={18} />
            返回工作流
          </a>
          <div className={styles.sidebarTitle}>
            <h1>Component Registry</h1>
            <p>组件预览、代码片段和可复制 Prompt。</p>
          </div>
          <label className={styles.searchBox}>
            <Search size={16} />
            <input
              value={showcase.query}
              placeholder="搜索组件"
              onChange={(event) => showcase.setQuery(event.target.value)}
            />
          </label>
          <Showcase.Navigation>
            {showcase.filteredItems.map((item) => (
              <Showcase.NavigationItem
                key={item.id}
                active={item.id === showcase.selectedItem.id}
                onClick={() => showcase.select(item.id)}
              >
                <span>{item.title}</span>
                <small>{item.category}</small>
              </Showcase.NavigationItem>
            ))}
          </Showcase.Navigation>
        </Showcase.Sidebar>

        <Showcase.Content>
          {showcase.selectedItem ? <ShowcaseDetail item={showcase.selectedItem} /> : null}
        </Showcase.Content>
      </Showcase.Root>
    </ReactFlowProvider>
  )
}

function ShowcaseDetail({ item }: { item: ShowcaseItem }) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <span className={styles.category}>{item.category}</span>
          <h2>{item.title}</h2>
          <p>{item.description}</p>
        </div>
      </header>

      <Showcase.Panel>
        <div className={styles.panelHeader}>
          <h3>Preview</h3>
        </div>
        <div className={styles.previewStage}>{item.preview()}</div>
      </Showcase.Panel>

      <section className={styles.resourceGrid}>
        <RegistryBlock title="Code" value={item.code} />
        <RegistryBlock title="Prompt" value={item.prompt} />
      </section>
    </>
  )
}

function RegistryBlock({ title, value }: { title: string; value: string }) {
  return (
    <article className={styles.registryBlock}>
      <div className={styles.panelHeader}>
        <h3>{title}</h3>
        <CopyButton value={value} label={`复制 ${title}`} />
      </div>
      <pre>
        <code>{value}</code>
      </pre>
    </article>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const feedback = useCopyFeedback(value)

  return (
    <button className={styles.copyButton} data-copied={feedback.copied || undefined} onClick={feedback.copy}>
      {feedback.copied ? <Check size={15} /> : <Clipboard size={15} />}
      {feedback.copied ? '已复制' : label}
    </button>
  )
}
