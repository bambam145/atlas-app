// Envía recordatorios push de atlas. La llama pg_cron cada 5 minutos con el header x-cron-secret.
// - A la hora de cada hábito (si aún no está hecho hoy).
// - Resumen de la noche con lo que falta.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const WINDOW_MIN = 5;
const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// Fecha/hora local del usuario según su zona horaria
function localNow(tz: string): { day: string; min: number; wd: number } {
  let parts: Record<string, string> = {};
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  } catch { return localNow('America/Lima'); }
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { day: `${parts.year}-${parts.month}-${parts.day}`, min: Number(parts.hour) * 60 + Number(parts.minute), wd };
}

type Habit = { id: string; emoji?: string; name: string; days?: number[]; time?: string; createdAt?: string; target?: number; unit?: string; freq?: string; remind?: boolean };

const target = (h: Habit) => Math.max(1, Number(h.target) || 1);
// Ya registrado: hecho, a medias ('meh') o "no lo hice" ('none') no necesitan recordatorio.
function isDone(h: Habit, v: unknown) {
  if (v === 'done' || v === 'meh' || v === 'none') return true;
  return typeof v === 'number' && v >= target(h);
}
const scheduledToday = (h: Habit, day: string, wd: number) =>
  h.freq !== 'weekly' && (h.days || []).includes(wd) && (!h.createdAt || h.createdAt <= day);

function progressText(h: Habit, v: unknown) {
  if (target(h) > 1) return `Llevas ${typeof v === 'number' ? v : 0} de ${target(h)}${h.unit ? ' ' + h.unit : ''}.`;
  return 'Márcalo cuando lo hagas y suma a tu racha.';
}

Deno.serve(async (req) => {
  const { data: secrets, error: e1 } = await sb.rpc('push_secrets');
  if (e1 || !secrets) return new Response('config', { status: 500 });
  if (req.headers.get('x-cron-secret') !== secrets.cron_secret) return new Response('forbidden', { status: 403 });

  webpush.setVapidDetails(secrets.vapid_subject, secrets.vapid_public, secrets.vapid_private);

  const { data: targets, error: e2 } = await sb.rpc('push_targets');
  if (e2) return new Response(e2.message, { status: 500 });

  let sent = 0, removed = 0;
  for (const t of targets || []) {
    const data = t.data || {};
    const prefs = { habits: true, summary: true, summaryTime: '21:00', ...(data.reminders || {}) };
    const subs = t.subs as { endpoint: string; p256dh: string; auth: string; tz: string }[];
    const tz = subs[0]?.tz || 'America/Lima';
    const now = localNow(tz);
    const log = (data.log || {})[now.day] || {};
    const habits: Habit[] = (data.habits || []).filter((h: Habit) => scheduledToday(h, now.day, now.wd));
    const inWindow = (time?: string) => !!time && /^\d{2}:\d{2}$/.test(time) && now.min >= toMin(time) && now.min < toMin(time) + WINDOW_MIN;

    const msgs: { key: string; title: string; body: string; tag: string }[] = [];

    if (prefs.habits) {
      for (const h of habits) {
        if (h.remind === false || !inWindow(h.time) || isDone(h, log[h.id]) || log[h.id] === 'skip') continue;
        msgs.push({ key: `h:${h.id}`, title: `${h.emoji || '⏰'} ${h.name}`, body: progressText(h, log[h.id]), tag: `atlas-${h.id}` });
      }
    }

    if (prefs.summary && inWindow(prefs.summaryTime)) {
      const pending = habits.filter((h) => !isDone(h, log[h.id]) && log[h.id] !== 'skip');
      if (pending.length) {
        const names = pending.slice(0, 3).map((h) => `${h.emoji || ''} ${h.name}`.trim()).join(', ');
        msgs.push({
          key: 'summary',
          title: pending.length === 1 ? 'Te falta 1 hábito hoy' : `Te faltan ${pending.length} hábitos hoy`,
          body: `${names}${pending.length > 3 ? '…' : ''}. Aún estás a tiempo 💪`,
          tag: 'atlas-summary',
        });
      }
    }

    for (const m of msgs) {
      const { data: first } = await sb.rpc('push_mark_sent', { p_user: t.user_id, p_key: m.key, p_day: now.day });
      if (!first) continue;
      const payload = JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: './' });
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
            removed++;
          }
        }
      }
    }
  }
  return Response.json({ ok: true, users: (targets || []).length, sent, removed });
});
