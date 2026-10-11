// Who can read an entry, in words. Shared by the owner's strip on the entry
// page, the "Published" note and the draft preview banner.

export interface AudienceInput {
  privacy: string;
  /** Name of the custom list, when privacy is "custom" and we know it. */
  listName?: string | null;
  /** Circle the entry was posted in, for "circle" privacy. */
  circleName?: string | null;
}

/** Short label: "Public", "Pen pals only", "Only you"… */
export function audienceLabel({ privacy, listName, circleName }: AudienceInput): string {
  switch (privacy) {
    case "public":
      return "Public";
    case "friends_only":
      return "Pen pals only";
    case "private":
      return "Only you";
    case "custom":
      return listName ? `Your list “${listName}”` : "A custom list";
    case "circle":
      return circleName ? `Members of ${circleName}` : "Circle members";
    case "paid":
      return "Paid subscribers";
    default:
      return "Only you";
  }
}

/** A sentence: "Visible to everyone." / "Visible only to you." */
export function audienceSentence({ privacy, listName, circleName }: AudienceInput): string {
  switch (privacy) {
    case "public":
      return "Visible to everyone.";
    case "friends_only":
      return "Visible to your pen pals.";
    case "private":
      return "Visible only to you.";
    case "custom":
      return listName
        ? `Visible to the people on your list “${listName}”.`
        : "Visible to the people on your custom list.";
    case "circle":
      return circleName ? `Visible to members of ${circleName}.` : "Visible to members of the circle.";
    case "paid":
      return "Visible to your paid subscribers.";
    default:
      return "Visible only to you.";
  }
}
