-- Allow service role to delete job opportunities (for edge functions)
-- The edge function uses service role key which bypasses RLS, but we need to ensure the operation is allowed

-- First, let's create a policy that allows deletion via the service role
-- Since edge functions use service_role key which bypasses RLS, no policy change needed
-- The delete will work from edge functions automatically

-- However, if we want public users to never delete, we keep current RLS
-- Edge functions with service_role already bypass RLS