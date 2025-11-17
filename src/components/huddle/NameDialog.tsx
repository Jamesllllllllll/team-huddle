import { useState, useEffect } from 'react'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { Input } from '~/components/ui/input'

type Participant = {
    userId?: string | null
    role?: string | null
}

type NameDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    currentName: string
    isComplete: boolean
    isReady: boolean
    currentParticipant: Participant | undefined
    huddleId: string
    clientId: string
    avatarUrl?: string | null
    onSetName: (name: string) => void
    onRegisterObserver: (payload: {
        huddleId: any
        userId: string
        displayName: string
        avatarUrl?: string
    }) => Promise<any>
    onAddParticipant: (payload: {
        huddleId: any
        userId: string
        displayName: string
        avatarUrl?: string
    }) => Promise<any>
}

export function NameDialog({
    open,
    onOpenChange,
    currentName,
    isComplete,
    isReady,
    currentParticipant,
    huddleId,
    clientId,
    avatarUrl,
    onSetName,
    onRegisterObserver,
    onAddParticipant,
}: NameDialogProps) {
    const [nameDialogValue, setNameDialogValue] = useState(currentName)

    useEffect(() => {
        if (!isReady) return
        const nextName = typeof currentName === 'string' ? currentName : ''
        if (!nextName.trim()) {
            onOpenChange(true)
            setNameDialogValue(nextName)
        }
    }, [currentName, isReady, onOpenChange])

    const handleContinue = () => {
        const trimmed = nameDialogValue.trim()
        if (!trimmed) {
            return
        }
        onSetName(trimmed)
        // If already known in this huddle, sync the updated name to the participant/observer record
        try {
            if (currentParticipant) {
                const payload = {
                    huddleId,
                    userId: clientId,
                    displayName: trimmed,
                    avatarUrl: avatarUrl ?? undefined,
                }
                if ((currentParticipant.role ?? '').toLowerCase() === 'observer') {
                    void onRegisterObserver(payload)
                } else {
                    void onAddParticipant(payload)
                }
            }
        } catch {
            // Non-blocking best-effort sync
        }
        onOpenChange(false)
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Enter your name to continue</AlertDialogTitle>
                    <AlertDialogDescription>
                        Add your name to watch or join the huddle so teammates know who you are.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="mt-4 space-y-2">
                    <label
                        className="text-sm font-medium"
                        htmlFor="huddle-name-dialog-input"
                    >
                        First name
                    </label>
                    <Input
                        id="huddle-name-dialog-input"
                        placeholder="Jane"
                        value={nameDialogValue}
                        maxLength={60}
                        onChange={(event) => setNameDialogValue(event.target.value)}
                    />
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel
                        onClick={() => {
                            onOpenChange(false)
                        }}
                    >
                        Maybe later
                    </AlertDialogCancel>
                    <AlertDialogAction
                        disabled={!nameDialogValue.trim()}
                        onClick={handleContinue}
                    >
                        Continue
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

