// Rest-timer motivational quotes. Rotated randomly each time a rest period
// starts (spec request: "every time you get a different motivational quote").
export const REST_QUOTES = [
  "The set you don't want to do is the one that changes you.",
  "Discipline is choosing between what you want now and what you want most.",
  "Nobody cares. Work harder.",
  "You don't get what you wish for. You get what you work for.",
  "The last rep is the only one that counts.",
  "Motivation gets you started. Discipline keeps you going.",
  "Progress is progress, no matter how small.",
  "Your only competition is who you were yesterday.",
  "Comfort is the enemy of progress.",
  "Show up even when you don't feel like it — especially then.",
  "Strength doesn't come from what you can do. It comes from overcoming what you couldn't.",
  "One more rep than you think you have.",
  "The body achieves what the mind believes.",
  "Consistency beats intensity over time.",
  "Hard work in silence. Let the results make the noise.",
];

export function randomQuote() {
  return REST_QUOTES[Math.floor(Math.random() * REST_QUOTES.length)];
}
