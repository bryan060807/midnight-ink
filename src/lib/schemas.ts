import { z } from 'zod';
import { parseDesign } from './design';

const short = z.string().trim().max(300).default('');
const notes = z.string().trim().max(6000).default('');
export const equipmentSchema = z.object({
  kind: z.enum(['machine', 'cartridge', 'ink']), name: z.string().trim().min(1).max(150),
  manufacturer: short, model: short, machineType: short, stroke: short, power: short,
  brand: short, code: short, configuration: short, purpose: short, expiresAt: short,
  notes, provenance: z.string().max(500).default('User-reported; specifications not independently verified.'),
}).strict();
const score = z.number().int().min(1).max(5);
export const assessmentSchema = z.object({consistency:score,smoothness:score,coverage:score,edgeControl:score,surfaceDamage:score,goals:z.string().max(2000).default('')}).strict();
export const sessionSchema = z.object({exerciseId:z.string().min(1).max(100),durationMinutes:z.number().min(0).max(1440),equipmentIds:z.array(z.string().max(100)).max(30).default([]),machineSettings:short,notes,difficulty:score.default(3),assessment:assessmentSchema.optional()}).strict();
export const designSchema = z.object({name:z.string().trim().min(1).max(150),document:z.unknown().refine(value=>parseDesign(value)!==null,'Unsupported drawing document.').transform(value=>parseDesign(value)!),preview:z.string().max(500_000).optional()}).strict();
export const settingsSchema = z.object({coachName:z.string().trim().min(1).max(40).optional(),goalMinutes:z.number().int().min(5).max(300).optional()}).strict();
export const profileSchema = z.object({name:z.string().trim().min(1).max(80).optional(),level:z.enum(['beginner','intermediate']).optional(),path:z.enum(['foundations','drawing','linework','shading','stencils','professional']).optional()}).strict();
export const goalSchema = z.object({title:z.string().trim().min(1).max(300),notes,completed:z.boolean().default(false)}).strict();
export type EquipmentInput = z.infer<typeof equipmentSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
export type DesignInput = z.infer<typeof designSchema>;
