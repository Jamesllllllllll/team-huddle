import { components, api } from "./_generated/api";
import { Autumn } from "@useautumn/convex";

const autumnSecretKey = process.env.AUTUMN_SECRET_KEY;
if (!autumnSecretKey) {
  throw new Error(
    'AUTUMN_SECRET_KEY is not set in Convex environment variables.'
  );
}

export const autumn = new Autumn(components.autumn, {
  secretKey: autumnSecretKey,
  identify: async (ctx: any) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    if ((process as any).env.NODE_ENV === 'development') {
      console.log('[Autumn identify] identity', identity);
    }

    // Per Autumn docs, some providers expose `id` instead of `subject`
    const customerId = (identity as any).id ?? identity.subject;
    if (!customerId) return null;

    // Try to load the Convex user record via an action-safe query.
    // In an action context, we must use ctx.runQuery instead of ctx.db.
    let user: any = null;
    try {
      if (typeof ctx.runQuery === 'function') {
        user = await ctx.runQuery(api.users.current, {});
      }
    } catch (error) {
      if ((process as any).env.NODE_ENV === 'development') {
        console.warn('[Autumn identify] Failed to load Convex user, falling back to identity:', error);
      }
    }

    const customerData = user
      ? {
          name: user.name as string,
          email: (user.email as string | undefined) ?? undefined,
        }
      : {
          // Fallback to identity fields if Convex user record is not available yet
          name: (identity.name as string | undefined) ?? undefined,
          email: (identity.email as string | undefined) ?? undefined,
        };

    return {
      customerId,
      customerData,
    };
  },
});

/**
 * These exports are required for our react hooks and components
 */
export const {
  track,
  cancel,
  query,
  attach,
  check,
  checkout,
  usage,
  setupPayment,
  createCustomer,
  listProducts,
  billingPortal,
  createReferralCode,
  redeemReferralCode,
  createEntity,
  getEntity,
} = autumn.api();

