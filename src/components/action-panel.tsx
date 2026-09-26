"use client";

import { useActionState, useState, type ReactNode } from "react";
import type { FormState } from "@/app/actions";
import type { ActionType, Role, Status } from "@/lib/workflow/machine";

type Act = (prev: FormState, formData: FormData) => Promise<FormState>;

interface Props {
  role: Role;
  status: Status;
  actions: ActionType[];
  run: Act;
  price: number;
  inspectionDays: number;
  riskLevel: "low" | "medium" | "high" | null;
  courierSlip: string | null;
  hasSellerResponse: boolean;
  trackingSuggestion: string;
}

export function ActionPanel(p: Props) {
  const has = (a: ActionType) => p.actions.includes(a);
  if (p.actions.length === 0) return null;

  return (
    <section aria-labelledby="next-heading" className="panel p-6 border-2 border-ink">
      <h2 id="next-heading" className="font-display text-2xl font-bold">
        {TITLES[p.role](p.status)}
      </h2>

      {/* Buyer decision after trust check */}
      {has("continue") && <Decision {...p} />}

      {has("provide_verification") && (
        <FormAction run={p.run} action="provide_verification" submit="Send verification to buyer">
          <label className="field-label" htmlFor="note">What can you show the buyer?</label>
          <textarea id="note" name="note" className="input" rows={2} required maxLength={500}
            placeholder="e.g. Business registration number and a live video call showing the item" />
        </FormAction>
      )}

      {has("seller_accept") && (
        <div className="mt-4">
          <p>
            Confirm the product, amount and a {p.inspectionDays}-day inspection period. The buyer
            pays into escrow next. You ship once payment is secured.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Single run={p.run} action="seller_accept" className="btn-primary">Accept details</Single>
            <FormAction run={p.run} action="seller_reject" submit="Reject" submitClass="btn-danger" inline>
              <input name="reason" aria-label="Reason (optional)" className="input w-56" placeholder="Reason (optional)" />
            </FormAction>
          </div>
        </div>
      )}

      {has("pay") && (
        <div className="mt-4">
          <p>
            Your payment goes to SalamaPay escrow, not to the seller. The seller is paid only after
            you confirm delivery and inspect the item.
          </p>
          <div className="mt-4">
            <Single run={p.run} action="pay" className="btn-primary text-lg">
              Pay TZS {p.price.toLocaleString("en-US")} into escrow (simulated)
            </Single>
          </div>
        </div>
      )}

      {has("ship") && (
        <FormAction run={p.run} action="ship" submit="Mark as shipped" grid>
          <p className="sm:col-span-2 rounded-lg bg-salama-tint px-4 py-3 font-medium">
            Payment is secured in escrow. It is safe to ship.
          </p>
          <div>
            <label className="field-label" htmlFor="courier">Courier</label>
            <input id="courier" name="courier" className="input" defaultValue="Kilimanjaro Couriers" required maxLength={60} />
          </div>
          <div>
            <label className="field-label" htmlFor="trackingRef">Tracking reference</label>
            <input id="trackingRef" name="trackingRef" className="input" defaultValue={p.trackingSuggestion} required maxLength={40} />
          </div>
        </FormAction>
      )}

      {has("confirm_delivery") && (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <FormAction run={p.run} action="confirm_delivery" submit="Confirm delivery">
            <label className="field-label" htmlFor="otp">Delivery code from the parcel slip</label>
            <input id="otp" name="otp" className="input tabular text-2xl tracking-[0.3em] w-48" inputMode="numeric"
              autoComplete="one-time-code" maxLength={6} required pattern="\d{6}" />
            <p className="field-hint">Enter it only when the parcel is in your hands.</p>
          </FormAction>
          {p.courierSlip && (
            <div className="rounded-lg border-2 border-dashed border-line p-4 text-sm self-start">
              <p className="font-semibold">Parcel slip (simulated courier handover)</p>
              <p className="mt-1">{p.courierSlip}</p>
              <p className="mt-2 text-ink-soft">
                SalamaPay stores only a hash of this code. It expires after 72 hours and works once.
              </p>
            </div>
          )}
        </div>
      )}

      {has("release") && (
        <div className="mt-4">
          <p>
            Check that this is the item you agreed to buy. Releasing sends the money to the seller
            and can&apos;t be undone.
          </p>
          <div className="mt-4">
            <Single run={p.run} action="release" className="btn-primary text-lg">
              It&apos;s correct. Release payment
            </Single>
          </div>
        </div>
      )}

      {has("open_dispute") && <DisputeForm run={p.run} />}

      {has("seller_respond") && (
        <FormAction run={p.run} action="seller_respond" submit={p.hasSellerResponse ? "Update response" : "Send response"}>
          <label className="field-label" htmlFor="response">Your side of the story</label>
          <textarea id="response" name="response" className="input" rows={3} required maxLength={1000} />
          <EvidenceInput />
        </FormAction>
      )}

      {(has("resolve_refund") || has("resolve_release")) && <ResolveForm run={p.run} />}

      {has("review_report") && (
        <FormAction run={p.run} action="review_report" submit="Record review">
          <label className="field-label" htmlFor="rnote">Review note</label>
          <textarea id="rnote" name="note" className="input" rows={2} required maxLength={500}
            placeholder="e.g. Contacted seller; asked for ID. No account action until verified." />
          <p className="field-hint">The trust engine never blocks accounts. Any action is a human decision.</p>
        </FormAction>
      )}

      {/* Secondary buyer options (the decision step shows cancel/report itself) */}
      {!has("continue") && (has("cancel") || has("report") || has("amend_price")) && (
        <details className="mt-6 border-t border-line pt-4">
          <summary className="cursor-pointer font-semibold">Pause, report or change the price</summary>
          <div className="mt-4 grid gap-6 md:grid-cols-3">
            {has("cancel") && (
              <FormAction run={p.run} action="cancel" submit="Pause and cancel" submitClass="btn-quiet">
                <label className="field-label" htmlFor="creason">Reason (optional)</label>
                <input id="creason" name="reason" className="input" maxLength={300} />
              </FormAction>
            )}
            {has("report") && (
              <FormAction run={p.run} action="report" submit="Report for review" submitClass="btn-danger">
                <label className="field-label" htmlFor="rreason">What seemed wrong?</label>
                <input id="rreason" name="reason" className="input" required maxLength={500} />
              </FormAction>
            )}
            {has("amend_price") && (
              <FormAction run={p.run} action="amend_price" submit="Update price and re-check" submitClass="btn-quiet">
                <label className="field-label" htmlFor="nprice">New agreed price (TZS)</label>
                <input id="nprice" name="price" className="input tabular" inputMode="numeric" required defaultValue={p.price} />
                <p className="field-hint">The seller must accept again.</p>
              </FormAction>
            )}
          </div>
        </details>
      )}
    </section>
  );
}

