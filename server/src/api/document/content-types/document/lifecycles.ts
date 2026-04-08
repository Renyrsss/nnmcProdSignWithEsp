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

const generateUid = (): string =>
    randomBytes(5).toString("hex").toUpperCase();

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
};
