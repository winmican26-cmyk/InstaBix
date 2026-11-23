import { config } from "dotenv";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth/password";

config({ path: ".env.local" });
config();

const email = (process.env.SEED_EMAIL ?? "owner@vistabix.local").toLowerCase();
const password = process.env.SEED_PASSWORD ?? "";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.SEED_PASSWORD) {
    throw new Error("Refusing to seed production without an explicit SEED_PASSWORD.");
  }
  if (password.length < 12) {
    throw new Error("SEED_PASSWORD must be at least 12 characters.");
  }

  // Compute once and reuse: a fresh hash per branch would make the update path
  // churn the stored hash on every seed run.
  const hash = await hashPassword(password);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL_ADMIN, application_name: "vistabix-seed" });
  const client = await pool.connect();
  try {
    await client.query("begin");

    const existingUser = await client.query("select id from users where email = $1", [email]);
    let userId: string;
    if (existingUser.rowCount) {
      userId = existingUser.rows[0].id;
      await client.query("update users set password_hash = $1 where id = $2", [hash, userId]);
      console.log(`• user already exists: ${email}`);
      console.log("• refreshed password_hash from SEED_PASSWORD");
    } else {
      const inserted = await client.query(
        "insert into users (email, name, password_hash) values ($1, $2, $3) returning id",
        [email, "Workspace Owner", hash],
      );
      userId = inserted.rows[0].id;
      console.log(`• created user: ${email}`);
    }

    let orgId: string;
    const existingOrg = await client.query("select id from orgs where slug = 'vistabix-hq'");
    if (existingOrg.rowCount) {
      orgId = existingOrg.rows[0].id;
    } else {
      const inserted = await client.query(
        "insert into orgs (name, slug, settings) values ('VistaBix HQ', 'vistabix-hq', $1) returning id",
        [JSON.stringify({ onboardingComplete: false, defaultSplitCreatorBps: 6000 })],
      );
      orgId = inserted.rows[0].id;
      console.log("• created organisation: VistaBix HQ");
    }

    await client.query(
      `insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')
       on conflict (org_id, user_id) do update set role = 'owner'`,
      [orgId, userId],
    );

    // Tenant tables are FORCE RLS, including for the owner. Bind the tenant for
    // the rest of this transaction so the seed writes stay inside the workspace.
    await client.query("select set_config('app.org_id', $1, true)", [orgId]);

    const stepTemplates = [
      {
        stepNumber: 1,
        delayDays: 0,
        subject: "Quick idea for your {{niche}} audience",
        body: `Hi {{first_name}},

I watched "{{reel_title}}" and noticed {{audience_insight}}.

We build the product, you promote it to the audience that already knows you. Zero upfront cost: 60/40 on the first product in your favour, then 50/50 after that.

Want the one-page outline? Reply INTERESTED.

— {{operator_name}}`,
      },
      {
        stepNumber: 2,
        delayDays: 3,
        subject: "Re: Quick idea...",
        body: `Hi {{first_name}},

Quick follow-up on the idea for your {{niche}} audience. We did this for a creator in a similar niche and it sold from their existing audience in week 1.

Want the one-page outline? Reply INTERESTED.

— {{operator_name}}`,
      },
      {
        stepNumber: 3,
        delayDays: 7,
        subject: "Closing the loop?",
        body: `Hi {{first_name}},

Totally get it if timing is off. Should I close your file or keep you on the list for next month?

— {{operator_name}}`,
      },
    ];

    const existingSequence = await client.query(
      "select s.id from sequences s join campaigns c on c.id = s.campaign_id where s.org_id = $1 and s.name = 'Default 3-step' limit 1",
      [orgId],
    );
    if (!existingSequence.rowCount) {
      const campaign = await client.query(
        "insert into campaigns (org_id, creator_id, name, status) select $1, id, 'Creator partnerships', 'active' from creator_accounts where org_id = $1 limit 1 returning id",
        [orgId],
      );
      let campaignId = campaign.rows[0]?.id as string | undefined;
      if (!campaignId) {
        const fallback = await client.query("insert into campaigns (org_id, name, status) values ($1, 'Creator partnerships', 'active') returning id", [orgId]);
        campaignId = fallback.rows[0].id;
      }
      const sequence = await client.query(
        "insert into sequences (org_id, campaign_id, name, status, daily_cap, window_start_hour, window_end_hour) values ($1, $2, 'Default 3-step', 'draft', 25, 9, 17) returning id",
        [orgId, campaignId],
      );
      for (const step of stepTemplates) {
        await client.query(
          "insert into sequence_steps (org_id, sequence_id, step_number, delay_days, subject, body) values ($1, $2, $3, $4, $5, $6)",
          [orgId, sequence.rows[0].id, step.stepNumber, step.delayDays, step.subject, step.body],
        );
      }
      console.log("• created default outreach sequence (3 steps, drafts only)");
    }

    await client.query(
      `insert into feature_flags (key, enabled, description) values
        ('outreach_auto_send', false, 'Allow sending without per-message human approval'),
        ('ai_draft_generation', true, 'Enable Anthropic-backed outline and draft generation'),
        ('creator_portal', true, 'Enable the magic-link creator portal')
       on conflict (key) do nothing`,
    );

    await client.query("commit");
    console.log("\nSeed complete. Sign in with:");
    console.log(`  ${email}`);
    console.log("  (the password from SEED_PASSWORD)");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
