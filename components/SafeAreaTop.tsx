// Deckender Streifen in Höhe der iOS-Statusleiste (env(safe-area-inset-top)), damit der
// Seiteninhalt beim Scrollen nicht hinter Uhrzeit und Akku sichtbar bleibt.
// Im normalen Browser ist die Höhe 0.
export default function SafeAreaTop({ color }: { color: string }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)]"
      style={{ backgroundColor: color }}
    />
  );
}
