// Week 2: Abraham Lincoln, 1837–1862. Drafted by Claude on 2026-10-19,
// approved by Stanton on 2026-10-20.
//
// Text from The Papers and Writings of Abraham Lincoln, Complete, ed. Arthur
// Brooks Lapsley (Project Gutenberg #3253), public domain. Every quoted line is
// checked against it by `npm run check:letters`. "…" marks a cut.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const SOURCE = {
  title: "The Papers and Writings of Abraham Lincoln, ed. Arthur Brooks Lapsley (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/3253",
  textUrl: "https://www.gutenberg.org/cache/epub/3253/pg3253.txt",
};

export const LINCOLN_WEEK_LETTERS: DeadLetter[] = [
  {
    id: "lincoln-owens-1837",
    day: 0,
    writtenAt: "Springfield, Illinois, 16 August 1837",
    deliverTo: "New Salem, Illinois",
    salutation: "Friend [[Mary]]:",
    body: [
      "You will no doubt think it rather strange that I should write you a letter on the same day on which we parted, and I can only account for it by supposing that seeing you lately makes me think of you more than usual; while at our late meeting we had but few expressions of thoughts. You must know that I cannot see you, or think of you, with entire indifference; and yet it may be that you are mistaken in regard to what my real feelings toward you are.",
      "I want in all cases to do right; and most particularly so in all cases with {{women}}.",
      "I want, at this particular time, more than any thing else to do right with you; and if I knew it would be doing right, as I rather suspect it would, to let you alone I would do it. And, for the purpose of making the matter as plain as possible, I now say that you can drop the subject, dismiss your thoughts (if you ever had any) from me for ever and leave this {{letter}} unanswered without calling forth one accusing murmur from me. … If you feel yourself in any degree bound to me, I am now willing to release you, provided you wish it; while on the other hand I am willing and even anxious to bind you faster if I can be convinced that it will, in any considerable degree, add to your happiness. This, indeed, is the whole question with me. Nothing would make me more {{miserable}} than to believe you miserable, nothing more happy than to know you were so.",
      "If it suits you best not to answer this, {{farewell}}. A long life and a merry one attend you. But, if you conclude to write back, speak as plainly as I do. … My respects to your sister.",
    ],
    signoff: ["Your friend, [[!Lincoln]]."],
    blots: [
      { id: "women", word: "women", survive: [0, 4], decoys: ["horses", "debts"] },
      { id: "letter", word: "letter", survive: [0, 5], decoys: ["town", "house"] },
      { id: "miserable", word: "miserable", survive: [0, 4, 8], decoys: ["hungry", "famous"] },
      { id: "farewell", word: "farewell", survive: [0, 4], decoys: ["hurrah", "tomorrow"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "mary",
      cards: [
        { id: "speed", name: "Joshua Speed", note: "His closest friend, a Springfield storekeeper who shared his room." },
        { id: "mary", name: "Mary Owens", note: "A Kentucky woman he had been courting, visiting her sister near New Salem." },
        { id: "sarah", name: "Sarah", note: "His stepmother, on the family farm in Coles County." },
        { id: "elizabeth", name: "Elizabeth Abell", note: "A married woman in New Salem who had taken him in as a friend." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1837",
      options: [
        { id: "1831", name: "1831" },
        { id: "1837", name: "1837" },
        { id: "1846", name: "1846" },
        { id: "1858", name: "1858" },
      ],
    },
    clue: "In 1837 he was 28, a young lawyer and member of the Illinois legislature, just moved to Springfield with everything he owned in two saddlebags.",
    story: [
      "Mary Owens turned him down. He made a joke of it the next year, in a letter to a friend: he had decided never to think of marrying, he wrote, because he could never be satisfied with anyone who would be blockhead enough to have him.",
    ],
    history: {
      context: [
        "He had grown up on frontier farms in Kentucky and Indiana with less than a year of schooling, and came to Illinois at 21. In the village of New Salem he worked as a shopkeeper, postmaster and surveyor, read law books borrowed from a friend, and was elected to the state legislature in 1834.",
        "In April 1837 he moved to Springfield, the new state capital, to practise law. He rode in on a borrowed horse and moved in with Joshua Speed, a storekeeper who offered to share his room over the shop.",
        "Mary Owens had visited her sister in New Salem a few years before. She came back in 1836, and he courted her, half-heartedly and by letter. Both had doubts. This letter, written the day they parted, offers her a way out.",
      ],
      people: [
        { name: "Mary Owens", note: "From a well-off Kentucky family, educated and lively, about a year older than him." },
        { name: "her sister", note: "Elizabeth Abell, who lived near New Salem and had first suggested the match." },
      ],
      afterwards: [
        "Mary Owens went home to Kentucky. In 1841 she married Jesse Vineyard and moved to Missouri. Asked about him years later, she said he was a good man but “deficient in those little links which make up the chain of woman’s happiness”.",
        "Five years after this letter he married Mary Todd of Lexington, Kentucky, whom he met at a Springfield party.",
      ],
    },
    notes: [
      { term: "late meeting", note: "our recent meeting." },
      { term: "accusing murmur", note: "a word of complaint." },
    ],
    keepsake: "1837",
    source: SOURCE,
  },
  {
    id: "lincoln-johnston-1848",
    day: 1,
    writtenAt: "Washington, D.C., 24 December 1848",
    deliverTo: "Coles County, Illinois",
    salutation: "Dear [[Johnston]]:",
    body: [
      "Your request for eighty dollars I do not think it best to comply with now. At the various times when I have helped you a little you have said to me, “We can get along very well now”; but in a very short time I find you in the same difficulty again. … You are not {{lazy}}, and still you are an idler. I doubt whether, since I saw you, you have done a good whole day’s work in any one day.",
      "You are now in need of some money; and what I propose is, that you shall go to work, “tooth and {{nail}},” for somebody who will give you money for it. … I now promise you, that for every dollar you will, between this and the first of May, get for your own labor, either in money or as your own indebtedness, I will then give you one other dollar.",
      "You say you would almost give your place in heaven for seventy or eighty dollars. Then you value your place in heaven very {{cheap}}, for I am sure you can, with the offer I make, get the seventy or eighty dollars for four or five months’ work. … {{nonsense}}! If you can’t now live with the land, how will you then live without it? You have always been kind to me, and I do not mean to be unkind to you.",
    ],
    signoff: ["Affectionately your brother,", "[[!A. Lincoln]]."],
    blots: [
      { id: "lazy", word: "lazy", survive: [0], decoys: ["tall", "rich"] },
      { id: "nail", word: "nail", survive: [0], decoys: ["fork", "bone"] },
      { id: "cheap", word: "cheap", survive: [0, 4], decoys: ["dearly", "highly"] },
      { id: "nonsense", word: "Nonsense", survive: [0, 3], decoys: ["Splendid", "Agreed"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "johnston",
      cards: [
        { id: "thomas", name: "Thomas", note: "His father, a farmer in Coles County, Illinois." },
        { id: "johnston", name: "John D. Johnston", note: "His stepbrother, a farmer in Coles County, always short of money." },
        { id: "speed", name: "Joshua Speed", note: "His closest friend, back home in Kentucky." },
        { id: "mary-todd", name: "Mary", note: "His wife, staying with her family in Lexington, Kentucky." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1848",
      options: [
        { id: "1837", name: "1837" },
        { id: "1848", name: "1848" },
        { id: "1856", name: "1856" },
        { id: "1863", name: "1863" },
      ],
    },
    clue: "In 1848 he was in Washington, serving his only term in Congress.",
    story: [
      "He wrote it on Christmas Eve, on the same sheet as a letter to his father, to whom he sent twenty dollars to save the family land from being sold for debt.",
    ],
    history: {
      context: [
        "His mother died when he was nine. A year later his father went back to Kentucky and returned with a widow, Sarah Bush Johnston, and her three children. One of them was John, a year younger than him. The boys grew up together, and he always called John his brother.",
        "By 1848 he was a successful Springfield lawyer, married with two sons, and a member of the House of Representatives in Washington. His father and stepmother lived on a small farm in Coles County, Illinois, and John lived near them. Money was always short, and the letters asking for help usually came to him.",
        "His offer, a dollar for every dollar earned, was a way of helping without paying for the habit he describes.",
      ],
      people: [
        { name: "John D. Johnston", note: "His stepbrother, son of the stepmother he loved." },
        { name: "father", note: "Thomas, a carpenter and farmer, then about seventy." },
        { name: "the land", note: "The family farm in Coles County, which John offered to sign over as security." },
      ],
      afterwards: [
        "Johnston never did get out of debt. In 1851 he wanted to sell up and move to Missouri. That January their father was dying. He did not go to see him, and wrote that if they met now it would be more painful than pleasant.",
        "He took care of his stepmother for the rest of her life, and in January 1861, about to leave for Washington as president-elect, he travelled to Coles County to see her one last time.",
      ],
    },
    notes: [
      { term: "tooth and nail", note: "with all your strength." },
      { term: "indebtedness", note: "money you owe; working it off counts too." },
      { term: "the date", note: "This edition prints the letter as 2 January 1851. The standard edition of his collected works dates it 24 December 1848, from the letter to his father written on the same sheet." },
    ],
    keepsake: "1848",
    source: SOURCE,
  },
  {
    id: "lincoln-bedell-1860",
    day: 2,
    writtenAt: "Springfield, Illinois, 19 October 1860",
    deliverTo: "Westfield, New York",
    salutation: "My dear little Miss:",
    body: [
      "Your very agreeable letter of the 15th is received. I regret the necessity of saying I have no {{daughter}}. I have three sons—one seventeen, one nine, and one seven. They with their {{mother}} constitute my whole family. As to the {{whiskers}}, as I have never worn any, do you not think that people would call it a piece of silly affectation were I to begin wearing them now?",
    ],
    signoff: ["I am your true friend and sincere well-wisher,", "[[!A. Lincoln]]."],
    blots: [
      { id: "daughter", word: "daughter", survive: [0, 5], decoys: ["son", "wife"] },
      { id: "mother", word: "mother", survive: [0, 3], decoys: ["teacher", "uncle"] },
      { id: "whiskers", word: "whiskers", survive: [0, 5], decoys: ["letters", "horses"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "grace",
      cards: [
        { id: "robert", name: "Robert", note: "His eldest son, seventeen, away at school in the East." },
        { id: "grace", name: "Grace Bedell", note: "An eleven-year-old girl in New York State who had written to him." },
        { id: "editor", name: "A newspaper editor", note: "One of the many who wrote to him that autumn." },
        { id: "mary", name: "Mary", note: "His wife, at home in Springfield." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1860",
      options: [
        { id: "1848", name: "1848" },
        { id: "1854", name: "1854" },
        { id: "1860", name: "1860" },
        { id: "1865", name: "1865" },
      ],
    },
    clue: "In October 1860 he was running for president, and had never worn a beard.",
    story: [
      "Grace had written four days earlier. His face was so thin, she said, that he would look far better with whiskers; ladies liked them, and they would tease their husbands into voting for him. Within a month of this reply he had started growing a beard.",
    ],
    history: {
      context: [
        "In May 1860 the new Republican Party chose him as its candidate for president. In those days candidates didn’t travel the country asking for votes, so he stayed at home in Springfield, met visitors in a borrowed office at the state house, and answered a flood of letters.",
        "Most of the country knew him only from pictures, and the pictures weren’t kind: he was long, thin and craggy. Cartoonists drew him as a rail-splitter in a rumpled suit.",
        "Grace Bedell lived in Westfield, in the far west of New York State. Her father had brought home a picture of the candidate, and she decided he needed help.",
      ],
      people: [
        { name: "Grace Bedell", note: "Eleven years old. She had four brothers, and hoped whiskers would win over the ones who weren’t voting for him." },
        { name: "three sons", note: "Robert, seventeen; Willie, nine; and Tad, seven." },
        { name: "their mother", note: "Mary Todd, his wife of almost eighteen years." },
      ],
      afterwards: [
        "He won the election that November, with a beard on the way. In February 1861, on the train to Washington for his inauguration, he stopped at Westfield and asked whether Grace was in the crowd. She was brought to the platform, and he told her he had let his whiskers grow for her, and kissed her.",
        "Grace grew up, married George Billings, a Union veteran, and lived in Delphos, Kansas, until she died in 1936. Westfield has statues of the two of them meeting.",
      ],
    },
    notes: [
      { term: "silly affectation", note: "putting on airs." },
    ],
    keepsake: "1860",
    source: SOURCE,
  },
  {
    id: "lincoln-greeley-1862",
    day: 3,
    writtenAt: "the Executive Mansion, Washington, 22 August 1862",
    deliverTo: "New York City",
    salutation: "Dear Sir:",
    body: [
      "I have just read yours of the 19th, addressed to myself through the New York Tribune. … If there be perceptible in it an impatient and dictatorial tone, I waive it in deference to an old {{friend}}, whose heart I have always supposed to be right.",
      "I would save the Union. I would save it the {{shortest}} way under the Constitution. … If there be those who would not save the Union unless they could at the same time save slavery, I do not agree with them. If there be those who would not save the Union unless they could at the same time destroy slavery, I do not agree with them. My paramount object in this struggle is to save the Union, and is not either to save or destroy slavery.",
      "I shall try to {{correct}} errors when shown to be errors; and I shall adopt new views so fast as they shall appear to be true views. I have here stated my purpose according to my view of official duty, and I intend no modification of my oft expressed personal wish that all men, everywhere, could be {{free}}.",
    ],
    signoff: ["Yours,", "[[!A. Lincoln]]."],
    blots: [
      { id: "friend", word: "friend", survive: [0, 5], decoys: ["enemy", "horse"] },
      { id: "shortest", word: "shortest", survive: [0, 4], decoys: ["longest", "costliest"] },
      { id: "correct", word: "correct", survive: [0, 6], decoys: ["hide", "multiply"] },
      { id: "free", word: "free", survive: [0], decoys: ["rich", "silent"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "greeley",
      cards: [
        { id: "mcclellan", name: "General McClellan", note: "Commander of the Union army in the East." },
        { id: "greeley", name: "Horace Greeley", note: "Editor of the New York Tribune, one of the most widely read newspapers in the country." },
        { id: "davis", name: "Jefferson Davis", note: "President of the Confederate States." },
        { id: "mary", name: "Mary", note: "His wife, in mourning for their son Willie." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1862",
      options: [
        { id: "1850", name: "1850" },
        { id: "1856", name: "1856" },
        { id: "1862", name: "1862" },
        { id: "1868", name: "1868" },
      ],
    },
    clue: "In August 1862 he was sixteen months into a civil war, and had already drafted an order freeing the slaves in the rebel states, which he was keeping quiet.",
    story: [
      "Greeley had attacked him in print, in an open letter called “The Prayer of Twenty Millions”, for being too slow to free the slaves. This answer was printed in a Washington paper the next day and copied all over the North.",
    ],
    history: {
      context: [
        "Eleven Southern states had left the Union to protect slavery, and the war to bring them back was going badly. That summer the Union army had been driven back from the Confederate capital, Richmond, and the casualty lists were growing longer.",
        "Abolitionists wanted him to free the slaves at once. Many Northerners, and the slave states that had stayed loyal (Kentucky, Maryland, Missouri and Delaware), would have been furious. He wanted to keep them in the Union.",
        "Unknown to Greeley, a month earlier he had read his cabinet a draft proclamation freeing the slaves in the rebel states. His secretary of state advised waiting for a victory, so that it wouldn’t look like a cry of despair. The letter was written while he waited.",
      ],
      people: [
        { name: "Horace Greeley", note: "Founder of the New York Tribune, an opponent of slavery, and the man usually credited with “Go West, young man”." },
        { name: "the Union", note: "The United States as one country, which the rebel states had left." },
        { name: "the Constitution", note: "Which he believed let him free slaves only as a war measure." },
      ],
      afterwards: [
        "On 17 September the Union army stopped the Confederate invasion of Maryland at Antietam, the bloodiest single day of the war. Five days later he announced the Emancipation Proclamation. On 1 January 1863 it took effect, and the army began enlisting Black soldiers.",
        "Greeley ran for president against Ulysses S. Grant in 1872, lost badly, and died less than a month after the election.",
      ],
    },
    notes: [
      { term: "controvert", note: "dispute." },
      { term: "paramount object", note: "main aim." },
      { term: "forbear", note: "hold back from doing." },
    ],
    keepsake: "1862",
    source: SOURCE,
  },
  {
    id: "lincoln-mccullough-1862",
    day: 4,
    writtenAt: "the Executive Mansion, Washington, 23 December 1862",
    deliverTo: "Bloomington, Illinois",
    salutation: "Dear [[Fanny]]:",
    body: [
      "It is with deep regret that I learn of the death of your kind and brave father, and especially that it is affecting your young heart beyond what is common in such cases. In this sad world of ours {{sorrow}} comes to all, and to the young it comes with bittered agony because it takes them unawares.",
      "The older have learned ever to expect it. … You cannot now realize that you will ever feel better. Is not this so? And yet it is a mistake. You are sure to be {{happy}} again. … The memory of your dear father, instead of an agony, will yet be a sad, {{sweet}} feeling in your heart, of a purer and holier sort than you have known before.",
      "Please present my kind regards to your afflicted mother.",
    ],
    signoff: ["Your sincere friend,", "[[!A. Lincoln]]."],
    blots: [
      { id: "sorrow", word: "sorrow", survive: [0, 5], decoys: ["summer", "money"] },
      { id: "happy", word: "happy", survive: [0], decoys: ["sorry", "angry"] },
      { id: "sweet", word: "sweet", survive: [0, 4], decoys: ["bitter", "foolish"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "fanny",
      cards: [
        { id: "tad", name: "Tad", note: "His youngest son, nine, at home in the White House." },
        { id: "widow", name: "Mrs. McCullough", note: "A soldier’s widow in Bloomington, Illinois." },
        { id: "fanny", name: "Fanny McCullough", note: "The daughter of an old Illinois friend." },
        { id: "grace", name: "Grace Bedell", note: "The girl who had written to him about whiskers." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1862",
      options: [
        { id: "1858", name: "1858" },
        { id: "1862", name: "1862" },
        { id: "1866", name: "1866" },
        { id: "1870", name: "1870" },
      ],
    },
    clue: "In 1862 he lost a son of his own: Willie, eleven, who died of a fever in the White House that February.",
    story: [
      "Her father, William McCullough, had been the court clerk in Bloomington when he rode the circuit there as a young lawyer. Though he had lost an arm and was nearly blind in one eye, he joined the army at 49, and was killed leading a night charge in Mississippi on 5 December.",
    ],
    history: {
      context: [
        "Before the war he spent months of every year travelling the Eighth Judicial Circuit of Illinois, a dozen or more counties, with the judge and the other lawyers, trying cases in county courthouses. In Bloomington he often stayed with the McCulloughs.",
        "Fanny took the news of her father’s death so hard that she shut herself in her room. A family friend, Judge David Davis, wrote to the White House to ask if a letter might help.",
        "Ten months earlier his own son Willie had died. His wife never recovered from it, and he was sometimes seen weeping alone. When he says he has had experience enough to know, he means it.",
      ],
      people: [
        { name: "her father", note: "Lieutenant Colonel William McCullough of the 4th Illinois Cavalry." },
        { name: "her mother", note: "Mrs. McCullough, now a widow with a family to keep." },
        { name: "David Davis", note: "The judge of the old circuit, a close friend, who asked for the letter." },
      ],
      afterwards: [
        "It is one of the most often quoted letters of comfort in American history, and the line “You are sure to be happy again” is still read at funerals and memorials.",
      ],
    },
    notes: [
      { term: "bittered", note: "so in this edition; the standard edition of his works reads “bitterest”." },
      { term: "alleviation", note: "easing." },
      { term: "afflicted", note: "grieving." },
    ],
    keepsake: "1862",
    source: SOURCE,
  },
];

export const LINCOLN_WEEK: Week = {
  id: "2026-w44-lincoln",
  number: 2,
  status: "approved",
  drafted: { by: "claude", on: "2026-10-19" },
  reviewed: { by: "stanton", on: "2026-10-20" },
  starts: "2026-10-26",
  letters: LINCOLN_WEEK_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["lincoln", "honest abe", "abe"],
    reject: ["mary", "todd", "robert", "willie", "tad"],
    answer: "Abraham Lincoln",
    years: "1809–1865",
    reveal: [
      "The sixteenth president of the United States, from 1861 until he was shot in April 1865. Born in a log cabin in Kentucky, he taught himself law, led the country through the Civil War, and pushed through the amendment that ended slavery in America.",
      "He wrote thousands of letters, and most of them read as plainly as the day he wrote them: he liked short words and said exactly what he meant.",
    ],
    coda: "Five letters, twenty-five years: a shy proposal, a hard word to a brother, a beard, a war, and comfort for a grieving girl.",
  },
  next: "Next week’s bundle comes from across the ocean.",
  timeline: [
    { year: "1809", text: "Born on 12 February in a one-room log cabin in Kentucky." },
    { year: "1818", text: "His mother dies in Indiana. A year later his father marries Sarah Bush Johnston." },
    { year: "1830", text: "The family moves to Illinois. He soon strikes out on his own in New Salem." },
    { year: "1837", text: "Moves to Springfield as a lawyer; writes to Mary Owens.", letters: [0] },
    { year: "1842", text: "Marries Mary Todd." },
    { year: "1848", text: "Serves one term in Congress; Christmas Eve letters home.", letters: [1] },
    { year: "1858", text: "Debates Stephen Douglas across Illinois and becomes famous, though he loses the Senate race." },
    { year: "1860", text: "Elected president; a girl suggests a beard.", letters: [2] },
    { year: "1861", text: "The Civil War begins at Fort Sumter in April." },
    { year: "1862", text: "Willie dies. An answer to Greeley; a letter of comfort to Fanny.", letters: [3, 4] },
    { year: "1863", text: "The Emancipation Proclamation; the Gettysburg Address." },
    { year: "1865", text: "The war ends in April. Five days later he is shot at Ford’s Theatre and dies the next morning, aged 56." },
  ],
};
