import { z } from 'zod';

const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const domain = z.string().regex(/^[a-z0-9.-]{3,253}$/);
const isoDate = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date')
  .transform((v) => new Date(v));

export const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

export const listQuerySchema = z.object({
  niche: slug.optional(),
  category: slug.optional(),
  source: domain.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().max(512).optional(),
  limit: limitSchema,
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const byDateQuerySchema = z.object({
  niche: slug.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  cursor: z.string().max(512).optional(),
  limit: limitSchema,
});
export type ByDateQuery = z.infer<typeof byDateQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'query must have at least 2 characters').max(200),
  niche: slug.optional(),
  category: slug.optional(),
  source: domain.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sort: z.enum(['relevance', 'latest']).default('relevance'),
  cursor: z.string().max(512).optional(),
  limit: limitSchema,
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  niche: slug.optional(),
});

export const nicheOnlySchema = z.object({ niche: slug.optional() });

export const idParamSchema = z.string().regex(/^\d{1,18}$/, 'invalid id');
export const slugParamSchema = slug;
