"use client";

import { GAME_CONFIG, type SessionDurationId } from "@/game/config";
import { useEffect, useRef } from "react";

interface DurationPickerProps {
  value: SessionDurationId;
  onChange: (id: SessionDurationId) => void;
}

/** Grid of chips on desktop, iOS-style scroll wheel on mobile. */
export function DurationPicker({ value, onChange }: DurationPickerProps) {
  const durations = GAME_CONFIG.SESSION_DURATIONS;

  return (
    <>
      <div className="duration-grid hidden sm:grid">
        {durations.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onChange(d.id)}
            className={`duration-chip ${value === d.id ? "is-on" : ""}`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="sm:hidden">
        <Wheel value={value} onChange={onChange} />
      </div>
    </>
  );
}

function Wheel({ value, onChange }: DurationPickerProps) {
  const durations = GAME_CONFIG.SESSION_DURATIONS;
  const listRef = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(
    0,
    durations.findIndex((d) => d.id === value)
  );

  const centerTo = (i: number, behavior: ScrollBehavior) => {
    const list = listRef.current;
    const child = list?.children[i] as HTMLElement | undefined;
    if (!list || !child) return;
    const target =
      child.offsetTop - list.clientHeight / 2 + child.clientHeight / 2;
    list.scrollTo({ top: target, behavior });
  };

  // Center the current value on mount / external change.
  useEffect(() => {
    centerTo(idx, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const onScroll = () => {
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const mid = list.scrollTop + list.clientHeight / 2;
      let best = 0;
      let bestDist = Infinity;
      Array.from(list.children).forEach((c, i) => {
        const el = c as HTMLElement;
        const cCenter = el.offsetTop + el.clientHeight / 2;
        const dist = Math.abs(cCenter - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      if (durations[best].id !== value) onChange(durations[best].id);
      centerTo(best, "smooth");
    }, 120);
  };

  return (
    <div className="wheel" role="listbox" aria-label="Session length">
      <div className="wheel-band" aria-hidden />
      <div className="wheel-fade wheel-fade-top" aria-hidden />
      <div className="wheel-fade wheel-fade-bottom" aria-hidden />
      <div className="wheel-list" ref={listRef} onScroll={onScroll}>
        {durations.map((d) => (
          <button
            key={d.id}
            type="button"
            role="option"
            aria-selected={d.id === value}
            className={`wheel-item ${d.id === value ? "is-selected" : ""}`}
            onClick={() => onChange(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}
