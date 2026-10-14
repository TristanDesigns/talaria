// The Talaria mark: Hermes' winged foot, drawn as a single hairline — shin,
// sole and heel in one stroke, three feathers sweeping up from the ankle.
// Drawn in currentColor.
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mark">
      <path d="M9.8 3.4C9.6 9 8.4 13.4 4 19.2C3.2 20.3 4 21.2 5.2 20.7C8.8 19.2 12.8 17.9 15.6 17.6C18 17.3 18.4 13.8 16.4 12.6C15 11.8 14.3 10.6 14 8.6C13.8 6.8 13.6 5 13.4 3.4" />
      <path d="M13.6 5.2C15.8 3.6 18.6 2.5 21.8 1.9C22.4 4.4 21.6 7 19.6 8.5" />
      <path d="M13.9 7.8C16.1 6.3 18.6 5.4 21.4 5" />
      <path d="M14.4 10.3C15.9 9.2 17.6 8.6 19.6 8.5" />
    </svg>
  );
}
