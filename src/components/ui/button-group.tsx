import * as React from 'react'

import { cn } from '~/lib/utils'

type ButtonGroupProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    <div
      ref={ref}
      role="group"
      data-orientation={orientation}
      className={cn(
        'isolate inline-flex items-stretch overflow-hidden rounded-md border border-input bg-background text-foreground shadow-xs',
        orientation === 'vertical'
          ? 'flex-col [&>[data-slot=button]]:-mt-px [&>[data-slot=button]]:ml-0 [&>[data-slot=button]:first-child]:rounded-t-md [&>[data-slot=button]:last-child]:rounded-b-md'
          : 'flex-row [&>[data-slot=button]]:-ml-px [&>[data-slot=button]:first-child]:ml-0 [&>[data-slot=button]:first-child]:rounded-l-md [&>[data-slot=button]:last-child]:rounded-r-md',
        '[&>[data-slot=button]]:rounded-none [&>[data-slot=button]]:border-0 [&>[data-slot=button]]:shadow-none [&>[data-slot=button]]:focus:z-10',
        className,
      )}
      {...props}
    />
  ),
)
ButtonGroup.displayName = 'ButtonGroup'

export { ButtonGroup }

