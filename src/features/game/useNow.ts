import { useEffect, useState } from 'react'

/** Re-render every `intervalMs` while `active` is true; returns Date.now(). */
export function useNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [active, intervalMs])
  return now
}
