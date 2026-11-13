"use client";

import { useRef } from "react";
import useDialog from "./useDialog";

export default function Modal({ children, titleId, onClose, className = "max-w-md" }) {
  const ref = useRef(null);
  useDialog(ref);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} className={`m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm ${className}`}>
      {children}
    </dialog>
  );
}
