import { Router, Request, Response } from "express";
import {
  getRecentAutomationRuns,
  getAutomationRun,
  getAutomationEvents,
  getLastSuccessfulRun,
} from "../firebase/automationRunsService";
import { getAllChannels } from "../models/channel";
import { DEFAULT_TIMEZONE } from "../utils/automationSchedule";

const router = Router();

/**
 * GET /api/automation/debug/runs
 * Возвращает последние N запусков автоматизации
 */
router.get("/runs", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const runs = await getRecentAutomationRuns(limit);

    // Конвертируем Timestamp в ISO строки для JSON
    const runsDTO = runs.map((run) => ({
      id: run.id,
      startedAt: run.startedAt.toDate().toISOString(),
      finishedAt: run.finishedAt?.toDate().toISOString() || null,
      status: run.status,
      schedulerInvocationAt: run.schedulerInvocationAt?.toDate().toISOString() || null,
      channelsPlanned: run.channelsPlanned,
      channelsProcessed: run.channelsProcessed,
      jobsCreated: run.jobsCreated,
      errorsCount: run.errorsCount,
      lastErrorMessage: run.lastErrorMessage || null,
      timezone: run.timezone,
    }));

    res.json(runsDTO);
  } catch (error: any) {
    console.error("[AutomationDebug] Error getting runs:", error);
    res.status(500).json({
      error: "Ошибка при получении запусков",
      message: error.message,
    });
  }
});

/**
 * GET /api/automation/debug/run/:runId
 * Возвращает детали конкретного запуска и его события
 */
router.get("/run/:runId", async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const run = await getAutomationRun(runId);
    if (!run) {
      return res.status(404).json({
        error: "Запуск не найден",
      });
    }

    const events = await getAutomationEvents(runId, limit);

    // Конвертируем Timestamp в ISO строки для JSON
    const runDTO = {
      id: run.id,
      startedAt: run.startedAt.toDate().toISOString(),
      finishedAt: run.finishedAt?.toDate().toISOString() || null,
      status: run.status,
      schedulerInvocationAt: run.schedulerInvocationAt?.toDate().toISOString() || null,
      channelsPlanned: run.channelsPlanned,
      channelsProcessed: run.channelsProcessed,
      jobsCreated: run.jobsCreated,
      errorsCount: run.errorsCount,
      lastErrorMessage: run.lastErrorMessage || null,
      timezone: run.timezone,
    };

    const eventsDTO = events.map((event) => ({
      runId: event.runId,
      createdAt: event.createdAt.toDate().toISOString(),
      level: event.level,
      step: event.step,
      channelId: event.channelId || null,
      channelName: event.channelName || null,
      message: event.message,
      details: event.details || null,
    }));

    res.json({
      run: runDTO,
      events: eventsDTO,
    });
  } catch (error: any) {
    console.error(`[AutomationDebug] Error getting run ${req.params.runId}:`, error);
    res.status(500).json({
      error: "Ошибка при получении запуска",
      message: error.message,
    });
  }
});

/**
 * GET /api/automation/debug/system
 * Возвращает системную информацию об автоматизации
 */
router.get("/system", async (req: Request, res: Response) => {
  try {
    const channels = await getAllChannels();
    
    // Детальное логирование для диагностики
    console.log(`[AutomationDebug] Total channels: ${channels.length}`);
    channels.forEach((ch) => {
      if (ch.automation) {
        console.log(
          `[AutomationDebug] Channel ${ch.id} (${ch.name}): automation.enabled=${ch.automation.enabled}, type=${typeof ch.automation.enabled}`
        );
      }
    });
    
    const enabledChannels = channels.filter(
      (ch) => ch.automation?.enabled === true
    );
    
    console.log(
      `[AutomationDebug] Enabled channels: ${enabledChannels.length} (${enabledChannels.map(c => `${c.id} (${c.name})`).join(', ')})`
    );

    const lastSuccessfulRun = await getLastSuccessfulRun();

    // Получаем информацию о часовом поясе
    const timezone = DEFAULT_TIMEZONE;
    const timezoneOffset = new Date().toLocaleString("en-US", {
      timeZone: timezone,
      timeZoneName: "short",
    });

    // Вычисляем время последнего успешного запуска
    let lastSuccessfulRunTime: string | null = null;
    if (lastSuccessfulRun) {
      lastSuccessfulRunTime = lastSuccessfulRun.startedAt.toDate().toISOString();
    }

    res.json({
      timezone,
      timezoneDisplay: `${timezone} (${timezoneOffset.split(" ").pop() || ""})`,
      automationEnabled: enabledChannels.length > 0,
      enabledChannelsCount: enabledChannels.length,
      lastSuccessfulRunTime,
      schedulerJobId: "automation-run-scheduled", // Из документации
      schedulerSchedule: "*/5 * * * *", // Каждые 5 минут
      schedulerTimezone: "Asia/Almaty",
    });
  } catch (error: any) {
    console.error("[AutomationDebug] Error getting system info:", error);
    res.status(500).json({
      error: "Ошибка при получении системной информации",
      message: error.message,
    });
  }
});

export default router;

