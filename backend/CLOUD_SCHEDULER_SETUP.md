# Настройка Cloud Scheduler для автоматизации роликов

## ❗ ПРОБЛЕМА

Cloud Run — это serverless платформа, которая:
- Запускает контейнеры только при HTTP-запросах
- Может останавливать контейнеры при отсутствии активности
- НЕ гарантирует постоянную работу фоновых процессов

**node-cron внутри контейнера НЕ РАБОТАЕТ надежно в Cloud Run**, потому что:
- Контейнер может быть остановлен в любой момент
- Даже если контейнер работает, он может быть перезапущен
- Фоновые задачи не поддерживаются в serverless режиме

## ✅ РЕШЕНИЕ: Cloud Scheduler

Используем **Google Cloud Scheduler** для периодического вызова HTTP endpoint `/api/automation/run-scheduled`.

Cloud Scheduler — это управляемый сервис, который:
- Гарантированно выполняет запросы по расписанию
- Работает независимо от состояния Cloud Run контейнера
- Надежен и масштабируем

---

## 📋 Инструкция по настройке

### Шаг 1: Получите URL вашего Cloud Run сервиса

**Для Linux/Mac (bash):**
```bash
gcloud run services describe whitecoding-backend \
  --region=europe-central2 \
  --format="value(status.url)"
```

**Для Windows PowerShell:**
```powershell
gcloud run services describe whitecoding-backend --region=europe-central2 --format="value(status.url)"
```

Или используйте обратный апостроф для многострочной команды в PowerShell:
```powershell
gcloud run services describe whitecoding-backend `
  --region=europe-central2 `
  --format="value(status.url)"
```

Или найдите URL в Cloud Console: **Cloud Run** → **whitecoding-backend** → вкладка **Details**.

Пример URL: `https://whitecoding-backend-487498983516.europe-central2.run.app`

### Шаг 2: Создайте Cloud Scheduler Job

**Для Linux/Mac (bash):**
```bash
gcloud scheduler jobs create http automation-run-scheduled \
  --location=europe-central2 \
  --schedule="*/5 * * * *" \
  --uri="https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --time-zone="Asia/Almaty" \
  --attempt-deadline=300s \
  --description="Запуск автоматизации роликов каждые 5 минут"
```

**Для Windows PowerShell (одна строка):**
```powershell
gcloud scheduler jobs create http automation-run-scheduled --location=europe-central2 --schedule="*/5 * * * *" --uri="https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled" --http-method=POST --headers="Content-Type=application/json" --time-zone="Asia/Almaty" --attempt-deadline=300s --description="Запуск автоматизации роликов каждые 5 минут"
```

**Для Windows PowerShell (многострочная команда с обратным апострофом):**
```powershell
gcloud scheduler jobs create http automation-run-scheduled `
  --location=europe-central2 `
  --schedule="*/5 * * * *" `
  --uri="https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled" `
  --http-method=POST `
  --headers="Content-Type=application/json" `
  --time-zone="Asia/Almaty" `
  --attempt-deadline=300s `
  --description="Запуск автоматизации роликов каждые 5 минут"
```

**⚠️ ВАЖНО:** В PowerShell используйте обратный апостроф `` ` `` (не обратный слэш `\`) для продолжения строки!

**Параметры:**
- `automation-run-scheduled` — имя job (можно изменить)
- `--schedule="*/5 * * * *"` — каждые 5 минут (cron формат)
- `--uri` — URL вашего Cloud Run сервиса + `/api/automation/run-scheduled`
- `--time-zone="Asia/Almaty"` — часовой пояс для расписания
- `--attempt-deadline=300s` — таймаут 5 минут (300 секунд)

### Шаг 3: Настройте аутентификацию (если требуется)

**⚠️ ВАЖНО:** Если ваш Cloud Run сервис публичный (`--allow-unauthenticated`), аутентификация не требуется, и этот шаг можно пропустить.

Если ваш Cloud Run сервис требует аутентификацию:

**1. Получите ваш Project ID:**

**Bash/PowerShell:**
```bash
gcloud config get-value project
```

Или:
```bash
gcloud projects list --format="value(projectId)"
```

**2. Создайте service account (если еще не создан):**

**Bash:**
```bash
gcloud iam service-accounts create automation-scheduler \
  --display-name="Automation Scheduler"
```

**PowerShell:**
```powershell
gcloud iam service-accounts create automation-scheduler --display-name="Automation Scheduler"
```

**3. Дайте права на вызов Cloud Run:**

**Bash:**
```bash
gcloud run services add-iam-policy-binding whitecoding-backend \
  --region=europe-central2 \
  --member="serviceAccount:automation-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

**PowerShell:**
```powershell
gcloud run services add-iam-policy-binding whitecoding-backend --region=europe-central2 --member="serviceAccount:automation-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com" --role="roles/run.invoker"
```

**⚠️ Замените `YOUR_PROJECT_ID` на ваш реальный Project ID!**

**4. Обновите job с service account:**

