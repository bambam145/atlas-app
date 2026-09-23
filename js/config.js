// Configuración de la nube (Supabase).
// Pega aquí los datos de tu proyecto: Supabase → Project Settings → API.
// Si quedan vacíos, atlas funciona 100% local (sin cuenta).
// La "anon key" es pública por diseño: la seguridad la dan las reglas (RLS) de supabase/schema.sql.

export const SUPABASE_URL = 'https://wdpcxfiukqtryebtlpwv.supabase.co';
// Venta: enlace de pago (Hotmart, Mercado Pago, WhatsApp…) y correo de soporte. Vacíos = se ocultan.
export const BUY_URL = '';
export const SUPPORT_EMAIL = '';
// true cuando los correos de Supabase traigan el código de 6 dígitos ({{ .Token }}),
// es decir, después de conectar un SMTP propio y pegar las plantillas de supabase/emails/.
export const EMAIL_CODES = false;

export const SUPABASE_ANON_KEY ='sb_publishable_pglDEItfk4C6Lvt63tA_kw_ynsCZKQG';
