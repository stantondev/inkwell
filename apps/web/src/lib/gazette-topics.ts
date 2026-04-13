export interface GazetteTopic {
  id: string;
  label: string;
  icon: string;
  hashtag_count?: number;
  subscribed?: boolean;
}

// Must match apps/api/lib/inkwell/gazette/topics.ex
export const GAZETTE_TOPICS: GazetteTopic[] = [
  { id: "world", label: "World", icon: "🌍" },
  { id: "politics", label: "Politics", icon: "🏛" },
  { id: "technology", label: "Technology", icon: "💻" },
  { id: "science", label: "Science", icon: "🔬" },
  { id: "climate", label: "Climate", icon: "🌱" },
  { id: "health", label: "Health", icon: "🏥" },
  { id: "economy", label: "Economy", icon: "📊" },
  { id: "business", label: "Business", icon: "🏢" },
  { id: "media", label: "Media", icon: "📰" },
  { id: "culture", label: "Arts & Culture", icon: "🎭" },
  { id: "education", label: "Education", icon: "📚" },
  { id: "labor", label: "Labor", icon: "✊" },
  { id: "housing", label: "Housing", icon: "🏠" },
  { id: "legal", label: "Law & Justice", icon: "⚖️" },
  { id: "security", label: "Cybersecurity", icon: "🔒" },
  { id: "space", label: "Space", icon: "🚀" },
  { id: "fediverse", label: "Fediverse", icon: "🌐" },
  { id: "internet", label: "Internet", icon: "🌐" },
  { id: "privacy", label: "Privacy", icon: "🛡" },
  { id: "energy", label: "Energy", icon: "⚡" },
  { id: "disasters", label: "Disasters", icon: "🌊" },
  { id: "transport", label: "Transport", icon: "🚂" },
  { id: "food", label: "Food & Ag", icon: "🌾" },
  { id: "sports", label: "Sports", icon: "⚽" },
];

export function getTopicById(id: string): GazetteTopic | undefined {
  return GAZETTE_TOPICS.find((t) => t.id === id);
}

export function getTopicLabel(id: string): string {
  return getTopicById(id)?.label ?? id;
}
