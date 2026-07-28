import { useEffect, useState } from 'react'

export type PresenceState = 'open' | 'closed'

export function useAnimatedPresence(open: boolean, exitDuration = 220) {
  const [isMounted, setIsMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      return
    }

    const timeout = window.setTimeout(() => setIsMounted(false), exitDuration)
    return () => window.clearTimeout(timeout)
  }, [exitDuration, open])

  return {
    isMounted,
    state: (open ? 'open' : 'closed') as PresenceState,
  }
}

