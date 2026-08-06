ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "keyframe_ai_model" text;
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "video_ai_model" text;
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "narration_ai_model" text;
ALTER TABLE "story_blocks" ADD COLUMN IF NOT EXISTS "scene_audio_ai_model" text;
