import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
  reload: () => Promise<void>
}

/** Minimal data-loading hook: runs `fn` on mount and whenever `deps` change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let cancelled = false
    fnRef.current().then(
      (d) => {
        if (cancelled) return
        setData(d)
        setError(null)
        setLoading(false)
      },
      (e) => {
        if (cancelled) return
        setError(e)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fnRef.current())
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  return { data, error, loading, reload }
}
