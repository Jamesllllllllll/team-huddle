import { useEffect, useState } from 'react'
import { FREE_HUDDLE_DURATION_MS } from '~/shared/huddle'

export function DevCountdown({ createdAt }: { createdAt: string }) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])
    const createdAtMs = new Date(createdAt).getTime()
    const remainingMs =
        Number.isNaN(createdAtMs) ? 0 : Math.max(0, FREE_HUDDLE_DURATION_MS - (now - createdAtMs))
    const mins = Math.floor(remainingMs / 60000)
    const secs = Math.floor((remainingMs % 60000) / 1000)
    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`
    return <p>Countdown: {formatted}</p>
}

