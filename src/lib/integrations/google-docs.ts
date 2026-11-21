import "server-only";
import { env } from "@/lib/env";

export type GoogleDocsExportResult = {
  ok: boolean;
  documentId?: string;
  documentUrl?: string;
  error?: string;
};

/**
 * Exchanges the stored long-lived refresh token for a fresh access token.
 */
async function getAccessToken(): Promise<string> {
  if (!env.GOOGLE_DOCS_CLIENT_ID || !env.GOOGLE_DOCS_CLIENT_SECRET || !env.GOOGLE_DOCS_REFRESH_TOKEN) {
    throw new Error("Google Docs credentials are not configured in environment variables.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_DOCS_CLIENT_ID,
      client_secret: env.GOOGLE_DOCS_CLIENT_SECRET,
      refresh_token: env.GOOGLE_DOCS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to refresh Google OAuth token (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * Creates a formatted Google Document with the product outline, metadata, and chapters.
 */
export async function exportToGoogleDocs(options: {
  title: string;
  content: string;
}): Promise<GoogleDocsExportResult> {
  try {
    const accessToken = await getAccessToken();

    // 1. Create a blank document
    const createRes = await fetch("https://docs.googleapis.com/v1/documents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: options.title,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      return { ok: false, error: `Google Docs API error (${createRes.status}): ${err}` };
    }

    const doc = (await createRes.json()) as { documentId: string };
    const documentId = doc.documentId;

    // 2. Insert text content into document
    const insertRes = await fetch(`https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: `${options.title}\n\n${options.content}\n`,
            },
          },
        ],
      }),
    });

    if (!insertRes.ok) {
      const err = await insertRes.text();
      return { ok: false, error: `Google Docs batch update failed (${insertRes.status}): ${err}` };
    }

    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;
    return {
      ok: true,
      documentId,
      documentUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
