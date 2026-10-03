"use client";

import { useState } from "react";

type PasswordFieldProps = {
  id: string;
  // Dient als Platzhalter und als Beschriftung für Screenreader.
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  error?: string | null;
  hint?: string;
  onBlur?: () => void;
};

// Passwortfeld mit Knopf zum Anzeigen und Verbergen und Meldung direkt unter dem Feld.
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  onBlur,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          id={id}
          name={id}
          className={`w-full rounded-xl p-4 pr-28 ${error ? "border-rose-500!" : ""}`}
          placeholder={label}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />

        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-pressed={visible}
          aria-controls={id}
          aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
          className="absolute right-1 top-1/2 min-h-11 -translate-y-1/2 rounded-lg px-3 text-sm font-semibold text-zinc-600"
        >
          {visible ? "Verbergen" : "Anzeigen"}
        </button>
      </div>

      {error ? (
        <p id={`${id}-error`} role="alert" className="px-1 text-sm text-rose-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="px-1 text-xs text-zinc-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
