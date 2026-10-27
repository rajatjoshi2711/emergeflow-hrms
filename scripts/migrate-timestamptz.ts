/**
 * One-off migration: timestamp -> timestamptz for the six audit columns.
 *
 * These were created as `timestamp without time zone`. Prisma writes UTC
 * instants into them, but a naive column carries no offset, so a client in a
 * non-UTC zone reads the value back shifted - the 1 October accrual appeared
 * to have run at 18:57 on 30 September when read from an IST machine.
 *
 * The USING clause states explicitly that the stored values are UTC, so the
 * conversion does not depend on the session TimeZone setting. Verified on a
 * throwaway database first: the instant is preserved exactly.
 *
 *   DATABASE_URL="..." npx tsx scripts/migrate-timestamptz.ts [--apply]
 *
 * Without --apply it reports what would change and exits.
 */
import "dotenv/config";
import { Client } from "pg";

const COLUMNS: Array<[table: string, column: string]> = [
  ["leave_ledger_entries", "created_at"],
  ["leave_requests", "requested_at"],
  ["leave_requests", "decided_at"],
  ["wfh_ledger_entries", "created_at"],
  ["wfh_requests", "requested_at"],
  ["wfh_requests", "decided_at"],
];

async function snapshot(client: Client) {
  const out: Record<string, { n: string; lo: string | null; hi: string | null }> = {};
  for (const [table, column] of COLUMNS) {
    const { rows } = await client.query(
      `select count(${column}) n, min(${column})::text lo, max(${column})::text hi from ${table}`
    );
    out[`${table}.${column}`] = rows[0];
  }
  return out;
}

/** Strip the +00 suffix timestamptz adds, so before/after compare like for like. */
const normalise = (value: string | null) => (value ? value.replace(/\+00$/, "") : value);

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const types = await client.query(
    `select table_name, column_name, data_type from information_schema.columns
     where table_schema='public' and data_type like 'timestamp%' order by table_name, column_name`
  );
  console.log("Current column types:");
  console.table(types.rows);

  const pending = types.rows.filter((r) => r.data_type === "timestamp without time zone");
  if (pending.length === 0) {
    console.log("\nNothing to do - all six columns are already timestamptz.");
    await client.end();
    return;
  }

  const before = await snapshot(client);
  console.log("\nBefore:");
  console.table(before);

  if (!apply) {
    console.log(`\n${pending.length} column(s) would be converted. Re-run with --apply.`);
    await client.end();
    return;
  }

  try {
    await client.query("BEGIN");
    for (const [table, column] of COLUMNS) {
      await client.query(
        `alter table ${table} alter column ${column} type timestamptz(3) using ${column} at time zone 'UTC'`
      );
      console.log(`converted ${table}.${column}`);
    }
    await client.query("COMMIT");
    console.log("\nCommitted.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("ROLLED BACK:", (error as Error).message);
    process.exitCode = 1;
    await client.end();
    return;
  }

  const after = await snapshot(client);
  console.log("\nAfter:");
  console.table(after);

  let mismatches = 0;
  for (const key of Object.keys(before)) {
    const same =
      before[key].n === after[key].n &&
      normalise(before[key].lo) === normalise(after[key].lo) &&
      normalise(before[key].hi) === normalise(after[key].hi);
    if (!same) {
      mismatches++;
      console.error(`MISMATCH ${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
    }
  }
  console.log(mismatches === 0 ? "\nAll values preserved exactly." : `\n${mismatches} column(s) changed value.`);
  if (mismatches > 0) process.exitCode = 1;

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
