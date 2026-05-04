/**
 * Single source of truth for the commission terms shown to businesses
 * during registration and stored as legal evidence in their account.
 *
 * IMPORTANT: any change to fees, calendar, or wording MUST bump
 * COMMISSION_TERMS_VERSION so existing businesses are forced to
 * re-accept and the audit trail stays clean.
 */

export const COMMISSION_TERMS_VERSION = 'v2-2026-02';

// BOOKVIA_FEE_MXN is the platform fee charged TO THE CLIENT at checkout —
// it is NOT a cost to the business, so it is intentionally NOT shown in
// the breakdown the business sees nor included in the legal snapshot.
// Kept here for backend reference / checkout pricing.
export const BOOKVIA_FEE_MXN = 8.20;
export const STRIPE_FEE_PCT = 0.085;
export const SUBSCRIPTION_PRICE_MXN = 49.99;
export const PAYOUT_CADENCE = 'monthly_cutoff_20';
export const PAYOUT_CADENCE_LABEL_ES = 'Corte el día 20 · Depósito el día 1° del mes siguiente';
export const PAYOUT_CADENCE_LABEL_EN = 'Cutoff day 20 · Payout on the 1st of the following month';

/**
 * Returns the deterministic terms snapshot that gets hashed and persisted
 * when the business accepts. Two businesses accepting the same version
 * produce the same hash; any field change → different hash → audit catches it.
 *
 * Note: the snapshot only contains fees that AFFECT THE BUSINESS. The
 * Bookvia client fee is intentionally excluded because it is charged
 * separately to the end client and does not affect the business's net.
 */
export function buildCommissionTermsSnapshot() {
  return {
    version: COMMISSION_TERMS_VERSION,
    fees: {
      commission_pct: STRIPE_FEE_PCT,
      commission_iva_included: true,
      subscription_monthly_mxn: SUBSCRIPTION_PRICE_MXN,
    },
    payout: {
      cadence: PAYOUT_CADENCE,
      cutoff_day: 20,
      payout_day: 1,
      currency: 'MXN',
    },
    rules: [
      'noshow_releases_deposit_after_24h_to_business',
      'chargeback_holds_funds_10_30d',
      'fintech_withholding_isr_4pct_iva_8pct_with_30d_notice',
    ],
  };
}

/**
 * Hash the canonical JSON representation of the snapshot using SubtleCrypto.
 * Returns a hex SHA-256. Used as legal fingerprint.
 */
export async function hashCommissionTermsSnapshot(snapshot) {
  const canonical = JSON.stringify(snapshot, Object.keys(snapshot).sort());
  const buf = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
