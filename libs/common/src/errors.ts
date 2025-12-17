export type ErrorCode =
  | "ENV_MISSING"
  | "ENV_INVALID"
  | "DECODE_INVALID_LOG"
  | "DECODE_UNSUPPORTED_EVENT"
  | "POOLSTATE_MISSING"
  | "POOLSTATE_INVALID"
  | "OPPORTUNITY_NO_EDGE"
  | "SWAP_SIM_INVALID"
  | "OPTIMIZER_INVALID_CANDIDATE"
  | "OPTIMIZER_NO_PROFIT"
  | "OPTIMIZER_SEARCH_FAILED"
  | "RPC_CONNECT_FAILED"
  | "REDIS_CONNECT_FAILED"
  | "REDIS_WRITE_FAILED"
  | "REDIS_READ_FAILED"
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
