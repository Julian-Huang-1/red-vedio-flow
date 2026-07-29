import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft, Search } from 'lucide-react'
import { useComponentShowcase } from './ComponentShowcase.logic'
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
            <h1>Components</h1>
            <p>组件展示与状态预览。</p>
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
        <div className={styles.previewStage}>{item.preview()}</div>
      </Showcase.Panel>
    </>
  )
}
