import { factories } from "@strapi/strapi";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const makeS3Client = () =>
    new S3Client({
        credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY!,
            secretAccessKey: process.env.MINIO_SECRET_KEY!,
        },
        region: "us-east-1",
        endpoint: process.env.MINIO_ENDPOINT,
        forcePathStyle: true,
    });

const checkMinioEnv = (ctx: any) => {
    if (
        !process.env.MINIO_ENDPOINT ||
        !process.env.MINIO_BUCKET ||
        !process.env.MINIO_ACCESS_KEY ||
        !process.env.MINIO_SECRET_KEY
    ) {
        ctx.internalServerError("MinIO не настроен");
        return false;
    }
    return true;
};

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        /**
         * GET /api/documents/mine?role=creator|assigned|all
         *
         * Возвращает документы, относящиеся к текущему пользователю.
         * Авторизация выполняется на сервере: фильтр по user.id берётся
         * из ctx.state.user, клиент не может его подменить.
         *
         * Использует document layer (strapi.documents) — он возвращает
         * distinct-документы, минуя баг REST-пагинации с дублями строк
         * при JOIN на many-to-many (assigned_users).
         *
         * На этом шаге пагинация не выставляется наружу: возвращаем все
         * записи одним ответом, чтобы клиентский UI (с пагинацией в JS)
         * продолжил работать без переписывания. Server-side пагинация
         * фильтров — отдельной задачей.
         */
        async findMine(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            // Строгий whitelist: невалидное значение — 400, а не молчаливый
            // fallback. Это защищает от опечаток и от попыток передать мусор.
            const ALLOWED_ROLES = ["creator", "assigned", "all"] as const;
            const role = (ctx.query.role as string) || "all";
            if (!ALLOWED_ROLES.includes(role as any)) {
                return ctx.badRequest(
                    `Параметр role должен быть одним из: ${ALLOWED_ROLES.join(", ")}`
                );
            }

            let filters: any;
            if (role === "creator") {
                filters = { creator: { id: user.id } };
            } else if (role === "assigned") {
                filters = { assigned_users: { id: user.id } };
            } else {
                filters = {
                    $or: [
                        { creator: { id: user.id } },
                        { assigned_users: { id: user.id } },
                    ],
                };
            }

            // КРИТИЧНО: для creator явно перечисляем безопасные поля.
            // Без fields populate подтягивает ВСЕ колонки таблицы users,
            // включая password (bcrypt), resetPasswordToken,
            // confirmationToken, provider — это PII и секреты.
            // Для media-файлов тоже ограничиваем поля, чтобы не светить
            // provider_metadata и внутреннюю структуру storage.
            const populate = {
                creator: {
                    fields: ["id", "username", "fullName", "email"],
                    populate: {
                        department: { fields: ["id", "name"] },
                    },
                },
                documentType: { fields: ["id", "name"] },
                originalFile: {
                    fields: ["id", "name", "hash", "ext", "mime", "size", "url"],
                },
                currentFile: {
                    fields: ["id", "name", "hash", "ext", "mime", "size", "url"],
                },
                subdivision: { fields: ["id", "name"] },
            } as any;

            // Идём пакетами через document layer — это безопасно для
            // больших коллекций и не нарвётся на REST maxLimit.
            const PAGE_SIZE = 200;
            let start = 0;
            const all: any[] = [];

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const batch = await strapi
                    .documents("api::document.document")
                    .findMany({
                        filters,
                        populate,
                        sort: { createdAt: "desc" } as any,
                        start,
                        limit: PAGE_SIZE,
                    } as any);

                if (!batch || batch.length === 0) break;
                all.push(...batch);
                if (batch.length < PAGE_SIZE) break;
                start += PAGE_SIZE;
            }

            // Дополнительная защита: прогоняем ответ через стандартный
            // sanitize Strapi. Даже если где-то в populate просочится
            // чувствительное поле — sanitize его срежет по правилам
            // content-type (private fields, password и т.п.).
            const sanitized = await this.sanitizeOutput(all, ctx);

            return ctx.send({
                data: sanitized,
                meta: { total: Array.isArray(sanitized) ? sanitized.length : 0 },
            });
        },

        /**
         * GET /api/documents/:id/file-url?file=current|original
         * Returns a pre-signed MinIO URL for the document's main file (15 min TTL).
         * Accessible only to the document creator or assigned users.
         */
        async getFileUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const fileType = (ctx.query.file as string) || "current";

            const document = await strapi
                .documents("api::document.document")
                .findOne({
                    documentId: id,
                    populate: [
                        "currentFile",
                        "originalFile",
                        "creator",
                        "assigned_users",
                    ],
                });

            if (!document) return ctx.notFound("Документ не найден");

            const isCreator = document.creator?.id === user.id;
            const isAssigned = (document.assigned_users as any[])?.some(
                (u) => u.id === user.id
            );
            if (!isCreator && !isAssigned)
                return ctx.forbidden("Нет доступа к этому документу");

            const file =
                fileType === "original"
                    ? document.originalFile
                    : document.currentFile;

            if (!file) return ctx.notFound("Файл не найден");

            if (!checkMinioEnv(ctx)) return;

            const key = `${file.hash}${file.ext}`;
            const command = new GetObjectCommand({
                Bucket: process.env.MINIO_BUCKET,
                Key: key,
            });

            const signedUrl = await getSignedUrl(makeS3Client(), command, {
                expiresIn: 900,
            });

            return ctx.send({ url: signedUrl });
        },

        /**
         * GET /api/documents/:id/presign?key=<objectKey>
         * Returns a pre-signed MinIO URL for any file associated with a document
         * (e.g. CMS signature files stored in signatureHistory).
         * Accessible only to the document creator or assigned users.
         */
        async presignUrl(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const key = ctx.query.key as string;
            if (!key) return ctx.badRequest("Параметр key обязателен");

            const document = await strapi
                .documents("api::document.document")
                .findOne({
                    documentId: id,
                    populate: ["creator", "assigned_users"],
                });

            if (!document) return ctx.notFound("Документ не найден");

            const isCreator = document.creator?.id === user.id;
            const isAssigned = (document.assigned_users as any[])?.some(
                (u) => u.id === user.id
            );
            if (!isCreator && !isAssigned)
                return ctx.forbidden("Нет доступа к этому документу");

            if (!checkMinioEnv(ctx)) return;

            const command = new GetObjectCommand({
                Bucket: process.env.MINIO_BUCKET,
                Key: key,
            });

            const signedUrl = await getSignedUrl(makeS3Client(), command, {
                expiresIn: 900,
            });

            return ctx.send({ url: signedUrl });
        },
    })
);
