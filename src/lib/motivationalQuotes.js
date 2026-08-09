export const MOTIVATIONAL_QUOTES = [
  { quote: "The successful warrior is the average man, with laser-like focus.", author: "Bruce Lee" },
  { quote: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
  { quote: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { quote: "The pain you feel today will be the strength you feel tomorrow.", author: "Arnold Schwarzenegger" },
  { quote: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { quote: "Well done is better than well said.", author: "Benjamin Franklin" },
  { quote: "The body achieves what the mind believes.", author: "Napoleon Hill" },
  { quote: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { quote: "You are never too old to set another goal or dream a new dream.", author: "C.S. Lewis" },
  { quote: "Motivation gets you going, but discipline keeps you growing.", author: "John C. Maxwell" },
  { quote: "The only bad workout is the one that didn't happen.", author: "Anonymous" },
  { quote: "Push yourself, because no one else is going to do it for you.", author: "Anonymous" },
];

export function randomMotivationalQuote() {
  return MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
}
