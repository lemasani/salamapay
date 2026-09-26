# SalamaPay AI Trust Layer

## GirlCode Hackathon Tanzania 2026 - MVP Project Brief

**Challenge selected:** Challenge 2 - AI Trust Layer: Stopping Scams Before Money Moves
**Theme:** Future-Proofing Africa at the Intersection of FinTech, Cybersecurity, Insurance and AI
**Prototype type:** Functional web MVP using synthetic data
**Primary market:** Tanzania
**Expansion potential:** African digital-commerce and payment ecosystems

> Implementation note: the example scoring weights in section 8.1 do not produce the expected
> results in section 9 (they give A = 0, B = 10, C = 100). The implemented weights are listed in
> `src/lib/risk/config.ts` and the README; they give A = 10, B = 50, C = 95.

---

## 1. Project Summary

SalamaPay is an AI-powered trust and protected-payment platform for people buying and selling through Instagram, WhatsApp, Facebook, online marketplaces and independent digital shops.

Before a buyer sends money, SalamaPay evaluates the seller, product price and payment request using an explainable AI risk engine. It highlights suspicious signals, gives the interaction a risk level and recommends the safest next action.

If the buyer decides to continue, SalamaPay protects the transaction through simulated escrow. The money remains secured until delivery is verified and the buyer confirms that the correct product was received. If a problem occurs, the funds remain locked while a human administrator reviews evidence from both parties.

SalamaPay can be used directly through its website or integrated into banks, mobile-money services, telecom applications and marketplaces through APIs or SDKs.

> **Core proposition:** Detect the risk before money moves, then protect the payment until delivery succeeds.

---

## 2. The Problem

Social commerce allows small businesses to reach customers without owning expensive online stores. However, buyers and sellers often transact without a trusted marketplace between them.

### Buyer risks

- Fake or impersonated sellers.
- Products advertised at unrealistic prices.
- Payment accounts that do not match the seller's identity.
- Products that are never delivered.
- Damaged, fake or incorrect products.
- No structured process for reporting a problem.

### Seller risks

- Fake orders and dishonest buyers.
- Shipping a product before payment is secured.
- Buyers falsely denying delivery.
- Paying delivery costs for rejected or fraudulent orders.
- Difficulty proving a trustworthy transaction history.

### Ecosystem problem

Banks and mobile-money providers often see the payment only when it is about to move. They may not have enough context about the product, seller, delivery agreement or social-commerce conversation to warn the customer clearly.

---

## 3. Challenge Question

> How might we use explainable AI to evaluate a seller and digital-commerce payment request before a customer pays, recommend a safe action and protect approved transactions until delivery is verified?

---

## 4. Target Users

- **Primary user: Buyer.** A customer who discovers a product through social media or another digital channel and wants to verify the transaction before paying.
- **Secondary user: Seller.** A legitimate merchant who wants to prove trustworthiness, confirm that payment is secured and receive money after successful delivery.
- **Operational user: Human reviewer.** An authorised administrator who reviews flagged transactions and disputed deliveries using evidence from both parties.
- **Adopters and partners:** banks, mobile-money providers, telecom companies, FinTech companies, online marketplaces, courier companies, independent merchants, consumer-protection organisations.

---

## 5. MVP Objective

The MVP must prove one complete user journey:

> A buyer enters a social-commerce purchase, receives an explainable AI risk assessment, chooses a safe action and completes a protected simulated transaction through delivery, approval or dispute.

The MVP does not process real money and does not claim to provide a production fraud-detection model.

---

## 6. Complete MVP User Journey

1. **Create a purchase.** The buyer enters product description, seller name or phone number, agreed price, payment account or merchant reference, source of the offer (e.g. Instagram, WhatsApp) and preferred inspection period. The prototype may also allow the buyer to paste a suspicious payment message.
2. **Run the AI Trust Check.** The system evaluates synthetic seller and transaction information: seller account age, completed transactions, previous disputes, verification status, account-name match, recent phone-number or device changes, price difference from a synthetic expected range, suspicious wording in the payment request.
3. **Explain the risk.** Risk score 0-100; low, medium or high; signals that affected the score; model confidence or uncertainty; recommended next action.
4. **Customer chooses an action.** Continue with protected payment; request additional seller verification; pause or cancel; report a suspicious seller or payment request.
5. **Seller confirms the purchase.** The seller reviews product, amount and inspection period and accepts or rejects.
6. **Simulated escrow payment.** The prototype shows that the money is secured, not transferred directly to the seller.
7. **Seller ships.** The seller enters a courier and tracking reference.
8. **Delivery verification.** The buyer uses a demonstration OTP after physically receiving the package.
9. **Inspection decision.** The buyer confirms the correct product and releases payment, or reports a problem and opens a dispute.
10. **Human-reviewed dispute.** The administrator sees an AI-generated evidence summary but makes the final refund or payment decision.

