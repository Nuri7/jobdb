import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AdminAuthResult =
  | { ok: true; kind: 'service' | 'admin'; userId?: string }
  | { ok: false; response: Response };

export async function requireAdminOrService(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<AdminAuthResult> {
  const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (token && serviceRoleKey && token === serviceRoleKey) {
    return { ok: true, kind: 'service' };
  }

  // Hosted functions may expose the rotated `sb_secret_…` key while callers still use the
  // legacy, gateway-verified service-role JWT. These functions all have verify_jwt=true, so the
  // signed role claim is safe to use after the gateway has accepted the request.
  if (token?.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload?.role === 'service_role') return { ok: true, kind: 'service' };
    } catch {
      // Fall through to normal user validation.
    }
  }

  if (!token) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey,
  );
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  const { data: isAdmin } = await supabase.rpc('has_role', {
    _user_id: data.user.id,
    _role: 'admin',
  });
  if (isAdmin !== true) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  return { ok: true, kind: 'admin', userId: data.user.id };
}

export function isSafePublicUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === 'metadata.google.internal' || host === '169.254.169.254') return false;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((part) => part > 255)) return false;
    const [a, b] = octets;
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) return false;
  }

  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
  return true;
}
