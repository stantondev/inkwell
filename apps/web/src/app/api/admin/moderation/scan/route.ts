import { proxyAdmin } from "../_proxy";

export async function POST() {
  return proxyAdmin(`/api/admin/moderation/scan`, { method: "POST", body: "{}" });
}
