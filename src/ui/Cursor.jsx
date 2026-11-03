import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";
import { isCoarsePointer } from "../utils/device";

const LABELS = {
  book: "Take the book",
  open: "Open",
  next: "Next",
  prev: "Back",
  close: "Close",
  grab: "Drag to turn"
};

// The dot sits exactly on the pointer (no lag, so aiming never feels
// floaty); only the ring trails it slightly. Positions are written straight to
// the DOM; React only hears about mode changes.
export function Cursor() {
  const dot = useRef();
  const ring = useRef();
  const mode = useStore((s) => s.cursor);
  const fine = !isCoarsePointer();

  useEffect(() => {
    if (!fine) return undefined;
    const root = document.documentElement;
    root.classList.add("custom-cursor");
    let x = -100;
    let y = -100;
    let rx = x;
    let ry = y;
    let frame = 0;
    let overUi = false;
    const onMove = (e) => {
      x = e.clientX;
      y = e.clientY;
      if (dot.current) dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const ui = Boolean(e.target.closest?.("button, a, [role='slider'], [role='dialog'], .plain"));
      if (ui !== overUi) {
        overUi = ui;
        ring.current?.classList.toggle("cursor--ui", ui);
      }
    };
    const toggle = (hidden) => () => {
      dot.current?.classList.toggle("cursor--hidden", hidden);
      ring.current?.classList.toggle("cursor--hidden", hidden);
    };
    // Manga impact lines on click. Removed on animationend, with a timeout
    // backstop since background tabs may never fire that event.
    const onDown = (e) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const burst = document.createElement("div");
      burst.className = "cursor-burst";
      burst.setAttribute("aria-hidden", "true");
      burst.style.left = `${e.clientX}px`;
      burst.style.top = `${e.clientY}px`;
      burst.addEventListener("animationend", () => burst.remove());
      setTimeout(() => burst.remove(), 600);
      document.body.appendChild(burst);
    };
    const onLeave = toggle(true);
    const onEnter = toggle(false);
    const tick = () => {
      rx += (x - rx) * 0.3;
      ry += (y - ry) * 0.3;
      if (ring.current) ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerenter", onEnter);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerenter", onEnter);
      root.classList.remove("custom-cursor");
    };
  }, [fine]);

  if (!fine) return null;
  const text = LABELS[mode];
  return (
    <>
      <div ref={ring} className={`cursor cursor--${mode}`} aria-hidden="true">
        <span className="cursor__ring">
          <svg viewBox="0 0 40 40">
            <path className="cursor__enso" d="M30.93 6.98 A17 17 0 1 1 20 3" />
            <path className="cursor__enso cursor__enso--bristle" d="M31.87 10.04 A15.5 15.5 0 1 1 5.43 14.7" />
          </svg>
        </span>
        {(mode === "next" || mode === "prev" || mode === "close") && <span className={`cursor__arrow cursor__arrow--${mode}`} />}
        {text && <span className="cursor__label">{text}</span>}
      </div>
      <div ref={dot} className="cursor cursor-dot" aria-hidden="true">
        <span className="cursor__dot" />
      </div>
    </>
  );
}
