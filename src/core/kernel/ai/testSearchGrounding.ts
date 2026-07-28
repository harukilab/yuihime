/**
 * Standalone test for search grounding zero-key fallback.
 * Run with: npx tsx src/core/kernel/ai/testSearchGrounding.ts
 */

import { executeGoogleSearch } from './generateSegment';

async function scrapeHtmlResults(html: string, selectors: { resultBlock: RegExp; title: RegExp; link: RegExp; snippet: RegExp }, maxResults = 5): Promise<any[]> {
  const results: any[] = [];
  let match;
  while ((match = selectors.resultBlock.exec(html)) !== null && results.length < maxResults) {
    const block = match[1];
    const titleMatch = selectors.title.exec(block);
    const linkMatch = selectors.link.exec(block);
    const snippetMatch = selectors.snippet.exec(block);
    
    if (titleMatch && linkMatch) {
      let link = linkMatch[1];
      if (link.includes('uddg=')) {
        const uddgMatch = /uddg=([^&"]+)/.exec(link);
        if (uddgMatch) link = decodeURIComponent(uddgMatch[1]);
      }
      const title = titleMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .trim();
      const snippet = snippetMatch 
        ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
        : `Search result`;
      if (title && link) results.push({ title, snippet, url: link });
    }
  }
  return results;
}

async function testDuckDuckGo(query: string) {
  console.log(`\n[TEST] DuckDuckGo: "${query}"`);
  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    return scrapeHtmlResults(html, {
      resultBlock: /<div class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g,
      title: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
      link: /<a class="result__a"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
      snippet: /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/
    });
  } catch (e: any) {
    console.log(`[TEST] DDG failed: ${e.message}`);
    return [];
  }
}

async function testQwant(query: string) {
  console.log(`\n[TEST] Qwant Lite: "${query}"`);
  try {
    const res = await fetch(`https://lite.qwant.com/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    return scrapeHtmlResults(html, {
      resultBlock: /<li class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
      title: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
      link: /<a class="[^"]*result-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
      snippet: /<p class="[^"]*result-description[^"]*"[^>]*>([\s\S]*?)<\/p>/
    });
  } catch (e: any) {
    console.log(`[TEST] Qwant failed: ${e.message}`);
    return [];
  }
}

async function testYandex(query: string) {
  console.log(`\n[TEST] Yandex: "${query}"`);
  try {
    const res = await fetch(`https://yandex.com/search/?text=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    return scrapeHtmlResults(html, {
      resultBlock: /<li class="[^"]*serp-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g,
      title: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
      link: /<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/,
      snippet: /<div class="[^"]*text-[^"]*"[^>]*>([\s\S]*?)<\/div>/
    });
  } catch (e: any) {
    console.log(`[TEST] Yandex failed: ${e.message}`);
    return [];
  }
}

async function testSearXNG(query: string) {
  console.log(`\n[TEST] SearXNG: "${query}"`);
  const instances = ['https://searx.be', 'https://search.sapti.me'];
  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}/search?q=${encodeURIComponent(query)}&format=json&engines=google,bing,duckduckgo`, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []).slice(0, 5).map((r: any) => ({
          title: r.title || `Result`,
          snippet: r.content || r.description || `Search result`,
          url: r.url || r.link || ''
        }));
        console.log(`[TEST] SearXNG (${instance}) returned ${results.length} results`);
        if (results.length > 0) return results;
      }
    } catch (e: any) {
      console.log(`[TEST] SearXNG (${instance}) failed: ${e.message}`);
    }
  }
  return [];
}

async function testWikipedia(query: string) {
  console.log(`\n[TEST] Wikipedia: "${query}"`);
  const results: any[] = [];
  for (const lang of ['id', 'en']) {
    try {
      const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`, {
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data = await res.json();
        const list = data.query?.search || [];
        console.log(`[TEST] Wikipedia ${lang}: ${list.length} results`);
        for (const item of list.slice(0, 3)) {
          const cleanText = item.snippet.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
          if (cleanText) results.push({
            title: `${item.title} (${lang.toUpperCase()})`,
            snippet: cleanText,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
          });
        }
      }
    } catch (e: any) {
      console.log(`[TEST] Wikipedia ${lang} failed: ${e.message}`);
    }
  }
  return results;
}

