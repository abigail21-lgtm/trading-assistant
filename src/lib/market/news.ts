import { BROWSER_HEADERS } from "./http";

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt: number; // unix seconds
  thumbnail: string | null;
}

// Yahoo's keyless search endpoint doubles as a news search — used both for
// a symbol's own news and (with a broad query) general market news.
async function fetchYahooNews(query: string, count: number, revalidateSeconds: number): Promise<NewsItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${count}&quotesCount=0`;
  const res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSeconds } });
  if (!res.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const items: unknown[] = json?.news ?? [];
  return items
    .map((raw): NewsItem | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = raw as any;
      if (!n.title || !n.link) return null;
      return {
        id: n.uuid ?? n.link,
        title: n.title,
        publisher: n.publisher ?? "",
        link: n.link,
        publishedAt: n.providerPublishTime ?? 0,
        thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
      };
    })
    .filter((n): n is NewsItem => n !== null);
}

export async function getStockNews(symbol: string, count = 8): Promise<NewsItem[]> {
  return fetchYahooNews(symbol, count, 900);
}

export async function getMarketNews(count = 8): Promise<NewsItem[]> {
  return fetchYahooNews("stock market", count, 900);
}
