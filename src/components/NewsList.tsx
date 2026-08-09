import type { NewsItem } from "@/lib/market/news";
import { formatRelativeTime } from "@/lib/format";

export default function NewsList({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No recent news.</p>;
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-900"
          >
            {item.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.thumbnail}
                alt=""
                className="h-14 w-14 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {item.publisher}
                {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ""}
              </p>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
