import { useCallback, useEffect, useState } from 'react';

export interface ToastState {
  type: 'success' | 'error';
  message: string;
}

/**
 * Lightweight in-page toast/banner state — replaces native alert() for
 * reporting success/error messages. Success toasts auto-dismiss; errors
 * stay until the user reads and closes them.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showSuccess = useCallback((message: string) => setToast({ type: 'success', message }), []);
  const showError = useCallback((message: string) => setToast({ type: 'error', message }), []);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (toast?.type !== 'success') return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, showSuccess, showError, dismiss };
}
