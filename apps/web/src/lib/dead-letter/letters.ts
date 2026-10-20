// The letters that pass through the Dead Letter Office.
//
// Every letter is in the public domain. The text is quoted exactly from the
// cited transcription, original spelling and all; "…" marks a cut. Words the
// editors restored where the original is damaged are given as they read them.
// Everything else (cards, clues, stories) is written for Inkwell and must be
// checked against a reliable source before it ships.

import type { Blot } from "./blots";

export interface Choice {
  id: string;
  name: string;
  note?: string;
}

export interface DeadLetter {
  id: string;
  /** 0 = Monday. */
  day: number;
  /** Shown once it's delivered: where and when it was written. */
  writtenAt: string;
  /** Where it was going: the second line of the envelope. */
  deliverTo: string;
  salutation: string;
  /** Paragraphs. {{id}} is a blot to read back, [[Name]] a name the water took. */
  body: string[];
  /** Closing lines, right-aligned. */
  signoff: string[];
  postscript?: string;
  blots: Blot[];
  /** Wrong guesses allowed across every blot. */
  ink: number;
  to: { question: string; answer: string; cards: Choice[] };
  when: { question: string; answer: string; options: Choice[] };
  /** Added to the week's file once delivered. */
  clue: string;
  story: string[];
  /** The fuller history shown after delivery. Written without the writer's name. */
  history?: {
    /** What was going on in the world and in his life. */
    context: string[];
    /** The people, places and animals the letter mentions. */
    people: { name: string; note: string }[];
    /** What became of them. */
    afterwards: string[];
  };
  notes: { term: string; note: string }[];
  /** The year on the office stamp you keep. */
  keepsake: string;
  /** `textUrl`: plain text of the edition, which the source checker downloads to confirm every quoted line. */
  source: { title: string; url: string; textUrl?: string };
  /** Some words in the original were damaged and restored by its editors. */
  restored?: boolean;
}

const FOUNDERS = "Founders Online, National Archives (text from The Papers of Alexander Hamilton)";

