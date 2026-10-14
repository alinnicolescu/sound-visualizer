/**
 * If a panel crashes, show what happened and a way out instead of a blank
 * window. The show and your project are untouched (they live outside React).
 */
import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ name: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    window.api?.log('error', `${this.props.name} crashed: ${error.message}`, error.stack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crashed">
        <p>
          The {this.props.name} hit a problem: <code>{this.state.error.message}</code>
        </p>
        <button onClick={() => this.setState({ error: null })}>Try again</button>
        {window.api && (
          <button className="quiet" onClick={() => window.api?.openLogs()}>
            Open log folder
          </button>
        )}
      </div>
    )
  }
}
