"use client";

import SafeAreaTop from "@/components/SafeAreaTop";

type AuthFormProps = {
  authMode: "login" | "register";
  setAuthMode: (mode: "login" | "register") => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  login: () => void;
  signUp: () => void;
  loading: boolean;
};

export default function AuthForm({
  authMode,
  setAuthMode,
  email,
  setEmail,
  password,
  setPassword,
  login,
  signUp,
  loading,
}: AuthFormProps) {
  const isLogin = authMode === "login";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,#f8fafc_55%)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(2rem_+_env(safe-area-inset-top))] pb-[calc(2rem_+_env(safe-area-inset-bottom))] text-zinc-950">
      <SafeAreaTop color="#fef3c7" />
      <div className="mx-auto flex min-h-[calc(100vh_-_4rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] max-w-md flex-col justify-center gap-6">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">
            Strength Planner
          </p>
          <h1 className="text-4xl font-black tracking-tight">Gym Log</h1>
          <p className="text-sm text-zinc-600">
            Plane deine Woche, tracke Workouts live und halte vergangene Sessions sauber fest.
          </p>
        </div>

        <form
          className="space-y-4 rounded-4xl border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur"
          onSubmit={(event) => {
            event.preventDefault();
            if (loading) {
              return;
            }

            void (isLogin ? login() : signUp());
          }}
        >
          <div className="flex bg-zinc-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setAuthMode("login")}
              className={`w-1/2 rounded-lg p-3 font-bold ${
                isLogin ? "bg-amber-500 text-zinc-950" : "text-zinc-700"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className={`w-1/2 rounded-lg p-3 font-bold ${
                !isLogin ? "bg-amber-500 text-zinc-950" : "text-zinc-700"
              }`}
            >
              Registrieren
            </button>
          </div>

          <input
            className="w-full rounded-xl p-4"
            placeholder="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full rounded-xl p-4"
            placeholder="Passwort"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-950 p-4 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Bitte warten..." : isLogin ? "Einloggen" : "Registrieren"}
          </button>

          <p className="text-xs text-zinc-500">
            Login per Enter ist aktiviert. Jede Anfrage läuft später über RLS nur auf deine eigenen Daten.
          </p>
        </form>
      </div>
    </main>
  );
}