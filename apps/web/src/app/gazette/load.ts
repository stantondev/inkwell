import { apiFetch } from "@/lib/api";
import type { GazetteEditionData } from "@/lib/gazette";

export async function loadEdition(token: string | null | undefined, number?: number): Promise<GazetteEditionData> {
  const qs = number ? `?edition=${number}` : "";
  return apiFetch<GazetteEditionData>(`/api/gazette${qs}`, {}, token);
}

export function sectionParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && /^[a-z]{2,20}$/.test(v) ? v : null;
}
