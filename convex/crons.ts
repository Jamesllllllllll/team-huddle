import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// Automatic huddle clearing removed - use the "Reset All Huddles" button in dev mode instead
// crons.cron('clear messages table', '0,20,40 * * * *', internal.huddle.clear)

crons.cron(
  'prune inactive participants',
  '* * * * *',
  internal.huddle.pruneInactiveParticipants,
)

export default crons
