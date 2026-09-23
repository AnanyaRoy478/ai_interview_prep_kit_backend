import axios from "axios";
import { Kit } from "../types";

export interface GenerationContext {
  jd: string;
  companyUrl: string;
  companyName: string;
  pages: { url: string; text: string }[];
  discussions: { title: string; url: string; snippet: string }[];
}

export interface LLMProvider {
  generateKit(ctx: GenerationContext): Promise<Kit>;
  generateGapQuestions(ctx: GenerationContext, kit: Kit, uncoveredIds: string[]): Promise<Kit["questions"]>;
}

function cleanJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM did not return JSON");
  return JSON.parse(match[0]);
}

class MockProvider implements LLMProvider {
  async generateKit(ctx: GenerationContext): Promise<Kit> {
    const role = /(?:looking for|seeking|hiring)\s+(?:a|an)?\s*([^\n.]+)/i.exec(ctx.jd)?.[1]?.trim() || "Interview Candidate";
    const requirements = extractRequirements(ctx.jd);
    const questions = requirements.map((r, i) => ({
      id: `q${i+1}`,
      requirement_ids: [r.id],
      category: r.kind === "behavioural" ? "behavioural" as const : "technical" as const,
      prompt: r.kind === "behavioural" ? `Tell me about a time you demonstrated: ${r.text}` : `How would you demonstrate strong capability with: ${r.text}?`,
      answer_outline: "Use a concrete example, explain the trade-offs, and connect the answer to the requirement.",
      difficulty: r.priority === "must" ? 3 as const : 2 as const
    }));
    const flashcards = requirements.map((r, i) => ({
      id: `f${i+1}`, front: r.text, back: "Prepare one concise example, metric or explanation.", requirement_ids: [r.id]
    }));
    return {
      source: {
        company: ctx.companyName, company_url: ctx.companyUrl, role, location: "",
        jd_chars: ctx.jd.length, researched_at: new Date().toISOString(),
        pages_used: ctx.pages.map(p => p.url)
      },
      company_brief: {
        summary: ctx.pages[0]?.text.slice(0, 500) || "Limited public company information was retrieved.",
        what_they_do: ctx.pages[0]?.text.slice(0, 800) || "Insufficient retrieved information.",
        sources: ctx.pages.map(p => p.url)
      },
      role: { title: role, seniority: role.toLowerCase().includes("senior") ? "senior" : "unspecified", responsibilities: [], requirements },
      questions, flashcards,
      schedule: { days_available: 1, days: [] },
      coverage: { uncovered_requirement_ids: [], passes: 1 }
    };
  }

  async generateGapQuestions(_ctx: GenerationContext, kit: Kit, ids: string[]) {
    return ids.map((id, i) => {
      const r = kit.role.requirements.find(x => x.id === id)!;
      return {
        id: `q-gap-${Date.now()}-${i}`,
        requirement_ids: [r.id],
        category: r.kind === "behavioural" ? "behavioural" as const : "technical" as const,
        prompt: `Give a concrete example or explanation demonstrating: ${r.text}`,
        answer_outline: "State the approach, evidence, trade-offs and outcome.",
        difficulty: r.priority === "must" ? 3 as const : 2 as const
      };
    });
  }
}

class GeminiProvider implements LLMProvider {
  private key = process.env.GEMINI_API_KEY!;
  private model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  private async ask(prompt: string) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.key}`;
    const { data } = await axios.post(url, {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    }, { timeout: 60000 });
    return data.candidates?.[0]?.content?.parts?.map((p:any) => p.text || "").join("") || "";
  }

  async generateKit(ctx: GenerationContext) {
    const prompt = `You are a structured interview-prep analyst. Return ONLY JSON matching the required kit schema.
Do not invent requirements. Use only the supplied job description and retrieved evidence. Mark wording that is explicitly required as must and bonus/nice wording as nice.
JOB DESCRIPTION:
${ctx.jd}
COMPANY URL: ${ctx.companyUrl}
RETRIEVED PAGES:
${ctx.pages.map(p => `URL: ${p.url}\nTEXT: ${p.text.slice(0,12000)}`).join("\n---\n")}
PUBLIC DISCUSSION:
${ctx.discussions.map(d => `${d.title}\n${d.url}\n${d.snippet}`).join("\n---\n")}

Required top-level fields: source, company_brief, role, questions, flashcards, schedule, coverage.
Every question must reference one or more existing requirement ids. Difficulty must be 1, 2, or 3.`;
    return JSON.parse(await this.ask(prompt)) as Kit;
  }

  async generateGapQuestions(ctx: GenerationContext, kit: Kit, ids: string[]) {
    const reqs = kit.role.requirements.filter(r => ids.includes(r.id));
    const prompt = `Return ONLY a JSON array of question objects for these uncovered must-have requirements.
JOB DESCRIPTION: ${ctx.jd}
REQUIREMENTS: ${JSON.stringify(reqs)}
Each question must reference requirement ids and have category, prompt, answer_outline, difficulty.`;
    return JSON.parse(await this.ask(prompt)) as Kit["questions"];
  }
}

function extractRequirements(jd: string) {
  const lines = jd.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const technicalHints = ["react", "node", "typescript", "javascript", "python", "java", "sql", "mongodb", "aws", "api", "system design", "docker", "kubernetes", "testing"];
  const behaviouralHints = ["mentor", "lead", "communicate", "collaborate", "stakeholder", "ownership", "leadership"];
  const candidates = lines.filter(x => x.length > 12 && (technicalHints.some(k => x.toLowerCase().includes(k)) || behaviouralHints.some(k => x.toLowerCase().includes(k)) || /years?\b|experience\b|required\b|must\b/i.test(x)));
  return candidates.slice(0, 15).map((text, i) => ({
    id: `r${i+1}`,
    text: text.replace(/^[-•*]\s*/, ""),
    kind: behaviouralHints.some(k => text.toLowerCase().includes(k)) ? "behavioural" as const : technicalHints.some(k => text.toLowerCase().includes(k)) ? "technical" as const : "domain" as const,
    priority: /nice|bonus|preferred|plus/i.test(text) ? "nice" as const : "must" as const
  }));
}

export function provider(): LLMProvider {
  return process.env.LLM_PROVIDER === "gemini" && process.env.GEMINI_API_KEY ? new GeminiProvider() : new MockProvider();
}
