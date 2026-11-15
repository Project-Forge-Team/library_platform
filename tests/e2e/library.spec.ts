import { test, expect } from "@playwright/test";
test("регистрация → QR → выдача → просрочка → SMS → возврат → перезагрузка", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Обзор библиотеки" }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/artifacts/dashboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Добавить читателя", exact: true })
    .click();
  await page.getByLabel("ФИО читателя").fill("Тестовый Читатель");
  await page.getByLabel("Телефон", { exact: true }).fill("+998 00 000 00 99");
  await page
    .getByRole("button", { name: "Зарегистрировать читателя", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog
      .getByRole("heading", { name: "Тестовый Читатель", exact: true })
      .first(),
  ).toBeVisible();
  await expect(dialog.locator(".qr-code svg")).toBeVisible();
  const initial = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("kitobflow-v1")!);
    return { readers: db.readers.length, loans: db.loans.length };
  });
  expect(initial.readers).toBe(16);
  await dialog
    .getByRole("button", { name: "Выдать книгу", exact: true })
    .click();
  await expect(
    dialog.getByRole("combobox", { name: "Читатель", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator(".fixed-selection")).toContainText(
    "Тестовый Читатель",
  );
  await dialog.getByLabel("Доступные книги").selectOption("book-0");
  await dialog.getByRole("button", { name: "Подтвердить выдачу" }).click();
  await expect(dialog).not.toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Выдача и возврат" })
    .click();
  const row = page.locator("tbody tr").filter({ hasText: "Тестовый Читатель" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("На руках");
  await row.getByRole("button", { name: "Изменить срок" }).click();
  await dialog
    .getByRole("button", { name: "Сделать просроченной (демо)" })
    .click();
  await expect(row).toContainText("1 дн. просрочки");
  await page.reload();
  await page.locator("nav summary").click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Уведомления" })
    .click();
  await page.getByRole("button", { name: "Проверить сроки сейчас" }).click();
  await page
    .getByRole("textbox", { name: "Поиск", exact: true })
    .fill("Тестовый Читатель");
  const notice = page.locator(".notice-card");
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText("Просрочка");
  await notice.getByRole("button", { name: "Симулировать отправку" }).click();
  await expect(notice).toContainText("Отправлено (демо)");
  await page.getByRole("button", { name: "Проверить сроки сейчас" }).click();
  await expect(notice).toHaveCount(1);
  await page
    .locator("nav")
    .getByRole("button", { name: "История операций" })
    .click();
  await page
    .getByRole("textbox", { name: "Поиск", exact: true })
    .fill("Тестовый Читатель");
  await expect(page.locator("tbody")).toContainText("Отправка SMS (демо)");
  await page
    .locator("nav")
    .getByRole("button", { name: "Выдача и возврат" })
    .click();
  await row.getByRole("button", { name: "Принять возврат" }).click();
  await dialog.getByRole("button", { name: "Подтвердить возврат" }).click();
  await expect(row).toContainText("Возвращена");
  await page.reload();
  const persisted = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("kitobflow-v1")!);
    const r = db.readers.find(
      (r: { name: string }) => r.name === "Тестовый Читатель",
    );
    return {
      readers: db.readers.length,
      loan: db.loans.find((l: { readerId: string }) => l.readerId === r.id),
      sent: db.notices.find((n: { readerId: string }) => n.readerId === r.id)
        .sent,
    };
  });
  expect(persisted.readers).toBe(16);
  expect(persisted.loan.returned).toBeTruthy();
  expect(persisted.sent).toBeTruthy();
  expect(errors).toEqual([]);
});
test("посещения, каталог, настройки и мобильная навигация", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("nav summary").click();
  await page.locator("nav").getByRole("button", { name: "Посещения" }).click();
  await page.getByLabel("Читатель для входа").selectOption("reader-10");
  await page
    .getByRole("button", { name: "Отметить вход", exact: true })
    .click();
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Фаррух Набиев" })
    .filter({ has: page.getByRole("button", { name: "Отметить выход" }) });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Отметить выход" }).click();
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Фаррух Набиев" })
      .filter({ has: page.getByRole("button", { name: "Отметить выход" }) }),
  ).toHaveCount(0);
  await page
    .locator("nav")
    .getByRole("button", { name: "Каталог книг" })
    .click();
  await expect(page.locator(".book-card")).toHaveCount(16);
  await page
    .getByRole("textbox", { name: "Поиск", exact: true })
    .fill("Атомные");
  await expect(page.locator(".book-card")).toHaveCount(1);
  await page.locator(".cover-scene").click();
  await expect(page.getByRole("dialog")).toContainText("История выдачи");
  await page.getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Настройки", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Настройки", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Название библиотеки").fill("Тестовая библиотека");
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(page.locator(".library-name")).toContainText(
    "Тестовая библиотека",
  );
  await page
    .getByRole("button", { name: "Сбросить демо", exact: true })
    .click();
  await page.getByRole("button", { name: "Да, сбросить демо" }).click();
  await expect(page.locator(".library-name")).toContainText(
    "Центральная библиотека Ташкента",
  );
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Обзор библиотеки" })
    .click();
  await page.screenshot({ path: "tests/artifacts/mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("выдача из книги сохраняет выбранную книгу без повторного выбора", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("nav")
    .getByRole("button", { name: "Каталог книг" })
    .click();
  await page
    .getByRole("textbox", { name: "Поиск", exact: true })
    .fill("Атомные привычки");
  await page.locator(".cover-scene").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Выдать книгу", exact: true })
    .click();
  await expect(dialog.locator(".fixed-selection")).toContainText(
    "Атомные привычки",
  );
  await expect(
    dialog.getByRole("combobox", { name: "Доступные книги" }),
  ).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Читатель", exact: true })
    .selectOption("reader-0");
  await dialog.getByRole("button", { name: "Подтвердить выдачу" }).click();
  await expect(dialog).not.toBeVisible();
  const issued = await page.evaluate(
    () => JSON.parse(localStorage.getItem("kitobflow-v1")!).loans[0],
  );
  expect(issued.bookId).toBe("book-0");
  expect(issued.readerId).toBe("reader-0");
});
