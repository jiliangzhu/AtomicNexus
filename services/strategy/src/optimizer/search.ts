import { AtomicNexusError, invariant } from "@atomicnexus/common";

export function ternarySearchMaxInteger(opts: {
  lo: bigint;
  hi: bigint;
  f: (x: bigint) => bigint;
  iterations?: number;
}): { x: bigint; value: bigint } {
  invariant(opts.lo >= 0n, "OPTIMIZER_SEARCH_FAILED", "lo must be >= 0");
  invariant(opts.hi >= 0n, "OPTIMIZER_SEARCH_FAILED", "hi must be >= 0");
  invariant(opts.lo <= opts.hi, "OPTIMIZER_SEARCH_FAILED", "lo must be <= hi");

  const iterations = opts.iterations ?? 80;
  if (!Number.isFinite(iterations) || !Number.isInteger(iterations) || iterations <= 0) {
    throw new AtomicNexusError(
      "OPTIMIZER_SEARCH_FAILED",
      `invalid iterations: ${String(opts.iterations)}`,
    );
  }

  let left = opts.lo;
  let right = opts.hi;

  for (let i = 0; i < iterations; i += 1) {
    const span = right - left;
    if (span <= 3n) break;

    const third = span / 3n;
    const m1 = left + third;
    const m2 = right - third;

    const v1 = opts.f(m1);
    const v2 = opts.f(m2);

    if (v1 < v2) left = m1 + 1n;
    else right = m2 - 1n;
  }

  if (right < left) {
    throw new AtomicNexusError(
      "OPTIMIZER_SEARCH_FAILED",
      "search interval invalid",
    );
  }

  let bestX = left;
  let bestV = opts.f(left);
  for (let x = left + 1n; x <= right; x += 1n) {
    const v = opts.f(x);
    if (v > bestV) {
      bestV = v;
      bestX = x;
    }
  }

  return { x: bestX, value: bestV };
}

