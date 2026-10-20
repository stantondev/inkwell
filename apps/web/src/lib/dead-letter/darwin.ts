// Week 3: Charles Darwin, 1831–1872. DRAFT: drafted by Claude on 2026-10-19,
// waiting for a person to read it through and approve it.
//
// Text from Life and Letters of Charles Darwin, ed. Francis Darwin (Project
// Gutenberg #2087 and #2088), public domain. Every quoted line is checked
// against it by `npm run check:letters`. "…" marks a cut.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const VOLUME_1 = {
  title: "Life and Letters of Charles Darwin, Volume 1, ed. Francis Darwin (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/2087",
  textUrl: "https://www.gutenberg.org/cache/epub/2087/pg2087.txt",
};

const VOLUME_2 = {
  title: "Life and Letters of Charles Darwin, Volume 2, ed. Francis Darwin (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/2088",
  textUrl: "https://www.gutenberg.org/cache/epub/2088/pg2088.txt",
};

export const DARWIN_LETTERS: DeadLetter[] = [
  {
    id: "darwin-father-1831",
    day: 0,
    writtenAt: "Maer Hall, Staffordshire, 31 August 1831",
    deliverTo: "Shrewsbury",
    salutation: "My dear [[Father]],",
    body: [
      "I am afraid I am going to make you again very uncomfortable. But, upon consideration, I think you will excuse me once again, stating my opinions on the offer of the {{voyage}}. My excuse and reason is the different way all the Wedgwoods view the subject from what you and my sisters do.",
      "I have given Uncle Jos … what I fervently trust is an accurate and full list of your {{objections}}, and he is kind enough to give his opinions on all. The list and his answers will be enclosed. But may I beg of you one favour, it will be doing me the greatest kindness, if you will send me a decided answer, yes or no? If the latter, I should be most ungrateful if I did not implicitly yield to your better judgment, and to the kindest indulgence you have shown me all through my life; and you may rely upon it I will never mention the subject again.",
      "The {{danger}} appears to me and all the Wedgwoods not great. The expense cannot be serious, and the time I do not think, anyhow, would be more thrown away then if I stayed at home. But pray do not consider that I am so bent on going that I would for one SINGLE MOMENT hesitate, if you thought that after a short period you should continue uncomfortable.",
      "I must again state I cannot think it would unfit me hereafter for a {{steady}} life. I do hope this letter will not give you much uneasiness. … I do not know what to say about Uncle Jos’ kindness; I never can forget how he interests himself about me.",
    ],
    signoff: ["Believe me, my dear [[father]],", "Your affectionate [[son]], [[!Charles Darwin]]."],
    blots: [
      { id: "voyage", word: "voyage", survive: [0, 3], decoys: ["piano", "bonnet"] },
      { id: "objections", word: "objections", survive: [0, 5], decoys: ["puddings", "hats"] },
      { id: "danger", word: "danger", survive: [0, 3], decoys: ["breakfast", "music"] },
      { id: "steady", word: "steady", survive: [0, 4], decoys: ["noisy", "purple"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "father",
      cards: [
        { id: "father", name: "Robert", note: "His father, a doctor in Shrewsbury." },
        { id: "uncle-jos", name: "Josiah Wedgwood", note: "His mother’s brother, of Maer Hall in Staffordshire." },
        { id: "henslow", name: "John Henslow", note: "Professor of botany at Cambridge, his teacher and friend." },
        { id: "caroline", name: "Caroline", note: "One of his sisters, at home in Shrewsbury." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1831",
      options: [
        { id: "1825", name: "1825" },
        { id: "1831", name: "1831" },
        { id: "1839", name: "1839" },
        { id: "1846", name: "1846" },
      ],
    },
    clue: "In 1831 he was 22, just through Cambridge, and had been offered a place on HMS Beagle, a navy ship about to survey the coasts of South America.",
    story: [
      "His father had said no, but added that if his son could find any man of common sense who advised him to go, he would give his consent. Uncle Jos was that man. He offered to drive his nephew the thirty miles to Shrewsbury and talk it over, and the father consented at once.",
    ],
    history: {
      context: [
        "He was the son of a well-off doctor in Shrewsbury. His mother died when he was eight. He was sent to Edinburgh to study medicine and couldn’t bear it, so his father moved him to Cambridge to train as a clergyman. There he spent much of his time collecting beetles, out shooting, and walking with the botany professor, John Henslow.",
        "In August 1831 Henslow wrote with an offer. Captain Robert FitzRoy of HMS Beagle wanted a young gentleman to sail with him as a companion and naturalist on a survey voyage. It was expected to take about two years.",
        "His father was against it, and he wrote the objections down for Uncle Jos to answer. Among them: that it would be disreputable for a future clergyman, that it was a wild scheme, that others must have been offered the place first, that he would never settle down to a steady life, and that it would be useless.",
      ],
      people: [
        { name: "Father", note: "Robert, a large, shrewd doctor whom his son called the kindest man he ever knew." },
        { name: "Uncle Jos", note: "Josiah Wedgwood of Maer Hall, son of the founder of the Wedgwood pottery works. He answered every objection in a letter of his own." },
        { name: "the Wedgwoods", note: "His mother’s family at Maer, where he spent many happy autumns." },
        { name: "Henslow", note: "John Stevens Henslow, the Cambridge botanist who recommended him for the voyage." },
      ],
      afterwards: [
        "He later learned he had nearly been turned down anyway: the captain believed you could read a man’s character from his face, and doubted whether anyone with his nose could have the energy for the voyage.",
        "The Beagle sailed from Plymouth on 27 December 1831 and came home on 2 October 1836, nearly five years later. He called it by far the most important event in his life. He never became a clergyman.",
      ],
    },
    notes: [
      { term: "implicitly yield", note: "give way without question." },
      { term: "SINGLE MOMENT", note: "the capitals stand for words he underlined." },
      { term: "unfit me hereafter", note: "spoil me for later life." },
    ],
    keepsake: "1831",
    source: VOLUME_1,
  },
  {
    id: "darwin-hooker-1844",
    day: 1,
    writtenAt: "Down, Kent, 11 January 1844",
    deliverTo: "Kew, near London",
    salutation: "",
    body: [
      "Besides a general interest about the southern lands, I have been now ever since my return engaged in a very presumptuous work, and I know no one individual who would not say a very {{foolish}} one. I was so struck with the distribution of the Galapagos organisms, etc. etc., and with the character of the American fossil mammifers, etc. etc., that I determined to collect blindly every sort of fact, which could bear any way on what are species.",
      "I have read heaps of agricultural and horticultural books, and have never ceased collecting facts. At last gleams of {{light}} have come, and I am almost convinced (quite contrary to the opinion I started with) that species are not (it is like confessing a {{murder}}) immutable. Heaven forfend me from Lamarck nonsense of a “tendency to progression,” “adaptations from the slow willing of animals,” etc.! But the conclusions I am led to are not widely different from his; though the means of change are wholly so. I think I have found out (here’s presumption!) the simple way by which species become exquisitely adapted to various ends. You will now {{groan}}, and think to yourself, “on what a man have I been wasting my time and writing to.” I should, five years ago, have thought so…",
    ],
    signoff: [],
    blots: [
      { id: "foolish", word: "foolish", survive: [0, 4], decoys: ["sunny", "musical"] },
      { id: "light", word: "light", survive: [0], decoys: ["soup", "rain"] },
      { id: "murder", word: "murder", survive: [0, 3], decoys: ["birthday", "recipe"] },
      { id: "groan", word: "groan", survive: [0, 3], decoys: ["dance", "sing"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "hooker",
      cards: [
        { id: "lyell", name: "Charles Lyell", note: "The leading geologist in Britain, a friend since the voyage." },
        { id: "hooker", name: "Joseph Hooker", note: "A young botanist just home from four years in the Antarctic with Captain James Ross." },
        { id: "henslow", name: "John Henslow", note: "His old botany professor at Cambridge." },
        { id: "fox", name: "William Fox", note: "His second cousin, a country clergyman; they had hunted beetles together at Cambridge." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1844",
      options: [
        { id: "1836", name: "1836" },
        { id: "1844", name: "1844" },
        { id: "1852", name: "1852" },
        { id: "1859", name: "1859" },
      ],
    },
    clue: "By 1844 he had been home from the voyage for seven years, and had told almost no one what he really thought about species.",
    story: [
      "Hooker, by his own account, was the first person he told. This is the passage Hooker copied out years later to prove it. Six months after writing it, he finished a long sketch of the theory and left his wife a note: if he died suddenly, she was to spend £400 on getting it published.",
    ],
    history: {
      context: [
        "Most naturalists of the day believed each species had been created as it is and never changed. On the voyage he had seen things that didn’t fit: on the Galapagos Islands, birds and plants that were close relatives of South American ones but different on each island, and in South America, fossils of giant extinct animals related to the small ones living there now.",
        "Back in England he married his cousin Emma, and in 1842 they moved to Down, a village in Kent, partly to escape London and his poor health. In private notebooks he gathered every fact he could about how plants and animals vary, including from pigeon breeders and gardeners.",
        "Joseph Hooker had read the proofs of his book about the voyage before setting off for the Antarctic, and later said he slept with them under his pillow. Their letters began as soon as Hooker came home, at the end of 1843.",
      ],
      people: [
        { name: "Joseph Dalton Hooker", note: "Botanist, then 26, son of the director of Kew Gardens." },
        { name: "the southern lands", note: "The far south Hooker had just visited: Tierra del Fuego, the Falklands and the Antarctic islands." },
        { name: "Lamarck", note: "Jean-Baptiste Lamarck, a French naturalist who argued that animals change as they strive and pass the changes on." },
      ],
      afterwards: [
        "Hooker didn’t groan. He became his closest friend, read the sketch, and stayed beside him for forty years. In 1865 he became director of Kew himself.",
        "Late in 1844 an anonymous book about the history of life, the Vestiges of Creation, caused an uproar. It made him all the more careful, and he went on gathering facts for another fourteen years.",
      ],
    },
    notes: [
      { term: "presumptuous", note: "overbold." },
      { term: "mammifers", note: "mammals." },
      { term: "immutable", note: "unchangeable." },
      { term: "Heaven forfend me", note: "Heaven forbid." },
      { term: "the text", note: "This edition prints only this part of the letter, without its opening or signature." },
    ],
    keepsake: "1844",
    source: VOLUME_1,
  },
  {
    id: "darwin-lyell-1858",
    day: 2,
    writtenAt: "Down, Kent, 18 June 1858",
    deliverTo: "London",
    salutation: "My dear [[Lyell]],",
    body: [
      "Some year or so ago you recommended me to read a paper by [[Wallace]] in the ‘Annals’ … which had interested you, and, as I was writing to him, I knew this would please him much, so I told him. He has to-day sent me the enclosed, and asked me to forward it to you. It seems to me well worth reading. Your words have come true with a {{vengeance}}—that I should be {{forestalled}}. You said this, when I explained to you here very briefly my views of ‘Natural Selection’ depending on the struggle for existence. I never saw a more striking {{coincidence}}; if [[Wallace]] had my MS. sketch written out in 1842, he could not have made a better short abstract! Even his terms now stand as heads of my chapters.",
      "Please return me the MS., which he does not say he wishes me to publish, but I shall of course, at once write and offer to send to any journal. So all my {{originality}}, whatever it may amount to, will be smashed, though my book, if it will ever have any value, will not be deteriorated; as all the labour consists in the application of the theory.",
      "I hope you will approve of [[Wallace]]’s sketch, that I may tell him what you say.",
    ],
    signoff: ["My dear [[Lyell]], yours most truly,", "[[!C. Darwin]]."],
    blots: [
      { id: "vengeance", word: "vengeance", survive: [0, 4], decoys: ["teaspoon", "pillow"] },
      { id: "forestalled", word: "forestalled", survive: [0, 6], decoys: ["taller", "sunburnt"] },
      { id: "coincidence", word: "coincidence", survive: [0, 3, 7], decoys: ["sunset", "hat"] },
      { id: "originality", word: "originality", survive: [0, 5], decoys: ["eyesight", "luggage"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "lyell",
      cards: [
        { id: "hooker", name: "Joseph Hooker", note: "Botanist at Kew, his closest friend." },
        { id: "wallace", name: "Alfred Russel Wallace", note: "A younger naturalist, collecting birds and insects in the Malay Archipelago." },
        { id: "lyell", name: "Charles Lyell", note: "Britain’s leading geologist, who had been urging him to publish." },
        { id: "gray", name: "Asa Gray", note: "Professor of botany at Harvard." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1858",
      options: [
        { id: "1842", name: "1842" },
        { id: "1851", name: "1851" },
        { id: "1858", name: "1858" },
        { id: "1866", name: "1866" },
      ],
    },
    clue: "In 1858 he was two years into writing a huge book on species, at Lyell’s urging, and about halfway through.",
    story: [
      "Wallace had worked out the same theory by himself, on the other side of the world, and posted his essay to the one naturalist he knew was thinking about the question. He asked that it be passed on to Lyell.",
    ],
    history: {
      context: [
        "For fourteen years he had shown his theory to only a handful of friends. Early in 1856 Lyell advised him to write it out fully, and he began a book three or four times as long as the one that was eventually published.",
        "Alfred Russel Wallace earned his living collecting specimens for museums and collectors, first in the Amazon and then in the islands between Asia and Australia. The two had exchanged letters. Neither knew the other had reached the same answer: that in the struggle for existence, the variations that help survive are the ones passed on.",
        "He was ready to give up his claim and publish Wallace’s essay alone. Lyell and Hooker wouldn’t let him.",
      ],
      people: [
        { name: "Charles Lyell", note: "Author of the Principles of Geology, which he had read on the Beagle, and a mentor ever since." },
        { name: "Wallace", note: "Alfred Russel Wallace, fourteen years younger, then in the Malay Archipelago." },
        { name: "the ‘Annals’", note: "The Annals and Magazine of Natural History, where Wallace’s earlier paper appeared in 1855." },
        { name: "my MS. sketch", note: "His first written outline of the theory, from 1842." },
      ],
      afterwards: [
        "Lyell and Hooker arranged for Wallace’s essay, an extract from his own sketch and a letter he had sent Asa Gray in 1857 to be read together at the Linnean Society in London on 1 July 1858. Neither author was there. Hardly anyone noticed: the one review he remembered said that all that was new in them was false, and what was true was old.",
        "He then wrote the shorter book in thirteen months and ten days. On the Origin of Species came out in November 1859, and the first 1,250 copies were sold to booksellers on the first day. Wallace was generous about it for the rest of his life.",
      ],
    },
    notes: [
      { term: "forestalled", note: "beaten to it." },
      { term: "MS.", note: "manuscript." },
      { term: "heads of my chapters", note: "the titles of his chapters." },
      { term: "deteriorated", note: "made worse." },
      { term: "the date", note: "This is the date the edition gives. Historians have long argued about exactly when Wallace’s essay arrived." },
    ],
    keepsake: "1858",
    source: VOLUME_1,
  },
  {
    id: "darwin-gray-1860",
    day: 3,
    writtenAt: "Down, Kent, early 1860",
    deliverTo: "Cambridge, Massachusetts",
    salutation: "",
    body: [
      "… Now I will just run through some points in your letter. What you say about my book gratifies me most deeply, and I wish I could feel all was deserved by me. I quite think a review from a man, who is not an entire {{convert}}, if fair and moderately favourable, is in all respects the best kind of review. About the weak points I agree. The {{eye}} to this day gives me a cold shudder, but when I think of the fine known gradations, my reason tells me I ought to {{conquer}} the cold shudder.",
      "Pray kindly remember and tell Prof. Wyman how very grateful I should be for any hints, information, or criticisms. I have the highest respect for his opinion. I am so sorry about Dana’s {{health}}. I have already asked him to pay me a visit.",
      "Farewell, you have laid me under a load of obligation—not that I feel it a load. It is the highest possible gratification to me to think that you have found my book worth reading and reflection; for you and three others I put down in my own mind as the judges whose opinions I should value most of all.",
    ],
    signoff: ["My dear [[Gray]], yours most sincerely,", "[[!C. Darwin]]."],
    postscript:
      "P.S.—I feel pretty sure, from my own experience, that if you are led by your studies to keep the subject of the origin of species before your mind, you will go further and further in your belief. It took me long years, and I assure you I am astonished at the impression my book has made on many minds. I fear twenty years ago, I should not have been half as candid and open to conviction.",
    blots: [
      { id: "convert", word: "convert", survive: [0, 4], decoys: ["teapot", "orphan"] },
      { id: "eye", word: "eye", survive: [0], decoys: ["piano", "bonnet"] },
      { id: "conquer", word: "conquer", survive: [0, 4], decoys: ["paint", "borrow"] },
      { id: "health", word: "health", survive: [0, 5], decoys: ["victory", "wedding"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "gray",
      cards: [
        { id: "huxley", name: "Thomas Huxley", note: "A young London zoologist who had praised the book in The Times." },
        { id: "hooker", name: "Joseph Hooker", note: "Botanist at Kew, his closest friend." },
        { id: "gray", name: "Asa Gray", note: "Professor of botany at Harvard, writing about the book for an American journal." },
        { id: "sedgwick", name: "Adam Sedgwick", note: "His old geology teacher at Cambridge, who attacked the book." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1860",
      options: [
        { id: "1832", name: "1832" },
        { id: "1848", name: "1848" },
        { id: "1860", name: "1860" },
        { id: "1875", name: "1875" },
      ],
    },
    clue: "In early 1860 his book on species had been out for three months, and reviews, kind and savage, were arriving every week.",
    story: [
      "Gray kept his word and more. He defended the book in a run of magazine articles that year, printed as a pamphlet in 1861, and worked to make the American publishers pay the author something for their edition.",
    ],
    history: {
      context: [
        "On the Origin of Species came out on 24 November 1859. Friends, enemies and newspapers wrote about it at once. He cared most about what a few working naturalists thought, and in this letter he tells Gray he is one of the four whose judgment he values most.",
        "Asa Gray had been writing to him since 1855, and in 1857 was one of the very few he told the whole theory in a letter. Gray was a devout Christian and never gave up the idea that the variation the theory depends on might be guided, but he thought the theory fair and worth a hearing in America.",
        "The eye was the hardest case: how could anything so finely made be built in small steps? His answer was the “fine known gradations”: the many kinds of eye that living animals have, from simple to complex, each useful to its owner.",
      ],
      people: [
        { name: "Asa Gray", note: "Professor of botany at Harvard, in Cambridge, Massachusetts." },
        { name: "Prof. Wyman", note: "Jeffries Wyman, an anatomist at Harvard and a friend of Gray’s." },
        { name: "Dana", note: "James Dwight Dana, the Yale geologist, who was ill at the time." },
      ],
      afterwards: [
        "A few weeks later he wrote to Gray that the thought of the eye no longer made him cold all over, but that the sight of a feather in a peacock’s tail, whenever he gazed at it, made him sick. Why would anything so useless and gorgeous survive? His answer, that peahens choose the showiest males, came in The Descent of Man in 1871.",
        "They wrote to each other for the rest of his life.",
      ],
    },
    notes: [
      { term: "an entire convert", note: "someone who agrees with all of it." },
      { term: "gradations", note: "small steps in between." },
      { term: "the date", note: "This edition dates the letter only as “February? 1860”." },
    ],
    keepsake: "1860",
    source: VOLUME_2,
  },
  {
    id: "darwin-haliburton-1872",
    day: 4,
    writtenAt: "Down, Kent, 1 November 1872",
    deliverTo: "near London",
    salutation: "My dear Mrs. [[Haliburton]],",
    body: [
      "I dare say you will be surprised to hear from me. My object in writing now is to say that I have just published a book on the ‘Expression of the {{emotions}} in Man and Animals;’ and it has occurred to me that you might possibly like to read some parts of it; and I can hardly think that this would have been the case with any of the books which I have already published. So I send by this post my present book. Although I have had no communication with you or the other members of your family for so long a time, no scenes in my whole life pass so frequently or so vividly before my mind as those which relate to happy old days spent at Woodhouse. I should very much like to hear a little news about yourself and the other members of your family, if you will take the trouble to write to me. Formerly I used to glean some news about you from my {{sisters}}.",
      "I have had many years of bad health and have not been able to visit anywhere; and now I feel very old. As long as I pass a perfectly uniform life, I am able to do some daily work in Natural History, which is still my {{passion}}, as it was in old days, when you used to laugh at me for collecting {{beetles}} with such zeal at Woodhouse. Excepting from my continued il-health, which has excluded me from society, my life has been a very happy one; the greatest drawback being that several of my children have inherited from me feeble health. I hope with all my heart that you retain, at least to a large extent, the famous “[[Owen]] constitution.” With sincere feelings of gratitude and affection for all bearing the name of [[Owen]], I venture to sign myself,",
    ],
    signoff: ["Yours affectionately, [[!Charles Darwin]]."],
    blots: [
      { id: "emotions", word: "Emotions", survive: [0, 3], decoys: ["Planets", "Railways"] },
      { id: "sisters", word: "sisters", survive: [0, 4], decoys: ["horses", "hedgehogs"] },
      { id: "passion", word: "passion", survive: [0, 3], decoys: ["landlord", "umbrella"] },
      { id: "beetles", word: "beetles", survive: [0, 4], decoys: ["puddings", "thunder"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "sarah",
      cards: [
        { id: "emma", name: "Emma", note: "His wife, born Emma Wedgwood, his cousin." },
        { id: "henrietta", name: "Henrietta", note: "His daughter, married in 1871 and living in London." },
        { id: "sarah", name: "Sarah Haliburton", note: "Daughter of his father’s old friend Mr. Owen, of Woodhouse in Shropshire." },
        { id: "caroline", name: "Caroline", note: "His elder sister, long married." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1872",
      options: [
        { id: "1838", name: "1838" },
        { id: "1859", name: "1859" },
        { id: "1872", name: "1872" },
        { id: "1881", name: "1881" },
      ],
    },
    clue: "As a young man he spent his autumns shooting and beetle-hunting at Woodhouse, the Owen family’s house in Shropshire.",
    story: [
      "Sarah wrote back at once. Five days later he answered “My dear Sarah”, thanked her for a charming letter, invited her to Down, and offered to send a photograph of himself “now that I am old”.",
    ],
    history: {
      context: [
        "He had lived at Down for thirty years. Years of illness kept him at home, working to the same timetable every day: a walk round his gravel path, letters, and a few hours of work.",
        "The Expression of the Emotions in Man and Animals, published in November 1872, compared smiles, frowns, blushes and snarls in people and animals, and was illustrated with photographs of faces. Unlike his books on species, barnacles or orchids, it was one an old friend might simply enjoy.",
        "Woodhouse was the home of Mr. Owen, an old friend of his father’s. The Owen children had known him since he was a boy who came to shoot in the autumn and filled his pockets with beetles.",
      ],
      people: [
        { name: "Mrs. Haliburton", note: "Sarah, born an Owen. Her husband, Judge Haliburton, was the well-known author of the comic Sam Slick stories." },
        { name: "Woodhouse", note: "The Owens’ house in Shropshire." },
        { name: "my sisters", note: "Who had stayed in touch with the Owens after he moved away." },
        { name: "the Owen constitution", note: "a family joke about the Owens’ famously sturdy health." },
      ],
      afterwards: [
        "They went on writing. In 1880 he began a letter “My dear Sarah”, saying he had always loved that name, and recalled how proud he had been as a boy to see his name in a book about beetles: “captured” sounded so much grander than “caught”.",
        "His last book, in 1881, was about earthworms. He died at Down on 19 April 1882, aged 73, and was buried in Westminster Abbey, near Isaac Newton.",
      ],
    },
    notes: [
      { term: "glean", note: "gather in bits and pieces." },
      { term: "uniform life", note: "every day the same." },
      { term: "constitution", note: "the body’s strength and health." },
    ],
    keepsake: "1872",
    source: VOLUME_2,
  },
];

export const DARWIN_WEEK: Week = {
  id: "2026-w45-darwin",
  number: 3,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-11-02",
  letters: DARWIN_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["darwin"],
    reject: ["erasmus", "emma", "francis", "waring", "george", "horace", "leonard", "william", "henrietta", "susannah", "robert darwin"],
    answer: "Charles Darwin",
    years: "1809–1882",
    reveal: [
      "The naturalist who sailed round the world on HMS Beagle and came home with the idea that living things change over time by natural selection. On the Origin of Species, published in 1859, changed how people understood life on Earth.",
      "He was born in Shrewsbury on 12 February 1809, the very same day as Abraham Lincoln. He spent most of his life at Down House in Kent, unwell, surrounded by his family, and writing letters: thousands of them, to anyone who could tell him a fact.",
    ],
    coda: "Five letters, forty-one years: a son begging to go to sea, a confession, a rival’s essay, a friend across the ocean, and a note to someone who laughed at his beetles.",
  },
  next: "Next week’s writer learned to write letters without ever seeing a page.",
  timeline: [
    { year: "1809", text: "Born on 12 February in Shrewsbury, son of a doctor. His mother dies when he is eight." },
    { year: "1825", text: "Studies medicine at Edinburgh and gives it up; in 1828 goes to Cambridge to become a clergyman." },
    { year: "1831", text: "Offered a place on HMS Beagle; pleads with his father.", letters: [0] },
    { year: "1836", text: "Comes home on 2 October after nearly five years at sea." },
    { year: "1839", text: "Marries his cousin Emma Wedgwood and publishes his journal of the voyage." },
    { year: "1842", text: "Moves to Down House in Kent, his home for the rest of his life." },
    { year: "1844", text: "Confesses to Hooker that species are not immutable.", letters: [1] },
    { year: "1858", text: "Wallace’s essay arrives; their papers are read together in London.", letters: [2] },
    { year: "1859", text: "On the Origin of Species is published on 24 November." },
    { year: "1860", text: "Answers Asa Gray on the book’s weak points.", letters: [3] },
    { year: "1871", text: "The Descent of Man." },
    { year: "1872", text: "The Expression of the Emotions; writes to an old friend from Woodhouse.", letters: [4] },
    { year: "1882", text: "Dies at Down on 19 April, aged 73, and is buried in Westminster Abbey." },
  ],
};
