import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createRealtimeClientSecret,
  type RealtimePrototypeClientSecretResult,
} from '~/server/createRealtimeSession'

type RealtimePrototypeStatus =
  | 'idle'
  | 'fetchingSecret'
  | 'ready'
  | 'connecting'
  | 'connected'
  | 'error'

type UseRealtimePrototypeOptions = {
  enabled: boolean
  huddleSlug: string
}

type RealtimePrototypeState = {
  status: RealtimePrototypeStatus
  error: string | null
  clientSecret: string | null
  session: Record<string, any> | null
  callId: string | null
  remoteStream: MediaStream | null
  expiresAt: number | null
  connect: () => Promise<void>
  disconnect: () => void
  refreshSecret: () => Promise<string>
}

const ICE_SERVERS: RTCConfiguration['iceServers'] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

async function waitForIceGatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') {
    return
  }
  await new Promise<void>((resolve) => {
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState)
        resolve()
      }
    }
    pc.addEventListener('icegatheringstatechange', checkState)
  })
}

export function useRealtimePrototype({
  enabled,
  huddleSlug,
}: UseRealtimePrototypeOptions): RealtimePrototypeState {
  const [status, setStatus] = useState<RealtimePrototypeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [session, setSession] = useState<Record<string, any> | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callId, setCallId] = useState<string | null>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const secretRequestIdRef = useRef(0)

  const resetConnectionState = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    dataChannelRef.current?.close()
    dataChannelRef.current = null
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    localStreamRef.current = null
    setRemoteStream(null)
    setCallId(null)
  }, [])

  const refreshSecret = useCallback(async (): Promise<string> => {
    if (!import.meta.env.DEV) {
      console.warn('Realtime prototype is limited to development builds.')
      throw new Error('Realtime prototype is limited to development builds.')
    }

    const nextRequestId = secretRequestIdRef.current + 1
    secretRequestIdRef.current = nextRequestId

    setStatus('fetchingSecret')
    setError(null)

    try {
      const result = (await createRealtimeClientSecret({
        data: { huddleSlug },
      })) as RealtimePrototypeClientSecretResult

      if (secretRequestIdRef.current !== nextRequestId) {
        return result.clientSecret
      }

      const secretValue = result.clientSecret ?? null
      if (!secretValue) {
        throw new Error('Realtime client secret response missing value.')
      }

      setClientSecret(secretValue)
      setExpiresAt(result.expiresAt)
      setSession(result.session)
      setStatus('ready')
      return secretValue
    } catch (secretError) {
      if (secretRequestIdRef.current !== nextRequestId) {
        throw secretError
      }
      const message =
        secretError instanceof Error
          ? secretError.message
          : 'Failed to mint realtime client secret.'
      setError(message)
      setStatus('error')
      throw secretError
    }
  }, [huddleSlug])

  const connect = useCallback(async () => {
    try {
      if (status === 'connecting' || status === 'connected') {
        return
      }

      let secretValue = clientSecret ?? null
      if (!secretValue) {
        secretValue = await refreshSecret()
      }

      const authToken = secretValue ?? null

      if (!authToken) {
        throw new Error('Realtime client secret is unavailable.')
      }

      setStatus('connecting')
      setError(null)

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      })

      localStreamRef.current = mediaStream

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      const outgoingChannel = pc.createDataChannel('oai-events')
      outgoingChannel.onopen = () => {
        console.debug('[RealtimePrototype] Data channel open')
      }
      outgoingChannel.onclose = () => {
        console.debug('[RealtimePrototype] Data channel closed')
      }
      outgoingChannel.onerror = (event) => {
        console.error('[RealtimePrototype] Data channel error', event)
      }
      dataChannelRef.current = outgoingChannel

      pc.ondatachannel = (event) => {
        event.channel.onmessage = (messageEvent) => {
          console.debug('[RealtimePrototype] Message', messageEvent.data)
        }
      }

      pc.ontrack = (event) => {
        const [stream] = event.streams
        const targetStream = stream ?? new MediaStream([event.track])
        setRemoteStream(targetStream)
      }

      pc.onconnectionstatechange = () => {
        if (!pcRef.current) {
          return
        }
        if (pcRef.current.connectionState === 'failed') {
          setError('Realtime peer connection failed.')
          setStatus('error')
        } else if (pcRef.current.connectionState === 'disconnected') {
          setStatus('ready')
        }
      }

      mediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, mediaStream)
      })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await waitForIceGatheringComplete(pc)

      const formData = new FormData()
      formData.append('sdp', pc.localDescription?.sdp ?? '')
      formData.append(
        'session',
        JSON.stringify({
          metadata: {
            huddleSlug,
          },
        }),
      )

      const callResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'OpenAI-Beta': 'realtime=v1',
        },
        body: formData,
      })

      if (!callResponse.ok) {
        const errorText = await callResponse.text().catch(() => '')
        throw new Error(
          `Realtime call creation failed (${callResponse.status} ${callResponse.statusText})${
            errorText ? `: ${errorText}` : ''
          }`,
        )
      }

      const locationHeader = callResponse.headers.get('location')
      if (locationHeader) {
        setCallId(locationHeader)
      }

      const answerSdp = await callResponse.text()
      const remoteDescription = new RTCSessionDescription({
        type: 'answer',
        sdp: answerSdp,
      })
      await pc.setRemoteDescription(remoteDescription)

      setStatus('connected')
    } catch (connectionError) {
      console.error('[RealtimePrototype] connect() failed', connectionError)
      resetConnectionState()
      setStatus('error')
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : 'Failed to connect to realtime session.',
      )
    }
  }, [clientSecret, huddleSlug, refreshSecret, resetConnectionState, status])

  const disconnect = useCallback(() => {
    resetConnectionState()
    setStatus(clientSecret ? 'ready' : 'idle')
    setError(null)
  }, [clientSecret, resetConnectionState])

  useEffect(() => {
    if (!enabled) {
      disconnect()
      setClientSecret(null)
      setExpiresAt(null)
      setSession(null)
      return
    }

    if (!clientSecret) {
      void refreshSecret().catch((error) => {
        console.error('[RealtimePrototype] Failed to refresh client secret', error)
      })
    }

    return () => {
      disconnect()
    }
  }, [clientSecret, disconnect, enabled, refreshSecret])

  return useMemo(
    () => ({
      status,
      error,
      clientSecret,
      session,
      callId,
      remoteStream,
      expiresAt,
      connect,
      disconnect,
      refreshSecret,
    }),
    [
      callId,
      clientSecret,
      connect,
      disconnect,
      error,
      expiresAt,
      refreshSecret,
      remoteStream,
      session,
      status,
    ],
  )
}

