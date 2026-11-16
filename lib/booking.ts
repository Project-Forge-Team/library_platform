import { z } from "zod";
import { format, isValid, parseISO } from "date-fns";
import type { Database } from "./library";

export type StudyTable = {
  id: string;
  number: string;
  zone: "quiet" | "study";
  seats: number;
};
export type TableBooking = {
  id: string;
  tableId: string;
  readerId: string;
  date: string;
  start: string;
  end: string;
  purpose: "reading" | "study";
  created: string;
  cancelledAt?: string;
};
export const defaultTables: StudyTable[] = Array.from(
  { length: 8 },
  (_, i) => ({
    id: `table-${i + 1}`,
    number: String(i + 1).padStart(2, "0"),
    zone: i < 4 ? "quiet" : "study",
    seats: i < 4 ? 1 : i < 6 ? 2 : 4,
  }),
);
export const bookingSchema = z.object({
  tableId: z.string().min(1, "Выберите стол на схеме"),
  readerId: z.string().min(1, "Выберите читателя"),
  date: z.iso.date("Выберите корректную дату"),
  start: z.string().regex(/^\d{2}:(00|30)$/, "Выберите время с шагом 30 минут"),
  end: z.string().regex(/^\d{2}:(00|30)$/, "Выберите время с шагом 30 минут"),
  purpose: z.enum(["reading", "study"]),
});
export type BookingInput = z.infer<typeof bookingSchema>;
export function validSlot(date: string, start: string, end: string) {
  const a = parseISO(`${date}T${start}:00`),
    b = parseISO(`${date}T${end}:00`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    isValid(a) &&
    isValid(b) &&
    start >= "09:00" &&
    end <= "20:00" &&
    start < end &&
    /^\d{2}:(00|30)$/.test(start) &&
    /^\d{2}:(00|30)$/.test(end)
  );
}
export function overlaps(
  b: TableBooking,
  date: string,
  start: string,
  end: string,
) {
  return !b.cancelledAt && b.date === date && b.start < end && b.end > start;
}
export function bookTable(db: Database, input: BookingInput) {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) throw Error(parsed.error.issues[0].message);
  const v = parsed.data;
  if (!validSlot(v.date, v.start, v.end))
    throw Error(
      "Выберите интервал с 09:00 до 20:00. Окончание должно быть позже начала.",
    );
  if (parseISO(`${v.date}T${v.start}:00`).getTime() < Date.now())
    throw Error("Нельзя забронировать стол на прошедшее время");
  const table = db.tables.find((t) => t.id === v.tableId);
  if (!table) throw Error("Выберите стол на схеме");
  if (!db.readers.some((r) => r.id === v.readerId && r.status === "active"))
    throw Error("Выберите активного читателя");
  const concurrent = db.bookings.filter((b) =>
    overlaps(b, v.date, v.start, v.end),
  );
  if (concurrent.some((b) => b.tableId === v.tableId))
    throw Error("Этот стол уже забронирован на выбранное время");
  if (concurrent.some((b) => b.readerId === v.readerId))
    throw Error("У читателя уже есть бронь на это время");
  const booking: TableBooking = {
    ...v,
    id: crypto.randomUUID(),
    created: new Date().toISOString(),
  };
  db.bookings.unshift(booking);
  db.events.unshift({
    id: crypto.randomUUID(),
    time: booking.created,
    type: `Бронь стола ${table.number} · ${format(parseISO(v.date), "dd.MM.yyyy")} ${v.start}–${v.end}`,
    readerId: v.readerId,
    actor: "Малика Каримова",
  });
  return booking;
}
export function cancelBooking(db: Database, id: string) {
  const booking = db.bookings.find((b) => b.id === id);
  if (!booking || booking.cancelledAt) throw Error("Бронь уже отменена");
  if (parseISO(`${booking.date}T${booking.end}:00`).getTime() <= Date.now())
    throw Error("Завершённую бронь нельзя отменить");
  booking.cancelledAt = new Date().toISOString();
  db.events.unshift({
    id: crypto.randomUUID(),
    time: booking.cancelledAt,
    type: `Отмена брони стола ${db.tables.find((t) => t.id === booking.tableId)?.number}`,
    readerId: booking.readerId,
    actor: "Малика Каримова",
  });
}
export function initialBookingSlot(now = new Date()) {
  const start = new Date(now);
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil((now.getMinutes() + 1) / 30) * 30);
  if (start.getHours() < 9) start.setHours(9, 0, 0, 0);
  if (
    start.getHours() >= 20 ||
    (start.getHours() === 19 && start.getMinutes() > 0)
  ) {
    start.setDate(start.getDate() + 1);
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 3600000);
  return {
    date: format(start, "yyyy-MM-dd"),
    start: format(start, "HH:mm"),
    end: format(end, "HH:mm"),
  };
}
