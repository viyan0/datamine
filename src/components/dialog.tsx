'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    t = useTranslations();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" onCancel={close} aria-labelledby="dialog-title">
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button className="icon-button" onClick={close} aria-label={t('close')}>
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
