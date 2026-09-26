import { getPool } from "@/lib/db";
import { evaluate } from "@/lib/risk/evaluation";

/** The five impact indicators, computed from the (synthetic) database. */
export async function getImpactMetrics() {
  const db = getPool();
  const { rows } = await db.query(`
    WITH first_assess AS (
      SELECT DISTINCT ON (transaction_id) transaction_id, level, created_at
        FROM risk_assessments ORDER BY transaction_id, id
    ), latest AS (
      SELECT DISTINCT ON (transaction_id) transaction_id, level
        FROM risk_assessments ORDER BY transaction_id, id DESC
    ), hold AS (
      SELECT transaction_id, created_at FROM escrow_ledger WHERE entry_type = 'HOLD'
    )
    SELECT
      (SELECT count(*) FROM transactions) AS total,
      (SELECT count(*) FROM latest WHERE level = 'high') AS high_total,
      (SELECT count(*) FROM first_assess f LEFT JOIN hold h USING (transaction_id)
        WHERE f.level = 'high' AND (h.created_at IS NULL OR f.created_at < h.created_at)) AS high_flagged_before_pay,
      (SELECT count(*) FROM latest l LEFT JOIN hold h USING (transaction_id)
        WHERE l.level = 'high' AND h.transaction_id IS NULL) AS high_stopped,
      (SELECT coalesce(sum(t.price), 0) FROM transactions t JOIN latest l ON l.transaction_id = t.id
        WHERE l.level IN ('medium','high')
          AND t.status IN ('CANCELLED','REPORTED','VERIFICATION_REQUESTED')) AS value_paused,
      (SELECT count(*) FROM transactions t JOIN latest l ON l.transaction_id = t.id
        WHERE l.level IN ('medium','high')
          AND t.status IN ('CANCELLED','REPORTED','VERIFICATION_REQUESTED')) AS count_paused,
      (SELECT count(*) FROM hold) AS funded,
      (SELECT count(*) FROM transactions WHERE status = 'RELEASED') AS completed_ok,
      (SELECT count(*) FROM transactions
        WHERE status IN ('RELEASED','RESOLVED_REFUNDED','RESOLVED_RELEASED')) AS funded_closed,
      (SELECT count(*) FROM disputes WHERE decided_at IS NOT NULL) AS disputes_resolved,
      (SELECT count(*) FROM disputes WHERE decided_at IS NULL) AS disputes_open,
      (SELECT extract(epoch FROM avg(decided_at - opened_at)) / 3600
         FROM disputes WHERE decided_at IS NOT NULL) AS avg_resolution_hours
  `);
  const m = rows[0];
  const n = (v: unknown) => Number(v ?? 0);
  const pct = (a: number, b: number) => (b === 0 ? null : Math.round((a / b) * 1000) / 10);
  const evaluation = evaluate();

  return {
    total: n(m.total),
    highFlaggedBeforePayment: {
      value: pct(n(m.high_flagged_before_pay), n(m.high_total)),
      numerator: n(m.high_flagged_before_pay),
      denominator: n(m.high_total),
      stopped: n(m.high_stopped),
    },
    valuePaused: { tzs: n(m.value_paused), count: n(m.count_paused) },
    falsePositive: {
      value: evaluation.falsePositiveHigh,
      legitWarned: evaluation.legitWarned,
      scamWarned: evaluation.scamWarned,
      sample: evaluation.total,
    },
    completedSuccessfully: {
      value: pct(n(m.completed_ok), n(m.funded_closed)),
      numerator: n(m.completed_ok),
      denominator: n(m.funded_closed),
      funded: n(m.funded),
    },
    disputeResolution: {
      avgHours: m.avg_resolution_hours == null ? null : Math.round(n(m.avg_resolution_hours) * 10) / 10,
      resolved: n(m.disputes_resolved),
      open: n(m.disputes_open),
    },
    evaluation,
  };
}

export async function getReviewQueue() {
  const db = getPool();
  const [disputes, reports] = await Promise.all([
    db.query(`
      SELECT d.transaction_id, d.reason, d.opened_at, d.decided_at, d.human_decision,
             d.seller_response IS NOT NULL AS seller_responded,
             t.price, t.product_description, s.display_name AS seller_name
        FROM disputes d JOIN transactions t ON t.id = d.transaction_id
        JOIN seller_profiles s ON s.id = t.seller_id
       ORDER BY d.decided_at IS NOT NULL, d.opened_at DESC`),
    db.query(`
      SELECT r.transaction_id, r.reason, r.created_at, r.reviewed_at, r.review_note,
             t.price, t.product_description, s.display_name AS seller_name
        FROM reports r JOIN transactions t ON t.id = r.transaction_id
        JOIN seller_profiles s ON s.id = t.seller_id
       ORDER BY r.reviewed_at IS NOT NULL, r.created_at DESC`),
  ]);
  return { disputes: disputes.rows, reports: reports.rows };
}
