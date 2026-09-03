import { z } from "zod";
import { EDGE_TYPES, NODE_STATUSES, NODE_TYPES } from "./types.js";

export const actorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("human"),
    name: z.string().min(1),
  }),
  z.object({
    kind: z.literal("agent"),
    name: z.string().min(1),
    model: z.string().min(1).optional(),
  }),
]);

export const nodeTypeSchema = z.enum(NODE_TYPES);
export const nodeStatusSchema = z.enum(NODE_STATUSES);
export const edgeTypeSchema = z.enum(EDGE_TYPES);

export const lineageNodeSchema = z.object({
  id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected a ULID"),
  type: nodeTypeSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(50_000).optional(),
  status: nodeStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  createdBy: actorSchema,
  tags: z.array(z.string().min(1)).optional(),
  fileRefs: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const lineageEdgeSchema = z.object({
  id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "expected a ULID"),
  from: z.string().min(1),
  to: z.string().min(1),
  type: edgeTypeSchema,
  note: z.string().max(2000).optional(),
  createdAt: z.string().datetime({ offset: true }),
  createdBy: actorSchema,
});

export const projectMetaSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  repository: z.string().min(1).optional(),
  createdAt: z.string().datetime({ offset: true }),
});

export const nodeInputSchema = z.object({
  type: nodeTypeSchema,
  title: z.string().min(1).max(300),
  description: z.string().max(50_000).optional(),
  status: nodeStatusSchema.optional(),
  tags: z.array(z.string().min(1)).optional(),
  fileRefs: z.array(z.string().min(1)).optional(),
  metadata: z.record(z.unknown()).optional(),
  createdBy: actorSchema.optional(),
});

export const nodePatchSchema = z
  .object({
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(50_000).nullable().optional(),
    status: nodeStatusSchema.optional(),
    tags: z.array(z.string().min(1)).nullable().optional(),
    fileRefs: z.array(z.string().min(1)).nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .strict();

export const edgeInputSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: edgeTypeSchema,
  note: z.string().max(2000).optional(),
  createdBy: actorSchema.optional(),
});

export type NodeInput = z.infer<typeof nodeInputSchema>;
export type NodePatch = z.infer<typeof nodePatchSchema>;
export type EdgeInput = z.infer<typeof edgeInputSchema>;
