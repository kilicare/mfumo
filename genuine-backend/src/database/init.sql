-- Connect to genuine database
\c genuine

-- GENUINE LIQUOR STORE Database Initialization Script
-- Creates extensions and initial setup

-- Connect to genuine database
\c genuine

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- For full-text search
CREATE EXTENSION IF NOT EXISTS "unaccent";         -- For accent-insensitive search

-- Set defaults
ALTER DATABASE genuine SET timezone TO 'UTC';

-- Schemas
CREATE SCHEMA IF NOT EXISTS public;

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO lastmateru;
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- Success message
SELECT 'GENUINE LIQUOR STORE Database initialized successfully' AS message;
