import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  contributionId: string
  children: ReactNode
}

type State = {
  error?: Error
}

export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[red-video-flow] frontend contribution ${this.props.contributionId} crashed`,
      error,
      info,
    )
  }

  render() {
    if (this.state.error) {
      return (
        <div data-state="error" data-contribution-id={this.props.contributionId}>
          功能模块加载失败
        </div>
      )
    }
    return this.props.children
  }
}
