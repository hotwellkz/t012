import { Router, Request, Response } from "express";
import {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
  Channel,
} from "../models/channel";

const router = Router();

// GET /api/channels
router.get("/", async (req: Request, res: Response) => {
  // Устанавливаем таймаут для запроса (30 секунд)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error("[API] Таймаут запроса GET /api/channels");
      res.status(504).json({ 
        error: "Таймаут запроса",
        details: "Запрос превысил максимальное время ожидания"
      });
    }
  }, 30000);

  try {
    console.log("[API] GET /api/channels - запрос получен");
    const channels = await getAllChannels();
    console.log(`[API] GET /api/channels - получено ${channels.length} каналов`);
    
    // Отменяем таймаут, если запрос успешно выполнен
    clearTimeout(timeout);
    
    // Убеждаемся, что ответ отправляется
    if (!res.headersSent) {
      res.json(channels);
    }
  } catch (error: unknown) {
    // Отменяем таймаут при ошибке
    clearTimeout(timeout);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[API] Ошибка при получении каналов:", errorMessage);
    if (errorStack) {
      console.error("[API] Stack trace:", errorStack);
    }
    
    // Убеждаемся, что ответ отправляется даже при ошибке
    if (!res.headersSent) {
      // Если это ошибка Firebase, возвращаем более детальное сообщение
      if (errorMessage.includes("Firebase не инициализирован") || errorMessage.includes("FIREBASE_")) {
        console.error("[API] Firebase credentials отсутствуют или неверны");
        res.status(500).json({ 
          error: "Firebase не настроен. Проверьте переменные окружения FIREBASE_* в Cloud Run.",
          details: errorMessage 
        });
      } else {
        res.status(500).json({ 
          error: "Ошибка при получении каналов",
          details: errorMessage 
        });
      }
    }
  }
});

// POST /api/channels
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      language,
      durationSeconds,
      ideaPromptTemplate,
      videoPromptTemplate,
      gdriveFolderId,
      externalUrl,
      automation,
    } = req.body;

    // Валидация обязательных полей
    if (!name || !ideaPromptTemplate || !videoPromptTemplate) {
      return res.status(400).json({
        error: "Требуются поля: name, ideaPromptTemplate, videoPromptTemplate",
      });
    }

    // Генерируем ID из имени
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Валидация externalUrl, если указан
    let validatedExternalUrl: string | undefined = undefined;
    if (externalUrl && externalUrl.trim()) {
      const url = externalUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({
          error: "externalUrl должен начинаться с http:// или https://",
        });
      }
      validatedExternalUrl = url;
    }

    // Очищаем automation.times от пустых строк, если automation передано
    let cleanedAutomation = automation;
    if (automation && automation.times) {
      const cleanedTimes = automation.times.filter((time: string) => time && time.trim());
      
      // Валидация: максимум 6 роликов в день
      if (automation.frequencyPerDay > 6) {
        return res.status(400).json({
          error: "Максимальная частота генерации — 6 роликов в день",
        });
      }
      
      // Валидация: количество времён не должно превышать частоту
      if (cleanedTimes.length > automation.frequencyPerDay) {
        return res.status(400).json({
          error: `Количество времён (${cleanedTimes.length}) не должно превышать частоту генерации (${automation.frequencyPerDay})`,
        });
      }
      
      cleanedAutomation = {
        ...automation,
        times: cleanedTimes,
        // Устанавливаем timezone по умолчанию, если не указан
        timeZone: automation.timeZone || "Asia/Almaty",
      };
      
      // Рассчитываем nextRunAt, если автоматизация включена
      if (cleanedAutomation.enabled && cleanedAutomation.times.length > 0 && cleanedAutomation.daysOfWeek.length > 0) {
        const { calculateNextRunAt } = await import("../utils/automationSchedule");
        const nextRunAt = calculateNextRunAt(
          cleanedAutomation.times,
          cleanedAutomation.daysOfWeek,
          cleanedAutomation.timeZone,
          null
        );
        cleanedAutomation.nextRunAt = nextRunAt;
        
        if (nextRunAt) {
          const { formatDateInTimezone } = await import("../utils/automationSchedule");
          const nextRunString = formatDateInTimezone(nextRunAt, cleanedAutomation.timeZone);
          console.log(
            `[Channels] New channel ${id}: Next automation run scheduled for ${nextRunString} (${cleanedAutomation.timeZone})`
          );
        }
      } else {
        cleanedAutomation.nextRunAt = null;
      }
      
      cleanedAutomation.isRunning = false;
      cleanedAutomation.runId = null;
    }

    const channel = await createChannel({
      id,
      name,
      description: description || "",
      language: language || "ru",
      durationSeconds: durationSeconds || 8,
      ideaPromptTemplate,
      videoPromptTemplate,
      gdriveFolderId: gdriveFolderId && gdriveFolderId.trim() ? gdriveFolderId.trim() : null,
      externalUrl: validatedExternalUrl,
      automation: cleanedAutomation || undefined,
    });

    res.json(channel);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Ошибка при создании канала:", errorMessage);
    
    // Если это ошибка Firebase, возвращаем более детальное сообщение
    if (errorMessage.includes("Firebase не инициализирован") || errorMessage.includes("FIREBASE_")) {
      console.error("[API] Firebase credentials отсутствуют или неверны");
      return res.status(500).json({ 
        error: "Firebase не настроен. Проверьте переменные окружения FIREBASE_* в Cloud Run.",
        details: errorMessage 
      });
    }
    
    res.status(500).json({ 
      error: "Ошибка при создании канала",
      details: errorMessage 
    });
  }
});

