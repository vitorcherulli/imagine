import type { Avatar, Project } from "./db/schema";

export interface BlockDraft {
  segmentType: "intro" | "development" | "climax" | "resolution";
  narrativeText: string;
  visualPrompt: string;
  durationSeconds: number;
  characterName?: string | null;
  locationTag?: string | null;
}

export function buildStorySystemPrompt(hasCharacters: boolean) {
  const base = [
    "You are an expert screenwriter and video story-board author for short-form online videos.",
    "Given a project brief, output a JSON object with a 'blocks' array of narrative blocks.",
    "Each block has: segmentType ('intro' | 'development' | 'climax' | 'resolution'), narrativeText (the voice-over script, complete sentences), visualPrompt (concise cinematographic description of the visual to generate), durationSeconds (integer), locationTag (short snake_case identifier for THIS scene's unique setting, e.g. garden_gate, purple_tunnel, sunlit_meadow).",
  ];
  if (hasCharacters) {
    base.push(
      "Each block also has characterName (string or null): the name of the main character visible in this shot, chosen EXACTLY from the provided characters list. Use null for wide shots, scenery, objects, or scenes with no named character on screen.",
      "Distribute characters across the story — different blocks may feature different characters when the story has multiple personas.",
    );
  }
  base.push(
    "Constraints:",
    "- Exactly one 'intro', exactly one 'climax', exactly one 'resolution'. The rest are 'development' (use as many as needed).",
    "- IMPORTANT: each block's durationSeconds MUST be between 6 and 10 seconds — never longer than 10. Use more 'development' blocks instead of longer ones.",
    "- Total of durationSeconds across all blocks must be within ±10% of the target total duration.",
    "- Block count = ceil(target_total_duration_seconds / 8). For a 60s target use ~7-8 blocks; for 180s use ~18-22 blocks.",
    "- narrativeText for each block must contain roughly (durationSeconds * 2.5) words (≈150 wpm).",
    "- visualPrompt must NOT contain quotation marks or new lines; it should describe lighting, camera, subjects, action, mood for THIS specific scene.",
    "- locationTag: a short unique snake_case name for the physical setting of this block (reuse the same tag when consecutive blocks share the same place). Different story beats MUST use different tags when the location changes.",
    "- IMPORTANT visual continuity: every visualPrompt must START with one short phrase establishing color palette and key light (e.g. 'Warm amber rim light, deep teal shadows. ...'). Use a CONSISTENT palette and lighting across all blocks so the scenes feel like one coherent film. Vary location, action, framing and emotion — not the film's color/light identity.",
    "- The story must be self-contained and follow the user's description, genre and tone.",
    "- Respond ONLY with the JSON object, no prose.",
  );
  return base.join("\n");
}

export function buildStoryUserPrompt(
  project: Project,
  characters: Array<Pick<Avatar, "name" | "description">>,
) {
  return JSON.stringify(
    {
      story_description: project.storyDescription,
      genre: project.genre,
      visual_style: project.visualStyle,
      voice_tone: project.voiceTone,
      target_total_duration_seconds: project.targetDurationSeconds,
      ...(characters.length > 0
        ? {
            characters: characters.map((c) => ({
              name: c.name,
              description: c.description ?? undefined,
            })),
          }
        : {}),
    },
    null,
    2,
  );
}

export function buildSuggestionSystemPrompt() {
  return [
    "You are a creative story-idea generator for online short videos.",
    "Given a genre, visual style and target duration, output JSON: { ideas: [ { title, summary } x3 ] }.",
    "Each summary is 2-3 sentences. Keep it punchy and clearly differentiated.",
    "Respond ONLY with the JSON object.",
  ].join("\n");
}

export function buildSuggestionUserPrompt(input: {
  genre: string;
  visualStyle: string;
  voiceTone: string;
  targetDurationSeconds: number;
}) {
  return JSON.stringify(input, null, 2);
}

export function buildMusicPromptDefault(project: Project): string {
  const tone = project.voiceTone || project.genre || "cinematic";
  const style = project.visualStyle || "cinematic";
  return [
    `Background score for a ${project.genre || "story"} short video.`,
    `Mood: ${tone}, ${style}.`,
    "Instrumental only (no vocals or lyrics).",
    "Subtle, atmospheric, sits behind voice-over narration — low to moderate dynamics, leave space for spoken word.",
    "Mid-tempo, evolving texture; smooth intro and gentle outro suitable for looping.",
  ].join(" ");
}

export function buildYoutubeMetadataSystemPrompt(hasCharacter = false) {
  const lines = [
    "You produce YouTube metadata for short-form story videos.",
    "Output JSON: { titles: string[5], description: string, tags: string[10-15], thumbnailPrompt: string }.",
    "- titles: 5 SEO+CTR-optimized titles, each 30-65 chars, no clickbait emojis, no quotes.",
    "- description: 600-900 chars, includes a hook in the first 2 lines, then a brief synopsis, then a TIMESTAMPS section using the provided block list (format 'mm:ss Title'), then 3-5 hashtags on the last line.",
    "- tags: comma-friendly short keywords (no '#'), specific to the topic.",
    "- thumbnailPrompt: a vivid single-paragraph image prompt suitable for 16:9 1280x720 thumbnail, describes the most impactful scene plus large clear typography of a short headline.",
  ];
  if (hasCharacter) {
    lines.push(
      "- thumbnailPrompt MUST prominently feature the provided main character (use their exact name) as the focal subject, matching their appearance from reference photos.",
    );
  }
  lines.push("Respond ONLY with the JSON object.");
  return lines.join("\n");
}