---

## 7. MVP Flow

```text
BUYER ENTERS PURCHASE DETAILS
              |
              v
      AI TRUST CHECK
              |
              v
RISK SCORE + REASONS + SAFE ACTION
              |
       +------+------+
       |             |
       v             v
PAUSE/REPORT     CONTINUE SAFELY
                     |
                     v
            SELLER ACCEPTS DETAILS
                     |
                     v
          SIMULATED ESCROW PAYMENT
                     |
                     v
                SELLER SHIPS
                     |
                     v
             DELIVERY OTP VERIFIED
                     |
              +------+------+
              |             |
              v             v
        RELEASE PAYMENT   OPEN DISPUTE
                              |
                              v
                       HUMAN REVIEW
```

---

## 8. AI Capability

### 8.1 Explainable transaction-risk scoring

For the hackathon, the MVP uses a transparent rule-based scoring engine with synthetic data. Example scoring logic from the original brief (superseded, see note at top):

```text
Base risk score                                  +10
Seller account is less than 30 days old          +20
Seller has two or more unresolved disputes       +25
Product price is over 50% below expected range   +20
Seller identity and payment account do not match +20
Device or phone number changed recently          +10
Verified seller with strong history              -15
```

The final score is limited to 0-100.

### 8.2 Risk categories

| Score | Risk level | Recommended action |
|---:|---|---|
| 0-29 | Low | Continue with SalamaPay protection |
| 30-59 | Medium | Request additional verification |
| 60-100 | High | Pause, verify independently or report |

### 8.3 AI evidence displayed in the prototype

The data provided to the risk engine, the calculated score, the strongest risk signals, why each signal matters, the recommended action, a limitation statement, and the buyer's final choice.

### 8.4 Optional language analysis

The buyer can paste a suspicious payment message. A lightweight language-analysis component highlights urgent pressure to pay, requests to avoid the official platform, unusual requests for PINs or OTPs, a mismatched payment recipient, and claims that cannot be verified. This feature must not request or store passwords, PINs or OTPs.

### 8.5 Dispute evidence summarisation

AI summarises the buyer's complaint, seller's response, delivery status, OTP confirmation and uploaded evidence metadata. The output assists the human reviewer and does not decide the case.

---

## 9. Synthetic Demonstration Profiles

| Signal | A: Low risk | B: Medium risk | C: High risk |
|---|---|---|---|
| Account age | 3 years | 2 months | 5 days |
| Completed transactions | 148 | 7 | 1 |
| Unresolved disputes | 0 | 1 | 3 |
| Identity | Verified | Partially verified | Not verified |
| Payment-name match | Yes | Yes | No |
| Price difference | 5% below | 30% below | 65% below |
| Recent device change | No | No | Yes |
| Expected risk result | ~10-20 | ~40-55 | ~80-95 |

---

## 10. MVP Features

**Must build:** buyer purchase-entry form; three selectable synthetic seller profiles; explainable AI risk score; highlighted risk signals; recommended safe action; buyer decision (continue, verify, cancel, report); seller acceptance view; simulated escrow payment; shipment and tracking confirmation; delivery OTP; release-payment or dispute choice; administrator dispute view; activity/audit timeline; clear prototype and synthetic-data labels.

**Build only if time remains:** suspicious-message analysis; AI evidence summary for disputes; Swahili interface toggle; downloadable transaction receipt; merchant payment-link generator.

**Do not build during the hackathon:** real bank integration; real mobile-money integration; real-money escrow; full KYC; production ML training; live market-price scraping; full courier API integration; native Android/iOS apps; blockchain or token features.

