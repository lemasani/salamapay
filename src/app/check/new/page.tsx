import { getRole } from "@/lib/session";
import { listProducts, listSellers } from "@/lib/services/transactions";
import { SELLER_PROFILES } from "@/lib/data/seed-data";
import { PurchaseForm } from "./purchase-form";

export default async function NewCheckPage() {
  const role = await getRole();
  if (role !== "buyer") {
    return (
      <p className="panel p-6 max-w-xl">
        Trust checks are started by buyers. Switch to <strong>Buyer (Neema)</strong> at the top of
        the page to create one.
      </p>
    );
  }
  const [sellers, products] = await Promise.all([listSellers(), listProducts()]);
  const demo = Object.fromEntries(
    SELLER_PROFILES.map((s) => [
      s.id,
      {
        paymentAccount: s.demoPaymentAccount,
        paymentName: s.demoPaymentName,
        discount: s.demoDiscount,
        message: s.demoMessage,
      },
    ]),
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl font-bold">New trust check</h1>
      <p className="mt-2 text-ink-soft text-lg">
        Tell us what you want to buy and who asked you to pay. Nothing is paid at this step.
      </p>
      <PurchaseForm
        sellers={sellers.map((s) => ({
          id: s.id,
          label: s.profile_label,
          name: s.display_name,
          handle: s.handle,
          phone: s.phone,
        }))}
        products={products.map((p) => ({ id: p.id, name: p.name, min: p.expected_min, max: p.expected_max }))}
        demo={demo}
      />
    </div>
  );
}
