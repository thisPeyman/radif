import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { LoadingScreen } from "./components";
import { api, type BeforeInstallPromptEvent, type Me } from "./shared";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const PublicOrderPage = lazy(() => import("./pages/PublicOrderPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AdminApp = lazy(() => import("./AdminApp"));

export default function App() {
  const [session, setSession] = useState<{ state: "loading" } | { state: "guest" } | { state: "ready"; me: Me }>({ state: "loading" });
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const location = useLocation();
  const isLanding = location.pathname === "/";
  const isPublicOrder = location.pathname.startsWith("/o/");

  useEffect(() => {
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
    const installed = () => setInstallPrompt(null);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    return () => { window.removeEventListener("beforeinstallprompt", beforeInstall); window.removeEventListener("appinstalled", installed); };
  }, []);

  useEffect(() => {
    if (isLanding || isPublicOrder) return;
    const controller = new AbortController();
    const unauthorized = () => setSession({ state: "guest" });
    window.addEventListener("radif:unauthorized", unauthorized);
    api<Me>("/api/me", { signal: controller.signal })
      .then((me) => setSession({ state: "ready", me }))
      .catch((reason) => { if (!(reason instanceof DOMException && reason.name === "AbortError")) setSession({ state: "guest" }); });
    return () => { controller.abort(); window.removeEventListener("radif:unauthorized", unauthorized); };
  }, [isLanding, isPublicOrder]);

  if (isLanding) {
    return <Suspense fallback={<LoadingScreen />}><LandingPage /></Suspense>;
  }
  if (isPublicOrder) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/o/:token" element={<PublicOrderPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }
  if (session.state === "loading") return <LoadingScreen />;
  if (session.state === "guest") {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/login" element={<LoginPage onLogin={(me) => setSession({ state: "ready", me })} />} />
          <Route path="*" element={<Navigate to="/login" state={{ from: location.pathname }} replace />} />
        </Routes>
      </Suspense>
    );
  }
  if (location.pathname === "/login") return <Navigate to="/orders/new" replace />;
  return (
    <Suspense fallback={<LoadingScreen />}>
      <AdminApp
        me={session.me}
        installPrompt={installPrompt}
        onInstallDone={() => setInstallPrompt(null)}
        onShopUpdated={(shop) => setSession({
          state: "ready",
          me: {
            ...session.me,
            shops: session.me.shops.map((current) => current.id === shop.id ? shop : current),
          },
        })}
        onLogout={() => setSession({ state: "guest" })}
      />
    </Suspense>
  );
}
