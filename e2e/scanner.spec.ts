import { test, expect } from "@playwright/test";
test("real UI integrates collection, algorithm, chart and filters with controlled market responses", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const interval = 900000,
    end = Math.floor(Date.now() / interval) * interval;
  const c = Array.from({ length: 85 }, (_, i) => [
    String(end - (85 - i) * interval),
    "100",
    "101",
    "99",
    "100",
    "100",
    "10000",
  ]);
  c[55][3] = "95";
  c[60][2] = "104";
  c[70][3] = "94";
  c[70][5] = "200";
  c[71] = [c[71][0], "100", "106", "100", "105", "100", "10000"];
  c[72] = [c[72][0], "104", "106", "102", "105", "100", "10000"];
  c[73] = [c[73][0], "103", "105", "101.5", "104", "100", "10000"];
  await page.route("https://api.bybit.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const result = path.endsWith("instruments-info")
      ? {
          list: [
            {
              symbol: "TESTUSDT",
              status: "Trading",
              contractType: "LinearPerpetual",
              quoteCoin: "USDT",
            },
          ],
        }
      : path.endsWith("tickers")
        ? {
            list: [
              { symbol: "TESTUSDT", lastPrice: "103", turnover24h: "20000000" },
            ],
          }
        : { list: [...c].reverse() };
    await route.fulfill({ json: { retCode: 0, result } });
  });
  await page.goto("/");
  await page.getByLabel("방향").selectOption("LONG");
  await page.getByLabel("최근 유효 단계").selectOption("20");
  await page.getByRole("button", { name: /전체 시장 검색/ }).click();
  await expect(page.locator(".status span").first()).toHaveText(
    "검색 완료 1/1",
  );
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("STAGE 4");
  await page.locator("article .chart").scrollIntoViewIfNeeded();
  await expect(page.locator("article canvas").first()).toBeVisible();
  await page.screenshot({
    path: `/tmp/fast-sweep-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByLabel("방향").selectOption("SHORT");
  await expect(page.locator("article")).toContainText("SHORT");
  await page.getByLabel("최소 점수", { exact: true }).fill("100");
  await expect(page.locator("article")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("API failure remains an error, not an empty successful scan", async ({
  page,
}) => {
  await page.route("https://api.bybit.com/**", (route) =>
    route.fulfill({ status: 403, body: "blocked" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /전체 시장 검색/ }).click();
  await expect(page.getByText("API 연결 실패", { exact: true })).toBeVisible();
  await expect(page.getByText("조건을 충족하는 종목이 없습니다")).toHaveCount(
    0,
  );
});
