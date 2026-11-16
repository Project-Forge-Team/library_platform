"use client";
import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  Armchair,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  DoorOpen,
  Download,
  HelpCircle,
  History,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
  RotateCcw,
  Send,
  CheckCircle2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { ru as dateRu } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  ReaderForm,
  BookForm,
  LoanForm,
  type ReaderInput,
  type BookInput,
} from "@/components/forms";
import {
  type Database,
  type Reader,
  type Book,
  type Loan,
  repository,
  day,
  uid,
  overdue,
  available,
  log,
  issue,
  returnBook,
  changeDue,
  enter,
  generateNotices,
  demoSmsProvider,
} from "@/lib/library";
import { TableBookings } from "@/components/table-bookings";
import { bookTable, cancelBooking } from "@/lib/booking";
import { ru, type Section } from "@/lib/i18n";
const icons = {
  dashboard: LayoutDashboard,
  readers: Users,
  books: BookOpen,
  loans: ArrowLeftRight,
  tables: Armchair,
  visits: DoorOpen,
  notices: MessageSquare,
  history: History,
  settings: Settings,
};
type Modal =
  | { type: "reader"; reader?: Reader }
  | { type: "book"; book?: Book }
  | { type: "loan"; readerId?: string; bookId?: string }
  | { type: "profile"; reader: Reader }
  | { type: "bookDetail"; book: Book }
  | { type: "due"; loan: Loan }
  | { type: "return"; loan: Loan }
  | { type: "reset" }
  | { type: "help" }
  | null;
const initials = (s: string) =>
  s
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
const date = (s: string) =>
  format(new Date(s), "dd MMM yyyy", { locale: dateRu });
const shortDate = (s: string) =>
  format(new Date(s), "dd MMM", { locale: dateRu });
