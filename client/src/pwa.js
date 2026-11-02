let state = { installAvailable: false, updateAvailable: false, reloadReady: false };
let installEvent, registration, started = false, reloadAccepted = false;
const listeners = new Set();
const publish = values => {
  state = { ...state, ...values };
  listeners.forEach(listener => listener());
};
export const subscribePwa = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const pwaSnapshot = () => state;

export function startPwa() {
  if (started || !import.meta.env.PROD) return;
  started = true;
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installEvent = event;
    publish({ installAvailable: true });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = undefined;
    publish({ installAvailable: false });
    window.dispatchEvent(new Event("planora-installed"));
  });
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (reloadAccepted) window.location.reload();
    else if (navigator.serviceWorker.controller)
      publish({ updateAvailable: false, reloadReady: true });
  });
  navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then(result => {
      registration = result;
      // Initial activation does not need a reload; waiting updates do.
      const inspect = () => {
        if (result.waiting && navigator.serviceWorker.controller)
          publish({ updateAvailable: true, reloadReady: false });
      };
      inspect();
      result.addEventListener("updatefound", () => {
        result.installing?.addEventListener("statechange", inspect);
      });
      const check = () => {
        if (navigator.onLine) result.update().catch(() => {});
      };
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      window.setInterval(check, 60 * 60 * 1000);
    })
    .catch(() => {
      // The online application remains usable when service workers are blocked.
    });
}

export async function installPwa() {
  if (!installEvent) return;
  const prompt = installEvent;
  installEvent = undefined;
  publish({ installAvailable: false });
  try {
    await prompt.prompt();
    await prompt.userChoice;
  } catch {}
}

export function applyPwaUpdate() {
  if (!window.confirm("Reload Planora now? Save any open forms first. Unsaved changes in this window will be lost.")) return;
  if (registration?.waiting) {
    reloadAccepted = true;
    registration.waiting.postMessage({ type: "APPLY_UPDATE" });
  } else window.location.reload();
}
