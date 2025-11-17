import * as React from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useHydrated } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import {
  Camera,
  Check,
  ImagePlus,
  Upload,
  X,
  Info,
} from 'lucide-react'
import { Input } from '~/components/ui/input'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { useUserProfile } from '~/context/UserProfileContext'
import {
  listPresetAvatars,
  type PresetAvatarOption,
  uploadAvatarFromBase64,
  getHuddleAvatarForName,
} from '~/server/avatar'
import { Card, CardContent } from '~/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/tooltip'

type UserProfileSetupProps = {
  nameInputRef: React.Ref<HTMLInputElement>
}

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg']
const MAX_FILE_SIZE_MB = 4
const USER_PROFILE_DEBUG_TAG = '[UserProfileSetup]'
const isUserProfileDebugEnabled = import.meta.env.DEV

declare global {
  interface Window {
    HUDDLE_DEBUG_LOGS?: boolean
  }
}

// eslint-disable-next-line no-console
const userProfileDebugLog = (
  message: string,
  details?: Record<string, unknown>,
) => {
  if (!isUserProfileDebugEnabled) {
    return
  }
  if (typeof window !== 'undefined' && window.HUDDLE_DEBUG_LOGS === false) {
    return
  }
  if (details) {
    // eslint-disable-next-line no-console
    console.log(USER_PROFILE_DEBUG_TAG, message, details)
  } else {
    // eslint-disable-next-line no-console
    console.log(USER_PROFILE_DEBUG_TAG, message)
  }
}


