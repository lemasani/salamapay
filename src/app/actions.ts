"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPool } from "@/lib/db";
import { resetDatabase } from "@/lib/data/seed";
import { actorFor, getRole, ROLE_COOKIE } from "@/lib/session";
import { act, createPurchase, type ActionInput } from "@/lib/services/transactions";
import { WorkflowError, type ActionType } from "@/lib/workflow/machine";
import type { DisputeReason } from "@/lib/ai/dispute-summary";

export interface FormState {
  error?: string;
  ok?: string;
}

export async function setRoleAction(formData: FormData) {
  const role = String(formData.get("role"));
  if (!["buyer", "seller", "admin"].includes(role)) return;
  (await cookies()).set(ROLE_COOKIE, role, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function createPurchaseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const role = await getRole();
  let id: string;
  try {
    const res = await createPurchase(
      {
        sellerId: String(formData.get("sellerId") ?? ""),
        productId: String(formData.get("productId") ?? ""),
        productDescription: String(formData.get("productDescription") ?? ""),
        price: String(formData.get("price") ?? ""),
        paymentAccount: String(formData.get("paymentAccount") ?? ""),
        paymentAccountName: String(formData.get("paymentAccountName") ?? ""),
        sourceChannel: String(formData.get("sourceChannel") ?? ""),
        inspectionDays: String(formData.get("inspectionDays") ?? ""),
        message: String(formData.get("message") ?? ""),
        consent: formData.get("consent") === "on",
      },
      actorFor(role),
    );
    id = res.id;
  } catch (err) {
    if (err instanceof WorkflowError) return { error: err.message };
    throw err;
  }
  redirect(`/t/${id}`);
}

function parseEvidence(formData: FormData): unknown {
  const raw = formData.get("evidence");
  if (!raw) return [];
  try {
    return JSON.parse(String(raw));
  } catch {
    return [];
  }
}

function toActionInput(type: ActionType, f: FormData): ActionInput {
  const s = (k: string) => String(f.get(k) ?? "");
  switch (type) {
    case "provide_verification":
      return { type, note: s("note") };
    case "cancel":
    case "seller_reject":
      return { type, reason: s("reason") };
    case "report":
      return { type, reason: s("reason") };
    case "amend_price":
      return { type, price: s("price") };
    case "ship":
      return { type, courier: s("courier"), trackingRef: s("trackingRef") };
    case "confirm_delivery":
      return { type, otp: s("otp") };
    case "open_dispute":
      return { type, reason: s("reason") as DisputeReason, details: s("details"), evidence: parseEvidence(f) };
    case "seller_respond":
      return { type, response: s("response"), evidence: parseEvidence(f) };
    case "resolve_refund":
    case "resolve_release":
      return { type, rationale: s("rationale"), confirm: f.get("confirm") === "on" };
    case "review_report":
      return { type, note: s("note") };
    default:
      return { type } as ActionInput;
  }
}

const DONE: Partial<Record<ActionType, string>> = {
  provide_verification: "Verification sent to the buyer.",
  seller_respond: "Response added to the dispute.",
  review_report: "Review recorded.",
};

export async function transactionAction(
  transactionId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const role = await getRole();
  const type = String(formData.get("action")) as ActionType;

  const { rows } = await getPool().query(
    `SELECT s.user_id, s.display_name FROM transactions t
       JOIN seller_profiles s ON s.id = t.seller_id WHERE t.id = $1`,
    [transactionId],
  );
  if (!rows[0]) return { error: "Transaction not found." };
  const actor = actorFor(role, { userId: rows[0].user_id, name: rows[0].display_name });

  const result = await act(transactionId, actor, toActionInput(type, formData));
  revalidatePath(`/t/${transactionId}`);
  if (!result.ok) return { error: result.message };
  return { ok: DONE[type] };
}

export async function resetDemoAction() {
  if (process.env.DEMO_RESET_ENABLED !== "true") return;
  await resetDatabase(getPool());
  revalidatePath("/", "layout");
  redirect("/");
}
