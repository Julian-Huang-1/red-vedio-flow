# Happy Path coverage

The E2E suite uses the real Vite app, local server, SQLite persistence, workflow patching, uploads and polling. Local Agent and visual CLI calls are replaced with deterministic SSE responses so the suite does not depend on installed third-party CLIs or logged-in accounts.

| Happy Path | Automated coverage |
| --- | --- |
| Create the first workflow from the home page | `workflow-app.spec.ts` |
| Add and edit a text node | `workflow-app.spec.ts` |
| Persist content and node position | `workflow-lifecycle.spec.ts` |
| Reload and restore a workflow | `workflow-lifecycle.spec.ts` |
| Reopen a recent workflow from home history | `workflow-lifecycle.spec.ts` |
| Poll a running workflow until an external result is written back | `workflow-app.spec.ts` |
| Create multiple canvases | `workflow-lifecycle.spec.ts` |
| Switch canvases after saving | `workflow-lifecycle.spec.ts` |
| Delete the current canvas and fall back to another canvas | `workflow-lifecycle.spec.ts` |
| Upload and restore an image asset | `workflow-lifecycle.spec.ts` |
| Upload and restore a video asset | `workflow-lifecycle.spec.ts` |
| Connect upstream and downstream nodes | `workflow-lifecycle.spec.ts` |
| Pan the canvas with a two-finger trackpad gesture without changing zoom | `workflow-lifecycle.spec.ts` |
| Keep the viewport fixed while left-button dragging the empty pane | `workflow-lifecycle.spec.ts` |
| Show grab/grabbing cursor feedback for node and trackpad panning gestures | `workflow-lifecycle.spec.ts` |
| Run a text node with a selected local Agent | `agent-and-visual.spec.ts` |
| Generate and restore an image result | `agent-and-visual.spec.ts` |
| Generate and restore a video result | `agent-and-visual.spec.ts` |
| Stream an Agent drawer conversation | `agent-and-visual.spec.ts` |
| Reference a node with `@` in Agent chat | `agent-and-visual.spec.ts` |
| Refresh the canvas after an Agent workflow patch | `agent-and-visual.spec.ts` |
| Filter, search and locate a node in Asset Manager | `tools-and-showcase.spec.ts` |
| Open every canvas tool panel | `tools-and-showcase.spec.ts` |
| Inspect, filter, search, copy and clear Local Server logs | `agent-and-visual.spec.ts` |
| Search component previews and copy Code/Prompt resources | `tools-and-showcase.spec.ts` |

Run the complete suite with:

```bash
pnpm test:e2e
```
