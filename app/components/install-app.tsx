"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
// Keep the one-shot browser event across the onboarding → Discover transition.
let availablePrompt: InstallPrompt | null = null;
export default function InstallApp({ compact = false }: { compact?: boolean }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(availablePrompt);
  const [installed, setInstalled] = useState(true);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const check = () => setInstalled(standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    check(); setIos(/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const capture = (event: Event) => { event.preventDefault(); availablePrompt = event as InstallPrompt; setPrompt(availablePrompt); };
    const didInstall = () => { availablePrompt = null; setInstalled(true); setPrompt(null); setHelp(false); };
    window.addEventListener("beforeinstallprompt", capture); window.addEventListener("appinstalled", didInstall); standalone.addEventListener("change", check);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => setStatus("Install support couldn’t load. Try refreshing when you’re online."));
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", didInstall); standalone.removeEventListener("change", check); };
  }, []);
  if (compact || installed) return null;
  return <aside className="install-card"><Download size={19} /><div><strong>Take Sunspot with you</strong><p>One tap from your home screen.</p></div><button className="text-button" onClick={async () => {
    if (!prompt) { setHelp(v => !v); return; }
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === "accepted") setInstalled(true); }
    catch { setHelp(true); } finally { availablePrompt = null; setPrompt(null); }
  }}>Install app</button>{help && <div className="install-help"><button aria-label="Close installation instructions" onClick={() => setHelp(false)}><X size={16} /></button><strong>Add Sunspot to your home screen</strong><p>{ios ? "In Safari, tap Share, then Add to Home Screen, and confirm Add. If shown, keep Open as Web App enabled." : "Open your browser’s menu and look for Install Sunspot, Install app, or Add to Home Screen. If unavailable, try Chrome or Edge."}</p></div>}{status && <p role="status">{status}</p>}</aside>;
}