function Badge({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function Empty({ text = "Пока ничего нет" }: { text?: string }) {
  return (
    <div className="empty">
      <BookOpen size={28} />
      <b>{text}</b>
      <span>Новые записи появятся здесь автоматически</span>
    </div>
  );
}
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={"avatar " + (small ? "avatar-sm" : "")}>
      {initials(name)}
    </span>
  );
}
export default function Home() {
  const [db, setDb] = useState<Database | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Все");
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [due, setDue] = useState("");
  const [visitReader, setVisitReader] = useState("");
  const [storageError, setStorageError] = useState("");
  const [sending, setSending] = useState(false);
  const [hydrationError, setHydrationError] = useState("");
  const live = useRef<Database | null>(null);
  const locked = useRef(false);
  useEffect(() => {
    try {
      const data = repository.load();
      live.current = data;
      setDb(data);
    } catch {
      setHydrationError(
        "Не удалось прочитать локальные данные. Вы можете восстановить демонстрационные данные.",
      );
    }
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(s: Section) {
    setSection(s);
    setQuery("");
    setFilter("Все");
    setSidebar(false);
  }
  function mutate(fn: (d: Database) => void, success: string, close = true) {
    if (!live.current || locked.current) return false;
    locked.current = true;
    try {
      const next = structuredClone(live.current);
      fn(next);
      repository.save(next);
      live.current = next;
      setDb(next);
      setStorageError("");
      setToast(success);
      if (close) setModal(null);
      return true;
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : "Не удалось сохранить изменения",
      );
      setStorageError(
        e instanceof DOMException
          ? "Хранилище браузера недоступно. Изменения не сохранены."
          : "",
      );
      return false;
    } finally {
      locked.current = false;
    }
  }
  function saveReader(v: ReaderInput) {
    mutate((d) => {
      if (modal?.type === "reader" && modal.reader) {
        Object.assign(
          d.readers.find((r) => r.id === modal.reader!.id)!,
          v,
        );
        log(d, "Изменение читателя", modal.reader.id);
      } else {
        const r = {
          ...v,
          id: uid(),
          registered: day(),
          card:
            "KF-" +
            String(
              Math.max(
                1000,
                ...d.readers.map((r) => Number(r.card.slice(3)) || 1000),
              ) + 1,
            ),
        };
        d.readers.unshift(r);
        log(d, "Регистрация читателя", r.id);
        setTimeout(() => setModal({ type: "profile", reader: r }), 0);
      }
    }, "Читатель сохранён");
  }
  function saveBook(v: BookInput) {
    mutate((d) => {
      if (modal?.type === "book" && modal.book) {
        const b = d.books.find((b) => b.id === modal.book!.id)!;
        const borrowed = b.copies - available(d, b);
        if (v.copies < borrowed)
          throw Error(
            `На руках ${borrowed} экз. Укажите не меньше этого количества`,
          );
        Object.assign(b, v);
        log(d, "Изменение книги", undefined, b.id);
      } else {
        const b = { ...v, id: uid(), color: "#45665a" };
        d.books.unshift(b);
        log(d, "Добавление книги", undefined, b.id);
      }
    }, "Книга сохранена");
  }
  if (!db)
    return (
      <div className="loading-screen">
        <div className="logo-mark">
          <BookOpen />
        </div>
        <h2>
          Kitob<span>Flow</span>
        </h2>
        {hydrationError ? (
          <>
            <p>{hydrationError}</p>
            <Button
              onClick={() => {
                try {
                  const d = repository.reset();
                  live.current = d;
                  setDb(d);
                } catch {
                  setHydrationError(
                    "Разрешите локальное хранилище в настройках браузера.",
                  );
                }
              }}
            >
              Восстановить демо
            </Button>
          </>
        ) : (
          <div className="skeleton" />
        )}
      </div>
    );
  const reader = (id: string) => db.readers.find((r) => r.id === id)!;
  const book = (id: string) => db.books.find((b) => b.id === id)!;
  const active = db.loans.filter((l) => !l.returned);
  const late = active.filter(overdue);
  const dueLoans = [...active].sort((a, b) => a.due.localeCompare(b.due));
  const todayVisits = db.visits.filter(
    (v) => day(new Date(v.entered)) === day(),
  );
  const inside = db.visits.filter((v) => !v.exited);
  const pending = db.notices.filter(
    (n) => !n.sent && active.some((l) => l.id === n.loanId),
  );
  const matches = (...values: string[]) =>
    values.join(" ").toLowerCase().includes(query.toLowerCase());
  const filteredNotices = db.notices.filter(
    (n) =>
      matches(reader(n.readerId).name, book(n.bookId).title, n.text) &&
      (filter === "Все" ||
        (filter === "Отправлено (демо)" && n.sent) ||
        (filter === "Ожидает отправки" && !n.sent) ||
        (filter === "Просрочка" && n.event === "Просрочка")),
  );
  const filteredVisits = db.visits.filter(
    (v) =>
      matches(reader(v.readerId).name, reader(v.readerId).card) &&
      (filter === "Все" ||
        (filter === "Сегодня" && day(new Date(v.entered)) === day()) ||
        (filter === "Сейчас в библиотеке" && !v.exited)),
  );
  const filteredEvents = db.events.filter(
    (e) =>
      matches(
        e.type,
        e.readerId ? reader(e.readerId).name : "",
        e.bookId ? book(e.bookId).title : "",
        e.actor,
      ) &&
      (filter === "Все" || e.type === filter),
  );
  const loanRows = (rows: Loan[], compact = false) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Книга / читатель</th>
            <th>{compact ? "Срок возврата" : "Дата выдачи"}</th>
            {!compact && <th>Срок возврата</th>}
            <th>Статус</th>
            <th aria-label="Действия" />
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              <td>
                <div className="book-cell">
                  <span
                    className="mini-cover"
                    style={{ background: book(l.bookId).color }}
                  >
                    <BookOpen size={15} />
                  </span>
                  <div>
                    <button
                      className="text-button book-title"
                      onClick={() =>
                        setModal({ type: "bookDetail", book: book(l.bookId) })
                      }
                    >
                      {book(l.bookId).title}
                    </button>
                    <button
                      className="text-button muted sub"
                      onClick={() =>
                        setModal({
                          type: "profile",
                          reader: reader(l.readerId),
                        })
                      }
                    >
                      {reader(l.readerId).name}
                    </button>
                  </div>
                </div>
              </td>
              <td>{shortDate(compact ? l.due : l.issued)}</td>
              {!compact && <td>{date(l.due)}</td>}
              <td>
                <Badge
                  tone={l.returned ? "gray" : overdue(l) ? "red" : "green"}
                >
                  {l.returned
                    ? "Возвращена"
                    : overdue(l)
                      ? `${differenceInCalendarDays(new Date(), new Date(l.due))} дн. просрочки`
                      : "На руках"}
                </Badge>
              </td>
              <td>
                {!l.returned && (
                  <div className="row-actions">
                    <button
                      title="Изменить срок"
                      className="icon-btn"
                      onClick={() => {
                        setDue(l.due);
                        setModal({ type: "due", loan: l });
                      }}
                    >
                      <CalendarDays size={16} />
                    </button>
                    <button
                      title="Принять возврат"
                      className="icon-btn"
                      onClick={() => setModal({ type: "return", loan: l })}
                    >
                      <ArrowDownLeft size={17} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty text="Выдач не найдено" />}
    </div>
  );
  return (
    <div className="app-shell">
      {sidebar && (
        <div className="mobile-shade" onClick={() => setSidebar(false)} />
      )}
      <aside className={"sidebar " + (sidebar ? "is-open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="logo-mark">
            <BookOpen size={24} />
          </span>
          Kitob<span>Flow</span>
          <span className="brand-dot" />
        </a>
        <nav aria-label="Основная навигация">
          {(
            ["dashboard", "readers", "books", "loans", "tables"] as Section[]
          ).map((s) => {
            const Icon = icons[s];
            return (
              <button
                key={s}
                className={"nav-item " + (section === s ? "active" : "")}
                onClick={() => navigate(s)}
              >
                <Icon size={19} />
                <span>{ru[s]}</span>
              </button>
            );
          })}
          <details className="secondary-nav">
            <summary>
              Дополнительно
              <ChevronDown size={15} />
            </summary>
            {(["visits", "notices", "history"] as Section[]).map((s) => {
              const Icon = icons[s];
              return (
                <button
                  key={s}
                  className={"nav-item " + (section === s ? "active" : "")}
                  onClick={() => navigate(s)}
                >
                  <Icon size={18} />
                  <span>{ru[s]}</span>
                </button>
              );
            })}
          </details>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={"nav-item " + (section === "settings" ? "active" : "")}
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            Настройки
          </button>
          <button
            className="nav-item"
            onClick={() => setModal({ type: "help" })}
          >
            <HelpCircle size={18} />
            Помощь и поддержка
            <ArrowUpRight size={15} className="push" />
          </button>
          <div className="staff">
            <Avatar name="Малика Каримова" />
            <div>
              <b>Малика Каримова</b>
              <span>Администратор библиотеки</span>
            </div>
            <button
              className="icon-btn"
              aria-label="Профиль сотрудника"
              onClick={() => navigate("settings")}
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="library-name">
            <button
              className="icon-btn mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span className="library-icon">
              <Library size={18} />
            </span>
            <span>{db.library}</span>
            <ChevronDown size={14} />
            <Badge tone="gray">Демо</Badge>
          </div>
          <div className="top-actions">
            <div className="top-date">
              <CalendarDays size={15} />
              {format(new Date(), "d MMMM yyyy", { locale: dateRu })}
            </div>
            <span className="top-divider" />
            <button
              className="notification-bell"
              aria-label="Уведомления"
              onClick={() => navigate("notices")}
            >
              <Bell size={19} />
              {pending.length > 0 && <i />}
            </button>
            <Avatar name="Малика Каримова" small />
          </div>
        </header>
        <main
          className={section === "dashboard" ? "dashboard-page" : undefined}
        >
          <div className="page-heading">
            <div>
              <h1>{ru[section]}</h1>
              <p>
                {
                  {
                    dashboard: "Выдавайте книги и следите за сроками возврата.",
                    readers: "Ваши читатели, их книги и история посещений.",
                    books:
                      "Каждая книга на своём месте. Найдите нужную за секунды.",
                    loans:
                      "Выдавайте, продлевайте и принимайте книги в пару кликов.",
                    tables:
                      "Выберите стол для чтения или учёбы и забронируйте удобное время.",
                    visits:
                      "Кто читает, работает и вдохновляется в вашей библиотеке.",
                    notices: "Помогаем читателям возвращать книги вовремя.",
                    history:
                      "Прозрачная история каждого действия в библиотеке.",
                    settings:
                      "Настройте рабочее пространство под свою библиотеку.",
                  }[section]
                }
              </p>
            </div>
            <div className="heading-actions">
              {section === "dashboard" ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setModal({ type: "reader" })}
                  >
                    <Plus size={16} />
                    Добавить читателя
                  </Button>
                  <Button onClick={() => setModal({ type: "loan" })}>
                    <ArrowLeftRight size={16} />
                    Выдать книгу
                  </Button>
                </>
              ) : section === "readers" ? (
                <Button onClick={() => setModal({ type: "reader" })}>
                  <Plus size={17} />
                  Добавить читателя
                </Button>
              ) : section === "books" ? (
                <Button onClick={() => setModal({ type: "book" })}>
                  <Plus size={17} />
                  Добавить книгу
                </Button>
              ) : section === "loans" ? (
                <Button onClick={() => setModal({ type: "loan" })}>
                  <Plus size={17} />
                  Выдать книгу
                </Button>
              ) : section === "notices" ? (
                <Button
                  onClick={() => {
                    let count = 0;
                    mutate(
                      (d) => {
                        count = generateNotices(d);
                      },
                      "Проверка сроков завершена",
                      false,
                    );
                    setToast(
                      `Проверка завершена: новых напоминаний — ${count}`,
                    );
                  }}
                >
                  <RotateCcw size={16} />
                  Проверить сроки сейчас
                </Button>
              ) : null}
            </div>
          </div>
          {storageError && (
            <div role="alert" className="warning-banner">
              {storageError}
            </div>
          )}
          {section === "dashboard" ? (
            <>
              <div className="stats-grid simple-stats">
                {[
                  {
                    label: "Читатели",
                    value: db.readers.length,
                    target: "readers",
                    icon: Users,
                  },
                  {
                    label: "Книги в каталоге",
                    value: db.books.length,
                    target: "books",
                    icon: BookOpen,
                  },
                  {
                    label: "Книги на руках",
                    value: active.length,
                    target: "loans",
                    icon: ArrowLeftRight,
                  },
                  {
                    label: "Просрочено",
                    value: late.length,
                    target: "loans",
                    icon: Clock,
                  },
                ].map((item, index) => (
                  <button
                    className="stat-card"
                    key={item.label}
                    onClick={() => {
                      navigate(item.target as Section);
                      if (index === 3) setFilter("Просроченные");
                      else if (index === 2) setFilter("На руках");
                    }}
                  >
                    <div className="stat-top">
                      <span>{item.label}</span>
                      <item.icon size={17} />
                    </div>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
              <section className="panel return-queue">
                <div className="panel-heading">
                  <div>
                    <h2>Книги к возврату</h2>
                    <p>Сначала просроченные, затем ближайшие сроки.</p>
                  </div>
                </div>
                {loanRows(dueLoans.slice(0, 4), true)}
                <button
                  className="panel-link"
                  onClick={() => {
                    navigate("loans");
                    setFilter("На руках");
                  }}
                >
                  Все книги на руках
                  <ArrowRight size={15} />
                </button>
              </section>
            </>
          ) : (
            <>
              {section !== "settings" && section !== "tables" && (
                <div className="toolbar">
                  <div className="search-input">
                    <Search size={17} />
                    <input
                      aria-label="Поиск"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={
                        section === "readers"
                          ? "Найти по имени, телефону или билету…"
                          : section === "books"
                            ? "Название, автор или ISBN…"
                            : "Поиск по читателю или книге…"
                      }
                    />
                    {query && (
                      <button
                        className="icon-btn"
                        aria-label="Очистить поиск"
                        onClick={() => setQuery("")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <div className="toolbar-right">
                    {section === "readers" ? (
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        aria-label="Статус читателя"
                      >
                        <option>Все</option>
                        <option>Активные</option>
                        <option>Заблокированные</option>
                      </select>
                    ) : section === "books" ? (
                      <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        aria-label="Категория"
                      >
                        <option>Все</option>
                        {Array.from(
                          new Set(db.books.map((b) => b.category)),
                        ).map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    ) : section === "loans" ? (
                      <div className="tabs">
                        {[
                          "Все",
                          "На руках",
                          "Просроченные",
                          "Возвращённые",
                        ].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => setFilter(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : section === "visits" ? (
                      <div className="tabs">
                        {["Все", "Сейчас в библиотеке", "Сегодня"].map((f) => (
                          <button
                            key={f}
                            className={filter === f ? "selected" : ""}
                            onClick={() => setFilter(f)}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    ) : section === "notices" ? (
                      <select
                        aria-label="Статус уведомлений"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>Все</option>
                        <option>Ожидает отправки</option>
                        <option>Отправлено (демо)</option>
                        <option>Просрочка</option>
                      </select>
                    ) : (
                      <select
                        aria-label="Тип операции"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option>Все</option>
                        {Array.from(new Set(db.events.map((e) => e.type))).map(
                          (t) => (
                            <option key={t}>{t}</option>
                          ),
                        )}
                      </select>
                    )}
                    <span className="result-count">
                      {section === "readers"
                        ? db.readers.length + " читателей"
                        : section === "books"
                          ? db.books.length + " книг"
                          : ""}
                    </span>
                  </div>
                </div>
              )}
              {section === "readers" && (
                <section className="panel">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Читатель</th>
                          <th>Читательский билет</th>
                          <th>Телефон · тестовый</th>
                          <th>На руках</th>
                          <th>Статус</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {db.readers
                          .filter(
                            (r) =>
                              matches(r.name, r.phone, r.card, r.id) &&
                              (filter === "Все" ||
                                r.status ===
                                  (filter === "Активные"
                                    ? "active"
                                    : "blocked")),
                          )
                          .map((r) => (
                            <tr key={r.id}>
                              <td>
                                <button
                                  className="reader-cell"
                                  onClick={() =>
                                    setModal({ type: "profile", reader: r })
                                  }
                                >
                                  <Avatar name={r.name} />
                                  <span>
                                    <b>{r.name}</b>
                                    <small>
                                      С нами с {shortDate(r.registered)}
                                    </small>
                                  </span>
                                </button>
                              </td>
                              <td>
                                <span className="mono">{r.card}</span>
                              </td>
                              <td>{r.phone}</td>
                              <td>
                                {
                                  active.filter((l) => l.readerId === r.id)
                                    .length
                                }{" "}
                                книг
                              </td>
                              <td>
                                <Badge
                                  tone={
                                    r.status === "active" ? "green" : "gray"
                                  }
                                >
                                  {r.status === "active"
                                    ? "Активный"
                                    : "Заблокирован"}
                                </Badge>
                              </td>
                              <td>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setModal({ type: "reader", reader: r })
                                  }
                                >
                                  Изменить
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {!db.readers.some(
                      (r) =>
                        matches(r.name, r.phone, r.card, r.id) &&
                        (filter === "Все" ||
                          r.status ===
                            (filter === "Активные" ? "active" : "blocked")),
                    ) && <Empty text="Читателей не найдено" />}
                  </div>
                </section>
              )}
              {section === "books" && (
                <div className="catalog-grid">
                  {db.books
                    .filter(
                      (b) =>
                        matches(b.title, b.author, b.isbn) &&
                        (filter === "Все" || b.category === filter),
                    )
                    .map((b) => (
                      <article className="book-card" key={b.id}>
                        <button
                          className="cover-scene"
                          onClick={() =>
                            setModal({ type: "bookDetail", book: b })
                          }
                        >
                          <div
                            className="book-cover"
                            style={{ background: b.color }}
                          >
                            <span>{b.author}</span>
                            <strong>{b.title}</strong>
                            <div className="cover-decoration">
                              <BookOpen size={38} strokeWidth={0.8} />
                            </div>
                            <small>БИБЛИОТЕКА KITOBFLOW</small>
                          </div>
                        </button>
                        <div className="book-card-content">
                          <span className="book-category">{b.category}</span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setModal({ type: "bookDetail", book: b })
                            }
                          >
                            <h3>{b.title}</h3>
                          </button>
                          <p>{b.author}</p>
                          <div className="book-card-bottom">
                            <Badge
                              tone={available(db, b) > 0 ? "green" : "red"}
                            >
                              {available(db, b)} из {b.copies} доступно
                            </Badge>
                            <button
                              aria-label={"Выдать " + b.title}
                              disabled={available(db, b) < 1}
                              className="icon-btn"
                              onClick={() =>
                                setModal({ type: "loan", bookId: b.id })
                              }
                            >
                              <ArrowUpRight size={19} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  {!db.books.some(
                    (b) =>
                      matches(b.title, b.author, b.isbn) &&
                      (filter === "Все" || b.category === filter),
                  ) && <Empty text="Книг не найдено" />}
                </div>
              )}
              {section === "loans" && (
                <section className="panel">
                  {loanRows(
                    db.loans.filter(
                      (l) =>
                        matches(
                          reader(l.readerId).name,
                          book(l.bookId).title,
                          reader(l.readerId).card,
                        ) &&
                        (filter === "Все" ||
                          (filter === "На руках" && !l.returned) ||
                          (filter === "Просроченные" && overdue(l)) ||
                          (filter === "Возвращённые" && l.returned)),
                    ),
                  )}
                </section>
              )}
              {section === "visits" && (
                <>
                  <div className="visits-summary">
                    <div>
                      <span className="stat-icon green">
                        <DoorOpen size={20} />
                      </span>
                      <strong>{inside.length}</strong>
                      <span>сейчас в библиотеке</span>
                    </div>
                    <div>
                      <span className="stat-icon blue">
                        <Users size={20} />
                      </span>
                      <strong>{todayVisits.length}</strong>
                      <span>посещений сегодня</span>
                    </div>
                    <div className="checkin">
                      <select
                        aria-label="Читатель для входа"
                        value={visitReader}
                        onChange={(e) => setVisitReader(e.target.value)}
                      >
                        <option value="">Выберите читателя для входа</option>
                        {db.readers
                          .filter(
                            (r) =>
                              r.status === "active" &&
                              !inside.some((v) => v.readerId === r.id),
                          )
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                      <Button
                        disabled={!visitReader}
                        onClick={() => {
                          mutate(
                            (d) => enter(d, visitReader),
                            "Вход отмечен",
                            false,
                          );
                          setVisitReader("");
                        }}
                      >
                        <Plus size={16} />
                        Отметить вход
                      </Button>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Читатель</th>
                            <th>Дата</th>
                            <th>Время входа</th>
                            <th>Время выхода</th>
                            <th>Статус</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVisits.map((v) => (
                            <tr key={v.id}>
                              <td>
                                <button
                                  className="reader-cell"
                                  onClick={() =>
                                    setModal({
                                      type: "profile",
                                      reader: reader(v.readerId),
                                    })
                                  }
                                >
                                  <Avatar name={reader(v.readerId).name} />
                                  <b>{reader(v.readerId).name}</b>
                                </button>
                              </td>
                              <td>{date(v.entered)}</td>
                              <td>{format(new Date(v.entered), "HH:mm")}</td>
                              <td>
                                {v.exited
                                  ? format(new Date(v.exited), "HH:mm")
                                  : "—"}
                              </td>
                              <td>
                                <Badge tone={v.exited ? "gray" : "green"}>
                                  {v.exited ? "Завершено" : "В библиотеке"}
                                </Badge>
                              </td>
                              <td>
                                {!v.exited && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      mutate(
                                        (d) => {
                                          const visit = d.visits.find(
                                            (x) => x.id === v.id,
                                          )!;
                                          if (visit.exited)
                                            throw Error("Выход уже отмечен");
                                          visit.exited =
                                            new Date().toISOString();
                                          log(
                                            d,
                                            "Выход из библиотеки",
                                            v.readerId,
                                          );
                                        },
                                        "Выход отмечен",
                                        false,
                                      )
                                    }
                                  >
                                    <LogOut size={14} />
                                    Отметить выход
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!filteredVisits.length && <Empty text="Нет посещений" />}
                    </div>
                  </section>
                </>
              )}
              {section === "notices" && (
                <>
                  <div className="info-banner">
                    <MessageSquare size={20} />
                    <div>
                      <b>Забота о читателях, без лишних звонков</b>
                      <p>
                        Напоминания за 3 дня, в день возврата и при просрочке.
                        Здесь SMS только симулируются — реальные сообщения не
                        отправляются.
                      </p>
                    </div>
                    <Badge tone="blue">Демо SMS</Badge>
                  </div>
                  <div className="notice-grid">
                    {filteredNotices.map((n) => {
                      const resolved = !active.some(
                        (l) => l.id === n.loanId && l.due === n.due,
                      );
                      return (
                        <article className="panel notice-card" key={n.id}>
                          <div className="notice-heading">
                            <span
                              className={
                                "activity-icon " +
                                (n.event === "Просрочка" ? "orange" : "green")
                              }
                            >
                              <MessageSquare size={18} />
                            </span>
                            <Badge
                              tone={
                                n.sent ? "green" : resolved ? "gray" : "orange"
                              }
                            >
                              {n.sent
                                ? "Отправлено (демо)"
                                : resolved
                                  ? "Не актуально"
                                  : "Ожидает отправки"}
                            </Badge>
                          </div>
                          <h3>{reader(n.readerId).name}</h3>
                          <span className="muted">
                            {reader(n.readerId).phone} · тестовый номер
                          </span>
                          <p className="sms-text">{n.text}</p>
                          <div className="notice-bottom">
                            <span>{n.event}</span>
                            <Button
                              disabled={!!n.sent || resolved || sending}
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                setSending(true);
                                try {
                                  const result = await demoSmsProvider.send(n);
                                  mutate(
                                    (d) => {
                                      const notice = d.notices.find(
                                        (x) => x.id === n.id,
                                      )!;
                                      const loan = d.loans.find(
                                        (l) => l.id === n.loanId,
                                      );
                                      if (
                                        notice.sent ||
                                        !loan ||
                                        loan.returned ||
                                        loan.due !== n.due
                                      )
                                        throw Error(
                                          "Напоминание уже отправлено или не актуально",
                                        );
                                      notice.sent = result.at;
                                      log(
                                        d,
                                        "Отправка SMS (демо)",
                                        n.readerId,
                                        n.bookId,
                                        "Система",
                                      );
                                    },
                                    "SMS отправлено (демо)",
                                    false,
                                  );
                                } finally {
                                  setSending(false);
                                }
                              }}
                            >
                              {n.sent ? (
                                <CheckCheck size={14} />
                              ) : (
                                <Send size={14} />
                              )}{" "}
                              {n.sent ? "Отправлено" : "Симулировать отправку"}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                    {!filteredNotices.length && (
                      <Empty text="Нет напоминаний" />
                    )}
                  </div>
                </>
              )}
              {section === "history" && (
                <section className="panel">
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Дата и время</th>
                          <th>Операция</th>
                          <th>Читатель</th>
                          <th>Книга</th>
                          <th>Сотрудник</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEvents.map((e) => (
                          <tr key={e.id}>
                            <td>
                              {shortDate(e.time)}{" "}
                              <span className="muted">
                                {format(new Date(e.time), "HH:mm")}
                              </span>
                            </td>
                            <td>
                              <span className="event-type">
                                <span
                                  className={
                                    "event-dot " +
                                    (e.type.includes("SMS") ? "blue" : "green")
                                  }
                                />
                                {e.type}
                              </span>
                            </td>
                            <td>
                              {e.readerId ? reader(e.readerId).name : "—"}
                            </td>
                            <td>{e.bookId ? book(e.bookId).title : "—"}</td>
                            <td>{e.actor}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredEvents.length && (
                      <Empty text="Операций не найдено" />
                    )}
                  </div>
                </section>
              )}
              {section === "tables" && (
                <TableBookings
                  db={db}
                  onReserve={(input) =>
                    mutate(
                      (d) => {
                        bookTable(d, input);
                      },
                      "Стол забронирован",
                      false,
                    )
                  }
                  onCancel={(id) =>
                    mutate((d) => cancelBooking(d, id), "Бронь отменена", false)
                  }
                />
              )}
              {section === "settings" && (
                <div className="settings-layout">
                  <section className="panel settings-panel">
                    <h2>Ваша библиотека</h2>
                    <p className="muted">Информация о рабочем пространстве</p>
                    <form
                      className="form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        const name = String(data.get("library")).trim();
                        if (name.length < 3) {
                          setToast("Введите название от 3 символов");
                          return;
                        }
                        mutate(
                          (d) => {
                            d.library = name;
                          },
                          "Настройки сохранены",
                          false,
                        );
                      }}
                    >
                      <label>
                        Название библиотеки
                        <input
                          name="library"
                          defaultValue={db.library}
                          required
                          minLength={3}
                        />
                      </label>
                      <label>
                        Язык интерфейса
                        <select defaultValue="ru">
                          <option value="ru">Русский</option>
                          <option disabled>O‘zbekcha — скоро</option>
                        </select>
                      </label>
                      <label>
                        Сотрудник
                        <input
                          value="Малика Каримова · Администратор"
                          readOnly
                        />
                      </label>
                      <Button type="submit">Сохранить настройки</Button>
                    </form>
                  </section>
                  <div>
                    <section className="panel settings-panel">
                      <div className="title-line">
                        <ShieldCheck size={20} />
                        <h2>Демонстрационный режим</h2>
                      </div>
                      <p>
                        Вымышленная организация. Все данные хранятся только в
                        этом браузере. Это демонстрация, а не защищённая
                        production-система.
                      </p>
                      <div className="data-summary">
                        <span>{db.readers.length} читателей</span>
                        <span>{db.books.length} книг</span>
                        <span>{db.events.length} операций</span>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(db, null, 2)], {
                            type: "application/json",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "kitobflow-demo.json";
                          a.click();
                          URL.revokeObjectURL(url);
                          setToast("Данные экспортированы");
                        }}
                      >
                        <Download size={16} />
                        Экспортировать данные
                      </Button>
                    </section>
                    <section className="panel settings-panel reset-panel">
                      <h2>Начать демонстрацию заново</h2>
                      <p>
                        Восстановить исходных читателей, книги, выдачи и
                        посещения. Все ваши изменения в этом браузере будут
                        удалены.
                      </p>
                      <Button
                        variant="destructive"
                        onClick={() => setModal({ type: "reset" })}
                      >
                        <RotateCcw size={16} />
                        Сбросить демо
                      </Button>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
          <footer>
            <span>© {new Date().getFullYear()} KitobFlow</span>
            <span>
              <i />
              Все изменения сохраняются в этом браузере
            </span>
            <span>Демо · v1.0</span>
          </footer>
        </main>
      </div>
      <Dialog
        open={!!modal}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title={
          modal?.type === "reader"
            ? modal.reader
              ? "Редактировать читателя"
              : "Новый читатель"
            : modal?.type === "book"
              ? modal.book
                ? "Редактировать книгу"
                : "Новая книга"
              : modal?.type === "loan"
                ? "Выдать книгу"
                : modal?.type === "profile"
                  ? "Профиль читателя"
                  : modal?.type === "bookDetail"
                    ? "Информация о книге"
                    : modal?.type === "due"
                      ? "Изменить срок возврата"
                      : modal?.type === "return"
                        ? "Принять возврат"
                        : modal?.type === "reset"
                          ? "Сбросить демонстрационные данные?"
                          : "Добро пожаловать в KitobFlow"
        }
        wide={modal?.type === "profile" || modal?.type === "bookDetail"}
      >
        {modal?.type === "reader" && (
          <ReaderForm
            key={modal.reader?.id || "new"}
            reader={modal.reader}
            onSave={saveReader}
          />
        )}
        {modal?.type === "book" && (
          <BookForm
            key={modal.book?.id || "new"}
            book={modal.book}
            onSave={saveBook}
          />
        )}
        {modal?.type === "loan" && (
          <LoanForm
            db={db}
            readerId={modal.readerId}
            bookId={modal.bookId}
            onSave={(r, b, i, d, op) =>
              mutate(
                (next) => issue(next, r, b, i, d, op),
                "Книга успешно выдана",
              )
            }
          />
        )}
        {modal?.type === "profile" &&
          (() => {
            const r = reader(modal.reader.id);
            const loans = db.loans.filter((l) => l.readerId === r.id);
            return (
              <div className="profile">
                <div className="profile-top">
                  <Avatar name={r.name} />
                  <div>
                    <h2>{r.name}</h2>
                    <p>{r.phone} · тестовый номер</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModal({ type: "reader", reader: r })}
                  >
                    Редактировать
                  </Button>
                </div>
                <div className="reader-card">
                  <div>
                    <span className="card-brand">
                      <BookOpen size={19} />
                      KitobFlow
                    </span>
                    <small>ЭЛЕКТРОННЫЙ ЧИТАТЕЛЬСКИЙ БИЛЕТ</small>
                    <h2>{r.name}</h2>
                    <span className="card-number">{r.card}</span>
                    <p>{db.library}</p>
                  </div>
                  <div className="qr-code">
                    <QRCodeSVG value={r.id} size={105} level="M" />
                    <small>Ваш ID читателя</small>
                  </div>
                </div>
                <div className="profile-facts">
                  <span>
                    <b>{loans.filter((l) => !l.returned).length}</b>На руках
                  </span>
                  <span>
                    <b>{loans.filter(overdue).length}</b>Просрочено
                  </span>
                  <span>
                    <b>{db.visits.filter((v) => v.readerId === r.id).length}</b>
                    Посещений
                  </span>
                  <Badge tone={r.status === "active" ? "green" : "gray"}>
                    {r.status === "active" ? "Активный" : "Заблокирован"}
                  </Badge>
                </div>
                <div className="profile-actions">
                  <Button
                    disabled={r.status !== "active"}
                    onClick={() => setModal({ type: "loan", readerId: r.id })}
                  >
                    <ArrowLeftRight size={16} />
                    Выдать книгу
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      mutate((d) => enter(d, r.id), "Вход отмечен", false)
                    }
                    disabled={
                      r.status !== "active" ||
                      inside.some((v) => v.readerId === r.id)
                    }
                  >
                    <DoorOpen size={16} />
                    {inside.some((v) => v.readerId === r.id)
                      ? "Уже в библиотеке"
                      : "Отметить вход"}
                  </Button>
                </div>
                <h3>Книги и история возвратов</h3>
                {loanRows(loans)}
                <h3>История посещений</h3>
                <div className="profile-visits">
                  {db.visits
                    .filter((v) => v.readerId === r.id)
                    .map((v) => (
                      <div key={v.id}>
                        <span>
                          {date(v.entered)} ·{" "}
                          {format(new Date(v.entered), "HH:mm")}
                        </span>
                        <Badge tone={v.exited ? "gray" : "green"}>
                          {v.exited
                            ? "Выход " + format(new Date(v.exited), "HH:mm")
                            : "В библиотеке"}
                        </Badge>
                      </div>
                    ))}
                  {!db.visits.some((v) => v.readerId === r.id) && (
                    <p className="muted">Посещений пока нет</p>
                  )}
                </div>
                <p className="hint">
                  Регистрация: {date(r.registered)} · SMS:{" "}
                  {r.consent ? "согласие получено" : "отключены"}
                </p>
              </div>
            );
          })()}
        {modal?.type === "bookDetail" &&
          (() => {
            const b = book(modal.book.id);
            return (
              <div className="book-details">
                <div className="book-detail-top">
                  <div className="book-cover" style={{ background: b.color }}>
                    <span>{b.author}</span>
                    <strong>{b.title}</strong>
                    <BookOpen size={32} />
                  </div>
                  <div>
                    <Badge tone="gray">{b.category}</Badge>
                    <h2>{b.title}</h2>
                    <p>{b.author}</p>
                    <p className="muted">
                      {b.year} год · ISBN {b.isbn || "не указан"}
                    </p>
                    <Badge tone={available(db, b) > 0 ? "green" : "red"}>
                      {available(db, b)} из {b.copies} экземпляров доступно
                    </Badge>
                    <div className="profile-actions">
                      <Button
                        disabled={available(db, b) < 1}
                        onClick={() => setModal({ type: "loan", bookId: b.id })}
                      >
                        Выдать книгу
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setModal({ type: "book", book: b })}
                      >
                        Изменить
                      </Button>
                    </div>
                  </div>
                </div>
                <h3>История выдачи</h3>
                {loanRows(db.loans.filter((l) => l.bookId === b.id))}
              </div>
            );
          })()}
        {modal?.type === "due" && (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              mutate(
                (d) => changeDue(d, modal.loan.id, due),
                "Срок возврата обновлён",
              );
            }}
          >
            <p>
              «{book(modal.loan.bookId).title}» ·{" "}
              {reader(modal.loan.readerId).name}
            </p>
            <label>
              Новый срок возврата
              <input
                type="date"
                required
                min={modal.loan.issued}
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
            <div className="info-box">
              Можно выбрать прошедшую дату после даты выдачи, чтобы проверить
              просрочку и SMS в демо.
            </div>
            <Button type="submit">Сохранить срок</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                mutate((d) => {
                  const l = d.loans.find((l) => l.id === modal.loan.id)!;
                  if (l.returned) throw Error("Выдача завершена");
                  const yesterday = day(addDays(new Date(), -1));
                  if (l.issued > yesterday)
                    l.issued = day(addDays(new Date(), -8));
                  changeDue(d, l.id, yesterday);
                }, "Демо: выдача просрочена на 1 день")
              }
            >
              Сделать просроченной (демо)
            </Button>
            <p className="hint">
              Для демонстрации дата выдачи при необходимости переносится на 8
              дней назад.
            </p>
          </form>
        )}
        {modal?.type === "return" && (
          <div className="form">
            <div className="confirm-icon">
              <BookOpen size={30} />
            </div>
            <p>
              Подтвердите возврат книги <b>«{book(modal.loan.bookId).title}»</b>{" "}
              от читателя {reader(modal.loan.readerId).name}.
            </p>
            <p className="muted">Экземпляр снова станет доступен в каталоге.</p>
            <Button
              onClick={() =>
                mutate(
                  (d) => returnBook(d, modal.loan.id),
                  "Возврат оформлен. Спасибо!",
                )
              }
            >
              <Check size={17} />
              Подтвердить возврат
            </Button>
          </div>
        )}
        {modal?.type === "reset" && (
          <div className="form">
            <p>
              Все добавленные данные и изменения будут удалены. Восстановятся 15
              читателей, 16 книг и демонстрационная история.
            </p>
            <Button
              variant="destructive"
              onClick={() => {
                try {
                  const data = repository.reset();
                  live.current = data;
                  setDb(data);
                  setModal(null);
                  setToast("Демонстрационные данные восстановлены");
                } catch {
                  setToast("Не удалось сбросить данные");
                }
              }}
            >
              Да, сбросить демо
            </Button>
            <Button variant="outline" onClick={() => setModal(null)}>
              Отмена
            </Button>
          </div>
        )}
        {modal?.type === "help" && (
          <div className="form help-content">
            <div className="logo-mark">
              <BookOpen />
            </div>
            <h2>Больше времени для читателей</h2>
            <p>
              KitobFlow объединяет каталог, читательские билеты, выдачи и
              посещения в одном рабочем пространстве.
            </p>
            <ol>
              <li>Добавьте читателя — получите электронный билет с QR.</li>
              <li>Выдайте доступную книгу и выберите срок возврата.</li>
              <li>Проверьте сроки в уведомлениях и симулируйте SMS.</li>
              <li>Оформите возврат — остатки обновятся автоматически.</li>
            </ol>
            <div className="info-box">
              Это локальное демо с вымышленными данными. Реальные SMS не
              отправляются. Для нового показа сбросьте данные в настройках.
            </div>
            <Button
              onClick={() => {
                setModal(null);
                navigate("readers");
              }}
            >
              Начать с читателей
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </Dialog>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
