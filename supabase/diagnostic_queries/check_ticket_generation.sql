-- ============================================
-- TICKET GENERATION DIAGNOSTIC QUERIES
-- Use these to check ticket generation status and diagnose issues
-- ============================================

-- 1. Check all competitions with ticket generation status
SELECT
  c.id,
  c.title,
  c.competition_type,
  c.max_tickets,
  c.ticket_pool_locked,
  c.ticket_pool_generated_at,
  c.tickets_sold,
  COUNT(ta.id) as actual_tickets_generated,
  c.max_tickets - COUNT(ta.id) as tickets_missing,
  COUNT(ta.id) FILTER (WHERE ta.prize_id IS NOT NULL) as tickets_with_prizes,
  COUNT(ta.id) FILTER (WHERE ta.is_sold = true) as tickets_sold_count,
  CASE
    WHEN c.ticket_pool_locked = false THEN 'Not Generated'
    WHEN COUNT(ta.id) < c.max_tickets THEN 'Incomplete Generation'
    WHEN COUNT(ta.id) = c.max_tickets THEN 'Complete'
    ELSE 'Over-Generated (Error)'
  END as generation_status
FROM competitions c
LEFT JOIN ticket_allocations ta ON c.id = ta.competition_id
GROUP BY c.id
ORDER BY c.created_at DESC;

-- 2. Check for duplicate ticket numbers (should be none)
SELECT
  competition_id,
  ticket_number,
  COUNT(*) as duplicate_count
FROM ticket_allocations
GROUP BY competition_id, ticket_number
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- 3. Check ticket distribution for a specific competition
-- Replace 'YOUR_COMPETITION_ID' with actual competition ID
/*
SELECT
  c.title,
  c.max_tickets,
  COUNT(ta.id) as total_tickets,
  COUNT(ta.id) FILTER (WHERE ta.prize_id IS NULL) as tickets_no_prize,
  COUNT(ta.id) FILTER (WHERE ta.prize_id IS NOT NULL) as tickets_with_prize,
  COUNT(ta.id) FILTER (WHERE ta.is_sold = true) as tickets_sold,
  COUNT(ta.id) FILTER (WHERE ta.is_revealed = true) as tickets_revealed
FROM competitions c
LEFT JOIN ticket_allocations ta ON c.id = ta.competition_id
WHERE c.id = 'YOUR_COMPETITION_ID'
GROUP BY c.id, c.title, c.max_tickets;
*/

-- 4. Check prize allocation for a specific competition
-- Replace 'YOUR_COMPETITION_ID' with actual competition ID
/*
SELECT
  p.prize_name,
  p.tier,
  p.total_quantity,
  COUNT(ta.id) as allocated_count,
  p.total_quantity - COUNT(ta.id) as remaining_to_allocate,
  CASE
    WHEN COUNT(ta.id) = p.total_quantity THEN '✓ Complete'
    WHEN COUNT(ta.id) < p.total_quantity THEN '⚠ Incomplete'
    ELSE '✗ Over-allocated'
  END as allocation_status
FROM competition_instant_win_prizes p
LEFT JOIN ticket_allocations ta ON p.id = ta.prize_id
WHERE p.competition_id = 'YOUR_COMPETITION_ID'
GROUP BY p.id, p.prize_name, p.tier, p.total_quantity
ORDER BY p.tier ASC;
*/

-- 5. Find competitions that may need regeneration
SELECT
  c.id,
  c.title,
  c.max_tickets,
  COUNT(ta.id) as actual_tickets,
  c.ticket_pool_locked,
  c.tickets_sold,
  CASE
    WHEN c.ticket_pool_locked = false AND c.tickets_sold = 0 THEN '✓ Can regenerate'
    WHEN c.tickets_sold > 0 THEN '✗ Cannot regenerate (tickets sold)'
    WHEN c.ticket_pool_locked = true AND COUNT(ta.id) < c.max_tickets THEN '⚠ Incomplete but locked'
    ELSE 'Unknown'
  END as regeneration_status
FROM competitions c
LEFT JOIN ticket_allocations ta ON c.id = ta.competition_id
GROUP BY c.id
HAVING COUNT(ta.id) != c.max_tickets OR c.ticket_pool_locked = false
ORDER BY c.created_at DESC;

-- 6. Check database statement timeout setting
SHOW statement_timeout;

-- 7. Estimate ticket generation time (based on competition size)
SELECT
  id,
  title,
  max_tickets,
  CASE
    WHEN max_tickets <= 10000 THEN '~5-10 seconds'
    WHEN max_tickets <= 50000 THEN '~15-30 seconds'
    WHEN max_tickets <= 100000 THEN '~30-60 seconds'
    ELSE '~1-3 minutes (may need higher timeout)'
  END as estimated_generation_time
FROM competitions
WHERE ticket_pool_locked = false
ORDER BY max_tickets DESC;

-- 8. Check for failed/incomplete generations
SELECT
  c.id,
  c.title,
  c.max_tickets,
  c.ticket_pool_locked,
  c.ticket_pool_generated_at,
  COUNT(ta.id) as tickets_generated,
  c.max_tickets - COUNT(ta.id) as tickets_missing
FROM competitions c
LEFT JOIN ticket_allocations ta ON c.id = ta.competition_id
WHERE c.ticket_pool_locked = true
  AND c.ticket_pool_generated_at IS NOT NULL
GROUP BY c.id
HAVING COUNT(ta.id) < c.max_tickets;

-- 9. Manual cleanup: Remove tickets for unlocked competition (for regeneration)
-- CAUTION: Only run if you're sure you want to delete tickets
-- Replace 'YOUR_COMPETITION_ID' with actual competition ID
/*
DELETE FROM ticket_allocations
WHERE competition_id = 'YOUR_COMPETITION_ID'
  AND is_sold = false;

-- Also unlock the pool if needed
UPDATE competitions
SET ticket_pool_locked = false,
    ticket_pool_generated_at = NULL
WHERE id = 'YOUR_COMPETITION_ID'
  AND tickets_sold = 0;
*/

-- 10. Performance test: Check average ticket generation rate
SELECT
  c.id,
  c.title,
  c.max_tickets,
  c.ticket_pool_generated_at,
  EXTRACT(EPOCH FROM (c.ticket_pool_generated_at - c.created_at)) as seconds_to_generate,
  ROUND(c.max_tickets / EXTRACT(EPOCH FROM (c.ticket_pool_generated_at - c.created_at))) as tickets_per_second
FROM competitions c
WHERE c.ticket_pool_generated_at IS NOT NULL
  AND c.ticket_pool_generated_at > c.created_at
ORDER BY c.ticket_pool_generated_at DESC
LIMIT 10;
