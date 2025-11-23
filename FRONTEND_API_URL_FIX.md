# Исправление ошибки ERR_CONNECTION_CLOSED на фронтенде

## Проблема

Фронтенд получает ошибку `ERR_CONNECTION_CLOSED` при запросах к `/api/channels`.

## Причина

Фронтенд использует неправильный URL backend API. В ошибке видно:
```
https://whitecoding-backend-487498983516.europe-central2.run.app
```

Но реальный URL сервиса:
```
https://whitecoding-backend-q3ppvpw4sa-lm.a.run.app
```

## Решение

### Шаг 1: Получите правильный URL backend

```powershell
gcloud run services describe whitecoding-backend --region=europe-central2 --format="value(status.url)"
```

Или в Cloud Console: **Cloud Run** → **whitecoding-backend** → вкладка **Details** → скопируйте **URL**.

### Шаг 2: Обновите переменную окружения на Netlify

1. Откройте [Netlify Dashboard](https://app.netlify.com/)
2. Выберите ваш сайт
3. Перейдите в **Site settings** → **Environment variables**
4. Найдите переменную `VITE_API_URL`
5. Обновите значение на правильный URL:
   ```
   https://whitecoding-backend-q3ppvpw4sa-lm.a.run.app
   ```
6. Сохраните изменения
7. Пересоберите сайт: **Deploys** → **Trigger deploy** → **Deploy site**

### Шаг 3: Проверьте работу

После пересборки проверьте:
1. Откройте сайт в браузере
2. Откройте DevTools (F12) → вкладка **Console**
3. Проверьте, что запросы идут на правильный URL
4. Проверьте, что нет ошибок `ERR_CONNECTION_CLOSED`

## Альтернативное решение (для локальной разработки)

Если вы разрабатываете локально, создайте файл `frontend/.env.local`:

```env
VITE_API_URL=https://whitecoding-backend-q3ppvpw4sa-lm.a.run.app
```

Или используйте прокси в `vite.config.ts` (уже настроен для `localhost:4000`).

## Диагностика

Если проблема сохраняется:

1. **Проверьте, что backend доступен:**
   ```powershell
   Invoke-WebRequest -Uri "https://whitecoding-backend-q3ppvpw4sa-lm.a.run.app/api/channels" -Method GET
   ```

2. **Проверьте логи backend:**
   ```powershell
   gcloud run services logs read whitecoding-backend --region=europe-central2 --limit=20
   ```

3. **Проверьте CORS настройки** (должны быть настроены в `backend/src/server.ts`)

4. **Проверьте переменную окружения в браузере:**
   - Откройте DevTools → Console
   - Выполните: `console.log(import.meta.env.VITE_API_URL)`
   - Должен показать правильный URL

## Важно

- URL может измениться после передеплоя Cloud Run сервиса
- Всегда используйте команду `gcloud run services describe` для получения актуального URL
- Обновляйте `VITE_API_URL` на Netlify после каждого передеплоя backend

