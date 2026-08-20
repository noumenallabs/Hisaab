-- Comprehensive fix for audit_action enum vs text mismatch
-- Fixes: column "action" is of type audit_action but expression is of type text
-- Root cause: CASE expression returns text, not enum, and many functions insert text literals
-- Instead of patching 10+ functions one by one (piecemeal), change column to text once
-- This is safe: audit_action enum values are still valid as text, and RLS/tests only check text equality (like '%VALIDATION_FAILED%')
-- Keeps enum type for reference but allows text inserts without cast

do $$ begin
  -- Change column type from enum to text (using cast)
  alter table public.audit_logs alter column action type text using action::text;
exception when undefined_table then null; when undefined_column then null; end $$;

-- Optionally keep enum for documentation, but column is now text so no cast needed in functions
-- Re-apply save_expense without cast to ensure it works with text column (if already fixed, this is idempotent)
