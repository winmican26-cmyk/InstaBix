import "server-only";
import Stripe from "stripe";
import { env, stripeConfigured } from "@/lib/env";

let cached: Stripe | null = null;

export function stripe(): Stripe | null {
  if (!stripeConfigured || !env.STRIPE_SECRET_KEY) return null;
  if (!cached) cached = new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 1, timeout: 20_000 });
  return cached;
}

export function verifyStripeSignature(payload: string, signature: string | null): Stripe.Event | null {
  const client = stripe();
  if (!client || !env.STRIPE_WEBHOOK_SECRET || !signature) return null;
  try {
    return client.webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}
