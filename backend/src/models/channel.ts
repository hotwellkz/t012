export type Language = "ru" | "kk" | "en";

export interface ChannelAutomation {
  enabled: boolean;
  frequencyPerDay: number; // 0, 1, 2, 3, 4, 5, 6
  times: string[]; // ["10:00", "15:00"] в формате HH:mm
  daysOfWeek: string[]; // ["Mon", "Tue", ...] или ["1", "2", ...]
  autoApproveAndUpload: boolean;
  useOnlyFreshIdeas: boolean;
  maxActiveTasks: number;
  lastRunAt?: number | null; // Timestamp последнего запуска
  timeZone?: string; // Часовой пояс, например "Asia/Almaty"
  nextRunAt?: number | null; // Timestamp следующего запланированного запуска
  isRunning?: boolean; // Флаг, что автоматизация сейчас выполняет цикл
  runId?: string | null; // ID текущего запуска для отслеживания
}

export interface Channel {
  id: string;
  name: string;
  description: string; // Краткое описание стиля канала
  language: Language; // Основной язык ролика
  durationSeconds: number; // Целевая длительность (по умолчанию 8)
  ideaPromptTemplate: string; // Шаблон промпта для генерации идей
  videoPromptTemplate: string; // Шаблон промпта для генерации финального промпта Veo
  gdriveFolderId?: string | null; // ID папки Google Drive для этого канала (если null, используется GDRIVE_FOLDER_ID из .env)
  externalUrl?: string | null; // Ссылка на YouTube-канал
  automation?: ChannelAutomation; // Настройки автоматизации
}

// Экспортируем функции из Firebase сервиса
export {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} from "../firebase/channelsService";

