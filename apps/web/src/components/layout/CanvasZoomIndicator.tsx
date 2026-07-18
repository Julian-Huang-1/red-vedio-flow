import { useViewport } from '@xyflow/react'
import { useWorkflowStore } from '../../store/workflowStore'
import styles from './CanvasZoomIndicator.module.less'

export function CanvasZoomIndicator() {
  const { zoom } = useViewport()
  const openWorkspacePanels = useWorkflowStore((state) => state.openWorkspacePanels)
  const isAssetManagerOpen = openWorkspacePanels.includes('assetManager')
  const zoomPercent = Math.round(zoom * 100)

  return (
    <div
      className={`${styles.indicator} ${isAssetManagerOpen ? styles.indicatorShifted : ''}`}
      aria-label={`当前画布缩放比例 ${zoomPercent}%`}
    >
      {zoomPercent}%
    </div>
  )
}
