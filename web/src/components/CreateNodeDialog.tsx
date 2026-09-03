import { useState } from "react";
import { Button, Input, Modal, TextArea } from "@heroui/react";
import type { NodeType } from "@core/types";
import { NODE_TYPES, TYPE_COLORS } from "../theme";
import { useGracefulClose } from "./McpDialog";
import { api } from "../api";

/**
 * Modal for creating a lineage node, opened from the header ("Record"),
 * the overview CTAs, and the graph empty state.
 */
export function CreateNodeDialog({
  defaultType,
  isOpen,
  onClose,
  onCreated,
}: {
  defaultType?: NodeType;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [type, setType] = useState<NodeType>(defaultType ?? "question");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const node = await api.createNode({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        fileRefs: files.split(",").map((f) => f.trim()).filter(Boolean),
        createdBy: { kind: "human", name: "local" },
      });
      onCreated(node.id);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function reset() {
    setTitle("");
    setDescription("");
    setTags("");
    setFiles("");
    setError(null);
    setBusy(false);
  }

  const handleOpenChange = useGracefulClose(() => {
    reset();
    onClose();
  }, isOpen);

  return (
    <Modal.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="w-[36rem] max-w-[90vw]">
          <Modal.Header>
            <Modal.Heading>Record a new node</Modal.Heading>
            <Modal.CloseTrigger />
          </Modal.Header>
          <Modal.Body>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted">
                Capture a question, decision, or any piece of engineering lineage.
              </p>

              <div className="flex flex-wrap gap-2">
                {NODE_TYPES.map((t) => {
                  const c = TYPE_COLORS[t];
                  const active = type === t;
                  return (
                    <Button
                      key={t}
                      size="sm"
                      variant={active ? "secondary" : "outline"}
                      onPress={() => setType(t)}
                      style={active ? { borderColor: c.hex, color: c.hex } : undefined}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.hex }} />
                        {c.label}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <Input
                autoFocus
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={
                  type === "question" ? "Should we migrate to Postgres?"
                  : type === "decision" ? "Use SQLite for v1 storage"
                  : "Title"
                }
                aria-label="Node title"
              />
              <TextArea
                fullWidth
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (Markdown supported) — the why, the trade-offs, the evidence…"
                rows={5}
                aria-label="Node description"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  fullWidth
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  aria-label="Tags"
                />
                <Input
                  fullWidth
                  value={files}
                  onChange={(e) => setFiles(e.target.value)}
                  placeholder="File refs (comma-separated)"
                  aria-label="File refs"
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="ghost"
              onPress={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onPress={submit} isDisabled={!title.trim() || busy}>
              {busy ? "Creating…" : "Create node"}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
