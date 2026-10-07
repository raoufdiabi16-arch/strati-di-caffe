// supabase functions deploy payment-webhook --no-verify-jwt     (Chargily cannot send a Supabase JWT)
// Then in the Chargily dashboard you do not need to set anything: create-order passes this URL per checkout.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleWebhook } from './handler.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve((req) =>
  handleWebhook(req, {
    env: (k) => Deno.env.get(k) ?? '',
    rpc: (fn, args) => sb.rpc(fn, args) as any,
    fetch,
  }),
);
