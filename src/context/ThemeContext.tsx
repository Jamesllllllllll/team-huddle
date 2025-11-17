import * as React from 'react'

type Theme = 'default' | 'sage-garden' | 'tangerine'

const THEME_STORAGE_KEY = 'huddle:theme'

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'default'
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return (stored as Theme) || 'default'
}

function setStoredTheme(theme: Theme) {
  if (typeof window === 'undefined') return
  localStorage.setItem(THEME_STORAGE_KEY, theme)
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize with 'default' to match server render, then sync from localStorage after mount
  // This prevents hydration mismatch between server and client
  const [theme, setThemeState] = React.useState<Theme>('default')
  const [isHydrated, setIsHydrated] = React.useState(false)

  // Sync theme from localStorage after hydration to prevent mismatch
  React.useEffect(() => {
    const storedTheme = getStoredTheme()
    setThemeState(storedTheme)
    setIsHydrated(true)
  }, [])

  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    setStoredTheme(newTheme)
  }, [])

  // Apply theme on mount and when theme changes
  React.useEffect(() => {
    if (typeof document !== 'undefined' && isHydrated) {
      const html = document.documentElement
      // Remove all theme classes
      html.classList.remove('theme-sage-garden')
      html.classList.remove('theme-tangerine')
      // Add theme class if not default
      if (theme !== 'default') {
        html.classList.add(`theme-${theme}`)
      }
    }
  }, [theme, isHydrated])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

