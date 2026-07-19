import { ReactFlowProvider } from '@xyflow/react'
import { ArrowLeft, Check, Clipboard, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { showcaseItems, type ShowcaseItem } from './showcaseRegistry'
import styles from './ComponentShowcase.module.less'

export function ComponentShowcase() {
  const [selectedId, setSelectedId] = useState(showcaseItems[0]?.id)
  const [query, setQuery] = useState('')
  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return showcaseItems
    return showcaseItems.filter((item) =>
      `${item.title} ${item.category} ${item.description}`.toLowerCase().includes(keyword),
    )
  }, [query])
  const selectedItem = showcaseItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? showcaseItems[0]

  return (
    <ReactFlowProvider>
      <main className={styles.page}>
        <aside className={styles.sidebar}>
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
              value={query}
              placeholder="搜索组件"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <nav className={styles.navList} aria-label="组件列表">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                data-active={item.id === selectedItem.id ? true : undefined}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{item.title}</span>
                <small>{item.category}</small>
              </button>
            ))}
          </nav>
        </aside>

        <section className={styles.content}>
          {selectedItem ? <ShowcaseDetail item={selectedItem} /> : null}
        </section>
      </main>
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

      <section className={styles.previewPanel}>
        <div className={styles.panelHeader}>
          <h3>Preview</h3>
        </div>
        <div className={styles.previewStage}>{item.preview()}</div>
      </section>

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
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button className={styles.copyButton} data-copied={copied ? true : undefined} onClick={() => void copy()}>
      {copied ? <Check size={15} /> : <Clipboard size={15} />}
      {copied ? '已复制' : label}
    </button>
  )
}
