// Instalar atlas como app: en PC (Chrome/Edge) con el aviso nativo del navegador,
// en Android con el APK, y en iPhone con "Agregar a inicio".
export const APK_URL = 'descargas/atlas.apk';

let deferred = null; // evento beforeinstallprompt guardado para usarlo con un botón propio

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  || document.referrer.startsWith('android-app://');

// 'installed' | 'android' | 'ios' | 'desktop'
export function installPlatform() {
  if (isStandalone()) return 'installed';
  if (isIOS()) return 'ios';
  if (isAndroid()) return 'android';
  return 'desktop';
}
export const canPromptInstall = () => Boolean(deferred);

export function initInstall(onChange) {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; onChange(); });
  window.addEventListener('appinstalled', () => { deferred = null; onChange(true); });
}

export async function promptInstall() {
  if (!deferred) return null;
  const e = deferred;
  deferred = null;
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}
