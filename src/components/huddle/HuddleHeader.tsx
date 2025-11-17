import { Download } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { EditableText } from '../EditableText'
import { Linear } from '~/components/assets/icons/LinearLogo'
import { formatDateTime } from '~/utils/dates'
import toast from 'react-hot-toast'

type HuddleHeaderProps = {
    huddleName: string
    huddleId: string
    createdAt: string
    ownerDisplayName: string
    isOwner: boolean
    isHuddleCompleted: boolean
    hasLinearToken: boolean
    linearProjectUrl?: string | null
    clientId: string
    onUpdateName: (name: string) => Promise<void>
    onOpenReport: () => void
    onOpenLinearProject: () => void
    onConnectLinear: () => Promise<void>
}

export function HuddleHeader({
    huddleName,
    huddleId,
    createdAt,
    ownerDisplayName,
    isOwner,
    isHuddleCompleted,
    hasLinearToken,
    linearProjectUrl,
    clientId,
    onUpdateName,
    onOpenReport,
    onOpenLinearProject,
    onConnectLinear,
}: HuddleHeaderProps) {
    return (
        <header className="flex flex-col items-start justify-start space-y- mb-2">
            {isOwner ? (
                <EditableText
                    fieldName="huddle-name"
                    value={huddleName}
                    inputClassName="text-3xl font-semibold h-auto resize-none mb-0.5 py-3 px-[11px]"
                    inputLabel="Huddle name"
                    buttonClassName="text-3xl font-semibold w-fit h-fit p-3"
                    buttonLabel="Edit huddle name"
                    minHeight="auto"
                    onChange={async (newName) => {
                        const trimmed = newName.trim()
                        if (trimmed.length === 0 || trimmed === huddleName) {
                            return
                        }
                        try {
                            await onUpdateName(trimmed)
                        } catch (error) {
                            console.error('Failed to update huddle name:', error)
                            toast.error(
                                error instanceof Error
                                    ? error.message
                                    : 'Failed to update huddle name',
                            )
                        }
                    }}
                />
            ) : (
                <h1 className="text-3xl font-semibold">{huddleName}</h1>
            )}
            <p className="text-sm text-muted-foreground">
                Created by {ownerDisplayName} on {formatDateTime(createdAt)}
            </p>
            <div className="flex items-center gap-3 mt-4 flex-wrap">
                {isHuddleCompleted ? (
                    <>
                        <Button
                            variant="outline"
                            onClick={onOpenReport}
                            className="gap-2"
                        >
                            <Download className="h-4 w-4" />
                            Download report
                        </Button>
                        <div className="flex items-center gap-2">
                            {linearProjectUrl ? (
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        window.open(linearProjectUrl, '_blank', 'noopener,noreferrer')
                                    }}
                                    className="gap-2"
                                >
                                    <Linear className="h-4 w-4" />
                                    View in Linear
                                </Button>
                            ) : (
                                <Button
                                    variant="outline"
                                    onClick={async () => {
                                        if (hasLinearToken) {
                                            onOpenLinearProject()
                                        } else {
                                            await onConnectLinear()
                                        }
                                    }}
                                    className="gap-2"
                                >
                                    <Linear className="h-4 w-4" />
                                    {hasLinearToken ? 'Send to Linear' : 'Connect to Linear'}
                                </Button>
                            )}
                        </div>
                    </>
                ) : null}
            </div>
        </header>
    )
}

