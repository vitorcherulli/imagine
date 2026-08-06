export interface ScenarioPerspectivePreset {
  id: string;
  label: string;
  prompt: string;
}

/** Camera perspectives to re-render the SAME location from a new viewpoint. */
export const SCENARIO_PERSPECTIVE_PRESETS: ScenarioPerspectivePreset[] = [
  {
    id: "wide_establishing",
    label: "Wide establishing",
    prompt:
      "Pull back to a wide establishing shot that shows the whole place and its surroundings, eye-level camera.",
  },
  {
    id: "aerial",
    label: "Aerial / top-down",
    prompt:
      "High aerial drone view looking down over the location, revealing its layout and scale from above.",
  },
  {
    id: "low_angle",
    label: "Low angle",
    prompt:
      "Dramatic low-angle shot from near the ground looking up, emphasizing height and grandeur.",
  },
  {
    id: "close_up_detail",
    label: "Close-up detail",
    prompt:
      "Tight close-up on a characteristic detail of the place (texture, material, foreground element), shallow depth of field.",
  },
  {
    id: "interior_pov",
    label: "Inside / POV",
    prompt:
      "Move the camera inside the scene at eye level, a first-person point of view standing within the location.",
  },
  {
    id: "reverse_angle",
    label: "Reverse angle",
    prompt:
      "Reverse angle — turn the camera roughly 180° to look back the other way from within the same location.",
  },
  {
    id: "side_angle",
    label: "Side angle",
    prompt:
      "Shift the camera to a three-quarter side angle of the location for a different composition.",
  },
  {
    id: "golden_hour",
    label: "Golden hour",
    prompt:
      "Same viewpoint but re-lit at golden hour with warm low sunlight and long soft shadows.",
  },
  {
    id: "night",
    label: "Night",
    prompt:
      "Same location at night, natural and practical lighting, moody atmosphere, believable darkness.",
  },
];

export function buildScenarioPerspectivePrompt(input: {
  name: string;
  description?: string | null;
  perspectivePrompt: string;
  styleCue?: string;
}): string {
  const lines = [
    "Re-render the EXACT SAME real-world location shown in the reference image — keep the same architecture, landscape, materials, objects, colors and overall identity of the place.",
    `New camera perspective: ${input.perspectivePrompt}`,
    `Location name: ${input.name}.`,
    input.description?.trim() ? `Location notes: ${input.description.trim()}.` : "",
    input.styleCue ? `Visual style: ${input.styleCue}.` : "",
    "Empty scene with NO people, NO characters, NO text, NO logos and NO watermarks. Only the environment. It must be clearly recognizable as the same place, just seen from a different angle.",
  ];
  return lines.filter(Boolean).join("\n");
}
