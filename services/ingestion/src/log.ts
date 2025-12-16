import { jsonStringify } from "@atomicnexus/common";
import type { TraceId } from "@atomicnexus/common";

type Level = "info" | "warn" | "error";

export function logLine(
  service: string,
  level: Level,
  trace_id: TraceId,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const base = `[${service}][${level}][trace=${trace_id}] ${message}`;
  const suffix = meta ? ` ${jsonStringify(meta)}` : "";

  if (level === "error") console.error(`${base}${suffix}`);
  else if (level === "warn") console.warn(`${base}${suffix}`);
  else console.log(`${base}${suffix}`);
}

