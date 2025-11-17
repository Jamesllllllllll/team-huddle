import * as React from 'react'
import { useTheme } from '~/context/ThemeContext'
import { IconToggle } from '~/components/ui/IconToggle'
import { Palette, Leaf, Citrus } from 'lucide-react'

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    const themes: Array<'default' | 'sage-garden' | 'tangerine'> = ['default', 'sage-garden', 'tangerine']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  const getThemeIcon = () => {
    switch (theme) {
      case 'sage-garden':
        return <Leaf className="h-4 w-4" />
      case 'tangerine':
        return <Citrus className="h-4 w-4" />
      default:
        return <Palette className="h-4 w-4" />
    }
  }

  const getThemeName = () => {
    switch (theme) {
      case 'sage-garden':
        return 'Sage Garden'
      case 'tangerine':
        return 'Tangerine'
      default:
        return 'Default'
    }
  }

  return (
    <IconToggle
      onClick={cycleTheme}
      iconKey={theme}
      icon={getThemeIcon()}
      label={`Current theme: ${getThemeName()}. Click to cycle themes.`}
      title={`Current theme: ${getThemeName()}. Click to cycle themes.`}
    />
  )
}

