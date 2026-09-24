// Correos de atlas: bienvenida, prueba por terminar, prueba terminada, activación, vencimiento, despedida,
// suspensión, premio por invitar y novedades. La llama pg_cron cada 10 minutos con el header x-cron-secret.
// Envía por Gmail (SMTP 465). La contraseña de aplicación va en el secreto GMAIL_APP_PASSWORD de Edge Functions.
// GET ?unsub=correo&t=firma → da de baja de las novedades.
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const APP = 'https://bambam145.github.io/atlas-app/';
const FROM_EMAIL = 'atlasapp.soporte@gmail.com';
const FN_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-emails`;
const PLAN: Record<string, string> = { lifetime: 'De por vida', monthly: 'Mensual', yearly: 'Anual' };
const PRICES = [['Anual', '$24.99 al año'], ['De por vida', '$29.99 pago único (lanzamiento)'], ['Mensual', '$3.99 al mes']];

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
const fecha = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' }).format(new Date(iso)) : '');

async function sign(email: string, key: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(email.toLowerCase()));
  return Array.from(new Uint8Array(sig).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- Diseño (mismo estilo que los correos de acceso) ---------- */
const P = (t: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#525252;">${t}</p>`;
const btn = (label: string, url = APP) => `<a href="${esc(url)}" style="display:block;margin:8px 0 0;padding:15px 20px;background:#0A0A0A;color:#FFFFFF;text-decoration:none;text-align:center;font-size:15px;font-weight:600;border-radius:999px;">${esc(label)}</a>`;
const note = (t: string) => `<p style="margin:22px 0 0;font-size:12.5px;line-height:1.6;color:#7C7C7C;">${t}</p>`;
const box = (rows: string) => `<div style="margin:4px 0 20px;padding:6px 18px;background:#F4F4F4;border-radius:14px;">${rows}</div>`;
const row = (a: string, b: string, last = false) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${last ? '' : 'border-bottom:1px solid #E6E6E6;'}"><tr><td style="padding:12px 0;font-size:14px;color:#0A0A0A;font-weight:600;">${a}</td><td style="padding:12px 0;font-size:14px;color:#525252;text-align:right;">${b}</td></tr></table>`;
const step = (n: number, t: string, d: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;"><tr><td style="vertical-align:top;"><div style="width:26px;height:26px;border-radius:50%;background:#0A0A0A;color:#fff;font-size:13px;font-weight:700;line-height:26px;text-align:center;">${n}</div></td><td style="vertical-align:top;padding-left:12px;"><div style="font-size:15px;font-weight:600;color:#0A0A0A;">${t}</div><div style="font-size:13.5px;line-height:1.5;color:#6B6B6B;">${d}</div></td></tr></table>`;
const prices = () => box(PRICES.map(([a, b], i) => row(a, b, i === PRICES.length - 1)).join(''));

export function layout(title: string, inner: string, footerExtra = '') {
  return `<div style="margin:0;padding:32px 16px;background:#F5F5F5;font-family:Manrope,Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6E6;border-radius:20px;padding:36px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;"><tr>
      <td style="vertical-align:middle;"><img src="${APP}icons/icon-192.png" width="36" height="36" alt="atlas" style="display:block;border:0;border-radius:9px;"></td>
      <td style="vertical-align:middle;padding-left:12px;font-size:16px;font-weight:500;letter-spacing:6px;color:#0A0A0A;">&#923;TL&#923;S</td>
    </tr></table>
    <h1 style="margin:0 0 14px;font-size:26px;font-weight:500;letter-spacing:-0.8px;color:#0A0A0A;line-height:1.2;">${title}</h1>
    ${inner}
  </div>
  <p style="max-width:480px;margin:16px auto 0;text-align:center;font-size:12px;color:#9A9A9A;"><span style="letter-spacing:3px;">&#923;TL&#923;S</span> · Tu vida. En orden.${footerExtra}</p>
</div>`;
}

type Row = { user_id: string; email: string; name: string | null; kind: string; ref: string; info: Record<string, any> };
const REPLY = 'Responde este correo y te ayudamos a activarla en minutos.';

export function build(r: Row, unsubUrl: string): { subject: string; html: string } | null {
  const n = r.name ? esc(r.name) : '';
  const i = r.info || {};
  switch (r.kind) {
    case 'welcome':
      return {
        subject: r.name ? `Bienvenido a atlas, ${r.name} 👋` : 'Bienvenido a atlas 👋',
        html: layout(`Bienvenido a atlas${n ? `, ${n}` : ''}`,
          P('Tu prueba gratis de 7 días ya empezó. Con estos 3 pasos le sacas el máximo:')
          + step(1, 'Empieza con 3 hábitos pequeños', 'Mejor pocos y constantes que muchos y abandonados.')
          + step(2, 'Activa los recordatorios', 'En Ajustes → Recordatorios. Te avisamos a la hora de cada hábito.')
          + step(3, 'Instálala en tu celular', 'Ábrela en el navegador y elige “Agregar a pantalla de inicio”.')
          + btn('Abrir atlas')
          + note(`${i.trial_ends_at ? `Tu prueba termina el ${fecha(i.trial_ends_at)}. ` : ''}¿Dudas? Responde este correo, te leemos.`)),
      };
    case 'trial_ending':
      return {
        subject: 'Te quedan 2 días de prueba en atlas',
        html: layout('Te quedan 2 días de prueba',
          P(i.marks > 0
            ? `Vas muy bien${n ? `, ${n}` : ''}: llevas <b>${i.habits} hábitos</b> y <b>${i.marks} marcas completadas</b>. No dejes que se corte tu racha.`
            : `Tu prueba termina el <b>${fecha(i.trial_ends_at)}</b>. Aún estás a tiempo de crear tus primeros hábitos.`)
          + P('Activa atlas y sigue sin interrupciones:') + prices()
          + P(REPLY) + btn('Abrir atlas')),
      };
    case 'trial_ended':
      return {
        subject: 'Tu prueba de atlas terminó',
        html: layout('Tu prueba terminó, pero tu progreso sigue aquí',
          P(`Gracias por probar atlas${n ? `, ${n}` : ''}. ${i.habits > 0 ? `Tus <b>${i.habits} hábitos</b> y todo tu avance están guardados.` : 'Todo lo que creaste está guardado.'} Cuando actives tu cuenta, sigues justo donde lo dejaste.`)
          + prices() + P(REPLY) + btn('Activar mi cuenta')),
      };
    case 'activated': {
      const forever = !i.expires_at || i.plan === 'lifetime';
      return {
        subject: '¡atlas está activado! 🎉',
        html: layout(`¡Gracias${n ? `, ${n}` : ''}! Tu cuenta está activa`,
          P('Ya tienes acceso completo a atlas. Sigue construyendo tu mejor versión, un día a la vez.')
          + box(row('Plan', esc(PLAN[i.plan] || i.plan)) + row('Vigencia', forever ? 'Para siempre' : `Hasta el ${fecha(i.expires_at)}`, true))
          + btn('Abrir atlas') + note('Guarda este correo como comprobante. Si necesitas algo, respóndelo.')),
      };
    }
    case 'expiring':
      return {
        subject: 'Tu plan de atlas vence pronto',
        html: layout('Tu plan vence en 3 días',
          P(`Tu plan <b>${esc(PLAN[i.plan] || i.plan)}</b> vence el <b>${fecha(i.expires_at)}</b>. Renuévalo para no perder el ritmo.`)
          + prices() + P('Responde este correo y te enviamos tu código de renovación.') + btn('Abrir atlas')),
      };
    case 'expired':
      return {
        subject: 'Te vamos a extrañar',
        html: layout('Tu plan terminó. Te vamos a extrañar',
          P(`Tu plan <b>${esc(PLAN[i.plan] || i.plan || '')}</b> de atlas venció${n ? `, ${n}` : ''}. Tus hábitos, tareas y todo tu progreso siguen guardados y seguros.`)
          + P('Cuando quieras volver, responde este correo y renovamos tu cuenta en minutos.') + prices() + btn('Volver a atlas')),
      };
    case 'suspended':
      return {
        subject: 'Tu cuenta de atlas fue suspendida',
        html: layout('Tu cuenta fue suspendida',
          P('Tu acceso a atlas está pausado. Tus datos siguen guardados.')
          + P('Si crees que es un error, responde este correo y lo revisamos contigo.')),
      };
    case 'referral':
      return {
        subject: '¡Ganaste 7 días más en atlas! 🎁',
        html: layout('¡Ganaste 7 días más!',
          P('Alguien se unió a atlas con tu invitación. Sumamos <b>7 días gratis</b> a tu cuenta.')
          + P('Sigue invitando: ganas 7 días por cada amigo, hasta 10.') + btn('Invitar a más amigos')),
      };
    case 'campaign': {
      // Texto libre: cada línea es un párrafo; las que empiezan con "- " son viñetas
      let body = '';
      let list: string[] = [];
      const flush = () => { if (list.length) { body += `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7;color:#525252;">${list.join('')}</ul>`; list = []; } };
      for (const l of String(i.body || '').split('\n').map((x) => x.trim())) {
        if (l.startsWith('- ')) list.push(`<li>${esc(l.slice(2))}</li>`);
        else { flush(); if (l) body += P(esc(l)); }
      }
      flush();
      return {
        subject: String(i.subject),
        html: layout(esc(i.title), body + btn(i.cta_label || 'Abrir atlas', i.cta_url || APP),
          `<br><a href="${esc(unsubUrl)}" style="color:#9A9A9A;">No quiero recibir novedades</a>`),
      };
    }
  }
  return null;
}

const page = (t: string) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>atlas</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;color:#EFEFEF;font-family:Segoe UI,Helvetica,Arial,sans-serif;text-align:center;padding:24px"><div><div style="letter-spacing:8px;font-size:18px;margin-bottom:18px">&#923;TL&#923;S</div><p style="font-size:17px;line-height:1.6;max-width:360px">${t}</p></div></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  const { data: secrets } = await sb.rpc('push_secrets');
  if (!secrets) return new Response('config', { status: 500 });
  const url = new URL(req.url);

  // Darse de baja de las novedades
  if (url.searchParams.has('unsub')) {
    const email = (url.searchParams.get('unsub') || '').toLowerCase();
    if (!email || url.searchParams.get('t') !== (await sign(email, secrets.unsub_key))) return page('El enlace no es válido.');
    await sb.rpc('email_optout_add', { p_email: email });
    return page('Listo. Ya no te enviaremos correos de novedades.<br>Los avisos importantes de tu cuenta seguirán llegando.');
  }

  if (req.headers.get('x-cron-secret') !== secrets.cron_secret) return new Response('forbidden', { status: 403 });
  const pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!pass) return Response.json({ ok: false, error: 'Falta el secreto GMAIL_APP_PASSWORD' }, { status: 503 });

  const { data: rows, error } = await sb.rpc('email_pending', { p_limit: 40 });
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) { await sb.rpc('email_close_campaigns'); return Response.json({ ok: true, sent: 0 }); }

  const mail = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: FROM_EMAIL, pass } });
  let sent = 0;
  const failed: string[] = [];
  for (const r of rows as Row[]) {
    const unsubUrl = `${FN_URL}?unsub=${encodeURIComponent(r.email)}&t=${await sign(r.email, secrets.unsub_key)}`;
    const m = build(r, unsubUrl);
    if (!m) { await sb.rpc('email_mark', { p_user: r.user_id, p_kind: r.kind, p_ref: r.ref }); continue; }
    try {
      await mail.sendMail({
        from: `"atlas" <${FROM_EMAIL}>`, to: r.email, replyTo: FROM_EMAIL, subject: m.subject, html: m.html,
        ...(r.kind === 'campaign' ? { headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
      });
      await sb.rpc('email_mark', { p_user: r.user_id, p_kind: r.kind, p_ref: r.ref });
      sent++;
    } catch (e) {
      failed.push(`${r.kind}: ${(e as Error).message}`.slice(0, 160));
      if (/Invalid login|Username and Password/i.test((e as Error).message)) break; // contraseña mala: no insistir
    }
  }
  await sb.rpc('email_close_campaigns');
  return Response.json({ ok: failed.length === 0, sent, failed });
});
