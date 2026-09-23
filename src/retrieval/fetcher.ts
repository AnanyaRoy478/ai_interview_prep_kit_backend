import axios from "axios";
import robotsParser from "robots-parser";
import dns from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";

const MAX_BYTES = 1_500_000;

function isPrivateIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
  }
  return ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
}

async function assertSafeUrl(raw: string) {
  const u = new URL(raw);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed");
  const records = await dns.lookup(u.hostname, { all: true });
  if (records.some(r => isPrivateIp(r.address))) throw new Error("Private/loopback destinations are blocked");
  return u;
}

export async function canFetch(raw: string) {
  const u = await assertSafeUrl(raw);
  const robotsUrl = `${u.origin}/robots.txt`;
  try {
    const response = await axios.get(robotsUrl, { timeout: 5000, responseType: "text" });
    const robots = robotsParser(robotsUrl, response.data);
    return robots.isAllowed(raw, "AI-Interview-PrepKit") !== false;
  } catch {
    return true; // unreachable robots.txt does not make the site unusable
  }
}

export async function fetchPage(raw: string) {
  const allowed = await canFetch(raw);
  if (!allowed) throw new Error(`Blocked by robots.txt: ${raw}`);

  const u = await assertSafeUrl(raw);
  const response = await axios.get(u.toString(), {
    timeout: Number(process.env.REQUEST_TIMEOUT_MS || 10000),
    maxContentLength: MAX_BYTES,
    responseType: "text",
    headers: { "User-Agent": "AI-Interview-PrepKit/1.0" },
    validateStatus: s => s >= 200 && s < 400
  });

  const type = String(response.headers["content-type"] || "");
  if (!type.includes("text/html") && !type.includes("text/plain")) {
    throw new Error(`Unsupported content type: ${type}`);
  }

  const $ = cheerio.load(response.data);
  $("script,style,noscript,svg").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 30000);

  const links = $("a[href]").map((_, el) => {
    const href = $(el).attr("href") || "";
    const label = $(el).text().replace(/\s+/g, " ").trim();
    try {
      return { url: new URL(href, u).toString(), label };
    } catch { return null; }
  }).get().filter(Boolean) as {url:string,label:string}[];

  return { url: u.toString(), text, links };
}

export function rankLinks(baseUrl: string, links: {url:string,label:string}[]) {
  const keywords = ["career", "careers", "jobs", "hiring", "interview", "engineering", "handbook", "about", "work with us"];
  return links
    .filter(l => {
      try { return new URL(l.url).origin === new URL(baseUrl).origin; } catch { return false; }
    })
    .map(l => ({
      ...l,
      score: keywords.reduce((n, k) => n + (l.url.toLowerCase().includes(k) || l.label.toLowerCase().includes(k) ? 2 : 0), 0)
    }))
    .sort((a,b) => b.score - a.score);
}
