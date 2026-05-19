-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create components table
CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT,
    url TEXT UNIQUE NOT NULL,
    in_stock BOOLEAN DEFAULT true,
    specs JSONB DEFAULT '{}'::jsonb,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Primary query index (most important)
CREATE INDEX IF NOT EXISTS components_query_idx 
ON components(site, category, in_stock, price);

-- Partial index for in-stock only queries
CREATE INDEX IF NOT EXISTS components_active_idx 
ON components(site, category, price)
WHERE in_stock = true;

-- JSONB spec filtering (future-proofing)
CREATE INDEX IF NOT EXISTS components_specs_gin_idx 
ON components USING GIN(specs);

-- Scraper maintenance queries
CREATE INDEX IF NOT EXISTS components_last_updated_idx 
ON components(last_updated);

-- Enable Row Level Security
ALTER TABLE components ENABLE ROW LEVEL SECURITY;

-- Allow public read access (so your backend can query it safely)
CREATE POLICY "Allow public read access" 
ON components FOR SELECT 
USING (true);

-- (Note: No insert/update policies are needed because the scraper uses the SUPABASE_SERVICE_ROLE_KEY, which automatically bypasses RLS).

-- NOTE: The previous 72-hour TTL cron job has been removed.
-- Components are now persistent until explicitly updated by the scraper.