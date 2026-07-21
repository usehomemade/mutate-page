type LogFields = Record<string, unknown>;

export function errorForLog(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function writeLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: LogFields = {},
) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  console[level](line);
}

export function logInfo(event: string, fields?: LogFields) {
  writeLog("info", event, fields);
}

export function logWarn(event: string, fields?: LogFields) {
  writeLog("warn", event, fields);
}

export function logError(event: string, fields?: LogFields) {
  writeLog("error", event, fields);
}
