-- ============================================
-- REMOVE DUPLICATE WALLET TRANSACTIONS
-- Description: Clean up duplicate credit transactions created before trigger was added
-- Date: 2026-04-06
-- ============================================

-- Remove duplicate wallet transactions for credits (keep only one per credit_id)
-- This cleans up duplicates created when both frontend code AND trigger inserted records
DELETE FROM wallet_transactions
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY credit_id, user_id, type, amount_pence
             ORDER BY created_at ASC
           ) AS rn
    FROM wallet_transactions
    WHERE type = 'credit' AND credit_id IS NOT NULL
  ) ranked
  WHERE rn > 1
);
