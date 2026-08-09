// Week = Sunday..Saturday, matching workout_day_assignments.day_of_week (0-6).
export function getWeekDates(anchor = new Date()) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // back up to Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export function dayLabel(d) {
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

// 5am - 12am (midnight), one slot per hour, 20 slots total.
export const HOUR_SLOTS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

export function formatHourSlot(hour) {
  const h = hour === 24 ? 0 : hour;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display} ${period}`;
}

export function slotKey(hour) {
  return `${String(hour % 24).padStart(2, "0")}:00`;
}
