export function Spark({
  state = "ready",
  small = false,
}: {
  state?: string;
  small?: boolean;
}) {
  return (
    <svg
      className={`spark ${small ? "spark-small" : ""} spark-${state}`}
      viewBox="0 0 160 180"
      role="img"
      aria-label={`Glint AI companion, ${state}`}
    >
      <defs>
        <radialGradient id={small ? "glow-s" : "glow"}>
          <stop stopColor="#67d5ff" />
          <stop offset=".7" stopColor="#149cff" />
          <stop offset="1" stopColor="#0866ff" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="160" rx="34" ry="6" fill="#a5c6d8" opacity=".3" />
      <g className="spark-body">
        <path
          d="M78 19C90 15 94 39 107 48C117 56 142 58 148 72C155 88 138 98 125 105C115 114 117 137 104 145C93 152 83 139 76 134C67 145 52 143 48 130C44 115 37 109 22 103C7 97 7 80 22 71C42 60 54 58 61 40C65 30 67 20 78 19Z"
          fill={`url(#${small ? "glow-s" : "glow"})`}
        />
        <ellipse cx="61" cy="84" rx="5" ry="8" fill="#fff" />
        <ellipse cx="94" cy="82" rx="5" ry="8" fill="#fff" />
        <circle cx="62" cy="81" r="1.8" fill="#fff" />
        <circle cx="95" cy="79" r="1.8" fill="#fff" />
        <path
          d="M71 99Q79 107 87 98"
          fill="none"
          stroke="#0756a0"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <ellipse
          cx="62"
          cy="146"
          rx="12"
          ry="8"
          transform="rotate(-17 62 146)"
          fill="#55b1e9"
        />
        <ellipse
          cx="92"
          cy="146"
          rx="12"
          ry="8"
          transform="rotate(17 92 146)"
          fill="#55b1e9"
        />
      </g>
    </svg>
  );
}
export function Organizer({ assembled = false }: { assembled?: boolean }) {
  return (
    <svg
      className="organizer-art"
      viewBox="0 0 640 430"
      role="img"
      aria-label="Illustrated demonstration organizer with a wooden base, side panels, and small desk objects. This is not camera evidence."
    >
      <defs>
        <linearGradient id="wood" x2="1" y2="1">
          <stop stopColor="#e2c49a" />
          <stop offset="1" stopColor="#bd9466" />
        </linearGradient>
        <linearGradient id="paper" x2="0" y2="1">
          <stop stopColor="#f7f3e7" />
          <stop offset="1" stopColor="#dad7c9" />
        </linearGradient>
      </defs>
      <ellipse
        cx="335"
        cy="353"
        rx="220"
        ry="34"
        fill="#183e31"
        opacity=".14"
      />
      <path d="M110 284L356 185L553 281L309 389Z" fill="#a47950" />
      <path d="M110 270L356 171L553 267L309 375Z" fill="url(#wood)" />
      <path d="M110 270V284L309 389V375Z" fill="#b98d60" />
      <path
        d={
          assembled
            ? "M150 260L150 135L260 91L260 214Z"
            : "M105 198L105 104L207 64L207 158Z"
        }
        fill="#dfc29c"
        stroke="#c09a6e"
        strokeWidth="3"
      />
      <path
        d={
          assembled
            ? "M420 219L420 94L518 142L518 266Z"
            : "M446 181L446 74L546 121L546 231Z"
        }
        fill="#caa276"
        stroke="#b88e60"
        strokeWidth="3"
      />
      <path
        d="M258 250L258 137L421 215L421 326Z"
        fill="#b58c60"
        stroke="#ac8158"
        strokeWidth="3"
      />
      <path d="M186 266L270 233L336 265L251 302Z" fill="url(#paper)" />
      <path
        d="M186 273L251 309L336 273"
        fill="none"
        stroke="#e1d9c6"
        strokeWidth="6"
      />
      <path
        d="M365 254L365 170"
        stroke="#e5ba60"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d="M387 266L400 176"
        stroke="#526d59"
        strokeWidth="11"
        strokeLinecap="round"
      />
      <path
        d="M406 272L431 195"
        stroke="#d59079"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path d="M347 249L392 227L442 252L397 275Z" fill="#f2ead8" />
      <path d="M347 249L355 310L397 334L397 275Z" fill="#d8cfb9" />
      <path d="M397 275L442 252L434 311L397 334Z" fill="#c2c5af" />
      <path
        d="M151 311L287 380M325 197L508 282"
        stroke="#efd8b5"
        strokeWidth="2"
        opacity=".4"
      />
      <g fill="#dfd5ad">
        <circle cx="528" cy="331" r="4" />
        <circle cx="546" cy="342" r="3" />
        <circle cx="100" cy="328" r="3" />
      </g>
    </svg>
  );
}
