/** A reader source as stored by the API ("", "inkwell", "search:google", a host) in words. */
export function sourceLabel(source: string): string {
  if (source === "") return "Direct, email or apps";
  if (source === "inkwell") return "Inkwell";
  if (source.startsWith("search:")) {
    const name = source.slice(7);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} search`;
  }
  return source;
}
