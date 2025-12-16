export type ErrorCode =
  | "ENV_MISSING"
  | "ENV_INVALID"
  | "DECODE_INVALID_LOG"
  | "DECODE_UNSUPPORTED_EVENT"
  | "RPC_CONNECT_FAILED"
  | "REDIS_CONNECT_FAILED"
  | "REDIS_WRITE_FAILED"
  | "PG_CONNECT_FAILED"
  | "PG_SCHEMA_FAILED"
  | "PG_INSERT_FAILED";

export class AtomicNexusError extends Error {
  readonly code: ErrorCode;
  readonly cause?: unknown;

  constructor(code: ErrorCode, message: string, opts?: { cause?: unknown }) {
    super(message);
    this.name = "AtomicNexusError";
    this.code = code;
    this.cause = opts?.cause;
  }
}

export function asAtomicNexusError(
  err: unknown,
  fallbackCode: ErrorCode,
  fallbackMessage: string,
): AtomicNexusError {
  if (err instanceof AtomicNexusError) return err;
  return new AtomicNexusError(fallbackCode, fallbackMessage, { cause: err });
}

export function invariant(
  condition: unknown,
  code: ErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new AtomicNexusError(code, message);
}

