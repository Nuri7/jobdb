-- Create API keys table
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Public read access for validation
CREATE POLICY "API keys are readable for validation"
  ON public.api_keys
  FOR SELECT
  USING (true);

-- Public insert for key generation
CREATE POLICY "Anyone can create API keys"
  ON public.api_keys
  FOR INSERT
  WITH CHECK (true);

-- Public update for last_used_at tracking
CREATE POLICY "Anyone can update API keys"
  ON public.api_keys
  FOR UPDATE
  USING (true);

-- Index for fast key lookup
CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_prefix ON public.api_keys(key_prefix);