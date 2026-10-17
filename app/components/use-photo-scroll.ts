"use client";
import { prefersReducedMotion } from "../../lib/motion";
import { useEffect, useState, type RefObject } from "react";

export function usePhotoScroll(id: string, scroll: RefObject<HTMLDivElement | null>, content: RefObject<HTMLDivElement | null>, hero: RefObject<HTMLDivElement | null>, sheet: RefObject<HTMLDivElement | null>) {
  const [covered, setCovered] = useState(false);
  useEffect(() => {
    const scroller = scroll.current, surface = content.current, photo = hero.current, board = sheet.current;
    if (!scroller || !surface || !photo || !board) return;
    let frame = 0, lastCovered = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    surface.style.setProperty("--photo-progress", "0"); setCovered(false);
    const update = () => {
      frame = 0;
      const progress = prefersReducedMotion() ? 0 : Math.max(0, Math.min(1, scroller.scrollTop / Math.max(180, photo.clientHeight * .85)));
      surface.style.setProperty("--photo-progress", progress.toFixed(3));
      // Hidden gallery controls must not remain reachable behind the glass panel.
      const nextCovered = !prefersReducedMotion() && board.getBoundingClientRect().top <= scroller.getBoundingClientRect().top + 2;
      if (nextCovered !== lastCovered) { lastCovered = nextCovered; setCovered(nextCovered); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule); observer.observe(photo);
    scroller.addEventListener("scroll", schedule, { passive: true }); motion.addEventListener("change", schedule); window.addEventListener("sunspot-motion-change", schedule); schedule();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener("scroll", schedule); motion.removeEventListener("change", schedule); window.removeEventListener("sunspot-motion-change", schedule); };
  }, [id, scroll, content, hero, sheet]);
  return covered;
}
