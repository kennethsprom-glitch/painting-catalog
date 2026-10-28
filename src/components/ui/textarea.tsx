import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils.ts'

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-28 w-full rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
