import { useId } from "react";
export function Spark({state="ready",small=false}:{state?:string;small?:boolean}) {
  const id="spark-"+useId().replace(/[^a-zA-Z0-9_-]/g,"");
  const shape="M80 15C88 15 94 38 103 46C113 55 143 58 146 69C150 81 129 91 121 102C114 111 119 137 108 142C97 148 87 132 79 132C70 132 56 148 46 141C36 134 42 114 34 103C26 92 7 83 12 71C17 59 43 57 53 47C64 36 70 15 80 15Z";
  return <svg className={`spark ${small?"spark-small":""} spark-${state}`} viewBox="0 0 160 180" role="img" aria-label={`Glint AI companion, ${state}`}>
    <defs>
      <radialGradient id={id+"-base"} cx="35%" cy="23%" r="82%">
        <stop stopColor="#a8bce9"/><stop offset=".27" stopColor="#6384cc"/><stop offset=".58" stopColor="#365cac"/><stop offset=".83" stopColor="#284583"/><stop offset="1" stopColor="#172c58"/>
      </radialGradient>
      <radialGradient id={id+"-belly"} cx="68%" cy="67%" r="64%">
        <stop stopColor="#162b56" stopOpacity=".72"/><stop offset=".56" stopColor="#32528f" stopOpacity=".25"/><stop offset="1" stopColor="#9aadd5" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id={id+"-shine"} cx="30%" cy="20%" r="65%">
        <stop stopColor="#f2f5ff" stopOpacity=".8"/><stop offset=".24" stopColor="#c2d0ee" stopOpacity=".3"/><stop offset=".72" stopColor="#a8bce1" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id={id+"-shoe"} x1="0" y1="0" x2=".7" y2="1">
        <stop stopColor="#5b79b4"/><stop offset=".36" stopColor="#344d7a"/><stop offset=".7" stopColor="#1b2b48"/><stop offset="1" stopColor="#101a2e"/>
      </linearGradient>
      <filter id={id+"-round"} x="-25%" y="-25%" width="150%" height="160%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="bump"/>
        <feSpecularLighting in="bump" surfaceScale="9" specularConstant=".65" specularExponent="24" lightingColor="#d5e0f8" result="light"><feDistantLight azimuth="225" elevation="48"/></feSpecularLighting>
        <feComposite in="light" in2="SourceAlpha" operator="in" result="shine"/>
        <feBlend in="SourceGraphic" in2="shine" mode="screen"/>
      </filter>
      <filter id={id+"-soft"} x="-70%" y="-100%" width="240%" height="300%"><feGaussianBlur stdDeviation="3"/></filter>
      <filter id={id+"-gloss"} x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="1.5"/></filter>
      <filter id={id+"-eyes"} x="-100%" y="-50%" width="300%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1.4" floodColor="#d5e0f8" floodOpacity=".8"/></filter>
    </defs>
    <ellipse cx="80" cy="163" rx="33" ry="5" fill="#263e6b" opacity=".22" filter={`url(#${id}-soft)`}/>
    <g className="spark-body">
      <g fill={`url(#${id}-shoe)`}>
        <path d="M51 132C44 134 42 146 46 155C48 160 57 160 63 155L71 147L65 133Z"/>
        <path d="M97 133C104 131 111 139 114 150C115 155 111 159 104 158L89 154C85 150 87 140 97 133Z"/>
      </g>
      <path d="M48 146Q53 138 62 139M94 143Q103 138 109 149" fill="none" stroke="#9bafd5" strokeWidth="2" opacity=".45"/>
      <g filter={`url(#${id}-round)`}>
        <path d={shape} fill={`url(#${id}-base)`}/>
        <path d={shape} fill={`url(#${id}-belly)`}/>
        <path d={shape} fill={`url(#${id}-shine)`}/>
      </g>
      <path d="M76 20C69 24 65 44 56 51C45 60 24 63 18 70" fill="none" stroke="#edf2ff" strokeWidth="2.5" strokeLinecap="round" opacity=".65" filter={`url(#${id}-gloss)`}/>
      <ellipse cx="64" cy="59" rx="17" ry="9" transform="rotate(-40 64 59)" fill="#c6d4ee" opacity=".2" filter={`url(#${id}-soft)`}/>
      <g fill="#fff" filter={`url(#${id}-eyes)`}><ellipse cx="67" cy="83" rx="3.7" ry="8"/><ellipse cx="88" cy="83" rx="3.7" ry="8"/></g>
    </g>
  </svg>;
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
