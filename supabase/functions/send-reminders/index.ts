// Envía recordatorios push de atlas. La llama pg_cron cada 5 minutos con el header x-cron-secret.
// - A la hora de cada hábito (si aún no está hecho hoy).
// - Resumen de la noche con lo que falta.
// - Domingo 7 pm: resumen de la semana.
// Los avisos de hábitos traen botones ("Sano", "+1 vaso"…) que registran sin abrir la app (función quick-log).
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

type Habit = {
  id: string; emoji?: string; name: string; days?: number[]; time?: string; createdAt?: string; target?: number; unit?: string;
  freq?: string; remind?: boolean; kind?: string; labels?: string[]; sleepGoal?: number;
};
type Action = { action: string; title: string };

const QUICK_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/quick-log`;
const CHOICE_DEFAULT = ['Bien', 'A medias', 'No lo hice'];
const kindOf = (h: Habit) => h.kind || (target(h) > 1 ? 'counter' : 'check');

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
}
// Token para que el botón del aviso registre solo ese hábito, ese día, con esos valores (vale 36 h).
async function quickToken(u: string, h: string, d: string, tz: string, v: string[], secret: string) {
  const body = b64url(new TextEncoder().encode(JSON.stringify({ u, h, d, tz, v, exp: Date.now() + 36 * 3600e3 })));
  return `${body}.${await sign(body, secret)}`;
}

// Botones según el tipo de hábito (Android muestra hasta 2).
function actionsFor(h: Habit): { actions: Action[]; values: string[] } {
  const kind = kindOf(h);
  if (kind === 'choice') {
    const l = CHOICE_DEFAULT.map((x, i) => (h.labels && h.labels[i]) || x);
    return { actions: [{ action: 'done', title: l[0] }, { action: 'meh', title: l[1] }], values: ['done', 'meh', 'none'] };
  }
  if (kind === 'counter') {
    const unit = !h.unit || /^veces$/i.test(h.unit) ? 'vez' : h.unit.replace(/s$/, '');
    return { actions: [{ action: 'inc', title: `+1 ${unit}` }], values: ['inc'] };
  }
  if (kind === 'check') return { actions: [{ action: 'done', title: '✓ Hecho' }], values: ['done'] };
  return { actions: [], values: [] };
}

const target = (h: Habit) => Math.max(1, Number(h.target) || 1);
// Ya registrado: hecho, a medias ('meh') o "no lo hice" ('none') no necesitan recordatorio.
function isDone(h: Habit, v: unknown) {
  if (v === 'done' || v === 'meh' || v === 'none') return true;
  return typeof v === 'number' && v >= target(h);
}
const scheduledToday = (h: Habit, day: string, wd: number) =>
  h.freq !== 'weekly' && kindOf(h) !== 'quit' && (h.days || []).includes(wd) && (!h.createdAt || h.createdAt <= day);
// Vacaciones / enfermo: esos días no hay avisos ni cuentan en el resumen.
// deno-lint-ignore no-explicit-any
const paused = (data: any, day: string) => (data.pauses || []).some((p: { from: string; to?: string | null }) => day >= p.from && (!p.to || day <= p.to));

function progressText(h: Habit, v: unknown) {
  const kind = kindOf(h);
  if (kind === 'counter') return `Llevas ${typeof v === 'number' ? v : 0} de ${target(h)}${h.unit ? ' ' + h.unit : ''}.`;
  if (kind === 'choice') return '¿Cómo te fue? Responde aquí mismo.';
  if (kind === 'sleep') return 'Toca para registrar a qué hora te acostaste y despertaste.';
  return 'Márcalo cuando lo hagas y suma a tu racha.';
}

/* ---------- Resumen del domingo ---------- */

const addDay = (day: string, n: number) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const liters = (n: number) => `${(n * 0.25).toFixed(1).replace('.', ',').replace(',0', '')} L`;
const sleepMin = (r?: { bed?: string; wake?: string }) => {
  if (!r?.bed || !r?.wake) return null;
  let m = toMin(r.wake) - toMin(r.bed);
  if (m <= 0) m += 1440;
  return m;
};

// deno-lint-ignore no-explicit-any
function weekSummary(data: any, today: string): { title: string; body: string } | null {
  const days = Array.from({ length: 7 }, (_, i) => addDay(today, i - 6)); // lunes..domingo
  // deno-lint-ignore no-explicit-any
  const habits: Habit[] = (data.habits || []).filter((h: Habit) => h.freq !== 'weekly');
  if (!habits.length) return null;
  const good = (h: Habit, v: unknown) => (kindOf(h) === 'quit' ? v !== 'none' : v === 'done' || (typeof v === 'number' && v >= target(h)));
  let done = 0, total = 0;
  const bits: string[] = [];
  for (const h of habits) {
    let n = 0, t = 0, sum = 0;
    const mins: number[] = [];
    for (const day of days) {
      const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (!(h.days || []).includes(wd) || (h.createdAt && h.createdAt > day) || paused(data, day)) continue;
      const v = (data.log || {})[day]?.[h.id];
      if (v === 'skip') continue;
      t++; total++;
      if (good(h, v)) { n++; done++; }
      if (typeof v === 'number') sum += v;
      const m = sleepMin((data.sleep || {})[day]);
      if (m !== null) mins.push(m);
    }
    if (!t) continue;
    const kind = kindOf(h);
    const e = h.emoji || '•';
    if (kind === 'quit') bits.push(`${e} ${n}/${t} días limpio`);
    else if (kind === 'choice') bits.push(`${e} ${n}/${t} ${((h.labels && h.labels[0]) || 'bien').toLowerCase()}`);
    else if (kind === 'sleep' && mins.length) { const a = Math.round(mins.reduce((x, y) => x + y, 0) / mins.length); bits.push(`${e} ${Math.floor(a / 60)} h ${String(a % 60).padStart(2, '0')} min`); }
    else if (kind === 'counter' && /vaso/i.test(h.unit || '')) bits.push(`${e} ${liters(sum / t)} al día`);
  }
  if (!total) return null;
  const pct = Math.round((done / total) * 100);
  return {
    title: `Tu semana: ${pct}% de constancia ${pct >= 80 ? '🔥' : pct >= 50 ? '💪' : '🌱'}`,
    body: `${bits.slice(0, 4).join(' · ')}${bits.length ? '. ' : ''}Toca para ver tu resumen.`,
  };
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
    const prefs = { habits: true, summary: true, summaryTime: '21:00', weekly: true, ...(data.reminders || {}) };
    const subs = t.subs as { endpoint: string; p256dh: string; auth: string; tz: string }[];
    const tz = subs[0]?.tz || 'America/Lima';
    const now = localNow(tz);
    const log = (data.log || {})[now.day] || {};
    const habits: Habit[] = paused(data, now.day) ? [] : (data.habits || []).filter((h: Habit) => scheduledToday(h, now.day, now.wd));
    const inWindow = (time?: string) => !!time && /^\d{2}:\d{2}$/.test(time) && now.min >= toMin(time) && now.min < toMin(time) + WINDOW_MIN;

    const msgs: { key: string; title: string; body: string; tag: string; url?: string; actions?: Action[]; act?: { url: string; token: string } }[] = [];

    if (prefs.habits) {
      for (const h of habits) {
        if (h.remind === false || !inWindow(h.time) || isDone(h, log[h.id]) || log[h.id] === 'skip') continue;
        const { actions, values } = actionsFor(h);
        const act = actions.length ? { url: QUICK_URL, token: await quickToken(t.user_id, h.id, now.day, tz, values, secrets.cron_secret) } : undefined;
        msgs.push({ key: `h:${h.id}`, title: `${h.emoji || '⏰'} ${h.name}`, body: progressText(h, log[h.id]), tag: `atlas-${h.id}`, actions, act });
      }
    }

    if (prefs.weekly && now.wd === 0 && inWindow('19:00')) {
      const w = weekSummary(data, now.day);
      if (w) msgs.push({ key: 'weekly', ...w, tag: 'atlas-weekly', url: './?v=stats' });
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
      const payload = JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url || './', actions: m.actions, act: m.act });
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
