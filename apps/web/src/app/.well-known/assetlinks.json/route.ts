/**
 * GET /.well-known/assetlinks.json — Digital Asset Links
 *
 * Tells Android that the Inkwell app (apps/mobile, package social.inkwell.app)
 * may open inkwell.social links itself, so a sign-in link tapped in an email
 * opens the app (where it was asked for) instead of Chrome.
 *
 * Only list keys Inkwell controls. Never React Native's debug key: it's
 * public, and anyone could sign an app with it and receive sign-in links.
 * When the app is on Google Play, add the "App signing key certificate"
 * SHA-256 from Play Console → Setup → App signing.
 *
 * Only on inkwell.social: a self-hosted server's links aren't this app's.
 */
import { NextResponse } from "next/server";
import { getSite } from "@/lib/site";

const FINGERPRINTS = [
  // Upload key, created 2026-11-25 (~/.inkwell-android/inkwell-upload.jks on Stanton's Mac).
  "15:CE:91:E3:BE:73:0F:BE:2C:A2:5D:61:4D:4D:86:CD:ED:CF:39:89:C4:B9:9C:E5:F2:27:57:80:1D:45:4F:BE",
];

export const dynamic = "force-dynamic";

export async function GET() {
  const statements = getSite().selfHosted
    ? []
    : [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: "social.inkwell.app",
            sha256_cert_fingerprints: FINGERPRINTS,
          },
        },
      ];
  return NextResponse.json(statements, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
