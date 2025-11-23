import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import channelsRouter from "./api/channels";
import ideasRouter from "./api/ideas";
import promptsRouter from "./api/prompts";
import videoRouter from "./api/video";
import videoJobsRouter from "./api/videoJobs";
import transcribeRouter from "./api/transcribe";
import titleRouter from "./api/title";
import fcmRouter from "./api/fcm";
import automationRouter from "./api/automation";
import automationDebugRouter from "./api/automationDebug";
import { getTelegramClient } from "./telegram/client";
import { initializeFirebase } from "./firebase/admin";
import * as cron from "node-cron";

// Загружаем переменные окружения
// Пытаемся загрузить из разных возможных мест
import * as path from "path";
const envPath = path.join(__dirname, '..', '.env');
dotenv.config({ path: envPath });
// Также пробуем загрузить из корня проекта
dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Middleware для логирования запросов (для отладки)
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Middleware для обработки ошибок
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[Express Error Handler] Ошибка:", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: "Внутренняя ошибка сервера",
      details: err.message || String(err)
    });
  }
});

// API Routes
app.use("/api/channels", channelsRouter);
app.use("/api/ideas", ideasRouter);
app.use("/api/prompts", promptsRouter);
app.use("/api/video", videoRouter);
app.use("/api/video-jobs", videoJobsRouter);
app.use("/api/transcribe-idea", transcribeRouter);
app.use("/api/generate-title", titleRouter);
app.use("/api/fcm", fcmRouter);
app.use("/api/automation", automationRouter);
app.use("/api/automation/debug", automationDebugRouter);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Инициализация Firebase (неблокирующая)
if (process.env.FIREBASE_PROJECT_ID) {
  try {
    initializeFirebase();
    console.log("🔥 Firebase инициализирован");
  } catch (error: any) {
    console.error("⚠️  Ошибка инициализации Firebase:", error.message);
    console.log("💡 Убедитесь, что все FIREBASE_* переменные установлены в .env");
  }
} else {
  console.warn("⚠️  Firebase не настроен (FIREBASE_PROJECT_ID не установлен)");
}

// Инициализация Telegram клиента и проверка бота при старте (неблокирующая)
// Важно: не блокируем запуск сервера, но логируем статус
if (process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH) {
  (async () => {
    try {
      console.log("🔐 Инициализация Telegram клиента...");
      const client = await getTelegramClient();
      
      // Проверяем авторизацию еще раз
      const isAuthorized = await client.checkAuthorization();
      if (!isAuthorized) {
        console.warn("⚠️  Telegram клиент не авторизован. Выполните авторизацию.");
        return;
      }

      const botUsername = process.env.SYNTX_BOT_USERNAME || "syntxaibot";
      
      // Проверяем, что бот существует
      try {
        await client.getEntity(botUsername);
        console.log(`✅ Бот ${botUsername} найден и готов к работе`);
      } catch (error: any) {
        // Если ошибка авторизации, не критично - пользователь еще не авторизован
        if (error.errorMessage === 'AUTH_KEY_UNREGISTERED') {
          console.log("⏳ Ожидание авторизации в Telegram...");
        } else {
          console.error(`[ERROR] Bot username ${botUsername} not found. Проверь SYNTX_BOT_USERNAME.`);
          console.error(`Ошибка: ${error.message}`);
          console.log("💡 Убедитесь, что бот существует и вы подписаны на него в Telegram");
        }
      }
    } catch (error: any) {
      // Если это ошибка авторизации, это нормально при первом запуске
      if (error.message?.includes('AUTH_KEY_UNREGISTERED') || error.errorMessage === 'AUTH_KEY_UNREGISTERED') {
        console.log("⏳ Ожидание авторизации в Telegram...");
      } else {
        console.error("⚠️  Ошибка инициализации Telegram клиента:", error.message);
        console.log("💡 Убедитесь, что TELEGRAM_STRING_SESSION установлен или выполните авторизацию");
      }
    }
  })();
}

// Обработка необработанных исключений и отклоненных промисов
process.on("uncaughtException", (error: Error) => {
  console.error("[CRITICAL] Необработанное исключение:", error);
  console.error("[CRITICAL] Stack:", error.stack);
  // Не завершаем процесс, чтобы сервер продолжал работать
});

