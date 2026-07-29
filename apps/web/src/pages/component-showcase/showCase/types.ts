export type ShowcaseItem = {
  id: string
  title: string
  category: string
  description: string
  preview: () => JSX.Element
}
