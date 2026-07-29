import { useCanvasPanelContribution } from '../../extension-system/canvasExtensions.logic'
import { useCanvasUiStore } from '../../state/canvasUiStore'

export function useCanvasToolRail() {
  const activePanel = useCanvasUiStore((state) => state.activeCanvasPanel)
  const closeCanvasPanel = useCanvasUiStore((state) => state.closeCanvasPanel)
  const panel = useCanvasPanelContribution(activePanel)

  return {
    activePanel,
    panel,
    close: closeCanvasPanel,
  }
}
