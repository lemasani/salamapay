-- SalamaPay prototype schema (PostgreSQL). Dropping and recreating is intentional:
-- the demo is reset from synthetic seed data.

DROP TABLE IF EXISTS notifications, audit_events, reports, disputes, escrow_ledger,
  deliveries, risk_assessments, transactions, products, seller_profiles, users CASCADE;
DROP SEQUENCE IF EXISTS transaction_seq;

CREATE TABLE users (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  role                text NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  verification_status text NOT NULL
);

CREATE TABLE seller_profiles (
  id                      text PRIMARY KEY,
  user_id                 text NOT NULL REFERENCES users(id),
  profile_label           text NOT NULL,
  display_name            text NOT NULL,
  handle                  text NOT NULL,
  phone                   text NOT NULL,
  registered_payment_name text NOT NULL,
  account_age_days        int  NOT NULL CHECK (account_age_days >= 0),
  completed_transactions  int  NOT NULL CHECK (completed_transactions >= 0),
  unresolved_disputes     int  NOT NULL CHECK (unresolved_disputes >= 0),
  verification_status     text NOT NULL CHECK (verification_status IN ('verified', 'partial', 'unverified')),
  recent_device_change    boolean NOT NULL
);

-- Synthetic expected price ranges (stands in for market-price data).
CREATE TABLE products (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  expected_min bigint NOT NULL,
  expected_max bigint NOT NULL CHECK (expected_max >= expected_min)
);

CREATE SEQUENCE transaction_seq START 26091;

CREATE TABLE transactions (
  id                   text PRIMARY KEY DEFAULT 'SP-' || nextval('transaction_seq'),
  buyer_id             text NOT NULL REFERENCES users(id),
  seller_id            text NOT NULL REFERENCES seller_profiles(id),
  product_id           text NOT NULL REFERENCES products(id),
  product_description  text NOT NULL,
  price                bigint NOT NULL CHECK (price > 0),
  accepted_price       bigint,
  payment_account      text NOT NULL,
  payment_account_name text NOT NULL,
  source_channel       text NOT NULL,
  inspection_days      int NOT NULL CHECK (inspection_days BETWEEN 1 AND 14),
  status               text NOT NULL,
  buyer_decision       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE risk_assessments (
  id                 serial PRIMARY KEY,
  transaction_id     text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  input_signals      jsonb NOT NULL,
  score              int NOT NULL CHECK (score BETWEEN 0 AND 100),
  level              text NOT NULL CHECK (level IN ('low', 'medium', 'high')),
  reasons            jsonb NOT NULL,
  recommended_action text NOT NULL,
  result             jsonb NOT NULL,
  model_version      text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deliveries (
  transaction_id      text PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  courier             text NOT NULL,
  tracking_ref        text NOT NULL,
  status              text NOT NULL CHECK (status IN ('in_transit', 'delivered')),
  otp_hash            text NOT NULL,           -- never the OTP itself
  otp_expires_at      timestamptz NOT NULL,
  otp_failed_attempts int NOT NULL DEFAULT 0,
  otp_used_at         timestamptz,
  shipped_at          timestamptz NOT NULL DEFAULT now(),
  delivered_at        timestamptz
);

-- Simulated escrow. Constraints make double payment / double payout impossible
-- even if application checks were bypassed.
CREATE TABLE escrow_ledger (
  id             serial PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  entry_type     text NOT NULL CHECK (entry_type IN ('HOLD', 'RELEASE', 'REFUND')),
  amount         bigint NOT NULL CHECK (amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transaction_id, entry_type)
);
CREATE UNIQUE INDEX escrow_single_payout ON escrow_ledger (transaction_id)
  WHERE entry_type IN ('RELEASE', 'REFUND');

CREATE TABLE disputes (
  id                  serial PRIMARY KEY,
  transaction_id      text NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  reason              text NOT NULL,
  details             text NOT NULL,
  evidence            jsonb NOT NULL DEFAULT '[]',  -- metadata only, never file contents
  seller_response     text,
  seller_responded_at timestamptz,
  ai_summary          jsonb,                       -- assists the reviewer, never decides
  human_decision      text CHECK (human_decision IN ('refund_buyer', 'release_to_seller')),
  decision_rationale  text,
  decided_by          text REFERENCES users(id),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz
);

CREATE TABLE reports (
  id             serial PRIMARY KEY,
  transaction_id text NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  reason         text NOT NULL,
  review_note    text,
  reviewed_by    text REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE TABLE audit_events (
  id             bigserial PRIMARY KEY,
  transaction_id text REFERENCES transactions(id) ON DELETE CASCADE,
  actor          text NOT NULL,
  actor_role     text NOT NULL,
  action         text NOT NULL,
  detail         jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX audit_events_tx ON audit_events (transaction_id, id);

-- Simulated notification service (SMS / WhatsApp / email are not really sent).
CREATE TABLE notifications (
  id             bigserial PRIMARY KEY,
  transaction_id text REFERENCES transactions(id) ON DELETE CASCADE,
  recipient      text NOT NULL CHECK (recipient IN ('buyer', 'seller', 'admin', 'courier')),
  channel        text NOT NULL,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT clock_timestamp()
);
