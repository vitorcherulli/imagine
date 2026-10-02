import { luminance, mix, rgba } from "@/lib/social-art/color";
import { ensureSocialArtFont } from "@/lib/social-art/fonts";
import {
  SOCIAL_ART_FORMATS,
  type SocialArtBrand,
  type SocialArtPost,
  type SocialArtSlide,
} from "@/lib/social-art/types";

interface Block {
  size: number;
  lines: string[];
  weight: number;
  family: string;
}

interface FitOptions {
  weight: number;
  max: number;
  min: number;
  lines: number;
  width: number;
  family: string;
  upper?: boolean;
}

interface Palette {
  dark: string;
  deep: string;
  light: string;
  onDarkText: string;
  accent: string;
  accentDeep: string;
  accentOnDark: [string, string, string];
  accentOnLight: [string, string, string];
  decor: string;
}

export interface RenderInput {
  brand: SocialArtBrand;
  post: SocialArtPost;
  slide: SocialArtSlide;
  index: number;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  let p = imageCache.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      if (!url.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => {
        imageCache.delete(url);
        resolve(null);
      };
      img.src = url;
    });
    imageCache.set(url, p);
  }
  return p;
}

function palette(brand: SocialArtBrand): Palette {
  const { dark, accent, light } = brand.colors;
  const shine = brand.accentShine;
  return {
    dark,
    deep: mix(dark, "#000000", 0.35),
    light,
    onDarkText: mix(light, "#ffffff", 0.5),
    accent,
    accentDeep: mix(accent, "#000000", 0.15),
    accentOnDark: shine
      ? [mix(accent, "#000000", 0.05), mix(accent, "#ffffff", 0.55), accent]
      : [accent, accent, accent],
    accentOnLight: shine
      ? [mix(accent, "#000000", 0.2), mix(accent, "#ffffff", 0.3), mix(accent, "#000000", 0.12)]
      : [mix(accent, "#000000", 0.12), mix(accent, "#000000", 0.12), mix(accent, "#000000", 0.12)],
    decor: brand.decorColor,
  };
}

/** Draws one slide. Resolves false when the slide has a photo that failed to load. */
export async function renderSlide(
  canvas: HTMLCanvasElement,
  input: RenderInput,
  isCurrent: () => boolean = () => true,
): Promise<boolean> {
  const { brand, post, slide, index } = input;
  const size = SOCIAL_ART_FORMATS[post.format];
  const photoUrl = slide.layout !== "text" ? slide.photo : "";

  const [, , logo, photo] = await Promise.all([
    ensureSocialArtFont(brand.fontHeading),
    ensureSocialArtFont(brand.fontBody),
    post.showLogo ? loadImage(brand.logoUrl) : Promise.resolve(null),
    loadImage(photoUrl),
  ]);
  if (!isCurrent()) return true;

  if (canvas.width !== size.w || canvas.height !== size.h) {
    canvas.width = size.w;
    canvas.height = size.h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size.w, size.h);

  const painter = new Painter(ctx, size.w, size.h, brand, post, slide, palette(brand));
  if (slide.layout === "text") {
    painter.textLayout(logo);
  } else if (slide.layout === "number") {
    painter.numberLayout(photo, logo);
  } else {
    painter.photoLayout(photo, logo);
  }
  if (post.showCounter && post.slides.length > 1) {
    painter.counter(index, post.slides.length);
  }
  return !(photoUrl && !photo);
}

class Painter {
  constructor(
    private ctx: CanvasRenderingContext2D,
    private w: number,
    private h: number,
    private brand: SocialArtBrand,
    private post: SocialArtPost,
    private slide: SocialArtSlide,
    private pal: Palette,
  ) {}

  private font(weight: number, size: number, family: string) {
    return `${weight} ${size}px "${family}", "Segoe UI", sans-serif`;
  }

