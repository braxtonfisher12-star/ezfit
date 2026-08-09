-- EZfit schema. Run in the Supabase SQL editor.
-- Every user-owned table carries user_id uuid references auth.users, with RLS
-- restricting all access to auth.uid() = user_id.

create extension if not exists "uuid-ossp";

-- 1. profiles ----------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  sex text check (sex in ('male','female')),
  age_years int,
  height_in numeric,
  goal text check (goal in ('lose_fat','build_muscle','recomp','maintain')) default 'recomp',
  goal_weight_lb numeric,
  training_days_per_week int default 3,
  step_goal int default 10000,
  onboarded boolean default false,
  created_at timestamptz default now()
);

-- 2. nutrition_targets (versioned so history is preserved) -------------
create table nutrition_targets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  calories int not null,
  protein_g int not null,
  carbs_g int not null,
  fat_g int not null,
  effective_date date not null default current_date,
  reason text,
  created_at timestamptz default now()
);

-- 3. exercises (global library + user custom) ---------------------------
create table exercises (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  category text,
  equipment text,
  progression_method text check (progression_method in ('reverse_pyramid','straight_set')) default 'straight_set',
  rep_range_low int default 8,
  rep_range_high int default 12,
  rest_seconds int default 120,
  is_global boolean default false
);

-- 4. training_programs ---------------------------------------------------
create table training_programs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  days jsonb not null,        -- e.g. [{"day":"monday","label":"Upper A"}, ...]
  block_number int default 1,
  block_length_weeks int default 9,
  week_in_block int default 1,
  active boolean default true,
  created_at timestamptz default now()
);

-- 5. workout_sessions -----------------------------------------------------
create table workout_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  program_id uuid references training_programs(id),
  day_label text,
  session_date date not null default current_date,
  duration_minutes int,
  status text check (status in ('in_progress','complete')) default 'in_progress',
  created_at timestamptz default now()
);

-- 6. sets -------------------------------------------------------------------
create table sets (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references workout_sessions(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  exercise_id uuid references exercises(id) not null,
  set_number int not null,
  target_weight numeric,
  target_reps_low int,
  target_reps_high int,
  actual_weight numeric,
  actual_reps int,
  is_pr boolean default false,
  completed_at timestamptz
);

-- 7. foods (global library + user custom) ------------------------------
create table foods (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  state text check (state in ('raw','cooked','n/a')) default 'n/a',
  serving_qty numeric default 100,
  serving_unit text default 'g',
  calories numeric not null,
  protein_g numeric not null,
  carbs_g numeric not null,
  fat_g numeric not null,
  is_global boolean default false,
  barcode text
);

-- 8. meals + meal_items ----------------------------------------------------
create table meals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  meal_date date not null default current_date,
  meal_type text check (meal_type in ('breakfast','lunch','dinner','snacks')) not null,
  name text,
  is_saved_meal boolean default false,
  created_at timestamptz default now()
);

create table meal_items (
  id uuid primary key default uuid_generate_v4(),
  meal_id uuid references meals(id) on delete cascade not null,
  food_id uuid references foods(id) not null,
  quantity numeric not null default 1,
  unit text default 'g',
  source text check (source in ('search','barcode','ai_scan','quick_add','recent','saved_meal')) default 'search',
  ai_confidence text check (ai_confidence in ('high','medium','low',null))
);

-- 9. body_metrics -------------------------------------------------------
create table body_metrics (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  metric_date date not null default current_date,
  weight_lb numeric,
  waist_in numeric,
  unique (user_id, metric_date)
);

-- 10. progress_photos (storage path only, files live in Supabase Storage) -
create table progress_photos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  photo_date date not null default current_date,
  angle text check (angle in ('front','side','back')) not null,
  storage_path text not null,
  created_at timestamptz default now()
);

-- 11. recovery_logs -------------------------------------------------------
create table recovery_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  log_date date not null default current_date,
  sleep_minutes int,
  steps int,
  subjective_recovery text check (subjective_recovery in ('poor','fair','good','great')),
  unique (user_id, log_date)
);

