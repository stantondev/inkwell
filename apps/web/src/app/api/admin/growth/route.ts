import { NextRequest } from "next/server";
import { proxyAdmin } from "../moderation/_proxy";

export async function GET(req: NextRequest) {
  return proxyAdmin(`/api/admin/growth${req.nextUrl.search}`);
}
