import { AlertCircle, Check, X } from 'lucide-react';
import React from 'react';
import { ToastState } from '../utils/useToast';

interface ToastBannerProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;

  const isError = toast.type === 'error';

  return (
    <div
      className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
        isError
          ? 'bg-rose-50 border-rose-200 text-rose-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
        ) : (
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
        )}
        <span>{toast.message}</span>
      </div>
      <button
        onClick={onDismiss}
        className={`shrink-0 ml-3 cursor-pointer ${isError ? 'text-rose-600 hover:text-rose-800' : 'text-emerald-600 hover:text-emerald-800'}`}
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
