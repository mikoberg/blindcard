/**
 * A championship belt as a plain silhouette (strap, two side plates, a large centre plate with a
 * star cut out of it) in the colour of the text around it. It stands for "Title fight" wherever
 * that label used to be; the words stay for screen readers and as the tooltip.
 */
const CENTRE_PLATE = [
  "M19 12a13 11 0 1 0 26 0a13 11 0 1 0 -26 0z", // the plate
  "M32.0 4.8L33.8 9.5L38.8 9.8L34.9 13.0L36.2 17.8L32.0 15.1L27.8 17.8L29.1 13.0L25.2 9.8L30.2 9.5z", // a star cut out of it
].join("");

export function TitleBelt({ className = "h-4 w-11" }: { className?: string }) {
  return (
    <span className="inline-flex shrink-0" title="Title fight">
      <svg viewBox="0 0 64 24" aria-hidden="true" className={className} fill="currentColor">
        <rect x="0" y="9" width="21" height="6" />
        <rect x="43" y="9" width="21" height="6" />
        <rect x="6" y="4.5" width="9" height="15" rx="2" />
        <rect x="49" y="4.5" width="9" height="15" rx="2" />
        <path d={CENTRE_PLATE} fillRule="evenodd" />
      </svg>
      <span className="sr-only">Title fight</span>
    </span>
  );
}
