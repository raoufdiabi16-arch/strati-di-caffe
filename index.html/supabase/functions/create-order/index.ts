// supabase functions deploy create-order --no-verify-jwt
// Public endpoint on purpose (customers are anonymous): it is protected by Turnstile, an origin
// allow-list, strict validation and server-side rate limits instead of a login.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleCreateOrder } from './handler.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve((req) =>
  handleCreateOrder(req, {
    env: (k) => Deno.env.get(k) ?? '',
    rpc: (fn, args) => sb.rpc(fn, args) as any,
    fetch,
  }),
);
