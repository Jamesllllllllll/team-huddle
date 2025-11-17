import { createServerFn } from '@tanstack/react-start'
import { AwsClient } from 'aws4fetch'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { z } from 'zod'

const zUploadPayload = z.object({
  base64: z.string().min(10),
  mimeType: z.union([z.literal('image/png'), z.literal('image/jpeg')]),
  filename: z.string().optional(),
  source: z.enum(['upload', 'camera']).default('upload'),
})


const PRESET_AVATAR_MANIFEST_KEY = 'preset-avatars/manifest.json'

const zPresetAvatarEntry = z.object({
  storageId: z.string().min(1),
  url: z.string().url(),
  styleHint: z.string().optional(),
  label: z.string().optional(),
})

const zPresetAvatarManifest = z.object({
  generatedAt: z.string().optional().nullable(),
  items: z.array(zPresetAvatarEntry),
})

export type PresetAvatarOption = z.infer<typeof zPresetAvatarEntry>
export type PresetAvatarManifest = z.infer<typeof zPresetAvatarManifest>

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicUrlBase?: string
}

let cachedR2Client: AwsClient | null = null
let cachedR2Config: R2Config | null = null

function getR2Config(): R2Config {
  if (cachedR2Config) {
    return cachedR2Config
  }

  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  const bucket = process.env.CLOUDFLARE_R2_BUCKET
  const publicUrlBase = process.env.CLOUDFLARE_R2_PUBLIC_URL

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Cloudflare R2 is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, and CLOUDFLARE_R2_BUCKET.',
    )
  }

  cachedR2Config = {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrlBase: publicUrlBase?.replace(/\/$/, ''),
  }

  return cachedR2Config
}

function getR2Client(): AwsClient {
  if (cachedR2Client) {
    return cachedR2Client
  }

  const { accessKeyId, secretAccessKey } = getR2Config()

  cachedR2Client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  })

  return cachedR2Client
}

function getR2PublicBase(config: R2Config = getR2Config()) {
  return (
    config.publicUrlBase ??
    `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`
  )
}

async function uploadToR2({
  data,
  mimeType,
  filename,
  objectKey,
  metadata,
}: {
  data: Uint8Array
  mimeType: string
  filename?: string
  objectKey?: string
  metadata?: Record<string, string>
}) {
  const config = getR2Config()
  const client = getR2Client()
  const key = objectKey ?? buildObjectKey(filename)

  const baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com`
  const targetUrl = `${baseUrl}/${config.bucket}/${encodeURI(key)}`
  const headers = new Headers({
    'Content-Type': mimeType,
    'x-amz-meta-created-by': 'huddle-app',
  })
  if (metadata) {
    for (const [header, value] of Object.entries(metadata)) {
      headers.set(header, value)
    }
  }
  const response = await client.fetch(targetUrl, {
    method: 'PUT',
    headers,
    body: toArrayBuffer(data),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Failed to upload avatar to Cloudflare R2. ${response.status} ${response.statusText} ${errorText}`,
    )
  }

  return {
    storageId: key,
    url: `${getR2PublicBase(config)}/${key}`,
  }
}

function buildObjectKey(filename?: string) {
  const now = new Date()
  const parts = [
    now.getUTCFullYear(),
    (now.getUTCMonth() + 1).toString().padStart(2, '0'),
    now.getUTCDate().toString().padStart(2, '0'),
  ]
  const baseName =
    filename?.replace(/[^\w.-]+/g, '_').slice(0, 80) ??
    `avatar-${now.getTime()}-${randomUUID()}`
  return `${parts.join('/')}/${baseName}`
}

function decodeBase64Image(base64: string) {
  const sanitized = base64.includes(',')
    ? base64.split(',').at(-1) ?? ''
    : base64
  if (!sanitized) {
    throw new Error('Image payload was empty after decoding.')
  }
  const buffer = Buffer.from(sanitized, 'base64')
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
}

function toArrayBuffer(view: Uint8Array) {
  const buffer = new ArrayBuffer(view.byteLength)
  new Uint8Array(buffer).set(view)
  return buffer
}

export const uploadAvatarFromBase64 = createServerFn({ method: 'POST' })
  .inputValidator((payload) => zUploadPayload.parse(payload))
  .handler(async ({ data }) => {
    const buffer = decodeBase64Image(data.base64)
    const stored = await uploadToR2({
      data: buffer,
      mimeType: data.mimeType,
      filename: data.filename,
      metadata: {
        'x-amz-meta-purpose': 'avatar',
        'x-amz-meta-source': data.source,
      },
    })
    const updatedAt = new Date().toISOString()
    return {
      ...stored,
      updatedAt,
      source: data.source,
    }
  })


