-- Check if orders used wallet credits
SELECT
  id,
  SUBSTRING(id::text, 1, 8) as order_short_id,
  user_id,
  status,
  subtotal_pence,
  credit_applied_pence,
  total_pence,
  created_at,
  paid_at
FROM orders
WHERE id IN (
  SELECT id FROM orders WHERE SUBSTRING(id::text, 1, 8) IN ('c7d226a5', 'deeb505d')
)
ORDER BY created_at DESC;
