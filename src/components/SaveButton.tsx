import { forwardRef } from 'react'
import clsx from 'clsx'
import { Button } from '~/components/ui/button'

export const SaveButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      tabIndex={0}
      className={clsx(
        'bg-blue-500 text-left text-sm font-medium text-white hover:bg-blue-600',
        className,
      )}
      {...props}
    />
  )
})
