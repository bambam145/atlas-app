# atlas

Hábitos, tareas, metas, planner, diario y estadísticas en un solo sistema. Web instalable (PWA) para celular y computadora.

## Usarla en tu computadora

```bash
python serve.py
```

Luego abre http://localhost:5173

## Activar la nube (cuentas + sincronización)

Sin configurar, atlas funciona 100 % local (los datos quedan en el navegador).
Para tener cuentas con código por correo y sincronizar dispositivos:

1. Crea un proyecto gratis en https://supabase.com (New project).
2. En **SQL Editor → New query**, pega el contenido de `supabase/schema.sql` y pulsa **Run**.
3. En **Authentication → Email Templates → Magic Link**, agrega el código al correo, por ejemplo:
   `<p>Tu código de atlas: <strong>{{ .Token }}</strong></p>`
4. En **Authentication → URL Configuration**, pon en *Site URL* la dirección donde publicaste atlas
   y agrega también `http://localhost:5173` en *Redirect URLs*.
5. En **Project Settings → API**, copia *Project URL* y la clave *anon public* en `js/config.js`.

> El correo gratuito de Supabase permite pocos envíos por hora. Para vender la app,
> conecta un SMTP propio (por ejemplo Resend) en **Authentication → SMTP Settings**.

## Estructura

- `index.html`, `css/styles.css`: interfaz
- `js/main.js`: navegación y acciones
- `js/views/*`: pantallas (Hoy, Tareas, Planner, Hábitos, Metas, Diario, Estadísticas, Mapa, Logros)
- `js/cloud.js`, `js/config.js`: nube (Supabase)
- `sw.js`, `manifest.webmanifest`: instalación y uso sin internet
