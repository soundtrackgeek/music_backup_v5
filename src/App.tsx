import { AppShell } from "./app/AppShell";
import { WorkspaceStoresProvider } from "./app/WorkspaceStoresProvider";
import { useAppController } from "./app/useAppController";
import { WorkspaceErrorBoundary } from "./components/WorkspaceErrorBoundary";

function AppContent() {
  const model = useAppController();
  return <AppShell model={model} />;
}

export default function App() {
  return (
    <WorkspaceErrorBoundary name="Music Library">
      <WorkspaceStoresProvider>
        <AppContent />
      </WorkspaceStoresProvider>
    </WorkspaceErrorBoundary>
  );
}
