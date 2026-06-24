// EC1 — Earned GOLD (Coins) primitive: atomic, idempotent, race-safe credit / debit /
// transfer. The keystone every coin-moving feature (template sales, referral rewards,
// paid-AI) builds on. Same discipline as the GOLD-spend path (E3):
//   - a per-profile advisory lock SERIALIZES all coin ops for a profile inside the
//     transaction, so balance read + check + write can't interleave (no overspend);
//   - an idempotency key (reference_id) makes retries safe;
//   - coin_balances.CHECK(balance >= 0) is the ultimate backstop.
// The *WithinTx functions run inside a caller-provided transaction so a feature can
// compose them atomically (e.g. remix = debit buyer + credit author + duplicate world).

export const MAX_COIN_AMOUNT = 100_000_000;

export function validateCoinAmount(amount) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_COIN_AMOUNT) return null;
  return n;
}

async function lockProfile(tx, profileId) {
  await tx`SELECT pg_advisory_xact_lock(hashtext(${'coin:' + Number(profileId)})::bigint)`;
}

async function balanceOf(tx, profileId) {
  const rows = await tx`SELECT balance FROM coin_balances WHERE profile_id = ${Number(profileId)}`;
  return rows.length ? Number(rows[0].balance) : 0;
}

async function priorByRef(tx, profileId, referenceId) {
  if (!referenceId) return null;
  const rows = await tx`
    SELECT id FROM coin_ledger
    WHERE profile_id = ${Number(profileId)} AND reference_id = ${referenceId}
    LIMIT 1
  `;
  return rows.length ? rows[0] : null;
}

// Credit coins to a profile. Runs inside the caller's transaction `tx`.
export async function creditWithinTx(tx, { profileId, amount, type = 'CREDIT', reason = null, referenceId = null, counterpartyProfileId = null }) {
  const amt = validateCoinAmount(amount);
  if (amt === null) return { ok: false, reason: 'invalid-amount' };
  await lockProfile(tx, profileId);
  if (await priorByRef(tx, profileId, referenceId)) {
    return { ok: true, replayed: true, balance: await balanceOf(tx, profileId) };
  }
  const rows = await tx`
    INSERT INTO coin_balances (profile_id, balance) VALUES (${Number(profileId)}, ${amt})
    ON CONFLICT (profile_id) DO UPDATE SET balance = coin_balances.balance + ${amt}, updated_at = NOW()
    RETURNING balance
  `;
  await tx`
    INSERT INTO coin_ledger (profile_id, delta, type, reason, reference_id, counterparty_profile_id)
    VALUES (${Number(profileId)}, ${amt}, ${type}, ${reason}, ${referenceId}, ${counterpartyProfileId == null ? null : Number(counterpartyProfileId)})
  `;
  return { ok: true, replayed: false, balance: Number(rows[0].balance) };
}

// Debit coins from a profile. Returns { ok:false, reason:'insufficient-coins' } if short.
export async function debitWithinTx(tx, { profileId, amount, type = 'DEBIT', reason = null, referenceId = null, counterpartyProfileId = null }) {
  const amt = validateCoinAmount(amount);
  if (amt === null) return { ok: false, reason: 'invalid-amount' };
  await lockProfile(tx, profileId);
  if (await priorByRef(tx, profileId, referenceId)) {
    return { ok: true, replayed: true, balance: await balanceOf(tx, profileId) };
  }
  const bal = await balanceOf(tx, profileId);
  if (bal < amt) return { ok: false, reason: 'insufficient-coins', balance: bal };
  // Conditional UPDATE is the backstop even if the lock were ever absent.
  const rows = await tx`
    UPDATE coin_balances SET balance = balance - ${amt}, updated_at = NOW()
    WHERE profile_id = ${Number(profileId)} AND balance >= ${amt}
    RETURNING balance
  `;
  if (!rows.length) return { ok: false, reason: 'insufficient-coins', balance: bal };
  await tx`
    INSERT INTO coin_ledger (profile_id, delta, type, reason, reference_id, counterparty_profile_id)
    VALUES (${Number(profileId)}, ${-amt}, ${type}, ${reason}, ${referenceId}, ${counterpartyProfileId == null ? null : Number(counterpartyProfileId)})
  `;
  return { ok: true, replayed: false, balance: Number(rows[0].balance) };
}

// Atomic player-to-player transfer: debit `from`, credit `to`, in ONE transaction.
// Locks both profiles in id order to avoid deadlock. Idempotent on `from`'s reference_id.
export async function transferCoins(sql, { fromProfileId, toProfileId, amount, reason = null, referenceId = null }) {
  const from = Number(fromProfileId), to = Number(toProfileId);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) return { ok: false, reason: 'invalid-profile' };
  if (from === to) return { ok: false, reason: 'self-transfer' };
  const amt = validateCoinAmount(amount);
  if (amt === null) return { ok: false, reason: 'invalid-amount' };

  return sql.begin(async (tx) => {
    // Deterministic lock order prevents deadlock between two opposing transfers.
    const [lo, hi] = from < to ? [from, to] : [to, from];
    await lockProfile(tx, lo);
    await lockProfile(tx, hi);

    if (await priorByRef(tx, from, referenceId)) {
      return { ok: true, replayed: true, fromBalance: await balanceOf(tx, from), toBalance: await balanceOf(tx, to) };
    }

    const debit = await debitWithinTx(tx, { profileId: from, amount: amt, type: 'TRANSFER_OUT', reason, referenceId, counterpartyProfileId: to });
    if (!debit.ok) return debit;
    const credit = await creditWithinTx(tx, { profileId: to, amount: amt, type: 'TRANSFER_IN', reason, referenceId, counterpartyProfileId: from });
    return { ok: true, replayed: false, fromBalance: debit.balance, toBalance: credit.balance };
  });
}

// Standalone wrappers (own transaction) for single credits/debits.
export function creditCoins(sql, opts) { return sql.begin((tx) => creditWithinTx(tx, opts)); }
export function debitCoins(sql, opts) { return sql.begin((tx) => debitWithinTx(tx, opts)); }

export function getCoinBalance(sql, profileId) {
  return sql`SELECT balance FROM coin_balances WHERE profile_id = ${Number(profileId)}`
    .then((rows) => (rows.length ? Number(rows[0].balance) : 0));
}
