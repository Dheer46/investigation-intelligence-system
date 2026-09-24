// An original, generic emblem - deliberately not a reproduction of any real
// national or departmental seal. Purely a visual anchor for "official
// portal" tone: a shield inside a laurel-like ring, rendered in the
// portal's own gold/navy palette.
export default function Crest({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" stroke="#c9a24a" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="25" stroke="#c9a24a" strokeWidth="1" opacity="0.5" />
      <path
        d="M32 14L46 19V30C46 40 40 46.5 32 50C24 46.5 18 40 18 30V19L32 14Z"
        fill="#17233b"
        stroke="#c9a24a"
        strokeWidth="1.5"
      />
      <path
        d="M32 21L37 24V30C37 34.5 35 37.5 32 39.5C29 37.5 27 34.5 27 30V24L32 21Z"
        fill="#c9a24a"
        opacity="0.85"
      />
    </svg>
  );
}
