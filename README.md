# SalamaPay: AI Trust Layer (hackathon MVP)

**Detect risk. Protect payment. Trade with confidence.**

GirlCode Hackathon Tanzania 2026, Challenge 2 (stopping scams before money moves).
A buyer enters a social-commerce purchase, gets an explainable risk score, decides what to do,
and completes a protected (simulated) escrow transaction through delivery, release or a
human-reviewed dispute. The full brief is in [`docs/BRIEF.md`](docs/BRIEF.md).

> Prototype only. Synthetic sellers, simulated escrow, courier and notifications. No real money.

## Run it

Requirements: Node 22+, PostgreSQL running locally.

```bash
npm install
cp .env.example .env.local          # then fill in your Postgres user/password
createdb salamapay && createdb salamapay_test
npm run db:reset                    # schema + 3 seller profiles + 12 past transactions
npm run dev                         # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run db:reset` | Drops and recreates all tables, then seeds synthetic data. Also available as **Reset demo data** in the footer. |
| `npm test` | 43 tests: risk engine, fairness, message analysis, state machine, security guards (uses `salamapay_test`). |
| `npm run typecheck` | TypeScript check. |
| `node --import tsx scripts/evaluate.ts` | Runs the rules on 200 synthetic labelled scenarios. |

## How it's built

| Piece | Where |
|---|---|
| Risk engine (transparent weighted rules, all weights in one file) | `src/lib/risk/config.ts`, `engine.ts` |
| Message analysis (English + Swahili, redacts PINs/OTPs first) | `src/lib/risk/message.ts` |
| Payment-name match | `src/lib/risk/name-match.ts` |
| Synthetic evaluation (false-positive rate etc.) | `src/lib/risk/evaluation.ts` |
| Transaction state machine: who may do what, when | `src/lib/workflow/machine.ts` |
| Service layer: row-locked Postgres transactions, escrow ledger, OTP, audit, notifications | `src/lib/services/transactions.ts` |
| Dispute evidence summary (template-based, never decides) | `src/lib/ai/dispute-summary.ts` |
| Schema | `db/schema.sql` |
| Pages | `src/app` (Next.js 16 App Router, server actions) |

Security properties worth mentioning to judges:

- **Server-side rules.** Every action goes through `nextStatus(status, role, action)` inside a `SELECT … FOR UPDATE` transaction. The UI is never trusted.
- **No double payouts.** Escrow ledger has `UNIQUE (transaction_id, entry_type)` plus a partial unique index allowing only one of RELEASE/REFUND. Tested with concurrent requests.
- **OTP.** 6 digits, stored as a salted SHA-256 hash, expires in 72 h, single use, locks after 5 wrong attempts.
- **Price changes after acceptance** reset seller approval and re-run the trust check.
- **Privacy.** The pasted seller message is never stored, only what was found in it; secrets are redacted before analysis. Evidence uploads record metadata only.
- **Human oversight.** AI/system has no role in any money-moving rule. Dispute decisions need a reviewer, a written rationale and an explicit confirmation.

## Scoring (tuned so the three demo profiles land where the brief expects)

Base 10; account <30 d +15 / 30–179 d +10; ≥2 open disputes +20 / 1 +10; price >50% below
range +15 / 20–50% +10 / 1–20% +5; unverified +10 / partial +5; payment-name mismatch +15;
recent device change +5; <10 sales +5; verified with 100+ sales and no disputes −5;
message patterns up to +20. Clamped to 0–100. Low <30, medium 30–59, high ≥60.

| Profile | Score | Level |
|---|---|---|
| A: Amani Electronics | 10 | low |
| B: Zuri Mobile Hub | 50 | medium |
| C: Dar Phone Deals | 95 (100 with its message) | high |

The brief's example weights gave A = 0, B = 10 (low) and C = 100, so they were re-weighted.

## Demo script (about 5 minutes)

Use the **Viewing as** switch in the header to play buyer, seller and reviewer.

1. **Problem.** Neema found a phone on Instagram at a price that looks too good to be true.
2. **Buyer → New trust check.** Pick *Profile C*, click *Paste this seller's demo message*, tick the consent box, run the check.
3. **Score 100, high risk.** Point at the three strongest signals, the "how the score adds up" table and the limits box. Say: *the AI has not called anyone a fraudster; it recommends pausing.* Click **Report**.
4. **New trust check with Profile A.** Score 10, low. Click **Continue**.
5. **Seller:** Accept details. **Buyer:** Pay into escrow. Show the money strip: the money sits with SalamaPay, not the seller.
6. **Seller:** Mark as shipped. **Buyer:** try `123456` (rejected, attempt counted), then the code from the parcel slip. Release payment, or open a dispute.
7. **Dispute path:** open a dispute, **Seller** responds, **Reviewer** reads the evidence summary and decides with a written reason.
8. **Impact page:** the five indicators (simulated), then **How scoring works** for fairness and the evaluation.

Press **Reset demo data** before presenting.

## Not in scope

Real bank or mobile-money integration, real escrow, KYC, ML training, price scraping, courier
APIs, native apps, blockchain. See the brief's roadmap.
