import { useCanvasZoomIndicator } from './CanvasZoomIndicator.logic'
import styles from './CanvasZoomIndicator.module.less'

export function CanvasZoomIndicator() {
  const indicator = useCanvasZoomIndicator()

  return (
    <div
      className={styles.indicator}
      data-shifted={indicator.isShifted || undefined}
      aria-label={`当前画布缩放比例 ${indicator.zoomPercent}%`}
    >
      {indicator.zoomPercent}%
    </div>
  )
}
