// Configuración de la nube (Supabase).
// Pega aquí los datos de tu proyecto: Supabase → Project Settings → API.
// Si quedan vacíos, atlas funciona 100% local (sin cuenta).
// La "anon key" es pública por diseño: la seguridad la dan las reglas (RLS) de supabase/schema.sql.

export const SUPABASE_URL = 'https://wdpcxfiukqtryebtlpwv.supabase.co';
// Venta: enlace de pago (Hotmart, Mercado Pago, WhatsApp…) y correo de soporte. Vacíos = se ocultan.
export const BUY_URL = '';
export const SUPPORT_EMAIL = 'atlasapp.soporte@gmail.com';
// true cuando los correos de Supabase traigan el código de 6 dígitos ({{ .Token }}),
// es decir, después de conectar un SMTP propio y pegar las plantillas de supabase/emails/.
export const EMAIL_CODES = true;

// Pixel de Meta para medir tus anuncios (vacío = desactivado) y precios para el evento de compra.
export const PIXEL_ID = '';
export const CURRENCY = 'USD';
export const PRICES = { lifetime: 0, monthly: 0, yearly: 0 };

// Recordatorios push: llave pública VAPID (la privada vive solo en el servidor).
export const VAPID_PUBLIC_KEY = 'BEO5_2-55h_giDsyTA_cLZzIPHo3Tk-vNK7osPXaJJldRn6kVmdTxgCZFn9Js4apv8Z96s_BYU14CP9hpcx9jOY';

export const SUPABASE_ANON_KEY ='sb_publishable_pglDEItfk4C6Lvt63tA_kw_ynsCZKQG';
