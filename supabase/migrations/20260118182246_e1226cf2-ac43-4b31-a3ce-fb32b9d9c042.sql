-- Create PWA analytics table for tracking app usage and installations
CREATE TABLE public.pwa_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  is_pwa BOOLEAN NOT NULL DEFAULT false,
  event_type TEXT NOT NULL, -- 'session_start', 'install_prompt_shown', 'installed'
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pwa_analytics ENABLE ROW LEVEL SECURITY;

-- Allow anonymous tracking (public insert)
CREATE POLICY "Allow public insert on pwa_analytics" 
ON public.pwa_analytics 
FOR INSERT 
WITH CHECK (true);

-- Allow reading for analytics dashboard
CREATE POLICY "Allow public read on pwa_analytics" 
ON public.pwa_analytics 
FOR SELECT 
USING (true);

-- Add index for faster queries
CREATE INDEX idx_pwa_analytics_created_at ON public.pwa_analytics(created_at DESC);
CREATE INDEX idx_pwa_analytics_event_type ON public.pwa_analytics(event_type);