export const listPresetAvatars = createServerFn({ method: 'GET' }).handler(
  async () => {
    const config = getR2Config()
    const manifestUrl = `${getR2PublicBase(
      config,
    )}/${PRESET_AVATAR_MANIFEST_KEY}`

    let response: Response
    try {
      response = await fetch(manifestUrl, {
        method: 'GET',
        cache: 'no-store',
      })
    } catch (error) {
      console.error('Failed to reach Cloudflare R2 for preset avatars', error)
      throw new Error('Unable to load preset avatars right now.')
    }

    if (response.status === 404) {
      return { generatedAt: null, items: [] }
    }

    if (!response.ok) {
      throw new Error(
        `Unable to load preset avatars manifest (${response.status})`,
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      console.error('Preset avatar manifest is not valid JSON', error)
      throw new Error('Unable to parse preset avatars manifest.')
    }

    const manifest = zPresetAvatarManifest.parse(payload)
    return {
      generatedAt: manifest.generatedAt ?? null,
      items: manifest.items,
    }
  },
)

const HUDDLE_AVATAR_MANIFEST_KEY = 'huddle-avatars/manifest.json'

const zHuddleAvatarEntry = z.object({
  storageId: z.string().min(1),
  url: z.string().url(),
  sourceImage: z.string().optional(),
  styleDescription: z.string().optional(),
  label: z.string().optional(),
})

const zHuddleAvatarManifest = z.object({
  generatedAt: z.string().optional().nullable(),
  items: z.array(zHuddleAvatarEntry),
})

export const getHuddleAvatarForName = createServerFn()
  .inputValidator((payload) => z.object({ name: z.string().min(1) }).parse(payload))
  .handler(async ({ data }) => {
    const config = getR2Config()
    const manifestUrl = `${getR2PublicBase(config)}/${HUDDLE_AVATAR_MANIFEST_KEY}`

    let response: Response
    try {
      response = await fetch(manifestUrl, {
        method: 'GET',
        cache: 'no-store',
      })
    } catch (error) {
      console.error('Failed to reach Cloudflare R2 for huddle avatars', error)
      return null
    }

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      console.error(`Unable to load huddle avatars manifest (${response.status})`)
      return null
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      console.error('Huddle avatar manifest is not valid JSON', error)
      return null
    }

    const manifest = zHuddleAvatarManifest.parse(payload)
    
    // Log all manifest items for debugging
    console.log('[getHuddleAvatarForName] Manifest loaded with', manifest.items.length, 'items')
    console.log('[getHuddleAvatarForName] Full manifest items:', JSON.stringify(manifest.items, null, 2))
    console.log('[getHuddleAvatarForName] Items summary:', manifest.items.map(item => ({
      storageId: item.storageId,
      label: item.label,
      url: item.url,
      sourceImage: item.sourceImage,
    })))
    
    // Normalize special characters and remove spaces (e.g., ő -> o, é -> e, "ras mic" -> "rasmic")
    const normalizeName = (name: string): string => {
      return name
        .replace(/\s+/g, '') // Remove all spaces first
        .normalize('NFD') // Decompose characters (ő becomes o + combining mark)
        .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
        .toLowerCase()
    }
    
    // Name aliases: map alternative names to their canonical avatar names
    const nameAliases: Record<string, string> = {
      'micky': 'rasmic',
    }
    
    // Normalize the input name - remove spaces so "ras mic" matches "rasmic"
    // We'll check both the full normalized name and the first part
    const trimmedName = data.name.trim()
    const normalizedInputFull = normalizeName(trimmedName) // "ras mic" -> "rasmic"
    const normalizedInputFirst = normalizeName(trimmedName.split(/\s+/)[0]) // "ras mic" -> "ras", "rasmic" -> "rasmic"
    
    // Apply name aliases if available
    const aliasedFull = nameAliases[normalizedInputFull] ?? normalizedInputFull
    const aliasedFirst = nameAliases[normalizedInputFirst] ?? normalizedInputFirst
    
    // Try matching with full normalized name first (for cases like "ras mic" -> "rasmic")
    // Then fall back to first part (for normal cases like "John Doe" -> "john")
    const normalizedInput = aliasedFull || aliasedFirst
    
    // Special logging for Tanner
    const isTanner = trimmedName.toLowerCase().includes('tanner')
    if (isTanner) {
      console.log('[getHuddleAvatarForName] TANNER DETECTED - Detailed logging:', {
        originalInput: data.name,
        trimmedName,
        normalizedInputFull,
        normalizedInputFirst,
        aliasedFull,
        aliasedFirst,
        normalizedInput,
        manifestItemCount: manifest.items.length,
        allLabels: manifest.items.map(item => item.label).filter(Boolean),
        allStorageIds: manifest.items.map(item => item.storageId),
      })
    }
    
    if (!normalizedInput) {
      console.log('[getHuddleAvatarForName] No normalized input for:', data.name)
      if (isTanner) {
        console.log('[getHuddleAvatarForName] TANNER: Failed to normalize input')
      }
      return null
    }
    
    console.log('[getHuddleAvatarForName] Looking for:', normalizedInput, 'in manifest with', manifest.items.length, 'items')
    console.log('[getHuddleAvatarForName] Available labels:', manifest.items.map(item => item.label).filter(Boolean))
    
    // Find matching avatar by checking label or storageId filename
    // Check both aliasedFull and aliasedFirst to handle "ras mic" -> "rasmic" -> "micky"
    const matchingAvatar = manifest.items.find((item) => {
      // First try to match by label
      const label = item.label?.trim() ?? ''
      if (label) {
        const normalizedLabel = normalizeName(label) // "ras mic" or "rasmic" -> "rasmic"
        
        // Check if either aliased input matches the normalized label
        if (normalizedLabel === aliasedFull || normalizedLabel === aliasedFirst) {
          console.log('[getHuddleAvatarForName] Match found by label!', { 
            label, 
            normalizedLabel, 
            aliasedFull, 
            aliasedFirst,
            originalInput: data.name
          })
          if (isTanner) {
            console.log('[getHuddleAvatarForName] TANNER: Match found by label!', {
              label,
              normalizedLabel,
              aliasedFull,
              aliasedFirst,
              itemStorageId: item.storageId,
              itemUrl: item.url,
            })
          }
          return true
        }
        
        // Special logging for Tanner - check what labels we're comparing
        if (isTanner) {
          console.log('[getHuddleAvatarForName] TANNER: Comparing label', {
            itemLabel: label,
            normalizedLabel,
            aliasedFull,
            aliasedFirst,
            matches: normalizedLabel === aliasedFull || normalizedLabel === aliasedFirst,
          })
        }
      }
      
      // If no label or label doesn't match, try to match by storageId filename
      // e.g., "huddle-avatars/rasmic-avatar.png" -> "rasmic"
      // Handle cases like "tanner-avatar-avatar.png" -> extract "tanner" (before first "-avatar")
      const storageId = item.storageId ?? ''
      // Match filename pattern: extract name before "-avatar" (handles "tanner-avatar-avatar.png" -> "tanner")
      const filenameMatch = storageId.match(/([^/]+?)(?:-avatar)*\.(png|jpg|jpeg|webp)$/i)
      if (filenameMatch) {
        // Extract the base name (everything before any "-avatar" suffix)
        // For "tanner-avatar-avatar.png", this gives "tanner-avatar", but we want just "tanner"
        let filenameName = filenameMatch[1]
        // Remove any trailing "-avatar" patterns to get the actual name
        // "tanner-avatar" -> "tanner", "rasmic-avatar" -> "rasmic", "rasmic" -> "rasmic"
        filenameName = filenameName.replace(/-avatar+$/i, '')
        const normalizedFilename = normalizeName(filenameName) // "tanner" -> "tanner"
        
        // Check if either aliased input matches the normalized filename
        if (normalizedFilename === aliasedFull || normalizedFilename === aliasedFirst) {
          console.log('[getHuddleAvatarForName] Match found by filename!', { 
            storageId, 
            filenameName, 
            normalizedFilename, 
            aliasedFull, 
            aliasedFirst,
            originalInput: data.name
          })
          if (isTanner) {
            console.log('[getHuddleAvatarForName] TANNER: Match found by filename!', {
              storageId,
              filenameName,
              normalizedFilename,
              aliasedFull,
              aliasedFirst,
              itemLabel: item.label,
              itemUrl: item.url,
            })
          }
          return true
        }
        
        // Special logging for Tanner - check what filenames we're comparing
        if (isTanner) {
          console.log('[getHuddleAvatarForName] TANNER: Comparing filename', {
            storageId,
            filenameName,
            normalizedFilename,
            aliasedFull,
            aliasedFirst,
            matches: normalizedFilename === aliasedFull || normalizedFilename === aliasedFirst,
          })
        }
      } else if (isTanner) {
        console.log('[getHuddleAvatarForName] TANNER: No filename match pattern for storageId:', storageId)
      }
      
      return false
    })

    if (!matchingAvatar) {
      console.log('[getHuddleAvatarForName] No matching avatar found for:', normalizedInput)
      if (isTanner) {
        console.log('[getHuddleAvatarForName] TANNER: NO MATCH FOUND - Summary:', {
          originalInput: data.name,
          normalizedInput,
          aliasedFull,
          aliasedFirst,
          checkedLabels: manifest.items.map(item => ({
            label: item.label,
            normalized: item.label ? normalizeName(item.label) : null,
          })),
          checkedFilenames: manifest.items.map(item => {
            const match = item.storageId?.match(/([^/]+?)(?:-avatar)*\.(png|jpg|jpeg|webp)$/i)
            if (match) {
              let filename = match[1]
              filename = filename.replace(/-avatar+$/i, '')
              return {
                storageId: item.storageId,
                filename,
                normalized: normalizeName(filename),
              }
            }
            return null
          }).filter(Boolean),
        })
      }
      return null
    }
    
    console.log('[getHuddleAvatarForName] Returning avatar:', matchingAvatar.storageId)

    // Reconstruct URL from storageId to ensure it's correct (handles nested paths)
    const url = `${getR2PublicBase(config)}/${matchingAvatar.storageId}`
    
    return { url, storageId: matchingAvatar.storageId }
  })


