import * as React from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '~/components/ui/button'

type IconToggleProps = {
  onClick: () => void
  iconKey: string
  icon: React.ReactNode
  label: string
  title?: string
  className?: string
}

const variants = {
  hidden: { opacity: 0.5, scale: 0.7, blur: 6 },
  visible: { opacity: 1, scale: 1, blur: 0 },
}

export function IconToggle({
  onClick,
  iconKey,
  icon,
  label,
  title,
  className,
}: IconToggleProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      className={['h-9 w-9 p-0', className].filter(Boolean).join(' ')}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={iconKey}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          className="flex items-center justify-center"
        >
          {icon}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}


