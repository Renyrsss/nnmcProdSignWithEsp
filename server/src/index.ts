// import type { Core } from '@strapi/strapi';

import { randomBytes } from "crypto";

const generateUid = (): string =>
    randomBytes(5).toString("hex").toUpperCase();

export default {
    /**
     * An asynchronous register function that runs before
     * your application is initialized.
     */
    register(/* { strapi }: { strapi: Core.Strapi } */) {},

    /**
     * Бэкфилл uid для документов, созданных до появления этого поля.
     * Идемпотентен: пропускает записи, у которых uid уже выставлен.
     */
    async bootstrap({ strapi }: { strapi: any }) {
        try {
            const pageSize = 200;
            let totalUpdated = 0;

            // Идём пакетами, чтобы не грузить всё в память.
            // Используем низкоуровневый query API — он не зависит от
            // REST-пагинации и популяций.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const batch = await strapi.db
                    .query("api::document.document")
                    .findMany({
                        where: { uid: { $null: true } },
                        select: ["id"],
                        limit: pageSize,
                    });

                if (!batch || batch.length === 0) break;

                for (const row of batch) {
                    // Ретрай на случай коллизии unique index
                    // (вероятность ~0, но обработать стоит).
                    let attempt = 0;
                    while (attempt < 3) {
                        try {
                            await strapi.db
                                .query("api::document.document")
                                .update({
                                    where: { id: row.id },
                                    data: { uid: generateUid() },
                                });
                            totalUpdated++;
                            break;
                        } catch (e) {
                            attempt++;
                            if (attempt >= 3) {
                                strapi.log.error(
                                    `[uid-backfill] не удалось проставить uid для document id=${row.id}: ${e}`
                                );
                            }
                        }
                    }
                }

                if (batch.length < pageSize) break;
            }

            if (totalUpdated > 0) {
                strapi.log.info(
                    `[uid-backfill] проставлено uid для ${totalUpdated} документов`
                );
            }
        } catch (e) {
            strapi.log.error(`[uid-backfill] миграция не выполнена: ${e}`);
        }
    },
};
