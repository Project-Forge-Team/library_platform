import {
  defaultTables,
  type StudyTable,
  type TableBooking,
} from "./booking.ts";
import { addDays, format, differenceInCalendarDays } from "date-fns";
export type Reader = {
  id: string;
  name: string;
  phone: string;
  registered: string;
  card: string;
  status: "active" | "blocked";
  consent: boolean;
};
export type Book = {
  id: string;
  title: string;
  author: string;
  category: string;
  year: number;
  isbn: string;
  copies: number;
  color: string;
};
export type Loan = {
  id: string;
  readerId: string;
  bookId: string;
  issued: string;
  due: string;
  returned?: string;
  operationId?: string;
};
export type Visit = {
  id: string;
  readerId: string;
  entered: string;
  exited?: string;
};
export type Notice = {
  id: string;
  loanId: string;
  readerId: string;
  bookId: string;
  event: string;
  due: string;
  text: string;
  sent?: string;
};
export type Event = {
  id: string;
  time: string;
  type: string;
  readerId?: string;
  bookId?: string;
  actor: string;
};
export type Database = {
  version: 1;
  readers: Reader[];
  books: Book[];
  loans: Loan[];
  visits: Visit[];
  notices: Notice[];
  events: Event[];
  library: string;
  tables: StudyTable[];
  bookings: TableBooking[];
};
export const day = (date: Date = new Date()) => format(date, "yyyy-MM-dd");
export const uid = () => crypto.randomUUID();
export const overdue = (l: Loan) => !l.returned && l.due < day();
export const available = (db: Database, b: Book) =>
  b.copies - db.loans.filter((l) => l.bookId === b.id && !l.returned).length;
