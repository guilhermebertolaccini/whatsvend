import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8'
};

export function GlassCard({ children, className, padding = 'md' }: GlassCardProps) {
  return (
    <div className={cn(
      "bg-card/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg",
      paddingClasses[padding],
      className
    )}>
      {children}
    </div>
  );
}
