-- Connect to genuine database
\c genuine

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set default locale
ALTER DATABASE genuine SET timezone TO 'UTC';

-- Create schemas
CREATE SCHEMA IF NOT EXISTS public;

-- Grant privileges
GRANT ALL PRIVILEGES ON SCHEMA public TO lastmateru;
GRANT USAGE ON SCHEMA public TO PUBLIC;