process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  console.error("[CRITICAL] Необработанное отклонение промиса:", reason);
  if (reason instanceof Error) {
    console.error("[CRITICAL] Stack:", reason.stack);
  }
  // Не завершаем процесс, чтобы сервер продолжал работать
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📡 API доступен по адресу http://localhost:${PORT}/api`);
  
  // ⚠️ ВАЖНО: node-cron НЕ РАБОТАЕТ надежно в Cloud Run!
  // Cloud Run — это serverless платформа, контейнеры могут останавливаться.
  // Для production используйте Cloud Scheduler (см. CLOUD_SCHEDULER_SETUP.md)
  // 
  // Локальный планировщик оставлен только для разработки.
  // В production автоматизация должна запускаться через Cloud Scheduler,
  // который вызывает endpoint /api/automation/run-scheduled
  
  const enableLocalCron = process.env.ENABLE_LOCAL_CRON === "true";
  
  if (enableLocalCron) {
    console.log("⚠️  [WARNING] Локальный cron-планировщик включен (только для разработки!)");
    console.log("⚠️  [WARNING] В production используйте Cloud Scheduler!");
    
    // Запускаем планировщик автоматизации (только для локальной разработки)
    // Проверяем каждые 5 минут, нужно ли запускать автоматизацию
    // Используем cron: "*/5 * * * *" - каждые 5 минут
    const automationSchedule = process.env.AUTOMATION_SCHEDULE || "*/5 * * * *";
    
    cron.schedule(automationSchedule, async () => {
    try {
      // Вызываем функцию напрямую, а не через HTTP
      const { default: automationRouter } = await import("./api/automation");
      const { getAllChannels } = await import("./models/channel");
      const {
        getCurrentTimeComponentsInTimezone,
        getDayOfWeekInTimezone,
        DEFAULT_TIMEZONE,
        formatDateInTimezone,
      } = await import("./utils/automationSchedule");
      
      const currentTimeUTC = new Date();
      const timeString = formatDateInTimezone(Date.now(), DEFAULT_TIMEZONE);
      
      console.log("[Automation Scheduler] Running scheduled automation check...");
      console.log(`[Automation Scheduler] UTC time: ${currentTimeUTC.toISOString()}`);
      console.log(`[Automation Scheduler] ${DEFAULT_TIMEZONE} time: ${timeString}`);
      
      const intervalMinutes = 10;
      const channels = await getAllChannels();
      const enabledChannels = channels.filter(
        (ch) => ch.automation?.enabled === true
      );
      
      console.log(
        `[Automation Scheduler] Found ${enabledChannels.length} channels with automation enabled`
      );
      
      // Импортируем функции для проверки и создания задач
      const automationModule = await import("./api/automation");
      const createAutomatedJob = automationModule.createAutomatedJob;
      
      let jobsCreated = 0;
      for (const channel of enabledChannels) {
        try {
          const timezone = channel.automation?.timeZone || DEFAULT_TIMEZONE;
          const currentTimeComponents = getCurrentTimeComponentsInTimezone(timezone);
          const currentTimeUTC = new Date();
          
          // Проверяем день недели
          const [currentDay, currentDayNumber] = getDayOfWeekInTimezone(
            currentTimeUTC,
            timezone
          );
          const isDayMatch =
            channel.automation?.daysOfWeek.includes(currentDay) ||
            channel.automation?.daysOfWeek.includes(currentDayNumber);
          
          if (!isDayMatch) {
            continue;
          }
          
          // Проверяем время
          const currentHour = currentTimeComponents.hour;
          const currentMinute = currentTimeComponents.minute;
          
          let shouldRun = false;
          for (const scheduledTime of channel.automation?.times || []) {
            if (!scheduledTime || scheduledTime.trim() === "") {
              continue;
            }
            
            const [scheduledHour, scheduledMinute] = scheduledTime
              .split(":")
              .map(Number);
            
            const diffMinutes =
              (currentHour * 60 + currentMinute) - (scheduledHour * 60 + scheduledMinute);
            
            if (diffMinutes >= 0 && diffMinutes <= intervalMinutes) {
              // Проверяем, не было ли уже запуска сегодня
              if (channel.automation?.lastRunAt) {
                const lastRunDate = new Date(channel.automation.lastRunAt);
                const lastRunFormatter = new Intl.DateTimeFormat("en-US", {
                  timeZone: timezone,
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
                const lastRunParts = lastRunFormatter.formatToParts(lastRunDate);
                const lastRunYear = parseInt(lastRunParts.find((p) => p.type === "year")!.value);
                const lastRunMonth = parseInt(lastRunParts.find((p) => p.type === "month")!.value) - 1;
                const lastRunDay = parseInt(lastRunParts.find((p) => p.type === "day")!.value);
                const lastRunHour = parseInt(lastRunParts.find((p) => p.type === "hour")!.value);
                const lastRunMinute = parseInt(lastRunParts.find((p) => p.type === "minute")!.value);
                
                if (
                  lastRunYear === currentTimeComponents.year &&
                  lastRunMonth === currentTimeComponents.month &&
                  lastRunDay === currentTimeComponents.day &&
                  lastRunHour === scheduledHour &&
                  lastRunMinute === scheduledMinute
                ) {
                  continue;
                }
              }
              shouldRun = true;
              break;
            }
          }
          
          if (shouldRun && !channel.automation?.isRunning) {
            console.log(
              `[Automation Scheduler] Channel ${channel.id} (${channel.name}) should run automation (timezone: ${timezone})`
            );
            const jobId = await createAutomatedJob(channel);
            if (jobId) {
              jobsCreated++;
            }
          }
        } catch (error: any) {
          console.error(
            `[Automation Scheduler] Error processing channel ${channel.id}:`,
            error
          );
        }
      }
      
      console.log(
        `[Automation Scheduler] ✅ Check completed: ${enabledChannels.length} channels processed, ${jobsCreated} jobs created`
      );
    } catch (error: any) {
      console.error("[Automation Scheduler] Error:", error.message);
    }
    }, {
      timezone: "Asia/Almaty", // Используем Asia/Almaty для планировщика
    });
    
    console.log(`⏰ [LOCAL DEV] Планировщик автоматизации запущен (расписание: ${automationSchedule}, timezone: Asia/Almaty)`);
    console.log(`⚠️  [LOCAL DEV] Это работает только локально! В production используйте Cloud Scheduler!`);
  } else {
    console.log("ℹ️  Локальный cron-планировщик отключен (ENABLE_LOCAL_CRON != true)");
    console.log("ℹ️  Для автоматизации в production настройте Cloud Scheduler (см. CLOUD_SCHEDULER_SETUP.md)");
    console.log("ℹ️  Endpoint для Cloud Scheduler: POST /api/automation/run-scheduled");
  }
});

