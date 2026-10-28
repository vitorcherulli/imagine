import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { splitEmphasis, type MotionProps } from "../lib/motion/types";
import { Backdrop, hexA } from "./Backdrop";
import { MOTION_FONT } from "./font";

/** Palavras do texto já separadas, com flag de destaque. */
function toWords(text: string): { text: string; emphasis: boolean }[] {
  const words: { text: string; emphasis: boolean }[] = [];
  for (const part of splitEmphasis(text)) {
    part.text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => words.push({ text: w, emphasis: part.emphasis }));
  }
  return words;
}

export const BoldIntro: React.FC<MotionProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const at = (frac: number) => Math.round(durationInFrames * frac);

  const tagP = spring({ frame: frame - at(0.02), fps, config: { damping: 15, stiffness: 140 } });
  const subP = spring({ frame: frame - at(0.3), fps, config: { damping: 15 } });
  const ctaP = spring({ frame: frame - at(0.45), fps, config: { damping: 12, stiffness: 150 } });
  const logoP = spring({ frame: frame - at(0.0), fps, config: { damping: 16 } });

  const words = toWords(p.title);
  const pad = width * 0.09;

  return (
    <AbsoluteFill style={{ fontFamily: MOTION_FONT }}>
      <Backdrop props={p} />

      <AbsoluteFill style={{ padding: `0 ${pad}px`, alignItems: "center", justifyContent: "center" }}>
        {p.logoUrl ? (
          <Img
            src={p.logoUrl}
            style={{
              position: "absolute",
              top: height * 0.07,
              maxWidth: width * 0.42,
              maxHeight: height * 0.12,
              objectFit: "contain",
              opacity: logoP,
              transform: `translateY(${(1 - logoP) * -20}px)`,
            }}
          />
        ) : null}

        {p.tag ? (
          <div
            style={{
              fontSize: width * 0.032,
              fontWeight: 800,
              letterSpacing: width * 0.008,
              color: p.primary,
              border: `2px solid ${p.primary}`,
              borderRadius: 999,
              padding: `${width * 0.018}px ${width * 0.05}px`,
              opacity: tagP,
              transform: `translateY(${(1 - tagP) * -24}px)`,
              marginBottom: width * 0.06,
            }}
          >
            {p.tag}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: `${width * 0.012}px ${width * 0.028}px`,
          }}
        >
          {words.map((w, i) => {
            const wp = spring({
              frame: frame - at(0.06) - i * 2,
              fps,
              config: { damping: 14, stiffness: 130 },
            });
            return (
              <span
                key={i}
                style={{
                  fontSize: width * 0.108,
                  fontWeight: 900,
                  lineHeight: 1.05,
                  color: w.emphasis ? p.accent : "#fff",
                  textShadow: w.emphasis ? `0 0 40px ${hexA(p.accent, 0.5)}` : "none",
                  opacity: wp,
                  transform: `translateY(${(1 - wp) * 44}px)`,
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>

        {p.subtitle ? (
          <div
            style={{
              marginTop: width * 0.08,
              fontSize: width * 0.046,
              fontWeight: 600,
              color: "#D6EFEC",
              lineHeight: 1.4,
              textAlign: "center",
              maxWidth: width * 0.82,
              opacity: subP,
              transform: `translateY(${(1 - subP) * 26}px)`,
            }}
          >
            {p.subtitle.replace(/\*/g, "")}
          </div>
        ) : null}

        {p.cta ? (
          <div
            style={{
              position: "absolute",
              bottom: height * 0.11,
              padding: `${width * 0.04}px ${width * 0.11}px`,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${p.primary}, ${p.accent})`,
              color: p.bg,
              fontSize: width * 0.046,
              fontWeight: 900,
              letterSpacing: 1,
              boxShadow: `0 ${width * 0.03}px ${width * 0.08}px ${hexA(p.primary, 0.5)}`,
              opacity: ctaP,
              transform: `scale(${0.85 + ctaP * 0.15})`,
            }}
          >
            {p.cta.replace(/\*/g, "")}
          </div>
        ) : null}
      </AbsoluteFill>

      <div style={{ position: "absolute", bottom: 0, left: 0, height: 10, width: "100%", background: hexA("#fff", 0.08) }}>
        <div
          style={{
            height: "100%",
            width: `${interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: "clamp" })}%`,
            background: `linear-gradient(90deg, ${p.primary}, ${p.accent})`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