/** The buyer's four choices after the trust check, with the engine's recommendation marked. */
function Decision(p: Props) {
  const recommended =
    p.riskLevel === "high" ? ["cancel", "report"] : p.riskLevel === "medium" ? ["request_verification"] : ["continue"];
  const tag = (a: string) =>
    recommended.includes(a) ? (
      <span className="ml-2 rounded-full bg-ink text-white text-xs font-semibold px-2 py-0.5 align-middle">Recommended</span>
    ) : null;
  const btn = (a: string) => (recommended.includes(a) ? "btn-primary" : "btn-quiet");
  const verifyAvailable = p.actions.includes("request_verification");

  return (
    <div className="mt-2">
      <p className="text-ink-soft">
        The score is guidance. You decide, and your choice is recorded in the timeline.
      </p>
      <ul className="mt-4 divide-y divide-line border-y border-line">
        <li className="py-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-semibold">Continue with protected payment{tag("continue")}</p>
            <p className="text-sm text-ink-soft">
              {p.riskLevel === "high"
                ? "If you go ahead anyway, your money still waits in escrow until you confirm delivery."
                : "Your money waits in escrow until you confirm delivery."}
            </p>
          </div>
          <Single run={p.run} action="continue" className={btn("continue")}>Continue</Single>
        </li>
        {verifyAvailable && (
          <li className="py-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="font-semibold">Ask the seller for verification{tag("request_verification")}</p>
              <p className="text-sm text-ink-soft">For example a live video of the item or business registration.</p>
            </div>
            <Single run={p.run} action="request_verification" className={btn("request_verification")}>Ask for proof</Single>
          </li>
        )}
        <li className="py-4">
          <FormAction run={p.run} action="cancel" submit="Pause and cancel" submitClass={btn("cancel")} row>
            <div>
              <p className="font-semibold">Pause and cancel{tag("cancel")}</p>
              <p className="text-sm text-ink-soft">Nothing has been paid. You can check the seller another way first.</p>
            </div>
          </FormAction>
        </li>
        <li className="py-4">
          <FormAction run={p.run} action="report" submit="Report" submitClass={recommended.includes("report") ? "btn-danger" : "btn-quiet"} row>
            <div>
              <p className="font-semibold">Report this seller or payment request{tag("report")}</p>
              <p className="text-sm text-ink-soft">A person on the SalamaPay team reviews it. Nobody is blocked automatically.</p>
              <input name="reason" aria-label="What seemed wrong?" className="input mt-2" required maxLength={500}
                defaultValue="Asked to pay a different name and to skip protection." />
            </div>
          </FormAction>
        </li>
      </ul>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">Agreed a different price with the seller?</summary>
        <FormAction run={p.run} action="amend_price" submit="Update price and re-check" submitClass="btn-quiet">
          <label className="field-label" htmlFor="nprice">New agreed price (TZS)</label>
          <input id="nprice" name="price" className="input tabular w-60" inputMode="numeric" required defaultValue={p.price} />
        </FormAction>
      </details>
    </div>
  );
}

