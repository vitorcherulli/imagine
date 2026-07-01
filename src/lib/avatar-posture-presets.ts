export interface AvatarPosturePreset {
  id: string;
  label: string;
  prompt: string;
}

export const AVATAR_POSTURE_PRESETS: AvatarPosturePreset[] = [
  {
    id: "front_neutral",
    label: "Front · neutral",
    prompt:
      "Full body front view, standing straight, neutral expression, arms relaxed at sides, feet shoulder-width apart.",
  },
  {
    id: "three_quarter_smile",
    label: "3/4 · smiling",
    prompt:
      "Three-quarter angle view, warm friendly smile, relaxed shoulders, one foot slightly forward.",
  },
  {
    id: "profile",
    label: "Side profile",
    prompt: "Clean side profile, full body visible, neutral expression, standing still.",
  },
  {
    id: "walking",
    label: "Walking",
    prompt: "Mid-stride walking pose, natural arm swing, looking slightly ahead, dynamic but stable.",
  },
  {
    id: "sitting",
    label: "Sitting",
    prompt: "Sitting on a simple stool or bench, relaxed posture, hands resting on knees.",
  },
  {
    id: "waving",
    label: "Waving",
    prompt: "Friendly wave toward camera, open body language, slight smile.",
  },
  {
    id: "thinking",
    label: "Curious",
    prompt: "Curious expression, head slightly tilted, one hand near chin, engaged storyteller energy.",
  },
  {
    id: "action",
    label: "Action",
    prompt: "Light action pose — jumping, reaching, or exploring — same outfit, energetic but readable silhouette.",
  },
  {
    id: "closeup",
    label: "Close-up",
    prompt: "Chest-up portrait, sharp face detail, soft studio lighting, neutral background.",
  },
  {
    id: "sheet_mockup",
    label: "Pose sheet",
    prompt:
      "Character turnaround reference: same person in 4 poses on a clean white background — front, three-quarter, profile, and walking — consistent outfit and face.",
  },
];

export function buildAvatarPosturePrompt(input: {
  avatarName: string;
  avatarDescription?: string | null;
  posturePrompt: string;
}): string {
  const notes = input.avatarDescription?.trim();
  return [
    `Create ONE photorealistic reference photo of the character "${input.avatarName}".`,
    "The person MUST match the uploaded reference photos exactly — same face, age, hair, skin tone, body type, and outfit.",
    `Pose / framing: ${input.posturePrompt.trim()}`,
    notes ? `Character notes: ${notes}` : null,
    "Simple clean background (soft gradient or plain). No props unless essential to the pose.",
    "Single subject only. No text, labels, watermarks, UI, or collage borders.",
    "Square 1:1 framing suitable for a character reference library.",
  ]
    .filter(Boolean)
    .join("\n");
}
