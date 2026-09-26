"use client";

import { useActionState, useState } from "react";
import { createPurchaseAction, type FormState } from "@/app/actions";

interface Props {
  sellers: { id: string; label: string; name: string; handle: string; phone: string }[];
  products: { id: string; name: string; min: number; max: number }[];
  demo: Record<string, { paymentAccount: string; paymentName: string; discount: number; message: string }>;
}

const CHANNELS = ["Instagram", "WhatsApp", "Facebook", "TikTok", "Online marketplace", "Other"];

function demoPrice(min: number, discount: number) {
  return String(Math.round((min * (1 - discount)) / 1000) * 1000);
}

export function PurchaseForm({ sellers, products, demo }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createPurchaseAction, {});
  const [sellerId, setSellerId] = useState(sellers[0]?.id ?? "");
  const [productId, setProductId] = useState(products.find((p) => p.id === "samsung-a55")?.id ?? products[0]?.id);
  const product = products.find((p) => p.id === productId)!;
  const d = demo[sellerId];

  const [price, setPrice] = useState(demoPrice(product.min, d.discount));
  const [description, setDescription] = useState(product.name);
  const [account, setAccount] = useState(d.paymentAccount);
  const [accountName, setAccountName] = useState(d.paymentName);
  const [message, setMessage] = useState("");

  function chooseSeller(id: string) {
    setSellerId(id);
    const nd = demo[id];
    setPrice(demoPrice(product.min, nd.discount));
    setAccount(nd.paymentAccount);
    setAccountName(nd.paymentName);
    if (message) setMessage(nd.message);
  }

  function chooseProduct(id: string) {
    const p = products.find((x) => x.id === id)!;
    setProductId(id);
    setDescription(p.name);
    setPrice(demoPrice(p.min, d.discount));
  }

  return (
    <form action={formAction} className="mt-8 space-y-8">
      <fieldset>
        <legend className="font-display text-xl font-bold">Who is selling?</legend>
        <p className="field-hint mb-3">
          Pick one of three synthetic sellers. Each has a different history, so you can see how the
          score responds to different evidence.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {sellers.map((s) => (
            <label
              key={s.id}
              className={`panel p-4 cursor-pointer block border-2 ${
                sellerId === s.id ? "border-ink" : "border-transparent"
              }`}
            >
              <input
                type="radio"
                name="sellerId"
                value={s.id}
                checked={sellerId === s.id}
                onChange={() => chooseSeller(s.id)}
                className="sr-only"
              />
              <span className="block text-sm text-ink-soft">{s.label}</span>
              <span className="block font-semibold mt-1">{s.name}</span>
              <span className="block text-sm text-ink-soft">{s.handle}</span>
              <span className="block text-sm text-ink-soft tabular">{s.phone}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-xl font-bold mb-3">What are you buying?</legend>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="productId">Product type</label>
          <select id="productId" name="productId" className="input" value={productId} onChange={(e) => chooseProduct(e.target.value)}>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="field-hint tabular">
            Usual price range (simulated): TZS {product.min.toLocaleString("en-US")} to{" "}
            {product.max.toLocaleString("en-US")}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="productDescription">Description from the listing</label>
          <input id="productDescription" name="productDescription" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} required />
        </div>
        <div>
          <label className="field-label" htmlFor="price">Agreed price (TZS)</label>
          <input id="price" name="price" inputMode="numeric" className="input tabular" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} required />
        </div>
        <div>
          <label className="field-label" htmlFor="sourceChannel">Where did you find it?</label>
          <select id="sourceChannel" name="sourceChannel" className="input" defaultValue="Instagram">
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-xl font-bold mb-3">Where were you asked to pay?</legend>
        <div>
          <label className="field-label" htmlFor="paymentAccount">Payment number or merchant reference</label>
          <input id="paymentAccount" name="paymentAccount" className="input" value={account} onChange={(e) => setAccount(e.target.value)} maxLength={80} required />
        </div>
        <div>
          <label className="field-label" htmlFor="paymentAccountName">Name on that account</label>
          <input id="paymentAccountName" name="paymentAccountName" className="input" value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={80} required />
          <p className="field-hint">The name your mobile-money app shows before you confirm.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="inspectionDays">Days to inspect after delivery</label>
          <select id="inspectionDays" name="inspectionDays" className="input" defaultValue="3">
            {[1, 2, 3, 5, 7].map((n) => <option key={n} value={n}>{n} day{n > 1 ? "s" : ""}</option>)}
          </select>
        </div>
      </fieldset>

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <label className="field-label" htmlFor="message">Seller&apos;s message (optional)</label>
          <button type="button" className="text-sm font-semibold text-salama underline underline-offset-2" onClick={() => setMessage(d.message)}>
            Paste this seller&apos;s demo message
          </button>
        </div>
        <textarea id="message" name="message" rows={3} className="input" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} placeholder="Paste what the seller sent you, e.g. on WhatsApp" />
        <p className="field-hint">
          We look for warning patterns like pressure to pay now. We don&apos;t store the message.
          Never paste a PIN, password or OTP. If one slips in, it is removed before analysis.
        </p>
      </div>

      <div className="panel p-5 bg-salama-tint border-salama/30">
        <p className="font-semibold">What the trust check looks at</p>
        <p className="text-[0.95rem] mt-1">
          Seller account age, completed sales, open disputes, verification status, recent phone or
          device changes, whether the payment name matches the seller, and how the price compares
          with the usual range. It never uses gender, tribe, religion, location or income.
        </p>
        <label className="mt-4 flex gap-3 items-start">
          <input type="checkbox" name="consent" required className="mt-1 size-5 accent-[var(--salama)]" />
          <span>I understand what is analysed, and that the result is a guide, not proof of fraud.</span>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-crimson-tint text-crimson font-semibold px-4 py-3">
          {state.error}
        </p>
      )}

      <button className="btn btn-primary text-lg px-7" disabled={pending}>
        {pending ? "Checking…" : "Run trust check"}
      </button>
    </form>
  );
}
