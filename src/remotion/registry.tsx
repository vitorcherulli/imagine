import React from "react";
import { BoldIntro } from "./BoldIntro";
import { PromoSocial } from "./PromoSocial";
import type { MotionProps } from "../lib/motion/types";

// Map templateId -> React component (recebe MotionProps direto). Usado pelo Player e pelo render.
export const MOTION_COMPONENTS: Record<string, React.FC<MotionProps>> = {
  "bold-intro": BoldIntro,
  "promo-social": PromoSocial,
};

export function getMotionComponent(templateId: string): React.FC<MotionProps> {
  return MOTION_COMPONENTS[templateId] ?? BoldIntro;
}

export function durationInFramesFor(props: MotionProps, fps: number): number {
  return Math.max(1, Math.round(props.duration * fps));
}
