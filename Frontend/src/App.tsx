import { Header, Sidebar, StatusBar, DetailPanel } from '@/components/layout';
import { MapArea } from '@/components/map';

/**
 * OceanWatch Application Shell
 *
 * Main application component providing the complete UI shell for the
 * maritime intelligence dashboard.
 *
 * Layout structure:
 * - Header: Top navigation with branding, status, and controls
 * - Sidebar: Left panel with layer controls and quick actions
 * - MapArea: Main viewport for the interactive map
 * - DetailPanel: Right panel for detailed information
 * - StatusBar: Bottom bar with viewport and data information
 *
 * See AGENTS.md §1: Read PRD.md and PROGRESS.md before making changes.
 */
function App() {
  return (
    <div className="min-h-[100dvh] h-[100dvh] w-full relative overflow-hidden bg-ocean-900 select-none">
      {/* Map Viewport - Full width/height background canvas */}
      <MapArea />

      {/* Floating Top Bar (Logo, Search Pill, Live Status, Alerts) */}
      <Header />

      {/* Floating Left Navigation & Layers Panels */}
      <Sidebar />

      {/* Floating Right Intelligence Panels */}
      <DetailPanel />

      {/* Floating Bottom Telemetry Status Bar */}
      <StatusBar />
    </div>
  );
}

export default App;
