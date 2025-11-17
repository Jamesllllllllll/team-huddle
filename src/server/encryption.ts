import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits
const SALT_LENGTH = 32
const TAG_LENGTH = 16

/**
 * Get the encryption key from environment variable.
 * Falls back to a default key in development (not secure for production).
 */
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.OPENAI_API_KEY_ENCRYPTION_KEY
  if (!keyEnv) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'OPENAI_API_KEY_ENCRYPTION_KEY must be set in production to encrypt user API keys.',
      )
    }
    // Development fallback - generate a deterministic key from a fixed salt
    // This is NOT secure and should only be used in development
    console.warn(
      '⚠️  OPENAI_API_KEY_ENCRYPTION_KEY not set. Using development fallback (NOT SECURE).',
    )
    return scryptSync('dev-fallback-key', 'dev-salt', KEY_LENGTH)
  }
  // In production, the key should be a 32-byte hex string or base64
  // We'll derive a key from it using scrypt for additional security
  const keyBuffer = Buffer.from(keyEnv, 'hex')
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(
      `OPENAI_API_KEY_ENCRYPTION_KEY must be ${KEY_LENGTH * 2} hex characters (${KEY_LENGTH} bytes).`,
    )
  }
  return keyBuffer
}

/**
 * Encrypt a plaintext string (e.g., OpenAI API key) using AES-256-GCM.
 * Returns a base64-encoded string containing: salt + iv + encrypted data + auth tag
 */
export function encrypt(plaintext: string): string {
  if (!plaintext || plaintext.trim().length === 0) {
    throw new Error('Cannot encrypt empty string')
  }

  const key = getEncryptionKey()
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)

  // Derive a key from the master key and salt
  const derivedKey = scryptSync(key, salt, KEY_LENGTH)

  const cipher = createCipheriv(ALGORITHM, derivedKey, iv)
  cipher.setEncoding('base64')

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Combine: salt (32) + iv (16) + authTag (16) + encrypted data
  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'base64'),
  ])

  return combined.toString('base64')
}

/**
 * Decrypt a base64-encoded encrypted string.
 * Expects format: salt + iv + auth tag + encrypted data
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64 || encryptedBase64.trim().length === 0) {
    throw new Error('Cannot decrypt empty string')
  }

  const key = getEncryptionKey()
  const combined = Buffer.from(encryptedBase64, 'base64')

  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH)
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH,
  )
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  // Derive the same key from master key and salt
  const derivedKey = scryptSync(key, salt, KEY_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encrypted, undefined, 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

