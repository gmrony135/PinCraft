"use client";

import { useEffect } from "react";

/** Native modal + explicit tab wrapping (also prevents focus reaching browser chrome). */
export default function useDialog(ref) {
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    const previous = document.body.style.overflow;
    function trapTab(event) {
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((node) => node.getClientRects().length && !node.closest("[hidden]"));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    }
    dialog.addEventListener("keydown", trapTab);
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.removeEventListener("keydown", trapTab);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}
