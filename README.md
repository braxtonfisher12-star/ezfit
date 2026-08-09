# EZfit — buildable scaffold

A body-composition operating system: PLAN -> EXECUTE -> TRACK -> ANALYZE -> ADJUST -> REPEAT.

Vite + React PWA, Supabase (Postgres + Auth + RLS + Storage), Netlify hosting + serverless functions.

## What's wired up

- Supabase schema + migration with row-level security (`supabase/schema.sql`, `supabase/migration_002_workout_builder_and_time_slots.sql`)
- Auth context + client (`src/lib/supabaseClient.js`, `src/lib/auth.jsx`)
- Progressive overload engine (`src/lib/progressionEngine.js`) — reverse-pyramid and straight-set rules
- Weekly decision engine (`src/lib/decisionEngine.js`) — green/yellow/orange/blue/purple states
- **Today** — live weight, sleep, workout card, food, steps, score
- **Train** — full week view of assigned workouts, a workout builder (custom exercises, sets/rep ranges, assign to any day of the week), a full-screen "hold to start" flow per day, a multi-exercise active-workout runner with progression targets, PR detection, and a rotating motivational quote each rest period, ending on a full workout summary
- **Food** — MacroFactor-style 7-day strip you toggle across, a 5am–12am hourly timeline for the selected day, search backed by USDA FoodData Central (~600k foods), barcode lookup via Open Food Facts, quick add, and AI photo scan
- **Progress** — 7-day nutrition adherence strip, weight trend, habit-consistency stats (weigh-in and food-logging frequency), and the latest weekly review
- AI food-photo scan as a Netlify function calling the Anthropic API server-side (`netlify/functions/ai-food-scan.js`)
- Weekly review generator as a scheduled Netlify function (`netlify/functions/weekly-review.js`)

## What's stubbed

- Progress photo storage (Supabase Storage bucket is defined, upload UI isn't)
- Push notifications
- Garmin / wearable sync (discussed but intentionally not built yet — see chat)

## Setup

1. Create a Supabase project. In the SQL editor, run **both** files in order:
   - `supabase/schema.sql`
   - `supabase/migration_002_workout_builder_and_time_slots.sql`
2. Create a Storage bucket named `progress-photos` (private).
3. Get a free USDA FoodData Central API key at https://fdc.nal.usda.gov/api-key-signup
   (the app falls back to the public `DEMO_KEY` if you skip this, but that's rate-limited to a
   handful of requests per hour — get your own key before relying on food search).
4. Copy `.env.example` to `.env` and fill in Supabase URL/anon key, your Anthropic key, and
   `FDC_API_KEY`.
5. `npm install`
6. `npm run dev`

## Deploy

1. Push to GitHub, connect the repo in Netlify.
2. Set env vars in Netlify: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANTHROPIC_API_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `FDC_API_KEY`.
3. Add a schedule for the weekly review function in `netlify.toml`:
   ```toml
   [functions."weekly-review"]
     schedule = "@weekly"
   ```
4. Build command and publish dir are already set in `netlify.toml`.
