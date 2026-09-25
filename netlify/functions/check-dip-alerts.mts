import type { Config } from "@netlify/functions";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../../src/lib/market/yahoo";
import { INDEX_FUNDS, evaluateDip, paramsFor, type DipEvaluation } from "../../src/lib/signals/dip";
import { dueDipAlerts, pruneSentLog, type DipAlert } from "../../src/lib/signals/dip-alerts";
import { parseRules } from "../../src/lib/signals/rules";

interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

interface SettingsRow {
  user_id: string;
  rules: unknown;
  alert_log: Record<string, number> | null;
}

// Push notifications for the "Dip in an uptrend" signal: buy zone near the
// close, time to sell for trades marked as bought, and (optionally) closed in
// a dip. The same rules as the in-app checker (src/lib/signals/dip-alerts.ts).
// Every user with a push subscription is checked; users who never saved My
// rules get the defaults. Sent alerts are remembered per user in
// user_settings.alert_log so each one goes out once.
const checkDipAlerts = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.log("check-dip-alerts: missing required env vars, skipping run");
    return new Response("Not configured", { status: 200 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .returns<PushSubscriptionRow[]>();
  if (subsError) {
    console.error("check-dip-alerts: failed to load subscriptions:", subsError.message);
    return new Response("Failed to load subscriptions", { status: 500 });
  }
  if (!subs || subs.length === 0) return new Response("No subscribers", { status: 200 });

  const userIds = [...new Set(subs.map((s) => s.user_id))];
  const [{ data: settingsRows }, { data: watchRows }] = await Promise.all([
    supabase.from("user_settings").select("user_id, rules, alert_log").in("user_id", userIds).returns<SettingsRow[]>(),
    supabase.from("watchlist").select("user_id, symbol").in("user_id", userIds).returns<{ user_id: string; symbol: string }[]>(),
  ]);
  const settingsByUser = new Map((settingsRows ?? []).map((r) => [r.user_id, r]));

  const plans = userIds
    .map((userId) => {
      const row = settingsByUser.get(userId);
      const rules = parseRules(row?.rules);
      const watchlist = (watchRows ?? []).filter((w) => w.user_id === userId).map((w) => w.symbol.toUpperCase());
      const symbols = [
        ...new Set([
          ...(rules.scanIndexFunds ? INDEX_FUNDS : []),
          ...(rules.scanWatchlist ? watchlist : []),
          ...rules.positions.map((p) => p.symbol),
        ]),
      ];
      return { userId, row, rules, symbols };
    })
    .filter(({ rules }) => rules.alerts.buyZone || rules.alerts.sell || rules.alerts.newDip);

  // One chart fetch per symbol per run, shared across users and fetched in
  // parallel up front (scheduled functions get ~30s). Evaluated per user
  // below, because the dip depth for stocks is a user setting.
  const allSymbols = [...new Set(plans.flatMap((p) => p.symbols))];
  const charts = new Map(
    await Promise.all(
      allSymbols.map(async (symbol) => [symbol, await getChart(symbol, "2y", "1d").catch(() => null)] as const),
    ),
  );

  const now = Date.now();
  let sent = 0;
  for (const { userId, row, rules, symbols } of plans) {
    const due: DipAlert[] = [];
    for (const symbol of symbols) {
      const chart = charts.get(symbol);
      if (!chart) continue;
      const evaluation: DipEvaluation = evaluateDip(
        chart.candles,
        paramsFor(symbol, rules.stockDipDepth),
        chart.meta.marketState === "REGULAR",
      );
      due.push(...dueDipAlerts(symbol, evaluation, rules, now));
    }

    const log = pruneSentLog(row?.alert_log ?? {}, now);
    const fresh = due.filter((a) => !log[a.key]);
    if (fresh.length === 0) continue;

    for (const alert of fresh) {
      const payload = JSON.stringify({ title: alert.title, body: alert.body, tag: alert.key, url: alert.url });
      for (const sub of subs.filter((s) => s.user_id === userId)) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
          sent++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          } else {
            console.error("check-dip-alerts: push send failed:", err instanceof Error ? err.message : err);
          }
        }
      }
      log[alert.key] = now;
    }

    // Record what went out even when the user has no settings row yet (defaults).
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, alert_log: log, ...(row ? {} : { rules: {} }), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) console.error("check-dip-alerts: failed to save alert log:", error.message);
  }

  return new Response(`Checked ${plans.length} user(s), sent ${sent} push notification(s)`, { status: 200 });
};

export default checkDipAlerts;

// Every 10 minutes on weekdays, 13:00-22:59 UTC: covers 3pm-4:15pm New York
// time in both daylight and standard time. The alert rules themselves check
// the New York clock, so extra runs just find nothing due.
export const config: Config = {
  schedule: "*/10 13-22 * * 1-5",
};
