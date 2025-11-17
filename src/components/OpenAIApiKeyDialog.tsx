import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { ExternalLink, AlertCircle, Trash2 } from 'lucide-react'
import { encryptOpenAIApiKey, testOpenAIApiKey } from '~/server/openaiApiKey'
import { useSetOpenAIApiKeyEncryptedMutation, useDeleteOpenAIApiKeyMutation } from '~/queries'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../convex/_generated/api'

type OpenAIApiKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  onSkip?: () => void
  hasExistingKey?: boolean
}

/**
 * Dialog component for entering an OpenAI API key.
 * Shows when a subscribed user doesn't have an API key set.
 */
export function OpenAIApiKeyDialog({
  open,
  onOpenChange,
  onSuccess,
  onSkip,
  hasExistingKey = false,
}: OpenAIApiKeyDialogProps) {
  const [apiKey, setApiKey] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isTesting, setIsTesting] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [testError, setTestError] = React.useState<string | null>(null)
  const queryClient = useQueryClient()
  const setApiKeyMutation = useSetOpenAIApiKeyEncryptedMutation()
  const deleteApiKeyMutation = useDeleteOpenAIApiKeyMutation()

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault()
      const trimmed = apiKey.trim()

      if (!trimmed) {
        toast.error('Please enter an API key')
        return
      }

      if (!trimmed.startsWith('sk-')) {
        toast.error('Invalid API key format. OpenAI keys must start with "sk-"')
        return
      }

      // Clear previous test errors
      setTestError(null)
      setIsTesting(true)

      try {
        // First, test the API key
        await testOpenAIApiKey({ data: { apiKey: trimmed } })
        
        // If test passes, encrypt and save the key
        setIsTesting(false)
        setIsSubmitting(true)
        
        // Encrypt the key server-side
        const { encryptedKey } = await encryptOpenAIApiKey({ data: { apiKey: trimmed } })
        
        // Store the encrypted key via Convex mutation (client-side, authenticated)
        await setApiKeyMutation.mutateAsync({ encryptedKey })
        
        toast.success(
          hasExistingKey
            ? 'API key verified and updated successfully'
            : 'API key verified and saved successfully',
        )
        setApiKey('')
        setTestError(null)
        // Invalidate queries to refresh the UI
        queryClient.invalidateQueries({
          queryKey: ['convex', api.users.hasOpenAIApiKey, {}],
        })
        onOpenChange(false)
        onSuccess?.()
      } catch (error) {
        console.error('Failed to test or save API key', error)
        setIsTesting(false)
        setIsSubmitting(false)
        
        const message =
          error instanceof Error ? error.message : 'Failed to verify API key'
        
        // Show error in the dialog
        setTestError(message)
        
        // Also show toast for visibility
        toast.error(message)
      }
    },
    [apiKey, onOpenChange, onSuccess, hasExistingKey, queryClient, setApiKeyMutation],
  )

  const handleDelete = React.useCallback(async () => {
    if (!hasExistingKey) {
      return
    }

    setIsDeleting(true)
    try {
      await deleteApiKeyMutation.mutateAsync({})
      toast.success('API key deleted successfully')
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['convex', api.users.hasOpenAIApiKey, {}],
      })
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to delete API key', error)
      const message =
        error instanceof Error ? error.message : 'Failed to delete API key'
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }, [hasExistingKey, queryClient, onOpenChange, onSuccess, deleteApiKeyMutation])

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!newOpen && !isSubmitting && !isTesting) {
        setApiKey('')
        setTestError(null)
      }
      onOpenChange(newOpen)
    },
    [isSubmitting, isTesting, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {hasExistingKey ? 'Update OpenAI API Key' : 'OpenAI API Key Required'}
          </DialogTitle>
          <DialogDescription>
            {hasExistingKey
              ? 'Update your OpenAI API key. This key is encrypted and stored securely.'
              : 'To use huddles with your subscription, you need to provide your OpenAI API key. This key is encrypted and stored securely. You can continue creating free huddles without an API key.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-input">OpenAI API Key</Label>
            <Input
              id="api-key-input"
              type="password"
              autoFocus
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value)
                // Clear error when user starts typing
                if (testError) {
                  setTestError(null)
                }
              }}
              disabled={isSubmitting || isTesting}
            />
            <p className="text-xs text-muted-foreground">
              Your API key is encrypted before storage. You can create a new
              key at{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                platform.openai.com/api-keys
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>
            {testError && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>{testError}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            {hasExistingKey && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting || isTesting || isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {isDeleting ? 'Deleting...' : 'Delete Key'}
              </Button>
            )}
            {!hasExistingKey && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleOpenChange(false)
                  onSkip?.()
                }}
                disabled={isSubmitting || isTesting || isDeleting}
              >
                Maybe later
              </Button>
            )}
            <Button
              type="submit"
              disabled={!apiKey.trim() || isSubmitting || isTesting || isDeleting}
            >
              {isTesting
                ? 'Testing API Key...'
                : isSubmitting
                  ? hasExistingKey
                    ? 'Updating...'
                    : 'Saving...'
                  : hasExistingKey
                    ? 'Update API Key'
                    : 'Save API Key'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

