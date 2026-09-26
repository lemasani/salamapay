import { cookies } from "next/headers";
import type { Actor } from "@/lib/services/transactions";
import type { Role } from "@/lib/workflow/machine";

/**
 * Demo sign-in: the presenter switches between buyer, seller and reviewer.
 * The role comes from an httpOnly cookie and every server action re-checks
 * permissions in the state machine, so the UI is never trusted.
 */
export const ROLE_COOKIE = "sp_role";

export const ROLE_LABELS: Record<Role, string> = {
  buyer: "Buyer (Neema)",
  seller: "Seller",
  admin: "Reviewer (Asha)",
};

export async function getRole(): Promise<Role> {
  const v = (await cookies()).get(ROLE_COOKIE)?.value;
  return v === "seller" || v === "admin" ? v : "buyer";
}

/** Builds the acting identity. A demo seller acts as the seller of the transaction being viewed. */
export function actorFor(role: Role, sellerUser?: { userId: string; name: string }): Actor {
  if (role === "admin") return { role, userId: "admin-asha", name: "Asha K. (Reviewer)" };
  if (role === "seller") {
    return { role, userId: sellerUser?.userId ?? "unknown-seller", name: sellerUser?.name ?? "Seller" };
  }
  return { role, userId: "buyer-neema", name: "Neema M." };
}
