-- Enable the uuid-ossp extension to generate UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Index for faster queries
CREATE INDEX IF NOT EXISTS components_category_idx ON components(category);
CREATE INDEX IF NOT EXISTS components_price_idx ON components(price);
CREATE INDEX IF NOT EXISTS components_in_stock_idx ON components(in_stock);

-- Enable Row Level Security
ALTER TABLE components ENABLE ROW LEVEL SECURITY;

-- Allow public read access (so your backend can query it safely)
CREATE POLICY "Allow public read access" 
ON components FOR SELECT 
USING (true);

-- (Note: No insert/update policies are needed because the scraper uses the SUPABASE_SERVICE_ROLE_KEY, which automatically bypasses RLS).
