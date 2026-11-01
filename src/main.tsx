import "./schema-config";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./styles.css";
import "./theme.css";
import "./companion-ui.css";
import {lazy,Suspense} from "react";
const LiveKitPrototype=lazy(()=>import("./LiveKitPrototype"));
createRoot(document.getElementById("root")!).render(window.location.pathname==="/livekit"
  ? <Suspense fallback={<p>Loading voice prototype…</p>}><LiveKitPrototype/></Suspense>
  : <App />);
