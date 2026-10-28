import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { splitEmphasis, type MotionProps } from "../lib/motion/types";
import { Backdrop, hexA } from "./Backdrop";
import { MOTION_FONT } from "./font";

export const PromoSocial: React.FC<MotionProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const at = (frac: number) => Math.round(durationInFrames * frac);

  const bandP = spring({ frame: frame - at(0.02), fps, config: { damping: 18, stiffness: 90 } });
  const logoP = spring({ frame: frame - at(0.05), fps, config: { damping: 13, stiffness: 140 } });
  const titleP = spring({ frame: frame - at(0.16), fps, config: { damping: 14, stiffness: 120 } });
  const subP = spring({ frame: frame - at(0.36), fps, config: { damping: 15 } });
  const ctaP = spring({ frame: frame - at(0.52), fps, config: { damping: 11, stiffness: 150 } });

  const emphasis = splitEmphasis(p.title);
  const pad = width * 0.09;

  return (
    <AbsoluteFill style={{ fontFamily: MOTION_FONT }}>
      <Backdrop props={p} />

      {/* faixas diagonais animadas */}
      {[0, 1].map((i) => {
        const rot = -18 + i * 36;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              top: height * (0.32 + i * 0.16),
              left: -width * 0.3,
              width: width * 1.6,
              height: width * 0.12,
              background: hexA(i === 0 ? p.primary : p.accent, 0.16),
              transform: `rotate(${rot}deg) translateX(${(1 - bandP) * width * 0.6}px)`,
              opacity: bandP * 0.9,
            }}
          />
        );
      })}

      <AbsoluteFill style={{ padding: `0 ${pad}px`, alignItems: "center", justifyContent: "center" }}>
        {p.logoUrl ? (
          <Img
            src={p.logoUrl}
            style={{
              maxWidth: width * 0.5,
              maxHeight: height * 0.16,
              objectFit: "contain",
              marginBottom: width * 0.08,
              opacity: logoP,
              transform: `scale(${0.8 + logoP * 0.2})`,
            }}
          />
        ) : null}

        {p.tag ? (
          <div
            style={{
              fontSize: width * 0.034,
              fontWeight: 900,
              letterSpacing: width * 0.01,
              color: p.bg,
              background: p.accent,
              borderRadius: 999,
              padding: `${width * 0.018}px ${width * 0.05}px`,
              marginBottom: width * 0.05,
              opacity: titleP,
            }}
          >
            {p.tag}
          </div>
        ) : null}

        <div style={{ textAlign: "center", opacity: titleP, transform: `translateY(${(1 - titleP) * 30}px)` }}>
          {emphasis.map((part, i) => (
            <div
              key={i}
              style={{
                fontSize: width * 0.12,
                fontWeight: 900,
                lineHeight: 1.02,
                color: part.emphasis ? p.accent : "#fff",
                textShadow: part.emphasis ? `0 0 44px ${hexA(p.accent, 0.55)}` : "none",
              }}
            >
              {part.text.replace(/\*/g, "")}
            </div>
          ))}
        </div>

        {p.subtitle ? (
          <div
            style={{
              marginTop: width * 0.07,
              fontSize: width * 0.048,
              fontWeight: 600,
              color: "#E4F4F1",
              lineHeight: 1.4,
              textAlign: "center",
              maxWidth: width * 0.8,
              opacity: subP,
              transform: `translateY(${(1 - subP) * 22}px)`,
            }}
          >
            {p.subtitle.replace(/\*/g, "")}
          </div>
        ) : null}

        {p.cta ? (
          <div
            style={{
              marginTop: width * 0.1,
              padding: `${width * 0.042}px ${width * 0.1}px`,
              borderRadius: 18,
              background: `linear-gradient(135deg, ${p.accent}, ${p.primary})`,
              color: p.bg,
              fontSize: width * 0.05,
              fontWeight: 900,
              boxShadow: `0 ${width * 0.03}px ${width * 0.08}px ${hexA(p.accent, 0.45)}`,
              opacity: ctaP,
              transform: `scale(${0.8 + ctaP * 0.2})`,
            }}
          >
            {p.cta.replace(/\*/g, "")}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
