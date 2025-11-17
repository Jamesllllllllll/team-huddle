import * as React from 'react'

const DARK_MODE_STORAGE_KEY = 'huddle:dark-mode'

function getStoredDarkMode(): boolean {
  if (typeof window === 'undefined') return false
  const stored = localStorage.getItem(DARK_MODE_STORAGE_KEY)
  if (stored === null) {
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return stored === 'true'
}

function setStoredDarkMode(isDark: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(DARK_MODE_STORAGE_KEY, String(isDark))
}

export function useDarkMode() {
  // Initialize with false to match server render, then sync from localStorage after mount
  // This prevents hydration mismatch between server and client
  const [isDark, setIsDarkState] = React.useState<boolean>(false)
  const [isHydrated, setIsHydrated] = React.useState(false)

  // Sync dark mode from localStorage after hydration to prevent mismatch
  React.useEffect(() => {
    const stored = getStoredDarkMode()
    setIsDarkState(stored)
    setIsHydrated(true)
  }, [])

  const setIsDark = React.useCallback((dark: boolean) => {
    setIsDarkState(dark)
    setStoredDarkMode(dark)
  }, [])

  const toggle = React.useCallback(() => {
    setIsDark(!isDark)
  }, [isDark, setIsDark])

  // Apply dark mode on mount and when it changes (only after hydration)
  React.useEffect(() => {
    if (typeof document !== 'undefined' && isHydrated) {
      const html = document.documentElement
      if (isDark) {
        html.classList.add('dark')
      } else {
        html.classList.remove('dark')
      }
    }
  }, [isDark, isHydrated])

  return { isDark, setIsDark, toggle }
}

