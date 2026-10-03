"use client";

import { useState } from "react";
import PasswordField from "@/components/PasswordField";
import SafeAreaTop from "@/components/SafeAreaTop";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/password";

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
  const [passwordRepeat, setPasswordRepeat] = useState("");
  // Meldungen erscheinen erst nach dem ersten Absenden oder wenn das Wiederholungsfeld verlassen wird.
  const [showErrors, setShowErrors] = useState(false);
  const problems = validateNewPassword(password, passwordRepeat);

  function switchMode(mode: "login" | "register") {
    setAuthMode(mode);
    setPasswordRepeat("");
    setShowErrors(false);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fef3c7,#f8fafc_55%)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(2rem_+_env(safe-area-inset-top))] pb-[calc(2rem_+_env(safe-area-inset-bottom))] text-zinc-950">
      <SafeAreaTop color="#fef3c7" />
      <div className="mx-auto flex min-h-[calc(100vh_-_4rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] max-w-md flex-col justify-center gap-6">
        <div className="space-y-3 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">
            Personal Strength Log
          </p>
          <h1 className="text-4xl font-black tracking-tight">Gym Log</h1>
          <p className="text-sm text-zinc-600">
            Plane deine Woche, trage Workouts live ein und halte vergangenes Training fest.
          </p>
        </div>

        <form
          className="space-y-4 rounded-4xl border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur"
          onSubmit={(event) => {
            event.preventDefault();
            if (loading) {
              return;
            }

            if (isLogin) {
              void login();
              return;
            }

            setShowErrors(true);

            if (problems.password || problems.repeat) {
              return;
            }

            void signUp();
          }}
        >
          <div className="flex bg-zinc-100 rounded-xl p-1">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`w-1/2 rounded-lg p-3 font-bold ${
                isLogin ? "bg-amber-500 text-zinc-950" : "text-zinc-700"
              }`}
            >
              Login
            </button>

            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`w-1/2 rounded-lg p-3 font-bold ${
                !isLogin ? "bg-amber-500 text-zinc-950" : "text-zinc-700"
              }`}
            >
              Registrieren
            </button>
          </div>

          <input
            id="auth-email"
            name="email"
            className="w-full rounded-xl p-4"
            placeholder="E-Mail"
            aria-label="E-Mail"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <PasswordField
            id="auth-password"
            label="Passwort"
            value={password}
            onChange={setPassword}
            autoComplete={isLogin ? "current-password" : "new-password"}
            error={!isLogin && showErrors ? problems.password : null}
            hint={isLogin ? undefined : `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`}
          />

          {!isLogin && (
            <PasswordField
              id="auth-password-repeat"
              label="Passwort wiederholen"
              value={passwordRepeat}
              onChange={setPasswordRepeat}
              autoComplete="new-password"
              error={showErrors ? problems.repeat : null}
              onBlur={() => setShowErrors(true)}
            />
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-zinc-950 p-4 font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Bitte warten..." : isLogin ? "Einloggen" : "Registrieren"}
          </button>
        </form>
      </div>
    </main>
  );
}