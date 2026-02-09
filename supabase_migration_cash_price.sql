-- Migration: Add cash_price column to rewards_catalog
-- Run this in the Supabase SQL editor
-- This allows store items to have both an XP cost and an optional cash price

ALTER TABLE rewards_catalog
ADD COLUMN IF NOT EXISTS cash_price NUMERIC(8,2) DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN rewards_catalog.cash_price IS 'Optional cash price for items that can be purchased with money instead of XP. NULL means XP-only.';
