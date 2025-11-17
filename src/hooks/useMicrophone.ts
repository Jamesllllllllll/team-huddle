import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type PermissionState = 'idle' | 'pending' | 'granted' | 'denied'

export type StopRecordingResult = {
  blob: Blob
  mimeType: string
  durationMs: number
}

export type UseMicrophoneOptions = {
  preferredMimeType?: string
}

const DEFAULT_MIME_TYPE = 'audio/webm;codecs=opus'

function isMediaRecorderSupported() {
  if (typeof window === 'undefined') return false
  return typeof window.MediaRecorder !== 'undefined'
}

export function useMicrophone(options: UseMicrophoneOptions = {}) {
  const { preferredMimeType = DEFAULT_MIME_TYPE } = options
  const [permission, setPermission] = useState<PermissionState>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunkRef = useRef<BlobPart[]>([])
  const startTimestampRef = useRef<number | null>(null)

  const isSupported = useMemo(() => isMediaRecorderSupported(), [])

  // Check existing microphone permission on mount
  useEffect(() => {
    if (!isSupported || typeof navigator === 'undefined' || !navigator.permissions) {
      return
    }

    const checkPermission = async () => {
      try {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        
        // Map permission states
        if (result.state === 'granted') {
          setPermission('granted')
        } else if (result.state === 'denied') {
          setPermission('denied')
        }
        // 'prompt' state means permission hasn't been requested yet, keep as 'idle'
        // This is the default state, so no need to set it

        // Listen for permission changes
        result.addEventListener('change', () => {
          if (result.state === 'granted') {
            setPermission('granted')
          } else if (result.state === 'denied') {
            setPermission('denied')
          }
        })
      } catch (error) {
        // Permissions API might not be supported or might throw
        // In that case, we'll detect permission when user tries to use it
        console.debug('Could not check microphone permission:', error)
      }
    }

    checkPermission()
  }, [isSupported])

  const stopStreamTracks = useCallback((target: MediaStream | null) => {
    if (!target) return
    for (const track of target.getTracks()) {
      track.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
      stopStreamTracks(stream)
      mediaRecorderRef.current = null
    }
  }, [stopStreamTracks, stream])

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      const message = 'MediaRecorder is not supported in this browser.'
      setError(message)
      throw new Error(message)
    }

    setPermission('pending')
    setError(null)

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      setStream((previous) => {
        if (previous && previous.id !== nextStream.id) {
          stopStreamTracks(previous)
        }
        return nextStream
      })
      setPermission('granted')
      return nextStream
    } catch (requestError) {
      console.error('Failed to obtain microphone permission', requestError)
      setPermission('denied')
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Microphone permission was denied.'
      setError(message)
      throw requestError
    }
  }, [isSupported, stopStreamTracks])

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const message = 'MediaRecorder is not supported.'
      setError(message)
      throw new Error(message)
    }
    if (isRecording) {
      console.debug('startRecording: already recording, skipping')
      return
    }

    // Clean up any existing recorder before starting a new one
    const existingRecorder = mediaRecorderRef.current
    if (existingRecorder) {
      console.debug('startRecording: cleaning up existing recorder', existingRecorder.state)
      if (existingRecorder.state !== 'inactive') {
        try {
          existingRecorder.stop()
        } catch (error) {
          console.debug('startRecording: error stopping existing recorder', error)
        }
      }
      mediaRecorderRef.current = null
      chunkRef.current = []
      startTimestampRef.current = null
    }

    let activeStream = stream
    if (!activeStream) {
      activeStream = await requestPermission()
    }
    if (activeStream) {
      const tracks = activeStream.getTracks()
      const allTracksEnded =
        tracks.length > 0 && tracks.every((track) => track.readyState === 'ended')
      if (allTracksEnded) {
        stopStreamTracks(activeStream)
        setStream(null)
        activeStream = await requestPermission()
      }
    }
    if (!activeStream) {
      throw new Error('Cannot start recording without an active microphone stream.')
    }

    const recorder = new MediaRecorder(activeStream, {
      mimeType: preferredMimeType,
    })

    chunkRef.current = []
    startTimestampRef.current = performance.now()
    console.debug('startRecording: created new MediaRecorder', { mimeType: preferredMimeType })

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) {
        chunkRef.current.push(event.data)
      }
    })

    recorder.addEventListener('error', (recorderError) => {
      console.error('MediaRecorder error:', recorderError)
      setError(
        recorderError instanceof Error
          ? recorderError.message
          : 'An unexpected recording error occurred.',
      )
      setIsRecording(false)
    })

    try {
      // Wait for the recorder to actually start before returning
      await new Promise<void>((resolve, reject) => {
        const handleStart = () => {
          recorder.removeEventListener('start', handleStart)
          recorder.removeEventListener('error', handleError)
          mediaRecorderRef.current = recorder
          setIsRecording(true)
          console.debug('startRecording: recording started successfully', { state: recorder.state })
          resolve()
        }

        const handleError = (event: Event) => {
          recorder.removeEventListener('start', handleStart)
          recorder.removeEventListener('error', handleError)
          const errorMessage = 'Failed to start MediaRecorder'
          console.error('startRecording: MediaRecorder start error', event)
          mediaRecorderRef.current = null
          setIsRecording(false)
          reject(new Error(errorMessage))
        }

        recorder.addEventListener('start', handleStart, { once: true })
        recorder.addEventListener('error', handleError, { once: true })
        
        try {
          recorder.start()
        } catch (startError) {
          recorder.removeEventListener('start', handleStart)
          recorder.removeEventListener('error', handleError)
          console.error('startRecording: failed to start recorder', startError)
          mediaRecorderRef.current = null
          setIsRecording(false)
          reject(startError)
        }
      })
    } catch (error) {
      console.error('startRecording: failed to start recorder', error)
      mediaRecorderRef.current = null
      setIsRecording(false)
      throw error
    }
  }, [isRecording, isSupported, preferredMimeType, requestPermission, stream, stopStreamTracks])

  const stopRecording = useCallback((): Promise<StopRecordingResult | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder) {
        console.debug('stopRecording: no recorder found')
        setIsRecording(false)
        resolve(null)
        return
      }
      
      if (recorder.state === 'inactive') {
        console.debug('stopRecording: recorder already inactive')
        setIsRecording(false)
        resolve(null)
        return
      }
      
      if (recorder.state !== 'recording') {
        console.debug(`stopRecording: recorder state is ${recorder.state}, expected 'recording'`)
        setIsRecording(false)
        resolve(null)
        return
      }

      const handleStop = () => {
        recorder.removeEventListener('stop', handleStop)
        setIsRecording(false)

        const mimeType = recorder.mimeType || preferredMimeType
        const blob = new Blob(chunkRef.current, { type: mimeType })
        const startedAt = startTimestampRef.current ?? performance.now()
        const durationMs = performance.now() - startedAt
        chunkRef.current = []
        startTimestampRef.current = null

        console.debug('stopRecording: recording stopped', { 
          blobSize: blob.size, 
          durationMs,
          mimeType 
        })

        resolve({
          blob,
          mimeType,
          durationMs,
        })
      }

      recorder.addEventListener('stop', handleStop, { once: true })
      recorder.addEventListener('error', (event) => {
        console.error('MediaRecorder error during stop:', event)
        setIsRecording(false)
        resolve(null)
      }, { once: true })
      
      try {
        recorder.stop()
      } catch (error) {
        console.error('Error stopping recorder:', error)
        setIsRecording(false)
        resolve(null)
      }
    })
  }, [preferredMimeType])

  const reset = useCallback(() => {
    setIsRecording(false)
    setError(null)
    setPermission('idle')
    chunkRef.current = []
    startTimestampRef.current = null
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    mediaRecorderRef.current = null
    stopStreamTracks(stream)
    setStream(null)
  }, [stopStreamTracks, stream])

  return {
    stream,
    permission,
    isRecording,
    error,
    isSupported,
    requestPermission,
    startRecording,
    stopRecording,
    reset,
  }
}


