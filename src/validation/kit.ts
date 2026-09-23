import { z } from "zod";

const requirement = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  kind: z.enum(["technical", "behavioural", "domain"]),
  priority: z.enum(["must", "nice"])
});

const question = z.object({
  id: z.string().min(1),
  requirement_ids: z.array(z.string()),
  category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
  prompt: z.string().min(1),
  answer_outline: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  sourceState: z.enum(["generated", "edited", "pinned"]).optional()
});

export const kitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string().url(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string())
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string())
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(requirement)
  }),
  questions: z.array(question),
  flashcards: z.array(z.object({
    id: z.string().min(1),
    front: z.string().min(1),
    back: z.string().min(1),
    requirement_ids: z.array(z.string()),
    sourceState: z.enum(["generated", "edited", "pinned"]).optional()
  })),
  schedule: z.object({
    days_available: z.number().int().min(1).max(365),
    days: z.array(z.object({
      day: z.number().int().min(1),
      focus: z.string(),
      question_ids: z.array(z.string()),
      minutes: z.number().int().nonnegative()
    }))
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().nonnegative()
  })
});

export function validateKit(input: unknown) {
  return kitSchema.parse(input);
}
