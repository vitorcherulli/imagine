import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { tryUser } from "@/lib/auth";
import {
  mergeStyleBible,
  parseStyleBible,
  parseStyleBibleDocument,
  styleBiblePartialSchema,
  styleBibleBlockImagesSchema,
  type StyleBibleDocument,
} from "@/lib/style-bible";
import {
  generateAndSaveStyleBible,
  generateAllEditorialBlockReferences,
  saveStyleBibleDocument,
  StyleBibleError,
} from "@/lib/style-bible-server";
import { reconcileProjectStyleBible } from "@/lib/style-bible-prune";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function getOwnedProject(projectId: string, userId: string) {
  const [p] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return p ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const reconciled = await reconcileProjectStyleBible(project);
  const doc = parseStyleBibleDocument(reconciled.styleBible);
  return NextResponse.json({
    styleBible: doc?.fields ?? parseStyleBible(reconciled.styleBible),
    blockImages: doc?.blockImages ?? {},
    document: doc,
    anchorImageUrl: reconciled.anchorImageUrl,
    ...(reconciled.prunedCount > 0 ? { prunedStaleImages: reconciled.prunedCount } : {}),
  });
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const bible = await generateAndSaveStyleBible(project);
    const { blockImages, errors } = await generateAllEditorialBlockReferences(project.id, bible);
    const document = { fields: bible, blockImages };
    const failedFields = Object.keys(errors);
    const firstError = failedFields[0] ? errors[failedFields[0] as keyof typeof errors] : null;
    return NextResponse.json({
      styleBible: bible,
      blockImages,
      document,
      ...(failedFields.length > 0
        ? {
            partial: true,
            referenceErrors: errors,
            warning: `Text saved; ${failedFields.length} reference image(s) failed${
              firstError ? `: ${firstError}` : ""
            }`,
          }
        : {}),
    });
  } catch (err) {
    const status = err instanceof StyleBibleError ? 400 : 500;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Style bible generation failed" },
      { status },
    );
  }
}

const patchBody = z.object({
  patch: styleBiblePartialSchema.optional(),
  bible: styleBiblePartialSchema.optional(),
  blockImages: styleBibleBlockImagesSchema.optional(),
  document: z
    .object({
      fields: styleBiblePartialSchema,
      blockImages: styleBibleBlockImagesSchema.optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await tryUser();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await getOwnedProject(params.id, userId);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = patchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const currentDoc = parseStyleBibleDocument(project.styleBible);
  let nextDoc: StyleBibleDocument;

  if (parsed.data.document) {
    nextDoc = {
      fields: mergeStyleBible(null, parsed.data.document.fields),
      blockImages: {
        ...(currentDoc?.blockImages ?? {}),
        ...(parsed.data.document.blockImages ?? {}),
      },
    };
  } else if (parsed.data.bible || parsed.data.patch) {
    nextDoc = {
      fields: mergeStyleBible(currentDoc?.fields ?? null, parsed.data.bible ?? parsed.data.patch ?? {}),
      blockImages: {
        ...(currentDoc?.blockImages ?? {}),
        ...(parsed.data.blockImages ?? {}),
      },
    };
  } else if (parsed.data.blockImages) {
    nextDoc = {
      fields: currentDoc?.fields ?? mergeStyleBible(null, {}),
      blockImages: { ...(currentDoc?.blockImages ?? {}), ...parsed.data.blockImages },
    };
  } else {
    return NextResponse.json({ error: "Provide patch, bible, blockImages or document" }, { status: 400 });
  }

  await saveStyleBibleDocument(project.id, nextDoc);

  return NextResponse.json({
    styleBible: nextDoc.fields,
    blockImages: nextDoc.blockImages,
    document: nextDoc,
  });
}
