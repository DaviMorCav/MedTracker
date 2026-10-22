import React, { useEffect } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning';
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'warning',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="fixed inset-0"
        onClick={onCancel}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl z-10 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span>{variant === 'danger' ? '⚠️' : 'ℹ️'}</span>
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-50 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-3.5 py-2 text-xs font-semibold text-white rounded-lg transition-colors shadow-sm ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/50'
                : 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/50'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
