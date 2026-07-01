import Database from "better-sqlite3";
import { scriptDraftNotesSchema } from "../src/lib/script-studio";
import { db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";
import { generateScriptParagraphSpeech } from "../src/lib/script-narration-server";
import { listScriptSpeechParagraphs } from "../src/lib/script-narration-utils";
import { parseScriptDraftNotes } from "../src/lib/script-studio";

const projectId = process.argv[2] ?? "ds8zae3qv73v3e8zzd0nqdnw";

const sqlite = new Database("./data/app.db");
const row = sqlite
  .prepare("SELECT script_draft_notes FROM projects WHERE id = ?")
  .get(projectId) as { script_draft_notes: string } | undefined;
if (!row) {
  console.error("project not found");
  process.exit(1);
}

const notes = JSON.parse(row.script_draft_notes);
const parsed = scriptDraftNotesSchema.safeParse(notes);
console.log("notes schema valid:", parsed.success);
if (!parsed.success) {
  console.log(parsed.error.issues.slice(0, 8));
  process.exit(1);
}

const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
if (!project) {
  console.error("drizzle project not found");
  process.exit(1);
}

const script = project.scriptDraft ?? "";
const paragraphs = listScriptSpeechParagraphs(script);
console.log("paragraphs:", paragraphs.length);

const draftNotes = parseScriptDraftNotes(project.scriptDraftNotes);
try {
  const clip = await generateScriptParagraphSpeech({
    project,
    notes: draftNotes,
    speechText: paragraphs[0]!.text,
    speechIndex: 0,
  });
  console.log("clip ok:", clip.audioUrl.slice(0, 80), clip.durationSeconds);
} catch (err) {
  console.error("TTS failed:", err);
  process.exit(1);
}
