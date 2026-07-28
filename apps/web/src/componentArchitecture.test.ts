import { readdirSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = fileURLToPath(new URL('.', import.meta.url))

function collectFiles(directory: string, extensions: Set<string>): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory()
      ? collectFiles(path, extensions)
      : extensions.has(extname(entry.name))
        ? [path]
        : []
  })
}

describe('web component architecture', () => {
  it('keeps stateful React and store hooks out of TSX view files', () => {
    const hookPattern =
      /\b(?:useState|useEffect|useMemo|useCallback|useRef|useSyncExternalStore|useWorkflowStore|useReactFlow|useViewport)\b/
    const violations = collectFiles(sourceRoot, new Set(['.tsx']))
      .filter((path) => hookPattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.replace(`${sourceRoot}/`, ''))

    expect(violations).toEqual([])
  })

  it('does not use conditional CSS class expressions for visual state', () => {
    const conditionalClassPattern = /className=\{[^}]*\?[^}]*\}/
    const violations = collectFiles(sourceRoot, new Set(['.tsx']))
      .filter((path) => conditionalClassPattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.replace(`${sourceRoot}/`, ''))

    expect(violations).toEqual([])
  })

  it('does not reintroduce legacy state class names', () => {
    const legacyStateClassPattern =
      /\.(?:drawerOpen|drawerClosed|panelOpen|panelClosed|activeTab|activeTool|filterActive|eventError|triggerError|indicatorShifted|disabledItem|mentionOptionActive|canvasButtonActive|canvasMenuItemActive|segmentActive|agentButtonActive)\b/
    const violations = collectFiles(sourceRoot, new Set(['.less', '.css', '.tsx']))
      .filter((path) => legacyStateClassPattern.test(readFileSync(path, 'utf8')))
      .map((path) => path.replace(`${sourceRoot}/`, ''))

    expect(violations).toEqual([])
  })
})
