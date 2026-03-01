export interface AvatarOptionChoice {
  value: string;
  label: string;
  plusOnly?: boolean;
}

export interface AvatarOptionCategory {
  id: string;
  label: string;
  type: "select" | "color";
  options: AvatarOptionChoice[];
}

export interface AvatarBuilderStyle {
  id: string;
  label: string;
  categories: AvatarOptionCategory[];
}

// DiceBear v9 Avataaars option values — verified against @dicebear/avataaars types
export const AVATAAARS_STYLE: AvatarBuilderStyle = {
  id: "avataaars",
  label: "Avataaars",
  categories: [
    {
      id: "skinColor",
      label: "Skin Tone",
      type: "color",
      options: [
        { value: "ffd5be", label: "Light" },
        { value: "edb98a", label: "Light Warm" },
        { value: "d08b5b", label: "Medium" },
        { value: "ae5d29", label: "Medium Dark" },
        { value: "614335", label: "Dark" },
        { value: "4a312c", label: "Deep" },
      ],
    },
    {
      id: "top",
      label: "Hair Style",
      type: "select",
      options: [
        { value: "shortFlat", label: "Short Flat" },
        { value: "shortRound", label: "Short Round" },
        { value: "shortWaved", label: "Short Waved" },
        { value: "shortCurly", label: "Short Curly" },
        { value: "sides", label: "Sides" },
        { value: "theCaesar", label: "Caesar" },
        { value: "theCaesarAndSidePart", label: "Caesar Side Part" },
        { value: "bob", label: "Bob" },
        { value: "bun", label: "Bun" },
        { value: "straight01", label: "Straight" },
        { value: "straight02", label: "Straight Long" },
        { value: "straightAndStrand", label: "Straight & Strand" },
        { value: "longButNotTooLong", label: "Medium Length" },
        { value: "miaWallace", label: "Mia Wallace" },
        { value: "curly", label: "Curly" },
        { value: "curvy", label: "Curvy" },
        { value: "bigHair", label: "Big Hair" },
        { value: "frizzle", label: "Frizzle" },
        { value: "shaggy", label: "Shaggy" },
        { value: "shaggyMullet", label: "Shaggy Mullet" },
        { value: "shavedSides", label: "Shaved Sides" },
        { value: "fro", label: "Afro" },
        { value: "froBand", label: "Afro Band" },
        { value: "dreads01", label: "Dreads" },
        { value: "dreads02", label: "Dreads Long" },
        { value: "frida", label: "Frida" },
        { value: "hat", label: "Hat" },
        { value: "winterHat1", label: "Winter Hat" },
        { value: "winterHat02", label: "Winter Hat 2" },
        { value: "winterHat03", label: "Winter Hat 3" },
        { value: "winterHat04", label: "Winter Hat 4" },
        { value: "turban", label: "Turban" },
        { value: "hijab", label: "Hijab" },
      ],
    },
    {
      id: "hairColor",
      label: "Hair Color",
      type: "color",
      options: [
        { value: "2c1b18", label: "Black" },
        { value: "4a312c", label: "Dark Brown" },
        { value: "a55728", label: "Brown" },
        { value: "b58143", label: "Auburn" },
        { value: "d6b370", label: "Blonde" },
        { value: "e8e1e1", label: "Platinum" },
        { value: "c93305", label: "Red" },
        { value: "ecdcbf", label: "Strawberry" },
        { value: "724133", label: "Chestnut" },
      ],
    },
    {
      id: "eyes",
      label: "Eyes",
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "happy", label: "Happy" },
        { value: "surprised", label: "Surprised" },
        { value: "wink", label: "Wink" },
        { value: "winkWacky", label: "Wacky Wink" },
        { value: "squint", label: "Squint" },
        { value: "closed", label: "Closed" },
        { value: "hearts", label: "Hearts" },
        { value: "side", label: "Side" },
        { value: "xDizzy", label: "Dizzy" },
        { value: "cry", label: "Cry" },
        { value: "eyeRoll", label: "Eye Roll" },
      ],
    },
    {
      id: "eyebrows",
      label: "Eyebrows",
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "defaultNatural", label: "Natural" },
        { value: "flatNatural", label: "Flat" },
        { value: "raisedExcited", label: "Raised" },
        { value: "raisedExcitedNatural", label: "Raised Natural" },
        { value: "sadConcerned", label: "Sad" },
        { value: "sadConcernedNatural", label: "Sad Natural" },
        { value: "unibrowNatural", label: "Unibrow" },
        { value: "upDown", label: "Up Down" },
        { value: "upDownNatural", label: "Up Down Natural" },
        { value: "frownNatural", label: "Frown" },
        { value: "angryNatural", label: "Angry" },
        { value: "angry", label: "Angry Bold" },
      ],
    },
    {
      id: "mouth",
      label: "Mouth",
      type: "select",
      options: [
        { value: "default", label: "Default" },
        { value: "smile", label: "Smile" },
        { value: "twinkle", label: "Twinkle" },
        { value: "tongue", label: "Tongue" },
        { value: "serious", label: "Serious" },
        { value: "sad", label: "Sad" },
        { value: "screamOpen", label: "Scream" },
        { value: "grimace", label: "Grimace" },
        { value: "eating", label: "Eating" },
        { value: "concerned", label: "Concerned" },
        { value: "disbelief", label: "Disbelief" },
        { value: "vomit", label: "Vomit" },
      ],
    },
    {
      id: "facialHair",
      label: "Facial Hair",
      type: "select",
      options: [
        { value: "__none", label: "None" },
        { value: "beardLight", label: "Light Beard" },
        { value: "beardMedium", label: "Medium Beard" },
        { value: "beardMajestic", label: "Majestic Beard" },
        { value: "moustacheFancy", label: "Fancy Moustache" },
        { value: "moustacheMagnum", label: "Magnum Moustache" },
      ],
    },
    {
      id: "clothing",
      label: "Clothing",
      type: "select",
      options: [
        { value: "blazerAndShirt", label: "Blazer & Shirt" },
        { value: "blazerAndSweater", label: "Blazer & Sweater" },
        { value: "collarAndSweater", label: "Collar & Sweater" },
        { value: "graphicShirt", label: "Graphic Shirt" },
        { value: "hoodie", label: "Hoodie" },
        { value: "overall", label: "Overall" },
        { value: "shirtCrewNeck", label: "Crew Neck" },
        { value: "shirtScoopNeck", label: "Scoop Neck" },
        { value: "shirtVNeck", label: "V-Neck" },
      ],
    },
    {
      id: "clothesColor",
      label: "Clothing Color",
      type: "color",
      options: [
        { value: "262e33", label: "Black" },
        { value: "65c9ff", label: "Blue" },
        { value: "5199e4", label: "Navy" },
        { value: "25557c", label: "Dark Blue" },
        { value: "e6e6e6", label: "Gray" },
        { value: "929598", label: "Dark Gray" },
        { value: "a7ffc4", label: "Mint" },
        { value: "ffdeb5", label: "Peach" },
        { value: "ffafb9", label: "Pink" },
        { value: "ff5c5c", label: "Red" },
        { value: "ffffff", label: "White" },
      ],
    },
    {
      id: "accessories",
      label: "Accessories",
      type: "select",
      options: [
        { value: "__none", label: "None" },
        { value: "kurt", label: "Round Glasses" },
        { value: "prescription01", label: "Prescription 1" },
        { value: "prescription02", label: "Prescription 2" },
        { value: "round", label: "Round" },
        { value: "sunglasses", label: "Sunglasses" },
        { value: "wayfarers", label: "Wayfarers" },
        { value: "eyepatch", label: "Eyepatch" },
      ],
    },
  ],
};

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  style: "avataaars",
  options: {
    skinColor: "d08b5b",
    top: "shortFlat",
    hairColor: "2c1b18",
    eyes: "default",
    eyebrows: "default",
    mouth: "smile",
    facialHair: "__none",
    clothing: "shirtCrewNeck",
    clothesColor: "65c9ff",
    accessories: "__none",
  },
};

export interface AvatarConfig {
  style: string;
  options: Record<string, string>;
}

// "__none" is a sentinel for optional categories (facialHair, accessories).
// When building DiceBear options, these map to probability=0 instead of a value.
export const OPTIONAL_CATEGORIES = new Set(["facialHair", "accessories"]);

// All available styles (for future expansion when custom art is commissioned)
export const AVATAR_STYLES = [AVATAAARS_STYLE];