export function UserProfileSetup({ nameInputRef }: UserProfileSetupProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [cameraOpen, setCameraOpen] = React.useState(false)
  const [isPresetPickerOpen, setIsPresetPickerOpen] = React.useState(false)
  const [presetAvatars, setPresetAvatars] = React.useState<PresetAvatarOption[]>(
    [],
  )
  const [isLoadingPresetAvatars, setIsLoadingPresetAvatars] =
    React.useState(false)
  const [presetLoadError, setPresetLoadError] = React.useState<string | null>(
    null,
  )
  const hasLoadedPresetsRef = React.useRef(false)
  const { profile, setName, setAvatar } = useUserProfile()
  const hydrated = useHydrated()
  const { isAuthenticated } = useConvexAuth()
  const avatarMatchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)
  
  // Use local state for the input value to prevent it from being reset by Convex refetches during typing
  const [localName, setLocalName] = React.useState('')
  
  // Initialize local name when hydrated
  React.useEffect(() => {
    if (hydrated) {
      setLocalName(profile.name)
    }
  }, [hydrated])
  
  // Sync local name with profile name when it changes (but not during active typing)
  React.useEffect(() => {
    if (!hydrated) return
    
    // Only sync if the user isn't currently typing (input isn't focused)
    // This prevents the input from being reset while the user is typing
    const inputElement = typeof nameInputRef === 'object' && nameInputRef !== null ? nameInputRef.current : null
    if (inputElement && document.activeElement !== inputElement) {
      setLocalName(profile.name)
    } else if (!inputElement) {
      // If ref isn't set yet, sync anyway
      setLocalName(profile.name)
    }
  }, [profile.name, hydrated])
  // If user already has an avatar on load, they manually set it (don't auto-match)
  // Only check this after hydration to avoid hydration mismatches
  const hasManuallySetAvatarRef = React.useRef(false)
  React.useEffect(() => {
    if (hydrated) {
      hasManuallySetAvatarRef.current = Boolean(profile.avatar)
    }
  }, [hydrated, profile.avatar])
  // Track if user explicitly removed the avatar (don't auto-add it back for the same name)
  const hasExplicitlyRemovedAvatarRef = React.useRef(false)
  // Track the last name that was used for matching (to detect if it's a new name)
  const lastMatchedNameRef = React.useRef<string | null>(null)

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (avatarMatchTimeoutRef.current) {
        clearTimeout(avatarMatchTimeoutRef.current)
      }
    }
  }, [])

  const renderCountRef = React.useRef(0)
  renderCountRef.current += 1
  userProfileDebugLog('render', {
    renderCount: renderCountRef.current,
    isUploading,
    cameraOpen,
    isPresetPickerOpen,
    presetAvatarCount: presetAvatars.length,
    profileName: profile.name,
    hasAvatar: Boolean(profile.avatar),
  })

  // Track the last profile values to only log when they actually change
  const lastProfileRef = React.useRef<{
    name: string
    avatarSource: string | null
    avatarUpdatedAt: string | null
  } | null>(null)

  React.useEffect(() => {
    const current = {
      name: profile.name,
      avatarSource: profile.avatar?.source ?? null,
      avatarUpdatedAt: profile.avatar?.updatedAt ?? null,
    }
    const last = lastProfileRef.current
    
    // Only log if values actually changed
    if (!last || 
        last.name !== current.name || 
        last.avatarSource !== current.avatarSource || 
        last.avatarUpdatedAt !== current.avatarUpdatedAt) {
      userProfileDebugLog('profile changed', current)
      lastProfileRef.current = current
    }
  }, [profile.name, profile.avatar?.source, profile.avatar?.updatedAt])

  React.useEffect(() => {
    userProfileDebugLog('camera dialog state', { cameraOpen })
  }, [cameraOpen])

  React.useEffect(() => {
    userProfileDebugLog('preset picker state', { isPresetPickerOpen })
  }, [isPresetPickerOpen])

  React.useEffect(() => {
    userProfileDebugLog('uploading state', { isUploading })
  }, [isUploading])

  const loadPresetAvatars = React.useCallback(
    async (force = false) => {
      if (isLoadingPresetAvatars) {
        userProfileDebugLog('skipping preset load - already loading')
        return
      }
      if (hasLoadedPresetsRef.current && !force) {
        userProfileDebugLog('skipping preset load - cache hit')
        return
      }

      setIsLoadingPresetAvatars(true)
      setPresetLoadError(null)
      userProfileDebugLog('preset load started', { force })

      try {
        const manifest = await listPresetAvatars()
        setPresetAvatars(manifest.items)
        hasLoadedPresetsRef.current = true
        userProfileDebugLog('preset load completed', {
          count: manifest.items.length,
        })
      } catch (error) {
        console.error('Failed to load preset avatars', error)
        setPresetLoadError('Unable to load preset avatars. Please try again.')
        userProfileDebugLog('preset load failed', {
          force,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        if (force) {
          hasLoadedPresetsRef.current = false
        }
      } finally {
        setIsLoadingPresetAvatars(false)
      }
    },
    [isLoadingPresetAvatars, listPresetAvatars],
  )

  React.useEffect(() => {
    if (isPresetPickerOpen) {
      void loadPresetAvatars()
    }
  }, [isPresetPickerOpen, loadPresetAvatars])

  const handleRetryPresetLoad = React.useCallback(() => {
    hasLoadedPresetsRef.current = false
    void loadPresetAvatars(true)
  }, [loadPresetAvatars])

  const handleSelectPresetAvatar = React.useCallback(
    (avatar: PresetAvatarOption) => {
      hasManuallySetAvatarRef.current = true
      hasExplicitlyRemovedAvatarRef.current = false // Allow future auto-matching if user manually sets
      setAvatar({
        url: avatar.url,
        storageId: avatar.storageId,
        source: 'preset',
        updatedAt: new Date().toISOString(),
      })
      userProfileDebugLog('preset avatar selected', {
        storageId: avatar.storageId,
        url: avatar.url,
      })
      toast.success('Avatar updated.')
      setIsPresetPickerOpen(false)
    },
    [setAvatar],
  )

  const handleNameChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const newName = event.target.value
      // Update local state immediately for responsive typing
      setLocalName(newName)
      // Guests persist per-keystroke to localStorage; authenticated users commit on blur
      if (!isAuthenticated) {
        // Persist current value (empty allowed for guests; join is gated elsewhere)
        setName(newName)
      }

      // Clear any existing timeout
      if (avatarMatchTimeoutRef.current) {
        clearTimeout(avatarMatchTimeoutRef.current)
      }

      // Debounce the avatar lookup (only when user types)
      avatarMatchTimeoutRef.current = setTimeout(async () => {
        // Don't clear avatar if name is empty - keep existing avatar
        if (!newName.trim()) {
          return
        }

        // Check if this is a new name (different from last matched name)
        const isNewName = lastMatchedNameRef.current !== newName.trim()

        // If user explicitly removed avatar and this is the same name, don't re-add it
        if (hasExplicitlyRemovedAvatarRef.current && !isNewName) {
          return
        }

        // Skip avatar matching if user has manually set an avatar AND it's the same name
        // But allow re-matching if the name changed (to support changing from one easter egg to another)
        if (hasManuallySetAvatarRef.current && !isNewName) {
          return
        }

        try {
          const isTanner = newName.toLowerCase().includes('tanner')
          
          
          const match = await getHuddleAvatarForName({ data: { name: newName } })
          
          
          
          // Only update avatar if a new match is found
          // Allow matching if it's a new name, even if avatar was previously manually set
          if (match) {
            // If it's a new name, allow matching even if avatar was previously removed or manually set
            if (isNewName) {
              hasExplicitlyRemovedAvatarRef.current = false
              // Don't set hasManuallySetAvatarRef to false - keep it true if it was manually set
              // But allow the new match to be set
            }

            setAvatar({
              url: match.url,
              storageId: match.storageId,
              source: 'preset', // Using 'preset' since it's from the preset system
              updatedAt: new Date().toISOString(),
            })
            lastMatchedNameRef.current = newName.trim()
            userProfileDebugLog('auto-matched huddle avatar', {
              storageId: match.storageId,
              url: match.url,
              isNewName,
            })
            
            if (isTanner) {
              console.log('[UserProfileSetup] TANNER: Avatar set successfully!', {
                url: match.url,
                storageId: match.storageId,
              })
            }
          } else if (isTanner) {
            console.log('[UserProfileSetup] TANNER: Avatar NOT set because:', {
              hasMatch: !!match,
              hasManuallySetAvatar: hasManuallySetAvatarRef.current,
            })
          }
          // Don't clear avatar if no match - keep existing one
        } catch (error) {
          // Silently fail - avatar matching is optional
          const isTanner = newName.toLowerCase().includes('tanner')
          if (isTanner) {
            console.error('[UserProfileSetup] TANNER: Avatar matching failed with error:', error)
          }
          userProfileDebugLog('avatar matching failed', {
            errorMessage: error instanceof Error ? error.message : String(error),
          })
        }
      }, 500) // Debounce 500ms
    },
    [setName, setAvatar, isAuthenticated],
  )

  const handleNameBlur = React.useCallback(() => {
    // Authenticated users commit the name to Convex on blur
    if (isAuthenticated) {
      const committed = localName.trim()
      setName(committed)
    }
  }, [isAuthenticated, localName, setName])

  const triggerFileDialog = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const [file] = event.target.files ?? []
      event.target.value = ''
      if (!file) {
        return
      }
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        toast.error('Please choose a PNG or JPEG image.')
        return
      }
      const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024
      if (file.size > maxBytes) {
        toast.error(`Image must be under ${MAX_FILE_SIZE_MB}MB.`)
        return
      }

      try {
        setIsUploading(true)
        userProfileDebugLog('file upload started', {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        })
        const base64 = await fileToBase64(file)
        const uploaded = await uploadAvatarFromBase64({
          data: {
            base64,
            mimeType: file.type as 'image/png' | 'image/jpeg',
            filename: file.name,
            source: 'upload',
          },
        })
        hasManuallySetAvatarRef.current = true
        hasExplicitlyRemovedAvatarRef.current = false // Allow future auto-matching if user manually sets
        setAvatar({
          url: uploaded.url,
          storageId: uploaded.storageId,
          source: uploaded.source,
          updatedAt: uploaded.updatedAt,
        })
        userProfileDebugLog('file upload completed', {
          storageId: uploaded.storageId,
          url: uploaded.url,
        })
        toast.success('Avatar updated.')
      } catch (error) {
        console.error('Failed to upload avatar', error)
        toast.error('Unable to upload avatar. Please try again.')
      } finally {
        setIsUploading(false)
      }
    },
    [setAvatar],
  )

  const handleCapture = React.useCallback(
    async (dataUrl: string) => {
      try {
        setIsUploading(true)
        userProfileDebugLog('camera capture upload started')
        const base64 = dataUrl.split(',')[1] ?? dataUrl
        const uploaded = await uploadAvatarFromBase64({
          data: {
            base64,
            mimeType: 'image/png',
            filename: `camera-${Date.now()}.png`,
            source: 'camera',
          },
        })
        hasManuallySetAvatarRef.current = true
        hasExplicitlyRemovedAvatarRef.current = false // Allow future auto-matching if user manually sets
        setAvatar({
          url: uploaded.url,
          storageId: uploaded.storageId,
          source: uploaded.source,
          updatedAt: uploaded.updatedAt,
        })
        userProfileDebugLog('camera capture upload completed', {
          storageId: uploaded.storageId,
          url: uploaded.url,
        })
        toast.success('Camera snapshot saved.')
      } catch (error) {
        console.error('Failed to save camera snapshot', error)
        userProfileDebugLog('camera capture upload failed', {
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        toast.error('Unable to save the camera snapshot.')
      } finally {
        setIsUploading(false)
        setCameraOpen(false)
      }
    },
    [setAvatar],
  )

  const handleOpenPresetPicker = React.useCallback(() => {
    if (isUploading) {
      userProfileDebugLog('blocked preset picker open', {
        isUploading,
      })
      return
    }
    userProfileDebugLog('preset picker opened')
    setIsPresetPickerOpen(true)
  }, [isUploading])

  const handleResetAvatar = React.useCallback(() => {
    hasManuallySetAvatarRef.current = false
    hasExplicitlyRemovedAvatarRef.current = true // Prevent auto-matching from re-adding it
    setAvatar(null)
    userProfileDebugLog('avatar reset - will not auto-match again')
  }, [setAvatar])

  return (
    <section>
      <Card className="max-w-fit">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 max-w-fit">
            <label className="text-sm font-semibold flex items-center gap-1">
              <span>Your name</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    aria-label="Why add your name?"
                  >
                    <Info className="h-3 w-3" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={4}>
                  <span>Add your name to create or join a huddle.</span>
                </TooltipContent>
              </Tooltip>
            </label>
            <Input
              ref={nameInputRef}
              placeholder="Jane Doe"
              value={hydrated ? localName : ''}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              maxLength={60}
              aria-label="Display name"
            />
          </div>

          <div className="flex flex-1 flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2">
                <AvatarPreview
                  name={hydrated ? profile.name : ''}
                  avatarUrl={hydrated ? (profile.avatar?.url ?? null) : null}
                  isLoading={
                    isUploading || isLoadingPresetAvatars
                  }
                  onClick={handleOpenPresetPicker}
                  onRemove={hydrated && profile.avatar ? handleResetAvatar : undefined}
                  disabled={isUploading}
                />
                <p className="text-xs">
                  Tap to choose from gallery
                </p>
              </div>
              <div className="flex flex-col gap-2 items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={triggerFileDialog}
                  disabled={isUploading}
                >
                  <Upload className="mr-2 size-4" />
                  Upload photo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCameraOpen(true)}
                  disabled={isUploading}
                >
                  <Camera className="mr-2 size-4" />
                  Use webcam
                </Button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </CardContent>
      </Card>

      <CameraCaptureDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={handleCapture}
        isUploading={isUploading}
      />
      <PresetAvatarDialog
        open={isPresetPickerOpen}
        onOpenChange={setIsPresetPickerOpen}
        avatars={presetAvatars}
        isLoading={isLoadingPresetAvatars}
        errorMessage={presetLoadError}
        onRetry={handleRetryPresetLoad}
        onSelect={handleSelectPresetAvatar}
        selectedStorageId={hydrated ? (profile.avatar?.storageId ?? null) : null}
      />
    </section>
  )
}

