import LeftPane from "@/components/LeftPane/LeftPane";
import MiddlePane from "@/components/MiddlePane/MiddlePane";
import RightPane from "@/components/RightPane/RightPane";

export default function Home() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🧠</span>
          <span className="brand-name">NotebookLM <span className="brand-tag">Clone</span></span>
        </div>
        <p className="header-tagline">Deterministic AI · Zero Hallucinations · Grounded in your sources</p>
      </header>
      <div className="three-pane-layout">
        <LeftPane />
        <MiddlePane />
        <RightPane />
      </div>
    </div>
  );
}
