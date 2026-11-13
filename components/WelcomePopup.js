"use client";

import { useEffect, useRef } from "react";
import { useFeedback } from "./providers/AppProvider";

export default function WelcomePopup() {
  const shown = useRef(false);
  const { showNotice } = useFeedback();
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    try {
      if (sessionStorage.getItem("pincraft.welcome.v1")) return;
      sessionStorage.setItem("pincraft.welcome.v1", "1");
    } catch { /* A blocked store should not break the welcome message. */ }
    showNotice({ title: "Welcome to PinCraft - Your Automation Machine is Ready!", description: "Explore the tools. Google Login and live posting still need account setup.", badge: "UI preview", scope: "/", duration: 7000 });
  }, [showNotice]);
  return null;
}
