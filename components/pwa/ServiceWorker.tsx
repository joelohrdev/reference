"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the service worker in production, offers the browser's install
 * prompt where one exists, and tells the user when a new version is waiting.
 */
export function ServiceWorker() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | undefined;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            if (next.state === "installed" && navigator.serviceWorker.controller) setWaiting(next);
          });
        });
      })
      .catch(() => {});

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onVisible = () => {
      if (document.visibilityState === "visible") registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!installPrompt && !waiting) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#242424] px-4 py-2 text-[13px] text-white shadow-lg ring-1 ring-white/15">
        {waiting ? (
          <>
            <span>A new version is ready.</span>
            <button
              type="button"
              onClick={() => waiting.postMessage("skip-waiting")}
              className="rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300"
            >
              Reload
            </button>
            <button type="button" onClick={() => setWaiting(null)} className="text-neutral-400 hover:text-white" aria-label="Dismiss">
              ×
            </button>
          </>
        ) : (
          installPrompt && (
            <>
              <span>Install Reference Studio for offline use.</span>
              <button
                type="button"
                onClick={() => {
                  void installPrompt.prompt();
                  void installPrompt.userChoice.finally(() => setInstallPrompt(null));
                }}
                className="rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300"
              >
                Install
              </button>
              <button type="button" onClick={() => setInstallPrompt(null)} className="text-neutral-400 hover:text-white" aria-label="Not now">
                ×
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