export function log(
  db: Database,
  type: string,
  readerId?: string,
  bookId?: string,
  actor = "Малика Каримова",
) {
  db.events.unshift({
    id: uid(),
    time: new Date().toISOString(),
    type,
    readerId,
    bookId,
    actor,
  });
}
export function issue(
  db: Database,
  readerId: string,
  bookId: string,
  issued: string,
  due: string,
  operationId?: string,
) {
  if (operationId && db.loans.some((l) => l.operationId === operationId))
    throw Error("Эта выдача уже подтверждена");
  const r = db.readers.find((r) => r.id === readerId),
    b = db.books.find((b) => b.id === bookId);
  if (!r || r.status !== "active" || !b)
    throw Error("Выберите активного читателя и книгу");
  if (available(db, b) < 1) throw Error("Нет доступных экземпляров");
  if (!issued || !due || issued > day() || due < issued)
    throw Error("Проверьте даты: срок возврата не может быть раньше выдачи");
  db.loans.unshift({ id: uid(), readerId, bookId, issued, due, operationId });
  log(db, "Выдача книги", readerId, bookId);
}
export function returnBook(db: Database, id: string) {
  const l = db.loans.find((l) => l.id === id);
  if (!l || l.returned) throw Error("Эта книга уже возвращена");
  l.returned = new Date().toISOString();
  log(db, "Возврат книги", l.readerId, l.bookId);
}
export function changeDue(db: Database, id: string, due: string) {
  const l = db.loans.find((l) => l.id === id);
  if (!l || l.returned || !due || due < l.issued)
    throw Error("Срок должен быть не раньше даты выдачи");
  l.due = due;
  log(db, "Изменение срока", l.readerId, l.bookId);
}
export function enter(db: Database, readerId: string) {
  if (!db.readers.some((r) => r.id === readerId && r.status === "active"))
    throw Error("Выберите активного читателя");
  if (db.visits.some((v) => v.readerId === readerId && !v.exited))
    throw Error("Читатель уже находится в библиотеке");
  db.visits.unshift({ id: uid(), readerId, entered: new Date().toISOString() });
  log(db, "Вход в библиотеку", readerId);
}
export function generateNotices(db: Database) {
  let count = 0;
  for (const l of db.loans.filter((l) => !l.returned)) {
    const r = db.readers.find((r) => r.id === l.readerId)!;
    if (!r.consent) continue;
    const days = differenceInCalendarDays(new Date(l.due), new Date());
    const event =
      days < 0
        ? "Просрочка"
        : days === 0
          ? "Возврат сегодня"
          : days <= 3
            ? "За 3 дня"
            : "";
    if (
      !event ||
      db.notices.some(
        (n) => n.loanId === l.id && n.event === event && n.due === l.due,
      )
    )
      continue;
    const b = db.books.find((b) => b.id === l.bookId)!;
    db.notices.unshift({
      id: uid(),
      loanId: l.id,
      readerId: r.id,
      bookId: b.id,
      event,
      due: l.due,
      text: `KitobFlow: Здравствуйте, ${r.name.split(" ")[0]}! ${days < 0 ? "Срок возврата истёк. Пожалуйста, верните" : "Напоминаем, что"} книгу «${b.title}» ${days < 0 ? "в библиотеку." : "необходимо вернуть до " + format(new Date(l.due), "dd.MM.yyyy") + "."} Благодарим вас!`,
    });
    log(db, "Создание SMS", r.id, b.id, "Система");
    count++;
  }
  return count;
}
export interface SmsProvider {
  send(notice: Notice): Promise<{ status: "sent-demo"; at: string }>;
}
export const demoSmsProvider: SmsProvider = {
  async send() {
    return { status: "sent-demo", at: new Date().toISOString() };
  },
};
const names = [
  "Азиз Рахимов",
  "Мадина Юсупова",
  "Сардор Каримов",
  "Нилуфар Абдуллаева",
  "Жавохир Турсунов",
  "Шахноза Алиева",
  "Бехзод Исмоилов",
  "Дилноза Саидова",
  "Тимур Ахмедов",
  "Севинч Умарова",
  "Фаррух Набиев",
  "Зарина Хасанова",
  "Отабек Мирзаев",
  "Малика Рустамова",
  "Акмал Шарипов",
];
const titles = [
  ["Атомные привычки", "Джеймс Клир", "Саморазвитие"],
  ["Минувшие дни", "Абдулла Кадыри", "Художественная литература"],
  ["Маленький принц", "Антуан де Сент-Экзюпери", "Художественная литература"],
  ["Думай медленно… решай быстро", "Даниэль Канеман", "Психология"],
  ["Алхимик", "Пауло Коэльо", "Художественная литература"],
  ["Сила воли", "Келли Макгонигал", "Саморазвитие"],
  ["Хамса", "Алишер Навои", "Поэзия"],
  ["Сапиенс", "Юваль Ной Харари", "История"],
  ["Богатый папа, бедный папа", "Роберт Кийосаки", "Бизнес"],
  ["Сорок правил любви", "Элиф Шафак", "Художественная литература"],
  ["Чистый код", "Роберт Мартин", "Технологии"],
  ["Бобур-наме", "Захириддин Бобур", "История"],
  ["1984", "Джордж Оруэлл", "Художественная литература"],
  ["Психология влияния", "Роберт Чалдини", "Психология"],
  ["Искусство любить", "Эрих Фромм", "Психология"],
  ["Ночь и день", "Чулпан", "Художественная литература"],
];
export function seed(): Database {
  const db: Database = {
    version: 1,
    library: "Центральная библиотека Ташкента",
    readers: names.map((name, i) => ({
      id: "reader-" + i,
      name,
      phone: "+998 00 000 " + String(i).padStart(4, "0"),
      registered: day(addDays(new Date(), -70 + i * 5)),
      card: "KF-" + String(1001 + i),
      status: "active",
      consent: true,
    })),
    books: titles.map(([title, author, category], i) => ({
      id: "book-" + i,
      title,
      author,
      category,
      year: 2015 + (i % 10),
      isbn: "978000000" + String(i).padStart(4, "0"),
      copies: 5 + (i % 5),
      color: ["#cbbba5", "#194f48", "#d3a951", "#477083", "#c0ab91", "#6e665d"][
        i % 6
      ],
    })),
    tables: structuredClone(defaultTables),
    bookings: [],
    loans: [],
    visits: [],
    notices: [],
    events: [],
  };
  for (let i = 0; i < 48; i++) {
    const age =
      i < 32
        ? 1 + ((i * 7 + Math.floor(i / 3)) % 14)
        : i < 36
          ? 8 + (i % 4)
          : i % 8;
    const issued = day(addDays(new Date(), -age));
    const returned =
      i < 32
        ? new Date(addDays(new Date(), -Math.min(age - 1, i % 8))).toISOString()
        : undefined;
    db.loans.push({
      id: "loan-" + i,
      readerId: "reader-" + (i % 15),
      bookId: "book-" + (i % 16),
      issued,
      due: day(addDays(new Date(), i < 36 ? -4 + (i % 3) : i % 7)),
      returned,
    });
    db.events.unshift({
      id: "event-" + i,
      time: returned || new Date(addDays(new Date(), -age)).toISOString(),
      type: returned ? "Возврат книги" : "Выдача книги",
      readerId: "reader-" + (i % 15),
      bookId: "book-" + (i % 16),
      actor: "Малика Каримова",
    });
  }
  for (let i = 0; i < 29; i++)
    db.visits.push({
      id: "visit-" + i,
      readerId: "reader-" + (i % 15),
      entered: new Date(addDays(new Date(), -Math.floor(i / 8))).toISOString(),
      exited:
        i < 4
          ? undefined
          : new Date(addDays(new Date(), -Math.floor(i / 8))).toISOString(),
    });
  const existingEvents = new Set(db.events.map((e) => e.id));
  generateNotices(db);
  for (const e of db.events)
    if (!existingEvents.has(e.id))
      e.time = new Date(Date.now() - 3600000).toISOString();
  for (const notice of db.notices.slice(-2)) {
    notice.sent = new Date(Date.now() - 1800000).toISOString();
    db.events.push({
      id: uid(),
      time: notice.sent,
      type: "Отправка SMS (демо)",
      readerId: notice.readerId,
      bookId: notice.bookId,
      actor: "Система",
    });
  }
  db.events.sort((a, b) => b.time.localeCompare(a.time));
  return db;
}
export interface Repository {
  load(): Database;
  save(db: Database): void;
  reset(): Database;
}
export const repository: Repository = {
  load() {
    const raw = localStorage.getItem("kitobflow-v1");
    if (raw) {
      const data = JSON.parse(raw) as Database;
      if (
        data.version !== 1 ||
        !Array.isArray(data.readers) ||
        !Array.isArray(data.books) ||
        !Array.isArray(data.loans)
      )
        throw Error("Некорректные данные хранилища");
      // Add the booking feature without replacing existing readers or loans.
      const needsMigration =
        !Array.isArray(data.tables) || !Array.isArray(data.bookings);
      if (!Array.isArray(data.tables))
        data.tables = structuredClone(defaultTables);
      if (!Array.isArray(data.bookings)) data.bookings = [];
      if (needsMigration) this.save(data);
      return data;
    }
    const db = seed();
    this.save(db);
    return db;
  },
  save(db) {
    localStorage.setItem("kitobflow-v1", JSON.stringify(db));
  },
  reset() {
    const db = seed();
    this.save(db);
    return db;
  },
};
