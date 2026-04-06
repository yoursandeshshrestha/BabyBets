-- Check wallet transactions for user a513f24d-e524-40be-acc5-912f397a65f4
SELECT
  id,
  user_id,
  type,
  amount_pence,
  balance_after_pence,
  description,
  credit_id,
  order_id,
  created_at
FROM wallet_transactions
WHERE user_id = 'a513f24d-e524-40be-acc5-912f397a65f4'
ORDER BY created_at DESC;
