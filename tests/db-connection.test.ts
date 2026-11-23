import { X509Certificate } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { postgresConnection } from "@/lib/db/connection";

describe("PostgreSQL connection configuration", () => {
  it("uses the Supabase CA and strict verification despite conflicting URL SSL flags", () => {
    const options = postgresConnection(
      "postgresql://runtime.project:example@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=no-verify&connect_timeout=9",
    );
    const client = new Client(options);

    expect(client.ssl).toEqual({ ca: expect.any(String), rejectUnauthorized: true });
    const certificate = new X509Certificate((options.ssl as { ca: string }).ca);
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
    expect(options.connectionString).not.toContain("sslmode=");
    expect(options.connectionString).toContain("connect_timeout=9");
  });

  it.each([
    "postgres://runtime:example@localhost:55432/vistabix?sslmode=disable",
    "postgres://runtime:example@aws-1-eu-west-1.pooler.supabase.com.example.org:6543/postgres",
    "postgres://runtime:example@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?host=localhost",
  ])("preserves connection settings for other hosts", (connectionString) => {
    expect(postgresConnection(connectionString)).toEqual({ connectionString });
  });
});
