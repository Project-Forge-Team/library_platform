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
