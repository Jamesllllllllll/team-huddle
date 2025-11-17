import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type VoiceActivityTurn = {
  blob: Blob
  mimeType: string
  durationMs: number
  startedAt: number
  endedAt: number
}

type VoiceActivityRecorderStatus =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'capturing'
  | 'error'

type UseVoiceActivityRecorderOptions = {
  enabled: boolean
  onTurn: (turn: VoiceActivityTurn) => Promise<void> | void
  preferredMimeType?: string
  startThreshold?: number
  stopThreshold?: number
  minCaptureMs?: number
  minSilenceMs?: number
  maxCaptureMs?: number
  sampleIntervalMs?: number
  debug?: boolean
}

export type VoiceActivityRecorderState = {
  status: VoiceActivityRecorderStatus
  error: string | null
  isListening: boolean
  isCapturing: boolean
  lastTurnDurationMs: number | null
  turnCount: number
  start: () => Promise<void>
  stop: () => void
}

const DEFAULT_PREFERRED_MIME = 'audio/webm;codecs=opus'

export function useVoiceActivityRecorder({
  enabled,
  onTurn,
  preferredMimeType = DEFAULT_PREFERRED_MIME,
  startThreshold = 0.045,
  stopThreshold = 0.02,
  minCaptureMs = 700,
  minSilenceMs = 750,
  maxCaptureMs = 60_000,
  sampleIntervalMs = 0,
  debug = false,
}: UseVoiceActivityRecorderOptions): VoiceActivityRecorderState {
  const [status, setStatus] = useState<VoiceActivityRecorderStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastTurnDurationMs, setLastTurnDurationMs] = useState<number | null>(null)
  const [turnCount, setTurnCount] = useState(0)

  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Array<BlobPart>>([])
  const speechActiveRef = useRef(false)
  const turnStartTimestampRef = useRef(0)
  const lastSpeechTimestampRef = useRef(0)
  const discardNextRecordingRef = useRef(false)
  const statusRef = useRef<VoiceActivityRecorderStatus>('idle')

  const debugLog = useCallback(
    (...args: Array<unknown>) => {
      if (debug && typeof console !== 'undefined') {
        console.debug('[VoiceActivityRecorder]', ...args)
      }
    },
    [debug],
  )

  const cleanupAudioGraph = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    analyserRef.current = null

    const ctx = audioContextRef.current
    if (ctx) {
      audioContextRef.current = null
      try {
        void ctx.close()
      } catch {
        // ignore
      }
    }
  }, [])

  const stopMediaStream = useCallback(() => {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          // ignore
        }
      }
    }
    streamRef.current = null
  }, [])

  const stopRecorder = useCallback(
    (reason: 'manual' | 'silence' | 'maxDuration') => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        if (reason === 'manual') {
          discardNextRecordingRef.current = true
        }
        try {
          recorder.stop()
        } catch {
          // ignore
        }
      } else {
        speechActiveRef.current = false
        if (statusRef.current !== 'error') {
          setStatus('listening')
          statusRef.current = 'listening'
        }
      }
    },
    [],
  )

  const stop = useCallback(() => {
    debugLog('stop() invoked')
    stopRecorder('manual')
    cleanupAudioGraph()
    stopMediaStream()
    speechActiveRef.current = false
    if (statusRef.current !== 'idle') {
      statusRef.current = 'idle'
      setStatus('idle')
    }
  }, [cleanupAudioGraph, debugLog, stopMediaStream, stopRecorder])

  const handleTurnAvailable = useCallback(
    async (turn: VoiceActivityTurn) => {
      // Immediately reset status so the UI reflects that capture has ended,
      // even while the upload is in flight.
      setStatus('listening')
      statusRef.current = 'listening'

      try {
        await onTurn(turn)
        setError(null)
      } catch (turnError) {
        const message =
          turnError instanceof Error
            ? turnError.message
            : 'Failed to send recorded turn to the server.'
        setError(message)
        debugLog('onTurn error', turnError)
      }
    },
    [debugLog, onTurn],
  )

  const startMediaRecorder = useCallback(
    (stream: MediaStream) => {
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType: preferredMimeType })
      } catch {
        recorder = new MediaRecorder(stream)
      }

      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        const discard = discardNextRecordingRef.current
        discardNextRecordingRef.current = false

        const startedAt = turnStartTimestampRef.current
        const endedAt = performance.now()
        const durationMs = Math.max(0, endedAt - startedAt)
        speechActiveRef.current = false
        mediaRecorderRef.current = null

        if (discard) {
          debugLog('Recording discarded (manual stop).')
          if (statusRef.current !== 'error') {
            setStatus('listening')
            statusRef.current = 'listening'
          }
          return
        }

        if (durationMs < minCaptureMs) {
          debugLog('Recording discarded (duration below threshold)', durationMs)
          if (statusRef.current !== 'error') {
            setStatus('listening')
            statusRef.current = 'listening'
          }
          return
        }

        const mimeType =
          recorder.mimeType || preferredMimeType || DEFAULT_PREFERRED_MIME
        const blob = new Blob(chunksRef.current, { type: mimeType })
        chunksRef.current = []

        if (blob.size === 0) {
          debugLog('Recording discarded (empty blob)')
          if (statusRef.current !== 'error') {
            setStatus('listening')
            statusRef.current = 'listening'
          }
          return
        }

        setLastTurnDurationMs(durationMs)
        setTurnCount((count) => count + 1)

        void handleTurnAvailable({
          blob,
          mimeType,
          durationMs,
          startedAt,
          endedAt,
        })
      }

      recorder.onerror = (event) => {
        debugLog('MediaRecorder error', event)
        speechActiveRef.current = false
        mediaRecorderRef.current = null
        setError('MediaRecorder encountered an unexpected error.')
        setStatus('error')
        statusRef.current = 'error'
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setStatus('capturing')
      statusRef.current = 'capturing'
      turnStartTimestampRef.current = performance.now()
      lastSpeechTimestampRef.current = performance.now()
      speechActiveRef.current = true
      debugLog('MediaRecorder started')
    },
    [
      debugLog,
      handleTurnAvailable,
      minCaptureMs,
      preferredMimeType,
    ],
  )

  const analyzeAudioFrame = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) {
      return
    }

    const bufferLength = analyser.fftSize
    const timeDomainData = new Float32Array(bufferLength)

    const processFrame = () => {
      if (!analyserRef.current) {
        return
      }

      analyserRef.current.getFloatTimeDomainData(timeDomainData)
      let sumSquares = 0
      for (let index = 0; index < timeDomainData.length; index += 1) {
        const value = timeDomainData[index]
        sumSquares += value * value
      }

      const rms = Math.sqrt(sumSquares / timeDomainData.length)
      const now = performance.now()

      if (!speechActiveRef.current) {
        if (rms >= startThreshold) {
          const stream = streamRef.current
          if (stream) {
            debugLog('Speech detected, starting capture. RMS:', rms)
            startMediaRecorder(stream)
          }
        }
      } else {
        if (rms >= stopThreshold) {
          lastSpeechTimestampRef.current = now
        }

        const elapsed = now - turnStartTimestampRef.current
        const silenceElapsed = now - lastSpeechTimestampRef.current

        if (elapsed >= maxCaptureMs) {
          debugLog('Stopping capture (max duration reached).')
          stopRecorder('maxDuration')
        } else if (
          silenceElapsed >= minSilenceMs &&
          elapsed >= minCaptureMs &&
          mediaRecorderRef.current
        ) {
          debugLog('Stopping capture (silence detected).')
          stopRecorder('silence')
        }
      }

      if (sampleIntervalMs > 0) {
        animationFrameRef.current = window.setTimeout(
          processFrame,
          sampleIntervalMs,
        ) as unknown as number
      } else {
        animationFrameRef.current = window.requestAnimationFrame(processFrame)
      }
    }

    if (sampleIntervalMs > 0) {
      animationFrameRef.current = window.setTimeout(
        processFrame,
        sampleIntervalMs,
      ) as unknown as number
    } else {
      animationFrameRef.current = window.requestAnimationFrame(processFrame)
    }
  }, [
    debugLog,
    maxCaptureMs,
    minCaptureMs,
    minSilenceMs,
    sampleIntervalMs,
    startMediaRecorder,
    startThreshold,
    stopRecorder,
    stopThreshold,
  ])

  const start = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    if (!window.navigator?.mediaDevices?.getUserMedia) {
      setError('Browser does not support microphone capture.')
      setStatus('error')
      statusRef.current = 'error'
      return
    }

    if (typeof window.MediaRecorder === 'undefined') {
      setError('MediaRecorder is not supported in this browser.')
      setStatus('error')
      statusRef.current = 'error'
      return
    }

    if (
      statusRef.current === 'requesting' ||
      statusRef.current === 'listening' ||
      statusRef.current === 'capturing'
    ) {
      debugLog('start() ignored – already running', statusRef.current)
      return
    }

    try {
      setError(null)
      setStatus('requesting')
      statusRef.current = 'requesting'
      debugLog('Requesting microphone access')

      const stream = await window.navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24_000,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      })

      streamRef.current = stream

      const AudioContextClass: typeof AudioContext =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

      const audioContext = new AudioContextClass()
      audioContextRef.current = audioContext

      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const sourceNode = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8

      sourceNode.connect(analyser)
      analyserRef.current = analyser

      setStatus('listening')
      statusRef.current = 'listening'
      lastSpeechTimestampRef.current = performance.now()
      speechActiveRef.current = false

      debugLog('Microphone ready, starting analyser loop')
      analyzeAudioFrame()
    } catch (requestError) {
      debugLog('Failed to start recorder', requestError)
      stop()
      const message =
        requestError instanceof Error
          ? requestError.message
          : 'Unable to access the microphone.'
      setError(message)
      setStatus('error')
      statusRef.current = 'error'
    }
  }, [analyzeAudioFrame, debugLog, stop])

  useEffect(() => {
    if (!enabled) {
      stop()
      return
    }

    let cancelled = false

    const startWithGuard = async () => {
      try {
        await start()
      } catch (startError) {
        if (!cancelled) {
          debugLog('start() failed inside effect', startError)
        }
      }
    }

    void startWithGuard()

    return () => {
      cancelled = true
      stop()
    }
  }, [enabled, start, stop])

  return useMemo(
    () => ({
      status,
      error,
      isListening: status === 'listening' || status === 'capturing',
      isCapturing: status === 'capturing',
      lastTurnDurationMs,
      turnCount,
      start,
      stop,
    }),
    [error, lastTurnDurationMs, start, status, stop, turnCount],
  )
}


