import Database from "better-sqlite3";
import { scriptDraftNotesSchema } from "../src/lib/script-studio";
import { saveScriptDraft } from "../src/lib/script-versions-server";
import { db, schema } from "../src/lib/db";
import { eq } from "drizzle-orm";

const projectId = "ds8zae3qv73v3e8zzd0nqdnw";
const sqlite = new Database("./data/app.db");
const row = sqlite
  .prepare("SELECT script_draft, script_draft_notes, script_draft_status, script_draft_version FROM projects WHERE id = ?")
  .get(projectId) as {
  script_draft: string;
  script_draft_notes: string;
  script_draft_status: string;
  script_draft_version: number | null;
};

const notes = JSON.parse(row.script_draft_notes);
const parsed = scriptDraftNotesSchema.safeParse(notes);
if (!parsed.success) {
  console.error("invalid notes", parsed.error.issues);
  process.exit(1);
}

const [project] = await db
  .select()
  .from(schema.projects)
  .where(eq(schema.projects.id, projectId))
  .limit(1);

try {
  const result = await saveScriptDraft(project!, {
    script: row.script_draft,
    notes: parsed.data,
    status: "draft",
  });
  console.log("save ok", result.status, result.notes.updatedAt);
} catch (err) {
  console.error("save failed", err);
  process.exit(1);
}
