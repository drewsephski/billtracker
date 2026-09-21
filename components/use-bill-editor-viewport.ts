"use client";

import { useEffect, useRef } from "react";

/** iOS keyboards resize the visual viewport, not the layout viewport. */
export function useBillEditorViewport() {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    const dialog = form?.closest<HTMLElement>('[role="dialog"]');
    if (!form || !dialog) return;
    const viewport = window.visualViewport;
    const scroller = form.querySelector<HTMLElement>("[data-bill-fields]");
    let frame = 0;

    const revealField = () => {
      const field = document.activeElement;
      if (!(field instanceof HTMLElement) || !scroller?.contains(field)) return;
      // Scroll only the form body: scrolling the page can make Safari pan again.
      const bounds = field.getBoundingClientRect();
      const visible = scroller.getBoundingClientRect();
      if (bounds.bottom > visible.bottom - 16) {
        scroller.scrollTop += bounds.bottom - visible.bottom + 16;
      } else if (bounds.top < visible.top + 16) {
        scroller.scrollTop -= visible.top + 16 - bounds.top;
      }
    };
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Leave pinch zoom to the browser's normal accessibility behavior.
        if (viewport && viewport.scale !== 1) return;
        dialog.style.setProperty(
          "--editor-height",
          `${viewport?.height ?? window.innerHeight}px`,
        );
        dialog.style.setProperty(
          "--editor-top",
          `${viewport?.offsetTop ?? 0}px`,
        );
        revealField();
      });
    };

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    form.addEventListener("focusin", update);
    const observer = new ResizeObserver(update);
    if (scroller) observer.observe(scroller);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      form.removeEventListener("focusin", update);
      dialog.style.removeProperty("--editor-height");
      dialog.style.removeProperty("--editor-top");
    };
  }, []);

  return formRef;
}
