import { createHash, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function equal(left: string, right: string) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

function challenge(message = "Authentication required.", status = 401) {
  return new NextResponse(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "WWW-Authenticate": 'Basic realm="Mutate Page admin", charset="UTF-8"',
    },
  });
}

export function proxy(request: NextRequest) {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    return challenge("Admin credentials are not configured.", 503);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return challenge();

  try {
    const credentials = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator === -1) return challenge();
    const suppliedUsername = credentials.slice(0, separator);
    const suppliedPassword = credentials.slice(separator + 1);
    if (!equal(suppliedUsername, username) || !equal(suppliedPassword, password)) {
      return challenge();
    }
    return NextResponse.next();
  } catch {
    return challenge();
  }
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
