import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "date-fns";
import {
  seed,
  issue,
  available,
  returnBook,
  overdue,
  day,
  changeDue,
  enter,
  generateNotices,
  demoSmsProvider,
  repository,
} from "../lib/library.ts";
test("полный цикл: выдача → просрочка → уникальное SMS → возврат", async () => {
  const db = seed();
  const r = db.readers[0],
    b = db.books[0];
  const before = available(db, b);
  const yesterday = day(addDays(new Date(), -1));
  issue(
    db,
    r.id,
    b.id,
    day(addDays(new Date(), -8)),
    day(addDays(new Date(), 7)),
    "request-1",
  );
  const loan = db.loans[0];
  assert.equal(available(db, b), before - 1);
  assert.equal(overdue(loan), false);
  assert.throws(
    () => issue(db, r.id, b.id, day(), day(), "request-1"),
    /уже подтверждена/,
  );
  changeDue(db, loan.id, yesterday);
  assert.equal(overdue(loan), true);
  generateNotices(db);
  const notice = db.notices.find((n) => n.loanId === loan.id)!;
  assert.ok(notice);
  assert.match(notice.text, /Срок возврата истёк/);
  const count = db.notices.length;
  generateNotices(db);
  assert.equal(db.notices.length, count);
  const sent = await demoSmsProvider.send(notice);
  assert.equal(sent.status, "sent-demo");
  notice.sent = sent.at;
  returnBook(db, loan.id);
  assert.ok(loan.returned);
  assert.equal(overdue(loan), false);
  assert.equal(available(db, b), before);
  assert.throws(() => returnBook(db, loan.id), /уже возвращена/);
});
test("нулевой остаток, блокировка читателя и проверка дат", () => {
  const db = seed();
  const b = db.books[0];
  b.copies = db.loans.filter((l) => l.bookId === b.id && !l.returned).length;
  assert.equal(available(db, b), 0);
  assert.throws(
    () => issue(db, db.readers[0].id, b.id, day(), day()),
    /Нет доступных/,
  );
  assert.throws(
    () =>
      issue(
        db,
        db.readers[0].id,
        db.books[1].id,
        day(),
        day(addDays(new Date(), -1)),
      ),
    /Проверьте даты/,
  );
  db.readers[0].status = "blocked";
  assert.throws(
    () => issue(db, db.readers[0].id, db.books[1].id, day(), day()),
    /активного читателя/,
  );
});
test("двойной вход запрещён; выход позволяет повторный визит", () => {
  const db = seed();
  const r = db.readers[10];
  enter(db, r.id);
  assert.throws(() => enter(db, r.id), /уже находится/);
  db.visits[0].exited = new Date().toISOString();
  enter(db, r.id);
  assert.equal(
    db.visits.filter((v) => v.readerId === r.id && !v.exited).length,
    1,
  );
});
test("отказ от SMS и завершённые выдачи не генерируют напоминания", () => {
  const db = seed();
  db.notices = [];
  db.readers.forEach((r) => (r.consent = false));
  assert.equal(generateNotices(db), 0);
  db.readers.forEach((r) => (r.consent = true));
  db.loans.forEach((l) => (l.returned = new Date().toISOString()));
  assert.equal(generateNotices(db), 0);
});
test("демо-данные и localStorage сохраняются и сбрасываются", () => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => data.set(key, value),
    },
    configurable: true,
  });
  const db = repository.load();
  assert.equal(db.readers.length, 15);
  assert.equal(db.books.length, 16);
  db.library = "Тестовая библиотека";
  repository.save(db);
  assert.equal(repository.load().library, "Тестовая библиотека");
  assert.equal(repository.reset().library, "Центральная библиотека Ташкента");
});

test("бронирование: пересечения, соседние интервалы, отмена и сохранение", async () => {
  const { bookTable, cancelBooking } = await import("../lib/booking.ts");
  const db = seed();
  const tomorrow = day(addDays(new Date(), 1));
  const input = {
    tableId: "table-1",
    readerId: "reader-0",
    date: tomorrow,
    start: "10:00",
    end: "11:00",
    purpose: "reading" as const,
  };
  const first = bookTable(db, input);
  assert.equal(db.bookings.length, 1);
  assert.throws(
    () =>
      bookTable(db, {
        ...input,
        readerId: "reader-1",
        start: "10:30",
        end: "11:30",
      }),
    /стол уже забронирован/,
  );
  assert.throws(
    () =>
      bookTable(db, {
        ...input,
        readerId: "reader-2",
        start: "09:00",
        end: "12:00",
      }),
    /стол уже забронирован/,
  );
  assert.throws(
    () => bookTable(db, { ...input, tableId: "table-2" }),
    /У читателя уже есть бронь/,
  );
  const adjacent = bookTable(db, {
    ...input,
    readerId: "reader-1",
    start: "11:00",
    end: "12:00",
  });
  assert.ok(adjacent);
  cancelBooking(db, first.id);
  assert.throws(() => cancelBooking(db, first.id), /уже отменена/);
  bookTable(db, { ...input, readerId: "reader-2" });
  repository.save(db);
  const loaded = repository.load();
  assert.equal(loaded.bookings.length, 3);
  assert.ok(loaded.bookings.find((b) => b.id === first.id)?.cancelledAt);
  assert.ok(loaded.events.some((e) => e.type.includes("Бронь стола")));
});
test("бронирование отклоняет прошедшее время, неверные интервалы и заблокированных читателей", async () => {
  const { bookTable } = await import("../lib/booking.ts");
  const db = seed();
  const input = {
    tableId: "table-1",
    readerId: "reader-0",
    date: day(addDays(new Date(), 1)),
    start: "10:00",
    end: "11:00",
    purpose: "study" as const,
  };
  assert.throws(
    () => bookTable(db, { ...input, date: day(addDays(new Date(), -1)) }),
    /прошедшее время/,
  );
  for (const slot of [
    { start: "11:00", end: "10:00" },
    { start: "08:00", end: "10:00" },
    { start: "19:00", end: "21:00" },
    { start: "10:15", end: "11:00" },
  ])
    assert.throws(() => bookTable(db, { ...input, ...slot }));
  assert.throws(() => bookTable(db, { ...input, date: "2026-02-30" }));
  assert.throws(
    () => bookTable(db, { ...input, tableId: "missing" }),
    /Выберите стол/,
  );
  db.readers[0].status = "blocked";
  assert.throws(() => bookTable(db, input), /активного читателя/);
});
test("переход на бронирования сохраняет старые данные браузера", () => {
  const original = seed();
  const { tables, bookings, ...legacy } = original;
  assert.equal(tables.length, 8);
  assert.equal(bookings.length, 0);
  localStorage.setItem("kitobflow-v1", JSON.stringify(legacy));
  const migrated = repository.load();
  assert.equal(migrated.tables.length, 8);
  assert.equal(migrated.bookings.length, 0);
  assert.deepEqual(migrated.readers, original.readers);
  assert.equal(JSON.stringify(migrated.loans), JSON.stringify(original.loans));
  assert.equal(repository.load().tables.length, 8);
});
