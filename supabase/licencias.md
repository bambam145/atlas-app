# Licencias de atlas (referencia)

Aplicado en Supabase (proyecto `atlas`) con migraciones:
`licenses_trials_codes`, `admin_functions`, `private_license_check`.

- **licenses**: una fila por usuario → `trial` (7 días al registrarse), `active` (plan lifetime/monthly/yearly), `suspended`.
- **license_grants**: correos activados antes de registrarse (se aplican al crear la cuenta).
- **activation_codes**: códigos `ATLAS-XXXX-XXXX` de un solo uso.
- **private.license_ok(uid)**: la base de datos solo deja GUARDAR datos si la licencia está vigente (leer/descargar siempre).
- **redeem_code(code)**: la app canjea un código (usuario con sesión).
- **admin_*()**: solo con la clave secreta (panel `admin/atlas-admin.ps1`, fuera de GitHub).
