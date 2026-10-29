import { useEffect, useRef } from "react";

/** One stable shell and rig; preserve the original substantial leg and shoe artwork. */
const frontShell =
  "M88 25C103 22 105 44 119 53C132 62 151 62 158 77C167 94 151 108 137 116C125 124 128 145 115 155C101 164 77 163 64 156C51 148 54 132 43 124C29 117 14 115 11 100C6 83 26 75 41 68C60 59 62 47 70 34C74 27 80 25 88 25Z";
const sideShell =
  "M88 25C100 22 104 45 115 56C127 65 143 68 147 84C152 100 139 109 129 119C119 130 123 148 111 156C98 164 81 163 70 156C59 148 60 134 51 125C41 118 27 113 27 98C26 83 43 76 54 67C69 58 69 47 76 34C80 27 84 25 88 25Z";
const frontPoints = [...frontShell.matchAll(/-?\d+(?:\.\d+)?/g)].map((x) =>
  Number(x[0]),
);
const sidePoints = [...sideShell.matchAll(/-?\d+(?:\.\d+)?/g)].map((x) =>
  Number(x[0]),
);
function shellAt(turn: number) {
  let i = 0;
  return frontShell.replace(/-?\d+(?:\.\d+)?/g, () => {
    const n = sidePoints[i] + (frontPoints[i] - sidePoints[i]) * turn;
    i++;
    return n.toFixed(3);
  });
}
export default function OpeningCharacter() {
  const svg = useRef<SVGSVGElement>(null);
  const travel = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const shell = useRef<SVGPathElement>(null);
  const shellClip = useRef<SVGPathElement>(null);
  const shine = useRef<SVGGElement>(null);
  const farFoot = useRef<SVGGElement>(null);
  const nearFoot = useRef<SVGGElement>(null);

  useEffect(() => {
    let handle = 0;
    const started = performance.now();
    const walkSeconds = 3.2;
    const cycleSeconds = 0.96;
    // Constant travel during most of the walk, then a gentle 300 ms deceleration.
    const progress = (seconds: number) => {
      const t = Math.max(0, Math.min(walkSeconds, seconds));
      const u = Math.max(0, t - 2.9);
      return (Math.min(t, 2.9) + u - (u * u) / 0.6) / 3.05;
    };
    const frame = () => {
      const seconds = (performance.now() - started) / 1000;
      const scale = (svg.current?.getBoundingClientRect().width ?? 310) / 180;
      const start = -innerWidth / 2 + Math.min(75, innerWidth * 0.12);
      const position = (t: number) => start * (1 - progress(t));
      travel.current?.setAttribute(
        "transform",
        `translate(${position(seconds) / scale} 0)`,
      );
      const weight = Math.min(1, Math.max(0, (walkSeconds - seconds) / 0.3));
      const rawTurn = Math.max(0, Math.min(1, (seconds - 3.55) / 0.62));
      const turn = rawTurn * rawTurn * (3 - 2 * rawTurn);
      const shape = shellAt(turn);
      shell.current?.setAttribute("d", shape);
      shellClip.current?.setAttribute("d", shape);
      shine.current?.setAttribute("transform", `translate(${turn * -5} 0)`);
      const phase = seconds / cycleSeconds;
      const bob = -1.3 * Math.sin(phase * Math.PI * 2) ** 2 * weight;
      const lean = 1.6 * Math.sin(phase * Math.PI * 2) * weight;
      body.current?.setAttribute(
        "transform",
        `translate(0 ${bob}) rotate(${lean} 90 145)`,
      );

      // Restore the earlier small, alternating waddle instead of a wide stance.
      const foot = (
        node: SVGGElement | null,
        offset: number,
        pivot: number,
      ) => {
        if (!node) return;
        const angle = (phase + offset) * Math.PI * 2;
        const x = Math.sin(angle) * 3.5 * weight;
        const lift = -Math.max(0, Math.cos(angle)) * 3.5 * weight;
        const tilt = Math.sin(angle) * 6 * weight;
        node.setAttribute(
          "transform",
          `translate(${x} ${lift}) rotate(${tilt} ${pivot} 170)`,
        );
      };
      foot(farFoot.current, 0.5, 83);
      foot(nearFoot.current, 0, 105);
      if (seconds < 6.1) handle = requestAnimationFrame(frame);
    };
    handle = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(handle);
  }, []);

  return (
    <svg
      ref={svg}
      className="opening-spark"
      viewBox="0 0 180 200"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="opening-gold" cx="36%" cy="25%" r="85%">
          <stop stopColor="#e6f8ff" />
          <stop offset=".38" stopColor="#9ad8fc" />
          <stop offset=".76" stopColor="#56b3ef" />
          <stop offset="1" stopColor="#247bc5" />
        </radialGradient>
        <radialGradient id="opening-belly">
          <stop stopColor="#dbf4ff" stopOpacity=".38" />
          <stop offset="1" stopColor="#dbf4ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="opening-aura">
          <stop stopColor="#8dcefa" stopOpacity=".18" />
          <stop offset="1" stopColor="#8dcefa" stopOpacity="0" />
        </radialGradient>
        <clipPath id="opening-material-clip">
          <path id="opening-rim-geometry" ref={shellClip} d={sideShell} />
        </clipPath>
        <radialGradient id="opening-shine">
          <stop stopColor="#f1fcff" stopOpacity=".85" />
          <stop offset=".5" stopColor="#e3f7ff" stopOpacity=".3" />
          <stop offset="1" stopColor="#e3f7ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="opening-volume">
          <stop stopColor="#1f70b3" stopOpacity=".28" />
          <stop offset="1" stopColor="#1f70b3" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="opening-foot-light" x1="0" y1="0" x2=".6" y2="1">
          <stop stopColor="#8ad2fc" />
          <stop offset="1" stopColor="#3298de" />
        </linearGradient>
        <radialGradient id="opening-jelly-bubble" cx="32%" cy="26%">
          <stop stopColor="#f2fcff" stopOpacity=".8" />
          <stop offset=".25" stopColor="#ddf3ff" stopOpacity=".08" />
          <stop offset=".65" stopColor="#60b9ed" stopOpacity=".04" />
          <stop offset=".9" stopColor="#e7f7ff" stopOpacity=".65" />
          <stop offset="1" stopColor="#2e8acb" stopOpacity=".18" />
        </radialGradient>
        <linearGradient id="opening-reflection" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f3fcff" stopOpacity=".85" />
          <stop offset=".55" stopColor="#e3f7ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#e3f7ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g ref={travel} className="opening-rig" transform="translate(-1000 0)">
        <ellipse
          cx="90"
          cy="188"
          rx="37"
          ry="4.5"
          fill="#789ab5"
          opacity=".14"
        />
        <ellipse cx="90" cy="104" rx="86" ry="83" fill="url(#opening-aura)" />
        <g ref={farFoot} className="opening-foot opening-foot-back">
          <path
            d="M78 148Q70 157 68 171Q65 184 80 185L99 181Q111 174 97 169L92 151Z"
            fill="#479ddd"
          />
        </g>
        <g ref={nearFoot} className="opening-foot opening-foot-front">
          <path
            d="M89 148Q93 160 91 172Q89 185 104 186L123 182Q134 175 120 170L106 168L102 150Z"
            fill="url(#opening-foot-light)"
          />
        </g>
        <g ref={body} className="opening-body">
          <path
            id="opening-surface"
            ref={shell}
            className="opening-shell"
            d={sideShell}
            fill="url(#opening-gold)"
            fillOpacity=".9"
          />
          <ellipse
            cx="88"
            cy="125"
            rx="39"
            ry="29"
            fill="url(#opening-belly)"
          />
          <g ref={shine} clipPath="url(#opening-material-clip)">
            <ellipse
              cx="134"
              cy="121"
              rx="39"
              ry="66"
              fill="url(#opening-volume)"
            />
            <ellipse
              cx="65"
              cy="68"
              rx="30"
              ry="43"
              transform="rotate(-30 65 68)"
              fill="url(#opening-shine)"
            />
            <path
              d="M72 39Q64 61 49 70"
              fill="none"
              stroke="#e5f7ff"
              strokeWidth="3.2"
              strokeLinecap="round"
              opacity=".52"
            />
            <ellipse
              cx="89"
              cy="158"
              rx="35"
              ry="8"
              fill="#286b9d"
              opacity=".1"
            />
          </g>
          <g
            className="opening-jelly-material"
            clipPath="url(#opening-material-clip)"
          >
            <use
              href="#opening-rim-geometry"
              fill="none"
              stroke="#e6f8ff"
              strokeWidth="2.3"
              opacity=".56"
            />
            <path
              d="M53 69C43 79 36 89 42 99"
              fill="none"
              stroke="url(#opening-reflection)"
              strokeWidth="5.5"
              strokeLinecap="round"
              opacity=".72"
            />
            <ellipse
              cx="66"
              cy="77"
              rx="7"
              ry="14"
              transform="rotate(30 66 77)"
              fill="url(#opening-shine)"
              opacity=".7"
            />
            <g className="opening-inner-bubbles">
              {[
                [59, 103, 3.3],
                [70, 123, 2],
                [85, 137, 4],
                [108, 126, 2.8],
                [121, 110, 1.8],
                [91, 69, 2.3],
                [51, 88, 1.5],
                [98, 142, 1.3],
                [76, 106, 1.4],
              ].map(([cx, cy, r], i) => (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="url(#opening-jelly-bubble)"
                />
              ))}
            </g>
            <g className="opening-internal-sparkles" fill="#fffdf0">
              <path
                className="jelly-twinkle jelly-twinkle-a"
                d="M63 112l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1Z"
              />
              <path
                className="jelly-twinkle jelly-twinkle-b"
                d="M109 137l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8Z"
              />
              <path
                className="jelly-twinkle jelly-twinkle-c"
                d="M91 77l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7Z"
              />
            </g>
          </g>
          {/* The near eye stays in place through the turn; no scaled/detached face. */}
          <ellipse
            className="opening-near-eye"
            cx="111"
            cy="94"
            rx="5.6"
            ry="8.4"
            fill="#59452b"
          />
          <circle cx="112" cy="91" r="1.8" fill="#fffbed" />
          <g className="opening-profile">
            <path
              d="M105 79Q111 75 117 79"
              fill="none"
              stroke="#b68b51"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <ellipse
              cx="108"
              cy="110"
              rx="9"
              ry="5"
              fill="#e2b17c"
              opacity=".28"
            />
            <path
              d="M101 116Q109 124 117 115"
              fill="none"
              stroke="#9b7043"
              strokeWidth="2.3"
              strokeLinecap="round"
            />
          </g>
          <g className="opening-front">
            <ellipse cx="73" cy="95" rx="5.6" ry="8.4" fill="#59452b" />
            <circle cx="74" cy="92" r="1.8" fill="#fffbed" />
            <ellipse
              cx="64"
              cy="111"
              rx="9"
              ry="5"
              fill="#e2b17c"
              opacity=".26"
            />
            <ellipse
              cx="119"
              cy="110"
              rx="9"
              ry="5"
              fill="#e2b17c"
              opacity=".26"
            />
            <path
              d="M83 117Q92 126 102 116"
              fill="none"
              stroke="#9b7043"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </g>
        </g>
      </g>
    </svg>
  );
}
