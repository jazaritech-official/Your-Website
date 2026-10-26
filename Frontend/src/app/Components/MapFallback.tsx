/**
 * Shown in place of the Google Map when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not
 * configured. Keeps the surrounding UI intact so the rest of the page (search,
 * forms, tracking cards) keeps working without a key.
 */
const MapFallback = ({ className = "h-64 w-full" }: { className?: string }) => {
  return (
    <div
      className={`flex items-center justify-center bg-[#F8F9FA] ${className}`}
    >
      <p className="max-w-xs px-4 text-center text-xs font-semibold text-brand-navy/60">
        Map unavailable — add{" "}
        <code className="rounded bg-surface-muted px-1 py-0.5 text-[10px]">
          NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        </code>{" "}
        to enable Google Maps.
      </p>
    </div>
  );
};

export default MapFallback;
