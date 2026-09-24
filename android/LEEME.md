# atlas para Android (APK)

App de Android que abre https://bambam145.github.io/atlas-app/ a pantalla completa (Trusted Web Activity).
Los cambios de la web se ven al instante en la app: solo hay que recompilar si cambian el ícono, el nombre o la versión.

Compilar (Windows, con Android Studio instalado):

1. `set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`
2. `gradlew.bat assembleRelease`
3. Firmar `app/build/outputs/apk/release/app-release-unsigned.apk` con la llave de `admin/android/` (zipalign + apksigner).
4. Subir el resultado como `descargas/atlas.apk`. Antes, sube `appVersionCode` en `app/build.gradle`.

La llave de firma y su contraseña están en `admin/android/` (no se suben a GitHub). Sin esa llave no se puede actualizar la app.
