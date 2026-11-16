"use client";
import { useEffect, useState } from "react";
import {
  Sprout,
  Monitor,
  Newspaper,
  Archive,
  BookOpen,
  GraduationCap,
  CalendarDays,
  Check,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import type { Database } from "@/lib/library";
import { day } from "@/lib/library";
import {
  initialBookingSlot,
  overlaps,
  validSlot,
  type BookingInput,
  type TableBooking,
} from "@/lib/booking";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import "./table-bookings.css";

type Props = {
  db: Database;
  onReserve: (input: BookingInput) => boolean;
  onCancel: (id: string) => boolean;
};
function Bookcase({ label }: { label: string }) {
  return (
    <div className="floor-bookcase">
      <span className="shelf-books" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} />
        ))}
      </span>
      <span className="shelf-label">{label}</span>
    </div>
  );
}

export function TableBookings({ db, onReserve, onCancel }: Props) {
  const [slot, setSlot] = useState(initialBookingSlot);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [readerId, setReaderId] = useState("");
  const [purpose, setPurpose] = useState<"reading" | "study">("reading");
  const [allDates, setAllDates] = useState(false);
  const [cancel, setCancel] = useState<TableBooking | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const valid = validSlot(slot.date, slot.start, slot.end);
  const conflicts = db.bookings.filter(
    (b) => valid && overlaps(b, slot.date, slot.start, slot.end),
  );
  const busy = new Set(conflicts.map((b) => b.tableId));
  const selected = db.tables.find((t) => t.id === selectedId);
  const past =
    valid && parseISO(`${slot.date}T${slot.start}:00`).getTime() < clock;
  const readerConflict = conflicts.some((b) => b.readerId === readerId);
  const list = db.bookings
    .filter((b) => allDates || b.date === slot.date)
    .toSorted((a, b) =>
      `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`),
    );
  function changeSlot(value: Partial<typeof slot>) {
    setSlot((current) => ({ ...current, ...value }));
    setClock(Date.now());
    setError("");
  }
  return (
    <div className="booking-workspace">
      <div className="booking-slot panel">
        <div className="slot-intro">
          <CalendarDays size={18} />
          <div>
            <b>Когда нужен стол?</b>
            <span>Читальный зал открыт с 09:00 до 20:00</span>
          </div>
        </div>
        <label>
          Дата
          <input
            aria-label="Дата бронирования"
            type="date"
            min={day()}
            required
            value={slot.date}
            onChange={(e) => changeSlot({ date: e.target.value })}
          />
        </label>
        <label>
          С
          <input
            aria-label="Начало бронирования"
            type="time"
            step="1800"
            min="09:00"
            max="19:30"
            required
            value={slot.start}
            onChange={(e) => changeSlot({ start: e.target.value })}
          />
        </label>
        <label>
          До
          <input
            aria-label="Окончание бронирования"
            type="time"
            step="1800"
            min="09:30"
            max="20:00"
            required
            value={slot.end}
            onChange={(e) => changeSlot({ end: e.target.value })}
          />
        </label>
      </div>
      {!valid && (
        <p role="alert" className="booking-validation">
          Выберите дату и интервал с 09:00 до 20:00. Окончание должно быть позже
          начала, шаг — 30 минут.
        </p>
      )}
      {past && (
        <p role="alert" className="booking-validation">
          Это время уже прошло. Выберите более позднее время или другую дату.
        </p>
      )}
      <div className="booking-main">
        <section
          className="panel room-panel"
          aria-label="Схема читального зала"
        >
          <div className="panel-heading">
            <div>
              <h2>Выберите стол на схеме</h2>
              <p>
                {valid
                  ? `${db.tables.length - busy.size} из ${db.tables.length} свободно · ${slot.start}–${slot.end}`
                  : "Сначала укажите время"}
              </p>
            </div>
            <span className="room-label">План библиотеки · 1 этаж</span>
          </div>
          <div className="room-plan">
            <span className="floor-plant plant-north-west" aria-hidden="true">
              <Sprout size={22} />
            </span>
            <span className="floor-plant plant-north-east" aria-hidden="true">
              <Sprout size={22} />
            </span>
            <div className="room-windows">
              <span />
              ОКНА
              <span />
            </div>
            <div className="room-zones">
              {(["quiet", "study"] as const).map((zone) => (
                <div className="room-zone" key={zone}>
                  <h3>
                    {zone === "quiet" ? (
                      <BookOpen size={15} />
                    ) : (
                      <GraduationCap size={16} />
                    )}{" "}
                    {zone === "quiet" ? "Тихая зона" : "Учебная зона"}
                  </h3>
                  <p>
                    {zone === "quiet"
                      ? "Для самостоятельного чтения"
                      : "Для учёбы и совместной работы"}
                  </p>
                  <Bookcase
                    label={
                      zone === "quiet"
                        ? "Художественная литература"
                        : "Учебники и справочники"
                    }
                  />
                  <div className="room-table-grid">
                    {db.tables
                      .filter((t) => t.zone === zone)
                      .map((table) => {
                        const occupied = busy.has(table.id);
                        const chosen = selectedId === table.id;
                        return (
                          <button
                            type="button"
                            key={table.id}
                            disabled={!valid || occupied || past}
                            className={
                              "room-table " +
                              (occupied
                                ? "is-busy "
                                : chosen
                                  ? "is-selected "
                                  : "")
                            }
                            aria-label={`Стол ${table.number} · ${table.seats} ${table.seats === 1 ? "место" : "места"} · ${occupied ? "занят" : "свободен"}`}
                            aria-pressed={chosen}
                            onClick={() => {
                              setSelectedId(table.id);
                              setError("");
                            }}
                          >
                            <span className="table-shape">
                              <span className="table-chairs" aria-hidden="true">
                                {Array.from({ length: table.seats }, (_, i) => (
                                  <i key={i} className={`chair chair-${i}`} />
                                ))}
                              </span>
                              {zone === "quiet" ? (
                                <BookOpen size={17} />
                              ) : (
                                <GraduationCap size={18} />
                              )}
                              <strong>{table.number}</strong>
                              {chosen && (
                                <Check className="table-check" size={13} />
                              )}
                            </span>
                            <span className="table-caption">
                              {occupied
                                ? "Занят"
                                : `${table.seats} ${table.seats === 1 ? "место" : "места"}`}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
            <div className="floor-aisle" aria-hidden="true">
              <span />
              <span>Центральный проход</span>
              <span />
            </div>
            <div className="room-foyer">
              <div className="floor-lounge">
                <div className="lounge-furniture" aria-hidden="true">
                  <span className="floor-sofa">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="coffee-table" />
                  <span className="floor-plant">
                    <Sprout size={20} />
                  </span>
                </div>
                <span className="fixture-label">
                  <Newspaper size={12} />
                  Периодика и отдых
                </span>
              </div>
              <div className="floor-reception">
                <div className="reception-counter" aria-hidden="true">
                  <Monitor size={19} />
                  <span className="desk-books" />
                </div>
                <span className="fixture-label">Стойка библиотекаря</span>
              </div>
              <div className="floor-storage">
                <div className="locker-bank" aria-hidden="true">
                  {Array.from({ length: 6 }, (_, i) => (
                    <span key={i} />
                  ))}
                </div>
                <span className="fixture-label">
                  <Archive size={12} />
                  Шкафчики
                </span>
              </div>
            </div>
            <div className="room-entrance">
              <span className="entrance-door" aria-hidden="true" />
              <b>ВХОД / ВЫХОД</b>
            </div>
          </div>
          <div className="room-legend">
            <span>
              <i className="free" />
              Свободен
            </span>
            <span>
              <i className="selected" />
              Выбран
            </span>
            <span>
              <i className="occupied" />
              Забронирован
            </span>
          </div>
        </section>
        <section className="panel reservation-panel">
          <h2>{selected ? `Бронь стола ${selected.number}` : "Новая бронь"}</h2>
          <p className="reservation-intro">
            {selected
              ? `${selected.zone === "quiet" ? "Тихая зона" : "Учебная зона"} · ${selected.seats} ${selected.seats === 1 ? "место" : "места"}. Бронируется весь стол.`
              : "Нажмите на свободный стол на схеме."}
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              setClock(Date.now());
              if (!selected) {
                setError("Сначала выберите стол на схеме");
                return;
              }
              if (
                onReserve({ ...slot, tableId: selected.id, readerId, purpose })
              ) {
                setReaderId("");
                setSelectedId(null);
                setError("");
              }
            }}
          >
            <label>
              Читатель
              <select
                aria-label="Читатель для брони"
                required
                value={readerId}
                onChange={(e) => setReaderId(e.target.value)}
              >
                <option value="">Выберите читателя</option>
                {db.readers
                  .filter((r) => r.status === "active")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.card}
                    </option>
                  ))}
              </select>
            </label>
            <fieldset className="booking-purpose">
              <legend>Для чего?</legend>
              <label className={purpose === "reading" ? "chosen" : ""}>
                <input
                  type="radio"
                  name="booking-purpose"
                  value="reading"
                  checked={purpose === "reading"}
                  onChange={() => setPurpose("reading")}
                />
                <BookOpen size={16} />
                Чтение
              </label>
              <label className={purpose === "study" ? "chosen" : ""}>
                <input
                  type="radio"
                  name="booking-purpose"
                  value="study"
                  checked={purpose === "study"}
                  onChange={() => setPurpose("study")}
                />
                <GraduationCap size={17} />
                Учёба
              </label>
            </fieldset>
            {selected && valid && (
              <div className="reservation-time">
                <CalendarDays size={16} />
                <span>
                  {format(parseISO(slot.date), "d MMMM", { locale: ru })}
                  <b>
                    {slot.start}–{slot.end}
                  </b>
                </span>
              </div>
            )}
            {selected && busy.has(selected.id) && (
              <p className="error" role="alert">
                На этот интервал стол занят. Выберите другой стол или время.
              </p>
            )}
            {readerConflict && (
              <p className="error" role="alert">
                У читателя уже есть бронь на это время.
              </p>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Button
              type="submit"
              disabled={
                !selected ||
                !valid ||
                past ||
                busy.has(selected.id) ||
                readerConflict
              }
            >
              Забронировать стол
            </Button>
            <p className="hint booking-hint">
              Отменить бронь можно в списке ниже.
            </p>
          </form>
        </section>
      </div>
      <section className="panel booking-list">
        <div className="panel-heading">
          <h2>{allDates ? "Все бронирования" : "Брони на выбранную дату"}</h2>
          <label className="all-bookings">
            <input
              type="checkbox"
              checked={allDates}
              onChange={(e) => setAllDates(e.target.checked)}
            />
            Все даты
          </label>
        </div>
        {list.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Стол / время</th>
                  <th>Читатель</th>
                  <th>Цель</th>
                  <th>Статус</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((b) => {
                  const table = db.tables.find((t) => t.id === b.tableId);
                  const ended =
                    parseISO(`${b.date}T${b.end}:00`).getTime() <= clock;
                  const inProgress =
                    !ended &&
                    parseISO(`${b.date}T${b.start}:00`).getTime() <= clock;
                  return (
                    <tr key={b.id}>
                      <td>
                        <b>Стол {table?.number}</b>
                        <span className="booking-row-sub">
                          {format(parseISO(b.date), "dd MMM", { locale: ru })} ·{" "}
                          {b.start}–{b.end}
                        </span>
                      </td>
                      <td>
                        {db.readers.find((r) => r.id === b.readerId)?.name ||
                          "Читатель не найден"}
                      </td>
                      <td>{b.purpose === "reading" ? "Чтение" : "Учёба"}</td>
                      <td>
                        <span
                          className={
                            "badge " +
                            (b.cancelledAt || ended ? "gray" : "green")
                          }
                        >
                          {b.cancelledAt
                            ? "Отменена"
                            : ended
                              ? "Завершена"
                              : inProgress
                                ? "Сейчас"
                                : "Забронирован"}
                        </span>
                      </td>
                      <td>
                        {!b.cancelledAt && !ended && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancel(b)}
                          >
                            <X size={13} />
                            Отменить
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="booking-empty">
            <CalendarDays size={24} />
            <b>Бронирований пока нет</b>
            <p>Выберите стол на схеме — здесь появится ваша бронь.</p>
          </div>
        )}
      </section>
      <Dialog
        open={!!cancel}
        onOpenChange={(v) => {
          if (!v) setCancel(null);
        }}
        title="Отменить бронь?"
        description="Стол снова станет доступен на это время."
      >
        {cancel && (
          <div className="form">
            <p>
              Стол {db.tables.find((t) => t.id === cancel.tableId)?.number} ·{" "}
              {format(parseISO(cancel.date), "dd MMMM", { locale: ru })},{" "}
              {cancel.start}–{cancel.end}
            </p>
            <p>{db.readers.find((r) => r.id === cancel.readerId)?.name}</p>
            <Button
              variant="destructive"
              onClick={() => {
                if (onCancel(cancel.id)) setCancel(null);
              }}
            >
              Да, отменить бронь
            </Button>
            <Button variant="outline" onClick={() => setCancel(null)}>
              Сохранить бронь
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}