const TITLES: Record<Role, (s: Status) => string> = {
  buyer: (s) =>
    ({
      ASSESSED: "What would you like to do?",
      VERIFICATION_REQUESTED: "Waiting for seller verification",
      AWAITING_SELLER: "Waiting for the seller to accept",
      ACCEPTED: "Secure your payment",
      SHIPPED: "Your parcel is on its way",
      DELIVERED: "Inspect your item",
    })[s as string] ?? "Next step",
  seller: (s) =>
    ({
      VERIFICATION_REQUESTED: "The buyer asked for verification",
      AWAITING_SELLER: "Review this order",
      FUNDED: "Ship the order",
      DISPUTED: "The buyer reported a problem",
    })[s as string] ?? "Next step",
  admin: (s) => (s === "DISPUTED" ? "Your decision" : s === "REPORTED" ? "Review this report" : "Next step"),
};

function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return <p role="alert" className="mt-3 rounded-lg bg-crimson-tint text-crimson font-semibold px-4 py-2.5">{state.error}</p>;
  }
  if (state.ok) return <p role="status" className="mt-3 rounded-lg bg-salama-tint text-salama font-semibold px-4 py-2.5">{state.ok}</p>;
  return null;
}

function Single({ run, action, className, children }: { run: Act; action: ActionType; className: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(run, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="action" value={action} />
      <button className={`btn ${className}`} disabled={pending}>{pending ? "Working…" : children}</button>
      <Feedback state={state} />
    </form>
  );
}

function FormAction({
  run, action, submit, submitClass = "btn-primary", children, grid = false, inline = false, row = false,
}: {
  run: Act; action: ActionType; submit: string; submitClass?: string; children: ReactNode; grid?: boolean; inline?: boolean; row?: boolean;
}) {
  const [state, formAction, pending] = useActionState(run, {});
  const layout = row
    ? "grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center"
    : inline ? "flex flex-wrap gap-2 items-start" : grid ? "mt-4 grid gap-4 sm:grid-cols-2" : "mt-4 space-y-3";
  return (
    <form action={formAction} className={layout}>
      <input type="hidden" name="action" value={action} />
      {children}
      <div className={grid ? "sm:col-span-2" : ""}>
        <button className={`btn ${submitClass}`} disabled={pending}>{pending ? "Working…" : submit}</button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function EvidenceInput() {
  const [files, setFiles] = useState<{ name: string; type: string; sizeKb: number }[]>([]);
  return (
    <div>
      <label className="field-label" htmlFor="evidence-files">Photos or documents (optional)</label>
      <input
        id="evidence-files"
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="block text-sm"
        onChange={(e) =>
          setFiles(
            Array.from(e.target.files ?? []).slice(0, 5).map((f) => ({
              name: f.name,
              type: f.type,
              sizeKb: Math.max(1, Math.ceil(f.size / 1024)),
            })),
          )
        }
      />
      <input type="hidden" name="evidence" value={JSON.stringify(files)} />
      <p className="field-hint">
        JPG, PNG, WEBP or PDF, up to 5 MB each. This prototype records file details only; the files stay on your device.
      </p>
    </div>
  );
}

function DisputeForm({ run }: { run: Act }) {
  return (
    <details className="mt-5 border-t border-line pt-4">
      <summary className="cursor-pointer font-semibold text-crimson">Something&apos;s wrong: open a dispute</summary>
      <FormAction run={run} action="open_dispute" submit="Open dispute" submitClass="btn-danger">
        <p className="text-sm text-ink-soft">The money stays locked in escrow while a person reviews both sides.</p>
        <div>
          <label className="field-label" htmlFor="dreason">What went wrong?</label>
          <select id="dreason" name="reason" className="input" required defaultValue="">
            <option value="" disabled>Choose one</option>
            <option value="not_received">Item not received</option>
            <option value="wrong_item">Wrong item received</option>
            <option value="damaged">Item damaged</option>
            <option value="counterfeit">Item appears fake or not as described</option>
            <option value="other">Other problem</option>
          </select>
        </div>
        <div>
          <label className="field-label" htmlFor="ddetails">Describe the problem</label>
          <textarea id="ddetails" name="details" className="input" rows={3} required maxLength={1000} />
        </div>
        <EvidenceInput />
      </FormAction>
    </details>
  );
}

function ResolveForm({ run }: { run: Act }) {
  const [state, formAction, pending] = useActionState(run, {});
  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label className="field-label" htmlFor="rationale">Reason for your decision</label>
        <textarea id="rationale" name="rationale" className="input" rows={3} required minLength={15} maxLength={1000}
          placeholder="What evidence did you rely on?" />
        <p className="field-hint">Saved to the audit timeline and shared with both parties.</p>
      </div>
      <label className="flex gap-3 items-start">
        <input type="checkbox" name="confirm" required className="mt-1 size-5 accent-[var(--salama)]" />
        <span>I reviewed the statements and evidence from both the buyer and the seller.</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <button name="action" value="resolve_refund" className="btn btn-quiet" disabled={pending}>Refund the buyer</button>
        <button name="action" value="resolve_release" className="btn btn-quiet" disabled={pending}>Release to the seller</button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
