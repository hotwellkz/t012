import {
  createAutomationRun,
  updateAutomationRun,
  createAutomationEvent,
} from "../firebase/automationRunsService";
import {
  AutomationRun,
  AutomationEvent,
} from "../models/automationRun";
import * as admin from "firebase-admin";
import { getFirestore } from "../firebase/admin";

export class AutomationLogger {
  private runId: string;
  private errorsCount: number = 0;
  private jobsCreated: number = 0;
  private channelsProcessed: number = 0;

  constructor(
    runId: string,
    private initialRun: Omit<AutomationRun, "id">
  ) {
    this.runId = runId;
  }

  /**
   * Логировать событие автоматизации
   */
  async logEvent(
    event: Omit<AutomationEvent, "runId" | "createdAt">
  ): Promise<void> {
    try {
      await createAutomationEvent({
        ...event,
        runId: this.runId,
      });

      // Обновляем счетчики
      if (event.level === "error") {
        this.errorsCount++;
      }
    } catch (error: unknown) {
      // Не пробрасываем ошибку, чтобы не ломать автоматизацию
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AutomationLogger] Failed to log event (non-fatal): ${errorMessage}`
      );
    }
  }

  /**
   * Обновить информацию о запуске
   */
  async updateRun(patch: Partial<AutomationRun>): Promise<void> {
    try {
      await updateAutomationRun(this.runId, patch);
    } catch (error: unknown) {
      // Не пробрасываем ошибку, чтобы не ломать автоматизацию
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AutomationLogger] Failed to update run (non-fatal): ${errorMessage}`
      );
    }
  }

  /**
   * Увеличить счетчик созданных задач
   */
  incrementJobsCreated(): void {
    this.jobsCreated++;
  }

  /**
   * Увеличить счетчик обработанных каналов
   */
  incrementChannelsProcessed(): void {
    this.channelsProcessed++;
  }

  /**
   * Завершить запуск и обновить финальный статус
   */
  async finishRun(): Promise<void> {
    try {
      const finishedAt = admin.firestore.Timestamp.now();
      let status: AutomationRun["status"] = "success";

      if (this.errorsCount > 0) {
        if (this.jobsCreated === 0 && this.channelsProcessed === 0) {
          status = "error";
        } else {
          status = "partial";
        }
      }

      await this.updateRun({
        finishedAt,
        status,
        channelsProcessed: this.channelsProcessed,
        jobsCreated: this.jobsCreated,
        errorsCount: this.errorsCount,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[AutomationLogger] Failed to finish run (non-fatal): ${errorMessage}`
      );
    }
  }

  /**
   * Получить ID запуска
   */
  getRunId(): string {
    return this.runId;
  }

  /**
   * Получить количество обработанных каналов
   */
  getChannelsProcessed(): number {
    return this.channelsProcessed;
  }

  /**
   * Получить количество созданных задач
   */
  getJobsCreated(): number {
    return this.jobsCreated;
  }

  /**
   * Получить количество ошибок
   */
  getErrorsCount(): number {
    return this.errorsCount;
  }
}

/**
 * Создать новый логгер для запуска автоматизации
 */
export async function createAutomationLogger(
  timezone: string,
  channelsPlanned: number,
  schedulerInvocationAt?: Date
): Promise<AutomationLogger> {
  const runData: Omit<AutomationRun, "id"> = {
    startedAt: admin.firestore.Timestamp.now(),
    status: "partial",
    schedulerInvocationAt: schedulerInvocationAt
      ? admin.firestore.Timestamp.fromDate(schedulerInvocationAt)
      : undefined,
    channelsPlanned,
    channelsProcessed: 0,
    jobsCreated: 0,
    errorsCount: 0,
    timezone,
  };

  const createdRun = await createAutomationRun(runData);

  return new AutomationLogger(createdRun.id, runData);
}

