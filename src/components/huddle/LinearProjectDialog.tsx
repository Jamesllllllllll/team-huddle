import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import {
  getLinearTeams,
  getLinearUser,
  createLinearProject,
  LinearAuthenticationError,
  isLinearAuthenticationError,
} from '~/server/linear'
import { linearQueries, useRemoveLinearTokenMutation } from '~/queries'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

type LinearProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  huddleId: string
  huddleSlug: string
  projectName: string
  tasks: Array<{ text: string }>
  onSuccess: () => void
  onReauthenticate: () => void
}

type LinearTeam = {
  id: string
  name: string
  key: string
}

export function LinearProjectDialog({
  open,
  onOpenChange,
  userId,
  huddleId,
  huddleSlug,
  projectName,
  tasks,
  onSuccess,
  onReauthenticate,
}: LinearProjectDialogProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>('')
  const [teams, setTeams] = useState<LinearTeam[]>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [projectUrl, setProjectUrl] = useState<string | null>(null)
  const removeToken = useRemoveLinearTokenMutation()
  const queryClient = useQueryClient()
  // Get Linear user ID from localStorage (stored after first auth)
  const linearUserId = typeof window !== 'undefined'
    ? localStorage.getItem('huddle:linear-user-id')
    : null

  // Use regular query instead of suspense to avoid blocking
  const { data: tokenData } = useQuery({
    ...linearQueries.getToken(linearUserId || ''),
    enabled: open && Boolean(linearUserId && linearUserId.trim().length > 0),
    retry: false,
    throwOnError: false,
  })

  const handleAuthenticationError = async (error: unknown) => {
    if (isLinearAuthenticationError(error)) {
      // Remove the invalid token
      if (linearUserId) {
        await removeToken.mutateAsync({ linearUserId })
      }

      // Invalidate all queries to refresh the token status
      // Convex queries will automatically update when the token is removed
      await queryClient.invalidateQueries()

      toast.error('Linear access has been revoked. Please re-authenticate.')

      // Close this dialog and open auth dialog
      onOpenChange(false)
      onReauthenticate()
      return true
    }
    return false
  }

  useEffect(() => {
    if (open && tokenData?.accessToken && !isLoadingTeams) {
      loadTeams()
    }
  }, [open, tokenData?.accessToken])

  const loadTeams = async () => {
    if (!tokenData?.accessToken) return

    setIsLoadingTeams(true)
    try {
      const teamsData = await getLinearTeams({
        data: {
          accessToken: tokenData.accessToken,
        },
      })
      setTeams(teamsData)
      if (teamsData.length > 0 && !selectedTeamId) {
        setSelectedTeamId(teamsData[0].id)
      }
    } catch (error) {
      console.error('Failed to load Linear teams', error)
      console.log('Error type:', error instanceof Error ? error.constructor.name : typeof error)
      console.log('Error message:', error instanceof Error ? error.message : String(error))

      // Check if it's an authentication error
      const handled = await handleAuthenticationError(error)
      if (handled) {
        return
      }

      toast.error(
        error instanceof Error ? error.message : 'Failed to load Linear teams',
      )
    } finally {
      setIsLoadingTeams(false)
    }
  }

  const handleCreate = async () => {
    if (!selectedTeamId || !tokenData?.accessToken) {
      toast.error('Please select a team')
      return
    }

    setIsCreating(true)
    try {
      // Get Linear user to get their ID for setting as project lead
      const linearUser = await getLinearUser({
        data: { accessToken: tokenData.accessToken },
      })

      if (!huddleSlug || huddleSlug.trim().length === 0) {
        toast.error('Huddle slug is missing. Please refresh the page and try again.')
        return
      }

      const selectedTeam = teams.find((t) => t.id === selectedTeamId)
      const result = await createLinearProject({
        data: {
          userId,
          huddleId,
          huddleSlug: huddleSlug.trim(),
          projectName,
          teamId: selectedTeamId,
          teamKey: selectedTeam?.key,
          tasks: tasks.length > 0 ? tasks : [], // Ensure we pass an empty array if no tasks
          accessToken: tokenData.accessToken,
          linearUserId: linearUser.id, // Set the Linear user who authorized as project lead
        },
      })

      // Store the project URL and show success state
      // Linear API returns the full URL in the project.url field
      // If not available, construct it from team key and project ID
      let url = result.project.url
      if (!url) {
        // Find the team to get the key for URL construction
        const selectedTeam = teams.find((t) => t.id === selectedTeamId)
        if (selectedTeam) {
          // Construct URL in format: https://linear.app/{teamKey}/project/{projectId}/overview
          url = `https://linear.app/${selectedTeam.key}/project/${result.project.id}/overview`
        } else {
          // Fallback to basic project URL
          url = `https://linear.app/project/${result.project.id}`
        }
      }
      setProjectUrl(url)

      toast.success(
        `Project "${result.project.name}" created with ${result.issues.length} task${result.issues.length !== 1 ? 's' : ''}!`,
      )
      // Don't close the dialog - keep it open to show success message
    } catch (error) {
      console.error('Failed to create Linear project', error)
      console.log('Error type:', error instanceof Error ? error.constructor.name : typeof error)
      console.log('Error message:', error instanceof Error ? error.message : String(error))

      // Check if it's an authentication error
      const handled = await handleAuthenticationError(error)
      if (handled) {
        return
      }

      toast.error(
        error instanceof Error ? error.message : 'Failed to create Linear project',
      )
    } finally {
      setIsCreating(false)
    }
  }

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setProjectUrl(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-3xl">
            {projectUrl ? 'Project Created Successfully!' : 'Create a Linear Project'}
          </DialogTitle>
        </DialogHeader>
        {projectUrl ? (
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/15">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100 mb-3">
                ✓ Project created successfully!
              </p>
              <a
                href={projectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 underline dark:text-emerald-300 dark:hover:text-emerald-200"
              >
                Open project in Linear
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <p className="text-xl font-semibold text-primary">{projectName}</p>
            </div>

            {tasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Tasks to Create</label>
                <ul className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm">
                  {tasks.map((task, index) => (
                    <li key={index} className="py-1">
                      • {task.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium">Tasks to Create</label>
                <p className="text-sm text-muted-foreground italic">
                  No tasks found in this huddle.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="team-select" className="text-sm font-medium">Team</label>
              {isLoadingTeams ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading teams...
                </div>
              ) : (
                <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                  <SelectTrigger id="team-select">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((team) => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name} ({team.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          {projectUrl ? (
            <Button onClick={() => {
              onOpenChange(false)
              onSuccess()
            }}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!selectedTeamId || isCreating}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

