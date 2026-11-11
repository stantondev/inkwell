// Prompts for a new writer's first entry. Offered on the last screen of
// onboarding and shown in the editor as a card above the page
// (/editor?prompt=welcome&n=<index>), never as text inside the entry: the
// first version put the instructions into the body, so the writer had to
// delete them before writing, and at least one first entry was published
// with them still in it.
//
// The order is stable because links use the index.

export interface FirstEntryPrompt {
  title: string;
  prompt: string;
}

export const FIRST_ENTRY_PROMPTS: FirstEntryPrompt[] = [
  {
    title: "Hello, Inkwell",
    prompt: "Introduce yourself. What brings you here, and what do you think you'll write about?",
  },
  {
    title: "What I'm reading right now",
    prompt: "What's on your nightstand, your screen, or stuck in your head? Why does it matter to you?",
  },
  {
    title: "A letter to my future self",
    prompt: "Write to the person you'll be in a year. What do you want to remember about today?",
  },
  {
    title: "The story behind my name",
    prompt: "Every name has a story. Why did you pick yours? Is there a memory or a joke behind it?",
  },
  {
    title: "Today, in a few lines",
    prompt: "What happened today, however small? Where were you, and what stayed with you?",
  },
];

/** The prompt for `?n=`, or a random one when it's missing or out of range. */
export function firstEntryPrompt(n: number | null): { index: number; prompt: FirstEntryPrompt } {
  const valid = n !== null && Number.isInteger(n) && n >= 0 && n < FIRST_ENTRY_PROMPTS.length;
  const index = valid ? n : Math.floor(Math.random() * FIRST_ENTRY_PROMPTS.length);
  return { index, prompt: FIRST_ENTRY_PROMPTS[index] };
}
