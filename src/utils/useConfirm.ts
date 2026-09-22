import { useCallback, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Promise-based replacement for native confirm(). Usage:
 *   const ok = await confirm({ title: '...', message: '...' });
 *   if (!ok) return;
 * Render <ConfirmDialog {...dialogProps} /> once per component using this.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state?.resolve(true);
    setState(null);
  }, [state]);

  const handleCancel = useCallback(() => {
    state?.resolve(false);
    setState(null);
  }, [state]);

  return {
    confirm,
    dialogProps: state
      ? {
          open: true as const,
          title: state.title,
          message: state.message,
          confirmLabel: state.confirmLabel,
          cancelLabel: state.cancelLabel,
          tone: state.tone,
          onConfirm: handleConfirm,
          onCancel: handleCancel,
        }
      : null,
  };
}
