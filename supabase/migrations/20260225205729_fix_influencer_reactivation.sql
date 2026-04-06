-- Fix influencer reactivation by allowing is_active changes for existing users
-- This allows admins to reactivate previously deactivated influencers

CREATE OR REPLACE FUNCTION public.protect_influencer_critical_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow all updates if user is admin
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Allow influencer approval (when user_id changes from null to a value and is_active becomes true)
  -- This is specifically for the approve_influencer_application SECURITY DEFINER function
  IF OLD.user_id IS NULL
     AND NEW.user_id IS NOT NULL
     AND NEW.is_active = true
     AND OLD.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Allow influencer reactivation (when user_id stays the same and is_active changes to true)
  -- This allows reactivating previously deactivated influencers via approve_influencer_application
  IF OLD.user_id IS NOT NULL
     AND NEW.user_id = OLD.user_id
     AND NEW.is_active = true
     AND OLD.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Allow system-managed updates when called from triggers on orders table
  -- This allows create_influencer_sale() to update commission_tier and stats
  -- We detect this by checking if the update includes system-managed fields
  -- that would only be updated by our SECURITY DEFINER functions

  -- Case 1: All stats fields being updated together with commission_tier changing
  -- (from recalculate_monthly_commissions when tier changes)
  IF (
    NEW.total_sales_pence IS DISTINCT FROM OLD.total_sales_pence OR
    NEW.total_commission_pence IS DISTINCT FROM OLD.total_commission_pence OR
    NEW.monthly_sales_pence IS DISTINCT FROM OLD.monthly_sales_pence
  ) AND NEW.commission_tier IS DISTINCT FROM OLD.commission_tier THEN
    RETURN NEW;
  END IF;

  -- Case 2: Only total_sales_pence being updated
  -- (from create_influencer_sale before recalculate_monthly_commissions is called)
  IF NEW.total_sales_pence IS DISTINCT FROM OLD.total_sales_pence
     AND NEW.total_commission_pence = OLD.total_commission_pence
     AND NEW.monthly_sales_pence = OLD.monthly_sales_pence
     AND NEW.commission_tier = OLD.commission_tier THEN
    RETURN NEW;
  END IF;

  -- Case 3: monthly_sales_pence and/or total_commission_pence being updated
  -- (from recalculate_monthly_commissions when tier doesn't change)
  IF (NEW.monthly_sales_pence IS DISTINCT FROM OLD.monthly_sales_pence OR
      NEW.total_commission_pence IS DISTINCT FROM OLD.total_commission_pence)
     AND NEW.total_sales_pence = OLD.total_sales_pence THEN
    RETURN NEW;
  END IF;

  -- For all other updates by non-admin users, enforce field protection
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Cannot modify is_active field';
  END IF;

  IF NEW.commission_tier IS DISTINCT FROM OLD.commission_tier THEN
    RAISE EXCEPTION 'Cannot modify commission_tier field';
  END IF;

  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Cannot modify slug field';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot modify user_id field';
  END IF;

  IF NEW.total_sales_pence IS DISTINCT FROM OLD.total_sales_pence THEN
    RAISE EXCEPTION 'Cannot modify total_sales_pence field';
  END IF;

  IF NEW.total_commission_pence IS DISTINCT FROM OLD.total_commission_pence THEN
    RAISE EXCEPTION 'Cannot modify total_commission_pence field';
  END IF;

  IF NEW.monthly_sales_pence IS DISTINCT FROM OLD.monthly_sales_pence THEN
    RAISE EXCEPTION 'Cannot modify monthly_sales_pence field';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
