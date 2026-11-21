import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_ADMIN (or DATABASE_URL) is required.");
  process.exit(1);
}
if (!url.startsWith("postgres")) {
  console.error("Only PostgreSQL is supported.");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: url, application_name: "vistabix-migrate" });
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await client.query<{ filename: string }>("select filename from schema_migrations")).rows.map((r) => r.filename));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), "utf8");
    process.stdout.write(`→ ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (filename) values ($1)", [file]);
      await client.query("commit");
      count += 1;
      console.log("applied");
    } catch (error) {
      await client.query("rollback");
      console.error("failed");
      throw error;
    }
  }
  console.log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
