# Web component architecture

`apps/web` uses three layers for stateful features:

- `Component.logic.ts` owns store/query subscriptions, effects, derived state and event orchestration.
- `Component.primitives.tsx` owns reusable structural UI such as `Root`, `Header`, `Item` and `Action`.
- `Component.tsx` composes primitives with the feature's content. It does not perform remote calls or subscribe to stores directly.

Small presentational components may stay in one file. Shared domain state remains in `store`, server state remains in `queries`, and routes only select a page.

Visual state is represented by DOM data attributes:

- `data-state="open|closed|loading|error|..."`
- `data-active`
- `data-selected`
- `data-disabled`
- `data-role`, `data-variant`, `data-tone`, or `data-material-type`

CSS Module class names describe stable structure only. Do not create parallel classes such as `activeButton`, `panelOpen`, or `errorRow`; select the corresponding data attribute from the stable class instead.