function AvatarPreview({
  name,
  avatarUrl,
  isLoading,
  onClick,
  onRemove,
  disabled,
}: {
  name: string
  avatarUrl: string | null
  isLoading: boolean
  onClick?: () => void
  onRemove?: () => void
  disabled?: boolean
}) {
  const initials = React.useMemo(() => {
    if (!name.trim()) {
      return '?'
    }
    const parts = name.trim().split(/\s+/)
    const [first, second] = parts
    if (!second) {
      return first.slice(0, 2).toUpperCase()
    }
    return `${first[0]}${second[0]}`.toUpperCase()
  }, [name])

  const buttonClass = clsx(
    'relative flex size-20 items-center justify-center overflow-hidden rounded-md border bg-accent text-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
    disabled
      ? 'cursor-not-allowed opacity-70'
      : 'cursor-pointer hover:border-primary hover:shadow-md',
  )

  const handleRemoveClick = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      if (disabled || isLoading) {
        return
      }
      onRemove?.()
    },
    [disabled, isLoading, onRemove],
  )

  const showRemoveButton = Boolean(avatarUrl && onRemove && !isLoading && !disabled)

  // Use TanStack Start's useHydrated hook to prevent hydration mismatch
  const hydrated = useHydrated()

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={buttonClass}
        aria-label="Choose a preset avatar"
      >
        {hydrated && avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Avatar preview"
            className="size-full object-cover"
          />
        ) : (
          <span>{initials}</span>
        )}
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm font-medium">
            Loading…
          </div>
        ) : null}
      </button>
      {showRemoveButton ? (
        <button
          type="button"
          onClick={handleRemoveClick}
          className="cursor-pointer absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          aria-label="Remove avatar"
        >
          <X className="size-3" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  )
}

