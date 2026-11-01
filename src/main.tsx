import "./schema-config";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./theme.css";
import "./companion-ui.css";
import {lazy,Suspense} from "react";
const LiveKitPrototype=lazy(()=>import("./LiveKitPrototype"));
const App=lazy(()=>import("./App.tsx"));
createRoot(document.getElementById("root")!).render(<Suspense fallback={<p>Loading Glint…</p>}>
  {window.location.pathname==="/livekit"?<LiveKitPrototype/>:<App/>}
</Suspense>);
