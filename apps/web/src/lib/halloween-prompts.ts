/**
 * The treats in the trick-or-treat pumpkin: writing prompts for the season.
 * Spooky the way a ghost story by the fire is, not gory. The editor opens
 * one with `/editor?prompt=halloween&n=<index>`; keep the order stable so a
 * link someone shared opens the same prompt.
 */

export interface SeasonPrompt {
  title: string;
  /** One or two sentences, shown on the treat and as the entry's opening line. */
  body: string;
}

export const HALLOWEEN_PROMPTS: SeasonPrompt[] = [
  { title: "The house at the end of the street", body: "Every town has one. Describe yours: who lived there, what you heard about it, and whether you ever went up to the door." },
  { title: "My best costume", body: "Which costume do you still think about? Who made it, what went wrong, and who did people think you were?" },
  { title: "The scariest thing I believed as a child", body: "What did you know for certain was under the bed, in the closet, or at the bottom of the lake? When did you stop believing it, if you have?" },
  { title: "A letter to my ghost", body: "Imagine the ghost who will one day haunt your favourite room. What do you want them to know about the place?" },
  { title: "The night I couldn't sleep", body: "Write about a night when every creak meant something. What did you hear, and what was it really?" },
  { title: "Candy, ranked", body: "Rank the candy of your childhood, from the one you traded away first to the one you hid from your siblings. Defend your choices." },
  { title: "Something I can't explain", body: "Tell the story of the one thing that happened to you that still doesn't add up." },
  { title: "Things that go bump", body: "List every sound in your home after midnight. Give each one a name and a personality." },
  { title: "The last leaf", body: "Write from the point of view of the last leaf on a tree in late October." },
  { title: "Who I was afraid of", body: "Was there a neighbour, a teacher, or a relative who frightened you? Write about them now, with the eyes you have today." },
  { title: "A haunted object", body: "Choose something you own that has outlived its first owner. Where has it been, and what does it remember?" },
  { title: "Porch light on", body: "Describe Halloween from the other side of the door: the knock, the faces, the costume that made you laugh." },
  { title: "My favourite scary story", body: "What story, book or film still gets under your skin? Retell the moment it got you, and why." },
  { title: "The ghost who stayed for tea", body: "A polite ghost moves in and asks to stay through the winter. Write the first conversation." },
  { title: "October, in five senses", body: "What does this October look, sound, smell, taste and feel like where you are?" },
  { title: "A thing I'm finally done being afraid of", body: "Write about a fear you've outgrown, and the day you noticed it was gone." },
  { title: "The map of my neighbourhood, after dark", body: "Draw it in words: the safe streets, the shortcut nobody takes, the tree that looks like a hand." },
  { title: "Carving the pumpkin", body: "Who held the knife, who scooped the seeds, and whose face did the pumpkin end up looking like?" },
  { title: "If my house could talk", body: "Let the house you grew up in tell one story about you that you'd rather it didn't." },
  { title: "The monster's side of it", body: "Pick a classic monster and let them write their diary entry for Halloween night." },
  { title: "Dear me, age nine", body: "Write to yourself on a Halloween long ago. What would you warn them about, and what would you tell them to enjoy?" },
  { title: "A small, true ghost story", body: "Not a legend: something that happened to you or someone you love. Keep it short and keep it true." },
  { title: "The door I never opened", body: "A cellar, an attic, a box, a letter. What did you leave closed, and what do you think was on the other side?" },
  { title: "Lanterns", body: "Write about a light you remember in the dark: a porch, a candle, a window across the street." },
];

export function halloweenPrompt(n: number): SeasonPrompt | null {
  return Number.isInteger(n) && n >= 0 && n < HALLOWEEN_PROMPTS.length ? HALLOWEEN_PROMPTS[n] : null;
}
