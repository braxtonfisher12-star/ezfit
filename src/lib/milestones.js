export const MILESTONES = [
  { key: "lost_5", label: "Lost 5 lb", check: (j) => j.totalChangeLb <= -5 },
  { key: "lost_10", label: "Lost 10 lb", check: (j) => j.totalChangeLb <= -10 },
  { key: "lost_25", label: "Lost 25 lb", check: (j) => j.totalChangeLb <= -25 },
  { key: "gained_5", label: "Gained 5 lb", check: (j) => j.totalChangeLb >= 5 },
  { key: "gained_10", label: "Gained 10 lb", check: (j) => j.totalChangeLb >= 10 },
  { key: "overload_50", label: "+50 lb lifetime overload", check: (j) => j.totalOverloadLb >= 50 },
  { key: "overload_100", label: "+100 lb lifetime overload", check: (j) => j.totalOverloadLb >= 100 },
  { key: "overload_250", label: "+250 lb lifetime overload", check: (j) => j.totalOverloadLb >= 250 },
  { key: "streak_7", label: "7-day streak", check: (j) => j.longestStreak >= 7 },
  { key: "streak_30", label: "30-day streak", check: (j) => j.longestStreak >= 30 },
  { key: "weeks_4", label: "4 weeks trained", check: (j) => j.weeksTrained >= 4 },
  { key: "weeks_12", label: "12 weeks trained", check: (j) => j.weeksTrained >= 12 },
];

export function checkNewMilestones(journey, alreadyAchievedKeys) {
  return MILESTONES.filter((m) => !alreadyAchievedKeys.includes(m.key) && m.check(journey));
}
