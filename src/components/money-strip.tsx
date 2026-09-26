import type { Status } from "@/lib/workflow/machine";
import { tzs } from "@/lib/format";

type Place = "buyer" | "escrow" | "seller";

function whereIsTheMoney(status: Status): { place: Place; caption: string } {
  switch (status) {
    case "FUNDED":
    case "SHIPPED":
    case "DELIVERED":
      return { place: "escrow", caption: "Held safely by SalamaPay. The seller can't touch it until you confirm." };
    case "DISPUTED":
      return { place: "escrow", caption: "Locked while a person reviews the dispute." };
    case "RELEASED":
    case "RESOLVED_RELEASED":
      return { place: "seller", caption: "Paid to the seller." };
    case "RESOLVED_REFUNDED":
      return { place: "buyer", caption: "Refunded to the buyer after human review." };
    case "CANCELLED":
    case "REPORTED":
    case "SELLER_REJECTED":
      return { place: "buyer", caption: "Never left the buyer. Nothing was paid." };
    default:
      return { place: "buyer", caption: "Still with the buyer. Nothing is paid until you choose to." };
  }
}

const STOPS: { place: Place; label: string }[] = [
  { place: "buyer", label: "Buyer" },
  { place: "escrow", label: "SalamaPay escrow" },
  { place: "seller", label: "Seller" },
];

export function MoneyStrip({ status, amount }: { status: Status; amount: number }) {
  const { place, caption } = whereIsTheMoney(status);
  return (
    <section aria-label="Where the money is" className="panel p-5">
      <p className="text-sm text-ink-soft">Where your money is</p>
      <ol className="mt-3 grid grid-cols-3 items-center">
        {STOPS.map((s, i) => {
          const here = s.place === place;
          return (
            <li key={s.place} className="relative flex flex-col items-center text-center">
              {i > 0 && (
                <span aria-hidden="true" className="absolute top-5 right-1/2 w-full h-0.5 bg-line -z-0" />
              )}
              <span
                className={`relative z-10 flex items-center justify-center rounded-full h-10 transition-all ${
                  here
                    ? "bg-gold text-ink px-4 font-display font-bold tabular shadow-[0_0_0_4px_var(--gold-tint)]"
                    : "bg-paper border-2 border-line w-10"
                }`}
              >
                {here ? tzs(amount) : ""}
              </span>
              <span className={`mt-2 text-sm ${here ? "font-semibold text-ink" : "text-ink-soft"}`}>
                {s.label}
                {here && <span className="sr-only"> (money is here)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[0.95rem]">{caption}</p>
    </section>
  );
}