**Bash:**
```bash
gcloud scheduler jobs update http automation-run-scheduled \
  --location=europe-central2 \
  --oauth-service-account-email="automation-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

**PowerShell:**
```powershell
gcloud scheduler jobs update http automation-run-scheduled --location=europe-central2 --oauth-service-account-email="automation-scheduler@YOUR_PROJECT_ID.iam.gserviceaccount.com"
```

**Пример с реальным Project ID (videobot-478618):**
```powershell
gcloud run services add-iam-policy-binding whitecoding-backend --region=europe-central2 --member="serviceAccount:automation-scheduler@videobot-478618.iam.gserviceaccount.com" --role="roles/run.invoker"
```

### Шаг 4: Проверьте работу

1. **Проверьте статус job:**

**Bash:**
```bash
gcloud scheduler jobs describe automation-run-scheduled \
  --location=europe-central2
```

**PowerShell:**
```powershell
gcloud scheduler jobs describe automation-run-scheduled --location=europe-central2
```

2. **Запустите job вручную для теста:**

**Bash:**
```bash
gcloud scheduler jobs run automation-run-scheduled \
  --location=europe-central2
```

**PowerShell:**
```powershell
gcloud scheduler jobs run automation-run-scheduled --location=europe-central2
```

3. **Проверьте логи Cloud Run:**

**Bash:**
```bash
gcloud run services logs read whitecoding-backend \
  --region=europe-central2 \
  --limit=50
```

**PowerShell:**
```powershell
gcloud run services logs read whitecoding-backend --region=europe-central2 --limit=50
```

Должны увидеть:
```
[Automation] ===== SCHEDULED AUTOMATION CHECK STARTED =====
[Automation] UTC time: 2025-11-22T...
[Automation] Found X channels with automation enabled
[Automation] ===== SCHEDULED AUTOMATION CHECK COMPLETED =====
```

4. **Проверьте логи Cloud Scheduler:**

**Bash:**
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=automation-run-scheduled" \
  --limit=10 \
  --format=json
```

**PowerShell:**
```powershell
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=automation-run-scheduled" --limit=10 --format=json
```

---

## 🔧 Обновление расписания

Если нужно изменить частоту проверки (например, каждые 1 минуту):

**Bash:**
```bash
gcloud scheduler jobs update http automation-run-scheduled \
  --location=europe-central2 \
  --schedule="*/1 * * * *"
```

**PowerShell:**
```powershell
gcloud scheduler jobs update http automation-run-scheduled --location=europe-central2 --schedule="*/1 * * * *"
```

**Варианты расписания:**
- `*/1 * * * *` — каждую минуту
- `*/5 * * * *` — каждые 5 минут (рекомендуется)
- `*/10 * * * *` — каждые 10 минут
- `0 * * * *` — каждый час

---

## 🗑️ Удаление job

Если нужно удалить планировщик:

**Bash:**
```bash
gcloud scheduler jobs delete automation-run-scheduled \
  --location=europe-central2
```

**PowerShell:**
```powershell
gcloud scheduler jobs delete automation-run-scheduled --location=europe-central2
```

---

## ⚠️ ВАЖНО

1. **Cloud Scheduler имеет лимиты:**
   - Бесплатный тариф: 3 job'а на проект
   - Платный тариф: до 500 job'ов
   - Минимальный интервал: 1 минута

2. **Стоимость:**
   - Cloud Scheduler: первые 3 job'а бесплатно, далее $0.10 за job/месяц
   - Cloud Run: платите только за время выполнения запросов

3. **Мониторинг:**
   - Настройте алерты в Cloud Monitoring для отслеживания ошибок
   - Проверяйте логи регулярно

---

## 🔍 Диагностика проблем

### Job не запускается

1. Проверьте статус job:

**Bash/PowerShell:**
```bash
gcloud scheduler jobs describe automation-run-scheduled --location=europe-central2
```

2. Проверьте логи Cloud Scheduler:

**Bash/PowerShell:**
```bash
gcloud logging read "resource.type=cloud_scheduler_job AND resource.labels.job_id=automation-run-scheduled" --limit=20
```

3. Убедитесь, что URL правильный и доступен:

**Bash (curl):**
```bash
curl -X POST https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled
```

**PowerShell (Invoke-WebRequest):**
```powershell
Invoke-WebRequest -Uri "https://whitecoding-backend-487498983516.europe-central2.run.app/api/automation/run-scheduled" -Method POST
```

### Job запускается, но автоматизация не работает

1. Проверьте логи Cloud Run на наличие ошибок
2. Убедитесь, что каналы имеют `automation.enabled = true`
3. Проверьте, что время и дни недели настроены правильно
4. Используйте кнопку "Запустить сейчас" для ручного тестирования

---

## 📝 Альтернативные решения

Если Cloud Scheduler не подходит, можно использовать:

1. **Cloud Tasks** — для более сложных сценариев с очередями
2. **Cloud Functions** — для легковесных задач
3. **Compute Engine VM** — для постоянной работы фоновых процессов (дороже)

Но для данной задачи **Cloud Scheduler — оптимальное решение**.

