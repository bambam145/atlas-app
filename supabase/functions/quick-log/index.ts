// Registra un hábito desde el botón de una notificación ("Sano", "+1 vaso"…) sin abrir atlas.
// El aviso trae un token firmado por send-reminders (usuario, hábito, día, zona horaria, vencimiento).
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
}

// Hora local del usuario (HH:MM) en el momento de tocar el botón.
function localTime(tz: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  } catch { return localTime('America/Lima'); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return reply({ ok: false }, 405);

  let input: { token?: string; value?: string } = {};
  try { input = JSON.parse(await req.text()); } catch { return reply({ ok: false }, 400); }
  const [body, sig] = String(input.token || '').split('.');
  if (!body || !sig) return reply({ ok: false }, 400);

  const { data: secrets } = await sb.rpc('push_secrets');
  if (!secrets || sig !== (await sign(body, secrets.cron_secret))) return reply({ ok: false }, 403);

  let t: { u: string; h: string; d: string; tz: string; exp: number; v: string[] };
  try { t = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return reply({ ok: false }, 400); }
  if (Date.now() > t.exp || !t.v.includes(String(input.value))) return reply({ ok: false }, 403);

  const { data: ok, error } = await sb.rpc('push_quick_log', { p_user: t.u, p_day: t.d, p_habit: t.h, p_value: input.value, p_time: localTime(t.tz) });
  if (error) return reply({ ok: false }, 500);
  return reply({ ok: !!ok });
});
