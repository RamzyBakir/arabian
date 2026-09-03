import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { CheckIcon, CopyIcon } from "./icons";

const SERVER_LOCAL = {
  command: "node",
  args: ["/absolute/path/to/arabian/dist/mcp/server.js"],
};

function json(): string {
  return JSON.stringify(
    {
      mcpServers: {
        arabian: SERVER_LOCAL,
      },
    },
    null,
    2,
  );
}

const CODEX_TOML = `[mcp_servers.arabian]
command = "node"
args = ["/absolute/path/to/arabian/dist/mcp/server.js"]
`;

interface VariantSection {
  id: string;
  label: string;
  file: string;
  code: string;
  note?: string;
}

function variantsFor(cfg: { json: string; toml: string } | null): VariantSection[] {
  return [
    {
      id: "json",
      label: "JSON — Claude Desktop, Cursor, ZCode / Claude Code",
      file: "claude_desktop_config.json · ~/.cursor/mcp.json · .mcp.json (project root)",
      code: cfg?.json ?? json(),
      note: "Windows Claude Desktop: %APPDATA%\\Claude\\claude_desktop_config.json",
    },
    {
      id: "toml",
      label: "TOML — Codex CLI",
      file: "~/.codex/config.toml",
      code: cfg?.toml ?? CODEX_TOML,
    },
  ];
}

/**
 * Guard against bogus instant-dismissals: some environments deliver a
 * stray interaction right after the opening press, which react-aria's
 * interact-outside treats as an outside click. Ignore closes that land
 * within a short grace window after opening.
 */
export function useGracefulClose(onClose: () => void, isOpen: boolean, graceMs = 450) {
  const openedAt = useRef(0);
  useEffect(() => {
    if (isOpen) openedAt.current = Date.now();
  }, [isOpen]);
  return (open: boolean) => {
    if (open) return;
    if (Date.now() - openedAt.current > graceMs) onClose();
  };
}

export function McpDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const handleOpenChange = useGracefulClose(onClose, isOpen);
  const [cfg, setCfg] = useState<{ serverPath: string; json: string; toml: string } | null>(null);

  // The app is served by the same Arabian install that ships the MCP server,
  // so ask it for the real absolute path instead of a placeholder.
  useEffect(() => {
    if (!isOpen) return;
    let alive = true;
    fetch("/api/mcp-config")
      .then((r) => r.json())
      .then((c) => alive && setCfg(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const variants = variantsFor(cfg);
  return (
    <Modal.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="w-[44rem] max-w-[92vw]">
            <Modal.Header>
              <Modal.Heading>Connect agents with MCP</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>
            <Modal.Body>
              <div className="flex flex-col gap-5">
                <p className="text-sm leading-relaxed text-muted">
                  Arabian ships an MCP server that lets coding agents read and record lineage
                  directly. Point your tool at it once — the agent then gets the nine{" "}
                  <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-xs text-accent">
                    arabian_*
                  </code>{" "}
                  tools in any project containing an <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-xs text-accent">.arabian/</code> directory.
                </p>


                {variants.map((s) => (
                  <section key={s.id}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">{s.label}</h3>
                      <CopyButton text={s.code} />
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted">{s.file}</p>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-surface-secondary p-3.5 font-mono text-xs leading-relaxed text-foreground">
                      {s.code}
                    </pre>
                    {s.note && <p className="mt-1.5 text-xs text-muted">{s.note}</p>}
                  </section>
                ))}

                <p className="text-xs leading-relaxed text-muted">
                  Restart the tool after editing its config. Agents will discover lineage in any
                  project automatically; run{" "}
                  <code className="rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-xs text-accent">arabian serve</code>{" "}
                  to explore it yourself in the browser.
                </p>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      isIconOnly
      aria-label="Copy to clipboard"
      onPress={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  );
}