-- 12. weekly_reviews --------------------------------------------------------
create table weekly_reviews (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start date not null,
  avg_weight_lb numeric,
  avg_waist_in numeric,
  weight_trend text check (weight_trend in ('down','flat','up')),
  waist_trend text check (waist_trend in ('down','flat','up')),
  strength_trend text check (strength_trend in ('improving','flat','declining')),
  workouts_completed int,
  workouts_scheduled int,
  prs_count int,
  avg_calories numeric,
  calorie_target numeric,
  calorie_adherence_pct numeric,
  protein_adherence_pct numeric,
  avg_steps numeric,
  avg_sleep_minutes numeric,
  decision_state text check (decision_state in ('green','yellow','orange','blue','purple')),
  recommendation_text text,
  recommended_calorie_change int default 0,
  user_response text check (user_response in ('accepted','declined','pending')) default 'pending',
  created_at timestamptz default now()
);

-- Row level security ------------------------------------------------------
alter table profiles enable row level security;
alter table nutrition_targets enable row level security;
alter table exercises enable row level security;
alter table training_programs enable row level security;
alter table workout_sessions enable row level security;
alter table sets enable row level security;
alter table foods enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;
alter table body_metrics enable row level security;
alter table progress_photos enable row level security;
alter table recovery_logs enable row level security;
alter table weekly_reviews enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own targets" on nutrition_targets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read global or own exercises" on exercises for select using (is_global = true or auth.uid() = user_id);
create policy "write own exercises" on exercises for insert with check (auth.uid() = user_id);
create policy "update own exercises" on exercises for update using (auth.uid() = user_id);
create policy "delete own exercises" on exercises for delete using (auth.uid() = user_id);

create policy "own programs" on training_programs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sessions" on workout_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own sets" on sets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "read global or own foods" on foods for select using (is_global = true or auth.uid() = user_id);
create policy "write own foods" on foods for insert with check (auth.uid() = user_id);
create policy "update own foods" on foods for update using (auth.uid() = user_id);
create policy "delete own foods" on foods for delete using (auth.uid() = user_id);

create policy "own meals" on meals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own meal items" on meal_items for all using (
  exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid())
) with check (
  exists (select 1 from meals m where m.id = meal_items.meal_id and m.user_id = auth.uid())
);

create policy "own body metrics" on body_metrics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own photos" on progress_photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own recovery" on recovery_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own weekly reviews" on weekly_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Seed a few global exercises and foods so search/logging works out of the box.
insert into exercises (name, category, equipment, progression_method, rep_range_low, rep_range_high, is_global) values
  ('Incline Barbell Bench Press','push','barbell','reverse_pyramid',4,6,true),
  ('Weighted Pull-Up','pull','bodyweight+load','reverse_pyramid',4,6,true),
  ('Hack Squat','legs','machine','reverse_pyramid',6,8,true),
  ('Lateral Raise','shoulders','dumbbell','straight_set',10,15,true),
  ('Hammer Curl','arms','dumbbell','straight_set',8,12,true);

insert into foods (name, state, serving_qty, serving_unit, calories, protein_g, carbs_g, fat_g, is_global) values
  ('Chicken Breast','raw',100,'g',120,22.5,0,2.6,true),
  ('Chicken Breast','cooked',100,'g',165,31,0,3.6,true),
  ('Chicken Thigh','raw',100,'g',156,17,0,9,true),
  ('Chicken Thigh','cooked',100,'g',209,26,0,10.9,true),
  ('Greek Yogurt','n/a',170,'g',150,17,8,4,true),
  ('Banana','n/a',118,'g',105,1.3,27,0.4,true),
  ('Jasmine Rice','cooked',158,'g',205,4.2,45,0.4,true),
  ('93/7 Ground Beef','cooked',100,'g',195,22,0,11,true);
