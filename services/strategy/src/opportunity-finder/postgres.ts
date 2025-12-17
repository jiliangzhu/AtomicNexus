import { AtomicNexusError, jsonStringify } from "@atomicnexus/common";
import type { Candidate } from "@atomicnexus/common";
import { Pool } from "pg";

export function createPgPool(postgresUrl: string): Pool {
  return new Pool({ connectionString: postgresUrl });
}

export async function ensurePgSchema(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      create table if not exists candidates (
        id bigserial primary key,
        trace_id uuid not null unique,
        chain text not null,
        direction text not null,
        snapshot_block bigint not null,
        rough_edge_bps integer not null,
        rough_profit_usd double precision not null,
        data jsonb not null,
        created_at timestamptz not null default now()
      );
    `);

    await pool.query(`
      create index if not exists candidates_snapshot_block_idx
        on candidates (snapshot_block desc);
    `);
  } catch (err: unknown) {
    throw new AtomicNexusError(
      "PG_SCHEMA_FAILED",
      "failed to ensure postgres schema",
      { cause: err },
    );
  }
}

export async function insertCandidate(pool: Pool, candidate: Candidate): Promise<void> {
  try {
    await pool.query(
      `
      insert into candidates (
        trace_id,
        chain,
        direction,
        snapshot_block,
        rough_edge_bps,
        rough_profit_usd,
        data
      ) values ($1::uuid, $2, $3, $4::bigint, $5::integer, $6::double precision, $7::jsonb)
      on conflict (trace_id) do nothing;
      `,
      [
        candidate.trace_id,
        candidate.chain,
        candidate.direction,
        String(candidate.snapshot_block),
        candidate.rough_edge_bps,
        candidate.rough_profit_usd,
        JSON.parse(jsonStringify(candidate)),
      ],
    );
  } catch (err: unknown) {
    throw new AtomicNexusError("PG_INSERT_FAILED", "failed to insert candidate", {
      cause: err,
    });
  }
}

