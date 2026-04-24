/**
 * GET /.well-known/assetlinks.json — Digital Asset Links for TWA
 *
 * Establishes the relationship between inkwell.social and the
 * Android app package, allowing the TWA to render full-screen
 * without Chrome's URL bar.
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "social.inkwell.app",
          sha256_cert_fingerprints: [
            // TODO: Replace with actual signing key fingerprint after keytool generation
            // Also add Google Play App Signing fingerprint from Play Console
          ],
        },
      },
    ],
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
    }
  );
}
