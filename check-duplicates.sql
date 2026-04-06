-- Check for duplicate transactions
SELECT
  wt.id,
  wt.user_id,
  wt.type,
  wt.amount_pence,
  wt.balance_after_pence,
  wt.description,
  wt.credit_id,
  wt.order_id,
  wt.created_at,
  wc.id as wallet_credit_id,
  wc.amount_pence as wallet_credit_amount,
  wc.description as wallet_credit_desc
FROM wallet_transactions wt
LEFT JOIN wallet_credits wc ON wt.credit_id = wc.id
WHERE wt.user_id = 'a513f24d-e524-40be-acc5-912f397a65f4'
ORDER BY wt.created_at DESC;
