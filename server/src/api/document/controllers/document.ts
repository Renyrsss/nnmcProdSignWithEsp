import { factories } from "@strapi/strapi";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const APP_ADMIN_ROLE_TYPE = "app_admin";
const APP_ADMIN_ROLE_NAMES = ["admin", "administrator", "администратор"];

const isAppAdminRole = (role: any): boolean => {
    if (!role) return false;
    const type = String(role.type || "").toLowerCase();
    const name = String(role.name || "").toLowerCase();
    return (
        type === APP_ADMIN_ROLE_TYPE ||
        APP_ADMIN_ROLE_NAMES.includes(type) ||
        APP_ADMIN_ROLE_NAMES.includes(name)
    );
};

const getAuthenticatedUser = async (strapi: any, userId: number | string) => {
    return strapi.db.query("plugin::users-permissions.user").findOne({
        where: { id: userId },
        populate: ["role", "department"],
    });
};

const requireAppAdmin = async (ctx: any, strapi: any) => {
    const user = ctx.state.user;
    if (!user) {
        ctx.unauthorized("Необходима авторизация");
        return null;
    }

    const fullUser = await getAuthenticatedUser(strapi, user.id);
    if (!isAppAdminRole(fullUser?.role)) {
        ctx.forbidden("Требуется роль администратора");
        return null;
    }

    return fullUser;
};

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

const isMinioConfigured = () =>
    !!process.env.MINIO_ENDPOINT &&
    !!process.env.MINIO_BUCKET &&
    !!process.env.MINIO_ACCESS_KEY &&
    !!process.env.MINIO_SECRET_KEY;

/**
 * Строит абсолютный URL для файла, отдаваемого локальным провайдером Strapi.
 * В dev без MinIO файлы лежат в public/uploads/, и в media-объекте поле
 * `url` содержит относительный путь вида "/uploads/xxx.pdf". Клиенту нужен
 * абсолютный URL, поэтому дополняем его origin'ом сервера.
 */
const buildLocalFileUrl = (ctx: any, relativeUrl: string): string => {
    if (!relativeUrl) return "";
    if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
    const origin = `${ctx.request.protocol}://${ctx.request.host}`;
    return `${origin}${relativeUrl}`;
};

const getDocumentPopulate = () =>
    ({
        creator: {
            fields: ["id", "username", "fullName", "email", "blocked"],
            populate: {
                department: { fields: ["id", "name"] },
                role: { fields: ["id", "name", "type"] },
            },
        },
        documentType: { fields: ["id", "name"] },
        originalFile: {
            fields: ["id", "name", "hash", "ext", "mime", "size", "url"],
        },
        currentFile: {
            fields: ["id", "name", "hash", "ext", "mime", "size", "url"],
        },
        subdivision: {
            fields: ["id", "name"],
            populate: {
                department: { fields: ["id", "name"] },
            },
        },
        assigned_users: {
            fields: ["id", "username", "fullName", "email", "blocked"],
            populate: {
                department: { fields: ["id", "name"] },
            },
        },
    }) as any;

const normalizeQueryValue = (value: any) => {
    if (Array.isArray(value)) return value[0];
    return value;
};

