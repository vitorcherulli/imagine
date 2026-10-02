"use client";

import * as React from "react";
import { renderSlide } from "@/lib/social-art/render";
import type { SocialArtBrand, SocialArtPost } from "@/lib/social-art/types";

interface Props {
  brand: SocialArtBrand;
  post: SocialArtPost;
  index: number;
  className?: string;
  onPhotoError?: () => void;
}

export function SocialArtCanvas({ brand, post, index, className, onPhotoError }: Props) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const token = React.useRef(0);
  const slide = post.slides[index];
  const errorRef = React.useRef(onPhotoError);
  errorRef.current = onPhotoError;

  const { format, showHandle, showLogo, decor, showCounter } = post;
  const total = post.slides.length;

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !slide) return;
    const mine = ++token.current;
    const frame = requestAnimationFrame(() => {
      void renderSlide(canvas, { brand, post, slide, index }, () => mine === token.current).then((ok) => {
        if (!ok && mine === token.current) errorRef.current?.();
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `post` identity changes on caption edits; only visible fields matter
  }, [brand, slide, index, format, showHandle, showLogo, decor, showCounter, total]);

  return (
    <canvas
      ref={ref}
      width={1080}
      height={1350}
      className={className}
      aria-label={`Slide ${index + 1}`}
    />
  );
}
