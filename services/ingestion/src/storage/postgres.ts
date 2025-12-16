import { AtomicNexusError, jsonStringify } from "@atomicnexus/common";
import type { DexEvent, PoolState } from "@atomicnexus/common";
import { Pool } from "pg";

export function createPgPool(postgresUrl: string): Pool {
  return new Pool({ connectionString: postgresUrl });
}

export async function ensurePgSchema(pool: Pool): Promise<void> {
  try {
    await pool.query(`
      create table if not exists dex_events (
        id bigserial primary key,
        trace_id uuid not null,
        chain text not null,
        venue text not null,
        pool_address text not null,
        event_type text not null,
        block_number bigint not null,
        tx_hash text not null,
        log_index integer not null,
        data jsonb not null,
        created_at timestamptz not null default now(),
        unique (tx_hash, log_index)
      );
    `);

    await pool.query(`
      create table if not exists pool_state_updates (
        id bigserial primary key,
        chain text not null,
        venue text not null,
        pool_address text not null,
        block_number bigint not null,
        state jsonb not null,
        created_at timestamptz not null default now()
      );
    `);
  } catch (err: unknown) {
    throw new AtomicNexusError(
      "PG_SCHEMA_FAILED",
      "failed to ensure postgres schema",
      { cause: err },
    );
  }
}

function toJsonNoBigInt(value: unknown): unknown {
  return JSON.parse(jsonStringify(value));
}

export async function insertDexEvent(pool: Pool, event: DexEvent): Promise<void> {
  try {
    await pool.query(
      `
      insert into dex_events (
        trace_id,
        chain,
        venue,
        pool_address,
        event_type,
        block_number,
        tx_hash,
        log_index,
        data
      ) values ($1::uuid, $2, $3, $4, $5, $6::bigint, $7, $8::integer, $9::jsonb)
      on conflict (tx_hash, log_index) do nothing;
      `,
      [
        event.trace_id,
        event.chain,
        event.venue,
        event.pool_address,
        event.type,
        String(event.block_number),
        event.tx_hash,
        event.log_index,
        toJsonNoBigInt(event),
      ],
    );
  } catch (err: unknown) {
    throw new AtomicNexusError("PG_INSERT_FAILED", "failed to insert dex_event", {
      cause: err,
    });
  }
}

export async function insertPoolStateUpdate(
  pool: Pool,
  state: PoolState,
): Promise<void> {
  try {
    await pool.query(
      `
      insert into pool_state_updates (
        chain,
        venue,
        pool_address,
        block_number,
        state
      ) values ($1, $2, $3, $4::bigint, $5::jsonb);
      `,
      [
        state.chain,
        state.venue,
        state.pool_address,
        String(state.block_number),
        toJsonNoBigInt(state),
      ],
    );
  } catch (err: unknown) {
    throw new AtomicNexusError(
      "PG_INSERT_FAILED",
      "failed to insert pool_state_update",
      { cause: err },
    );
  }
}

