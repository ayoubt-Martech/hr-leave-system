import { Loader2 } from 'lucide-react';
import React from 'react';

interface LoadingStateProps {
  label?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ label = 'Loading…' }) => (
  <div className="py-20 flex flex-col items-center justify-center gap-2 text-zinc-400">
    <Loader2 className="w-5 h-5 animate-spin" />
    <span className="text-xs font-medium">{label}</span>
  </div>
);
