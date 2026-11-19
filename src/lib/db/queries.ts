import "server-only";
import { and, asc, desc, eq, getTableColumns, ilike, inArray, or, sql } from "drizzle-orm";
import { withOrg } from "@/lib/db";
import {
  agreements,
  auditEvents,
  buyerObjections,
  buyerPanelRuns,
  campaigns,
  chapters,
  creatorAccounts,
  creatorSnapshots,
  demandGaps,
  drafts,
  integrations,
  invites,
  ledgerEntries,
  media,
  memberships,
  messages,
  orders,
  products,
  scores,
  sequenceSteps,
  sequences,
  statements,
  users,
  voiceDnas,
} from "@/lib/db/schema";

export async function getDashboard(orgId: string) {
  return withOrg(orgId, async (tx) => {
    const [creatorStats] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        review: sql<number>`count(*) filter (where status in ('new','reviewing'))::int`,
        partnered: sql<number>`count(*) filter (where status = 'partnered')::int`,
        consented: sql<number>`count(*) filter (where consent_status = 'granted')::int`,
      })
      .from(creatorAccounts);

    const [messageStats] = await tx
      .select({
        pending: sql<number>`count(*) filter (where status = 'needs_approval')::int`,
        sent: sql<number>`count(*) filter (where status in ('sent','delivered','opened','replied'))::int`,
        replied: sql<number>`count(*) filter (where status = 'replied')::int`,
      })
      .from(messages);

    const [productStats] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        live: sql<number>`count(*) filter (where status = 'published')::int`,
        inReview: sql<number>`count(*) filter (where status in ('review','outline_pending'))::int`,
      })
      .from(products);

    const [ledgerStats] = await tx
      .select({
        gross: sql<number>`coalesce(sum(case when account = 'operator_revenue' and direction = 'credit' then amount_cents when account = 'operator_revenue' and direction = 'debit' then -amount_cents else 0 end), 0)::int`,
        creatorPayable: sql<number>`coalesce(sum(case when account = 'creator_payable' and direction = 'credit' then amount_cents when account = 'creator_payable' and direction = 'debit' then -amount_cents else 0 end), 0)::int`,
        fees: sql<number>`coalesce(sum(case when account = 'processing_fee' and direction = 'debit' then amount_cents when account = 'processing_fee' and direction = 'credit' then -amount_cents else 0 end), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries);

    const integrationRows = await tx.select().from(integrations);
    const activity = await tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorName: users.name,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(8);

    return {
      creators: creatorStats ?? { total: 0, approved: 0, review: 0, partnered: 0, consented: 0 },
      messages: messageStats ?? { pending: 0, sent: 0, replied: 0 },
      products: productStats ?? { total: 0, live: 0, inReview: 0 },
      ledger: ledgerStats ?? { gross: 0, creatorPayable: 0, fees: 0, entries: 0 },
      integrations: integrationRows,
      activity,
      lastSync: integrationRows.reduce<Date | null>((latest, row) => {
        if (!row.lastSyncAt) return latest;
        return !latest || row.lastSyncAt > latest ? row.lastSyncAt : latest;
      }, null),
    };
  });
}

export type CreatorFilters = { q?: string; status?: string; source?: string };

export async function listCreators(orgId: string, filters: CreatorFilters = {}) {
  return withOrg(orgId, async (tx) => {
    const conditions = [eq(creatorAccounts.orgId, orgId)];
    if (filters.q) {
      const term = `%${filters.q.replace(/^@/, "")}%`;
      conditions.push(or(ilike(creatorAccounts.username, term), ilike(creatorAccounts.displayName, term))!);
    }
    if (filters.status) conditions.push(eq(creatorAccounts.status, filters.status as typeof creatorAccounts.status.enumValues[number]));
    if (filters.source) conditions.push(eq(creatorAccounts.source, filters.source as typeof creatorAccounts.source.enumValues[number]));

    const rows = await tx
      .select({
        ...getTableColumns(creatorAccounts),
        followers: sql<number | null>`(select followers from creator_snapshots s where s.creator_id = ${creatorAccounts.id} order by s.captured_at desc limit 1)`,
        lastEnrichedAt: sql<Date | null>`(select captured_at from creator_snapshots s where s.creator_id = ${creatorAccounts.id} order by s.captured_at desc limit 1)`,
      })
      .from(creatorAccounts)
      .where(and(...conditions))
      .orderBy(desc(creatorAccounts.createdAt))
      .limit(100);

    if (rows.length === 0) return [];
    const scoreRows = await tx
      .select({ creatorId: scores.creatorId, total: scores.total, sampleSize: scores.sampleSize, computedAt: scores.computedAt })
      .from(scores)
      .where(
        inArray(
          scores.creatorId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(desc(scores.computedAt));

    const latest = new Map<string, (typeof scoreRows)[number]>();
    for (const score of scoreRows) if (!latest.has(score.creatorId)) latest.set(score.creatorId, score);

    return rows.map((row) => ({ ...row, score: latest.get(row.id) ?? null }));
  });
}

export async function getCreatorDetail(orgId: string, creatorId: string) {
  return withOrg(orgId, async (tx) => {
    const [creator] = await tx.select().from(creatorAccounts).where(eq(creatorAccounts.id, creatorId)).limit(1);
    if (!creator) return null;

    const [snapshot] = await tx
      .select()
      .from(creatorSnapshots)
      .where(eq(creatorSnapshots.creatorId, creatorId))
      .orderBy(desc(creatorSnapshots.capturedAt))
      .limit(1);

    const [score] = await tx
      .select()
      .from(scores)
      .where(eq(scores.creatorId, creatorId))
      .orderBy(desc(scores.computedAt))
      .limit(1);

    const mediaRows = await tx
      .select()
      .from(media)
      .where(eq(media.creatorId, creatorId))
      .orderBy(desc(media.postedAt))
      .limit(12);

    const [productRows, messageRows, agreementRows, campaignRows] = await Promise.all([
      tx.select().from(products).where(eq(products.creatorId, creatorId)).orderBy(desc(products.createdAt)).limit(10),
      tx.select().from(messages).where(eq(messages.creatorId, creatorId)).orderBy(desc(messages.createdAt)).limit(10),
      tx.select().from(agreements).where(eq(agreements.creatorId, creatorId)).orderBy(desc(agreements.createdAt)).limit(5),
      tx.select().from(campaigns).where(eq(campaigns.creatorId, creatorId)).orderBy(desc(campaigns.createdAt)).limit(5),
    ]);

    return { creator, snapshot: snapshot ?? null, score: score ?? null, media: mediaRows, products: productRows, messages: messageRows, agreements: agreementRows, campaigns: campaignRows };
  });
}

export async function listProducts(orgId: string) {
  return withOrg(orgId, async (tx) => {
    return tx
      .select({
        product: products,
        creatorUsername: creatorAccounts.username,
        creatorName: creatorAccounts.displayName,
        chapterCount: sql<number>`(select count(*) from chapters where chapters.product_id = ${products.id})::int`,
        wordCount: sql<number>`(select coalesce(sum(word_count),0) from chapters where chapters.product_id = ${products.id})::int`,
      })
      .from(products)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, products.creatorId))
      .orderBy(desc(products.createdAt))
      .limit(100);
  });
}

export async function getProductDetail(orgId: string, productId: string) {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ product: products, creator: creatorAccounts })
      .from(products)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, products.creatorId))
      .where(eq(products.id, productId))
      .limit(1);
    if (!row) return null;

    const [chapterRows, draftRows, agreementRows, orderRows, gapRows, voiceRows, panelRows] = await Promise.all([
      tx.select().from(chapters).where(eq(chapters.productId, productId)).orderBy(asc(chapters.position)),
      tx.select().from(drafts).where(eq(drafts.productId, productId)).orderBy(desc(drafts.createdAt)).limit(3),
      tx.select().from(agreements).where(eq(agreements.productId, productId)).orderBy(desc(agreements.createdAt)).limit(3),
      tx.select().from(orders).where(eq(orders.productId, productId)).orderBy(desc(orders.createdAt)).limit(10),
      tx
        .select()
        .from(demandGaps)
        .where(and(eq(demandGaps.orgId, orgId), eq(demandGaps.creatorId, row.creator.id)))
        .orderBy(asc(demandGaps.rank))
        .limit(3),
      tx
        .select()
        .from(voiceDnas)
        .where(and(eq(voiceDnas.orgId, orgId), eq(voiceDnas.creatorId, row.creator.id)))
        .limit(1),
      tx
        .select()
        .from(buyerPanelRuns)
        .where(and(eq(buyerPanelRuns.orgId, orgId), eq(buyerPanelRuns.productId, productId)))
        .orderBy(desc(buyerPanelRuns.createdAt))
        .limit(1),
    ]);

    const [panel] = panelRows;
    const objections = panel
      ? await tx
          .select()
          .from(buyerObjections)
          .where(and(eq(buyerObjections.orgId, orgId), eq(buyerObjections.runId, panel.id)))
          .orderBy(asc(buyerObjections.createdAt))
      : [];

    return {
      ...row,
      chapters: chapterRows,
      drafts: draftRows,
      agreements: agreementRows,
      orders: orderRows,
      analysis: {
        gaps: gapRows,
        voiceDna: voiceRows[0] ?? null,
        panel: panel ? { ...panel, objections } : null,
      },
    };
  });
}

export async function getOutreach(orgId: string) {
  return withOrg(orgId, async (tx) => {
    const sequenceRows = await tx.select().from(sequences).orderBy(desc(sequences.createdAt)).limit(20);
    const steps = sequenceRows.length
      ? await tx.select().from(sequenceSteps).where(inArray(sequenceSteps.sequenceId, sequenceRows.map((s) => s.id))).orderBy(asc(sequenceSteps.stepNumber))
      : [];
    const pending = await tx
      .select({ message: messages, creatorUsername: creatorAccounts.username, creatorName: creatorAccounts.displayName, consent: creatorAccounts.consentStatus })
      .from(messages)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, messages.creatorId))
      .where(eq(messages.status, "needs_approval"))
      .orderBy(desc(messages.createdAt))
      .limit(50);
    const recent = await tx
      .select({ message: messages, creatorUsername: creatorAccounts.username })
      .from(messages)
      .innerJoin(creatorAccounts, eq(creatorAccounts.id, messages.creatorId))
      .where(inArray(messages.status, ["sent", "delivered", "opened", "replied", "failed", "bounced", "complained"]))
      .orderBy(desc(messages.createdAt))
      .limit(25);
    return { sequences: sequenceRows, steps, pending, recent };
  });
}

export async function getRevenue(orgId: string) {
  return withOrg(orgId, async (tx) => {
    const entries = await tx
      .select({ entry: ledgerEntries, creatorUsername: creatorAccounts.username })
      .from(ledgerEntries)
      .leftJoin(creatorAccounts, eq(creatorAccounts.id, ledgerEntries.creatorId))
      .orderBy(desc(ledgerEntries.createdAt))
      .limit(100);

    const [totals] = await tx
      .select({
        gross: sql<number>`coalesce(sum(case when account = 'operator_revenue' and direction = 'credit' then amount_cents when account = 'operator_revenue' and direction = 'debit' then -amount_cents else 0 end), 0)::int`,
        creator: sql<number>`coalesce(sum(case when account = 'creator_payable' and direction = 'credit' then amount_cents when account = 'creator_payable' and direction = 'debit' then -amount_cents else 0 end), 0)::int`,
        fees: sql<number>`coalesce(sum(case when account = 'processing_fee' and direction = 'debit' then amount_cents when account = 'processing_fee' and direction = 'credit' then -amount_cents else 0 end), 0)::int`,
        entries: sql<number>`count(*)::int`,
      })
      .from(ledgerEntries);

    const orderRows = await tx.select().from(orders).orderBy(desc(orders.createdAt)).limit(25);
    const statementRows = await tx
      .select({ statement: statements, creatorUsername: creatorAccounts.username })
      .from(statements)
      .leftJoin(creatorAccounts, eq(creatorAccounts.id, statements.creatorId))
      .orderBy(desc(statements.periodEnd))
      .limit(25);

    return { entries, totals: totals ?? { gross: 0, creator: 0, fees: 0, entries: 0 }, orders: orderRows, statements: statementRows };
  });
}

export async function getAudit(orgId: string, limit = 100) {
  return withOrg(orgId, (tx) =>
    tx
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        ip: auditEvents.ip,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit),
  );
}

export async function getIntegrations(orgId: string) {
  return withOrg(orgId, (tx) => tx.select().from(integrations).orderBy(asc(integrations.provider)));
}

export async function getSettings(orgId: string) {
  return withOrg(orgId, async (tx) => {
    const memberRows = await tx
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        lastLoginAt: users.lastLoginAt,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(asc(memberships.createdAt));

    const inviteRows = await tx
      .select({
        id: invites.id,
        email: invites.email,
        role: invites.role,
        expiresAt: invites.expiresAt,
        acceptedAt: invites.acceptedAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .orderBy(desc(invites.createdAt))
      .limit(50);

    return { members: memberRows, invites: inviteRows };
  });
}

export async function listCreatorOptions(orgId: string) {
  return withOrg(orgId, (tx) =>
    tx
      .select({
        id: creatorAccounts.id,
        username: creatorAccounts.username,
        displayName: creatorAccounts.displayName,
        status: creatorAccounts.status,
        consentStatus: creatorAccounts.consentStatus,
        contactEmail: creatorAccounts.contactEmail,
        emailSource: creatorAccounts.emailSource,
      })
      .from(creatorAccounts)
      .where(inArray(creatorAccounts.status, ["new", "reviewing", "qualified", "approved", "contacted", "negotiating", "partnered"]))
      .orderBy(asc(creatorAccounts.username))
      .limit(200),
  );
}
