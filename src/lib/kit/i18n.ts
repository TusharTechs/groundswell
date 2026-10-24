// The few fixed words on posters and launch pages, in each city's language.
// Copy itself is written by the Creative Director; these are the labels around it.

export type Lang = "en" | "es" | "ja";

export const langOf = (language: string | undefined): Lang => (language === "Spanish" ? "es" : language === "Japanese" ? "ja" : "en");

const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-MX", ja: "ja-JP" };

export const LABELS: Record<
  Lang,
  { fans: (comps: string) => string; flyers: (place: string) => string; scan: string; when: string; where: string; maps: string; tickets: string; findAt: string; allAges: string; noTickets: string }
> = {
  en: {
    fans: (c) => `For fans of ${c}`,
    flyers: (p) => `Flyers and details at ${p}`,
    scan: "Scan for details",
    when: "When",
    where: "Where",
    maps: "Open in maps",
    tickets: "Get tickets",
    findAt: "Find flyers and details at",
    allAges: "All ages",
    noTickets: "The organiser hasn't added a ticket link yet.",
  },
  es: {
    fans: (c) => `Para fans de ${c}`,
    flyers: (p) => `Flyers y detalles en ${p}`,
    scan: "Escanea para más detalles",
    when: "Cuándo",
    where: "Dónde",
    maps: "Abrir en el mapa",
    tickets: "Consigue tu entrada",
    findAt: "Flyers y detalles en",
    allAges: "Para todas las edades",
    noTickets: "Las entradas todavía no están a la venta.",
  },
  ja: {
    fans: (c) => `${c}が好きな人へ`,
    flyers: (p) => `フライヤーと詳細：${p}`,
    scan: "スキャンして詳細をチェック",
    when: "日時",
    where: "場所",
    maps: "地図で開く",
    tickets: "チケットを購入",
    findAt: "フライヤーと詳細はこちら",
    allAges: "全年齢対象",
    noTickets: "チケット情報は近日公開予定です。",
  },
};

/** Launch day (or a day before it) as people in the city would write it. */
export function localDate(launchDate: string, lang: Lang, daysBefore = 0): string {
  const d = new Date(new Date(`${launchDate}T12:00:00Z`).getTime() - daysBefore * 86_400_000);
  return d.toLocaleDateString(LOCALE[lang], { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}
