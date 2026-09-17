import { NextRequest } from "next/server";
import { proxyAdmin } from "../_proxy";

export async function GET(req: NextRequest) {
  return proxyAdmin(`/api/admin/moderation/check${req.nextUrl.search}`);
}
