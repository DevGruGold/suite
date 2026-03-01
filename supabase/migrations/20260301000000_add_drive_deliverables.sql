-- Migration: add drive_deliverables JSONB column to tasks
-- Generated 2026-03-01
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS drive_deliverables JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.tasks.drive_deliverables IS 'Array of Google Drive deliverable objects: [{type, title, docUrl, pdfUrl, sheetUrl, folderId, createdAt}]';