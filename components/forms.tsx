"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Book, Reader, Database, day, available, uid } from "@/lib/library";
import { addDays } from "date-fns";
import { Button } from "./ui/button";
const readerSchema = z.object({
  name: z.string().trim().min(3, "Введите полное имя"),
  phone: z
    .string()
    .regex(/^\+998[\s\d]{9,16}$/, "Формат: +998 90 123 45 67")
    .refine(
      (v) => v.replace(/\D/g, "").length === 12,
      "Нужно 9 цифр после +998",
    ),
  status: z.enum(["active", "blocked"]),
  consent: z.boolean(),
});
export type ReaderInput = z.infer<typeof readerSchema>;
export function ReaderForm({
  reader,
  onSave,
}: {
  reader?: Reader;
  onSave: (v: ReaderInput) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReaderInput>({
    resolver: zodResolver(readerSchema),
    defaultValues: reader || {
      name: "",
      phone: "+998 ",
      status: "active",
      consent: true,
    },
  });
  return (
    <form className="form" onSubmit={handleSubmit(onSave)}>
      <label>
        ФИО читателя
        <input placeholder="Например, Азиз Рахимов" {...register("name")} />
        <small className="error">{errors.name?.message}</small>
      </label>
      <label>
        Телефон
        <input {...register("phone")} placeholder="+998 90 123 45 67" />
        <small className="error">{errors.phone?.message}</small>
      </label>
      <p className="hint">
        Для демо используйте тестовый номер +998 00 000 00 00.
      </p>
      <label>
        Статус
        <select {...register("status")}>
          <option value="active">Активный</option>
          <option value="blocked">Заблокирован</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" {...register("consent")} /> Согласие на
        SMS-напоминания
      </label>
      <Button disabled={isSubmitting} type="submit">
        {reader ? "Сохранить изменения" : "Зарегистрировать читателя"}
      </Button>
    </form>
  );
}
const bookSchema = z.object({
  title: z.string().trim().min(1, "Введите название"),
  author: z.string().trim().min(1, "Введите автора"),
  category: z.string().min(1),
  year: z
    .number()
    .int()
    .min(1000)
    .max(new Date().getFullYear() + 1),
  isbn: z.string(),
  copies: z.number().int().min(1, "Минимум один экземпляр"),
});
export type BookInput = z.infer<typeof bookSchema>;
export function BookForm({
  book,
  onSave,
}: {
  book?: Book;
  onSave: (v: BookInput) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BookInput>({
    resolver: zodResolver(bookSchema),
    defaultValues: book || {
      title: "",
      author: "",
      category: "Художественная литература",
      year: 2024,
      isbn: "",
      copies: 5,
    },
  });
  return (
    <form className="form" onSubmit={handleSubmit(onSave)}>
      <label>
        Название
        <input {...register("title")} />
        <small className="error">{errors.title?.message}</small>
      </label>
      <label>
        Автор
        <input {...register("author")} />
        <small className="error">{errors.author?.message}</small>
      </label>
      <label>
        Категория
        <select {...register("category")}>
          {[
            "Художественная литература",
            "Саморазвитие",
            "Психология",
            "История",
            "Бизнес",
            "Технологии",
            "Поэзия",
          ].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label>
          Год издания
          <input type="number" {...register("year", { valueAsNumber: true })} />
          <small className="error">{errors.year?.message}</small>
        </label>
        <label>
          Экземпляры
          <input
            type="number"
            min="1"
            {...register("copies", { valueAsNumber: true })}
          />
          <small className="error">{errors.copies?.message}</small>
        </label>
      </div>
      <label>
        ISBN (необязательно)
        <input {...register("isbn")} />
      </label>
      <Button type="submit">
        {book ? "Сохранить изменения" : "Добавить книгу"}
      </Button>
    </form>
  );
}
export function LoanForm({
  db,
  readerId,
  bookId,
  onSave,
}: {
  db: Database;
  readerId?: string;
  bookId?: string;
  onSave: (
    r: string,
    b: string,
    i: string,
    d: string,
    operationId: string,
  ) => void;
}) {
  const [operationId] = useState(uid);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ reader: string; book: string; issued: string; due: string }>({
    defaultValues: {
      reader: readerId || "",
      book: bookId || "",
      issued: day(),
      due: day(addDays(new Date(), 7)),
    },
  });
  const selectedReader = db.readers.find((reader) => reader.id === readerId);
  const selectedBook = db.books.find((book) => book.id === bookId);
  return (
    <form
      className="form"
      onSubmit={handleSubmit((v) =>
        onSave(v.reader, v.book, v.issued, v.due, operationId),
      )}
    >
      {selectedReader ? (
        <div className="fixed-selection">
          <span>Читатель</span>
          <strong>{selectedReader.name}</strong>
          <small>{selectedReader.card}</small>
          <input type="hidden" {...register("reader", { required: true })} />
        </div>
      ) : (
        <label>
          Читатель
          <select {...register("reader", { required: "Выберите читателя" })}>
            <option value="">Выберите из списка</option>
            {db.readers
              .filter((r) => r.status === "active")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.card}
                </option>
              ))}
          </select>
          <small className="error">{errors.reader?.message}</small>
        </label>
      )}
      {selectedBook ? (
        <div className="fixed-selection">
          <span>Книга</span>
          <strong>{selectedBook.title}</strong>
          <small>
            {selectedBook.author} · {available(db, selectedBook)} доступно
          </small>
          <input type="hidden" {...register("book", { required: true })} />
        </div>
      ) : (
        <label>
          Доступные книги
          <select {...register("book", { required: "Выберите книгу" })}>
            <option value="">Выберите книгу</option>
            {db.books.map((b) => (
              <option disabled={available(db, b) < 1} key={b.id} value={b.id}>
                {b.title} · {available(db, b)} доступно
              </option>
            ))}
          </select>
          <small className="error">{errors.book?.message}</small>
        </label>
      )}
      <div className="form-row">
        <label>
          Дата выдачи
          <input
            type="date"
            max={day()}
            {...register("issued", { required: true })}
          />
        </label>
        <label>
          Вернуть до
          <input type="date" {...register("due", { required: true })} />
        </label>
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Подтвердить выдачу
      </Button>
    </form>
  );
}
