import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { getLinearAuthUrl } from '~/server/linear'
import toast from 'react-hot-toast'

type LinearAuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  onAuthenticated: () => void
}

export function LinearAuthDialog({
  open,
  onOpenChange,
  userId,
  onAuthenticated,
}: LinearAuthDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleAuthenticate = async () => {
    setIsLoading(true)
    try {
      const { authUrl } = await getLinearAuthUrl({
        data: {
          userId,
        },
      })

      // Store the current URL to return to after OAuth
      sessionStorage.setItem('linear-oauth-return-url', window.location.href)

      // Redirect to Linear OAuth
      window.location.href = authUrl
    } catch (error) {
      console.error('Failed to initiate Linear OAuth', error)
      toast.error(
        error instanceof Error ? error.message : 'Failed to start Linear authentication',
      )
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect to Linear</DialogTitle>
          <DialogDescription>
            Authenticate with Linear to create projects and sync tasks from your huddles.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            You'll be redirected to Linear to authorize this application. After authorization,
            you'll be able to create Linear projects from your completed huddles.
          </p>
          <Button
            onClick={handleAuthenticate}
            disabled={isLoading}
            className="w-full"
            variant="default"
          >
            {isLoading ? 'Connecting...' : 'Connect to Linear'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

