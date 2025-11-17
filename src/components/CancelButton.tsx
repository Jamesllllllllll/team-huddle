import { forwardRef } from 'react'
import clsx from 'clsx'
import { Button } from '~/components/ui/button'

export const CancelButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      tabIndex={0}
      className={clsx(
        'text-left text-sm font-medium hover:bg-slate-200 focus:bg-slate-200',
        className,
      )}
      {...props}
    />
  )
})
