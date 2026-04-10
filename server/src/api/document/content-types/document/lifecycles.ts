/**
 * Lifecycle hooks для коллекции documents.
 *
 * Назначение: автоматически генерировать короткий уникальный `uid` при создании
 * документа. Это позволяет хранить произвольные (в т.ч. одинаковые) `title`,
 * а уникальность обеспечивать отдельным полем — чистое разделение
 * "человеческой метки" и "системного идентификатора".
 *
 * Формат uid: 10 hex-символов в верхнем регистре (5 байт энтропии = 2^40),
 * читаемо, копируемо, годится для отображения как badge в UI.
 */

import { randomBytes } from "crypto";
import { errors } from "@strapi/utils";

const { ApplicationError } = errors;

const generateUid = (): string =>
    randomBytes(5).toString("hex").toUpperCase();

// Статусы, в которых документ "заморожен" для процесса подписания.
// - cancelled: автор отменил, документ мёртв.
// - completed: все подписали, нет смысла менять.
// - revision: автор отозвал на корректировку, подписанты НЕ могут
//   ставить подписи, пока автор не зальёт новую версию (handleResend
//   переведёт обратно в in_progress и сбросит signers).
const FROZEN_STATUSES = new Set(["cancelled", "completed", "revision"]);
const TERMINAL_STATUSES = new Set(["cancelled", "completed"]);

export default {
    async beforeCreate(event: any) {
        const data = event.params?.data;
        if (!data) return;

        // Если uid передан явно (например, при импорте) — уважаем.
        if (data.uid && typeof data.uid === "string" && data.uid.trim()) {
            return;
        }

        data.uid = generateUid();
    },

    /**
     * Защита от подписания отозванных/завершённых документов.
     *
     * Сценарий бага: автор отзывает документ (status = cancelled),
     * но фронт подписанта кэширует старую версию и позволяет подписать.
     * Раньше это проходило через update, потому что сервер ничего не
     * проверял. Теперь — блокируем на уровне БД.
     *
     * Разрешаем только обновление "безобидных" полей (например, title)
     * и явный возврат из cancelled/completed в активный статус — на случай
     * если понадобится "вернуть в работу" (этого в UI сейчас нет, но
     * оставляем возможность для будущего).
     */
    async beforeUpdate(event: any) {
        const where = event.params?.where;
        const data = event.params?.data || {};
        if (!where) return;

        // Подгружаем текущее состояние документа из БД.
        // strapi — глобальный объект в Strapi v5 lifecycles.
        const current = await (strapi as any).db
            .query("api::document.document")
            .findOne({ where, select: ["id", "status"] });

        if (!current) return;
        if (!FROZEN_STATUSES.has(current.status)) return;

        // В frozen-статусах запрещаем любые изменения, которые
        // затрагивают процесс подписания: signers, signatureHistory.
        //
        // ВАЖНО про currentFile: для revision автор должен иметь
        // возможность загрузить исправленную версию (handleResend),
        // поэтому currentFile блокируем только для cancelled/completed.
        const baseForbidden = ["signers", "signatureHistory"];
        const forbiddenFields = TERMINAL_STATUSES.has(current.status)
            ? [...baseForbidden, "currentFile"]
            : baseForbidden;

        // Исключение: handleResend — легитимный переход revision → in_progress,
        // он шлёт одним запросом { status: "in_progress", signers, currentFile,
        // signatureHistory }. Если в этом же апдейте меняется status из revision
        // в активный — разрешаем изменение signers/history/currentFile.
        const isRevisionResend =
            current.status === "revision" &&
            "status" in data &&
            (data.status === "in_progress" || data.status === "pending");

        if (!isRevisionResend) {
            for (const field of forbiddenFields) {
                if (field in data) {
                    throw new ApplicationError(
                        `Документ в статусе "${current.status}" — изменение поля "${field}" запрещено`
                    );
                }
            }
        }

        // Запрет на переход в другой терминальный статус (нельзя отозвать
        // уже завершённый и т.п.). Для revision это не применяется.
        if (
            TERMINAL_STATUSES.has(current.status) &&
            "status" in data &&
            TERMINAL_STATUSES.has(data.status) &&
            data.status !== current.status
        ) {
            throw new ApplicationError(
                `Документ уже в статусе "${current.status}" и не может быть переведён в "${data.status}"`
            );
        }
    },
};
