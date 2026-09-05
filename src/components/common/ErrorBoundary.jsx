import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('MoneyFlow crashed:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-lg font-bold">Something went wrong</h1>
          <p className="max-w-sm text-sm text-ink-soft">
            The page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Reload MoneyFlow
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
