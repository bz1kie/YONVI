import {z} from 'zod';
export const conditionSchema=z.enum(['new','excellent','good','used','repair']).nullable().optional();
const value=z.string().trim().max(160);
export const attributesSchema=z.object({manufacturer:value.optional(),model:value.optional(),memory:value.optional(),color:value.optional(),part_number:value.optional(),compatibility:value.optional(),defects:z.string().trim().max(500).optional()}).strict();
