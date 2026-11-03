import "./schema-config";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";
import "./companion-ui.css";
import {lazy,Suspense} from "react";
const LiveKitPrototype=lazy(()=>import("./LiveKitPrototype"));
const App=lazy(()=>import("./App.tsx"));
createRoot(document.getElementById("root")!).render(<Suspense fallback={<main aria-busy="true"><h1>Loading Glint…</h1></main>}>
  {window.location.pathname==="/livekit"&&import.meta.env.VITE_GLINT_SUBMISSION_BUILD!=="1"?<LiveKitPrototype/>:<App/>}
</Suspense>);
