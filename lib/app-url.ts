type Environment = Record<string, string | undefined>;

function httpOrigin(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function resolveAppUrl(environment: Environment = process.env) {
  const port = environment.PORT || "3000";
  const homemadePreviewUrl =
    environment.HOMEMADE_VM_NAME && environment.HOMEMADE_VM_DOMAIN
      ? `https://${environment.HOMEMADE_VM_NAME}-${port}.${environment.HOMEMADE_VM_DOMAIN}`
      : undefined;
  const candidates = [
    environment.APP_URL,
    environment[`HOMEMADE_URL_${port}`],
    homemadePreviewUrl,
    environment.HOMEMADE_URL,
    `http://localhost:${port}`,
  ];

  for (const candidate of candidates) {
    const origin = httpOrigin(candidate);
    if (origin) return origin;
  }

  return "http://localhost:3000";
}

export function requestHasAllowedOrigin(
  request: Request,
  environment: Environment = process.env,
) {
  const header = request.headers.get("origin");
  if (!header) return true;

  const suppliedOrigin = httpOrigin(header);
  if (!suppliedOrigin) return false;

  const allowedOrigins = new Set(
    [httpOrigin(request.url), httpOrigin(resolveAppUrl(environment))].filter(
      (origin): origin is string => Boolean(origin),
    ),
  );

  return allowedOrigins.has(suppliedOrigin);
}
