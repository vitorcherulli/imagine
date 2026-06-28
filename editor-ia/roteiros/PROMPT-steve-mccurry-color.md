# Prompt — Steve McCurry Color Grade (Premiere / Lumetri)

Use this prompt with an AI assistant, or follow it yourself when grading **Capitólio Mar de Minas** in Adobe Premiere Pro.

Copy everything inside the block below. Replace `[SCENE NOTES]` if you have per-shot notes.

---

```
You are a senior colorist specializing in documentary travel film. Your reference is the photographic work of Steve McCurry — especially his Kodachrome-era National Geographic assignments (Afghanistan, India, Asia, Brazil-adjacent palettes).

TASK
Design and apply a professional color grade for drone and landscape footage of Capitólio / Mar de Minas (Minas Gerais, Brazil): canyon walls, turquoise reservoir water, forest trails, golden rock, overcast and sunny skies.

Output: exact Lumetri Color settings for Adobe Premiere Pro, plus grading notes per scene type. If a LUT is available, specify how to combine LUT + manual polish.

FOOTAGE CONTEXT
[SCENE NOTES]
- Phantom 3 drone, mixed lighting, already somewhat saturated water and greenery
- Goal: cinematic documentary — NOT Instagram filter, NOT teal-orange blockbuster
- Narration tone: Attenborough — grade must feel timeless, warm, reverent

---

STEVE McCURRY — COLOR PROFILE (what to emulate)

FILM & PHILOSOPHY
- Kodachrome lineage: punchy but natural saturation, no neon
- Travel documentary: the land feels lived-in, ancient, dignified
- Color as emotion: warmth = humanity; deep blues = distance and depth

SIGNATURE TRAITS (translate to video)
1. WARM MIDS — earth, rock, skin shift amber/saffron (+200–400K feel), never pink
2. DEEP SHADOWS — retain detail; slight cool/teal whisper in deepest shadows only (separation, not stylization)
3. RICH PRIMARIES — reds and oranges full but not clipped; blues in sky/water deep and clean
4. GOLDEN HIGHLIGHTS — sun and sky roll off to honey/amber, not pure white
5. CONTRAST — medium-high S-curve; blacks lifted 3–8% (fade 8–12% optional in Creative)
6. CLARITY — present micro-contrast; no HDR crunch or oversharpening
7. SKIN (if any) — protect oranges; never magenta

WHAT McCURRY IS NOT
- Flat log look, crushed blacks, neon teal shadows, bleach bypass, heavy vignette, oversaturated HSL everywhere

CAPITÓLIO-SPECIFIC TARGETS
| Element | Direction |
|---------|-----------|
| Furnas water | Deep emerald/teal, not electric cyan; boost blue channel in mids |
| Canyon rock | Warm ochre, burnt sienna, layered contrast |
| Forest green | Olive + depth, pull yellow-green saturation slightly down |
| Sky | Soft warm highlight; avoid harsh blue clipping |
| Drone sharpness | Light sharpen 10–20 only after color |

---

PREMIERE PRO WORKFLOW (professional)

1. Adjustment layer on V2 covering full sequence (or master clip after edit lock)
2. Effect: Lumetri Color (single instance — avoid stacking duplicates)
3. Input LUT: `steve-mccurry-capitolio.cube` (Basic > Input LUT) at 85–100%
4. Fine-tune with values below ON TOP of LUT (reduce LUT to 70% if too strong)

LUMETRI — BASIC (starting point after LUT)
- Temperature: +10 to +18
- Tint: +2 to +4
- Exposure: +0.10 to +0.25 (scene dependent)
- Contrast: +18 to +28
- Highlights: −15 to −25
- Shadows: +10 to +20
- Whites: −5 to −15
- Blacks: +3 to +8
- Vibrance: +15 to +25
- Saturation: +5 to +12 (never above +15 if LUT already applied)

LUMETRI — CREATIVE
- Faded Film: 8–12
- Sharpen: 12–18
- Shadow Color Tint: very subtle teal (hue ~195°, sat 8–15, balance toward shadows)
- Highlight Color Tint: subtle amber (hue ~45°, sat 10–18, balance toward highlights)

LUMETRI — CURVES (RGB master — gentle S)
- Shadows anchor: (0, 0.04) to (0.18, 0.22)
- Highlights shoulder: (0.78, 0.88) to (1.0, 0.96)

LUMETRI — COLOR WHEELS (optional polish)
- Shadows: −2 red, +1 blue (cool depth)
- Midtones: +3 red, +2 green (warmth)
- Highlights: +4 red, +2 green, −1 blue (golden)

LUMETRI — HSL SECONDARY (only if needed)
- Orange (rock): Sat +10 to +20
- Yellow-green (forest): Sat −5 to −10, Luma −5
- Aqua/Blue (water): Sat +8 to +15, Hue slightly toward blue

5. Scope check: waveform — no clipped whites; vectorscope — skin line if people present
6. Export: Rec.709, no extra LUT on export unless deliverable spec requires

---

QUALITY CHECKLIST
- [ ] Water reads natural, not pool-toy cyan
- [ ] Rocks feel warm and geological, not orange mush
- [ ] Shadows hold canyon texture
- [ ] Grade survives YouTube compression (slightly less saturation than for cinema)
- [ ] Matches Attenborough narration — calm, not flashy

Now produce the final Lumetri recipe for this project and note any per-clip exceptions (e.g. darker canyon interiors −0.15 exposure).
```

---

## Files in editor-ia

| File | Use |
|------|-----|
| `color/steve-mccurry-capitolio.cube` | Import in Lumetri > Basic > Input LUT |
| `roteiros/PREMIERE-capitolio-color-grade.md` | Step-by-step in Portuguese |
| `scripts/generate-mccurry-lut.py` | Regenerate LUT if you tweak the math |

## Quick reference — McCurry vs generic “cinematic”

| McCurry | Avoid |
|---------|-------|
| Kodachrome warmth | Teal shadows + orange skin blockbusters |
| Deep natural blues | Neon aqua water |
| Saffron earth tones | Uniform orange cast on everything |
| Lifted blacks, soft fade | Crushed blacks |
| One strong photo = one strong grade | Random LUT per clip |
