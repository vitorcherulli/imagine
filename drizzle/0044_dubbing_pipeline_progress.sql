ALTER TABLE projects ADD COLUMN dub_pipeline_stage text;
ALTER TABLE projects ADD COLUMN dub_pipeline_message text;
ALTER TABLE projects ADD COLUMN dub_pipeline_current integer;
ALTER TABLE projects ADD COLUMN dub_pipeline_total integer;
