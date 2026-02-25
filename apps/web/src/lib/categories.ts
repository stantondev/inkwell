export interface Category {
  value: string;
  label: string;
}

export const CATEGORIES: Category[] = [
  { value: "personal", label: "Personal" },
  { value: "creative_writing", label: "Creative Writing" },
  { value: "poetry", label: "Poetry" },
  { value: "fiction", label: "Fiction" },
  { value: "travel", label: "Travel" },
  { value: "tech", label: "Tech" },
  { value: "music", label: "Music" },
  { value: "film_tv", label: "Film & TV" },
  { value: "food", label: "Food" },
  { value: "health", label: "Health" },
  { value: "career", label: "Career" },
  { value: "education", label: "Education" },
  { value: "relationships", label: "Relationships" },
  { value: "parenting", label: "Parenting" },
  { value: "finance", label: "Finance" },
  { value: "news_politics", label: "News & Politics" },
  { value: "philosophy", label: "Philosophy" },
  { value: "spirituality", label: "Spirituality" },
  { value: "humor", label: "Humor" },
  { value: "other", label: "Other" },
];

export function getCategoryLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function getCategorySlug(value: string): string {
  return value.replace(/_/g, "-");
}

export function getCategoryFromSlug(slug: string): string {
  return slug.replace(/-/g, "_");
}
