import { DevCountdown } from './DevCountdown'

type Participant = {
    id: string
    displayName?: string | null
    userId: string
    role?: string | null
}

type DevDiagnosticsProps = {
    userHasActiveSubscription: boolean
    isTimeLimited: boolean
    createdAt: string
    participants: Participant[]
    participantEntries: Participant[]
    observerEntries: Participant[]
}

export function DevDiagnostics({
    userHasActiveSubscription,
    isTimeLimited,
    createdAt,
    participants,
    participantEntries,
    observerEntries,
}: DevDiagnosticsProps) {
    return (
        <div className="rounded-md border p-3 text-xs space-y-1 bg-muted/30">
            <p className="font-semibold">Huddle diagnostics</p>
            <p>
                Subscription: {userHasActiveSubscription ? 'subscriber' : 'free'}
            </p>
            <p>Time-limited: {isTimeLimited ? 'yes' : 'no'}</p>
            {isTimeLimited ? (
                <DevCountdown createdAt={createdAt} />
            ) : null}
            <div className="mt-2 space-y-1">
                <p className="font-semibold">Participants data</p>
                <p>Total records: {participants.length}</p>
                <p>Active participants: {participantEntries.length}</p>
                <p>Observers: {observerEntries.length}</p>
                <div className="mt-2 space-y-1">
                    <p className="font-medium">Active</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {participantEntries.map((p) => (
                            <li key={p.id}>
                                {p.displayName ?? 'Anonymous'} — {p.userId} ({p.role ?? 'participant'})
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="mt-2 space-y-1">
                    <p className="font-medium">Observers</p>
                    <ul className="list-disc pl-5 space-y-0.5">
                        {observerEntries.map((p) => (
                            <li key={p.id}>
                                {p.displayName ?? 'Anonymous'} — {p.userId} ({p.role ?? 'observer'})
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}