async function testRSSFeeds(query: string) {
  console.log(`\n[TEST] RSS Feeds: "${query}"`);
  const results: any[] = [];
  const feeds = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', name: 'BBC World', type: 'rss' as const },
    { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', name: 'NYT Tech', type: 'rss' as const },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera', type: 'rss' as const },
    { url: 'https://feeds.npr.org/1001/rss.xml', name: 'NPR', type: 'rss' as const },
    { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', type: 'atom' as const }
  ];

  for (const feed of feeds) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        const xml = await res.text();
        const feedResults: any[] = [];

        if (feed.type === 'rss') {
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let itemMatch;
          while ((itemMatch = itemRegex.exec(xml)) !== null && feedResults.length < 5) {
            const item = itemMatch[1];
            const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
            const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/.exec(item);
            const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/.exec(item);
            if (titleMatch && linkMatch) {
              const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
              const url = linkMatch[1].replace(/<[^>]*>/g, '').trim();
              const snippet = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : `News from ${feed.name}`;
              if (title && url) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
            }
          }
        } else {
          const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
          let entryMatch;
          while ((entryMatch = entryRegex.exec(xml)) !== null && feedResults.length < 5) {
            const entry = entryMatch[1];
            const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry);
            const linkMatch = /<link[^>]*href="([^"]+)"[^>]*/.exec(entry);
            const summaryMatch = /<summary[^>]*>([\s\S]*?)<\/summary>/.exec(entry);
            if (titleMatch && linkMatch) {
              const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
              const url = linkMatch[1].trim();
              const snippet = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() : `News from ${feed.name}`;
              if (title && url) feedResults.push({ title: `${title} (${feed.name})`, snippet: snippet.slice(0, 200), url });
            }
          }
        }
        results.push(...feedResults);
        console.log(`[TEST] RSS ${feed.name}: ${feedResults.length} results`);
      }
    } catch (e: any) {
      console.log(`[TEST] RSS ${feed.name} failed: ${e.message}`);
    }
  }
  return results;
}

async function testFullExecuteGoogleSearch(query: string) {
  console.log(`\n[TEST] Full executeGoogleSearch: "${query}"`);
  try {
    const results = await executeGoogleSearch(query);
    console.log(`[TEST] executeGoogleSearch returned ${results.length} results`);
    return results;
  } catch (e: any) {
    console.log(`[TEST] executeGoogleSearch failed: ${e.message}`);
    return [];
  }
}

async function main() {
  const query = "berita terkini 2026";
  console.log(`=== Search Grounding Zero-Key Fallback Test ===`);
  console.log(`Query: "${query}"\n`);

  const ddg = await testDuckDuckGo(query);
  const qwant = await testQwant(query);
  const yandex = await testYandex(query);
  const searx = await testSearXNG(query);
  const rss = await testRSSFeeds(query);
  const wiki = await testWikipedia(query);
  const full = await testFullExecuteGoogleSearch(query);

  console.log(`\n=== Results ===`);
  console.log(`DuckDuckGo: ${ddg.length}`);
  ddg.slice(0, 2).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nQwant: ${qwant.length}`);
  qwant.slice(0, 2).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nYandex: ${yandex.length}`);
  yandex.slice(0, 2).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nSearXNG: ${searx.length}`);
  searx.slice(0, 2).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nRSS Feeds: ${rss.length}`);
  rss.slice(0, 5).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nWikipedia: ${wiki.length}`);
  wiki.slice(0, 3).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  console.log(`\nFull executeGoogleSearch: ${full.length}`);
  full.slice(0, 5).forEach((r, i) => console.log(`  ${i+1}. ${r.title} - ${r.url}`));

  const total = ddg.length + qwant.length + yandex.length + searx.length + rss.length + wiki.length;
  console.log(`\nTotal zero-key results across all sources: ${total}`);
  
  if (full.length > 0 || rss.length > 0 || wiki.length > 0) {
    console.log(`\n[PASS] Zero-key search fallback is working!`);
  } else {
    console.log(`\n[FAIL] Zero-key search fallback returned no results.`);
  }
}

main().catch(console.error);
