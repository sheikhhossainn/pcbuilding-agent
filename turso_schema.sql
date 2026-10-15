-- Turso LibSQL Schema for BuildMyPC

CREATE TABLE IF NOT EXISTS components (
    id TEXT PRIMARY KEY,
    site TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT,
    url TEXT UNIQUE NOT NULL,
    in_stock INTEGER DEFAULT 1,
    specs TEXT DEFAULT '{}',
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS components_query_idx 
ON components(site, category, in_stock, price);

CREATE INDEX IF NOT EXISTS components_active_idx 
ON components(site, category, price)
WHERE in_stock = 1;

CREATE INDEX IF NOT EXISTS components_last_updated_idx 
ON components(last_updated);
