import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import { Button } from '~/components/ui/button'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type DeleteHuddleDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
    huddleName: string
    huddleId: string
    userId: string
    isPending: boolean
    onDelete: (payload: { huddleId: any; userId: string }) => Promise<any>
    onNavigate: () => void
}

export function DeleteHuddleDialog({
    open,
    onOpenChange,
    huddleName,
    huddleId,
    userId,
    isPending,
    onDelete,
    onNavigate,
}: DeleteHuddleDialogProps) {
    const handleDelete = async () => {
        try {
            await onDelete({ huddleId, userId })
            toast.success('Huddle deleted successfully')
            onOpenChange(false)
            onNavigate()
        } catch (error) {
            console.error('Failed to delete huddle:', error)
            toast.error(
                error instanceof Error
                    ? error.message
                    : 'Failed to delete huddle',
            )
        }
    }

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogTrigger asChild>
                <Button
                    variant="secondary"
                    className="mx-auto w-fit lg:fixed lg:bottom-6 lg:left-6 lg:mx-0 lg:mb-0 z-50"
                >
                    <Trash2 className="h-4 w-4" />
                    Delete huddle
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete huddle</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to delete "{huddleName}"? This action cannot be undone and will permanently delete the huddle, all planning items, transcripts, and participant data.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-rose-600 hover:bg-rose-700"
                        disabled={isPending}
                    >
                        {isPending ? 'Deleting...' : 'Delete'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

