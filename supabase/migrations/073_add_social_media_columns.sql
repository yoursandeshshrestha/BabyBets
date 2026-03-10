-- Add separate columns for Instagram, TikTok, and Facebook URLs
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS facebook_url TEXT;

-- Add comments for clarity
COMMENT ON COLUMN influencers.instagram_url IS 'Instagram profile URL';
COMMENT ON COLUMN influencers.tiktok_url IS 'TikTok profile URL';
COMMENT ON COLUMN influencers.facebook_url IS 'Facebook profile URL';
COMMENT ON COLUMN influencers.social_profile_url IS 'Primary social media profile URL (deprecated - use platform-specific columns)';

-- Create indexes for the new columns (useful for searching)
CREATE INDEX IF NOT EXISTS idx_influencers_instagram_url ON influencers(instagram_url) WHERE instagram_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_influencers_tiktok_url ON influencers(tiktok_url) WHERE tiktok_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_influencers_facebook_url ON influencers(facebook_url) WHERE facebook_url IS NOT NULL;
