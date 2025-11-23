/**
 * Утилиты для работы с расписанием автоматизации
 * 
 * ВАЖНО: Расписание задаётся в локальном времени Asia/Almaty (UTC+6).
 * Внутри всё хранится в UTC (ISO timestamp).
 * nextRunAt на фронт всегда отдаётся в UTC и потом конвертируется в Asia/Almaty для отображения.
 */

const DEFAULT_TIMEZONE = "Asia/Almaty"; // UTC+6

/**
 * Получает компоненты текущего времени в указанном часовом поясе
 * Возвращает объект с компонентами времени (год, месяц, день, час, минута)
 */
export function getCurrentTimeComponentsInTimezone(
  timezone: string = DEFAULT_TIMEZONE
): { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number } {
  const now = new Date();
  // Используем Intl API для работы с timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value);
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayOfWeek = dayNames.indexOf(weekday);

  return { year, month, day, hour, minute, dayOfWeek };
}

/**
 * Преобразует локальное время в указанном timezone в UTC timestamp
 * 
 * Правильный алгоритм через итеративное уточнение:
 * 1. Начинаем с приблизительной оценки (предполагая фиксированный offset)
 * 2. Итеративно уточняем, пока не получим точное совпадение
 * 
 * @param year - год в локальном времени timezone
 * @param month - месяц (0-11) в локальном времени timezone
 * @param day - день в локальном времени timezone
 * @param hour - час (0-23) в локальном времени timezone
 * @param minute - минута (0-59) в локальном времени timezone
 * @param timezone - часовой пояс (например, "Asia/Almaty")
 * @returns UTC timestamp (milliseconds)
 */
export function localTimeToUTCTimestamp(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string = DEFAULT_TIMEZONE
): number {
  // Начальная оценка: предполагаем UTC+6 для Asia/Almaty
  // Но это может быть неточно из-за DST, поэтому используем итеративное уточнение
  let candidate = Date.UTC(year, month, day, hour - 6, minute, 0);
  
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  
  // Итеративно уточняем timestamp (максимум 10 итераций)
  for (let i = 0; i < 10; i++) {
    const date = new Date(candidate);
    const parts = formatter.formatToParts(date);
    
    const tzYear = parseInt(parts.find((p) => p.type === "year")!.value);
    const tzMonth = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
    const tzDay = parseInt(parts.find((p) => p.type === "day")!.value);
    const tzHour = parseInt(parts.find((p) => p.type === "hour")!.value);
    const tzMinute = parseInt(parts.find((p) => p.type === "minute")!.value);
    
    // Если совпадает - возвращаем
    if (
      tzYear === year &&
      tzMonth === month &&
      tzDay === day &&
      tzHour === hour &&
      tzMinute === minute
    ) {
      return candidate;
    }
    
    // Вычисляем разницу в минутах
    const diffMinutes =
      (tzYear - year) * 365 * 24 * 60 +
      (tzMonth - month) * 30 * 24 * 60 +
      (tzDay - day) * 24 * 60 +
      (tzHour - hour) * 60 +
      (tzMinute - minute);
    
    // Корректируем candidate
    candidate = candidate - diffMinutes * 60 * 1000;
  }
  
  // Если после итераций не совпало точно, возвращаем последнее значение
  // (должно быть достаточно близко)
  return candidate;
}


/**
 * Получает день недели в указанном часовом поясе
 * Возвращает массив: ["Mon", "1"] для совместимости
 */
