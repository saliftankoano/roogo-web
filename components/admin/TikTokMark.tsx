// The TikTok logo, one drawing for the whole back office (Studio NetworkIcons
// and the goal icons on Accueil), so it looks the same everywhere.
//
// Same frame as the Instagram square: a 24-unit black square with 6-unit
// corners. The note fills 60 % of the height and is centred on its bounding
// box (x 1.6 to 19.1, y 1 to 21 in path units), with the cyan copy offset up
// left and the red copy down right, as on TikTok's own mark.

const NOTE =
  "M14.3 1h-3.4v13.6a2.9 2.9 0 1 1-2.9-2.9c.3 0 .6 0 .9.1V8.3a6.4 6.4 0 1 0 5.4 6.3V7.8a8 8 0 0 0 4.7 1.5V5.9A4.7 4.7 0 0 1 14.3 1z";
const SCALE = 0.72;
const CENTRE = { x: 10.35, y: 11 };
const PLACE = `translate(${(12 - CENTRE.x * SCALE).toFixed(2)} ${(12 - CENTRE.y * SCALE).toFixed(2)}) scale(${SCALE})`;

export function TikTokMark({ size, rounded = true }: { size: number; rounded?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="block">
      <rect width="24" height="24" rx={rounded ? 6 : 0} fill="#000" />
      <g transform={PLACE}>
        <path d={NOTE} fill="#25F4EE" transform="translate(-0.9 -0.6)" />
        <path d={NOTE} fill="#FE2C55" transform="translate(0.9 0.6)" />
        <path d={NOTE} fill="#FFFFFF" />
      </g>
    </svg>
  );
}