const buildAdminDocumentFilters = (query: any) => {
    const andFilters: any[] = [];

    const status = normalizeQueryValue(query.status);
    if (status && status !== "all") {
        andFilters.push({ status });
    }

    const departmentId = normalizeQueryValue(query.departmentId);
    if (departmentId && departmentId !== "all") {
        andFilters.push({ creator: { department: { id: Number(departmentId) } } });
    }

    const subdivisionId = normalizeQueryValue(query.subdivisionId);
    if (subdivisionId && subdivisionId !== "all") {
        andFilters.push({ subdivision: { id: Number(subdivisionId) } });
    }

    const creatorId = normalizeQueryValue(query.creatorId);
    if (creatorId && creatorId !== "all") {
        andFilters.push({ creator: { id: Number(creatorId) } });
    }

    const signerId = normalizeQueryValue(query.signerId);
    if (signerId && signerId !== "all") {
        andFilters.push({ assigned_users: { id: Number(signerId) } });
    }

    const documentTypeId = normalizeQueryValue(query.documentTypeId);
    if (documentTypeId && documentTypeId !== "all") {
        andFilters.push({ documentType: { id: Number(documentTypeId) } });
    }

    const dateFrom = normalizeQueryValue(query.dateFrom);
    const dateTo = normalizeQueryValue(query.dateTo);
    if (dateFrom || dateTo) {
        const createdAt: any = {};
        if (dateFrom) createdAt.$gte = new Date(`${dateFrom}T00:00:00.000`);
        if (dateTo) createdAt.$lte = new Date(`${dateTo}T23:59:59.999`);
        andFilters.push({ createdAt });
    }

    const q = String(normalizeQueryValue(query.q) || "").trim();
    if (q) {
        const normalizedQ = q.replace(/^#/, "");
        andFilters.push({
            $or: [
                { title: { $containsi: q } },
                { uid: { $containsi: normalizedQ } },
            ],
        });
    }

    return andFilters.length > 0 ? { $and: andFilters } : undefined;
};

const toPositiveInt = (value: any, fallback: number, max: number) => {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
};

const findDocumentForAccess = async (strapi: any, id: string | number) => {
    try {
        const document = await strapi
            .documents("api::document.document")
            .findOne({
                documentId: String(id),
                populate: ["creator", "assigned_users"],
            });
        if (document) return document;
    } catch {
        // Numeric legacy routes can pass the database id instead of documentId.
    }

    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    const documents = await strapi
        .documents("api::document.document")
        .findMany({
            filters: { id: numericId },
            populate: ["creator", "assigned_users"],
            limit: 1,
        } as any);

    return documents?.[0] || null;
};

const canReadOrUpdateDocument = (document: any, user: any, isAdmin: boolean) => {
    if (isAdmin) return true;
    const isCreator = Number(document.creator?.id) === Number(user.id);
    const isAssigned = (document.assigned_users as any[])?.some(
        (assignedUser) => Number(assignedUser.id) === Number(user.id)
    );
    return isCreator || isAssigned;
};

export default factories.createCoreController(
    "api::document.document",
    ({ strapi }) => ({
        async find(ctx) {
            return (this as any).findMine(ctx);
        },

        async findOne(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const documentId = ctx.params.documentId || ctx.params.id;
            const document = await findDocumentForAccess(strapi, documentId);
            if (!document) return ctx.notFound("Документ не найден");

            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            if (!canReadOrUpdateDocument(document, user, isAdmin)) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            const documents = await strapi
                .documents("api::document.document")
                .findMany({
                    filters: { id: document.id },
                    populate: getDocumentPopulate(),
                    limit: 1,
                } as any);

            const sanitized = await this.sanitizeOutput(documents?.[0], ctx);
            return ctx.send({ data: sanitized });
        },

        async create(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            ctx.request.body = {
                ...ctx.request.body,
                data: {
                    ...(ctx.request.body?.data || {}),
                    creator: user.id,
                },
            };

            return super.create(ctx);
        },

        async update(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const documentId = ctx.params.documentId || ctx.params.id;
            const document = await findDocumentForAccess(strapi, documentId);
            if (!document) return ctx.notFound("Документ не найден");

            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            if (!canReadOrUpdateDocument(document, user, isAdmin)) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            return super.update(ctx);
        },

        async delete(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const documentId = ctx.params.documentId || ctx.params.id;
            const document = await findDocumentForAccess(strapi, documentId);
            if (!document) return ctx.notFound("Документ не найден");

            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            const isCreator = Number(document.creator?.id) === Number(user.id);
            if (!isAdmin && !isCreator) {
                return ctx.forbidden("Удалить документ может только автор");
            }

            return super.delete(ctx);
        },

        /**
         * GET /api/admin/me
         *
         * Safe current-user payload for the SPA. Standard users/me can sanitize
         * relations differently depending on users-permissions settings, while
         * the client needs a stable role signal to render admin navigation.
         */
        async getAppMe(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const fullUser = await getAuthenticatedUser(strapi, user.id);
            if (!fullUser) return ctx.notFound("Пользователь не найден");

            return ctx.send({
                data: {
                    id: fullUser.id,
                    username: fullUser.username,
                    email: fullUser.email,
                    fullName: fullUser.fullName,
                    confirmed: fullUser.confirmed,
                    blocked: fullUser.blocked,
                    role: fullUser.role
                        ? {
                              id: fullUser.role.id,
                              name: fullUser.role.name,
                              type: fullUser.role.type,
                          }
                        : null,
                    department: fullUser.department
                        ? {
                              id: fullUser.department.id,
                              name: fullUser.department.name,
                          }
                        : null,
                    isAdmin: isAppAdminRole(fullUser.role),
                },
            });
        },

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
            const populate = getDocumentPopulate();

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
         * GET /api/admin/documents
         *
         * Возвращает все документы для app-admin с серверной фильтрацией.
         * Клиентские фильтры не являются защитой доступа, поэтому роль
         * проверяется на сервере перед любым чтением данных.
         */
        async findAdminDocuments(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const page = toPositiveInt(ctx.query.page, 1, 100000);
            const pageSize = toPositiveInt(ctx.query.pageSize, 50, 200);
            const filters = buildAdminDocumentFilters(ctx.query);

            const [documents, total] = await Promise.all([
                strapi.documents("api::document.document").findMany({
                    filters,
                    populate: getDocumentPopulate(),
                    sort: { createdAt: "desc" } as any,
                    start: (page - 1) * pageSize,
                    limit: pageSize,
                } as any),
                strapi.documents("api::document.document").count({
                    filters,
                } as any),
            ]);

            const sanitized = await this.sanitizeOutput(documents, ctx);

            return ctx.send({
                data: sanitized,
                meta: {
                    total,
                    page,
                    pageSize,
                    pageCount: Math.ceil(total / pageSize),
                },
            });
        },

        /**
         * GET /api/admin/documents/:id
         */
        async findAdminDocument(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const numericId = Number(id);
            const filters = Number.isFinite(numericId)
                ? { id: numericId }
                : { documentId: id };

            const documents = await strapi
                .documents("api::document.document")
                .findMany({
                    filters,
                    populate: getDocumentPopulate(),
                    limit: 1,
                } as any);

            if (!documents?.length) return ctx.notFound("Документ не найден");

            const sanitized = await this.sanitizeOutput(documents[0], ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * GET /api/admin/users
         *
         * Список пользователей, отделов и подразделений для админской страницы.
         * Пароли, reset tokens и прочие private поля не возвращаются.
         */
        async findAdminUsers(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const [users, departments] = await Promise.all([
                strapi.db.query("plugin::users-permissions.user").findMany({
                    orderBy: [{ username: "asc" }],
                    populate: ["department", "role"],
                }),
                strapi.db.query("api::department.department").findMany({
                    orderBy: [{ name: "asc" }],
                    populate: ["users", "subdivisions"],
                }),
            ]);

            const usersWithStats = await Promise.all(
                users.map(async (user: any) => {
                    const [createdDocumentsCount, assignedDocumentsCount] =
                        await Promise.all([
                            strapi.db.query("api::document.document").count({
                                where: { creator: { id: user.id } },
                            }),
                            strapi.db.query("api::document.document").count({
                                where: { assigned_users: { id: user.id } },
                            }),
                        ]);

                    return {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        fullName: user.fullName,
                        confirmed: user.confirmed,
                        blocked: user.blocked,
                        createdAt: user.createdAt,
                        updatedAt: user.updatedAt,
                        role: user.role
                            ? {
                                  id: user.role.id,
                                  name: user.role.name,
                                  type: user.role.type,
                              }
                            : null,
                        department: user.department
                            ? {
                                  id: user.department.id,
                                  name: user.department.name,
                              }
                            : null,
                        isAdmin: isAppAdminRole(user.role),
                        stats: {
                            createdDocumentsCount,
                            assignedDocumentsCount,
                        },
                    };
                })
            );

            const safeDepartments = departments.map((department: any) => ({
                id: department.id,
                name: department.name,
                usersCount: Array.isArray(department.users)
                    ? department.users.length
                    : 0,
                subdivisions: Array.isArray(department.subdivisions)
                    ? department.subdivisions
                          .map((subdivision: any) => ({
                              id: subdivision.id,
                              name: subdivision.name,
                          }))
                          .sort((a: any, b: any) =>
                              (a.name || "").localeCompare(b.name || "", "ru")
                          )
                    : [],
            }));

            return ctx.send({
                data: {
                    users: usersWithStats,
                    departments: safeDepartments,
                },
                meta: {
                    usersCount: usersWithStats.length,
                    departmentsCount: safeDepartments.length,
                },
            });
        },

        /**
         * PUT /api/admin/users/:id/password
         */
        async updateAdminUserPassword(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const password = String(ctx.request.body?.password || "");

            if (password.length < 8) {
                return ctx.badRequest("Пароль должен быть не короче 8 символов");
            }

            const targetUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id }, populate: ["role"] });

            if (!targetUser) return ctx.notFound("Пользователь не найден");

            await strapi
                .plugin("users-permissions")
                .service("user")
                .edit(targetUser.id, { password });

            strapi.log.info(
                `[app-admin] user=${admin.id} changed password for user=${targetUser.id}`
            );

            return ctx.send({ data: { id: targetUser.id } });
        },

        /**
         * PUT /api/admin/users/:id/status
         */
        async updateAdminUserStatus(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const blocked = Boolean(ctx.request.body?.blocked);

            if (Number(id) === Number(admin.id) && blocked) {
                return ctx.badRequest(
                    "Администратор не может заблокировать свою учетную запись"
                );
            }

            const targetUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id }, populate: ["role"] });

            if (!targetUser) return ctx.notFound("Пользователь не найден");

            const updated = await strapi.db
                .query("plugin::users-permissions.user")
                .update({
                    where: { id },
                    data: { blocked },
                    populate: ["role", "department"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} set blocked=${blocked} for user=${targetUser.id}`
            );

            return ctx.send({
                data: {
                    id: updated.id,
                    blocked: updated.blocked,
                },
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
            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            if (!isCreator && !isAssigned && !isAdmin)
                return ctx.forbidden("Нет доступа к этому документу");

            const file =
                fileType === "original"
                    ? document.originalFile
                    : document.currentFile;

            if (!file) return ctx.notFound("Файл не найден");

            // Dev / локальный провайдер: MinIO не настроен — отдаём прямой
            // URL файла из public/uploads/. Никакого presign не требуется,
            // файлы публично доступны по /uploads/<hash><ext>.
            if (!isMinioConfigured()) {
                return ctx.send({ url: buildLocalFileUrl(ctx, file.url) });
            }

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
            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            if (!isCreator && !isAssigned && !isAdmin)
                return ctx.forbidden("Нет доступа к этому документу");

            // Dev / локальный провайдер: MinIO нет — ключ трактуем как
            // относительный путь внутри public/uploads/ и отдаём прямой URL.
            // Лёгкий sanity-check чтобы не дать клиенту достучаться до
            // произвольного файла через path traversal.
            if (!isMinioConfigured()) {
                if (key.includes("..") || key.startsWith("/")) {
                    return ctx.badRequest("Некорректный ключ файла");
                }
                const relative = `/uploads/${key}`;
                return ctx.send({ url: buildLocalFileUrl(ctx, relative) });
            }

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
