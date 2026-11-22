import { getWorkspace, canReview } from "@/lib/auth/session";
import { assertSameOrigin, jsonError, rateLimitResponse } from "@/lib/http";
import { DISCOVERY_BATCH_LIMIT, parseHandles } from "@/lib/discovery/parse-handles";
import { runDiscoveryBatch } from "@/lib/discovery/batch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }

  const workspace = await getWorkspace();
  if (!workspace) return jsonError("Sign in to import creators.", 401);
  if (!canReview(workspace.role)) return jsonError("Your role cannot import creators.", 403);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Malformed request body.");
  }
  if (!payload || typeof payload !== "object") return jsonError("Provide handles to import.");
  const raw = (payload as { handles?: unknown }).handles;
  if (typeof raw !== "string" && !Array.isArray(raw)) return jsonError("Provide handles to import.");
  if (Array.isArray(raw) && !raw.every((value) => typeof value === "string")) {
    return jsonError("Provide handles to import.");
  }

  const parsed = parseHandles(raw as string | string[]);
  if (parsed.handles.length === 0) return jsonError("Enter at least one valid handle.");
  if (parsed.handles.length > DISCOVERY_BATCH_LIMIT) {
    return jsonError("A batch can contain at most 50 unique handles.");
  }

  const result = await runDiscoveryBatch(workspace.org.id, workspace.user.id, parsed.handles);
  if (result.error) return jsonError(result.error);
  if (result.rateLimit) {
    return rateLimitResponse(result.rateLimit.seconds, result.rateLimit.message, { results: result });
  }
  return Response.json(result);
}
