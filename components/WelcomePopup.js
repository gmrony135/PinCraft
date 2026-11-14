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
    showNotice({ title: "Welcome to PinCraft — your creative workspace", description: "Explore offline templates, or sign in for live AI and a private Cloud Library. Publishing always needs separate account consent.", badge: "Start here", scope: "/", duration: 7000 });
  }, [showNotice]);
  return null;
}