---

## 11. Product Access Model

- **Direct website:** buyers and merchants create protected transactions through SalamaPay.
- **Merchant payment link:** a merchant shares a link such as `https://salamapay.example/pay/SP-26091` through WhatsApp, Instagram, SMS or email.
- **Partner integration:** banks, telecoms, mobile-money providers and marketplaces integrate through an API or SDK ("Protected by SalamaPay"). SalamaPay remains platform-neutral while regulated financial partners safeguard and transfer real customer funds.

---

## 12. Technical Architecture

```text
Buyer / Seller / Administrator Interface
                  |
                  v
          SalamaPay Application API
        +---------+----------+
        |         |          |
        v         v          v
 Transaction  AI Trust   Notification
  Service      Engine       Service
        |         |          |
        +---------+----------+
                  |
                  v
         Secure Application Data
                  |
       +----------+-----------+
       |                      |
       v                      v
Licensed Payment        Courier/Marketplace
Partner - future        Integration - future
```

Recommended stack in the brief: HTML/CSS/JS or React; Flask, FastAPI or Node.js; SQLite or JSON; transparent rules; simple risk meter; responsive web app. (Implemented with Next.js + TypeScript + PostgreSQL.)

---

## 13. Minimum Data Model

- **User:** ID, name, role, verification status.
- **Seller profile:** ID, account age, completed transactions, unresolved disputes, verification status, payment-name match, recent device-change indicator.
- **Protected transaction:** ID, buyer, seller, product description, price, source channel, inspection period, status.
- **Risk assessment:** ID, transaction, input signals, score, level, reasons, recommended action, model version, timestamp.
- **Delivery:** tracking reference, delivery status, OTP verification status, delivery timestamp.
- **Dispute:** ID, transaction, buyer reason, seller response, evidence references, human decision.
- **Audit event:** actor, action, target, timestamp.

---

## 14. Responsible AI and Security

**Consent and privacy:** explain what data is analysed; synthetic data only; minimise collection; never send PINs, passwords or OTPs to an AI model; allow users to correct inaccurate information.

**Explainability:** show the signals behind every score; state that risk is not proof of criminal activity; show uncertainty and limitations; no unexplained black-box decisions.

**Fairness:** no gender, tribe, religion or other protected characteristics; low income, location or device type are not proof of fraud; test all three profiles consistently; provide an appeal and human-review path.

**Human oversight:** AI may detect patterns, calculate and explain risk, recommend a safe action and summarise dispute evidence. AI must not independently move money, release escrow, refund a customer, permanently block a user, declare a person fraudulent, or make the final dispute decision.

**Security controls:** role-based access control; server-side state validation; hashed and expiring OTPs in production; rate limiting; secure evidence upload validation; audit logging; encryption in transit and at rest; prevention of duplicate payment or release actions; manual approval for sensitive administrative actions.

---

## 15. Business and Ecosystem Value

- **Customers:** scam warnings before payment, clear explanations, protected payment, a structured dispute process.
- **Merchants:** proof that the buyer has secured payment, more customer confidence, verified history, less exposure to fake orders.
- **Partners:** safer transactions for banks and mobile money, a fraud-protection layer for telecoms, fewer complaints for marketplaces, trusted delivery evidence for couriers, structured reports for consumer-protection organisations.

## 16. Business Model

Small transaction-protection fee, merchant subscription, API usage fee, enterprise or white-label licence, premium merchant verification, courier and marketplace partnerships. All fees transparent before the customer accepts.

## 17. Five Measurable Impact Indicators

1. Percentage of high-risk transactions flagged before payment.
2. Estimated value of risky payments paused or prevented.
3. False-positive rate of the risk engine.
4. Percentage of protected transactions completed successfully.
5. Average time required to resolve a dispute.

For the hackathon these must be labelled as simulated outcomes from synthetic test scenarios.

---

## 18. 30-Hour Build Plan

- **Hours 1-3:** confirm the journey, define profiles, draw screens and states, assign roles.
- **Hours 4-9:** purchase form, seller-profile selection, seller review and acceptance.
- **Hours 10-15:** rule-based scoring, risk display, continue/verify/cancel/report.
- **Hours 16-21:** simulated escrow, shipment tracking, delivery OTP, release or dispute.
- **Hours 22-25:** admin dispute screen, limitation/consent/synthetic-data notices, audit timeline.
- **Hours 26-30:** test profiles and journey, fix issues, prepare live demo, record backup video, rehearse Q&A.

