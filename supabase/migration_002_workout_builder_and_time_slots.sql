-- Migration 002: custom workout builder + day assignment, time-slot food
-- logging. Run this in the Supabase SQL editor AFTER schema.sql.

-- 1. Workout templates ("Upper A", "Lower", etc) built by the user -------
create table workout_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table workout_template_exercises (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references workout_templates(id) on delete cascade not null,
  exercise_id uuid references exercises(id) not null,
  order_index int not null default 0,
  target_sets int not null default 3,
  target_reps_low int not null default 8,
  target_reps_high int not null default 12,
  rest_seconds int not null default 120
);

-- One row per weekday (0=Sunday..6=Saturday) mapping to a template.
-- A day with no row is a rest day.
create table workout_day_assignments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  template_id uuid references workout_templates(id) on delete cascade not null,
  unique (user_id, day_of_week)
);

alter table workout_templates enable row level security;
alter table workout_template_exercises enable row level security;
alter table workout_day_assignments enable row level security;

create policy "own templates" on workout_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own template exercises" on workout_template_exercises for all using (
  exists (select 1 from workout_templates t where t.id = workout_template_exercises.template_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from workout_templates t where t.id = workout_template_exercises.template_id and t.user_id = auth.uid())
);

create policy "own day assignments" on workout_day_assignments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2. Time-slot food logging ------------------------------------------------
-- meals move from a coarse meal_type bucket to an hour slot ("05:00".."23:00")
-- so the Food tab can render a 5am-12am timeline per day, MacroFactor-style.
-- meal_type is kept (nullable) for backward compatibility / display grouping.
alter table meals add column if not exists logged_time text; -- e.g. '08:00'
alter table meals alter column meal_type drop not null;

-- 3. Cache table for external food-database lookups (USDA FDC / Open Food
-- Facts) so a food a user has actually logged becomes instantly searchable
-- again without re-hitting the external API every time.
alter table foods add column if not exists external_source text; -- 'usda' | 'off' | null
alter table foods add column if not exists external_id text;
create index if not exists foods_external_idx on foods(external_source, external_id);
