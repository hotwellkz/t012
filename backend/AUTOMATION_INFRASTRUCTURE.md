# Инфраструктура автоматизации роликов

## Обзор

Автоматизация роликов в WhiteCoding Studio работает через следующую цепочку:

```
Cloud Scheduler (каждые 5 минут)
    ↓
    POST /api/automation/run-scheduled (с OIDC токеном)
    ↓
Cloud Run (whitecoding-backend)
    ↓
Проверка каналов с automation.enabled = true
    ↓
Создание задач генерации (IDEAS → PROMPT → VIDEO)
```

## Компоненты

### 1. Cloud Scheduler Job

**Имя:** `automation-run-scheduled`  
**Регион:** `europe-central2`  
**Проект:** `videobot-478618`

**Настройки:**
- **Расписание:** `*/5 * * * *` (каждые 5 минут)
- **Timezone:** `Asia/Almaty`
- **URL:** `https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled`
- **Метод:** `POST`
- **Аутентификация:** OIDC токен от сервис-аккаунта `automation-runner@videobot-478618.iam.gserviceaccount.com`

### 2. Сервис-аккаунт для автоматизации

**Имя:** `automation-runner`  
**Email:** `automation-runner@videobot-478618.iam.gserviceaccount.com`  
**Роль:** `roles/run.invoker` (для вызова Cloud Run)

### 3. Cloud Run сервис

**Имя:** `whitecoding-backend`  
**Регион:** `europe-central2`  
**URL:** `https://whitecoding-backend-487498983516.europe-central2.run.app`

## Команды для управления

### Проверка статуса Cloud Scheduler job

```bash
gcloud scheduler jobs describe automation-run-scheduled --location=europe-central2
```

### Ручной запуск автоматизации (для тестирования)

```bash
gcloud scheduler jobs run automation-run-scheduled --location=europe-central2
```

### Просмотр логов Cloud Run

```bash
gcloud run services logs read whitecoding-backend --region=europe-central2 --limit=50
```

### Проверка IAM политики Cloud Run

```bash
gcloud run services get-iam-policy whitecoding-backend --region=europe-central2
```

### Обновление расписания

```bash
gcloud scheduler jobs update http automation-run-scheduled \
  --location=europe-central2 \
  --schedule="*/5 * * * *"
```

### Обновление сервис-аккаунта в Scheduler

```bash
gcloud scheduler jobs update http automation-run-scheduled \
  --location=europe-central2 \
  --oidc-service-account-email=automation-runner@videobot-478618.iam.gserviceaccount.com
```

## Диагностика проблем

### Проблема: Scheduler не вызывает Cloud Run

1. **Проверьте статус job:**
   ```bash
   gcloud scheduler jobs describe automation-run-scheduled --location=europe-central2 --format="value(state)"
   ```
   Должно быть: `ENABLED`

2. **Проверьте логи Scheduler:**
   - Cloud Console → Cloud Scheduler → automation-run-scheduled → History
   - Ищите ошибки аутентификации или сетевые ошибки

3. **Проверьте права сервис-аккаунта:**
   ```bash
   gcloud run services get-iam-policy whitecoding-backend --region=europe-central2
   ```
   Убедитесь, что `automation-runner@videobot-478618.iam.gserviceaccount.com` имеет роль `roles/run.invoker`

### Проблема: Backend не обрабатывает запросы

1. **Проверьте логи Cloud Run:**
   ```bash
   gcloud run services logs read whitecoding-backend --region=europe-central2 --limit=50 | grep "Automation"
   ```

2. **Проверьте, что endpoint существует:**
   ```bash
   curl -X POST https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled
   ```

3. **Проверьте, что каналы имеют `automation.enabled = true`**

### Проблема: Автоматизация не создает задачи

1. **Проверьте логи backend на наличие ошибок:**
   ```bash
   gcloud run services logs read whitecoding-backend --region=europe-central2 --limit=100 | grep -i "error\|failed"
   ```

2. **Проверьте настройки канала в UI:**
   - Автоматизация включена
   - Указаны дни недели
   - Указаны времена генерации
   - Не превышен лимит активных задач

## Создание/восстановление инфраструктуры

### Создание сервис-аккаунта

```bash
gcloud iam service-accounts create automation-runner \
  --display-name="Automation Runner" \
  --project=videobot-478618
```

### Выдача прав на вызов Cloud Run

```bash
gcloud run services add-iam-policy-binding whitecoding-backend \
  --member="serviceAccount:automation-runner@videobot-478618.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=europe-central2
```

### Создание Cloud Scheduler job

```bash
gcloud scheduler jobs create http automation-run-scheduled \
  --location=europe-central2 \
  --schedule="*/5 * * * *" \
  --uri="https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --time-zone="Asia/Almaty" \
  --attempt-deadline=300s \
  --oidc-service-account-email=automation-runner@videobot-478618.iam.gserviceaccount.com \
  --description="Запуск автоматизации роликов каждые 5 минут"
```

## Важные замечания

1. **Сервис-аккаунт:** Используется `automation-runner@videobot-478618.iam.gserviceaccount.com`, НЕ `automation-scheduler` (старый) и НЕ `videobot-478618@appspot.gserviceaccount.com` (не существует)

2. **Расписание:** Job запускается каждые 5 минут, но backend сам решает, для каких каналов и когда создавать задачи на основе их индивидуальных настроек

3. **Timezone:** Все расписания хранятся и обрабатываются в `Asia/Almaty` (UTC+6)

4. **Логирование:** Все вызовы автоматизации логируются в Cloud Run с префиксом `[Automation]`

## Мониторинг

### Ключевые метрики для отслеживания:

1. **Частота вызовов Scheduler:**
   - Cloud Console → Cloud Scheduler → automation-run-scheduled → History
   - Должны быть успешные вызовы каждые 5 минут

2. **Обработка запросов в Cloud Run:**
   - Cloud Console → Cloud Run → whitecoding-backend → Logs
   - Ищите строки `[Automation] ===== SCHEDULED AUTOMATION CHECK STARTED =====`

3. **Создание задач:**
   - Логи должны показывать `[Automation] Jobs created: X`
   - Проверьте Firestore коллекцию `videoJobs` на наличие новых задач с `isAuto: true`

## Обновление URL

Если URL Cloud Run сервиса изменился после передеплоя:

1. Получите новый URL:
   ```bash
   gcloud run services describe whitecoding-backend --region=europe-central2 --format="value(status.url)"
   ```

2. Обновите Scheduler job:
   ```bash
   gcloud scheduler jobs update http automation-run-scheduled \
     --location=europe-central2 \
     --uri="https://NEW_URL/api/automation/run-scheduled"
   ```

3. Обновите audience в OIDC токене (если нужно):
   ```bash
   gcloud scheduler jobs update http automation-run-scheduled \
     --location=europe-central2 \
     --oidc-service-account-email=automation-runner@videobot-478618.iam.gserviceaccount.com
   ```

