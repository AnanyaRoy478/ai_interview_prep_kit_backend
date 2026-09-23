import { Kit, Question } from "../types";

export function checkCoverage(requirements: Kit["role"]["requirements"], questions: Question[]) {
  const covered = new Set(questions.flatMap(q => q.requirement_ids));
  return requirements
    .filter(r => r.priority === "must" && !covered.has(r.id))
    .map(r => r.id);
}

export function allocateSchedule(kit: Kit, days: number): Kit["schedule"] {
  const questions = [...kit.questions].sort((a, b) => b.difficulty - a.difficulty);
  const dayBuckets = Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    focus: "",
    question_ids: [] as string[],
    minutes: 0
  }));

  // Round-robin after sorting ensures high-difficulty material appears early.
  questions.forEach((q, index) => {
    const dayIndex = Math.min(index, days - 1);
    dayBuckets[dayIndex].question_ids.push(q.id);
    dayBuckets[dayIndex].minutes += q.difficulty * 10;
  });

  const must = new Set(kit.role.requirements.filter(r => r.priority === "must").map(r => r.id));
  const assigned = new Set(dayBuckets.flatMap(d => d.question_ids));

  // Every question is scheduled; empty days still receive a useful focus.
  dayBuckets.forEach((d, i) => {
    const qs = d.question_ids.map(id => kit.questions.find(q => q.id === id)!).filter(Boolean);
    const mustQs = qs.filter(q => q.requirement_ids.some(id => must.has(id)));
    d.focus = mustQs.length
      ? `Must-have coverage: ${mustQs.slice(0, 2).map(q => q.category).join(", ")}`
      : qs.length
        ? `${qs[0].category} practice`
        : i === 0 ? "Core role and company foundations" : "Review and practice";
    d.minutes = Math.max(30, d.minutes || 30);
  });

  // Guard against accidental omissions.
  if (assigned.size !== kit.questions.length) {
    throw new Error("Schedule allocation omitted a question");
  }

  return { days_available: days, days: dayBuckets };
}
