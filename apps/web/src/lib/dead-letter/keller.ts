// Week 4: Helen Keller, 1887–1900. DRAFT: drafted by Claude on 2026-10-19,
// waiting for a person to read it through and approve it.
//
// Text from The Story of My Life (1903), with her letters and Anne Sullivan's
// reports, ed. John Albert Macy (Project Gutenberg #2397), public domain. Every
// quoted line is checked against it by `npm run check:letters`. "…" marks a
// cut. The early letters keep a seven-year-old's grammar exactly as printed.

import type { DeadLetter } from "./letters";
import type { Week } from "./weeks";

const SOURCE = {
  title: "The Story of My Life, with her letters (1887–1901) (Project Gutenberg)",
  url: "https://www.gutenberg.org/ebooks/2397",
  textUrl: "https://www.gutenberg.org/cache/epub/2397/pg2397.txt",
};

export const KELLER_LETTERS: DeadLetter[] = [
  {
    id: "keller-bell-1887",
    day: 0,
    writtenAt: "Tuscumbia, Alabama, November 1887",
    deliverTo: "Washington, D.C.",
    salutation: "Dear [[Mr. Bell]].",
    body: [
      "I am glad to write you a letter, Father will send you picture. I and Father and aunt did go to see you in Washington. I did play with your watch. I do love you. I saw doctor in Washington. He looked at my eyes. I can read stories in my book. I can write and spell and {{count}}. good girl. My sister can walk and {{run}}. We do have fun with Jumbo. Prince is not good dog. He can not get {{birds}}. Rat did kill baby pigeons. I am {{sorry}}. Rat does not know wrong. I and mother and teacher will go to Boston in June. I will see little blind girls. Nancy will go with me. She is a good doll. Father will buy me lovely new watch. Cousin [[Anna]] gave me a pretty doll. Her name is Allie.",
    ],
    signoff: ["Good-by,", "[[!Helen Keller]]."],
    blots: [
      { id: "count", word: "count", survive: [0, 4], decoys: ["fly", "shave"] },
      { id: "run", word: "run", survive: [0], decoys: ["vote", "drive"] },
      { id: "birds", word: "birds", survive: [0, 4], decoys: ["letters", "jokes"] },
      { id: "sorry", word: "sorry", survive: [0, 4], decoys: ["glad", "proud"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "bell",
      cards: [
        { id: "anagnos", name: "Michael Anagnos", note: "Director of the Perkins Institution for the Blind, in Boston." },
        { id: "bell", name: "Alexander Graham Bell", note: "The inventor of the telephone, who lived in Washington and worked with deaf children." },
        { id: "anna", name: "Cousin Anna", note: "Her cousin in Alabama, who was always giving her presents." },
        { id: "blind-girls", name: "The little blind girls", note: "The pupils at the Perkins Institution, who sent her letters in Braille." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1887",
      options: [
        { id: "1882", name: "1882" },
        { id: "1887", name: "1887" },
        { id: "1893", name: "1893" },
        { id: "1900", name: "1900" },
      ],
    },
    clue: "In November 1887 she was seven, and had been learning words, spelled into her hand, for eight months.",
    story: [
      "The visit she remembers was the one that changed her life. The year before, he had held her on his knee, let her feel his watch strike, and told her father where to find her a teacher.",
    ],
    history: {
      context: [
        "She was born in June 1880 in Tuscumbia, a small town in northern Alabama. At nineteen months a sudden illness, which the doctors called congestion of the stomach and brain, left her unable to see or hear. She grew up with a handful of home-made signs and a fierce temper.",
        "When she was six her father took her to an eye doctor in Baltimore. He could do nothing for her eyes, but said she could be taught, and sent them on to Alexander Graham Bell in Washington. Bell advised her father to write to the Perkins Institution for the Blind in Boston and ask for a teacher.",
        "The teacher, Anne Sullivan, arrived on 3 March 1887. She was twenty, a former pupil of the school who had been nearly blind herself. She spelled words into the child’s hand with the finger alphabet, and a month later, with one hand under the water pump, the little girl understood for the first time that the letters meant things. Eight months after that she was writing letters like this one.",
      ],
      people: [
        { name: "Father", note: "Arthur, a former captain in the Confederate army, who later edited the town newspaper." },
        { name: "My sister", note: "Mildred, the baby of the family." },
        { name: "Jumbo and Prince", note: "The family dogs. Prince, she reports, was no good at fetching birds." },
        { name: "teacher", note: "Anne Sullivan, who stayed with her for nearly fifty years." },
        { name: "Nancy", note: "Her favourite doll, who went everywhere with her." },
      ],
      afterwards: [
        "She did go to Boston: in May 1888 she, her mother and Anne Sullivan stopped in Washington on the way, saw Bell again, and called on President Cleveland. In Boston she met the little blind girls she had been writing to.",
        "Bell remained a friend for the rest of his life. In 1903 she dedicated her autobiography to him, as the man “who has taught the deaf to speak”.",
      ],
    },
    notes: [
      { term: "did go, did play", note: "she was still learning how English makes the past; “did” worked for everything." },
      { term: "good girl", note: "her verdict on herself, after all that reading, writing and counting." },
    ],
    keepsake: "1887",
    source: SOURCE,
  },
  {
    id: "keller-fuller-1890",
    day: 1,
    writtenAt: "South Boston, Massachusetts, 3 April 1890",
    deliverTo: "Boston, Massachusetts",
    salutation: "My dear [[Miss Fuller]],",
    body: [
      "My heart is full of joy this beautiful morning, because I have learned to speak many new words, and I can make a few sentences. Last evening I went out in the yard and spoke to the moon. I said, “O! moon come to me!” Do you think the lovely moon was glad that I could speak to her? How glad my mother will be. I can hardly wait for June to come I am so eager to speak to her and to my precious little {{sister}}. Mildred could not understand me when I spelled with my fingers, but now she will sit in my lap and I will tell her many things to please her, and we shall be so happy together.",
      "My teacher told me Tuesday that you wanted to know how I came to wish to talk with my mouth. I will tell you all about it, for I remember my thoughts perfectly. When I was a very little child I used to sit in my mother’s lap all the time, because I was very {{timid}}, and did not like to be left by myself. And I would keep my little hand on her face all the while, because it amused me to feel her face and lips move when she talked with people. … After a long time my dear teacher came to me, and taught me to communicate with my fingers and I was satisfied and happy.",
      "But when I came to school in Boston I met some deaf people who talked with their mouths like all other people, and one day a lady who had been to {{norway}} came to see me, and told me of a blind and deaf girl … she had seen in that far away land who had been taught to speak and understand others when they spoke to her. This good and happy news delighted me exceedingly, for then I was sure that I should learn also. I tried to make sounds like my little playmates, but teacher told me that the voice was very delicate and sensitive and that it would injure it to make incorrect sounds, and promised to take me to see a kind and wise lady who would teach me rightly. That lady was yourself. Now I am as happy as the little birds, because I can speak and perhaps I shall {{sing}} too. All of my friends will be so surprised and glad.",
    ],
    signoff: ["Your loving little pupil,", "[[!Helen A. Keller]]."],
    blots: [
      { id: "sister", word: "sister", survive: [0, 5], decoys: ["uncle", "grandmother"] },
      { id: "timid", word: "timid", survive: [0, 4], decoys: ["brave", "rich"] },
      { id: "norway", word: "Norway", survive: [0, 3], decoys: ["church", "bed"] },
      { id: "sing", word: "sing", survive: [0], decoys: ["sneeze", "vanish"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "fuller",
      cards: [
        { id: "lamson", name: "Mrs. Lamson", note: "A teacher of the blind, just back from a journey to Norway and Sweden." },
        { id: "sullivan", name: "Anne Sullivan", note: "Her own teacher, with her at the school in South Boston." },
        { id: "fuller", name: "Sarah Fuller", note: "Principal of the Horace Mann School for the Deaf, in Boston." },
        { id: "mildred", name: "Mildred", note: "Her little sister, at home in Alabama." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1890",
      options: [
        { id: "1884", name: "1884" },
        { id: "1890", name: "1890" },
        { id: "1896", name: "1896" },
        { id: "1904", name: "1904" },
      ],
    },
    clue: "In April 1890 she was nine, and eight days into her first lessons in speaking aloud.",
    story: [
      "Miss Fuller had asked how the wish to speak began, and this is the answer. Her first lesson had been on 26 March. In an hour she learned six sounds, M, P, A, S, T and I; her first whole sentence was “It is warm.”",
    ],
    history: {
      context: [
        "Since the spring of 1888 she had spent much of each year at the Perkins Institution in South Boston with Anne Sullivan, reading raised print and Braille, studying arithmetic and zoology, and making friends with the blind girls she had once written to.",
        "Speech was the one thing the finger alphabet couldn’t give her. Some of her friends tried to talk her out of it, afraid she would only be disappointed. Then, early in 1890, Mrs. Lamson, who had once taught at the school, came to visit with news of Ragnhild Kaata, a deaf and blind girl in Norway who had been taught to speak.",
        "Sarah Fuller taught by letting her pupil feel her face, tongue and lips as she made each sound. She gave eleven lessons in all; after that the work was practice, every day, with Anne Sullivan.",
      ],
      people: [
        { name: "Sarah Fuller", note: "Principal of the Horace Mann School, a day school for deaf children in Boston." },
        { name: "a lady who had been to Norway", note: "Mrs. Lamson, who had been one of the teachers of Laura Bridgman, a deaf and blind woman taught at the same school half a century before." },
        { name: "a blind and deaf girl", note: "Ragnhild Kaata, in Norway." },
        { name: "Mildred", note: "Her little sister, still a small child." },
      ],
      afterwards: [
        "Her first speech was understood by almost nobody but her two teachers. She worked at it for the rest of her life, at a special school for speech and lip-reading in New York and with teachers of voice, and later spoke to audiences around the world, usually with a companion repeating her words.",
        "“My little sister will understand me now,” she remembered telling herself through the hardest of the practice.",
      ],
    },
    notes: [
      { term: "spelled with my fingers", note: "the finger alphabet: each letter a shape of the hand, pressed into the listener’s palm." },
      { term: "talk with my mouth", note: "to speak aloud, as hearing people do." },
    ],
    keepsake: "1890",
    source: SOURCE,
  },
  {
    id: "keller-clement-1892",
    day: 2,
    writtenAt: "South Boston, Massachusetts, 18 May 1892",
    deliverTo: "Boston, Massachusetts",
    salutation: "My dear [[Mr. Clement]]:",
    body: [
      "I am going to write to you this beautiful morning because my heart is brimful of happiness and I want you and all my dear friends in the Transcript office to {{rejoice}} with me. The preparations for my tea are nearly completed, and I am looking forward joyfully to the event. I know I shall not fail. Kind people will not disappoint me, when they know that I plead for helpless little children who live in darkness and ignorance. They will come to my tea and buy light,—the beautiful light of knowledge and love for many little ones who are blind and friendless. I remember perfectly when my dear teacher came to me. Then I was like the little blind children who are waiting to enter the {{kindergarten}}. There was no light in my soul. This wonderful world with all its sunlight and beauty was hidden from me, and I had never dreamed of its loveliness. But teacher came to me and taught my little fingers to use the beautiful {{key}} that has unlocked the door of my dark {{prison}} and set my spirit free.",
      "It is my earnest wish to share my happiness with others, and I ask the kind people of Boston to help me make the lives of little blind children brighter and happier.",
    ],
    signoff: ["Lovingly your little friend,", "[[!Helen Keller]]."],
    blots: [
      { id: "rejoice", word: "rejoice", survive: [0, 4], decoys: ["quarrel", "wrestle"] },
      { id: "kindergarten", word: "kindergarten", survive: [0, 4, 8], decoys: ["army", "circus"] },
      { id: "key", word: "key", survive: [0], decoys: ["spoon", "ribbon"] },
      { id: "prison", word: "prison", survive: [0, 4], decoys: ["kitchen", "birthday"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "clement",
      cards: [
        { id: "holmes", name: "John H. Holmes", note: "Editor of the Boston Herald, who had printed her appeals before." },
        { id: "derby", name: "Caroline Derby", note: "A young Boston friend helping her plan the tea." },
        { id: "clement", name: "Edward H. Clement", note: "Editor of the Boston Evening Transcript." },
        { id: "spaulding", name: "John P. Spaulding", note: "A generous Boston friend, whose sister lent her house for the tea." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1892",
      options: [
        { id: "1887", name: "1887" },
        { id: "1892", name: "1892" },
        { id: "1898", name: "1898" },
        { id: "1903", name: "1903" },
      ],
    },
    clue: "In May 1892 she was eleven, and raising money for a kindergarten for blind children.",
    story: [
      "The tea was her own idea. It was held that month at the house of Mrs. Mahlon Spaulding, and brought in more than two thousand dollars for the blind children.",
    ],
    history: {
      context: [
        "The year before, she had heard of Tommy Stringer, a little boy in Pennsylvania who had lost his sight and hearing at four. His mother was dead, his father couldn’t care for him, and he was about to be sent to an almshouse. Told that money would be needed for a teacher, she answered, “We will raise it,” and wrote to friends and newspapers, and saved her own pennies, until he was taken into the kindergarten for the blind near Boston.",
        "The kindergarten had a waiting list of other small children, and the tea was for them.",
        "It was a hard spring otherwise. A story she had written the autumn before, “The Frost King,” turned out to be very like a published story that had been read to her years earlier and that she had no memory of. She was questioned about it at the school, and it hurt her for a long time.",
      ],
      people: [
        { name: "the Transcript", note: "The Boston Evening Transcript, a daily paper." },
        { name: "my dear teacher", note: "Anne Sullivan, who had come to her five years earlier." },
        { name: "the kindergarten", note: "The school for very young blind children run by the Perkins Institution." },
      ],
      afterwards: [
        "Tommy stayed in school. When she met him by chance at a railway station in 1900, he was a big, strong boy going to the public school.",
        "She never stopped raising money for blind people. From the 1920s she worked for the American Foundation for the Blind, travelling the country and the world to speak for it.",
      ],
    },
    notes: [
      { term: "buy light", note: "pay for teaching, which to her was the same thing." },
      { term: "brimful", note: "full to the top." },
    ],
    keepsake: "1892",
    source: SOURCE,
  },
  {
    id: "keller-mildred-1899",
    day: 3,
    writtenAt: "138 Brattle Street, Cambridge, Massachusetts, 26 November 1899",
    deliverTo: "Tuscumbia, Alabama",
    salutation: "",
    body: [
      "At last we are settled for the winter, and our work is going smoothly. Mr. Keith comes every afternoon at four o’clock, and gives me a “friendly lift” over the rough stretches of road, over which every student must go. I am studying English history, English literature, French and Latin, and by and by I shall take up German and English composition—let us groan! You know, I detest {{grammar}} as much as you do; but I suppose I must go through it if I am to write, just as we had to get ducked in the {{lake}} hundreds of times before we could swim! In French Teacher is reading “Columba” to me. It is a delightful novel, full of piquant expressions and thrilling adventures, (don’t dare to blame me for using big words, since you do the same!) and, if you ever read it, I think you will enjoy it immensely.",
      "Now we have a swell winter outfit—coats, hats, gowns, flannels and all. We’ve just had four lovely dresses made by a French dressmaker. … Teacher too has a silk dress. … So you may imagine that we look quite like {{peacocks}}, only we’ve no trains.",
      "A week ago yesterday there was [a] great football game between Harvard and Yale, and there was tremendous excitement here. … Colonel Roosevelt was there, on Harvard’s side; but bless you, he wore a white sweater, and no crimson that we know of! … But, in spite of all their wild efforts, neither side was {{scored}}, and we all laughed and said, “Oh, well now the pot can’t call the kettle black!”",
    ],
    signoff: [],
    blots: [
      { id: "grammar", word: "grammar", survive: [0, 6], decoys: ["candy", "holidays"] },
      { id: "lake", word: "lake", survive: [0], decoys: ["oven", "library"] },
      { id: "peacocks", word: "peacocks", survive: [0, 4], decoys: ["potatoes", "owls"] },
      { id: "scored", word: "scored", survive: [0, 5], decoys: ["dressed", "hungry"] },
    ],
    ink: 4,
    to: {
      question: "Who was it for?",
      answer: "mildred",
      cards: [
        { id: "mother", name: "Her mother", note: "Kate, a widow since 1896." },
        { id: "keith", name: "Merton Keith", note: "Her tutor in Latin and Greek." },
        { id: "mildred", name: "Mildred", note: "Her younger sister, still a schoolgirl." },
        { id: "hutton", name: "Mrs. Laurence Hutton", note: "A New York friend and one of her most loyal supporters." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1899",
      options: [
        { id: "1887", name: "1887" },
        { id: "1893", name: "1893" },
        { id: "1899", name: "1899" },
        { id: "1905", name: "1905" },
      ],
    },
    clue: "In November 1899 she was nineteen, studying with a tutor in Cambridge after passing the entrance examinations for Radcliffe College.",
    story: [
      "Mildred was the baby sister of the very first letters, the one who could “walk and run” in 1887 and couldn’t understand finger-spelling in 1890. Now the two of them were swapping complaints about grammar and teasing each other about big words.",
    ],
    history: {
      context: [
        "In June 1899 she sat the entrance examinations for Radcliffe, the women’s college of Harvard. The papers were copied for her in Braille by a stranger, and the mathematics, in a Braille notation she had learned only days before, went badly; she passed everything all the same, with credit in advanced Latin.",
        "That summer her mother, sister and little brother came north, and the family spent five weeks together in a cottage on a lake at Wrentham, Massachusetts, while Anne Sullivan rested her failing eyes.",
        "In the autumn she and Anne Sullivan took rooms in Cambridge, and a tutor came every afternoon. Instead of starting the college course, she had been persuaded to study privately for a year.",
      ],
      people: [
        { name: "Mr. Keith", note: "Merton S. Keith, the tutor who prepared her for Radcliffe." },
        { name: "Teacher", note: "Anne Sullivan, who read every book to her, spelling it into her hand." },
        { name: "Colonel Roosevelt", note: "Theodore Roosevelt, a Harvard man, then governor of New York, who had led the Rough Riders in Cuba the year before." },
      ],
      afterwards: [
        "The game, on 18 November 1899, really did end with no score on either side.",
        "Within a year she was a Radcliffe student, and her sister had a grown-up correspondent who could out-tease her.",
      ],
    },
    notes: [
      { term: "piquant", note: "lively and sharp, with a bit of spice." },
      { term: "trains", note: "the long trailing backs of grand ball gowns." },
      { term: "no crimson", note: "crimson is Harvard’s colour; he wasn’t wearing it." },
      { term: "the pot can’t call the kettle black", note: "neither can make fun of the other." },
      { term: "Columba", note: "so spelled here; it is “Colomba”, a novel by Prosper Mérimée, as she spells it herself in a letter that winter." },
    ],
    keepsake: "1899",
    source: SOURCE,
  },
  {
    id: "keller-radcliffe-1900",
    day: 4,
    writtenAt: "138 Brattle Street, Cambridge, Massachusetts, 5 May 1900",
    deliverTo: "Radcliffe College, Cambridge, Massachusetts",
    salutation: "Dear Sir:",
    body: [
      "As an aid to me in determining my plans for study the coming year, I apply to you for information as to the possibility of my taking the regular courses in Radcliffe College.",
      "Since receiving my certificate of {{admission}} to Radcliffe last July, I have been studying with a private tutor, Horace, Aeschylus, French, German, Rhetoric, English History, English Literature and Criticism, and English composition.",
      "In college I should wish to continue most, if not all of these subjects. The conditions under which I work require the presence of Miss Sullivan, who has been my teacher and companion for thirteen years, as an interpreter of oral speech and as a reader of examination papers. … I should do all my written work on a {{typewriter}}, and if a Professor could not understand my speech, I could write out my answers to his questions and hand them to him after the recitation.",
      "Is it possible for the College to accommodate itself to these unprecedented conditions, so as to enable me to pursue my studies at Radcliffe? I realize that the obstacles in the way of my receiving a college education are very great—to others they may seem insurmountable; but, dear Sir, a true {{soldier}} does not acknowledge {{defeat}} before the battle.",
    ],
    signoff: [],
    blots: [
      { id: "admission", word: "admission", survive: [0, 4, 8], decoys: ["marriage", "arrest"] },
      { id: "typewriter", word: "typewriter", survive: [0, 4, 9], decoys: ["horse", "piano"] },
      { id: "soldier", word: "soldier", survive: [0, 6], decoys: ["coward", "traitor"] },
      { id: "defeat", word: "defeat", survive: [0, 5], decoys: ["breakfast", "victory"] },
    ],
    ink: 5,
    to: {
      question: "Who was it for?",
      answer: "board",
      cards: [
        { id: "irwin", name: "Agnes Irwin", note: "The Dean of Radcliffe College." },
        { id: "hitz", name: "John Hitz", note: "An old friend in Washington, in charge of Bell’s bureau of information about the deaf." },
        { id: "board", name: "The Academic Board", note: "The committee of Radcliffe College that decided what students could study, and how." },
        { id: "keith", name: "Merton Keith", note: "Her private tutor in Cambridge." },
      ],
    },
    when: {
      question: "When was it written?",
      answer: "1900",
      options: [
        { id: "1890", name: "1890" },
        { id: "1896", name: "1896" },
        { id: "1900", name: "1900" },
        { id: "1906", name: "1906" },
      ],
    },
    clue: "In May 1900 she was nearly twenty: admitted to Radcliffe College, but studying privately instead of taking its regular courses.",
    story: [
      "She asked to be taught like any other student, with only the changes she couldn’t do without, and ended with a soldier’s line. The board took weeks to answer. It said yes.",
    ],
    history: {
      context: [
        "Her certificate of admission came in July 1899. But the Dean of Radcliffe, Agnes Irwin, talked her out of taking the four-year course: she had already shown she could do college work, the dean said, and a degree was worth less than time spent writing. She agreed, and found it very hard.",
        "By the spring she had changed her mind. She wanted the real thing, a degree on the same terms as everyone else, and wrote to the board that decided such matters.",
        "Cornell and the University of Chicago both offered to make arrangements for her if she came to them instead. She was afraid that going anywhere else would look as though she hadn’t really passed Radcliffe’s examinations.",
      ],
      people: [
        { name: "Miss Sullivan", note: "Anne Sullivan, her teacher since March 1887." },
        { name: "a private tutor", note: "Merton S. Keith, who taught her that winter in Cambridge." },
        { name: "Horace, Aeschylus", note: "The Roman poet and the Greek playwright, read in Latin and Greek." },
      ],
      afterwards: [
        "She entered Radcliffe that autumn, with Anne Sullivan beside her in every lecture spelling the words into her hand. She graduated cum laude in June 1904, the first deaf and blind person to earn a bachelor’s degree.",
        "While still a student she wrote the story of her life, which was printed in a magazine and then, in 1903, as a book. It is the book these letters come from.",
        "Anne Sullivan stayed with her until her own death in 1936. She herself lived to 87, writing, lecturing and campaigning for blind and deaf people, and for the vote for women.",
      ],
    },
    notes: [
      { term: "oral speech", note: "what lecturers said aloud, which she could not hear." },
      { term: "recitation", note: "a class in which students answer the teacher’s questions." },
      { term: "unprecedented", note: "never seen before." },
    ],
    keepsake: "1900",
    source: SOURCE,
  },
];

export const KELLER_WEEK: Week = {
  id: "2026-w46-keller",
  number: 4,
  status: "draft",
  drafted: { by: "claude", on: "2026-10-19" },
  starts: "2026-11-09",
  letters: KELLER_LETTERS,
  mystery: {
    question: "Whose letters are these?",
    accept: ["keller"],
    reject: ["mildred", "kate", "arthur", "phillips"],
    hide: ["Helen"],
    answer: "Helen Keller",
    years: "1880–1968",
    reveal: [
      "Born in Tuscumbia, Alabama, she lost her sight and hearing to an illness at nineteen months. When she was nearly seven Anne Sullivan came to teach her, spelling words into her hand, and within weeks she understood that everything had a name.",
      "She learned to read and write, then to speak; graduated from Radcliffe College in 1904; and spent her long life writing, lecturing and campaigning for blind and deaf people around the world. Her autobiography, The Story of My Life (1903), prints these letters.",
    ],
    coda: "Five letters, thirteen years: a seven-year-old’s first news, the joy of a first spoken word, a girl raising money for children like herself, a teasing note to a sister, and a request to be taught like everyone else.",
  },
  next: "Next week’s bundle is funny. Very funny.",
  timeline: [
    { year: "1880", text: "Born on 27 June in Tuscumbia, Alabama." },
    { year: "1882", text: "An illness at nineteen months leaves her blind and deaf." },
    { year: "1886", text: "Taken to Alexander Graham Bell in Washington, who tells her father where to find a teacher." },
    { year: "1887", text: "Anne Sullivan arrives on 3 March; at the water pump, words begin to mean things. A letter to Bell.", letters: [0] },
    { year: "1888", text: "First visit to Boston and the Perkins Institution for the Blind." },
    { year: "1890", text: "Learns to speak aloud; writes to the woman who taught her.", letters: [1] },
    { year: "1892", text: "The “Frost King” trouble. Gives a tea for the blind kindergarten.", letters: [2] },
    { year: "1894", text: "Goes to a school in New York for speech and lip-reading." },
    { year: "1896", text: "Starts at the Cambridge School for Young Ladies. Her father dies that August." },
    { year: "1899", text: "Passes the Radcliffe entrance examinations; settles in Cambridge with a tutor.", letters: [3] },
    { year: "1900", text: "Asks to take the regular college course, and enters Radcliffe that autumn.", letters: [4] },
    { year: "1904", text: "Graduates cum laude. The Story of My Life has come out the year before." },
    { year: "1968", text: "Dies on 1 June, aged 87." },
  ],
};