  private setSpacing(px: number) {
    if ("letterSpacing" in this.ctx) {
      (this.ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
    }
  }

  private wrap(text: string, maxWidth: number): string[] {
    const lines: string[] = [];
    String(text)
      .split("\n")
      .forEach((paragraph) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let line = "";
        words.forEach((word) => {
          const test = line ? `${line} ${word}` : word;
          if (line && this.ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        });
        if (line) lines.push(line);
      });
    return lines;
  }

  private fit(text: string, opts: FitOptions): Block {
    const value = opts.upper ? String(text).toLocaleUpperCase("pt-BR") : String(text);
    let size = opts.max;
    while (size >= opts.min) {
      this.ctx.font = this.font(opts.weight, size, opts.family);
      const lines = this.wrap(value, opts.width);
      const widest = lines.reduce((m, l) => Math.max(m, this.ctx.measureText(l).width), 0);
      if (lines.length <= opts.lines && widest <= opts.width) break;
      size -= 2;
    }
    size = Math.max(size, opts.min);
    this.ctx.font = this.font(opts.weight, size, opts.family);
    return { size, lines: this.wrap(value, opts.width), weight: opts.weight, family: opts.family };
  }

  private heading(text: string, opts: Omit<FitOptions, "family" | "upper">): Block {
    return this.fit(text, {
      ...opts,
      max: Math.round(opts.max * this.brand.titleScale),
      family: this.brand.fontHeading,
      upper: this.brand.uppercaseTitles,
    });
  }

  private bodyText(text: string, opts: Omit<FitOptions, "family">): Block {
    return this.fit(text, { ...opts, family: this.brand.fontBody });
  }

  private blockHeight(block: Block, lineHeight: number) {
    return block.lines.length
      ? block.size * 0.8 + (block.lines.length - 1) * block.size * lineHeight + block.size * 0.25
      : 0;
  }

  private drawBlock(
    block: Block,
    x: number,
    y: number,
    lineHeight: number,
    align: CanvasTextAlign,
    fill: string | CanvasGradient,
  ) {
    const { ctx } = this;
    ctx.font = this.font(block.weight, block.size, block.family);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = fill;
    block.lines.forEach((line, i) => {
      ctx.fillText(line, x, y + block.size * 0.8 + i * block.size * lineHeight);
    });
    return this.blockHeight(block, lineHeight);
  }

  /** Headline in the brand's title treatment; `onDark` picks colors that read over dark areas. */
  private drawTitle(
    block: Block,
    x: number,
    y: number,
    lineHeight: number,
    align: CanvasTextAlign,
    onDark: boolean,
    x0: number,
    x1: number,
  ) {
    const { ctx, pal } = this;
    const treatment = this.brand.titleTreatment;
    if (treatment === "gradient") {
      return this.drawBlock(block, x, y, lineHeight, align, this.accent(x0, x1, onDark ? pal.accentOnDark : pal.accentOnLight));
    }
    const baseline = (i: number) => y + block.size * 0.8 + i * block.size * lineHeight;
    const solid = onDark ? pal.accent : pal.accentDeep;
    ctx.save();
    ctx.font = this.font(block.weight, block.size, block.family);
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    if (treatment === "outline") {
      ctx.shadowColor = "transparent";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, block.size * 0.045);
      ctx.strokeStyle = solid;
      block.lines.forEach((line, i) => ctx.strokeText(line, x, baseline(i)));
    } else if (treatment === "highlight") {
      ctx.shadowColor = "transparent";
      const padX = block.size * 0.16;
      ctx.fillStyle = pal.accent;
      block.lines.forEach((line, i) => {
        const tw = ctx.measureText(line).width;
        const left = align === "center" ? x - tw / 2 : align === "right" ? x - tw : x;
        ctx.fillRect(left - padX, baseline(i) - block.size * 0.82, tw + padX * 2, block.size);
      });
      ctx.fillStyle = luminance(pal.accent) > 0.45 ? pal.dark : "#ffffff";
      block.lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)));
    } else if (treatment === "shadow") {
      const off = Math.max(3, block.size * 0.06);
      ctx.shadowColor = "transparent";
      ctx.fillStyle = pal.accent;
      block.lines.forEach((line, i) => ctx.fillText(line, x + off, baseline(i) + off));
      ctx.fillStyle = onDark ? "#ffffff" : pal.dark;
      block.lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)));
    } else {
      ctx.fillStyle = solid;
      block.lines.forEach((line, i) => ctx.fillText(line, x, baseline(i)));
    }
    ctx.restore();
    return this.blockHeight(block, lineHeight);
  }

  private accent(x0: number, x1: number, stops: [string, string, string]) {
    const g = this.ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.48, stops[1]);
    g.addColorStop(1, stops[2]);
    return g;
  }

  private vertical(y0: number, y1: number, stops: [number, string][]) {
    const g = this.ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    return g;
  }

  private safe() {
    const story = this.post.format === "story";
    return { top: story ? 210 : 70, bottom: story ? 300 : 70 };
  }

  private cover(img: HTMLImageElement) {
    const { w, h, slide } = this;
    const zoom = slide.zoom / 100;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (w - dw) * (slide.focusX / 100);
    const dy = (h - dh) * (slide.focusY / 100);
    this.ctx.drawImage(img, dx, dy, dw, dh);
  }

  private background(photo: HTMLImageElement | null) {
    if (photo) {
      this.cover(photo);
    } else {
      this.ctx.fillStyle = this.vertical(0, this.h, [
        [0, this.pal.light],
        [1, mix(this.pal.light, this.pal.dark, 0.25)],
      ]);
      this.ctx.fillRect(0, 0, this.w, this.h);
    }
  }

  private decor() {
    const { ctx, w, h } = this;
    const spots = [
      { x: 0.07, y: 0.13, r: 0.07, rot: 0.6, a: 0.8 },
      { x: 0.9, y: 0.06, r: 0.05, rot: -0.5, a: 0.65 },
      { x: 0.02, y: 0.4, r: 0.055, rot: 1.2, a: 0.7 },
      { x: 0.97, y: 0.52, r: 0.045, rot: 0.3, a: 0.55 },
      { x: 0.22, y: 0.03, r: 0.035, rot: -0.9, a: 0.5 },
      { x: 0.78, y: 0.2, r: 0.03, rot: 0.9, a: 0.4 },
    ];
    const inner = mix(this.pal.decor, "#ffffff", 0.1);
    const outer = mix(this.pal.decor, "#000000", 0.18);
    spots.forEach((s) => {
      const r = s.r * w;
      ctx.save();
      ctx.translate(s.x * w, s.y * h);
      ctx.rotate(s.rot);
      ctx.scale(1, 0.58);
      if ("filter" in ctx) ctx.filter = `blur(${Math.round(r * 0.12)}px)`;
      const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
      g.addColorStop(0, rgba(inner, s.a));
      g.addColorStop(0.65, rgba(outer, s.a * 0.75));
      g.addColorStop(1, rgba(outer, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  private handle(color: string) {
    if (!this.post.showHandle || !this.brand.handle) return;
    const { ctx } = this;
    ctx.save();
    ctx.font = this.font(600, 28, this.brand.fontBody);
    this.setSpacing(1);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.shadowColor = "rgba(0, 0, 0, 0.18)";
    ctx.shadowBlur = 8;
    ctx.fillText(this.brand.handle, this.w / 2, this.safe().top + 20);
    this.setSpacing(0);
    ctx.restore();
  }

  /** Draws the footer logo and returns its top y (0 without a logo). */
  private logo(logo: HTMLImageElement | null) {
    if (!logo) return 0;
    const lh = 100;
    const lw = Math.min(logo.naturalWidth * (lh / logo.naturalHeight), this.w * 0.5);
    const drawH = logo.naturalHeight * (lw / logo.naturalWidth);
    const y = this.h - this.safe().bottom - drawH;
    this.ctx.drawImage(logo, (this.w - lw) / 2, y, lw, drawH);
    return y;
  }

  counter(index: number, total: number) {
    const { ctx, w } = this;
    const label = `${index + 1}/${total}`;
    ctx.save();
    ctx.font = this.font(700, 26, this.brand.fontBody);
    const tw = ctx.measureText(label).width;
    const padX = 18;
    const boxW = tw + padX * 2;
    const boxH = 46;
    const x = w - 60 - boxW;
    const y = this.safe().top - 6;
    ctx.fillStyle = rgba(this.pal.deep, 0.55);
    ctx.beginPath();
    ctx.roundRect(x, y, boxW, boxH, boxH / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + boxW / 2, y + boxH / 2 + 1);
    ctx.restore();
  }

  photoLayout(photo: HTMLImageElement | null, logo: HTMLImageElement | null) {
    const { ctx, w, h, slide, pal } = this;
    const bottom = slide.position === "bottom";
    const dark = (slide.overlay ?? (bottom ? "dark" : "light")) === "dark";
    const left = slide.align === "left";
    this.background(photo);

    const wash = (y0: number, y1: number, color: string, alphas: [number, number, number], fromTop: boolean) => {
      const stops: [number, string][] = [
        [0, rgba(color, alphas[0])],
        [0.5, rgba(color, alphas[1])],
        [1, rgba(color, alphas[2])],
      ];
      ctx.fillStyle = this.vertical(y0, y1, fromTop ? stops : stops.map(([at, c]) => [1 - at, c] as [number, string]).reverse());
      ctx.fillRect(0, y0, w, y1 - y0);
    };
    const textWash = dark ? pal.deep : pal.light;
    const k = left ? 0.45 : 1;
    const textAlphas = (a: [number, number, number]) => a.map((x) => x * k) as [number, number, number];
    if (bottom) {
      wash(0, h * 0.3, dark ? pal.light : pal.deep, dark ? [0.55, 0.25, 0] : [0.5, 0.2, 0], true);
      wash(h * 0.38, h, textWash, textAlphas(dark ? [0.86, 0.62, 0] : [0.94, 0.72, 0]), false);
    } else {
      wash(0, h * 0.62, textWash, textAlphas(dark ? [0.88, 0.6, 0] : [0.94, 0.72, 0]), true);
      wash(h * 0.72, h, pal.deep, [0.5, 0.2, 0], false);
    }
    if (left) {
      const side = ctx.createLinearGradient(0, 0, w * 0.75, 0);
      side.addColorStop(0, rgba(textWash, 0.82));
      side.addColorStop(0.55, rgba(textWash, 0.45));
      side.addColorStop(1, rgba(textWash, 0));
      ctx.fillStyle = side;
      ctx.fillRect(0, 0, w * 0.75, h);
    }

    if (this.post.decor) this.decor();
    this.handle(photo ? "rgba(255, 255, 255, 0.92)" : rgba(pal.dark, 0.75));
    const logoTop = this.logo(logo);

    const width = left ? Math.round(w * 0.62) : w - 160;
    const large = slide.supportSize === "large";
    const textColor = large ? (dark ? pal.accent : pal.accentDeep) : dark ? pal.onDarkText : pal.dark;
    const title = this.heading(slide.title, { weight: 800, max: 150, min: 56, lines: left ? 4 : 3, width: width + 20 });
    const supportMax = Math.min(92, Math.round((title.lines.length ? title.size : 120) * 0.78));
    const lead = large
      ? this.bodyText(slide.lead, { weight: 500, max: supportMax, min: 40, lines: 3, width })
      : this.bodyText(slide.lead, { weight: 700, max: 48, min: 30, lines: left ? 3 : 2, width });
    const body = large
      ? this.bodyText(slide.body, { weight: 500, max: supportMax, min: 36, lines: 3, width })
      : this.bodyText(slide.body, { weight: 500, max: 38, min: 26, lines: 4, width });
    const gap = slide.lead && slide.title ? (large ? 12 : 22) : 0;
    const gapBody = slide.body && (slide.title || slide.lead) ? (large ? 12 : 30) : 0;
    const total =
      this.blockHeight(lead, 1.2) + gap + this.blockHeight(title, 1.0) + gapBody + this.blockHeight(body, 1.35);

    let y = bottom
      ? (logoTop || h - this.safe().bottom) - 70 - total
      : this.safe().top + (this.post.format === "story" ? 180 : 130);

    const x = left ? 80 : w / 2;
    const align: CanvasTextAlign = left ? "left" : "center";
    const [x0, x1] = left ? [x, x + width] : [x - width / 2, x + width / 2];
    y += this.drawBlock(lead, x, y, 1.2, align, textColor) + gap;
    ctx.save();
    if (!dark) {
      ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
      ctx.shadowBlur = 18;
    }
    y += this.drawTitle(title, x, y, 1.0, align, dark, x0, x1);
    ctx.restore();
    this.drawBlock(body, x, y + gapBody, 1.35, align, textColor);
  }

  textLayout(logo: HTMLImageElement | null) {
    const { ctx, w, h, slide, pal } = this;
    ctx.fillStyle = this.vertical(0, h, [
      [0, mix(pal.dark, "#ffffff", 0.08)],
      [0.55, pal.dark],
      [1, pal.deep],
    ]);
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.9);
    glow.addColorStop(0, "rgba(255, 255, 255, 0.12)");
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    if (this.post.decor) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      this.decor();
      ctx.restore();
    }
    this.handle("rgba(255, 255, 255, 0.85)");
    const logoTop = this.logo(logo) || h - this.safe().bottom;

    const x = 100;
    const width = w - 200;
    const lead = this.bodyText(slide.lead, { weight: 600, max: 40, min: 28, lines: 2, width });
    const title = this.heading(slide.title, { weight: 800, max: 92, min: 50, lines: 5, width });
    const body = this.bodyText(slide.body, {
      weight: 500,
      max: 38,
      min: 26,
      lines: this.post.format === "square" ? 5 : 8,
      width,
    });

    const gapA = slide.lead && slide.title ? 22 : 0;
    const gapB = slide.body && slide.title ? 44 : 0;
    const total =
      this.blockHeight(lead, 1.25) + gapA + this.blockHeight(title, 1.08) + gapB + this.blockHeight(body, 1.45);
    const top = this.safe().top + 90;
    const room = logoTop - 90 - top;
    let y = top + Math.max(0, (room - total) * 0.42);

    y += this.drawBlock(lead, x, y, 1.25, "left", rgba(pal.onDarkText, 0.8)) + gapA;
    y += this.drawTitle(title, x, y, 1.08, "left", true, x, x + width * 0.9) + gapB;
    this.drawBlock(body, x, y, 1.45, "left", rgba(pal.onDarkText, 0.86));
  }

  numberLayout(photo: HTMLImageElement | null, logo: HTMLImageElement | null) {
    const { ctx, w, h, slide, pal } = this;
    this.background(photo);
    ctx.fillStyle = this.vertical(0, h * 0.6, [
      [0, rgba(pal.light, 0.95)],
      [0.5, rgba(pal.light, 0.75)],
      [1, rgba(pal.light, 0)],
    ]);
    ctx.fillRect(0, 0, w, h * 0.6);
    ctx.fillStyle = this.vertical(h * 0.75, h, [
      [0, rgba(pal.deep, 0)],
      [1, rgba(pal.deep, 0.45)],
    ]);
    ctx.fillRect(0, h * 0.75, w, h * 0.25);

    if (this.post.decor) this.decor();
    this.handle(photo ? "rgba(255, 255, 255, 0.92)" : rgba(pal.dark, 0.75));
    this.logo(logo);

    const cx = w / 2;
    const width = w - 180;
    let y = this.safe().top + (this.post.format === "story" ? 170 : 110);
    const lead = this.bodyText(slide.lead, { weight: 700, max: 50, min: 30, lines: 3, width });
    const title = this.heading(slide.title, { weight: 800, max: 190, min: 70, lines: 1, width });

    y += this.drawBlock(lead, cx, y, 1.2, "center", pal.dark) + (slide.lead ? 18 : 0);
    ctx.save();
    ctx.shadowColor = "rgba(255, 255, 255, 0.35)";
    ctx.shadowBlur = 18;
    y += this.drawTitle(title, cx, y, 1.0, "center", false, cx - width / 2, cx + width / 2);
    ctx.restore();

    if (slide.tag) {
      const tag = slide.tag.toLocaleUpperCase("pt-BR");
      ctx.font = this.font(700, 40, this.brand.fontBody);
      this.setSpacing(1);
      const tw = ctx.measureText(tag).width;
      const padX = 26;
      const boxH = 66;
      const bx = cx - tw / 2 - padX;
      const by = y + 14;
      ctx.fillStyle = rgba(mix(pal.light, "#ffffff", 0.4), 0.94);
      ctx.fillRect(bx, by, tw + padX * 2, boxH);
      ctx.fillStyle = pal.dark;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(tag, cx, by + boxH / 2 + 14);
      this.setSpacing(0);
    }
  }
}

export async function renderSlideBlob(input: RenderInput): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await renderSlide(canvas, input);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob falhou"))), "image/png");
  });
}
