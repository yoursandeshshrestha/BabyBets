-- Check wallet credits for user
SELECT
  id,
  user_id,
  amount_pence,
  remaining_pence,
  status,
  description,
  created_at
FROM wallet_credits
WHERE user_id = 'a513f24d-e524-40be-acc5-912f397a65f4'
ORDER BY created_at DESC;
