import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex min-h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
