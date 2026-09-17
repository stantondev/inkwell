import { proxyAdmin } from "../../_proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAdmin(`/api/admin/moderation/${encodeURIComponent(id)}/undo`, { method: "POST", body: "{}" });
}