export function getDayOfWeekInTimezone(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string[] {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  
  const dayName = formatter.format(date);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayIndex = dayNames.indexOf(dayName);
  const dayNumber = String(dayIndex === 0 ? 7 : dayIndex); // 1-7, где 1 = воскресенье
  
  return [dayName, dayNumber];
}

/**
 * Вычисляет следующее время запуска автоматизации
 * 
 * ВАЖНО: times должны быть в формате "HH:mm" и интерпретируются как локальное время в указанном timezone.
 * Результат возвращается как UTC timestamp.
 */
export function calculateNextRunAt(
  times: string[], // ["10:00", "15:00"] - локальное время в timezone
  daysOfWeek: string[], // ["Mon", "Tue", "1", "2"]
  timezone: string = DEFAULT_TIMEZONE,
  lastRunAt?: number | null
): number | null {
  if (times.length === 0 || daysOfWeek.length === 0) {
    return null;
  }

  // Получаем текущее время в указанном timezone
  const nowComponents = getCurrentTimeComponentsInTimezone(timezone);
  const nowUTC = new Date();
  
  // Парсим дни недели
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const validDays = daysOfWeek
    .map((d) => {
      const dayIndex = dayNames.indexOf(d);
      if (dayIndex >= 0) return dayIndex;
      const num = parseInt(d);
      if (num >= 1 && num <= 7) return num === 7 ? 0 : num;
      return null;
    })
    .filter((d): d is number => d !== null);

  if (validDays.length === 0) {
    return null;
  }

  // Парсим времена (HH:mm в локальном времени timezone)
  const validTimes = times
    .map((t) => {
      if (!t || t.trim() === "") return null;
      const [h, m] = t.split(":").map(Number);
      if (isNaN(h) || isNaN(m)) return null;
      return { hour: h, minute: m };
    })
    .filter((t): t is { hour: number; minute: number } => t !== null);

  if (validTimes.length === 0) {
    return null;
  }

  // Ищем ближайшее время в ближайшие 7 дней
  let candidateTimestamp: number | null = null;
  
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    // Вычисляем дату в указанном timezone
    const checkDate = new Date(nowComponents.year, nowComponents.month, nowComponents.day + dayOffset);
    
    // Получаем день недели для этой даты в указанном timezone
    const [dayName] = getDayOfWeekInTimezone(checkDate, timezone);
    const dayIndex = dayNames.indexOf(dayName);
    
    if (!validDays.includes(dayIndex)) {
      continue;
    }

    for (const time of validTimes) {
      // Создаем локальное время в указанном timezone
      const localYear = nowComponents.year;
      const localMonth = nowComponents.month;
      const localDay = nowComponents.day + dayOffset;
      
      // Если это сегодня и время уже прошло, пропускаем
      if (dayOffset === 0) {
        const currentMinutes = nowComponents.hour * 60 + nowComponents.minute;
        const scheduledMinutes = time.hour * 60 + time.minute;
        if (scheduledMinutes <= currentMinutes) {
          continue;
        }
      }
      
      // Преобразуем локальное время в UTC timestamp
      // Важно: time.hour и time.minute - это локальное время в указанном timezone
      const candidateUTC = localTimeToUTCTimestamp(
        localYear,
        localMonth,
        localDay,
        time.hour,
        time.minute,
        timezone
      );
      
      // Проверяем, не был ли это последний запуск
      if (lastRunAt) {
        const lastRunComponents = getTimeComponentsFromUTC(lastRunAt, timezone);
        if (
          localYear === lastRunComponents.year &&
          localMonth === lastRunComponents.month &&
          localDay === lastRunComponents.day &&
          time.hour === lastRunComponents.hour &&
          time.minute === lastRunComponents.minute
        ) {
          continue;
        }
      }
      
      if (!candidateTimestamp || candidateUTC < candidateTimestamp) {
        candidateTimestamp = candidateUTC;
      }
    }
  }

  return candidateTimestamp;
}

/**
 * Получает компоненты времени из UTC timestamp в указанном timezone
 */
function getTimeComponentsFromUTC(
  utcTimestamp: number,
  timezone: string = DEFAULT_TIMEZONE
): { year: number; month: number; day: number; hour: number; minute: number } {
  const date = new Date(utcTimestamp);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value) - 1,
    day: parseInt(parts.find((p) => p.type === "day")!.value),
    hour: parseInt(parts.find((p) => p.type === "hour")!.value),
    minute: parseInt(parts.find((p) => p.type === "minute")!.value),
  };
}


/**
 * Форматирует дату для отображения в указанном timezone
 */
export function formatDateInTimezone(
  timestamp: number,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export { DEFAULT_TIMEZONE };

