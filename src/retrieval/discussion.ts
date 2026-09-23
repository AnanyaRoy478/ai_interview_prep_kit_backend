import axios from "axios";
import * as cheerio from "cheerio";

export async function searchPublicDiscussion(company: string) {
  const q = encodeURIComponent(`"${company}" interview process engineering interview`);
  const url = `https://html.duckduckgo.com/html/?q=${q}`;
  try {
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { "User-Agent": "AI-Interview-PrepKit/1.0" }
    });
    const $ = cheerio.load(data);
    return $(".result").slice(0, 5).map((_, el) => ({
      title: $(el).find(".result__title").text().trim(),
      url: $(el).find("a.result__url").attr("href") || $(el).find("a").attr("href") || "",
      snippet: $(el).find(".result__snippet").text().trim()
    })).get();
  } catch {
    return [];
  }
}
