import { NextRequest } from "next/server";
import { proxyAdmin } from "../../moderation/_proxy";

export async function GET(req: NextRequest) {
  const params = new URLSearchParams();
  const bucket = req.nextUrl.searchParams.get("bucket");
  const page = req.nextUrl.searchParams.get("page");
  if (bucket) params.set("bucket", bucket);
  if (page) params.set("page", page);
  return proxyAdmin(`/api/admin/users-overview/members?${params.toString()}`);
}
