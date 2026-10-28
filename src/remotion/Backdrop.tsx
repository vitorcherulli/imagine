import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { MotionProps } from "../lib/motion/types";

/** Fundo animado comum: gradiente respirando + anéis + brilhos. */
export const Backdrop: React.FC<{ props: MotionProps }> = ({ props }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const respiro = Math.sin(frame / 18) * 0.5 + 0.5;
  const zoom = 1 + respiro * 0.012;
  const drift = interpolate(frame, [0, durationInFrames], [0, 40]);
  const cx = width / 2;
  const cy = height / 2;

  return (
    <AbsoluteFill style={{ background: props.bg, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% ${18 + drift / 5}%, ${hexA(props.primary, 0.16)} 0%, transparent 55%), radial-gradient(circle at 82% 8%, ${hexA(props.accent, 0.18)} 0%, transparent 42%), radial-gradient(circle at 12% 92%, ${hexA(props.primary, 0.14)} 0%, transparent 42%)`,
          transform: `scale(${zoom})`,
        }}
      />
      {[0, 55, 110].map((d, i) => {
        const t = (frame + d) % 165;
        const esc = interpolate(t, [0, 165], [0.7, 1.25]);
        const op = interpolate(t, [0, 165], [0.28, 0.03]);
        const size = Math.min(width, height) * (0.5 + i * 0.28);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx,
              top: cy,
              width: size,
              height: size,
              marginLeft: -size / 2,
              marginTop: -size / 2,
              borderRadius: "50%",
              border: `2px solid ${props.primary}`,
              opacity: op,
              transform: `scale(${esc})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Converte #hex em rgba com alpha. */
export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
