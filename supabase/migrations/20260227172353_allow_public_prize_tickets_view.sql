-- Allow anyone (including unauthenticated users) to view tickets that are assigned to instant win prizes
-- These are the winning ticket numbers that should be publicly visible on competition pages
CREATE POLICY "Anyone can view prize-assigned tickets"
ON public.ticket_allocations FOR SELECT
TO public
USING (prize_id IS NOT NULL);
