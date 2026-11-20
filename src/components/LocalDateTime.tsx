import { useHydrated } from '@tanstack/react-router'
import { formatDate, formatDateTime, formatTime } from '~/utils/dates'

const formatters = { date: formatDate, dateTime: formatDateTime, time: formatTime }

export function LocalDateTime({ value, format }: {
  value: string
  format: keyof typeof formatters
}) {
  const hydrated = useHydrated()
  const iso = new Date(value).toISOString()
  const [date, time] = iso.split('T')
  const utcTime = time.slice(0, 5) + ' UTC'
  const initial = { date, time: utcTime, dateTime: date + ' ' + utcTime }
  return <time dateTime={iso}>{hydrated ? formatters[format](value) : initial[format]}</time>
}
