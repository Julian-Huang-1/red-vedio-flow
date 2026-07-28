import { Bug, Check, Copy, Search, Trash2, X } from 'lucide-react'
import type { WorkflowDebugEvent } from '@red-video-flow/workflow-client'
import {
  debugFilters,
  eventLabel,
  formatData,
  formatTime,
  isErrorEvent,
  useLocalServerDebugger,
} from './LocalServerDebugger.logic'
import { LocalServerDebuggerPrimitive as Debugger } from './LocalServerDebugger.primitives'
import styles from './LocalServerDebugger.module.less'

export function LocalServerDebugger() {
  const debuggerState = useLocalServerDebugger()

  return (
    <Debugger.Root
      data-shifted={debuggerState.isShifted || undefined}
      data-state={debuggerState.isOpen ? 'open' : 'closed'}
    >
      {debuggerState.isOpen ? (
        <Debugger.Panel>
          <header className={styles.header}>
            <div>
              <div className={styles.title}>
                <span className={styles.liveDot} />
                Local Server Debugger
              </div>
              <div className={styles.subtitle}>实时追踪 HTTP、SSE、耗时和错误</div>
            </div>
            <div className={styles.headerActions}>
              <button type="button" title="复制当前日志" onClick={debuggerState.copyLogs}>
                {debuggerState.copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button type="button" title="清空日志" onClick={debuggerState.clear}>
                <Trash2 size={16} />
              </button>
              <button type="button" title="关闭" onClick={debuggerState.close}>
                <X size={17} />
              </button>
            </div>
          </header>

          <div className={styles.toolbar}>
            <div className={styles.filters}>
              {debugFilters.map((item) => (
                <Debugger.Filter
                  key={item.id}
                  active={debuggerState.filter === item.id}
                  onClick={() => debuggerState.setFilter(item.id)}
                >
                  {item.label}
                  {item.id === 'error' && debuggerState.errorCount > 0 ? (
                    <span>{debuggerState.errorCount}</span>
                  ) : null}
                </Debugger.Filter>
              ))}
            </div>
            <label className={styles.search}>
              <Search size={14} />
              <input
                value={debuggerState.query}
                aria-label="搜索调试日志"
                placeholder="路径、状态、内容"
                onChange={(event) => debuggerState.setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className={styles.eventList}>
            {debuggerState.visibleEvents.length ? (
              debuggerState.visibleEvents.map((event) => <DebugEventRow key={event.id} event={event} />)
            ) : (
              <div className={styles.empty}>暂无匹配日志，等待与 local server 交互。</div>
            )}
            <div ref={debuggerState.endRef} />
          </div>

          <footer className={styles.footer}>
            <span>显示 {debuggerState.visibleEvents.length} / {debuggerState.events.length} 条</span>
            <span>最多保留 500 条</span>
          </footer>
        </Debugger.Panel>
      ) : null}

      <Debugger.Trigger
        error={debuggerState.errorCount > 0}
        aria-label="打开 Local Server DevTools"
        aria-expanded={debuggerState.isOpen}
        title="Local Server DevTools"
        onClick={debuggerState.toggle}
      >
        <Bug size={17} />
        <span>DevTools</span>
        {debuggerState.events.length ? <strong>{Math.min(debuggerState.events.length, 99)}</strong> : null}
      </Debugger.Trigger>
    </Debugger.Root>
  )
}

function DebugEventRow({ event }: { event: WorkflowDebugEvent }) {
  const label = eventLabel(event)
  return (
    <Debugger.Event error={isErrorEvent(event)} data-kind={event.kind}>
      <summary>
        <time>{formatTime(event.timestamp)}</time>
        <span className={styles.eventKind}>{label.kind}</span>
        <span className={styles.eventMain}>{label.main}</span>
        {label.meta ? <span className={styles.eventMeta}>{label.meta}</span> : null}
      </summary>
      <div className={styles.eventDetails}>
        {event.requestId ? <div>requestId: {event.requestId}</div> : null}
        {event.data !== undefined ? <pre>{formatData(event.data)}</pre> : null}
      </div>
    </Debugger.Event>
  )
}
