# Штаб — стратегический офис

Веб-приложение для планирования Sellerator, агентства ITIS, курсов и личных целей.
Фронтенд: Vite + JS. Данные и вход: Supabase (проект ITIS marketing, таблицы `shtab_*`).

## Первый запуск

1. **Supabase → SQL Editor**: выполнить `supabase/001_init.sql` (таблицы, доступы, realtime), затем файл переноса данных `002_data.sql` (его нет в репозитории: в нём личные данные, он передаётся отдельно).
2. **Supabase → Authentication → URL Configuration**:
   - Site URL: `https://shtab.itis.marketing`
   - Redirect URLs: `https://shtab.itis.marketing/**` и временный адрес Timeweb `https://*.twc1.net/**`
3. **Timeweb Cloud → App Platform → Создать → Frontend**:
   - репозиторий из GitHub, ветка `main`, автодеплой — включён;
   - фреймворк: Vite (или «Другой»), команда сборки `npm run build`, директория сборки `dist`;
   - переменные окружения: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (значения — в `.env.example` и в чате).
4. Привязать домен `shtab.itis.marketing`, включить SSL.

## Доступ

- Список команды — таблица `shtab_members` (email, role: owner | member).
- `owner` видит всё, `member` — всё, кроме коллекций `life/*` (Личное, Финплан).
- Вход — ссылкой на email (Supabase Auth). Без строки в `shtab_members` данных не видно.

Добавить участника: `insert into shtab_members (email, role, name) values ('user@mail.ru','member','Имя');`

## Как устроены данные

Одна таблица `shtab_docs`: `path` (например `tasks/p1005-01`), `coll` (`tasks`), `data` (jsonb).
`src/db.js` даёт приложению документный API (doc / collection / onSnapshot) поверх Supabase,
изменения других пользователей приходят через Realtime.

## Разработка

```
npm install
cp .env.example .env   # вставить ключи
npm run dev
```
Изменения вносит Claude в этом репозитории; каждый push в `main` Timeweb собирает и публикует сам.
