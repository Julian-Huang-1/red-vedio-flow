import { ReactFlowProvider } from '@xyflow/react'
import { Box, Crown, HelpCircle, ImagePlus, Plus, RotateCcw, Send, Store, WandSparkles, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AgentDrawer } from './components/layout/AgentDrawer'
import { AssetManager } from './components/layout/AssetManager'
import { BottomToolbar } from './components/layout/BottomToolbar'
import { CanvasZoomIndicator } from './components/layout/CanvasZoomIndicator'
import { CanvasToolRail } from './components/layout/CanvasToolRail'
import { TopBar } from './components/layout/TopBar'
import { WorkflowCanvas } from './components/workflow/WorkflowCanvas'
import { ComponentShowcase } from './pages/ComponentShowcase'
import { useWorkflowStore } from './store/workflowStore'
import styles from './App.module.less'

const skillChips = ['皮克斯动画广告', '爆款拉片复刻', '新中式美学TVC', '古典武侠电影全流程', '游戏实机PV', '精品女频短剧一键成片']
const historyCardTones = ['orange', 'blue', 'mono'] as const
const placeholderCards = [
  { title: '等待第一张画布', subtitle: '创建后会自动沉淀到这里' },
  { title: '暂无画布', subtitle: '点击开始创作，新建你的第一个视频工作流' },
  { title: '历史画布入口', subtitle: '最近编辑的画布会优先展示' },
]

