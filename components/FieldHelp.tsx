"use client";

import { useEffect } from "react";
import { REP_RANGE } from "@/lib/recommendations";

type FieldHelpProps = {
  onClose: () => void;
};

const RPE_LEVELS = [
  { value: "10", text: "keine Wiederholung mehr möglich" },
  { value: "9", text: "eine wäre noch gegangen" },
  { value: "8", text: "zwei" },
  { value: "7", text: "drei" },
  { value: "6", text: "vier oder mehr, eher leicht" },
];

// Hilfeblatt zu den Eingabefeldern. Am Handy gibt es kein Hovern, deshalb ein Blatt zum Antippen.
export default function FieldHelp({ onClose }: FieldHelpProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40">
      <button
        type="button"
        aria-label="Hilfe schließen"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-help-title"
        className="relative max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-4xl bg-white pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-5 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))] shadow-[0_-18px_60px_rgba(15,23,42,0.2)]"
      >
        <h3 id="field-help-title" className="text-xl font-black text-zinc-950">
          Was bedeuten die Felder?
        </h3>

        <div className="space-y-4 text-sm text-zinc-700">
          <div className="space-y-1">
            <p className="font-bold text-zinc-950">Gewicht (kg)</p>
            <p>
              Das Gewicht, mit dem du den Satz gemacht hast. Bei Kurzhanteln das Gewicht einer
              Hantel (pro Hand) – trag es immer gleich ein. Bei Übungen mit Eigengewicht (z. B.
              Klimmzüge) 0, mit Zusatzgewicht das Zusatzgewicht.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-zinc-950">Wiederholungen</p>
            <p>Wie oft du das Gewicht in diesem Satz sauber bewegt hast.</p>
          </div>

          <div className="space-y-2">
            <p className="font-bold text-zinc-950">RPE (freiwillig)</p>
            <p>RPE = wie anstrengend der Satz war.</p>
            <ul className="space-y-1">
              {RPE_LEVELS.map((level) => (
                <li key={level.value} className="flex gap-3">
                  <span className="w-6 shrink-0 font-black text-zinc-950">{level.value}</span>
                  <span>{level.text}</span>
                </li>
              ))}
            </ul>
            <p>
              Die Angabe ist freiwillig. Die App nutzt sie als Bremse: War der Satz härter als 9,
              empfiehlt sie, das Gewicht noch zu halten.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-zinc-950">Arbeitssätze</p>
            <p>
              Die Sätze mit dem schwersten Gewicht einer Einheit. Nur sie zählen für die
              Empfehlung. Leichtere Sätze, davor oder danach, zählen nicht.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-zinc-950">Ziel</p>
            <p>
              Dein Vorschlag fürs nächste Mal. Erst steigerst du die Wiederholungen bis{" "}
              {REP_RANGE.max}, dann das Gewicht, und startest wieder bei {REP_RANGE.min}.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl bg-zinc-950 px-4 py-4 text-base font-semibold text-white"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}
