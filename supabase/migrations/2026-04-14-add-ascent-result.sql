-- Add ascent_result column and backfill from existing (ascent_style, ascent_detail).
-- Run this once in your Supabase SQL editor against an existing climbs table.
-- Mirrors deriveAscentResult() in lib/types.ts — keep them in sync.

alter table climbs
  add column if not exists ascent_result text;  -- 'Send' | 'Working'

update climbs set ascent_result = case
  when ascent_style = 'Top-rope' then 'Working'
  when ascent_style = 'Second' and ascent_detail in ('With falls/rests','Did not finish') then 'Working'
  when ascent_style = 'Second' and ascent_detail in ('Onsight','Flash','Repeat ascent') then 'Send'
  when ascent_detail in ('Did not finish','With falls/rests') then 'Working'
  when ascent_detail in ('Onsight','Flash','Ground up','Redpoint/Headpoint','Repeat ascent') then 'Send'
  else null
end
where ascent_result is null;
