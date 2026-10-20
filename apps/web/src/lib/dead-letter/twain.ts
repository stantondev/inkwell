// Week 5: Mark Twain, 1853–1903. DRAFT: drafted by Claude on 2026-10-19,
// waiting for a person to read it through and approve it.
//
// Text from Mark Twain's Letters, ed. Albert Bigelow Paine (1917), Project
// Gutenberg #3193–#3197, public domain. Every quoted line is checked against
// it by `npm run check:letters`. "…" marks a cut.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const volume = (id: number, years: string, n: number) => ({
  title: `Mark Twain’s Letters, Volume ${n} (${years}), ed. Albert Bigelow Paine (Project Gutenberg)`,
  url: `https://www.gutenberg.org/ebooks/${id}`,
  textUrl: `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
});

const VOL_1 = volume(3193, "1853–1866", 1);
const VOL_2 = volume(3194, "1867–1875", 2);
const VOL_4 = volume(3196, "1886–1900", 4);
const VOL_5 = volume(3197, "1901–1906", 5);

export const TWAIN_LETTERS: DeadLetter[] = [
  {
    id: "twain-pamela-1853",
    day: 0,
    writtenAt: "New York, a Saturday in October 1853",
    deliverTo: "St. Louis, Missouri",
    salutation: "My dear Sister,",
    body: [
      "I have not written to any of the family for some time, from the fact, firstly, that I didn’t know where they were, and secondly, because I have been fooling myself with the idea that I was going to leave New York every day for the last two weeks. I have taken a liking to the abominable place, and every time I get ready to leave, I put it off a day or so, from some unaccountable cause. It is as hard on my conscience to leave New York, as it was easy to leave Hannibal. I think I shall get off Tuesday, though.",
      "If my letters do not come often, you need not bother yourself about me; for if you have a brother nearly {{eighteen}} years of age, who is not able to take care of himself a few miles from home, such a brother is not worth one’s thoughts: and if I don’t manage to take care of No. 1, be assured you will never know it. I am not afraid, however; I shall ask favors from no one, and endeavor to be (and shall be) as “independent as a wood-sawyer’s {{clerk}}.”",
      "I never saw such a place for {{military}} companies as New York. Go on the street when you will, you are sure to meet a company in full uniform, with all the usual appendages of drums, fifes, &c. … And as I passed through one of the parks lately, I came upon a company of boys on parade. Their uniforms were neat, and their {{muskets}} about half the common size. Some of them were not more than seven or eight years of age; but had evidently been well-drilled.",
      "I want you to write as soon as I tell you where to direct your letter. I would let you know now, if I knew myself. … When you write tell me the whereabouts of the family. My love to [[Mr. Moffett]] and Ella. Tell Ella I intend to write to her soon, whether she wants me to nor not.",
    ],
    signoff: ["Truly your Brother,", "[[!Saml L. Clemens]]."],
    blots: [
      { id: "eighteen", word: "eighteen", survive: [0, 4], decoys: ["eighty", "four"] },
      { id: "clerk", word: "clerk", survive: [0, 4], decoys: ["river", "Tuesday"] },
      { id: "military", word: "military", survive: [0, 5], decoys: ["railroad", "insurance"] },
      { id: "muskets", word: "muskets", survive: [0, 3], decoys: ["mothers", "shadows"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "pamela",
      cards: [
        { id: "jane", name: "Jane", note: "His mother, a widow since 1847." },
        { id: "pamela", name: "Pamela", note: "His older sister, married to a St. Louis merchant." },
        { id: "orion", name: "Orion", note: "His older brother, who had been running a newspaper in Hannibal." },
        { id: "ella", name: "Ella Creel", note: "A cousin, and once his sweetheart." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1853",
      options: [
        { id: "1847", name: "1847" },
        { id: "1853", name: "1853" },
        { id: "1861", name: "1861" },
        { id: "1870", name: "1870" },
      ],
    },
    clue: "He grew up in Hannibal, Missouri, on the Mississippi, and left at seventeen to work as a travelling printer.",
    story: [
      "He had left Hannibal that summer, gone first to St. Louis, where Pamela lived, and then on to New York, where a World’s Fair was being held in a Crystal Palace. He set type in a printing office by day and read in a free printers’ library at night. Soon after this letter he moved on to Philadelphia.",
    ],
    history: {
      context: [
        "His father, a country lawyer and storekeeper who never made money, died when the boy was eleven. Soon afterwards he was apprenticed to a printer, and later set type on the small Hannibal paper his brother Orion ran.",
        "Orion’s paper never paid either, and in 1853 it was sold. The family scattered, and he wasn’t sure where his mother, Orion and the youngest brother, Henry, had gone; he guessed St. Louis.",
        "A journeyman printer could find work in any city with a newspaper, and he used the trade to see the country. Before he left home his mother had made him promise, on a Testament, not to drink or play cards while he was away. His letters from this year say he was keeping it.",
      ],
      people: [
        { name: "his sister", note: "Pamela, eight years older, married to William Moffett, a St. Louis merchant." },
        { name: "Mr. Moffett", note: "Pamela’s husband." },
        { name: "Ella", note: "Ella Creel, a cousin, once his sweetheart." },
        { name: "Hannibal", note: "The river town in Missouri where he grew up." },
      ],
      afterwards: [
        "He spent the winter in Philadelphia, setting type for the Inquirer, and by the next year he was back in the Mississippi valley, working in Orion’s printing shop in Iowa.",
        "Pamela outlived both her husband and her mother, and stayed close to her brother all her life. After he married, he persuaded her and their mother to move to Fredonia, New York, within easy reach of his own home.",
      ],
    },
    notes: [
      { term: "abominable", note: "hateful (he means it fondly)." },
      { term: "No. 1", note: "himself." },
      { term: "appendages", note: "trimmings; things that go with it." },
      { term: "direct your letter", note: "address it." },
    ],
    keepsake: "1853",
    source: VOL_1,
  },
  {
    id: "twain-betsey-1859",
    day: 1,
    writtenAt: "St. Louis, 31 October, probably 1859",
    deliverTo: "Jackson, Cape Girardeau County, Missouri",
    salutation: "Dear [[Aunt Betsey]],",
    body: [
      "Ma has not written you, because she did not know when I would get started down the river again. …",
      "You see, [[Aunt Betsey]], I made but one trip on the packet after you left, and then concluded to remain at home awhile. I have just discovered this morning that I am to go to New Orleans on the “Col. Chambers”—fine, light-draught, swift-running passenger steamer—all modern accommodations and improvements—through with dispatch—for freight or passage apply on board, or to—but—I have forgotten the agent’s name—however, it makes no difference—and as I was saying, or had intended to say, [[Aunt Betsey]], probably, if you are ready to come up, you had better take the “Ben Lewis,” the {{best}} boat in the packet line. … Just tell Mr. Gray, [[Aunt Betsey]]—that I wish him to place himself at your command.",
      "All the family are well—except myself—I am in a bad way again—disease, {{love}}, in its most malignant form. Hopes are entertained of my {{recovery}}, however. At the dinner table—excellent symptom—I am still as “terrible as an army with banners.”",
      "[[Aunt Betsey]]—the {{wickedness}} of this world—but I haven’t time to moralize this morning.",
    ],
    signoff: ["Goodbye", "[[!Sam Clemens]]."],
    blots: [
      { id: "best", word: "best", survive: [0], decoys: ["slowest", "emptiest"] },
      { id: "love", word: "Love", survive: [0], decoys: ["Cotton", "Sunday"] },
      { id: "recovery", word: "recovery", survive: [0, 4], decoys: ["drowning", "laziness"] },
      { id: "wickedness", word: "wickedness", survive: [0, 4], decoys: ["weather", "geography"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "betsey",
      cards: [
        { id: "jane", name: "Jane", note: "His mother, living in St. Louis." },
        { id: "betsey", name: "Elizabeth Smith", note: "An old friend of the family from Hannibal, living down the river near Cape Girardeau." },
        { id: "bixby", name: "Horace Bixby", note: "The pilot who taught him the river." },
        { id: "pamela", name: "Pamela", note: "His married sister, in St. Louis." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1859",
      options: [
        { id: "1853", name: "1853" },
        { id: "1859", name: "1859" },
        { id: "1866", name: "1866" },
        { id: "1872", name: "1872" },
      ],
    },
    clue: "In 1859 he was licensed as a Mississippi steamboat pilot.",
    story: [
      "He was twenty-three and a newly licensed pilot, waiting in St. Louis for his next boat. He wrote to an old family friend whom he called Aunt Betsey, to tell her which boat to take upriver and which pilots would look after her. Who had given him the malignant disease, the letter doesn’t say, and he never mentions it again.",
    ],
    history: {
      context: [
        "As a boy in Hannibal he had watched the steamboats come in and wanted, more than anything, to be a pilot. In 1857, aged twenty-one, he talked Horace Bixby, one of the best pilots on the river, into teaching him, for a fee of five hundred dollars.",
        "Learning the river meant memorising twelve hundred miles of it between St. Louis and New Orleans, in both directions, by day and by night, and every snag and sandbar that moved with the water. He got his licence in April 1859. A pilot was paid well, and was the most important person on board: even the captain could not overrule him at the wheel.",
        "His younger brother Henry, whom he had found a job on a steamboat, had died the summer before, after the boat’s boilers exploded below Memphis.",
      ],
      people: [
        { name: "Aunt Betsey", note: "Mrs. Elizabeth W. Smith, a friend of the family from Hannibal. Not really his aunt." },
        { name: "Ma", note: "His mother, then living in St. Louis." },
        { name: "the “Col. Chambers” and the “Ben Lewis”", note: "Two steamboats working the river from St. Louis." },
        { name: "Mr. Gray", note: "One of the pilots he knew, on the “Ben Lewis”." },
      ],
      afterwards: [
        "He piloted for two more years, until the Civil War closed the river in 1861. Then he went west to Nevada with his brother Orion, tried his luck at silver mining, and became a newspaper reporter instead.",
        "He said for the rest of his life that piloting was the job he loved best, and he wrote a whole book about learning it.",
      ],
    },
    notes: [
      { term: "packet", note: "a steamboat running a regular route with passengers, mail and freight." },
      { term: "light-draught", note: "sitting high in the water, good for the shallows." },
      { term: "terrible as an army with banners", note: "a line from the Song of Solomon in the Bible." },
      { term: "the year", note: "The edition dates this letter “probably 1859”; the letter itself gives only the day." },
    ],
    keepsake: "1859",
    source: VOL_1,
  },
  {
    id: "twain-twichell-1870",
    day: 2,
    writtenAt: "Buffalo, New York, 12 November 1870",
    deliverTo: "Hartford, Connecticut",
    salutation: "Dear Uncle and Aunt,",
    body: [
      "I came into the world on the 7th inst., and consequently am about five days old, now. I have had wretched health ever since I made my appearance. First one thing and then another has kept me under the weather, and as a general thing I have been chilly and uncomfortable.",
      "I am not corpulent, nor am I robust in any way. At birth I only weighed 4 1/2 {{pounds}} with my clothes on—and the clothes were the chief feature of the weight, too, I am obliged to confess. But I am doing finely, all things considered. I was at a standstill for 3 days and a half, but during the last 24 hours I have gained nearly an {{ounce}}, avoirdupois.",
      "They all say I look very old and venerable—and I am aware, myself, that I never {{smile}}. Life seems a serious thing, what I have seen of it—and my observation teaches me that it is made up mainly of hiccups, unnecessary washings, and {{colic}}. But no doubt you, who are old, have long since grown accustomed and reconciled to what seems to me such a disagreeable novelty.",
      "My father said, this morning, when my face was in repose and thoughtful, that I looked precisely as young Edward [[Twichell]] of Hartford used to look …",
      "My little mother is very bright and cheery, and I guess she is pretty happy, but I don’t know what about. She laughs a great deal, notwithstanding she is sick abed. And she eats a great deal, though she says that is because the nurse desires it. And when she has had all the nurse desires her to have, she asks for more. She is getting along very well indeed.",
      "My aunt Susie Crane has been here some ten days or two weeks, but goes home today, and Granny Fairbanks of Cleveland arrives to take her place.",
    ],
    signoff: ["Very lovingly,", "[[Langdon]] [[!Clemens]]."],
    postscript: "P. S. Father said I had better write because you would be more interested in me, just now, than in the rest of the family.",
    blots: [
      { id: "pounds", word: "pounds", survive: [0, 5], decoys: ["tons", "miles"] },
      { id: "ounce", word: "ounce", survive: [0], decoys: ["acre", "hour"] },
      { id: "smile", word: "smile", survive: [0, 4], decoys: ["swim", "vote"] },
      { id: "colic", word: "colic", survive: [0], decoys: ["picnics", "poetry"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "twichells",
      cards: [
        { id: "orion-mollie", name: "Orion and Mollie", note: "His brother and sister-in-law, in St. Louis." },
        { id: "crane", name: "Susan Crane", note: "His wife’s older sister, of Elmira, New York." },
        { id: "twichells", name: "Joseph and Harmony Twichell", note: "A Hartford minister and his wife, with a small son of their own." },
        { id: "fairbanks", name: "Mary Fairbanks", note: "A Cleveland friend from his voyage to Europe and the Holy Land in 1867." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1870",
      options: [
        { id: "1863", name: "1863" },
        { id: "1870", name: "1870" },
        { id: "1876", name: "1876" },
        { id: "1885", name: "1885" },
      ],
    },
    clue: "In February 1870 he married Olivia Langdon of Elmira, New York, and that year he was part-owner and an editor of a newspaper in Buffalo.",
    story: [
      "His first child, Langdon, was born a month early, on 7 November 1870, and was small and sickly. Five days later his father wrote to his best friends in Hartford in the baby’s voice. He added a postscript of his own to explain.",
    ],
    history: {
      context: [
        "The summer before, he had bought a share in the Buffalo Express. That February he married Olivia Langdon, the daughter of a rich Elmira coal merchant, and her father had given them a house in Buffalo as a wedding present.",
        "It was a hard first year. Her father died in August after a long illness. A school friend of hers, Emma Nye, came to stay, caught typhoid fever and died in their house in September. Then the baby came early, with his mother worn out and ill.",
        "He had met Joseph Twichell in Hartford, where his publisher was, and they had become friends at once. Twichell had helped marry them at Elmira that February.",
      ],
      people: [
        { name: "Joseph and Harmony Twichell", note: "Joe was the minister of the Asylum Hill Congregational Church in Hartford and had been an army chaplain in the Civil War. Harmony was his wife." },
        { name: "Edward", note: "The Twichells’ own baby son." },
        { name: "my little mother", note: "Olivia, called Livy." },
        { name: "Susie Crane", note: "Livy’s older sister, from Elmira." },
        { name: "Granny Fairbanks", note: "Mary Fairbanks of Cleveland, who had befriended him on a long voyage to Europe and the Holy Land in 1867." },
      ],
      afterwards: [
        "In 1871 the family left Buffalo for Hartford, where they later built a house, and he and Twichell were close friends, and great walkers together, for the rest of their lives.",
        "Langdon never grew strong. He died of diphtheria in June 1872, at nineteen months. Three months before, his sister Susy had been born.",
      ],
    },
    notes: [
      { term: "inst.", note: "of this month." },
      { term: "corpulent", note: "fat." },
      { term: "avoirdupois", note: "by weight." },
      { term: "venerable", note: "old and dignified." },
    ],
    keepsake: "1870",
    source: VOL_2,
  },
  {
    id: "twain-susy-1892",
    day: 3,
    writtenAt: "Mentone, France, 22 March 1892",
    deliverTo: "Berlin, Germany",
    salutation: "[[Susy]] dear,",
    body: [
      "I have been delighted to note your easy facility with your {{pen}} and proud to note also your literary superiorities of one kind and another—clearness of statement, directness, felicity of expression, photographic ability in setting forth an incident—style—good style—no barnacles on it in the way of unnecessary, retarding words (the Shipman scrapes off the barnacles when he wants his racer to go her best gait and straight to the buoy.) You should write a {{letter}} every day, long or short—and so ought I, but I don’t.",
      "Mamma says, tell Clara yes, she will have to write a note if the fan comes back mended.",
      "We couldn’t go to Nice to-day—had to give it up, on various accounts—and this was the last chance. I am sorry for Mamma—I wish she could have gone. She got a heavy {{fall}} yesterday evening and was pretty stiff and lame this morning, but is working it off trunk packing.",
      "Joseph is gone to Nice to educate himself in Kodaking—and to get the pictures mounted which Mamma thinks she took here; but I noticed she didn’t take the {{plug}} out, as a rule. When she did, she took nine pictures on top of each other—composites.",
    ],
    signoff: ["With lots of love.", "Papa."],
    blots: [
      { id: "pen", word: "pen", survive: [0], decoys: ["fork", "elbow"] },
      { id: "letter", word: "letter", survive: [0, 5], decoys: ["pudding", "bonfire"] },
      { id: "fall", word: "fall", survive: [0], decoys: ["supper", "laugh"] },
      { id: "plug", word: "plug", survive: [0], decoys: ["cat", "bread"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "susy",
      cards: [
        { id: "clara", name: "Clara", note: "His middle daughter, seventeen, studying music." },
        { id: "susy", name: "Susy", note: "His eldest daughter, just twenty, who at thirteen had written a life of her father." },
        { id: "jean", name: "Jean", note: "His youngest daughter, eleven." },
        { id: "joseph", name: "Joseph Very", note: "The family’s courier, who made their travel arrangements." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1892",
      options: [
        { id: "1876", name: "1876" },
        { id: "1884", name: "1884" },
        { id: "1892", name: "1892" },
        { id: "1905", name: "1905" },
      ],
    },
    clue: "In 1891 he shut up his house in Hartford, Connecticut, and took his family to live in Europe, where living was cheaper.",
    story: [
      "The family had spent the winter in Berlin. He fell ill there, and in March the doctors sent him south to the warmth of the Riviera. Livy went with him, and the three girls stayed behind in Berlin. Susy had just turned twenty, and her letters to her parents had impressed him.",
    ],
    history: {
      context: [
        "By 1891 he was famous all over the world, but short of money. He had poured a fortune into a typesetting machine that never worked properly, and his publishing firm was struggling. Running the big house in Hartford cost far more than he could earn, so the family closed it and went to Europe, where they could live on less.",
        "Susy was the eldest of his three daughters, clever, sensitive and close to her father. When she was thirteen she began, secretly, to write his biography, spelling mistakes and all; he found it, treasured it, and later quoted it at length.",
        "Kodak’s little box cameras, which anyone could use, were only a few years old. This is a father who has noticed that his wife kept the lens cap on.",
      ],
      people: [
        { name: "Susy", note: "Olivia Susan, born 1872, the eldest daughter." },
        { name: "Mamma", note: "His wife Livy, travelling with him." },
        { name: "Clara", note: "The middle daughter, seventeen." },
        { name: "Joseph", note: "Joseph Very, the courier who travelled with the family." },
        { name: "Mentone", note: "Menton, a resort on the French Riviera near the Italian border." },
      ],
      afterwards: [
        "The family stayed in Europe for most of the decade. In 1894 his publishing firm went bankrupt, and he set out on a lecture tour around the world to pay back every creditor.",
        "Susy stayed in America while the others travelled. In August 1896, with her parents in England at the end of the tour, she fell ill in Hartford and died of meningitis, aged twenty-four. Her mother and sister were on a ship home and did not reach her in time. He never got over it.",
      ],
    },
    notes: [
      { term: "felicity of expression", note: "a gift for the right word." },
      { term: "barnacles", note: "shellfish that cling to a boat’s hull and slow it down." },
      { term: "Kodaking", note: "taking snapshots with a Kodak camera." },
      { term: "composites", note: "several pictures on one photograph." },
    ],
    keepsake: "1892",
    source: VOL_4,
  },
  {
    id: "twain-keller-1903",
    day: 4,
    writtenAt: "Riverdale-on-the-Hudson, New York, St. Patrick’s Day 1903",
    deliverTo: "Massachusetts",
    salutation: "Dear [[Helen]],",
    body: [
      "I must steal half a moment from my work to say how glad I am to have your book, and how highly I value it, both for its own sake and as a remembrances of an affectionate friendship which has subsisted between us for nine years without a break, and without a single act of {{violence}} that I can call to mind. I suppose there is nothing like it in heaven; and not likely to be, until we get there and show off. I often think of it with longing, and how they’ll say, “There they come—sit down in front!” I am practicing with a tin {{halo}}. You do the same.",
      "I am charmed with your book-enchanted. You are a wonderful creature, the most wonderful in the world—you and your other half together—Miss Sullivan, I mean, for it took the pair of you to make a complete and perfect whole.",
      "Oh, dear me, how unspeakably funny and owlishly idiotic and grotesque was that “plagiarism” farce! As if there was much of anything in any human utterance, oral or written, except plagiarism! … It takes a thousand men to invent a telegraph, or a steam engine, or a phonograph, or a photograph, or a telephone or any other important thing—and the last man gets the {{credit}} and we forget the others. He added his little mite—that is all he did.",
      "In 1866 I read Dr. Holmes’s poems, in the Sandwich Islands. A year and a half later I stole his dictation, without knowing it, and used it to dedicate my “[[Innocents Abroad]]” with. Then years afterwards I was talking with Dr. Holmes about it. … when I said, “I know now where I stole it, but whom did you steal it from,” he said, “I don’t remember; I only know I stole it from somebody, because I have never originated anything altogether myself, nor met anybody who had.”",
      "To think of those solemn donkeys breaking a little child’s heart with their ignorant rubbish about plagiarism! I couldn’t sleep for blaspheming about it last night. … A gang of dull and hoary pirates piously setting themselves the task of disciplining and purifying a {{kitten}} that they think they’ve caught filching a chop! Oh, dam—",
      "But you finish it, dear, I am running short of {{vocabulary}} today.",
    ],
    signoff: ["Ever lovingly your friend,", "[[!Mark]]."],
    blots: [
      { id: "violence", word: "violence", survive: [0, 4], decoys: ["kindness", "gratitude"] },
      { id: "halo", word: "halo", survive: [0], decoys: ["bucket", "roof"] },
      { id: "credit", word: "credit", survive: [0, 5], decoys: ["hiccups", "measles"] },
      { id: "kitten", word: "kitten", survive: [0, 5], decoys: ["bishop", "mountain"] },
      { id: "vocabulary", word: "vocabulary", survive: [0, 4], decoys: ["firewood", "porridge"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "keller",
      cards: [
        { id: "sullivan", name: "Anne Sullivan", note: "A teacher, trained at the Perkins Institution for the Blind in Boston." },
        { id: "rogers", name: "Henry Rogers", note: "A Standard Oil millionaire who had rescued his finances." },
        { id: "keller", name: "Helen Keller", note: "A young woman, blind and deaf since infancy, studying at Radcliffe College." },
        { id: "clara", name: "Clara", note: "His middle daughter, running the household while her mother was ill." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1903",
      options: [
        { id: "1889", name: "1889" },
        { id: "1896", name: "1896" },
        { id: "1903", name: "1903" },
        { id: "1910", name: "1910" },
      ],
    },
    clue: "His pen name was a riverboat call: the leadsman’s cry for two fathoms of water, twelve feet, safe for a steamboat.",
    story: [
      "Helen Keller, twenty-two and a student at Radcliffe, had just published her first book, The Story of My Life. In it she told how, at eleven, she had written a little story that turned out to be very like one read to her years before and forgotten, and how she had been questioned about it as if she had cheated. This letter was his answer to that.",
    ],
    history: {
      context: [
        "Helen Keller lost her sight and hearing to an illness before she was two. When she was almost seven, a young teacher, Anne Sullivan, came to her family’s home in Alabama, spelled words into her hand, and gave her language. By her teens she was famous, and he had been her friend since she was a schoolgirl.",
        "The “plagiarism farce” happened in 1892, when Helen was eleven. A story she had written, “The Frost King”, turned out to resemble a published fairy tale, and teachers at the school for the blind in Boston held an inquiry. She had no memory of hearing the original, and the experience frightened her for years.",
        "His own home that spring was a sickroom. His wife had been ill in bed for months, and his daughter Clara was running the house.",
      ],
      people: [
        { name: "Helen Keller", note: "Born 1880 in Tuscumbia, Alabama." },
        { name: "Miss Sullivan", note: "Anne Sullivan, her teacher and lifelong companion." },
        { name: "Henry Rogers", note: "A Standard Oil executive who had untangled his finances after the bankruptcy, and who helped pay for Helen’s education." },
        { name: "Dr. Holmes", note: "Oliver Wendell Holmes, the Boston poet and doctor." },
        { name: "the Sandwich Islands", note: "Hawaii, which he visited as a newspaper correspondent in 1866." },
      ],
      afterwards: [
        "Helen graduated from Radcliffe in 1904, the first deafblind person to earn a college degree, and spent her life writing, lecturing and campaigning for the blind. She died in 1968.",
        "That autumn he took his wife to Italy for the climate. Livy died in Florence in June 1904.",
      ],
    },
    notes: [
      { term: "plagiarism", note: "passing off someone else’s words as your own." },
      { term: "stole his dictation", note: "borrowed his wording." },
      { term: "mite", note: "a tiny contribution." },
      { term: "filching", note: "stealing." },
      { term: "the address", note: "The edition addresses the letter to Wrentham, Massachusetts, where Helen and Anne Sullivan later made their home; in March 1903 Helen was a student at Radcliffe." },
    ],
    keepsake: "1903",
    source: VOL_5,
  },
];

export const TWAIN_WEEK: Week = {
  id: "2026-w47-twain",
  number: 5,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-11-16",
  letters: TWAIN_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["twain", "clemens", "samuel clemens"],
    reject: ["orion", "olivia", "livy", "susy", "clara", "jean", "pamela", "henry", "jane", "langdon"],
    hide: ["Clemens", "Sam", "Saml", "Samuel", "Mark"],
    answer: "Mark Twain",
    years: "1835–1910",
    reveal: [
      "Samuel Langhorne Clemens grew up in Hannibal, Missouri, set type, piloted steamboats on the Mississippi, and went west to Nevada, where in 1863 he first signed himself Mark Twain: the leadsman’s call for two fathoms, safe water.",
      "He wrote The Innocents Abroad, Tom Sawyer and Adventures of Huckleberry Finn, lost a fortune and lectured his way around the world to pay it back, and was the most famous American writer of his time.",
    ],
    coda: "Five letters, fifty years: a printer far from home, a pilot in love, a baby with opinions, a proud father, and an old friend in a temper on someone else’s behalf.",
  },
  next: "Next week’s writer kept her whole family going on what she earned with her pen.",
  timeline: [
    { year: "1835", text: "Born on 30 November in Florida, Missouri. The family moves to Hannibal, on the Mississippi, when he is four." },
    { year: "1847", text: "His father dies. Soon afterwards he is apprenticed to a printer." },
    { year: "1853", text: "Leaves Hannibal to set type in New York and Philadelphia; writes to Pamela.", letters: [0] },
    { year: "1859", text: "Licensed as a Mississippi steamboat pilot; writes to Aunt Betsey.", letters: [1] },
    { year: "1861", text: "The Civil War closes the river. He goes west to Nevada with Orion." },
    { year: "1863", text: "Signs himself Mark Twain for the first time, in the Virginia City Territorial Enterprise." },
    { year: "1865", text: "His story of a jumping frog is printed in New York and copied across the country." },
    { year: "1870", text: "Marries Olivia Langdon. Their son Langdon is born, and writes to Hartford.", letters: [2] },
    { year: "1876", text: "The Adventures of Tom Sawyer. Adventures of Huckleberry Finn follows in 1885." },
    { year: "1892", text: "Living in Europe to save money; writes to Susy.", letters: [3] },
    { year: "1896", text: "Finishes a lecture tour around the world to pay his debts. Susy dies in Hartford." },
    { year: "1903", text: "Writes to Helen Keller about plagiarism.", letters: [4] },
    { year: "1910", text: "Dies at his house, Stormfield, in Redding, Connecticut, on 21 April, aged 74. Livy died in 1904, Jean on Christmas Eve 1909." },
  ],
};
