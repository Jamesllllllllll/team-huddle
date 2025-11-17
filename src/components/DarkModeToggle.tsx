import * as React from 'react'
import { useDarkMode } from '~/hooks/useDarkMode'
import { Moon, Sun } from 'lucide-react'
import { IconToggle } from '~/components/ui/IconToggle'

export function DarkModeToggle() {
  const { isDark, toggle } = useDarkMode()

  return (
    <IconToggle
      onClick={toggle}
      iconKey={isDark ? 'moon' : 'sun'}
      icon={isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    />
  )
}

