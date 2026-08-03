import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { Brand, ErrorNotice } from "../components";
import { api, type Me } from "../shared";

export default function LoginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api<void>("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
      const me = await api<Me>("/api/me");
      onLogin(me);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/orders/new", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ورود انجام نشد. دوباره تلاش کنید.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-viewport flex min-h-dvh flex-col px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-ink sm:min-h-[760px] sm:px-8 sm:pt-12">
      <Brand />
      <div className="my-auto py-12">
        <div className="border-r-4 border-teal pr-5">
          <h1 className="text-[2rem] font-black leading-[1.65]">هر سفارش، سر جای خودش.</h1>
          <p className="mt-1 text-sm leading-7 text-ink/70">برای ساخت و پیگیری سفارش‌ها وارد شوید.</p>
        </div>
        <form className="mt-10 space-y-5" onSubmit={submit}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">نام کاربری</span>
            <input className="field" autoComplete="username" value={login} onChange={(event) => setLogin(event.target.value)} required />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-bold">رمز عبور</span>
            <span className="relative block">
              <input
                className="field pl-14"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                className="absolute inset-y-0 left-0 grid w-12 place-items-center text-ink/70"
                type="button"
                aria-label={showPassword ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور"}
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </span>
          </label>
          {error && <ErrorNotice>{error}</ErrorNotice>}
          <button className="primary-button w-full" disabled={pending} type="submit">
            {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
            {pending ? "در حال ورود…" : "ورود به ردیف"}
          </button>
        </form>
      </div>
      <p className="text-center text-xs text-ink/70">نسخه آزمایشی ردیف</p>
    </div>
  );
}