// PUT /api/channels/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      language,
      durationSeconds,
      ideaPromptTemplate,
      videoPromptTemplate,
      gdriveFolderId,
      externalUrl,
      automation,
    } = req.body;

    // Валидация обязательных полей
    if (!name || !ideaPromptTemplate || !videoPromptTemplate) {
      return res.status(400).json({
        error: "Требуются поля: name, ideaPromptTemplate, videoPromptTemplate",
      });
    }

    // Валидация externalUrl, если указан
    let validatedExternalUrl: string | undefined = undefined;
    if (externalUrl && externalUrl.trim()) {
      const url = externalUrl.trim();
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({
          error: "externalUrl должен начинаться с http:// или https://",
        });
      }
      validatedExternalUrl = url;
    }

    // Подготовка данных для обновления
    const updateData: Partial<Channel> = {
      name,
      description: description || "",
      language: language || "ru",
      durationSeconds: durationSeconds || 8,
      ideaPromptTemplate,
      videoPromptTemplate,
      gdriveFolderId: gdriveFolderId && gdriveFolderId.trim() ? gdriveFolderId.trim() : null,
    };

    // Добавляем externalUrl только если он валиден, иначе null
    if (validatedExternalUrl) {
      updateData.externalUrl = validatedExternalUrl;
    } else {
      updateData.externalUrl = null;
    }

    // Добавляем automation только если оно передано
    if (automation !== undefined) {
      // Очищаем массив times от пустых строк
      const cleanedTimes = automation.times ? automation.times.filter((time: string) => time && time.trim()) : [];
      
      // Валидация: максимум 6 роликов в день
      if (automation.frequencyPerDay > 6) {
        return res.status(400).json({
          error: "Максимальная частота генерации — 6 роликов в день",
        });
      }
      
      // Валидация: количество времён не должно превышать частоту
      if (cleanedTimes.length > automation.frequencyPerDay) {
        return res.status(400).json({
          error: `Количество времён (${cleanedTimes.length}) не должно превышать частоту генерации (${automation.frequencyPerDay})`,
        });
      }
      
      const cleanedAutomation = {
        ...automation,
        times: cleanedTimes,
        // Устанавливаем timezone по умолчанию, если не указан
        timeZone: automation.timeZone || "Asia/Almaty",
      };
      
      // Рассчитываем nextRunAt, если автоматизация включена
      if (cleanedAutomation.enabled && cleanedAutomation.times.length > 0 && cleanedAutomation.daysOfWeek.length > 0) {
        const { calculateNextRunAt } = await import("../utils/automationSchedule");
        const nextRunAt = calculateNextRunAt(
          cleanedAutomation.times,
          cleanedAutomation.daysOfWeek,
          cleanedAutomation.timeZone,
          cleanedAutomation.lastRunAt || null
        );
        cleanedAutomation.nextRunAt = nextRunAt;
        
        if (nextRunAt) {
          const { formatDateInTimezone } = await import("../utils/automationSchedule");
          const nextRunString = formatDateInTimezone(nextRunAt, cleanedAutomation.timeZone);
          console.log(
            `[Channels] Channel ${id}: Next automation run scheduled for ${nextRunString} (${cleanedAutomation.timeZone})`
          );
        }
      } else {
        cleanedAutomation.nextRunAt = null;
      }
      
      // Сбрасываем isRunning при обновлении настроек (кроме случая, когда уже выполняется)
      if (!cleanedAutomation.isRunning) {
        cleanedAutomation.isRunning = false;
        cleanedAutomation.runId = null;
      }
      
      updateData.automation = cleanedAutomation;
    }

    const updated = await updateChannel(id, updateData);

    if (!updated) {
      return res.status(404).json({ error: "Канал не найден" });
    }

    // Возвращаем обновленный канал с актуальным nextRunAt
    res.json(updated);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Ошибка при обновлении канала:", errorMessage);
    
    // Если это ошибка Firebase, возвращаем более детальное сообщение
    if (errorMessage.includes("Firebase не инициализирован") || errorMessage.includes("FIREBASE_")) {
      console.error("[API] Firebase credentials отсутствуют или неверны");
      return res.status(500).json({ 
        error: "Firebase не настроен. Проверьте переменные окружения FIREBASE_* в Cloud Run.",
        details: errorMessage 
      });
    }
    
    res.status(500).json({ 
      error: "Ошибка при обновлении канала",
      details: errorMessage 
    });
  }
});

// DELETE /api/channels/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = await deleteChannel(id);

    if (!deleted) {
      return res.status(404).json({ error: "Канал не найден" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка при удалении канала:", error);
    res.status(500).json({ error: "Ошибка при удалении канала" });
  }
});

export default router;

