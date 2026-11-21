import { asc, sql } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import { creatorAccounts } from "@/lib/db/schema";
import { getWorkspace } from "@/lib/auth/session";
import { insertAudit } from "@/lib/audit";
import { clientIp } from "@/lib/http";
import { csvResponse, toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspace = await getWorkspace();
  if (!workspace) return Response.json({ error: "Sign in to export creators." }, { status: 401 });
  const { org, user } = workspace;

  const rows = await withOrg(org.id, async (tx) => {
    const data = await tx
      .select({
        id: creatorAccounts.id,
        username: creatorAccounts.username,
        displayName: creatorAccounts.displayName,
        status: creatorAccounts.status,
        source: creatorAccounts.source,
        consentStatus: creatorAccounts.consentStatus,
        consentAt: creatorAccounts.consentAt,
        contactEmail: creatorAccounts.contactEmail,
        emailSource: creatorAccounts.emailSource,
        niche: creatorAccounts.niche,
        followers: sql<number | null>`(select s.followers from creator_snapshots s where s.creator_id = ${creatorAccounts.id} order by s.captured_at desc limit 1)`,
        mediaCount: sql<number | null>`(select s.media_count from creator_snapshots s where s.creator_id = ${creatorAccounts.id} order by s.captured_at desc limit 1)`,
        score: sql<string | null>`(select sc.total from scores sc where sc.creator_id = ${creatorAccounts.id} order by sc.computed_at desc limit 1)`,
        lastEnrichedAt: sql<Date | null>`(select s.captured_at from creator_snapshots s where s.creator_id = ${creatorAccounts.id} order by s.captured_at desc limit 1)`,
        createdAt: creatorAccounts.createdAt,
      })
      .from(creatorAccounts)
      .orderBy(asc(creatorAccounts.username));

    await insertAudit(tx, {
      orgId: org.id,
      actorUserId: user.id,
      action: "creators.exported",
      entityType: "creator",
      entityId: null,
      metadata: { format: "csv", count: data.length },
      ip: clientIp(request),
    });

    return data;
  });

  const csv = toCsv(
    [
      "id",
      "username",
      "display_name",
      "status",
      "source",
      "consent_status",
      "consent_at",
      "contact_email",
      "email_source",
      "niche",
      "followers",
      "media_count",
      "score",
      "last_enriched_at",
      "created_at",
    ],
    rows.map((row) => [
      row.id,
      row.username,
      row.displayName,
      row.status,
      row.source,
      row.consentStatus,
      row.consentAt,
      row.contactEmail,
      row.emailSource,
      row.niche,
      row.followers,
      row.mediaCount,
      row.score,
      row.lastEnrichedAt,
      row.createdAt,
    ]),
  );

  return csvResponse(`vistabix-creators-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