export const HAMILTON_WEEK_LETTERS: DeadLetter[] = [
  {
    id: "hamilton-stevens-1769",
    day: 0,
    writtenAt: "St. Croix, 11 November 1769",
    deliverTo: "New York",
    salutation: "Dear [[Edward]]",
    body: [
      "This just serves to acknowledge receipt of yours per Cap Lowndes which was delivered me Yesterday. The truth of Cap Lightbourn & Lowndes information is now verifyd by the Presence of your Father and Sister for whose safe arrival I Pray … As to what you say respecting your having soon the happiness of seeing us all, I wish, for an accomplishment of your hopes provided they are Concomitant with your welfare, otherwise not, tho doubt whether I shall be Present or not for to confess my weakness, [[Ned]], my {{ambition}} is prevalent that I contemn the grov’ling and condition of a {{clerk}} or the like, to which my Fortune &c. condemns me and would willingly risk my life tho’ not my Character to exalt my Station.",
      "Im confident, [[Ned]] that my Youth excludes me from any hopes of immediate Preferment nor do I desire it, but I mean to prepare the way for futurity. Im no Philosopher you see and may be jusly said to Build {{castles}} in the Air. My Folly makes me ashamd and beg youll Conceal it, yet [[Neddy]] we have seen such Schemes successfull when the Projector is Constant I shall Conclude saying I wish there was a {{war}}.",
    ],
    signoff: ["I am Dr [[Edward]] Yours", "A[[!lex Hamilton]]"],
    postscript:
      "PS I this moment receivd yours by William Smith and am pleasd to see you Give such Close Application to Study.",
    blots: [
      { id: "ambition", word: "Ambition", survive: [0, 3, 6], decoys: ["Patience", "Courage"] },
      { id: "clerk", word: "Clerk", survive: [0, 4], decoys: ["Sailor", "Planter"] },
      { id: "castles", word: "Castles", survive: [0, 6], decoys: ["Bridges", "Houses"] },
      { id: "war", word: "War", survive: [0], decoys: ["Storm", "Ship"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "edward-stevens",
      cards: [
        { id: "thomas-stevens", name: "Thomas Stevens", note: "A merchant on St. Croix, with a son and a daughter." },
        { id: "edward-stevens", name: "Edward Stevens", note: "A boyhood friend from St. Croix, gone to New York to study." },
        { id: "nicholas-cruger", name: "Nicholas Cruger", note: "A New York merchant whose trading house on St. Croix kept clerks." },
        { id: "hugh-knox", name: "Hugh Knox", note: "A Presbyterian minister who came to St. Croix in 1772." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1769",
      options: [
        { id: "1769", name: "1769" },
        { id: "1776", name: "1776" },
        { id: "1787", name: "1787" },
        { id: "1798", name: "1798" },
      ],
    },
    clue: "As a boy he clerked for a trading house on St. Croix, in the Danish West Indies.",
    story: [
      "He was twelve or fourteen (nobody is sure of his birth year), clerking for merchants on St. Croix. Ned had gone to New York to study. Within a few years he followed him there, and in 1775 he got his war.",
    ],
    notes: [
      { term: "Castles in the Air", note: "daydreams; schemes with nothing under them." },
      { term: "Preferment", note: "promotion to a better post." },
    ],
    keepsake: "1769",
    source: { title: FOUNDERS, url: "https://founders.archives.gov/documents/Hamilton/01-01-02-0002" },
  },
  {
    id: "hamilton-laurens-1779",
    day: 1,
    writtenAt: "Middlebrook, New Jersey, April 1779",
    deliverTo: "South Carolina",
    salutation: "",
    body: [
      "Cold in my professions, warm in my friendships, I wish, my Dear [[Laurens]], it might be in my power, by action rather than words, to convince you that I love you. I shall only tell you that ’till you bade us Adieu, I hardly knew the value you had taught my heart to set upon you. … You should not have taken advantage of my sensibility to steal into my {{affections}} without my consent.",
      "And Now my Dear as we are upon the subject of wife, I empower and command you to get me one in {{carolina}}. … Take her description—She must be young, handsome (I lay most stress upon a good shape) sensible (a little learning will do), well bred (but she must have an aversion to the word ton) chaste and tender (I am an enthusiast in my notions of fidelity and fondness) … In politics, I am indifferent what side she may be of; I think I have arguments that will easily convert her to mine. … In drawing my picture, you will no doubt be civil to your friend; mind you do justice to the length of my {{nose}} …",
    ],
    signoff: ["Yours.", "A [[!Hamilton]]"],
    postscript:
      "P.S … All the family send their love. In this join the General & Mrs. {{washington}} & what is best, tis not in the stile of ceremony but sincerity.",
    blots: [
      { id: "affections", word: "affections", survive: [0, 4, 8], decoys: ["service", "regiment"] },
      { id: "carolina", word: "Carolina", survive: [0, 5], decoys: ["Virginia", "Boston"] },
      { id: "nose", word: "nose", survive: [0], decoys: ["sword", "temper"] },
      { id: "washington", word: "Washington", survive: [0, 4], decoys: ["Knox", "Greene"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "john-laurens",
      cards: [
        { id: "lafayette", name: "Marquis de Lafayette", note: "A French volunteer on the General’s side. Sailed home to France in January 1779." },
        { id: "james-mchenry", name: "James McHenry", note: "Irish-born doctor; joined the General’s staff as a secretary in 1778." },
        { id: "john-laurens", name: "John Laurens", note: "Aide to the General. Went home to South Carolina in 1779 to raise a battalion." },
        { id: "elizabeth-schuyler", name: "Elizabeth Schuyler", note: "Daughter of General Philip Schuyler of Albany." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1779",
      options: [
        { id: "1769", name: "1769" },
        { id: "1779", name: "1779" },
        { id: "1791", name: "1791" },
        { id: "1804", name: "1804" },
      ],
    },
    clue: "In 1779 he was an aide-de-camp on George Washington’s staff.",
    story: [
      "Laurens had gone home to South Carolina hoping to raise battalions of enslaved men who would be freed for fighting. The plan failed. He was killed in a skirmish in August 1782, and his friend took the loss hard.",
      "The wife he asked Laurens to find, he found himself the next winter.",
    ],
    notes: [{ term: "ton", note: "fashionable society; high style." }],
    keepsake: "1779",
    source: { title: FOUNDERS, url: "https://founders.archives.gov/documents/Hamilton/01-02-02-0100" },
    restored: true,
  },
  {
    id: "hamilton-schuyler-1780",
    day: 2,
    writtenAt: "Dobbs Ferry, New York, 8 August 1780",
    deliverTo: "Albany",
    salutation: "",
    body: [
      "Immediately after dinner, I stole from a croud of company to a solitary walk to be at leisure to think of you, and I have just returned to tell you by an express this moment going off that I have been doing so. You are certainly a little {{sorceress}} and have bewitched me, for you have made me disrelish every thing that used to please me, and have rendered me as restless and unsatisfied with all about me, as if I was the inhabitant of another world, and had nothing in common with this. … But why do you not write to me oftener? It is again an age since I have heard from you. I write you at least {{three}} letters for your one, though I am immersed in public business and you have nothing to do but to think of me. When I come to {{albany}}, I shall find means to take satisfaction for your neglect.",
      "I wrote you a long letter by your father. … I would go on but the {{general}} summons me to ride. Adieu My Dear lovely amiable girl. Heaven preserve you and shower its choicest blessings upon you. Love me I conjure you.",
    ],
    signoff: ["A [[!Hamilton]]"],
    blots: [
      { id: "sorceress", word: "sorceress", survive: [0, 5], decoys: ["tyrant", "stranger"] },
      { id: "three", word: "three", survive: [0], decoys: ["ten", "two"] },
      { id: "albany", word: "Albany", survive: [0, 3], decoys: ["Philadelphia", "Boston"] },
      { id: "general", word: "General", survive: [0, 3], decoys: ["Colonel", "Marquis"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "elizabeth-schuyler",
      cards: [
        { id: "martha-washington", name: "Martha Washington", note: "The General’s wife, often with him at winter camp." },
        { id: "catharine-livingston", name: "Catharine Livingston", note: "Daughter of New Jersey’s governor; he wrote her playful letters in 1777." },
        { id: "angelica-church", name: "Angelica Church", note: "Eldest of the Schuyler sisters; eloped with John Barker Church in 1777." },
        { id: "elizabeth-schuyler", name: "Elizabeth Schuyler", note: "Lives in Albany with her father, General Philip Schuyler." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1780",
      options: [
        { id: "1772", name: "1772" },
        { id: "1780", name: "1780" },
        { id: "1795", name: "1795" },
        { id: "1802", name: "1802" },
      ],
    },
    clue: "He married Elizabeth Schuyler, of Albany, in December 1780.",
    story: [
      "Written at Dobbs Ferry on the Hudson, where the army was camped. Elizabeth was at home in Albany. They were married there that December.",
    ],
    notes: [{ term: "express", note: "a rider carrying urgent letters." }],
    keepsake: "1780",
    source: { title: FOUNDERS, url: "https://founders.archives.gov/documents/Hamilton/01-02-02-0808" },
  },
  {
    id: "hamilton-philip-1791",
    day: 3,
    writtenAt: "Philadelphia, 5 December 1791",
    deliverTo: "Trenton, New Jersey",
    salutation: "",
    body: [
      "I received with great pleasure My Dear [[Philip]] the letter which you wrote me last week. Your Mama and myself were very happy to learn that you are pleased with your situation and content to stay as long as shall be thought for your good. …",
      "Your Master also informs me that you recited a {{lesson}} the first day you began, very much to his satisfaction. … Your Mama has got an {{ovid}} for you and is looking up your Mairs introduction. …",
      "You remember that I engaged to send for you next Saturday and I will do it, unless you request me to put it off. For a {{promise}} must never be broken; and I never will make you one, which I will not fulfil as far as I am able. But it has occurred to me that the {{christmas}} holidays are near at hand, and I suppose your school will then break up for some days … But determine as you like best and let me know what will be most pleasing to you.",
    ],
    signoff: ["A good night to my darling son.   Adieu", "A [[!Hamilton]]"],
    blots: [
      { id: "lesson", word: "lesson", survive: [0, 3], decoys: ["psalm", "poem"] },
      { id: "ovid", word: "Ovid", survive: [0], decoys: ["Bible", "Euclid"] },
      { id: "promise", word: "promise", survive: [0, 4], decoys: ["letter", "debt"] },
      { id: "christmas", word: "Christmas", survive: [0, 5], decoys: ["Easter", "summer"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "philip",
      cards: [
        { id: "angelica", name: "Angelica", note: "His eldest daughter, born 1784." },
        { id: "james", name: "James", note: "His third son, born 1788." },
        { id: "philip", name: "Philip", note: "His eldest son, born 1782." },
        { id: "alexander", name: "Alexander", note: "His second son, born 1786." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1791",
      options: [
        { id: "1782", name: "1782" },
        { id: "1791", name: "1791" },
        { id: "1799", name: "1799" },
        { id: "1804", name: "1804" },
      ],
    },
    clue: "In 1791 he was the first Secretary of the Treasury, living in Philadelphia.",
    story: [
      "Philip was nine and had just started at a boarding school in Trenton. His father wrote from Philadelphia, then the capital, where he was running the Treasury.",
    ],
    notes: [
      { term: "Ovid", note: "the Roman poet; a standard Latin text at school." },
      { term: "Mairs introduction", note: "John Mair’s Introduction to Latin Syntax, a schoolbook." },
    ],
    keepsake: "1791",
    source: { title: FOUNDERS, url: "https://founders.archives.gov/documents/Hamilton/01-09-02-0419" },
  },
  {
    id: "hamilton-eliza-1804",
    day: 4,
    writtenAt: "New York, 4 July 1804",
    deliverTo: "New York",
    salutation: "",
    body: [
      "This letter, my very dear [[Eliza]], will not be delivered to you, unless I shall first have terminated my {{earthly}} career; to begin, as I humbly hope from redeeming grace and divine mercy, a happy immortality.",
      "If it had been possible for me to have avoided the {{interview}}, my love for you and my precious children would have been alone a decisive motive. But it was not possible, without sacrifices which would have rendered me unworthy of your esteem. I need not tell you of the pangs I feel, from the idea of quitting you and exposing you to the anguish which I know you would feel. Nor could I dwell on the topic lest it should unman me.",
      "The consolations of {{religion}}, my beloved, can alone support you; and these you have a right to enjoy. Fly to the bosom of your God and be comforted. With my last idea; I shall cherish the sweet hope of meeting you in a better world.",
      "Adieu best of {{wives}} and best of Women. Embrace all my darling Children for me.",
    ],
    signoff: ["Ever yours", "A [[!H]]"],
    blots: [
      { id: "earthly", word: "earthly", survive: [0, 4], decoys: ["military", "legal"] },
      { id: "interview", word: "interview", survive: [0, 5], decoys: ["voyage", "journey"] },
      { id: "religion", word: "Religion", survive: [0, 4], decoys: ["friendship", "family"] },
      { id: "wives", word: "wives", survive: [0], decoys: ["friends", "mothers"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "eliza",
      cards: [
        { id: "nathaniel-pendleton", name: "Nathaniel Pendleton", note: "A lawyer and old friend, who agreed to be his second." },
        { id: "eliza", name: "Eliza", note: "His wife, born Elizabeth Schuyler." },
        { id: "philip-1801", name: "Philip", note: "His eldest son, killed in a duel in 1801." },
        { id: "angelica-1804", name: "Angelica Church", note: "His sister-in-law, back in New York since 1797." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1804",
      options: [
        { id: "1781", name: "1781" },
        { id: "1797", name: "1797" },
        { id: "1801", name: "1801" },
        { id: "1804", name: "1804" },
      ],
    },
    clue: "He was shot in a duel at Weehawken, New Jersey, on 11 July 1804, and died the next day.",
    story: [
      "Written a week before he met Aaron Burr at Weehawken, and meant to reach her only if he died. He was shot on 11 July and died the next day. Philip had been killed in a duel at Weehawken too, three years before.",
      "Eliza lived another fifty years.",
    ],
    notes: [{ term: "interview", note: "the polite word for a duel." }],
    keepsake: "1804",
    source: { title: FOUNDERS, url: "https://founders.archives.gov/documents/Hamilton/01-26-02-0001-0248" },
  },
];
