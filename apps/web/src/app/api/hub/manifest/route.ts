import { NextResponse } from "next/server";
import { storytellerHubManifest } from "../../../../lib/evavoHubManifest";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(storytellerHubManifest, {
    status: 200,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
