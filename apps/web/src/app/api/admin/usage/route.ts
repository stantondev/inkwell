import { proxyAdmin } from "../moderation/_proxy";

export async function GET() {
  return proxyAdmin("/api/admin/usage");
}