function navigateTo(pathname: string) {
  window.history.pushState({}, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function useCurrentPathname() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  return pathname
}

function HomePage() {
  const workflows = useWorkflowStore((state) => state.workflows)
  const workflowListStatus = useWorkflowStore((state) => state.workflowListStatus)
  const persistenceStatus = useWorkflowStore((state) => state.persistenceStatus)
  const persistenceError = useWorkflowStore((state) => state.persistenceError)
  const workflowListError = useWorkflowStore((state) => state.workflowListError)
  const loadWorkflows = useWorkflowStore((state) => state.loadWorkflows)
  const createWorkflow = useWorkflowStore((state) => state.createWorkflow)

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  const createCanvasAndOpen = async () => {
    const workflow = await createWorkflow()
    if (workflow) navigateTo(`/canvas/${encodeURIComponent(workflow.id)}`)
  }
  const recentWorkflows = useMemo(
    () => [...workflows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 3),
    [workflows],
  )
  const openCanvas = (workflowId: string) => {
    navigateTo(`/canvas/${encodeURIComponent(workflowId)}`)
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
      <section className={styles.startScreen}>
            <header className={styles.startHeader}>
              <div className={styles.startBrand}>
                <span className={styles.logoMark} />
                <span>red-vedio-flow</span>
              </div>
              <nav className={styles.startNav} aria-label="开始页导航">
                <button className={styles.challengeButton}>
                  <Crown size={15} />
                  创作者挑战赛
                </button>
                <button title="实验室">
                  <WandSparkles size={17} />
                </button>
                <button title="帮助">
                  <HelpCircle size={17} />
                </button>
                <button className={styles.marketButton}>
                  <Store size={16} />
                  会员超市
                </button>
                <button className={styles.memberButton}>
                  <Zap size={14} />
                  开通会员
                </button>
              </nav>
            </header>

            <div className={styles.heroRail} aria-label="历史画布">
              <button className={styles.carouselArrow} title="上一张">‹</button>
              {(recentWorkflows.length ? recentWorkflows : placeholderCards).map((item, index) => {
                if (!('id' in item)) {
                  return (
                    <div
                      key={item.title}
                      className={`${styles.heroCard} ${styles.heroCardPlaceholder} ${styles[`heroCard${historyCardTones[index]}`]}`}
                    >
                      <span className={styles.cardLogo}>red</span>
                      <div>
                        <h2>{item.title}</h2>
                        <p>{item.subtitle}</p>
                      </div>
                      <span className={styles.cardScene}>{index === 1 ? 'NEW' : `0${index + 1}`}</span>
                    </div>
                  )
                }
                const workflow = item
                const canvasTitle = workflow.title === '默认工作流' ? '未命名工作区' : workflow.title
                const updatedAt = new Date(workflow.updatedAt).toLocaleString('zh-CN', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
                return (
                  <button
                    key={workflow.id}
                    className={`${styles.heroCard} ${styles[`heroCard${historyCardTones[index]}`]}`}
                    onClick={() => openCanvas(workflow.id)}
                  >
                    <span className={styles.cardLogo}>red</span>
                    <div>
                      <h2>{canvasTitle}</h2>
                      <p>{workflow.graph.nodes.length} 个节点 · 更新于 {updatedAt}</p>
                    </div>
                    <span className={styles.cardScene}>画布 {index + 1}</span>
                  </button>
                )
              })}
              <button className={styles.carouselArrow} title="下一张">›</button>
            </div>
            {recentWorkflows.length > 1 ? (
              <div className={styles.heroDots} aria-hidden="true">
                {recentWorkflows.map((workflow, index) => (
                  <span key={workflow.id} className={index === 0 ? styles.heroDotActive : ''} />
                ))}
              </div>
            ) : null}

            <div className={styles.startActions}>
              <button
                className={styles.startButton}
                disabled={workflowListStatus === 'loading' || persistenceStatus === 'saving'}
                onClick={() => void createCanvasAndOpen()}
              >
                <Plus size={22} />
                <span>{persistenceStatus === 'saving' ? '创建中' : '开始创作'}</span>
              </button>
              <button className={styles.quickButton} disabled={workflowListStatus === 'loading'}>
                快速体验 Seedance 2.0
              </button>
            </div>

            <form
              className={styles.inspirationBox}
              onSubmit={(event) => {
                event.preventDefault()
                void createCanvasAndOpen()
              }}
            >
              <textarea placeholder="请输入你的创作灵感，或从下方挑选一个 Skill 开始" />
              <div className={styles.inspirationFooter}>
                <div>
                  <button type="button" title="添加素材">
                    <Plus size={20} />
                  </button>
                  <button type="button" title="素材库">
                    <Box size={18} />
                  </button>
                  <button type="button" title="导入图片">
                    <ImagePlus size={18} />
                  </button>
                  <button type="button" title="重置">
                    <RotateCcw size={17} />
                  </button>
                </div>
                <button className={styles.submitButton} type="submit" title="开始创作">
                  <Send size={18} />
                </button>
              </div>
            </form>

            <div className={styles.skillChips}>
              {skillChips.map((skill) => (
                <button key={skill} onClick={() => void createCanvasAndOpen()}>
                  <span className={styles.chipThumb} />
                  {skill}
                </button>
              ))}
              <button onClick={() => void createCanvasAndOpen()}>全部 Skill ›</button>
            </div>

            {persistenceStatus === 'error' ? (
              <p className={styles.startError}>{persistenceError ?? workflowListError}</p>
            ) : null}
      </section>
    </main>
  )
}

function CanvasEditorPage({ workflowId }: { workflowId: string }) {
  const nodes = useWorkflowStore((state) => state.nodes)
  const edges = useWorkflowStore((state) => state.edges)
  const loadedWorkflowId = useWorkflowStore((state) => state.workflowId)
  const hasLoadedWorkflow = useWorkflowStore((state) => state.hasLoadedWorkflow)
  const loadWorkflow = useWorkflowStore((state) => state.loadWorkflow)
  const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow)

  useEffect(() => {
    if (!workflowId) return
    if (hasLoadedWorkflow && loadedWorkflowId === workflowId) return
    void loadWorkflow(workflowId)
  }, [hasLoadedWorkflow, loadedWorkflowId, loadWorkflow, workflowId])

  useEffect(() => {
    if (!hasLoadedWorkflow || loadedWorkflowId !== workflowId) return
    const timeout = window.setTimeout(() => {
      void saveWorkflow()
    }, 800)

    return () => window.clearTimeout(timeout)
  }, [edges, hasLoadedWorkflow, loadedWorkflowId, nodes, saveWorkflow, workflowId])

  return (
    <ReactFlowProvider>
      <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
        <WorkflowCanvas />
        <CanvasToolRail />
        <AssetManager />
        <CanvasZoomIndicator />
        <AgentDrawer />
        <TopBar navigateTo={navigateTo} />
        <BottomToolbar />
      </main>
    </ReactFlowProvider>
  )
}

export default function App() {
  const pathname = useCurrentPathname()
  const canvasWorkflowId = useMemo(() => {
    const match = pathname.match(/^\/canvas\/([^/]+)$/)
    return match ? decodeURIComponent(match[1]) : undefined
  }, [pathname])

  if (pathname === '/components') return <ComponentShowcase />
  if (canvasWorkflowId) return <CanvasEditorPage workflowId={canvasWorkflowId} />

  return <HomePage />
}
