// Deterministic program generator — Coach spec sections 4-11. Given the
// program-builder inputs and the tagged exercise library, returns a split
// (day-by-day exercise lists with sets/rep ranges), no AI involved. This
// keeps "Build My Program" fast, reproducible, and explainable — the "Why
// this program?" panel is just describing what this function already did.

const SPLITS = {
  2: [{ label: "Full Body A", muscles: ["chest", "back", "legs", "shoulders"] }, { label: "Full Body B", muscles: ["legs", "back", "chest", "arms"] }],
  3: [{ label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower", muscles: ["legs", "glutes", "core"] }, { label: "Upper B", muscles: ["chest", "back", "shoulders", "arms"] }],
  4: [{ label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower A", muscles: ["legs", "glutes"] }, { label: "Upper B", muscles: ["chest", "back", "shoulders", "arms"] }, { label: "Lower B", muscles: ["legs", "glutes", "core"] }],
  5: [{ label: "Push", muscles: ["chest", "shoulders", "arms"] }, { label: "Pull", muscles: ["back", "arms"] }, { label: "Legs", muscles: ["legs", "glutes"] }, { label: "Upper", muscles: ["chest", "back", "shoulders"] }, { label: "Lower", muscles: ["legs", "glutes", "core"] }],
};

// Reverse-pyramid compounds get the front slots (they carry the session);
// straight-set accessories fill out volume. Priority muscle groups get one
// extra accessory slot each, capped so program balance isn't destroyed
// (spec section 9: "should not completely destroy program balance").
function pickExercisesForDay(muscles, library, { priorities = [], dislikedIds = [], perDaySlots = 7 }) {
  const usable = library.filter((e) => !dislikedIds.includes(e.id));
  const compounds = usable.filter((e) => e.progression_method === "reverse_pyramid" && muscles.includes(e.muscle_group));
  const accessories = usable.filter((e) => e.progression_method === "straight_set" && muscles.includes(e.muscle_group));

  const chosen = [];
  const seenMuscles = new Set();
  for (const c of compounds) {
    if (chosen.length >= perDaySlots) break;
    chosen.push(c);
    seenMuscles.add(c.muscle_group);
  }
  // one accessory per remaining muscle group first, then extra slots to priorities
  const byMuscle = {};
  for (const a of accessories) {
    byMuscle[a.muscle_group] = byMuscle[a.muscle_group] || [];
    byMuscle[a.muscle_group].push(a);
  }
  for (const m of muscles) {
    if (chosen.length >= perDaySlots) break;
    const pick = (byMuscle[m] || []).find((a) => !chosen.includes(a));
    if (pick) chosen.push(pick);
  }
  for (const m of priorities) {
    if (chosen.length >= perDaySlots) break;
    if (!muscles.includes(m)) continue;
    const extra = (byMuscle[m] || []).find((a) => !chosen.includes(a));
    if (extra) chosen.push(extra);
  }
  return chosen;
}

export function generateProgram({ daysPerWeek, equipment, priorities = [], dislikedIds = [], experience = "intermediate" }, exerciseLibrary) {
  const split = SPLITS[daysPerWeek] || SPLITS[3];
  const equipmentFiltered = exerciseLibrary.filter((e) => e.equipment_type === equipment || equipment === "custom" || e.equipment_type === "bodyweight");
  const library = equipmentFiltered.length >= 8 ? equipmentFiltered : exerciseLibrary; // fall back if the filter is too narrow

  const setsForExperience = experience === "beginner" ? 2 : experience === "advanced" ? 4 : 3;

  const days = split.map((day) => {
    const exercises = pickExercisesForDay(day.muscles, library, { priorities, dislikedIds });
    return {
      label: day.label,
      exercises: exercises.map((ex) => ({
        exercise: ex,
        target_sets: ex.progression_method === "reverse_pyramid" ? 3 : setsForExperience,
        target_reps_low: ex.rep_range_low,
        target_reps_high: ex.rep_range_high,
        rest_seconds: ex.rest_seconds,
      })),
    };
  });

  return {
    splitName: split.map((d) => d.label).join(" / "),
    daysPerWeek,
    blockLengthWeeks: 9,
    days,
    reasons: buildReasons({ daysPerWeek, priorities }),
  };
}

function buildReasons({ daysPerWeek, priorities }) {
  const reasons = [
    { title: `${daysPerWeek} training days`, body: "Allows hard training with sufficient recovery between sessions." },
    { title: "Stable exercises", body: "Exercises stay consistent through the training block so progressive overload can actually be measured." },
    { title: "Balanced movement patterns", body: "The program includes pressing, pulling, and both knee- and hip-dominant lower body work." },
    { title: "Progressive overload", body: "EZfit builds every session's targets from your last comparable performance automatically." },
  ];
  if (priorities.length) {
    reasons.splice(1, 0, { title: `Prioritizing ${priorities.join(", ")}`, body: "Extra volume added within sensible limits — the program stays balanced overall." });
  }
  return reasons;
}
