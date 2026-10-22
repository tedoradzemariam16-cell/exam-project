import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Last-resort screen so an unexpected error never leaves a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">დაფიქსირდა მოულოდნელი შეცდომა</h1>
        <p className="text-slate-600">განაახლეთ გვერდი. თუ პრობლემა განმეორდა, დაუკავშირდით ადმინისტრატორს.</p>
        <p className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs break-all text-slate-600">{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mx-auto rounded-xl bg-brand-700 px-5 py-2.5 font-semibold text-white hover:bg-brand-800"
        >
          გვერდის განახლება
        </button>
      </main>
    )
  }
}
