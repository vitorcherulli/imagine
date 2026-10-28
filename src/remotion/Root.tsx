import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { getMotionComponent } from "./registry";
import { MOTION_TEMPLATES, defaultPropsFor, getMotionTemplate } from "../lib/motion/templates";
import type { MotionProps } from "../lib/motion/types";

/** O que o render recebe: props + qual template usar. */
export type MotionRenderInput = MotionProps & { templateId: string };

type LooseComponent = React.ComponentType<Record<string, unknown>>;

const MotionHost: React.FC<MotionRenderInput> = (props) => {
  const Comp = getMotionComponent(props.templateId);
  return <Comp {...props} />;
};

const calculateMetadata: CalculateMetadataFunction<MotionRenderInput> = ({ props }) => {
  const t = getMotionTemplate(props.templateId);
  return {
    durationInFrames: Math.max(1, Math.round(props.duration * t.fps)),
    fps: t.fps,
    width: t.width,
    height: t.height,
  };
};

export const RemotionRoot: React.FC = () => (
  <>
    {MOTION_TEMPLATES.map((t) => (
      <Composition
        key={t.id}
        id={t.id}
        component={MotionHost as unknown as LooseComponent}
        durationInFrames={Math.round(t.defaultProps.duration * t.fps)}
        fps={t.fps}
        width={t.width}
        height={t.height}
        defaultProps={{ ...defaultPropsFor(t.id), templateId: t.id }}
        calculateMetadata={
          calculateMetadata as unknown as CalculateMetadataFunction<Record<string, unknown>>
        }
      />
    ))}
  </>
);
