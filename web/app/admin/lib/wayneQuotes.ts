/**
 * Ephermal Admin — Bruce Wayne-flavored greeting for the Overview page.
 *
 * Original lines only (no lifted movie dialogue) — billionaire-by-day,
 * builder-by-night in spirit, tuned to the actual admin doing actual
 * founder work at whatever hour they're checking this panel.
 */

const WAYNE_QUOTES: string[] = [
  "The SVJ doesn't finance itself.",
  "Gotham didn't rebuild itself either — same energy.",
  "Fund the mission by day, run it by night. You're doing both at once.",
  "Alfred isn't making the coffee today. That's on you.",
  "Nobody looks twice at someone who ships at 2am. That's the point.",
  "Wayne Enterprises wasn't built on 9-to-5.",
  "The cave doesn't build itself. Neither does the roadmap.",
  "Behind every good cover story is a better balance sheet.",
  "The Batmobile needed R&D too. This is yours.",
  "You don't need a bat-signal. You need better ROAS.",
  "Every origin story starts with someone ignoring their inbox to build something real.",
  "Fortune funds the mission. Discipline funds the fortune.",
  "The mask is optional. The grind isn't.",
  "Nobody hands you a Batcave. You build it, quarter by quarter.",
  "SF90 in the garage, admin panel open. Priorities.",
  "The billionaire hours are the ones nobody sees.",
  "Gotham's a metaphor. The metrics are real.",
  "Even an empire started as one person and a spreadsheet.",
  "You're not late. Some nights Gotham waits.",
  "Great fortunes fund great crusades. Check the MRR first.",
  "Patrol the dashboard before you patrol the city.",
  "It's not the cape that scales the business. It's showing up again tomorrow.",
];

const TIME_GREETINGS: { maxHour: number; text: string }[] = [
  { maxHour: 5,  text: 'Still up' },
  { maxHour: 12, text: 'Good morning' },
  { maxHour: 18, text: 'Good afternoon' },
  { maxHour: 24, text: 'Good evening' },
];

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getWayneGreeting(firstName?: string | null): { greeting: string; quote: string } {
  const hour = new Date().getHours();
  const bucket = TIME_GREETINGS.find(t => hour < t.maxHour) ?? TIME_GREETINGS[TIME_GREETINGS.length - 1];
  const greeting = firstName ? `${bucket.text}, ${firstName}.` : `${bucket.text}.`;
  const seed = (firstName ?? 'admin').trim().toLowerCase();
  const quote = WAYNE_QUOTES[hashString(seed) % WAYNE_QUOTES.length];
  return { greeting, quote };
}
