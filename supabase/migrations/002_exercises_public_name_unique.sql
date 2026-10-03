-- Migration 002: eindeutige Namen bei oeffentlichen Standarduebungen
--
-- Legt NUR einen Index an, veraendert oder loescht keine Daten. Schlaegt fehl, wenn es
-- schon zwei oeffentliche Uebungen mit gleichem Namen gibt (Gross-/Kleinschreibung und
-- Leerzeichen am Rand zaehlen nicht). Die Datei ist mehrfach ausfuehrbar.
--
-- Bereits in Supabase ausgefuehrt; hier abgelegt, damit das Repo den Stand zeigt.

create unique index if not exists exercises_public_name_unique
  on public.exercises (lower(btrim(name))) where is_public;
