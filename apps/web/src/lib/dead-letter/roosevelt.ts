// Week: letters from Theodore Roosevelt to his children.
//
// Text from Letters to His Children (1919), edited by Joseph Bucklin Bishop,
// public domain in the US, via Project Gutenberg (#6467). Quoted exactly; the
// book's "--" dashes are set as "—", and "…" marks a cut. Clue cards, clues
// and stories are written for Inkwell.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const SOURCE = {
  title: "Letters to His Children, ed. Joseph Bucklin Bishop (1919), Project Gutenberg",
  url: "https://www.gutenberg.org/ebooks/6467",
  textUrl: "https://www.gutenberg.org/cache/epub/6467/pg6467.txt",
};

export const ROOSEVELT_WEEK_LETTERS: DeadLetter[] = [
  {
    id: "roosevelt-bunnies-1898",
    day: 0,
    writtenAt: "the army camp at Tampa, Florida, 6 May 1898",
    deliverTo: "At home",
    salutation: "Blessed Bunnies,",
    body: [
      "It has been a real holiday to have darling mother here. Yesterday I brought her out to the camp, and she saw it all—the men drilling, the tents in long company streets, the horses being taken to water, my little horse Texas, the colonel and the majors, and finally the mountain lion and the jolly little dog Cuba, who had several fights while she looked on. The mountain lion is not much more than a {{kitten}} as yet, but it is very cross and treacherous.",
      "I was very much interested in Kermit’s and Ethel’s letters to-day.",
      "We were all, horses and men, four days and four nights on the cars coming here from San Antonio, and were very tired and very {{dirty}} when we arrived. … There are nearly thirty thousand troops here now, besides the sailors from the war-ships in the bay. … Most of them are in blue, but our rough-riders are in {{brown}}. Our camp is on a great flat, on sandy soil without a tree, though round about are pines and palmettos. It is very hot, indeed, but there are no {{mosquitoes}}.",
    ],
    signoff: [],
    blots: [
      { id: "kitten", word: "kitten", survive: [0, 4], decoys: ["giant", "statue"] },
      { id: "dirty", word: "dirty", survive: [0], decoys: ["rested", "cheerful"] },
      { id: "brown", word: "brown", survive: [0, 3], decoys: ["debt", "bed"] },
      { id: "mosquitoes", word: "mosquitoes", survive: [0, 4, 8], decoys: ["horses", "tents"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "children",
      cards: [
        { id: "edith", name: "Edith", note: "His wife. She came down to Tampa to see him off." },
        { id: "children", name: "The children", note: "Ted, Kermit, Ethel and the two little ones, at home." },
        { id: "bamie", name: "Bamie", note: "His older sister Anna, who raised his daughter Alice after his first wife died." },
        { id: "lodge", name: "Henry Cabot Lodge", note: "A senator from Massachusetts and his closest friend in politics." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1898",
      options: [
        { id: "1886", name: "1886" },
        { id: "1898", name: "1898" },
        { id: "1904", name: "1904" },
        { id: "1912", name: "1912" },
      ],
    },
    clue: "In 1898 he raised a volunteer cavalry regiment, the Rough Riders, to fight in the war with Spain.",
    story: [
      "He was 39 and had given up his post as Assistant Secretary of the Navy to fight. The regiment sailed for Cuba a few weeks later, and on 1 July he led the charge up Kettle Hill, near San Juan.",
      "At home, his children were ten, eight, six, four, and not yet one.",
    ],
    history: {
      context: [
        "In February 1898 the American battleship Maine blew up in Havana harbour, and by the end of April the United States was at war with Spain over Cuba. He was Assistant Secretary of the Navy at the time, and he resigned to go and fight.",
        "With his friend Leonard Wood, an army doctor, he raised the 1st United States Volunteer Cavalry: cowboys and ranch hands from the West, Native Americans, miners, college athletes and young men from New York society. The newspapers called them the Rough Riders. They trained in San Antonio, Texas, then rode the trains for four days to Tampa, where the army was gathering to sail for Cuba.",
        "The camp at Tampa was chaos: too many soldiers, too few ships. When the transports finally left in June there was room for only part of the regiment and hardly any of the horses, so most of the Rough Riders fought in Cuba on foot.",
      ],
      people: [
        { name: "Mother", note: "Edith, his wife, who had come down to Tampa to see him before he sailed." },
        { name: "Texas", note: "His horse, Little Texas, one of the few that went to Cuba." },
        { name: "The mountain lion and Cuba", note: "Regimental mascots. The lion was called Josephine; Cuba was the camp dog." },
        { name: "Kermit and Ethel", note: "Two of the children at home, aged eight and six, who had written to him." },
      ],
      afterwards: [
        "On 1 July 1898 he led the charge up Kettle Hill, in the fight for the San Juan Heights outside Santiago. The war was over by August.",
        "He came home a hero. That November he was elected governor of New York, and two years later vice-president. In 2001 he was awarded the Medal of Honor for the charge, the only president ever to receive it.",
      ],
    },
    notes: [{ term: "the cars", note: "the railway cars: they came by train." }],
    keepsake: "1898",
    source: SOURCE,
  },
  {
    id: "roosevelt-kermit-1903",
    day: 1,
    writtenAt: "the White House, 6 January 1903",
    deliverTo: "Groton School, Massachusetts",
    salutation: "Dear [[Kermit]]:",
    body: [
      "We felt very melancholy after you and Ted left and the house seemed empty and lonely. But it was the greatest possible comfort to feel that you both really have enjoyed school and are both doing well there.",
      "Tom Quartz is certainly the cunningest {{kitten}} I have ever seen. He is always playing pranks on Jack and I get very nervous lest Jack should grow too irritated. … Suddenly he spied Jack and galloped up to him. Jack, looking exceedingly sullen and shame-faced, jumped out of the way and got upon the {{sofa}}, where Tom Quartz instantly jumped upon him again.",
      "Another evening the next {{speaker}} of the House, Mr. Cannon, an exceedingly solemn, elderly gentleman with chin {{whiskers}}, who certainly does not look to be of playful nature, came to call upon me. … He had gone about half-way down when Tom Quartz strolled by, his tail erect and very fluffy. He spied Mr. Cannon going down the stairs, jumped to the conclusion that he was a playmate escaping, and raced after him, suddenly grasping him by the leg the way he does Archie and Quentin when they play hide and seek with him; then loosening his hold he tore down-stairs ahead of Mr. Cannon, who eyed him with iron calm and not one particle of surprise.",
      "Ethel has reluctantly gone back to boarding-school.",
    ],
    signoff: [],
    blots: [
      { id: "kitten", word: "kitten", survive: [0, 4], decoys: ["pony", "owl"] },
      { id: "sofa", word: "sofa", survive: [0], decoys: ["roof", "piano"] },
      { id: "speaker", word: "Speaker", survive: [0, 4], decoys: ["King", "Mayor"] },
      { id: "whiskers", word: "whiskers", survive: [0, 5], decoys: ["spurs", "medals"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "kermit",
      cards: [
        { id: "ted", name: "Ted", note: "His eldest son, 15, at Groton School." },
        { id: "archie", name: "Archie", note: "His son, 8, at home." },
        { id: "kermit", name: "Kermit", note: "His second son, 13, at Groton School." },
        { id: "ethel", name: "Ethel", note: "His daughter, 11, at boarding school." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1903",
      options: [
        { id: "1898", name: "1898" },
        { id: "1903", name: "1903" },
        { id: "1910", name: "1910" },
        { id: "1915", name: "1915" },
      ],
    },
    clue: "By 1903 his family lived in the White House, along with dogs, cats, ponies, guinea pigs and a badger.",
    story: [
      "Tom Quartz was named after the cat in a story by Mark Twain. Mr. Cannon, Joseph Cannon, became Speaker of the House that November and held the post for eight years.",
    ],
    history: {
      context: [
        "In September 1901 President William McKinley was shot in Buffalo and died eight days later. His vice-president was sworn in at 42, and moved his family into the White House: six children, from Alice, who was 17, down to Quentin, who was three.",
        "He gave the house its official name, the White House, and in 1902 had it rebuilt inside, with the offices moved out into a new West Wing. The children turned it into a playground. They roller-skated in the East Room, slid down the stairs on trays, and filled the place with pets: dogs, cats, guinea pigs, a badger, a pony, snakes and a one-legged rooster.",
        "Ted and Kermit were away at Groton, a boarding school in Massachusetts, and their father wrote to them almost every week with the news from home.",
      ],
      people: [
        { name: "Tom Quartz", note: "A White House kitten, named after the cat in a story by Mark Twain." },
        { name: "Jack", note: "Kermit’s terrier, and the kitten’s favourite victim." },
        { name: "Mr. Cannon", note: "Joseph Cannon of Illinois, known as “Uncle Joe”, about to become Speaker of the House of Representatives." },
        { name: "Archie and Quentin", note: "The two youngest boys, eight and five, still at home." },
      ],
      afterwards: [
        "Cannon became Speaker that November and ran the House with an iron hand for eight years, until members revolted in 1910 and took away much of his power.",
        "Kermit grew up to share his father’s love of adventure. He went with him on safari in Africa in 1909, and in 1914 the two of them went down an unmapped river in the Brazilian jungle, a journey that nearly killed his father.",
      ],
    },
    notes: [{ term: "cunningest", note: "cutest, in the American sense of the time." }],
    keepsake: "1903",
    source: SOURCE,
  },
  {
    id: "roosevelt-quentin-1903",
    day: 2,
    writtenAt: "Del Monte, California, 10 May 1903",
    deliverTo: "The White House",
    salutation: "Dearest [[Quenty-Quee]]",
    body: [
      "I loved your letter. I am very homesick for mother and for you children; but I have enjoyed this week’s travel. I have been among the orange groves, where the trees have {{oranges}} growing thick upon them, and there are more flowers than you have ever seen. I have a gold {{top}} which I shall give you if mother thinks you can take care of it. Perhaps I shall give you a silver {{bell}} instead.",
      "Whenever I see a little boy being brought up by his father or mother to look at the procession as we pass by, I think of you and Archie and feel very homesick. Sometimes little boys ride in the procession on their {{ponies}}, just like Archie on Algonquin.",
    ],
    signoff: [],
    blots: [
      { id: "oranges", word: "oranges", survive: [0, 4], decoys: ["icicles", "pianos"] },
      { id: "top", word: "top", survive: [0], decoys: ["pie", "cloud"] },
      { id: "bell", word: "bell", survive: [0], decoys: ["cannon", "stove"] },
      { id: "ponies", word: "ponies", survive: [0, 3], decoys: ["camels", "tricycles"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "quentin",
      cards: [
        { id: "kermit", name: "Kermit", note: "His second son, 13, away at Groton School." },
        { id: "ethel", name: "Ethel", note: "His daughter, 11." },
        { id: "archie", name: "Archie", note: "His son, 9. His calico pony is called Algonquin." },
        { id: "quentin", name: "Quentin", note: "His youngest, 5." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1903",
      options: [
        { id: "1898", name: "1898" },
        { id: "1903", name: "1903" },
        { id: "1908", name: "1908" },
        { id: "1912", name: "1912" },
      ],
    },
    clue: "He became president in September 1901, at 42: the youngest ever.",
    story: [
      "He was six weeks into a nine-week train tour of the West, giving speeches from the back of the train in town after town, and had reached California.",
    ],
    history: {
      context: [
        "In the spring of 1903 he set off on a train tour of the West that lasted from April into June. At every stop crowds came out to see him, and he made speeches from the back of the train.",
        "Along the way he camped in Yellowstone with the naturalist John Burroughs, saw the Grand Canyon for the first time, and, a week after this letter, slept out under the giant sequoias of Yosemite with John Muir. He came home more determined than ever to protect wild land.",
      ],
      people: [
        { name: "Quenty-Quee", note: "Quentin, the youngest, five years old: his father’s pet name for him." },
        { name: "Archie", note: "His brother, nine." },
        { name: "Algonquin", note: "Archie’s calico pony. When Archie was ill in bed, the family told how the pony was taken up to his room in the White House elevator to cheer him up." },
      ],
      afterwards: [
        "Over his years as president he protected about 230 million acres of land: national forests, bird reserves, national parks and monuments.",
        "Quentin grew up to be a pilot in the First World War. He was shot down over France in July 1918, at 20. His father never got over it and died six months later.",
      ],
    },
    notes: [{ term: "procession", note: "the parade of carriages that met the president in each town." }],
    keepsake: "1903",
    source: SOURCE,
  },
  {
    id: "roosevelt-archie-1906",
    day: 3,
    writtenAt: "the White House, 1 April 1906",
    deliverTo: "Care of Mother",
    salutation: "Darling [[Archie]]:",
    body: [
      "Poor Skip is a very, very {{lonely}} little dog without his family. Each morning he comes up to see me at {{breakfast}} time and during most of breakfast (which I take in the hall just outside my room) Skip stands with his little paws on my {{lap}}. Then when I get through and sit down in the rocking-chair to read for fifteen or twenty minutes, Skip hops into my lap and stays there, just bathing himself in the companionship of the only one of his family he has left.",
      "The rest of the day he spends with the {{ushers}}, as I am so frightfully busy that I am nowhere long enough for Skip to have any real satisfaction in my companionship. Poor Jack has never come home. We may never know what became of him.",
    ],
    signoff: [],
    blots: [
      { id: "lonely", word: "lonely", survive: [0, 3], decoys: ["happy", "naughty"] },
      { id: "breakfast", word: "breakfast", survive: [0, 5], decoys: ["church", "school"] },
      { id: "lap", word: "lap", survive: [0], decoys: ["hat", "newspaper"] },
      { id: "ushers", word: "ushers", survive: [0, 3], decoys: ["bears", "sailors"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "archie",
      cards: [
        { id: "quentin", name: "Quentin", note: "His youngest, 8. Loves the White House kittens." },
        { id: "archie", name: "Archie", note: "His son, 11. Skip the terrier is his dog." },
        { id: "kermit", name: "Kermit", note: "His son, 16, at Groton School." },
        { id: "ted", name: "Ted", note: "His eldest son, 18, at Harvard." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1906",
      options: [
        { id: "1899", name: "1899" },
        { id: "1906", name: "1906" },
        { id: "1910", name: "1910" },
        { id: "1913", name: "1913" },
      ],
    },
    clue: "In 1906 he became the first American to win the Nobel Peace Prize, for helping end the war between Russia and Japan.",
    story: [
      "Skip was a little terrier he met on a bear hunt in Colorado in 1905 and brought home. The family was away that spring, and Jack, their other terrier, had gone missing.",
    ],
    history: {
      context: [
        "1906 was one of his busiest years. After Upton Sinclair’s novel The Jungle exposed the meat-packing plants of Chicago, he signed laws to inspect meat and to make food and medicine safe. He used a new law to make Devils Tower in Wyoming the first national monument.",
        "That November he went to see the Panama Canal being dug, the first president to travel abroad while in office. And in December he became the first American to win a Nobel Prize: the Peace Prize, for bringing Russia and Japan to make peace in 1905.",
        "That spring the family was away from Washington, and he was alone in the White House with the staff and the animals.",
      ],
      people: [
        { name: "Skip", note: "A little terrier who ran with the hounds on a bear hunt in Colorado in 1905. He came home with the president and became Archie’s dog." },
        { name: "Jack", note: "Kermit’s terrier, who had gone missing." },
        { name: "The ushers", note: "The White House staff who look after the house and its visitors (and, that spring, Skip)." },
      ],
      afterwards: [
        "Archie grew up to fight in both world wars and was badly wounded in each.",
        "The Panama Canal opened in 1914. He always counted it among the things he was proudest of.",
      ],
    },
    notes: [{ term: "ushers", note: "the White House staff who look after visitors." }],
    keepsake: "1906",
    source: SOURCE,
  },
  {
    id: "roosevelt-ethel-1909",
    day: 4,
    writtenAt: "Campalla (Kampala), Uganda, 23 December 1909",
    deliverTo: "Sagamore Hill, Oyster Bay",
    salutation: "Blessedest [[Ethely-Bye]]:",
    body: [
      "… I am enjoying it all, but I think Kermit regards me as a little {{soft}}, because I am so eagerly looking forward to the end, when I shall see darling, pretty Mother, my own {{sweetheart}}, and the very nicest of all nice daughters—you blessed girlie. Do you remember when you explained, with some asperity, that of course you wished Ted were at home, because you didn’t have anybody as a really intimate companion, whereas Mother had “old Father”? It is a great comfort to have a daughter to whom I can write about all kinds of intimate things!",
      "This is a most interesting place. We crossed the great Nyanza Lake, in a comfortable steamer, in 24 hours, seeing a lovely {{sunset}} across the vast expanse of waters; and the moonlight later was as lovely. Here it is as hot as one would expect directly on the {{equator}}, and the brilliant green landscape is fairly painted with even more brilliant flowers, on trees, bush, and vines …",
    ],
    signoff: [],
    blots: [
      { id: "soft", word: "soft", survive: [0], decoys: ["cruel", "tall"] },
      { id: "sweetheart", word: "sweetheart", survive: [0, 5], decoys: ["dentist", "cook"] },
      { id: "sunset", word: "sunset", survive: [0, 3], decoys: ["whale", "quarrel"] },
      { id: "equator", word: "Equator", survive: [0, 4], decoys: ["icebergs", "moon"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "ethel",
      cards: [
        { id: "alice", name: "Alice", note: "His eldest daughter, married since 1906." },
        { id: "edith", name: "Edith", note: "His wife." },
        { id: "ethel", name: "Ethel", note: "His younger daughter, 18, at home." },
        { id: "kermit", name: "Kermit", note: "His son, 20." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1909",
      options: [
        { id: "1898", name: "1898" },
        { id: "1903", name: "1903" },
        { id: "1909", name: "1909" },
        { id: "1913", name: "1913" },
      ],
    },
    clue: "After leaving office in 1909, he spent a year on safari in East Africa with his son Kermit.",
    story: [
      "He had left the White House that March and sailed for Africa to collect animals for the Smithsonian, with Kermit along. They reached home in June 1910.",
    ],
    history: {
      context: [
        "He had promised not to run for a third term, and in 1908 he helped his friend William Howard Taft win the presidency. Three weeks after leaving office, in March 1909, he sailed for Africa with Kermit.",
        "The safari, for the Smithsonian Institution, went through what is now Kenya, Uganda and South Sudan. They sent back thousands of animal specimens, many still in the museum’s collections. By Christmas 1909 they had reached Kampala, in Uganda, with the trip home still months away.",
      ],
      people: [
        { name: "Mother", note: "Edith, his wife of 23 years, whom he had known since they were children." },
        { name: "Kermit", note: "Twenty, with him in Africa. He did much of the hunting and ran the caravan." },
        { name: "Ted", note: "The eldest son, just out of Harvard and at work." },
        { name: "Ethel", note: "Eighteen, at home at Sagamore Hill with her mother." },
      ],
      afterwards: [
        "He came home in June 1910 and soon fell out with Taft. In 1912 he ran for president again for a new party, the Progressives, nicknamed the Bull Moose party. In Milwaukee a man shot him in the chest; with the bullet still in him, he gave his speech anyway, for well over an hour. He lost to Woodrow Wilson.",
        "Ethel worked as a nurse in the American hospital in Paris during the First World War, and lived the rest of her life near Sagamore Hill.",
      ],
    },
    notes: [
      { term: "Nyanza Lake", note: "Lake Victoria." },
      { term: "asperity", note: "sharpness of temper." },
    ],
    keepsake: "1909",
    source: SOURCE,
  },
];

export const ROOSEVELT_WEEK: Week = {
  id: "2026-w43-roosevelt",
  number: 1,
  // Drafted for the prototype; a person must read it through before launch.
  status: "approved",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-10-19",
  letters: ROOSEVELT_WEEK_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["roosevelt", "teddy"],
    reject: ["franklin", "delano", "eleanor", "fdr"],
    answer: "Theodore Roosevelt",
    years: "1858–1919",
    reveal: [
      "The twenty-sixth president of the United States, from 1901 to 1909. Before that he had been a rancher in Dakota, New York’s police commissioner, Assistant Secretary of the Navy, colonel of the Rough Riders and governor of New York.",
      "Whenever he was away from his children (at war, on hunting trips, touring the country, in Africa) he wrote to them, often with little drawings. They kept the letters, and they were published as a book in 1919, the year he died.",
    ],
    coda: "Five letters, eleven years: a colonel in camp, a cat story for a boy at school, a homesick president, a lonely dog, and a father counting the days until home.",
  },
  next: "Next week’s bundle is older: a country lawyer, writing in the 1840s.",
  timeline: [
    { year: "1858", text: "Born in New York City, a sickly, asthmatic boy who built himself up with exercise." },
    { year: "1884", text: "His mother and his first wife, Alice, die on the same day. He leaves for a ranch in the Dakota Badlands." },
    { year: "1886", text: "Marries Edith Carow, a friend since childhood." },
    { year: "1898", text: "Leads the Rough Riders in Cuba.", letters: [0] },
    { year: "1901", text: "Becomes president at 42 after McKinley is shot." },
    { year: "1903", text: "Tom Quartz on the stairs; a homesick train tour of the West.", letters: [1, 2] },
    { year: "1904", text: "Elected president in his own right." },
    { year: "1906", text: "First American to win the Nobel Peace Prize.", letters: [3] },
    { year: "1909", text: "Leaves office and goes on safari in Africa with Kermit.", letters: [4] },
    { year: "1912", text: "Runs again as a Progressive; shot in Milwaukee, he gives his speech anyway." },
    { year: "1914", text: "Explores an unmapped river in Brazil, now named after him." },
    { year: "1918", text: "Quentin is killed flying over France." },
    { year: "1919", text: "Dies in his sleep at Sagamore Hill, on 6 January, aged 60." },
  ],
};
