"use client";
import { useEffect, useState, type ReactNode } from "react";

/** Help appears at the control being used, without an extra onboarding screen. */
export default function InlineTip({ id, children }: { id: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { try { setVisible(localStorage.getItem(`sunspot.tip.${id}`) !== "seen"); } catch { setVisible(true); } }, [id]);
  if (!visible) return null;
  return <div className="inline-tip"><p>{children}</p><button onClick={() => { setVisible(false); try { localStorage.setItem(`sunspot.tip.${id}`, "seen"); } catch { /* Dismiss for this session. */ } }}>Got it</button></div>;
}
