import { useEffect, useRef, useState } from "react";
import { Button, Tabs } from "@heroui/react";
import type { NodeType } from "@core/types";
import { api, type ProjectInfo } from "./api";
import { Orb } from "./components/Orb";
import { CreateNodeDialog } from "./components/CreateNodeDialog";
import { McpDialog } from "./components/McpDialog";
import { ChevronLeftIcon, MoonIcon, PlugIcon, SunIcon } from "./components/icons";
import { ThemeProvider, useTheme } from "./ThemeContext";
import { Overview } from "./views/Overview";
import { NodeDetail } from "./views/NodeDetail";
import { GraphView } from "./views/GraphView";

type Route =
  | { view: "overview" }
  | { view: "graph" }
  | { view: "node"; id: string };

function routeKey(r: Route): string {
  return r.view === "node" ? `/node/${r.id}` : `/${r.view}`;
}

function parseHash(raw?: string): Route {
  const hash = (raw ?? window.location.hash).replace(/^#?\/?/, "");
  const [head, id] = hash.split("/");
  if (head === "graph") return { view: "graph" };
  if (head === "node" && id) return { view: "node", id };
  return { view: "overview" };
}

function AppInner() {
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [creating, setCreating] = useState<NodeType | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const historyRef = useRef<Route[]>([]);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  useEffect(() => {
    api.project().then(setProject).catch(() => {});
  }, [route]);

  // Update state directly — some embedded webviews swallow programmatic
  // location.hash writes, so the hashchange event alone can't be relied on.
  const navigate = (hash: string) => {
    const next = parseHash(hash);
    setRoute((current) => {
      if (routeKey(current) !== routeKey(next)) {
        historyRef.current = [...historyRef.current.slice(-20), current];
      }
      return next;
    });
    try {
      window.location.hash = hash;
    } catch {
      /* ignore */
    }
  };

  const goBack = () => {
    const prev = historyRef.current.pop();
    const target = prev ?? { view: "overview" as const };
    setRoute(target);
    try {
      window.location.hash = routeKey(target);
    } catch {
      /* ignore */
    }
  };

  const openNode = (id: string) => navigate(`/node/${id}`);
  const isGraph = route.view === "graph";
  const activeTab = isGraph ? "graph" : "overview";

  return (
    <div className="flex h-screen flex-col bg-background text-foreground antialiased">
      {/* header */}
      <header className="z-20 grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-6">
        <div className="flex items-center gap-3">
          {route.view !== "overview" && (
            <Button variant="ghost" isIconOnly onPress={goBack} aria-label="Go back">
              <ChevronLeftIcon />
            </Button>
          )}
          <button onClick={() => navigate("/")} className="flex items-center gap-3" title="Back to overview">
            <Orb size={36} />
            <span className="text-base font-semibold tracking-tight text-foreground">
              arabian
              {project && (
                <span className="ml-3 hidden border-l border-border pl-3 text-sm font-normal text-muted sm:inline">
                  {project.name}
                </span>
              )}
            </span>
          </button>
        </div>

        <Tabs
          aria-label="Views"
          selectedKey={activeTab}
          onSelectionChange={(key) => navigate(String(key) === "graph" ? "/graph" : "/")}
        >
          <Tabs.ListContainer>
            <Tabs.List className="text-[15px]">
              <Tabs.Tab id="overview">
                Overview
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="graph">
                Lineage
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div className="flex items-center justify-end gap-1.5">
          <Button variant="outline" size="sm" onPress={() => setMcpOpen(true)}>
            MCP
          </Button>
          <Button variant="primary" size="sm" onPress={() => setCreating("question")}>
            + Record
          </Button>
          <Button
            variant="outline"
            size="sm"
            isIconOnly
            onPress={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
        </div>
      </header>

      {/* main */}
      <main className={`min-h-0 flex-1 ${isGraph ? "" : "overflow-y-auto"}`}>
        {route.view === "overview" && (
          <Overview onOpenNode={openNode} onCreate={(t) => setCreating(t ?? "question")} />
        )}
        {route.view === "node" && (
          <NodeDetail key={route.id} id={route.id} onOpenNode={openNode} onGoBack={goBack} />
        )}
        {isGraph && <GraphView onOpenNode={openNode} />}
      </main>

      <CreateNodeDialog
        defaultType={creating ?? undefined}
        isOpen={creating !== null}
        onClose={() => setCreating(null)}
        onCreated={(id) => {
          setCreating(null);
          openNode(id);
        }}
      />

      <McpDialog isOpen={mcpOpen} onClose={() => setMcpOpen(false)} />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