type CameraCaptureDialogProps = {
  open: boolean
  onOpenChange: (value: boolean) => void
  onCapture: (dataUrl: string) => void
  isUploading: boolean
}

function CameraCaptureDialog({
  open,
  onOpenChange,
  onCapture,
  isUploading,
}: CameraCaptureDialogProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const [isCameraReady, setIsCameraReady] = React.useState(false)
  const [cameraError, setCameraError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isCancelled = false
    if (!open) {
      stopStream(streamRef.current)
      setIsCameraReady(false)
      setCameraError(null)
      return
    }

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 256 },
            height: { ideal: 256 },
          },
        })
        if (isCancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
        setIsCameraReady(true)
      } catch (error) {
        console.error('Unable to access webcam', error)
        setCameraError(
          'We could not access your webcam. Please check permissions and try again.',
        )
      }
    }

    setupCamera()

    return () => {
      isCancelled = true
      stopStream(streamRef.current)
    }
  }, [open])

  const handleCapture = React.useCallback(async () => {
    if (!videoRef.current) {
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      toast.error('Unable to capture photo right now.')
      return
    }
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/png')
    onCapture(dataUrl)
  }, [onCapture])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Take a quick snapshot</DialogTitle>
          <DialogDescription>
            Center yourself in the frame, then snap to use it as your avatar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex justify-center rounded-lg border border-dashed border-slate-300 bg-slate-950/5 p-2">
            {cameraError ? (
              <div className="flex h-40 items-center justify-center text-center text-sm text-amber-600">
                {cameraError}
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="h-40 w-full rounded-md bg-black object-cover"
              />
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCapture}
              disabled={!isCameraReady || !!cameraError || isUploading}
            >
              Capture
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type PresetAvatarDialogProps = {
  open: boolean
  onOpenChange: (value: boolean) => void
  avatars: PresetAvatarOption[]
  isLoading: boolean
  errorMessage: string | null
  onRetry: () => void
  onSelect: (avatar: PresetAvatarOption) => void
  selectedStorageId: string | null
}

function PresetAvatarDialog({
  open,
  onOpenChange,
  avatars,
  isLoading,
  errorMessage,
  onRetry,
  onSelect,
  selectedStorageId,
}: PresetAvatarDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pick an avatar</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-500">
              Loading avatars…
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
              <span>{errorMessage}</span>
              <Button type="button" variant="outline" onClick={onRetry}>
                Try again
              </Button>
            </div>
          ) : avatars.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-500">
              No preset avatars are available yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {avatars.map((avatar) => {
                const isSelected = selectedStorageId === avatar.storageId
                const label = avatar.label ?? avatar.styleHint ?? 'Preset avatar'
                return (
                  <button
                    key={avatar.storageId}
                    type="button"
                    onClick={() => onSelect(avatar)}
                    className={clsx(
                      'cursor-pointer hover:bg-indigo-50 relative flex h-28 items-center justify-center overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2',
                      isSelected
                        ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-600/20 hover:bg-indigo-600/30'
                        : 'border-slate-200 hover:border-indigo-400',
                    )}
                    aria-pressed={isSelected}
                    aria-label={`Use avatar: ${label}`}
                  >
                    <img
                      src={avatar.url}
                      alt={label}
                      className="size-full object-cover"
                    />
                    {isSelected ? (
                      <div className="absolute top-1 right-1 flex items-center justify-center text-indigo-900">
                        <Check className="size-6" />
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <DialogFooter className="sticky bottom-0 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  return arrayBufferToBase64(buffer)
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0xffff
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function stopStream(stream: MediaStream | null) {
  if (!stream) {
    return
  }
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

