import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import "./opening.css";
import OpeningCharacter from "./OpeningCharacter.tsx";

type Phase =
  | "walking"
  | "settling"
  | "turning"
  | "facing"
  | "bloom"
  | "revealing"
  | "done";
const timeline: [number, Phase][] = [
  [3200, "settling"],
  [3550, "turning"],
  [4170, "facing"],
  [4500, "bloom"],
  [5450, "revealing"],
  [6100, "done"],
];

/** A fresh-document greeting. It never remounts the app or starts media. */
export default function Opening({
  children,
  onReveal,
}: {
  children: ReactNode;
  onReveal?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "done"
      : "walking",
  );
  const site = useRef<HTMLDivElement>(null);
  const finished = useRef(phase === "done");
  const complete = phase === "done";
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setPhase("done");
  }, []);

  useEffect(() => {
    if (finished.current) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => {
      if (media.matches) finish();
    };
    media.addEventListener("change", changed);
    const timers = timeline.map(([ms, next]) =>
      window.setTimeout(() => {
        if (!finished.current) {
          if (next === "done") finish();
          else setPhase(next);
        }
      }, ms),
    );
    // Escape is an unobtrusive alternative to the keyboard-focusable skip button.
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", escape);
    return () => {
      timers.forEach(clearTimeout);
      media.removeEventListener("change", changed);
      window.removeEventListener("keydown", escape);
    };
  }, [finish, complete]);

  useEffect(() => {
    if (phase === "done")
      site.current
        ?.querySelector<HTMLElement>("main")
        ?.focus({ preventScroll: true });
  }, [phase]);

  const announced = useRef(false);
  useEffect(() => {
    if (phase === "done" && !announced.current) {
      announced.current = true;
      onReveal?.();
    }
  }, [phase, onReveal]);

  const visible = phase === "revealing" || phase === "done";
  return (
    <>
      <div
        ref={site}
        className={`site-entrance ${visible ? "site-entrance-visible" : ""}`}
        inert={phase !== "done"}
        aria-hidden={phase !== "done" ? true : undefined}
      >
        {children}
      </div>
      {phase !== "done" && (
        <div
          className={`opening opening-${phase}`}
          data-testid="opening"
          data-phase={phase}
          role="region"
          aria-label="Glint welcome animation"
        >
          <div className="opening-light" aria-hidden="true" />
          <button className="opening-position opening-character-button" aria-label="Continue to Glint" onClick={finish}>
            <OpeningCharacter />
          </button>
          <button className="opening-skip" onClick={finish}>
            Skip intro
          </button>
        </div>
      )}
    </>
  );
}
