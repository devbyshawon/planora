import { useEffect, useState, useSyncExternalStore } from "react";
import { applyPwaUpdate, installPwa, pwaSnapshot, subscribePwa } from "../pwa.js";
import { backupIntegrated, acceptServerVersion, syncIntegrated } from "../offline/integrated.js";

export default function PwaControls() {
  const pwa = useSyncExternalStore(subscribePwa, pwaSnapshot);
  const [online, setOnline] = useState(navigator.onLine);
  const [help, setHelp] = useState(false);
  const [sync, setSync] = useState(null);
  useEffect(() => {
    const update = event => setSync(event.detail);
    window.addEventListener("planora-sync", update);
    return () => window.removeEventListener("planora-sync", update);
  }, []);
  const [installed, setInstalled] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
  );
  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    const media = window.matchMedia("(display-mode: standalone)");
    const display = () => setInstalled(media.matches || navigator.standalone === true);
    const installedNow = () => { setInstalled(true); setHelp(false); };
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    window.addEventListener("planora-installed", installedNow);
    media.addEventListener("change", display);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("planora-installed", installedNow);
      media.removeEventListener("change", display);
    };
  }, []);
  if (!import.meta.env.PROD) return null;
  return (
    <aside className="pwa-controls" aria-label="Planora app">
      {!online && <p className="pwa-notice" role="status">You’re offline. Changes are saved on this device and will sync when connected.</p>}
      {sync && (sync.error || sync.pending > 0) && <div className="pwa-notice" role="status"><p>{sync.message}</p><button className="text-button" onClick={()=>backupIntegrated().catch(e=>setSync({error:true,message:e.message}))}>Download device backup</button>{online && <button className="text-button" onClick={()=>syncIntegrated().catch(()=>{})}>Retry sync</button>}{online && sync.error && <button className="text-button" onClick={()=>acceptServerVersion().catch(e=>setSync({error:true,message:e.message}))}>Use online version</button>}</div>}
      {(pwa.updateAvailable || pwa.reloadReady) && (
        <div className="pwa-notice" role="status">
          <span>A new version is ready. Save any open forms before reloading.</span>
          <button className="button" onClick={applyPwaUpdate}>Reload to update</button>
        </div>
      )}
      {!installed && (
        <div className="pwa-install">
          <button className="button" aria-expanded={pwa.installAvailable ? undefined : help}
            onClick={() => pwa.installAvailable ? installPwa() : setHelp(value => !value)}>
            Install Planora
          </button>
          {help && (
            <div className="pwa-install-help">
              <b>Keep Planora close</b>
              <p>In Chrome, use the browser menu’s Install app or Add to Home screen option. On iPhone/iPad, open in Safari, tap Share, then Add to Home Screen.</p>
              <p>Your saved planner stays in this browser for offline use. Installation doesn’t enable closed-app reminders.</p>
              <button className="text-button" onClick={() => setHelp(false)}>Close instructions</button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
