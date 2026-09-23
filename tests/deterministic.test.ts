import { describe, it, expect } from "vitest";
import { checkCoverage, allocateSchedule } from "../src/pipeline/deterministic";

const kit: any = {
  source: { company:"x", company_url:"https://example.com", role:"x", location:"", jd_chars:1, researched_at:"", pages_used:[] },
  company_brief:{summary:"",what_they_do:"",sources:[]},
  role:{title:"x",seniority:"",responsibilities:[],requirements:[
    {id:"r1",text:"React",kind:"technical",priority:"must"},
    {id:"r2",text:"Mentoring",kind:"behavioural",priority:"nice"}
  ]},
  questions:[
    {id:"q1",requirement_ids:["r1"],category:"technical",prompt:"",answer_outline:"",difficulty:3}
  ],
  flashcards:[], schedule:{days_available:2,days:[]}, coverage:{uncovered_requirement_ids:[],passes:1}
};

describe("coverage", () => {
  it("finds uncovered must requirements", () => {
    expect(checkCoverage(kit.role.requirements, kit.questions)).toEqual([]);
  });
});

describe("schedule", () => {
  it("creates exactly the requested number of days", () => {
    const s = allocateSchedule(kit, 4);
    expect(s.days).toHaveLength(4);
    expect(Number.isInteger(s.days[0].minutes)).toBe(true);
  });
});
