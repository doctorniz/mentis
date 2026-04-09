'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-bg flex h-screen w-full items-center justify-center p-8">
          <div className="border-danger/30 bg-bg-secondary w-full max-w-md space-y-4 rounded-xl border p-6 shadow-lg">
            <h1 className="text-danger text-lg font-bold">Something went wrong</h1>
            <p className="text-fg-secondary text-sm">
              An unexpected error occurred. Your vault data is safe on disk.
            </p>
            {this.state.error && (
              <pre className="bg-bg-tertiary text-fg max-h-40 overflow-auto rounded p-3 text-xs">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="bg-accent text-accent-fg hover:bg-accent-hover rounded-md px-4 py-2 text-sm font-medium"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="border-border text-fg hover:bg-bg-hover rounded-md border px-4 py-2 text-sm font-medium"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
