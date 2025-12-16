import crypto from "node:crypto";

export type TraceId = string;

export function newTraceId(): TraceId {
  return crypto.randomUUID();
}

