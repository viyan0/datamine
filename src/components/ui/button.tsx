import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';
const styles = cva('btn', {
  variants: { variant: { default: 'btn-primary', outline: 'btn-outline', ghost: 'btn-ghost' } },
  defaultVariants: { variant: 'default' },
});
export function Button({
  className,
  variant,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof styles> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(styles({ variant }), className)} {...props} />;
}
