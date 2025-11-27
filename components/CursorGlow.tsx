import { useEffect, useRef, useState } from "react";

interface CursorGlowProps {
  children: React.ReactNode;
}

export function CursorGlow({ children }: CursorGlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
      });
    };

    el.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <div ref={ref} className="relative overflow-visible">
      <div
        className="pointer-events-none absolute -inset-24 opacity-60 blur-3xl"
        style={{
          background: `radial-gradient(600px circle at ${pos.x}px ${pos.y}px,
            rgba(255,178,23,0.22),
            rgba(33,217,211,0.10) 35%,
            rgba(0,0,0,0) 60%)`,
        }}
      />
      {children}
    </div>
  );
}

export default CursorGlow;

