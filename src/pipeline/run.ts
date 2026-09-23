import { fetchPage, rankLinks } from "../retrieval/fetcher";
import { searchPublicDiscussion } from "../retrieval/discussion";
import { provider } from "../generation/provider";
import { allocateSchedule, checkCoverage } from "./deterministic";
import { validateKit } from "../validation/kit";
import { CaseInput, Kit } from "../types";

export async function runPipeline(input: CaseInput, progress?: (stage: string) => void): Promise<Kit> {
  progress?.("fetching_company");
  const homepage = await fetchPage(input.company_url);
  const ranked = rankLinks(homepage.url, homepage.links).slice(0, Number(process.env.RESEARCH_MAX_PAGES || 8));

  progress?.("crawling_company");
  const pages = [{ url: homepage.url, text: homepage.text }];
  for (const link of ranked) {
    try {
      const p = await fetchPage(link.url);
      pages.push({ url: p.url, text: p.text });
    } catch {
      // Individual research failures are recorded by omission; the run continues.
    }
  }

  progress?.("searching_discussion");
  const companyName = new URL(input.company_url).hostname.replace(/^www\./, "");
  const discussions = await searchPublicDiscussion(companyName);

  progress?.("extracting_and_generating");
  const llm = provider();
  let kit = await llm.generateKit({
    jd: input.jd, companyUrl: input.company_url, companyName, pages, discussions
  });

  validateKit(kit);

  progress?.("coverage_check");
  let uncovered = checkCoverage(kit.role.requirements, kit.questions);
  let passes = 1;

  // Deterministic gap detection; only the missing questions are generated on pass 2.
  while (uncovered.length && passes < 3) {
    passes++;
    progress?.(`coverage_pass_${passes}`);
    const gaps = await llm.generateGapQuestions(
      { jd: input.jd, companyUrl: input.company_url, companyName, pages, discussions },
      kit,
      uncovered
    );
    kit.questions.push(...gaps);
    uncovered = checkCoverage(kit.role.requirements, kit.questions);
  }

  kit.coverage = { uncovered_requirement_ids: uncovered, passes };
  kit.schedule = allocateSchedule(kit, input.days);
  kit.source.jd_chars = input.jd.length;
  kit.source.company_url = input.company_url;
  kit.source.researched_at = new Date().toISOString();

  validateKit(kit);
  return kit;
}
