import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/cn'
import { ButtonHTMLAttributes, forwardRef } from 'react'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl px-4 py-2 border transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--neon-cyan)]',
  {
    variants: {
      variant: {
        primary: 'text-[#0b0d12] bg-gradient-to-r from-[color:var(--neon-cyan)] to-[color:var(--neon-violet)] border-transparent shadow-[0_6px_20px_rgba(125,211,252,0.22)]',
        ghost: 'bg-transparent border-[color:var(--border)]',
      },
      size: {
        sm: 'text-sm h-8',
        md: 'text-base h-10',
        lg: 'text-lg h-12'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
))
Button.displayName = 'Button'

