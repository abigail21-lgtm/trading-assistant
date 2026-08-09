import type { Config } from "@netlify/functions";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { getChart } from "../../src/lib/market/yahoo";
import {
  ALERT_COOLDOWN_MS,
  alertTierLabel,
  buildAlertContext,
  evaluateAlert,
  notificationMessage,
  type AlertRule,
} from "../../src/lib/market/alerts";

interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  rule: AlertRule;
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

// Runs on a schedule (see `config` below) independent of any open browser
// tab -- this is what makes push notifications "true" push, unlike
// AlertsWatcher's in-app polling, which only runs while the app is open and
// is disabled entirely in Supabase mode to avoid double-firing alongside
// this. See README "Push notifications" for the env vars this needs.
const checkAlerts = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.log("check-alerts: missing required env vars, skipping run");
    return new Response("Not configured", { status: 200 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: alertRows, error: alertsError } = await supabase
    .from("alerts")
    .select("id, user_id, symbol, rule")
    .returns<AlertRow[]>();

  if (alertsError) {
    console.error("check-alerts: failed to load alerts:", alertsError.message);
    return new Response("Failed to load alerts", { status: 500 });
  }
  if (!alertRows || alertRows.length === 0) {
    return new Response("No alerts", { status: 200 });
  }

  const now = Date.now();
  const due = alertRows.filter((row) => {
    const firedAt = row.rule.lastFiredAt;
    return !firedAt || now - firedAt >= ALERT_COOLDOWN_MS;
  });
  if (due.length === 0) {
    return new Response("Nothing due", { status: 200 });
  }

  const symbols = [...new Set(due.map((row) => row.symbol))];
  const chartsBySymbol = new Map<string, Awaited<ReturnType<typeof getChart>> | null>();
  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        chartsBySymbol.set(symbol, await getChart(symbol, "1y", "1d"));
      } catch {
        chartsBySymbol.set(symbol, null);
      }
    }),
  );

  let checkedCount = 0;
  let sentCount = 0;

  for (const row of due) {
    const chart = chartsBySymbol.get(row.symbol);
    if (!chart) continue;
    const ctx = buildAlertContext(chart.candles);
    if (!ctx) continue;
    checkedCount++;
    const evaluation = evaluateAlert(row.rule, ctx);
    if (evaluation.tier === "none") continue;

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth_key")
      .eq("user_id", row.user_id)
      .returns<PushSubscriptionRow[]>();

    const payload = JSON.stringify({
      title: `${row.symbol}: ${alertTierLabel(evaluation.tier)}`,
      body: notificationMessage(row.rule, ctx, evaluation),
      tag: row.rule.id,
      url: `/stock/${row.symbol}`,
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } }, payload);
        sentCount++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Push service says this subscription is gone (browser
          // uninstalled, permission revoked, etc.) -- stop trying it.
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("check-alerts: push send failed:", err instanceof Error ? err.message : err);
        }
      }
    }

    await supabase
      .from("alerts")
      .update({ rule: { ...row.rule, lastFiredAt: now } })
      .eq("id", row.id);
  }

  return new Response(`Checked ${checkedCount} alert(s), sent ${sentCount} push notification(s)`, { status: 200 });
};

export default checkAlerts;

export const config: Config = {
  schedule: "*/5 * * * *",
};
