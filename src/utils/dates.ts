/**
 * Format a date string consistently across server and client to prevent hydration mismatches.
 * Uses a fixed locale and format options to ensure the same output on both server and client.
 */

/**
 * Format a date as a readable date string (e.g., "Nov 15, 2025")
 * This format is consistent regardless of the user's locale
 */
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Use a fixed locale and options to ensure consistency between server and client
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj)
}

/**
 * Format a date and time as a readable string (e.g., "Nov 15, 2025, 2:30 PM")
 * This format is consistent regardless of the user's locale
 */
export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Use a fixed locale and options to ensure consistency between server and client
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj)
}

/**
 * Format a time as a readable string (e.g., "2:30 PM")
 * This format is consistent regardless of the user's locale
 */
export function formatTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  // Use a fixed locale and options to ensure consistency between server and client
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj)
}

