-- Climbing Logbook schema
-- Run this once in your Supabase project's SQL editor.

create table if not exists climbs (
  id             uuid primary key default gen_random_uuid(),
  date           date,
  route_name     text,
  crag           text,

  -- Grade (overall route grade, whichever system the user entered)
  grade_system   text,          -- 'NO' | 'FR'
  grade_no       text,          -- Norwegian grade, e.g. '6-', '7'
  grade_fr       text,          -- French grade, e.g. '6a', '6c'

  -- Pitch structure
  is_multipitch  boolean default false,
  pitches        jsonb,
  -- pitches format for multi-pitch:
  -- [{ "pitch": 1, "grade_no": "6-", "grade_fr": "6a", "length_m": 30 }, ...]

  length_m       numeric,       -- total length in metres

  -- Climb classification
  climb_type     text,          -- 'Trad' | 'Sport' | 'Bouldering' | 'Alpine' | 'Scrambling' | 'Winter'

  -- Ascent style (two-level: primary style + optional detail)
  ascent_style   text,          -- 'Lead' | 'Solo' | 'Second' | 'Top-rope' | 'Boulder' | 'DWS' | 'Alternate Leads'
  ascent_detail  text,          -- 'Onsight' | 'Flash' | 'Redpoint/Headpoint' | 'Ground up'
                                --  | 'Repeat ascent' | 'With falls/rests' | 'Did not finish'
  ascent_result  text,          -- 'Send' | 'Working' — derived from (style, detail), see lib/types.ts

  weather        text,
  partner        text,
  notes          text,
  attempts       integer,
  reviewed       boolean default false,
  created_at     timestamptz default now()
);

-- Enable Row Level Security
alter table climbs enable row level security;

-- Allow anon to read and write all rows.
-- NOTE: This means anyone who discovers the Supabase URL + anon key can
-- freely read/write your data. Acceptable for a personal tool; add auth
-- (Supabase Auth + user_id column) if you ever need to lock this down.
create policy "allow_all_anon" on climbs
  for all
  to anon
  using (true)
  with check (true);
