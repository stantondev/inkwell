// Week 7: Charles Dickens, 1838–1868. DRAFT: drafted by Claude on 2026-10-19,
// waiting for a person to read it through and approve it.
//
// Text from The Letters of Charles Dickens, edited by his sister-in-law and his
// eldest daughter (Project Gutenberg #25852 and #25853), public domain. Every
// quoted line is checked against it by `npm run check:letters`. "…" marks a cut.
//
// Monday's letter names characters from the novel he was writing; those are
// smudged as the writer's own ([[!…]]) so they stay hidden until he is named.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const VOL1 = {
  title: "The Letters of Charles Dickens, Vol. 1, 1833–1856, ed. Georgina Hogarth and Mamie Dickens (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/25852",
  textUrl: "https://www.gutenberg.org/cache/epub/25852/pg25852.txt",
};

const VOL2 = {
  title: "The Letters of Charles Dickens, Vol. 2, 1857–1870, ed. Georgina Hogarth and Mamie Dickens (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/25853",
  textUrl: "https://www.gutenberg.org/cache/epub/25853/pg25853.txt",
};

export const DICKENS_LETTERS: DeadLetter[] = [
  {
    id: "dickens-hughes-1838",
    day: 0,
    writtenAt: "Doughty Street, London, 12 December 1838",
    deliverTo: "England",
    salutation: "Respected Sir,",
    body: [
      "I have given [[!Squeers]] one cut on the neck and two on the head, at which he appeared much surprised and began to {{cry}}, which, being a cowardly thing, is just what I should have expected from him—wouldn’t you?",
      "I have carefully done what you told me in your letter about the lamb and the two “sheeps” for the little boys. They have also had some good ale and porter, and some wine. I am sorry you didn’t say what wine you would like them to have. I gave them some {{sherry}}, which they liked very much, except one boy, who was a little sick and choked a good deal. He was rather greedy, and that’s the truth, and I believe it went the wrong way, which I say served him right, and I hope you will say so too.",
      "[[!Nicholas]] had his roast lamb, as you said he was to, but he could not eat it all … I also gave him three pounds of money, all in sixpences, to make it seem more, and he said directly that he should give more than half to his mamma and sister, and divide the rest with poor [[!Smike]]. And I say he is a good fellow for saying so; and if anybody says he isn’t I am ready to {{fight}} him whenever they like—there!",
      "[[!Fanny Squeers]] shall be attended to, depend upon it. Your {{drawing}} of her is very like, except that I don’t think the hair is quite curly enough. The nose is particularly like hers, and so are the legs. She is a nasty disagreeable thing, and I know it will make her very cross when she sees it; and what I say is that I hope it may.",
      "I meant to have written you a long letter, but I cannot write very fast when I like the person I am writing to, because that makes me think about them, and I like you, and so I tell you. Besides, it is just eight o’clock at night, and I always go to bed at eight o’clock, except when it is my birthday, and then I sit up to supper. So I will not say anything more besides this—and that is my love to you and [[Neptune]]; and if you will drink my health every {{christmas}} Day I will drink yours—come.",
    ],
    signoff: ["I am,", "Respected Sir,", "Your affectionate Friend."],
    postscript: "P.S.—I don’t write my name very plain, but you know what it is you know, so never mind.",
    blots: [
      { id: "cry", word: "cry", survive: [0], decoys: ["laugh", "dance"] },
      { id: "sherry", word: "sherry", survive: [0, 3], decoys: ["milk", "porridge"] },
      { id: "fight", word: "fight", survive: [0], decoys: ["thank", "kiss"] },
      { id: "drawing", word: "drawing", survive: [0, 4], decoys: ["song", "silence"] },
      { id: "christmas", word: "Christmas", survive: [0, 5], decoys: ["Monday", "Tuesday"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "hastings",
      cards: [
        { id: "browne", name: "Hablot Browne", note: "The artist who drew the pictures for his monthly numbers." },
        { id: "hastings", name: "Hastings Hughes", note: "A little boy who had written to him about the book." },
        { id: "forster", name: "John Forster", note: "His closest friend, a London critic and journalist." },
        { id: "barham", name: "Richard Barham", note: "A clergyman and comic poet, author of The Ingoldsby Legends." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1838",
      options: [
        { id: "1833", name: "1833" },
        { id: "1838", name: "1838" },
        { id: "1847", name: "1847" },
        { id: "1861", name: "1861" },
      ],
    },
    clue: "In December 1838 he was twenty-six, living in Doughty Street in London, and his third novel was coming out in monthly numbers.",
    story: [
      "A little boy had written to him with orders: the villain of the new book was to be punished, the hero fed, and the starving schoolboys given a proper dinner. He answered as if he really could go into his own story and see to it.",
    ],
    history: {
      context: [
        "Two years earlier a comic serial in monthly numbers had made him the most talked-about young writer in England. Now his third novel was coming out the same way, a number every month, and readers wrote to him about the characters as if they were real people.",
        "The villain of this one was a brutal schoolmaster who half-starved the boys in his care at a cheap boarding school in Yorkshire. Such schools were real: unwanted children were sent there and kept out of sight, and he had travelled north in midwinter to see some for himself.",
        "The book still had most of a year to run, so the boy’s instructions arrived while the story was being written.",
      ],
      people: [
        { name: "the boy", note: "Hastings Hughes, who wrote to him with his views on what every character deserved. The letter went to him through the Rev. Richard Barham, author of The Ingoldsby Legends." },
        { name: "the schoolmaster", note: "The villain, who beats and starves his pupils; the boy wanted him punished." },
        { name: "the hero", note: "A young man who goes to teach at the school and ends up thrashing its master." },
        { name: "the starving boy", note: "A half-starved boy from the school whom the hero befriends." },
        { name: "his daughter", note: "The schoolmaster’s daughter, as unpleasant as her father; the boy had drawn her portrait." },
        { name: "Neptune", note: "The letter doesn’t say." },
      ],
      afterwards: [
        "The novel ran until October 1839 and sold very well. Its picture of the Yorkshire schools was widely read, and those schools soon began to empty and close; the book is often given some of the credit.",
      ],
    },
    notes: [
      { term: "porter", note: "a dark beer, drunk by everyone in those days." },
      { term: "hashed", note: "chopped up and warmed through again." },
      { term: "“sheeps”", note: "the boy’s own word; he puts it in quotation marks." },
      { term: "Barham", note: "The edition calls him the Rev. Thomas Barham; the author of The Ingoldsby Legends was Richard Harris Barham." },
    ],
    keepsake: "1838",
    source: VOL1,
  },
  {
    id: "dickens-mitton-1842",
    day: 1,
    writtenAt: "Tremont House, Boston, 31 January 1842",
    deliverTo: "London",
    salutation: "My dear [[Mitton]],",
    body: [
      "I am so exhausted with the life I am obliged to lead here, that I have had time to write but one letter which is at all deserving of the name, as giving any account of our movements. Forster has it, in trust, to tell you all its news …",
      "We had a dreadful passage, the worst, the officers all concur in saying, that they have ever known. We were eighteen days coming; experienced a dreadful {{storm}} which swept away our paddle-boxes and stove our lifeboats; and ran aground besides, near Halifax, among rocks and breakers, where we lay at anchor all night. … I was ill five days, Kate six; though, indeed, she had a swelled face and suffered the utmost terror all the way.",
      "I can give you no conception of my welcome here. There never was a king or {{emperor}} upon the earth so cheered and followed by crowds, and entertained in public at splendid balls and dinners, and waited on by public bodies and deputations of all kinds. I have had one from the Far West—a journey of two thousand miles! If I go out in a {{carriage}}, the crowd surround it and escort me home; if I go to the {{theatre}}, the whole house (crowded to the roof) rises as one man, and the timbers ring again. You cannot imagine what it is. I have five great public dinners on hand at this moment, and invitations from every town and village and city in the States.",
      "There is a great deal afloat here in the way of subjects for description. I keep my {{eyes}} open pretty wide, and hope to have done so to some purpose by the time I come home.",
      "When you write to me again—I say again, hoping that your first letter will be soon upon its way here—direct to me to the care of David Colden, Esq., New York.",
    ],
    signoff: ["Always your faithful Friend."],
    blots: [
      { id: "storm", word: "storm", survive: [0, 3], decoys: ["picnic", "calm"] },
      { id: "emperor", word: "emperor", survive: [0, 4], decoys: ["beggar", "thief"] },
      { id: "carriage", word: "carriage", survive: [0, 4], decoys: ["fever", "temper"] },
      { id: "theatre", word: "theatre", survive: [0, 4], decoys: ["dentist", "bank"] },
      { id: "eyes", word: "eyes", survive: [0], decoys: ["boots", "umbrella"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "mitton",
      cards: [
        { id: "forster", name: "John Forster", note: "His closest friend, a London critic and journalist." },
        { id: "kate", name: "Kate", note: "His wife, Catherine." },
        { id: "mitton", name: "Thomas Mitton", note: "A schoolfellow from one of his first schools, now his solicitor in London." },
        { id: "colden", name: "David Colden", note: "A New York gentleman who had befriended him." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1842",
      options: [
        { id: "1836", name: "1836" },
        { id: "1842", name: "1842" },
        { id: "1849", name: "1849" },
        { id: "1867", name: "1867" },
      ],
    },
    clue: "In January 1842, aged twenty-nine, he crossed the Atlantic for the first time, with his wife, to see America.",
    story: [
      "The welcome soon soured. At public dinners he spoke up for an international copyright law, since American printers published British books without paying their authors anything, and the newspapers turned on him for it. He came home in June and wrote two books out of the trip, neither of them kind to America.",
    ],
    history: {
      context: [
        "His books were read all over America, mostly in cheap editions that paid him nothing: American law did not protect a foreign author’s work. He went to see the young republic he admired, and while he was there he made the case for copyright.",
        "He and Kate sailed from Liverpool in the first days of January on the Britannia, one of the new Cunard paddle steamers, leaving their four small children in London in the care of their friends the Macreadys. Their cabin, he told this same friend before sailing, was so small that neither of their trunks would go into it.",
        "Boston met them with crowds, and the rest of the country followed. Wherever they stopped, hundreds of people queued every day to shake their hands.",
      ],
      people: [
        { name: "Kate", note: "His wife, Catherine, terrified by the storm, who came with him for the whole tour." },
        { name: "Forster", note: "John Forster, his closest friend, who received his long letters home and passed the news round." },
        { name: "David Colden", note: "A New York friend who took charge of his post while he travelled." },
        { name: "Halifax", note: "In Nova Scotia, where the ship called on the way to Boston." },
      ],
      afterwards: [
        "The tour went south as far as Richmond, Virginia, west to St. Louis, and then north to Niagara and Canada. They sailed home from New York in June on a sailing packet, the George Washington.",
        "He did not go back to America for twenty-five years.",
      ],
    },
    notes: [
      { term: "paddle-boxes", note: "the casings over a steamer’s paddle wheels." },
      { term: "stove", note: "smashed in." },
      { term: "deputations", note: "groups sent to greet him on behalf of a town or a society." },
      { term: "Esq.", note: "Esquire, a courtesy title for a gentleman." },
    ],
    keepsake: "1842",
    source: VOL1,
  },
  {
    id: "dickens-gaskell-1850",
    day: 2,
    writtenAt: "Devonshire Terrace, London, 31 January 1850",
    deliverTo: "Manchester",
    salutation: "My dear [[Mrs. Gaskell]],",
    body: [
      "You may perhaps have seen an announcement in the papers of my intention to start a new cheap {{weekly}} journal of general literature.",
      "I do not know what your literary vows of temperance or abstinence may be, but as I do honestly know that there is no living English writer whose aid I would desire to enlist in preference to the authoress of “[[Mary Barton]]” (a book that most profoundly affected and impressed me), I venture to ask you whether you can give me any hope that you will write a short tale, or any number of tales, for the projected pages.",
      "No writer’s name will be used, neither my own nor any other; every paper will be published without any {{signature}}, and all will seem to express the general mind and purpose of the journal, which is the raising up of those that are {{down}}, and the general improvement of our social condition. I should set a value on your help which your {{modesty}} can hardly imagine …",
      "If you could and would prefer to speak to me on the subject, I should be very glad indeed to come to Manchester for a few hours and explain anything you might wish to know. My unaffected and great admiration of your book makes me very earnest in all relating to you. Forgive my troubling you for this reason, and believe me ever,",
    ],
    signoff: ["Faithfully yours."],
    postscript: "P.S.—[[!Mrs. Dickens]] and her sister send their love.",
    blots: [
      { id: "weekly", word: "weekly", survive: [0, 4], decoys: ["expensive", "silent"] },
      { id: "signature", word: "signature", survive: [0, 5], decoys: ["ink", "words"] },
      { id: "down", word: "down", survive: [0], decoys: ["rich", "tall"] },
      { id: "modesty", word: "modesty", survive: [0, 4], decoys: ["luggage", "umbrella"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "gaskell",
      cards: [
        { id: "bronte", name: "Charlotte Brontë", note: "Author of Jane Eyre, living at the parsonage in Haworth, Yorkshire." },
        { id: "martineau", name: "Harriet Martineau", note: "Writer on politics and economics, living at Ambleside in the Lake District." },
        { id: "gaskell", name: "Elizabeth Gaskell", note: "A minister’s wife in Manchester, whose first novel had made her name." },
        { id: "browning", name: "Elizabeth Barrett Browning", note: "Poet, living in Florence with her husband Robert." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1850",
      options: [
        { id: "1836", name: "1836" },
        { id: "1843", name: "1843" },
        { id: "1850", name: "1850" },
        { id: "1865", name: "1865" },
      ],
    },
    clue: "In 1850 he started a weekly magazine of his own, and went on editing one (under a new name from 1859) for the rest of his life.",
    story: [
      "She said yes. Her story “Lizzie Leigh” began in the very first number, on 30 March 1850, and over the next few years Cranford came out in the magazine a few chapters at a time.",
    ],
    history: {
      context: [
        "He was thirty-seven, the father of eight children, and in the middle of writing a novel in monthly numbers. For years he had wanted a magazine of his own, cheap enough for working people to buy and on their side.",
        "Mary Barton, published without its author’s name in 1848, told the story of a Manchester mill worker’s family in the hungry 1840s. It made her famous, and it was exactly the kind of writing he wanted for the new journal.",
        "Nothing in the magazine was signed except his own name at the top of every page, as its editor.",
      ],
      people: [
        { name: "Elizabeth Gaskell", note: "Born in 1810, married to William Gaskell, a Unitarian minister in Manchester, and the mother of daughters." },
        { name: "Mary Barton", note: "Her first novel, about poverty and unrest among Manchester’s cotton workers." },
        { name: "her sister", note: "His wife’s younger sister, who had lived with the family since 1842 and helped run the house." },
      ],
      afterwards: [
        "She wrote for him for years, though not always happily: when her novel North and South ran in the magazine in 1854 and 1855, the two of them clashed over its length and the weekly deadlines.",
        "She died in 1865, at fifty-five.",
      ],
    },
    notes: [
      { term: "vows of temperance or abstinence", note: "a joke: as if writing for magazines were drink, and she might have sworn off it." },
      { term: "authoress", note: "an old word for a woman author." },
      { term: "journal", note: "here, a magazine or periodical." },
    ],
    keepsake: "1850",
    source: VOL1,
  },
  {
    id: "dickens-stanfield-1854",
    day: 3,
    writtenAt: "Tavistock House, London, 3 November 1854",
    deliverTo: "Hampstead",
    salutation: "My dear [[Stanny]],",
    body: [
      "First of all, here is enclosed a letter for Mrs. [[Stanfield]], which, if you don’t immediately and faithfully deliver, you will hear of in an unpleasant way from the station-house at the curve of the hill above you.",
      "Secondly, this is not to remind you that we meet at the Athenaeum next {{monday}} at five, because none but a mouldy swab as never broke biscuit or lay out on the for’sel-yard-arm in a {{gale}} of wind ever forgot an appointment with a messmate.",
      "But what I want you to think of at your leisure is this: when our dear old Macready was in town last, I saw it would give him so much interest and pleasure if I promised to go down and read my “Christmas Carol” to the little Sherborne Institution, which is now one of the few active objects he has in the life about him, that I came out with that promise in a bold—I may say a {{swaggering}} way. Consequently, on Wednesday, the 20th of December, I am going down to see him, with Kate and Georgina, returning to town in good time for Christmas, on Saturday, the 23rd. Do you think you could manage to go and return with us? I really believe there is scarcely anything in the world that would give him such extraordinary pleasure as such a visit; and if you would empower me to send him an intimation that he may expect it, he will have a daily joy in looking forward to the time (I am seriously sure) which we—whose {{light}} has not gone out, and who are among our old dear pursuits and associations—can scarcely estimate.",
      "I don’t like to broach the idea in a careless way, and so I propose it thus, and ask you to think of it.",
    ],
    signoff: ["Ever most affectionately yours."],
    blots: [
      { id: "monday", word: "Monday", survive: [0, 3], decoys: ["purple", "midnight"] },
      { id: "gale", word: "gale", survive: [0], decoys: ["calm", "bath"] },
      { id: "swaggering", word: "swaggering", survive: [0, 3], decoys: ["timid", "sleepy"] },
      { id: "light", word: "light", survive: [0], decoys: ["money", "hair"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "stanfield",
      cards: [
        { id: "macready", name: "William Macready", note: "The great tragic actor, retired from the stage to Sherborne in Dorset." },
        { id: "stanfield", name: "Clarkson Stanfield", note: "A painter of the sea, who had been a sailor as a young man." },
        { id: "forster", name: "John Forster", note: "His closest friend, a critic and editor in London." },
        { id: "collins", name: "Wilkie Collins", note: "A young novelist, his newest close friend." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1854",
      options: [
        { id: "1838", name: "1838" },
        { id: "1847", name: "1847" },
        { id: "1854", name: "1854" },
        { id: "1863", name: "1863" },
      ],
    },
    clue: "From 1853 he gave readings of his own work for good causes, and the favourite was always his Christmas story of a miser visited by ghosts.",
    story: [
      "He kept his promise, and read the Carol to the Sherborne Institution the week before Christmas. It was the kind of evening he was giving more and more: alone on a platform with a reading desk, doing all the voices.",
    ],
    history: {
      context: [
        "He was forty-two and had been famous for nearly twenty years. A year earlier, at Christmas 1853, he had given his first public readings, in Birmingham, to raise money for an institute for working men; one night was kept for working people only, and two thousand of them came.",
        "Macready, the greatest tragic actor of his day and one of his oldest friends, had left the stage in 1851 and retired to Sherborne, a small town in Dorset. His wife died the next year, and the town’s literary institution had become one of the few things he still threw himself into.",
        "Stanfield had gone to sea as a boy before he became a scene painter and then one of the best-known painters of ships and the sea in England. His friend liked to write to him in sailors’ slang.",
      ],
      people: [
        { name: "Stanny", note: "Clarkson Stanfield, an old friend who also painted scenery for the amateur plays put on at the writer’s house." },
        { name: "Mrs. Stanfield", note: "His wife; the enclosed letter was for her." },
        { name: "Macready", note: "William Charles Macready, the actor, a friend since 1837." },
        { name: "Kate and Georgina", note: "The writer’s wife, Catherine, and her younger sister, who lived with them." },
        { name: "the Athenaeum", note: "A London club for writers, artists and men of learning." },
      ],
      afterwards: [
        "In 1858 he began giving readings for money, and they became the great work of his last twelve years: hundreds of nights in Britain and America, which earned him a fortune and wore him out.",
        "Stanfield died in 1867. Macready outlived them both, dying in 1873.",
      ],
    },
    notes: [
      { term: "station-house", note: "a police station." },
      { term: "mouldy swab … broke biscuit", note: "sailors’ talk: a useless, lazy seaman who never ate ship’s biscuit with the crew." },
      { term: "for’sel-yard-arm", note: "the end of the spar that carries the foresail." },
      { term: "messmate", note: "a shipmate who eats at the same table." },
      { term: "intimation", note: "notice." },
    ],
    keepsake: "1854",
    source: VOL1,
  },
  {
    id: "dickens-plorn-1868",
    day: 4,
    writtenAt: "England, September 1868",
    deliverTo: "Bound for Australia",
    salutation: "My dearest [[Plorn]],",
    body: [
      "I write this note to-day because your going away is much upon my mind, and because I want you to have a few parting words from me to think of now and then at quiet times. I need not tell you that I love you {{dearly}}, and am very, very sorry in my heart to part with you. But this life is half made up of partings, and these pains must be borne. It is my comfort and my sincere conviction that you are going to try the life for which you are beat fitted. I think its freedom and wildness more suited to you than any experiment in a study or {{office}} would ever have been …",
      "What you have already wanted until now has been a set, steady, constant purpose. I therefore exhort you to persevere in a thorough determination to do whatever you have to do as well as you can do it. I was not so old as you are now when I first had to win my {{food}}, and do this out of this determination, and I have never slackened in it since.",
      "Never take a mean advantage of anyone in any transaction, and never be {{hard}} upon people who are in your power. Try to do to others, as you would have them do to you, and do not be discouraged if they fail sometimes.",
      "I put a New Testament among your books, for the very same reasons, and with the very same hopes that made me write an easy account of it for you, when you were a little child; because it is the best book that ever was or will be known in the world … As your brothers have gone away, one by one, I have written to each such words as I am now writing to you …",
      "I hope you will always be able to say in after life, that you had a kind father. You cannot show your affection for him so well, or make him so happy, as by doing your duty.",
    ],
    signoff: ["Your affectionate Father."],
    blots: [
      { id: "dearly", word: "dearly", survive: [0, 3], decoys: ["rarely", "slightly"] },
      { id: "office", word: "office", survive: [0, 4], decoys: ["field", "jungle"] },
      { id: "food", word: "food", survive: [0], decoys: ["slippers", "birthday"] },
      { id: "hard", word: "hard", survive: [0, 3], decoys: ["kind", "gentle"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "plorn",
      cards: [
        { id: "alfred", name: "Alfred", note: "A son who had gone out to Australia in 1865." },
        { id: "harry", name: "Harry", note: "A son of nineteen, about to go up to Cambridge." },
        { id: "plorn", name: "Plorn", note: "Edward, his youngest son, sixteen." },
        { id: "charley", name: "Charley", note: "His eldest son, married, with children of his own." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1868",
      options: [
        { id: "1846", name: "1846" },
        { id: "1852", name: "1852" },
        { id: "1861", name: "1861" },
        { id: "1868", name: "1868" },
      ],
    },
    clue: "At twelve, while his father was in a debtors’ prison, he worked in a warehouse pasting labels on pots of boot blacking: that is the food he had to win.",
    story: [
      "Plorn left on 26 September 1868 to join his brother Alfred in Australia. His father saw him off at the station and wrote home that evening that the boy had been crying, but had gone away as well as could be expected. “These are hard, hard things,” he added.",
      "They never saw each other again.",
    ],
    history: {
      context: [
        "He had ten children, and worried most about his sons. One after another they went out into the world: to India, into the Navy, to Australia. To each of them he wrote a letter like this one.",
        "Plorn, born in 1852, was the youngest; the nickname was one of the many odd names his father gave his children. His father thought the free, outdoor life of Australia would suit him better than any office.",
        "That spring he had come home from five months of readings across America, ill and exhausted. Within weeks of this letter he began a farewell reading tour of Britain.",
      ],
      people: [
        { name: "Plorn", note: "Edward, the youngest of the ten." },
        { name: "your brothers", note: "Walter had gone to India as a soldier and died there in 1863; Frank had gone to India too; Sydney was in the Navy; Alfred was already in Australia." },
        { name: "an easy account of it", note: "A short life of Jesus he wrote for his own children in the 1840s, never meant for publication. It was finally printed in 1934." },
      ],
      afterwards: [
        "He gave his last public reading in London in March 1870. On 9 June that year he died at his house in Kent, aged fifty-eight, leaving a novel half written, and was buried in Westminster Abbey.",
        "Plorn spent the rest of his life in Australia. He farmed, went into business, and served for a time in the parliament of New South Wales. He died there in 1902.",
      ],
    },
    notes: [
      { term: "beat fitted", note: "so in this edition; it means “best fitted”." },
      { term: "exhort", note: "urge." },
      { term: "slackened", note: "eased off." },
    ],
    keepsake: "1868",
    source: VOL2,
  },
];

export const DICKENS_WEEK: Week = {
  id: "2026-w49-dickens",
  number: 7,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-11-30",
  letters: DICKENS_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["dickens", "boz"],
    reject: ["catherine", "kate", "katey", "mamie", "charley", "georgina", "fanny", "frederick", "alfred", "plorn", "henry", "harry", "walter", "john"],
    hide: ["Boz"],
    answer: "Charles Dickens",
    years: "1812–1870",
    reveal: [
      "The most popular novelist of Victorian England. A boy who had pasted labels in a blacking warehouse while his father sat in a debtors’ prison, he wrote The Pickwick Papers at twenty-four, then Oliver Twist, Nicholas Nickleby, A Christmas Carol, David Copperfield, Bleak House, Great Expectations and more, most of them first sold in cheap monthly numbers.",
      "He edited his own magazines for twenty years, fought for poor children and against bad schools, prisons and workhouses, and in his last years read his stories aloud to enormous crowds on both sides of the Atlantic.",
    ],
    coda: "Five letters, thirty years: orders from a small boy, a mobbed traveller, an editor asking a favour, a promise kept at Christmas, and a father’s goodbye.",
  },
  next: "Next month’s bundles are still being sorted.",
  timeline: [
    { year: "1812", text: "Born on 7 February in Portsmouth, the second child of a clerk in the Navy Pay Office." },
    { year: "1824", text: "His father is jailed for debt in the Marshalsea; at twelve he works in a blacking warehouse." },
    { year: "1833", text: "His first story appears in a London magazine, unsigned." },
    { year: "1836", text: "The Pickwick Papers starts in monthly numbers and makes him famous. Marries Catherine Hogarth." },
    { year: "1838", text: "Nicholas Nickleby begins; a small boy sends instructions.", letters: [0] },
    { year: "1842", text: "First visit to America, with Kate.", letters: [1] },
    { year: "1843", text: "A Christmas Carol comes out on 19 December." },
    { year: "1850", text: "Starts his weekly magazine, Household Words, and asks Elizabeth Gaskell to write for it.", letters: [2] },
    { year: "1854", text: "Reads the Carol for good causes, at Sherborne for Macready among them.", letters: [3] },
    { year: "1858", text: "Begins reading for money; separates from Catherine." },
    { year: "1867", text: "Goes back to America for a reading tour, November 1867 to April 1868." },
    { year: "1868", text: "Plorn, his youngest, leaves for Australia.", letters: [4] },
    { year: "1870", text: "Gives his last reading in March and dies at Gad’s Hill on 9 June, leaving Edwin Drood unfinished." },
  ],
};
