export function computeBlockWeek(startDateStr, lengthWeeks) {
  const start = new Date(startDateStr + "T00:00:00");
  const now = new Date();
  const diffDays = Math.floor((now - start) / 86400000);
  const rawWeek = Math.floor(diffDays / 7) + 1;
  return {
    week: Math.min(Math.max(rawWeek, 1), lengthWeeks),
    rawWeek,
    isComplete: rawWeek > lengthWeeks,
  };
}
