import { AlertTriangle } from 'lucide-react';
import React from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const isDanger = tone === 'danger';

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200">
        <div className="flex items-start gap-3">
          {isDanger && (
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
            <p className="text-xs text-zinc-500 mt-1">{message}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-1.5 rounded-lg text-white cursor-pointer ${
              isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
