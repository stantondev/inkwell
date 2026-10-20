// Week 6: Louisa May Alcott, 1854–1888. DRAFT: drafted by Claude on 2026-10-19,
// waiting for a person to read it through and approve it.
//
// Text from Louisa May Alcott: Her Life, Letters, and Journals, ed. Ednah D.
// Cheney (1889), Project Gutenberg #38049, public domain. Every quoted line is
// checked against it by `npm run check:letters`. "…" marks a cut.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const SOURCE = {
  title: "Louisa May Alcott: Her Life, Letters, and Journals, ed. Ednah D. Cheney (1889), Project Gutenberg",
  url: "https://www.gutenberg.org/ebooks/38049",
  textUrl: "https://www.gutenberg.org/cache/epub/38049/pg38049.txt",
};

export const ALCOTT_LETTERS: DeadLetter[] = [
  {
    id: "alcott-mother-1854",
    day: 0,
    writtenAt: "20 Pinckney Street, Boston, 25 December 1854",
    deliverTo: "At home, in a Christmas stocking",
    salutation: "Dear Mother,",
    body: [
      "Into your {{christmas}} stocking I have put my “first-born,” knowing that you will accept it with all its faults (for grandmothers are always kind), and look upon it merely as an earnest of what I may yet do; for, with so much to cheer me on, I hope to pass in time from {{fairies}} and fables to men and realities.",
      "Whatever beauty or poetry is to be found in my little {{book}} is owing to your interest in and encouragement of all my efforts from the first to the last; and if ever I do anything to be proud of, my greatest happiness will be that I can {{thank}} you for that, as I may do for all the good there is in me; and I shall be content to write if it gives you pleasure.",
    ],
    signoff: ["I am ever your loving daughter", "[[!Louy]]."],
    blots: [
      { id: "christmas", word: "Christmas", survive: [0, 5], decoys: ["garden", "coffee"] },
      { id: "fairies", word: "fairies", survive: [0, 4], decoys: ["pianos", "lawsuits"] },
      { id: "book", word: "book", survive: [0], decoys: ["debt", "cough"] },
      { id: "thank", word: "thank", survive: [0, 4], decoys: ["blame", "forget"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "marmee",
      cards: [
        { id: "marmee", name: "Marmee", note: "Her mother, keeping boarders in their Boston house to make ends meet." },
        { id: "anna", name: "Anna", note: "Her older sister, away teaching school in Syracuse." },
        { id: "ellen", name: "Ellen Emerson", note: "A Concord neighbour’s daughter, for whom she had made up stories years before." },
        { id: "father", name: "Her father", note: "A philosopher and teacher, home that February from a lecture tour that hardly paid." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1854",
      options: [
        { id: "1846", name: "1846" },
        { id: "1854", name: "1854" },
        { id: "1862", name: "1862" },
        { id: "1868", name: "1868" },
      ],
    },
    clue: "Her first book, a little collection of fairy stories, came out in Boston in December 1854. It earned her thirty-two dollars.",
    story: [
      "She was twenty-two, teaching and sewing to help keep the family, and this was the first book she ever published. She called it her first-born, which makes her mother its grandmother.",
    ],
    history: {
      context: [
        "Her father was a teacher and philosopher whose ideas were admired and whose schemes almost never paid. The family moved often and was nearly always poor. In 1848 they moved to Boston, where her mother took in boarders, and the girls taught, sewed and took whatever work they could find.",
        "She had been writing poems, plays and stories since childhood, for the family and their friends. At sixteen she had made up fairy tales for Ellen Emerson, the daughter of their Concord neighbour Ralph Waldo Emerson. In December 1854 those tales were published in Boston as a little book, Flower Fables, in an edition of sixteen hundred copies.",
        "It was her mother who had encouraged her writing from the start, and who on her tenth birthday had given her a pencil-case because, she wrote, “you are fond of writing”. The book went into her stocking on Christmas morning.",
      ],
      people: [
        { name: "Mother", note: "Her mother, the person she was closest to all her life; the family called her Marmee." },
        { name: "“first-born”", note: "Flower Fables, the book itself." },
      ],
      afterwards: [
        "She was paid thirty-two dollars for it. Over thirty years later, when six months of her book sales brought in eight thousand dollars, she added a note to her old journal saying she had been prouder of the thirty-two.",
        "The newspapers began to ask her for stories, though for some years sewing and teaching still paid her better than writing did.",
      ],
    },
    notes: [
      { term: "an earnest of", note: "a small first sign of more to come." },
      { term: "grandmothers", note: "if the book is her first-born, her mother is its grandmother." },
    ],
    keepsake: "1854",
    source: SOURCE,
  },
  {
    id: "alcott-anna-1863",
    day: 1,
    writtenAt: "Concord, Massachusetts, 30 March 1863",
    deliverTo: "Near Boston",
    salutation: "Dearest little mother,",
    body: [
      "Allow me to ask who was a true prophet.",
      "Also to demand, “Where is my niece, [[!Louisa]] Caroline?”",
      "No matter, I will forgive you, and propose three cheers for my nephew. Hurrah! hurrah! Hurray!",
      "I wish you could have seen the performance on Saturday evening.",
      "We were all sitting deep in a novel, not expecting Father home owing to the {{snowstorm}}, when the door burst open, and in he came, all wet and white, waving his bag, and calling out, “Good news! good news! [[Anna]] has a fine boy!”",
      "With one accord we opened our mouths and screamed for about two minutes. Then Mother began to cry; I began to {{laugh}}; and May to pour out questions; while Papa beamed upon us all,—red, damp, and shiny, the picture of a proud old Grandpa. … Father had told every one he met, from [[Mr. Emerson]] to the coach driver, and went about the house saying, “[[Anna]]’s boy! yes, yes, [[Anna]]’s boy!” in a mild state of satisfaction.",
      "May and I at once taxed our brains for a name, and decided upon “[[Amos Minot Bridge Bronson May Sewall]] [[!Alcott]] [[Pratt]],” so that all the families would be suited.",
      "… I know I shall fall down and {{adore}} when I see that mite; yet my soul is rent when I think of the L. C. on the pincushion, and all the plans I had made for “my niece.”",
      "Now get up quickly, and be a happy mamma. Of course [[John]] does not consider his son as the most amazing product of the nineteenth {{century}}.",
      "Bless the baby!",
    ],
    signoff: ["Ever your admiring [[!Lu]]."],
    blots: [
      { id: "snowstorm", word: "snowstorm", survive: [0, 4], decoys: ["sunshine", "pudding"] },
      { id: "laugh", word: "laugh", survive: [0, 4], decoys: ["sleep", "sew"] },
      { id: "adore", word: "adore", survive: [0, 3], decoys: ["sneeze", "scold"] },
      { id: "century", word: "century", survive: [0, 6], decoys: ["floor", "parish"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "anna",
      cards: [
        { id: "anna", name: "Anna", note: "Her older sister, married to John Pratt in 1860." },
        { id: "marmee", name: "Marmee", note: "Her mother, at home in Concord." },
        { id: "may", name: "May", note: "Her youngest sister, at home in Concord." },
        { id: "nurse", name: "A fellow nurse", note: "One of the women she had worked beside in a Washington army hospital that winter." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1863",
      options: [
        { id: "1852", name: "1852" },
        { id: "1863", name: "1863" },
        { id: "1871", name: "1871" },
        { id: "1880", name: "1880" },
      ],
    },
    clue: "In the winter of 1862–63 she nursed wounded Union soldiers at a hospital in Georgetown, Washington, until she fell gravely ill and was brought home.",
    story: [
      "She had been home from Washington for about two months, still weak from the fever she caught nursing soldiers. Her sister’s first baby, a boy, was born on Saturday 28 March. She had been so sure it would be a girl that she had already picked a name.",
    ],
    history: {
      context: [
        "When the Civil War began, the family were firm abolitionists; her father had worked against slavery for decades. In November 1862, just turned thirty, she signed up as an army nurse, and in December she went to the Union Hotel Hospital in Georgetown, a crowded old hotel turned into a ward for wounded men.",
        "After about six weeks she caught typhoid pneumonia. In January 1863 her father came to Washington and took her home to Concord, where she lay delirious and very ill for weeks. She later said she was never ill before that winter, and never well after it.",
        "The letters she had written home from the hospital were printed in a Boston paper that spring and then as a book, Hospital Sketches, which first made her name known beyond story papers.",
        "Anna, her older sister and closest friend, had married John Pratt in 1860, and they had a home of their own.",
      ],
      people: [
        { name: "Anna", note: "Her older sister, the new mother: the “dearest little mother” of the greeting." },
        { name: "Father, Mother and May", note: "Her parents and youngest sister, at home in Concord." },
        { name: "Mr. Emerson", note: "Ralph Waldo Emerson, the family’s friend and neighbour in Concord." },
        { name: "John", note: "John Pratt, Anna’s husband, a quiet, kind man the whole family loved." },
        { name: "L. C.", note: "The initials of the niece’s name she had chosen, already set out on a pincushion for the baby girl she expected." },
      ],
      afterwards: [
        "The boy was named Frederick, and called Freddy. A second son, John, followed in 1865.",
        "Their father died in 1870, and she spent much of the rest of her life looking after the two boys and their mother. In her last years she legally adopted the younger, John, so that he could be her heir.",
      ],
    },
    notes: [
      { term: "a true prophet", note: "she had predicted a girl; Anna, it seems, a boy." },
      { term: "my soul is rent", note: "my heart is torn." },
      { term: "mite", note: "a tiny child." },
    ],
    keepsake: "1863",
    source: SOURCE,
  },
  {
    id: "alcott-niles-1870",
    day: 2,
    writtenAt: "Vevey, Switzerland, 23 August 1870",
    deliverTo: "Boston",
    salutation: "",
    body: [
      "Your note of August 2 has just come, with a fine budget of magazines and a paper, for all of which many thanks.",
      "… Don’t give my {{address}} to any one. I don’t want the young ladies’ notes. They can send them to Concord, and I shall get them next year.",
      "… The boys at [[Silling]]’s school are a perpetual source of delight to me; and I stand at the {{gate}}, like the Peri, longing to go in and play with the lads. The young ladies who want to find live {{lauries}} can be supplied here, for [[Silling]] has a large assortment always on hand.",
      "My B. says she is constantly trying to incite me to literary effort, but I hang fire. So I do,—but only that I may go off with a {{bang}} by and by, à la mitrailleuse.",
    ],
    signoff: ["[[!L. M. A.]]"],
    blots: [
      { id: "address", word: "address", survive: [0, 6], decoys: ["umbrella", "breakfast"] },
      { id: "gate", word: "gate", survive: [0], decoys: ["stove", "piano"] },
      { id: "lauries", word: "Lauries", survive: [0, 6], decoys: ["turnips", "sermons"] },
      { id: "bang", word: "bang", survive: [0], decoys: ["pillow", "whisper"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "niles",
      cards: [
        { id: "anna", name: "Anna", note: "Her older sister, at home with two little boys." },
        { id: "niles", name: "Thomas Niles", note: "A partner in Roberts Brothers, the Boston firm that published her books." },
        { id: "father", name: "Her father", note: "At home in Concord, lecturing and writing." },
        { id: "editor", name: "A magazine editor", note: "One of the many asking her for a story that year." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1870",
      options: [
        { id: "1863", name: "1863" },
        { id: "1870", name: "1870" },
        { id: "1877", name: "1877" },
        { id: "1885", name: "1885" },
      ],
    },
    clue: "By 1870 a novel about four sisters growing up in New England had made her famous, and girls wrote to her by the hundred.",
    story: [
      "Two years earlier she had been a hard-up writer of magazine stories. Now she was famous, travelling in Europe on her own money, and hiding her address from her readers. The war she jokes about had broken out between France and Prussia that July.",
    ],
    history: {
      context: [
        "In 1867 Thomas Niles asked her to write a book for girls. She doubted she could, but wrote it in a few months in 1868, drawing on her own family: four sisters, their mother, and the long, hard-up years. The first part came out that October and sold faster than anyone expected. The second followed in 1869.",
        "For the first time in her life there was money. By 1869 she had paid off every one of the family’s debts.",
        "In April 1870 she sailed for Europe with her sister May and a friend, to rest. They spent the spring in Brittany and the summer in Switzerland, where the boys of a school in Vevey caught her eye. The fan letters followed her, and so did editors asking for stories.",
      ],
      people: [
        { name: "Thomas Niles", note: "Her editor at Roberts Brothers in Boston, who had suggested the girls’ book and became a lifelong friend." },
        { name: "the young ladies", note: "Readers who wrote asking for autographs, pictures and more books." },
        { name: "Lauries", note: "Laurie is the lively boy next door in her famous book. She had drawn him partly from a young Polish man she met at Vevey on an earlier visit, in 1865." },
        { name: "Concord", note: "The Massachusetts town where her family lived." },
      ],
      afterwards: [
        "The party wintered in Rome. That winter news came that Anna’s husband, John Pratt, had died. She wrote a new book that winter partly to provide for his two boys, and it came out in 1871, the summer she got home.",
        "She published with Roberts Brothers, and wrote to Niles, for the rest of her life.",
      ],
    },
    notes: [
      { term: "budget", note: "a bundle." },
      { term: "the Peri", note: "a fairy spirit of Persian legend, pictured in a popular poem waiting outside the gate of Paradise." },
      { term: "hang fire", note: "hold back, like a gun slow to go off." },
      { term: "à la mitrailleuse", note: "like a mitrailleuse, a French many-barrelled gun then being used in the war with Prussia." },
      { term: "where", note: "This edition gives the letter no place. Her letters just before and after it are dated from Vevey." },
    ],
    keepsake: "1870",
    source: SOURCE,
  },
  {
    id: "alcott-father-1875",
    day: 3,
    writtenAt: "New York, 26 November 1875",
    deliverTo: "Concord, Massachusetts",
    salutation: "Dear Seventy-Six,",
    body: [
      "As I have nothing else to send you on our joint birthday, I’ll despatch a letter about some of the people I have lately seen in whom you take an interest.",
      "… Wednesday eve to Mr. Frothingham’s for his Fraternity Club meeting. Pleasant people. … the given subject for discussion was brought up,—“Conformity and Noncomformity.” Mr. B., a promising young lawyer, led one side, Miss B. the other, and Mr. F. was in the chair. It was very lively; and being called upon, I piped up, and went in for nonconformity when principle was concerned. Got patted on the head for my remarks, and didn’t disgrace myself except by getting very {{red}} and talking fast.",
      "Yesterday took a drive with Sally H. in Central Park as it was fine, and she had no fun on her {{thanksgiving}}. I dined at Mrs. Botta’s, for she kindly came and asked me.",
      "… But it isn’t all play, I assure you. I’m a thrifty {{butterfly}}, and have written three stories. … So far I like New York very much, and feel so well I shall stay on till I’m tired of it. People begin to tell me how much better I look than when I came, and I have not an {{ache}} to fret over.",
      "… Now, dear Plato, the Lord bless you, and keep you serene and happy for as many years as He sees fit, and me likewise, to be a comfort as well as a pride to you.",
    ],
    signoff: ["Ever your loving", "Forty-Three"],
    blots: [
      { id: "red", word: "red", survive: [0], decoys: ["tall", "rich"] },
      { id: "thanksgiving", word: "Thanksgiving", survive: [0, 6, 11], decoys: ["bonnet", "umbrella"] },
      { id: "butterfly", word: "butterfly", survive: [0, 6], decoys: ["teapot", "pebble"] },
      { id: "ache", word: "ache", survive: [0], decoys: ["oven", "aunt"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "father",
      cards: [
        { id: "marmee", name: "Marmee", note: "Her mother, now old and often unwell, at home in Concord." },
        { id: "father", name: "Her father", note: "A philosopher, at home in Concord; he had a birthday coming." },
        { id: "may", name: "May", note: "Her youngest sister, an artist, at home in Concord." },
        { id: "dodge", name: "Mrs. Dodge", note: "Mary Mapes Dodge, editor of St. Nicholas, a children’s magazine in New York." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1875",
      options: [
        { id: "1856", name: "1856" },
        { id: "1868", name: "1868" },
        { id: "1875", name: "1875" },
        { id: "1886", name: "1886" },
      ],
    },
    clue: "She and her father shared a birthday, 29 November: he was born in 1799, she in 1832.",
    story: [
      "Thanksgiving fell the day before, on Thursday 25 November, and she spent it in New York. Three days later her father turned seventy-six and she turned forty-three, which is how she signs.",
    ],
    history: {
      context: [
        "By 1875 she was one of the best-known writers in America, and comfortably off for the first time in her life; she was also worn out, and often ill. That autumn she took a room at a New York hotel for the winter and went out into society: clubs, lectures, receptions and dinners, and visits to the city’s charities, which she said she enjoyed more than the parties.",
        "Her father was then seventy-six. The world had been slow to reward his ideas, but in his old age he had a following, and he travelled to give the talks he called Conversations. The family joked about him as Plato, after the Greek philosopher.",
      ],
      people: [
        { name: "Seventy-Six and Plato", note: "Her father, born 29 November 1799." },
        { name: "Mr. Frothingham", note: "Octavius Brooks Frothingham, a well-known liberal minister in New York." },
        { name: "Sally H.", note: "Sallie Holley, an abolitionist who ran a school for freed families in Virginia." },
        { name: "Mrs. Botta", note: "Anne Lynch Botta, a poet whose New York drawing room was famous for writers and artists." },
        { name: "three stories", note: "A Christmas tale, “Letty’s Tramp”, and a piece for St. Nicholas, the children’s magazine." },
      ],
      afterwards: [
        "She stayed in New York into the new year, and on Christmas Day she went with a group of visitors to take presents to poor children on Randall’s Island.",
        "Her mother died in November 1877. Her father lived on, and in 1879 opened a summer school of philosophy in Concord, something he had dreamed of for years.",
      ],
    },
    notes: [
      { term: "despatch", note: "send off." },
      { term: "Noncomformity", note: "so spelt in this edition." },
      { term: "went in for", note: "spoke up for." },
    ],
    keepsake: "1875",
    source: SOURCE,
  },
  {
    id: "alcott-bond-1888",
    day: 4,
    writtenAt: "Roxbury, Boston, 8 February 1888",
    deliverTo: "Near Boston",
    salutation: "Dear Auntie,",
    body: [
      "I little knew what a sweet {{surprise}} was in store for me when I wrote to you yesterday.",
      "As I awoke this morning my good Doctor L. came in with the lovely {{azalea}}, her round face beaming through the leaves like a full {{moon}}.",
      "It was very dear of you to remember me, and cheer up my lonely day with such a beautiful guest.",
      "It stands beside me on Marmee’s work-table, and reminds me tenderly of her favorite flowers; and among those used at her funeral was a spray of this, which lasted for two weeks afterward, opening bud after bud in the glass on her table, where lay the dear old “Jos. May” hymn book, and her diary with the pen shut in as she left it when she last wrote there, three days before the end, “The twilight is closing about me, and I am going to rest in the arms of my children.”",
      "So you see I love the delicate flower, and enjoy it very much.",
      "I can write now, and soon hope to come out and see you for a few minutes, as I drive out every fine day, and go to kiss my people once a week for fifteen minutes.",
      "Slow {{climbing}}, but I don’t slip back; so think up my mercies, and sing cheerfully, as dear Marmee used to do, “Thus far the Lord has led me on!”",
    ],
    signoff: ["Your loving", "[[!Lu]]."],
    blots: [
      { id: "surprise", word: "surprise", survive: [0, 7], decoys: ["bill", "quarrel"] },
      { id: "azalea", word: "azalea", survive: [0, 5], decoys: ["kitten", "umbrella"] },
      { id: "moon", word: "moon", survive: [0], decoys: ["kettle", "purse"] },
      { id: "climbing", word: "climbing", survive: [0, 4], decoys: ["sinking", "sleeping"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "bond",
      cards: [
        { id: "anna", name: "Anna", note: "Her sister, the only one left, busy nursing their dying father." },
        { id: "bond", name: "Mrs. Bond", note: "An old friend of the family, whom she had called Auntie for many years." },
        { id: "lulu", name: "Lulu", note: "Her niece, May’s little daughter, eight years old." },
        { id: "lawrence", name: "Dr. Rhoda Lawrence", note: "The doctor in whose house she was being cared for." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1888",
      options: [
        { id: "1858", name: "1858" },
        { id: "1871", name: "1871" },
        { id: "1880", name: "1880" },
        { id: "1888", name: "1888" },
      ],
    },
    clue: "Her best-loved book is Little Women (1868), about the four March sisters. The mother in it is called Marmee, as her own mother was.",
    story: [
      "One of the last letters she wrote. She was fifty-five and very weak, living at her doctor’s house in Roxbury, too worn out to be with her family for more than a few minutes at a time. Her father lay dying across the city. She thanked Auntie for the azalea a month before her own death.",
    ],
    history: {
      context: [
        "Years of overwork and illness had worn her out. From late 1886 she lived at the Roxbury home of Dr. Rhoda Lawrence, who treated her with rest and massage. She could write only a little each day, but went on planning stories and sewing clothes for poor children.",
        "Her father, now eighty-eight, had been an invalid since a stroke in 1882, and was being cared for by Anna at the family’s house in Louisburg Square, Boston. Her mother had died ten years before; her younger sisters, Lizzie and May, were dead too.",
        "Auntie had been writing to her, and sending her verses, through her long illness. She had written to Auntie the day before about her father, who was failing.",
      ],
      people: [
        { name: "Auntie", note: "Mrs. Bond, an old friend of the family, who had written to her for decades." },
        { name: "Doctor L.", note: "Dr. Rhoda Lawrence, her doctor, in whose house she was living." },
        { name: "Marmee", note: "Her mother, who died in November 1877." },
        { name: "“Jos. May” hymn book", note: "An old family hymn book; her mother had been born a May." },
        { name: "my people", note: "Her family: her father, Anna, Anna’s sons, and May’s daughter Lulu." },
      ],
      afterwards: [
        "Her father died on 4 March 1888. In early March she drove in to see him for the last time; the next day she was taken ill, and she died on 6 March, without knowing that he had gone before her.",
        "She was buried in Sleepy Hollow Cemetery in Concord, near her family and their old neighbours Emerson and Thoreau.",
      ],
    },
    notes: [
      { term: "think up my mercies", note: "count my blessings." },
      { term: "“Thus far the Lord has led me on”", note: "the first line of a hymn by Isaac Watts." },
    ],
    keepsake: "1888",
    source: SOURCE,
  },
];

export const ALCOTT_WEEK: Week = {
  id: "2026-w48-alcott",
  number: 6,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-11-23",
  letters: ALCOTT_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["alcott", "louisa may alcott", "louisa alcott"],
    reject: ["bronson", "amos", "abigail", "abba", "anna", "elizabeth", "lizzie", "pratt", "may alcott"],
    hide: ["Louisa", "Lu", "Louy"],
    answer: "Louisa May Alcott",
    years: "1832–1888",
    reveal: [
      "Born in Pennsylvania and raised in Concord, Massachusetts, the second of four sisters in a family that was clever, loving and nearly always poor. She sewed, taught, nursed and wrote sensational stories under other names to keep them going.",
      "In 1868, at a publisher’s suggestion, she wrote a book for girls about four sisters much like her own. Little Women made her famous and rich, and has never been out of print.",
    ],
    coda: "Five letters, thirty-four years: a first book in a Christmas stocking, a nephew instead of a niece, fame from a safe distance, a birthday on Thanksgiving week, and thanks for a flower.",
  },
  next: "Next week’s bundle comes in time for Christmas.",
  timeline: [
    { year: "1832", text: "Born on 29 November in Germantown, Pennsylvania, on her father’s thirty-third birthday." },
    { year: "1840", text: "The family settles in Concord, Massachusetts, among friends who include Emerson and Thoreau." },
    { year: "1843", text: "Her father’s utopian farm, Fruitlands, fails within months." },
    { year: "1848", text: "The family moves to Boston; she teaches, sews and writes to help keep them." },
    { year: "1854", text: "Her first book, Flower Fables, goes into her mother’s Christmas stocking.", letters: [0] },
    { year: "1858", text: "Her sister Lizzie dies. The family moves into Orchard House in Concord." },
    { year: "1863", text: "Home from nursing soldiers in Washington; Hospital Sketches; her first nephew.", letters: [1] },
    { year: "1868", text: "Little Women." },
    { year: "1870", text: "Famous, and travelling in Europe with May.", letters: [2] },
    { year: "1875", text: "A winter in New York; a letter for their joint birthday.", letters: [3] },
    { year: "1877", text: "Her mother dies." },
    { year: "1879", text: "May dies weeks after giving birth to a daughter, Lulu, who is sent home to be raised by her aunt." },
    { year: "1888", text: "Her father dies on 4 March. She dies two days later, aged 55.", letters: [4] },
  ],
};