## 19. Team Work Allocation

| Role | Responsibility |
|---|---|
| Product/pitch lead | Problem, story, business case and presentation |
| Frontend developer | Buyer, seller, admin and risk-result screens |
| Backend developer | Transaction state, API and synthetic data |
| AI/data lead | Risk rules, explanations and evaluation scenarios |
| Cybersecurity/QA lead | Threats, access control, testing and responsible AI |

---

## 20. Testing Checklist

**Functional:** custom price; seller accept/reject; each profile gives its intended category; explanations match inputs; buyer can pause, report or continue; no payment before seller acceptance; no shipping before payment; wrong OTP rejected; no release before delivery; no release while a dispute is open; administrator can demonstrate a human resolution.

**Responsible AI:** no protected characteristics; result states it is not proof of fraud; user sees why; user can choose not to continue; high risk recommends verification, not punishment; AI does not make the final dispute decision.

**Security:** buyer cannot do seller actions; seller cannot do admin actions; amount cannot change after acceptance without restarting approval; repeated release does not pay twice; OTP cannot be reused; every important action appears in the audit timeline.

(All covered by `tests/`.)

---

## 21. Hackathon Demo Script

1. **The problem.** "Neema finds a phone advertised on Instagram at a very attractive price. The seller asks her to send money immediately to a different account. She does not know whether the seller is genuine."
2. **Create the purchase** with product, seller, price and Instagram as the source.
3. **AI Trust Check** with the high-risk seller: "SalamaPay identifies a new account, three unresolved disputes, a name mismatch and a price far below the expected range."
4. **Safe recommendation:** pause and verify. The AI has not declared the seller guilty.
5. **Protected alternative:** switch to the verified seller, continue with protected payment.
6. **Complete the transaction:** accept, pay, ship, verify delivery, release or dispute.
7. **Impact:** the five indicators and the pathway to banks, telecoms, marketplaces and other African markets.

## 22. Elevator Pitch

> Millions of people buy products through Instagram, WhatsApp and other digital channels, but they often cannot tell whether a seller or payment request is genuine. SalamaPay is an AI-powered trust layer that evaluates the seller, product price and payment request before money moves. It gives the customer an explainable risk score and a safe next action. If the customer continues, SalamaPay protects the transaction through regulated escrow until delivery is verified. The platform can be used directly by buyers and merchants or integrated by banks, telecoms and marketplaces. SalamaPay does not replace human judgement; it helps people detect risk, make safer decisions and complete digital transactions with confidence.

## 23. Why This Is More Than Another Payment App

It combines AI risk detection before payment, explainable and customer-controlled recommendations, protected payment after the customer chooses to proceed, and verified delivery with human-reviewed dispute resolution. Without the risk assessment, the system would only react after the customer had already decided to pay.

## 24. Limitations

Synthetic seller and transaction data; the rule-based score is a prototype, not proof of fraud; market prices, escrow, payments, courier and identity checks are simulated; a production model needs representative data, formal validation, monitoring, appeals and regulatory approval; real funds must be held by licensed institutions.

## 25. Future Roadmap

- **Phase 1 (hackathon MVP):** explainable rules, synthetic profiles, simulated protected payment, delivery and dispute journey.
- **Phase 2 (controlled pilot):** one licensed payment partner, one courier, verified merchants, limited values, human-led review.
- **Phase 3 (ecosystem platform):** bank and mobile-money APIs, merchant payment links, marketplace SDK, trained and monitored model, Swahili and more languages.
- **Phase 4 (regional growth):** multi-country rules, cross-border seller verification, regional partners, privacy-safe shared scam intelligence.

## 26. Tagline

> **SalamaPay - Detect risk. Protect payment. Trade with confidence.**

## 27. MVP Disclaimer

SalamaPay is a hackathon prototype. It uses synthetic data and simulated payments, delivery events and disputes. It does not provide a final fraud determination, process real customer money or replace regulated financial institutions, law enforcement, qualified fraud analysts or human dispute reviewers.
