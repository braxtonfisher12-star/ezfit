const CHECK = "M5 13l4 4L19 7";
const EYE = "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 15a3 3 0 100-6 3 3 0 000 6z";
const WARNING = "M12 3l9 16H3l9-16z M12 10v4 M12 17h.01";
const FUEL = "M5 21h9a2 2 0 002-2V5.5L13 3H7a2 2 0 00-2 2v16z M16 8l2.5 2.5a1.5 1.5 0 01.5 1.1V17a1.5 1.5 0 01-3 0";
const MINUS = "M6 12h12";
const QUESTION = "M9 9a3 3 0 116 0c0 2-3 2-3 5 M12 17h.01";

export const STATE_META = {
  green:  { tone: "green", label: "On track", icon: CHECK, gradient: "linear-gradient(135deg, #3E8F5C 0%, #4FAF74 100%)" },
  yellow: { tone: "amber", label: "Watching", icon: EYE, gradient: "linear-gradient(135deg, #C6862A 0%, #DDA24C 100%)" },
  orange: { tone: "amber", label: "Adherence first", icon: WARNING, gradient: "linear-gradient(135deg, #C6862A 0%, #DDA24C 100%)" },
  blue:   { tone: "blue",  label: "Consider more fuel", icon: FUEL, gradient: "linear-gradient(135deg, #2B4CFF 0%, #4A63FF 100%)" },
  purple: { tone: "blue",  label: "Small adjustment", icon: MINUS, gradient: "linear-gradient(135deg, #7B5FD1 0%, #9B7FE8 100%)" },
  gray:   { tone: "gray",  label: "Need more data", icon: QUESTION, gradient: "linear-gradient(135deg, #6C7078 0%, #8B8F97 100%)" },
};

export function stateDirection(state) {
  if (state === "blue") return "increase";
  if (state === "purple") return "decrease";
  return "maintain";
}
