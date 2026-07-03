import { factories } from "@strapi/strapi";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const APP_ADMIN_ROLE_TYPE = "app_admin";
const APP_ADMIN_ROLE_NAMES = ["admin", "administrator", "администратор"];
const ASSIGNABLE_ROLE_TYPES = [
    "authenticated",
    "app_admin",
    "app_manager",
    "app_observer",
];

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

const cleanString = (value: any) => String(value || "").trim();

const normalizeOptionalId = (value: any) => {
    if (value === undefined || value === null || value === "" || value === "none") {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const isEmptyRelationId = (value: any) =>
    value === undefined || value === null || value === "" || value === "none";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const toSafeRole = (role: any) =>
    role
        ? {
              id: role.id,
              name: role.name,
              type: role.type,
              description: role.description,
          }
        : null;

const toSafeDepartment = (department: any) =>
    department
        ? {
              id: department.id,
              name: department.name,
          }
        : null;

const toSafeUser = (user: any) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    confirmed: user.confirmed,
    blocked: user.blocked,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    role: toSafeRole(user.role),
    department: toSafeDepartment(user.department),
    isAdmin: isAppAdminRole(user.role),
});

const getAssignableRoles = async (strapi: any) => {
    const roles = await strapi.db
        .query("plugin::users-permissions.role")
        .findMany({ orderBy: [{ name: "asc" }] });

    return roles
        .filter((role: any) => role.type !== "public")
        .filter(
            (role: any) =>
                ASSIGNABLE_ROLE_TYPES.includes(role.type) ||
                isAppAdminRole(role)
        )
        .map(toSafeRole);
};

const getRoleForAssignment = async (strapi: any, roleId: any) => {
    const useDefaultRole = isEmptyRelationId(roleId);
    const normalizedRoleId = normalizeOptionalId(roleId);
    if (useDefaultRole) {
        return strapi.db.query("plugin::users-permissions.role").findOne({
            where: { type: "authenticated" },
        });
    }
    if (!normalizedRoleId) return null;

    const role = await strapi.db
        .query("plugin::users-permissions.role")
        .findOne({ where: { id: normalizedRoleId } });

    if (!role || role.type === "public") return null;
    if (!ASSIGNABLE_ROLE_TYPES.includes(role.type) && !isAppAdminRole(role)) {
        return null;
    }

    return role;
};

const getDepartmentForAssignment = async (strapi: any, departmentId: any) => {
    const normalizedDepartmentId = normalizeOptionalId(departmentId);
    if (!normalizedDepartmentId) return null;

    return strapi.db
        .query("api::department.department")
        .findOne({ where: { id: normalizedDepartmentId } });
};

const getUserForAssignment = async (strapi: any, userId: any) => {
    const normalizedUserId = normalizeOptionalId(userId);
    if (!normalizedUserId) return null;

    return strapi.db
        .query("plugin::users-permissions.user")
        .findOne({ where: { id: normalizedUserId } });
};

const toSafeDepartmentSummary = (department: any) => ({
    id: department.id,
    name: department.name,
    usersCount: Array.isArray(department.users) ? department.users.length : 0,
    manager: department.manager
        ? {
              id: department.manager.id,
              username: department.manager.username,
              fullName: department.manager.fullName,
              email: department.manager.email,
          }
        : null,
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
});

const normalizeIdArray = (value: any) => {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
                .map((item) => Number(item))
                .filter((item) => Number.isFinite(item) && item > 0)
        )
    );
};

const normalizeDeadlineDays = (value: any) => {
    if (value === undefined || value === null || value === "") return null;

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3650) return undefined;

    return parsed;
};

const getDepartmentsForAssignment = async (strapi: any, departmentIds: any) => {
    const ids = normalizeIdArray(departmentIds);
    if (ids.length === 0) return [];

    const departments = await strapi.db
        .query("api::department.department")
        .findMany({ where: { id: { $in: ids } } });

    if (departments.length !== ids.length) return null;
    return departments;
};

const normalizeMandatorySigners = async (strapi: any, signers: any) => {
    if (!Array.isArray(signers)) return [];

    const ids = normalizeIdArray(signers.map((signer: any) => signer?.userId));
    if (ids.length === 0) return [];

    const users = await strapi.db
        .query("plugin::users-permissions.user")
        .findMany({
            where: { id: { $in: ids } },
            populate: ["department"],
        });

    if (users.length !== ids.length) return null;

    const usersById = new Map<number, any>(
        users.map((user: any) => [Number(user.id), user])
    );

    return signers
        .map((signer: any, index: number) => {
            const userId = Number(signer?.userId);
            const user = usersById.get(userId);
            if (!user) return null;

            return {
                userId: user.id,
                userName: user.fullName || user.username,
                userEmail: user.email,
                departmentId: user.department?.id || null,
                departmentName: user.department?.name || null,
                role: cleanString(signer?.role) || "Подписант",
                order: index + 1,
            };
        })
        .filter(Boolean);
};

const toSafeDocumentType = (documentType: any, documentsCount = 0) => ({
    id: documentType.id,
    documentId: documentType.documentId,
    name: documentType.name,
    requiresEds: Boolean(documentType.requiresEds),
    defaultSignatureSequential: Boolean(documentType.defaultSignatureSequential),
    signingDeadlineDays: documentType.signingDeadlineDays || null,
    mandatorySigners: Array.isArray(documentType.mandatorySigners)
        ? documentType.mandatorySigners
        : [],
    qrTemplate: documentType.qrTemplate || "",
    stampTemplate: documentType.stampTemplate || "",
    allowedDepartments: Array.isArray(documentType.allowedDepartments)
        ? documentType.allowedDepartments.map((department: any) => ({
              id: department.id,
              name: department.name,
          }))
        : [],
    documentsCount,
});

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

const ACTIVE_DOCUMENT_STATUSES = new Set(["pending", "in_progress", "revision"]);

const appendAdminAction = (
    document: any,
    admin: any,
    type: string,
    details: Record<string, any> = {}
) => [
    ...(Array.isArray(document.adminActionHistory)
        ? document.adminActionHistory
        : []),
    {
        type,
        date: new Date().toISOString(),
        adminId: admin.id,
        adminName: admin.fullName || admin.username,
        ...details,
    },
];

const normalizeDateOrNull = (value: any) => {
    if (value === undefined || value === null || value === "") return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
};

const getDocumentByNumericOrDocumentId = async (
    strapi: any,
    id: string | number,
    populate: any = []
) => {
    const numericId = Number(id);
    if (Number.isFinite(numericId)) {
        const document = await strapi.db
            .query("api::document.document")
            .findOne({ where: { id: numericId }, populate });
        if (document) return document;
    }

    return strapi.db
        .query("api::document.document")
        .findOne({ where: { documentId: String(id) }, populate });
};

const getAssignedUserIdsFromSigners = (signers: any[]) =>
    Array.from(
        new Set(
            (Array.isArray(signers) ? signers : [])
                .map((signer) => Number(signer?.userId))
                .filter((userId) => Number.isFinite(userId) && userId > 0)
        )
    );

const getRequestIp = (ctx: any) =>
    String(
        ctx.request.headers["x-forwarded-for"] ||
            ctx.request.ip ||
            ctx.req?.socket?.remoteAddress ||
            ""
    )
        .split(",")[0]
        .trim();

const createAuditLog = async (
    strapi: any,
    ctx: any,
    event: string,
    params: {
        document?: any;
        actor?: any;
        targetUser?: any;
        metadata?: Record<string, any>;
    } = {}
) => {
    try {
        const actor = params.actor || ctx.state.user || null;
        const document = params.document || null;
        const targetUser = params.targetUser || null;

        await strapi.db.query("api::audit-log.audit-log").create({
            data: {
                event,
                entityType: document ? "document" : "system",
                entityId: document?.id || null,
                entityUid: document?.uid || document?.documentId || null,
                document: document?.id || null,
                actor: actor?.id || null,
                actorName: actor
                    ? actor.fullName || actor.username || actor.email || String(actor.id)
                    : null,
                targetUser: targetUser?.id || null,
                targetUserName: targetUser
                    ? targetUser.fullName ||
                      targetUser.username ||
                      targetUser.email ||
                      String(targetUser.id)
                    : null,
                ip: getRequestIp(ctx),
                userAgent: String(ctx.request.headers["user-agent"] || ""),
                metadata: params.metadata || {},
            },
        });
    } catch (error) {
        strapi.log.warn(`[audit-log] событие ${event} не записано: ${error}`);
    }
};

const buildAdminAuditLogFilters = (query: any) => {
    const andFilters: any[] = [];

    const event = normalizeQueryValue(query.event);
    if (event && event !== "all") {
        andFilters.push({ event });
    }

    const documentId = normalizeQueryValue(query.documentId);
    if (documentId && documentId !== "all") {
        andFilters.push({ document: { id: Number(documentId) } });
    }

    const actorId = normalizeQueryValue(query.actorId);
    if (actorId && actorId !== "all") {
        andFilters.push({ actor: { id: Number(actorId) } });
    }

    const targetUserId = normalizeQueryValue(query.targetUserId);
    if (targetUserId && targetUserId !== "all") {
        andFilters.push({ targetUser: { id: Number(targetUserId) } });
    }

    const dateFrom = normalizeQueryValue(query.dateFrom);
    const dateTo = normalizeQueryValue(query.dateTo);
    if (dateFrom || dateTo) {
        const createdAt: any = {};
        if (dateFrom) createdAt.$gte = new Date(`${dateFrom}T00:00:00.000`);
        if (dateTo) createdAt.$lte = new Date(`${dateTo}T23:59:59.999`);
        andFilters.push({ createdAt });
    }

    const q = cleanString(normalizeQueryValue(query.q));
    if (q) {
        andFilters.push({
            $or: [
                { actorName: { $containsi: q } },
                { targetUserName: { $containsi: q } },
                { entityUid: { $containsi: q.replace(/^#/, "") } },
                { document: { title: { $containsi: q } } },
            ],
        });
    }

    return andFilters.length > 0 ? { $and: andFilters } : undefined;
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

const countSignedHistory = (history: any) =>
    Array.isArray(history)
        ? history.filter((item) => item?.signedAt && item?.userId).length
        : 0;

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
            await createAuditLog(strapi, ctx, "document_opened", {
                document: documents?.[0],
                actor: fullUser,
            });
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

            const response = await super.create(ctx);
            const responseData =
                response?.data ||
                (ctx.body as any)?.data ||
                (ctx.response?.body as any)?.data ||
                {};
            const createdId =
                responseData.id ||
                responseData.documentId ||
                response?.id ||
                null;
            const createdDocument = createdId
                ? await getDocumentByNumericOrDocumentId(strapi, createdId)
                : null;
            await createAuditLog(strapi, ctx, "document_created", {
                document: createdDocument,
                metadata: {
                    title: ctx.request.body?.data?.title,
                    status: ctx.request.body?.data?.status,
                    signerCount: Array.isArray(ctx.request.body?.data?.signers)
                        ? ctx.request.body.data.signers.length
                        : 0,
                },
            });
            return response;
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

            const previousSignedCount = countSignedHistory(
                document.signatureHistory
            );
            const previousStatus = document.status;
            const updateData = ctx.request.body?.data || {};

            const response = await super.update(ctx);
            const updated = await getDocumentByNumericOrDocumentId(
                strapi,
                document.id
            );
            const updatedSignedCount = countSignedHistory(
                updated?.signatureHistory
            );

            let event = "document_updated";
            if (updatedSignedCount > previousSignedCount) {
                event = "document_signed";
            }
            if (updated?.status === "completed" && previousStatus !== "completed") {
                event = "document_completed";
            }
            if (updated?.status === "revision" && previousStatus !== "revision") {
                event = "document_revision_requested";
            }

            await createAuditLog(strapi, ctx, event, {
                document: updated || document,
                metadata: {
                    previousStatus,
                    status: updated?.status || updateData.status,
                    changedFields: Object.keys(updateData),
                },
            });
            return response;
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

            const response = await super.delete(ctx);
            await createAuditLog(strapi, ctx, "document_deleted", {
                document,
                metadata: { title: document.title, status: document.status },
            });
            return response;
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
         * POST /api/admin/documents/:id/cancel
         */
        async cancelAdminDocument(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const reason = cleanString(ctx.request.body?.reason);
            if (reason.length < 3) {
                return ctx.badRequest("Укажите причину отмены документа");
            }

            const document = await getDocumentByNumericOrDocumentId(strapi, id, [
                "creator",
                "assigned_users",
            ]);
            if (!document) return ctx.notFound("Документ не найден");
            if (!ACTIVE_DOCUMENT_STATUSES.has(document.status)) {
                return ctx.badRequest("Этот документ уже нельзя отменить");
            }

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    status: "cancelled",
                    cancellationReason: reason,
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "cancel",
                        { reason }
                    ),
                },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} cancelled document=${document.id}`
            );

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });
            await createAuditLog(strapi, ctx, "document_cancelled", {
                document: updated,
                actor: admin,
                metadata: { reason },
            });
            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * POST /api/admin/documents/:id/reassign-signer
         */
        async reassignAdminDocumentSigner(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const fromUserId = Number(ctx.request.body?.fromUserId);
            const toUserId = Number(ctx.request.body?.toUserId);
            const reason = cleanString(ctx.request.body?.reason);

            if (!Number.isFinite(fromUserId) || !Number.isFinite(toUserId)) {
                return ctx.badRequest("Укажите текущего и нового подписанта");
            }
            if (fromUserId === toUserId) {
                return ctx.badRequest("Новый подписант совпадает с текущим");
            }
            if (reason.length < 3) {
                return ctx.badRequest("Укажите причину переназначения");
            }

            const [document, newUser] = await Promise.all([
                getDocumentByNumericOrDocumentId(strapi, id, [
                    "assigned_users",
                    "creator",
                ]),
                strapi.db.query("plugin::users-permissions.user").findOne({
                    where: { id: toUserId },
                    populate: ["department"],
                }),
            ]);

            if (!document) return ctx.notFound("Документ не найден");
            if (!newUser) return ctx.notFound("Новый подписант не найден");
            if (!ACTIVE_DOCUMENT_STATUSES.has(document.status)) {
                return ctx.badRequest("В этом статусе нельзя переназначить подписанта");
            }

            const signers = Array.isArray(document.signers)
                ? [...document.signers]
                : [];
            const signerIndex = signers.findIndex(
                (signer) => Number(signer?.userId) === fromUserId
            );
            if (signerIndex === -1) {
                return ctx.badRequest("Текущий подписант не найден в маршруте");
            }
            if (signers[signerIndex]?.status === "signed") {
                return ctx.badRequest("Нельзя переназначить уже подписавшего пользователя");
            }
            const duplicateSigner = signers.some(
                (signer, index) =>
                    index !== signerIndex && Number(signer?.userId) === toUserId
            );
            if (duplicateSigner) {
                return ctx.badRequest("Новый подписант уже есть в маршруте документа");
            }

            const previousSigner = signers[signerIndex];
            const updatedSigners = signers.map((signer, index) =>
                index === signerIndex
                    ? {
                          ...signer,
                          userId: newUser.id,
                          userName: newUser.fullName || newUser.username,
                          userEmail: newUser.email,
                          departmentId: newUser.department?.id || null,
                          departmentName: newUser.department?.name || null,
                          status: signer.status || "pending",
                          reassignedFromUserId: previousSigner.userId,
                          reassignedFromUserName: previousSigner.userName,
                          reassignedAt: new Date().toISOString(),
                          reassignedByAdminId: admin.id,
                      }
                    : signer
            );

            const assignedUserIds = getAssignedUserIdsFromSigners(updatedSigners);
            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    signers: updatedSigners,
                    assigned_users: assignedUserIds,
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "reassign_signer",
                        {
                            reason,
                            fromUserId,
                            fromUserName: previousSigner.userName,
                            toUserId: newUser.id,
                            toUserName: newUser.fullName || newUser.username,
                        }
                    ),
                },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} reassigned signer document=${document.id} from=${fromUserId} to=${toUserId}`
            );

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });
            await createAuditLog(strapi, ctx, "document_signer_reassigned", {
                document: updated,
                actor: admin,
                targetUser: newUser,
                metadata: {
                    reason,
                    fromUserId,
                    fromUserName: previousSigner.userName,
                    toUserId: newUser.id,
                    toUserName: newUser.fullName || newUser.username,
                },
            });
            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * PUT /api/admin/documents/:id/deadline
         */
        async updateAdminDocumentDeadline(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const signingDeadlineAt = normalizeDateOrNull(
                ctx.request.body?.signingDeadlineAt
            );
            const reason = cleanString(ctx.request.body?.reason);

            if (signingDeadlineAt === undefined) {
                return ctx.badRequest("Некорректная дата срока подписания");
            }

            const document = await getDocumentByNumericOrDocumentId(strapi, id);
            if (!document) return ctx.notFound("Документ не найден");
            if (!ACTIVE_DOCUMENT_STATUSES.has(document.status)) {
                return ctx.badRequest("В этом статусе нельзя менять срок подписания");
            }

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    signingDeadlineAt,
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "update_deadline",
                        {
                            reason,
                            previousDeadlineAt: document.signingDeadlineAt || null,
                            signingDeadlineAt,
                        }
                    ),
                },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} updated deadline document=${document.id}`
            );

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });
            await createAuditLog(strapi, ctx, "document_deadline_updated", {
                document: updated,
                actor: admin,
                metadata: {
                    reason,
                    previousDeadlineAt: document.signingDeadlineAt || null,
                    signingDeadlineAt,
                },
            });
            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * POST /api/admin/documents/:id/reminder
         */
        async requestAdminDocumentReminder(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const signerId = normalizeOptionalId(ctx.request.body?.signerId);
            const reason = cleanString(ctx.request.body?.reason);

            const document = await getDocumentByNumericOrDocumentId(strapi, id);
            if (!document) return ctx.notFound("Документ не найден");
            if (!ACTIVE_DOCUMENT_STATUSES.has(document.status)) {
                return ctx.badRequest("В этом статусе нельзя отправить напоминание");
            }

            const signers = Array.isArray(document.signers)
                ? document.signers
                : [];
            const signer = signerId
                ? signers.find((item: any) => Number(item?.userId) === signerId)
                : null;
            if (signerId && !signer) {
                return ctx.badRequest("Подписант не найден в маршруте");
            }
            if (signer && signer.status === "signed") {
                return ctx.badRequest("Пользователь уже подписал документ");
            }

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "reminder_requested",
                        {
                            reason,
                            signerId: signer?.userId || null,
                            signerName: signer?.userName || null,
                        }
                    ),
                },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} requested reminder document=${document.id}`
            );

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });
            await createAuditLog(strapi, ctx, "document_reminder_requested", {
                document: updated,
                actor: admin,
                metadata: {
                    reason,
                    signerId: signer?.userId || null,
                    signerName: signer?.userName || null,
                },
            });
            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * GET /api/admin/audit-logs
         */
        async findAdminAuditLogs(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const page = toPositiveInt(ctx.query.page, 1, 100000);
            const pageSize = toPositiveInt(ctx.query.pageSize, 50, 200);
            const filters = buildAdminAuditLogFilters(ctx.query);

            const [logs, total] = await Promise.all([
                strapi.db.query("api::audit-log.audit-log").findMany({
                    where: filters,
                    orderBy: [{ createdAt: "desc" }],
                    offset: (page - 1) * pageSize,
                    limit: pageSize,
                    populate: ["document", "actor", "targetUser"],
                }),
                strapi.db.query("api::audit-log.audit-log").count({
                    where: filters,
                }),
            ]);

            return ctx.send({
                data: logs.map((log: any) => ({
                    id: log.id,
                    event: log.event,
                    entityType: log.entityType,
                    entityId: log.entityId,
                    entityUid: log.entityUid,
                    actorName: log.actorName,
                    targetUserName: log.targetUserName,
                    ip: log.ip,
                    userAgent: log.userAgent,
                    metadata: log.metadata || {},
                    createdAt: log.createdAt,
                    document: log.document
                        ? {
                              id: log.document.id,
                              documentId: log.document.documentId,
                              uid: log.document.uid,
                              title: log.document.title,
                              status: log.document.status,
                          }
                        : null,
                    actor: log.actor
                        ? {
                              id: log.actor.id,
                              username: log.actor.username,
                              fullName: log.actor.fullName,
                              email: log.actor.email,
                          }
                        : null,
                    targetUser: log.targetUser
                        ? {
                              id: log.targetUser.id,
                              username: log.targetUser.username,
                              fullName: log.targetUser.fullName,
                              email: log.targetUser.email,
                          }
                        : null,
                })),
                meta: {
                    total,
                    page,
                    pageSize,
                    pageCount: Math.ceil(total / pageSize),
                },
            });
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

            const [users, departments, roles, documentsForSignatureStats] =
                await Promise.all([
                    strapi.db.query("plugin::users-permissions.user").findMany({
                        orderBy: [{ username: "asc" }],
                        populate: ["department", "role"],
                    }),
                    strapi.db.query("api::department.department").findMany({
                        orderBy: [{ name: "asc" }],
                        populate: ["users", "subdivisions", "manager"],
                    }),
                    getAssignableRoles(strapi),
                    strapi.db.query("api::document.document").findMany({
                        select: ["id", "signers", "signatureHistory"],
                    }),
                ]);

            const signedDocumentsCountByUser = new Map<number, number>();
            for (const document of documentsForSignatureStats || []) {
                const signedUserIds = new Set<number>();
                const signers = Array.isArray(document.signers)
                    ? document.signers
                    : [];
                const history = Array.isArray(document.signatureHistory)
                    ? document.signatureHistory
                    : [];

                for (const signer of signers) {
                    if (signer?.status === "signed") {
                        const userId = Number(signer.userId);
                        if (Number.isFinite(userId)) signedUserIds.add(userId);
                    }
                }

                for (const item of history) {
                    if (item?.signedAt && item?.userId) {
                        const userId = Number(item.userId);
                        if (Number.isFinite(userId)) signedUserIds.add(userId);
                    }
                }

                for (const userId of signedUserIds) {
                    signedDocumentsCountByUser.set(
                        userId,
                        (signedDocumentsCountByUser.get(userId) || 0) + 1
                    );
                }
            }

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
                        ...toSafeUser(user),
                        stats: {
                            createdDocumentsCount,
                            assignedDocumentsCount,
                            signedDocumentsCount:
                                signedDocumentsCountByUser.get(Number(user.id)) || 0,
                        },
                    };
                })
            );

            const safeDepartments = departments.map(toSafeDepartmentSummary);

            return ctx.send({
                data: {
                    users: usersWithStats,
                    departments: safeDepartments,
                    roles,
                },
                meta: {
                    usersCount: usersWithStats.length,
                    departmentsCount: safeDepartments.length,
                    rolesCount: roles.length,
                },
            });
        },

        /**
         * POST /api/admin/users
         */
        async createAdminUser(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const body = ctx.request.body || {};
            const username = cleanString(body.username);
            const email = cleanString(body.email).toLowerCase();
            const fullName = cleanString(body.fullName);
            const password = String(body.password || "");
            const blocked = Boolean(body.blocked);

            if (username.length < 3) {
                return ctx.badRequest("Логин должен быть не короче 3 символов");
            }
            if (!isEmail(email)) {
                return ctx.badRequest("Укажите корректный email");
            }
            if (password.length < 8) {
                return ctx.badRequest("Пароль должен быть не короче 8 символов");
            }

            const [sameUsername, sameEmail, role, department] = await Promise.all([
                strapi.db
                    .query("plugin::users-permissions.user")
                    .findOne({ where: { username } }),
                strapi.db
                    .query("plugin::users-permissions.user")
                    .findOne({ where: { email } }),
                getRoleForAssignment(strapi, body.roleId),
                getDepartmentForAssignment(strapi, body.departmentId),
            ]);

            if (sameUsername) return ctx.badRequest("Пользователь с таким логином уже существует");
            if (sameEmail) return ctx.badRequest("Пользователь с таким email уже существует");
            if (!role) return ctx.badRequest("Некорректная роль пользователя");
            if (body.departmentId && !department) {
                return ctx.badRequest("Отдел не найден");
            }

            const created = await strapi
                .plugin("users-permissions")
                .service("user")
                .add({
                    username,
                    email,
                    password,
                    fullName,
                    provider: "local",
                    confirmed: true,
                    blocked,
                    role: role.id,
                    department: department ? department.id : null,
                });

            const user = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: { id: created.id },
                    populate: ["role", "department"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} created user=${created.id}`
            );

            return ctx.created({ data: toSafeUser(user) });
        },

        /**
         * PUT /api/admin/users/:id
         */
        async updateAdminUser(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const body = ctx.request.body || {};
            const username = cleanString(body.username);
            const email = cleanString(body.email).toLowerCase();
            const fullName = cleanString(body.fullName);

            if (username.length < 3) {
                return ctx.badRequest("Логин должен быть не короче 3 символов");
            }
            if (!isEmail(email)) {
                return ctx.badRequest("Укажите корректный email");
            }

            const targetUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id }, populate: ["role"] });

            if (!targetUser) return ctx.notFound("Пользователь не найден");

            const [sameUsername, sameEmail, role, department] = await Promise.all([
                strapi.db
                    .query("plugin::users-permissions.user")
                    .findOne({ where: { username } }),
                strapi.db
                    .query("plugin::users-permissions.user")
                    .findOne({ where: { email } }),
                getRoleForAssignment(strapi, body.roleId),
                getDepartmentForAssignment(strapi, body.departmentId),
            ]);

            if (sameUsername && Number(sameUsername.id) !== Number(id)) {
                return ctx.badRequest("Пользователь с таким логином уже существует");
            }
            if (sameEmail && Number(sameEmail.id) !== Number(id)) {
                return ctx.badRequest("Пользователь с таким email уже существует");
            }
            if (!role) return ctx.badRequest("Некорректная роль пользователя");
            if (body.departmentId && !department) {
                return ctx.badRequest("Отдел не найден");
            }
            if (Number(id) === Number(admin.id) && !isAppAdminRole(role)) {
                return ctx.badRequest(
                    "Администратор не может снять админскую роль со своей учетной записи"
                );
            }

            await strapi
                .plugin("users-permissions")
                .service("user")
                .edit(targetUser.id, {
                    username,
                    email,
                    fullName,
                    role: role.id,
                    department: department ? department.id : null,
                });

            const updated = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({
                    where: { id },
                    populate: ["role", "department"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} updated user=${targetUser.id}`
            );

            return ctx.send({ data: toSafeUser(updated) });
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
         * POST /api/admin/departments
         */
        async createAdminDepartment(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const name = cleanString(ctx.request.body?.name);
            const managerId = ctx.request.body?.managerId;

            if (name.length < 2) {
                return ctx.badRequest("Название отдела должно быть не короче 2 символов");
            }

            const [sameName, manager] = await Promise.all([
                strapi.db
                    .query("api::department.department")
                    .findOne({ where: { name } }),
                getUserForAssignment(strapi, managerId),
            ]);

            if (sameName) return ctx.badRequest("Отдел с таким названием уже существует");
            if (!isEmptyRelationId(managerId) && !manager) {
                return ctx.badRequest("Руководитель отдела не найден");
            }

            const created = await strapi.db
                .query("api::department.department")
                .create({
                    data: {
                        name,
                        manager: manager ? manager.id : null,
                    },
                });

            const department = await strapi.db
                .query("api::department.department")
                .findOne({
                    where: { id: created.id },
                    populate: ["users", "subdivisions", "manager"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} created department=${created.id}`
            );

            return ctx.created({ data: toSafeDepartmentSummary(department) });
        },

        /**
         * PUT /api/admin/departments/:id
         */
        async updateAdminDepartment(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const name = cleanString(ctx.request.body?.name);
            const managerId = ctx.request.body?.managerId;

            if (name.length < 2) {
                return ctx.badRequest("Название отдела должно быть не короче 2 символов");
            }

            const targetDepartment = await strapi.db
                .query("api::department.department")
                .findOne({ where: { id } });

            if (!targetDepartment) return ctx.notFound("Отдел не найден");

            const [sameName, manager] = await Promise.all([
                strapi.db
                    .query("api::department.department")
                    .findOne({ where: { name } }),
                getUserForAssignment(strapi, managerId),
            ]);

            if (sameName && Number(sameName.id) !== Number(id)) {
                return ctx.badRequest("Отдел с таким названием уже существует");
            }
            if (!isEmptyRelationId(managerId) && !manager) {
                return ctx.badRequest("Руководитель отдела не найден");
            }

            await strapi.db.query("api::department.department").update({
                where: { id },
                data: {
                    name,
                    manager: manager ? manager.id : null,
                },
            });

            const updated = await strapi.db
                .query("api::department.department")
                .findOne({
                    where: { id },
                    populate: ["users", "subdivisions", "manager"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} updated department=${targetDepartment.id}`
            );

            return ctx.send({ data: toSafeDepartmentSummary(updated) });
        },

        /**
         * DELETE /api/admin/departments/:id
         */
        async deleteAdminDepartment(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const department = await strapi.db
                .query("api::department.department")
                .findOne({
                    where: { id },
                    populate: ["users", "subdivisions"],
                });

            if (!department) return ctx.notFound("Отдел не найден");

            const usersCount = Array.isArray(department.users)
                ? department.users.length
                : 0;
            const subdivisionsCount = Array.isArray(department.subdivisions)
                ? department.subdivisions.length
                : 0;

            if (usersCount > 0 || subdivisionsCount > 0) {
                return ctx.badRequest(
                    "Нельзя удалить отдел, пока в нем есть пользователи или подразделения"
                );
            }

            await strapi.db.query("api::department.department").delete({
                where: { id },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} deleted department=${department.id}`
            );

            return ctx.send({ data: { id: department.id } });
        },

        /**
         * GET /api/admin/document-types
         */
        async findAdminDocumentTypes(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const documentTypes = await strapi.db
                .query("api::document-type.document-type")
                .findMany({
                    orderBy: [{ name: "asc" }],
                    populate: ["allowedDepartments"],
                });

            const data = await Promise.all(
                documentTypes.map(async (documentType: any) => {
                    const documentsCount = await strapi.db
                        .query("api::document.document")
                        .count({
                            where: { documentType: { id: documentType.id } },
                        });

                    return toSafeDocumentType(documentType, documentsCount);
                })
            );

            return ctx.send({
                data,
                meta: { documentTypesCount: data.length },
            });
        },

        /**
         * POST /api/admin/document-types
         */
        async createAdminDocumentType(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const body = ctx.request.body || {};
            const name = cleanString(body.name);
            const signingDeadlineDays = normalizeDeadlineDays(
                body.signingDeadlineDays
            );

            if (name.length < 2) {
                return ctx.badRequest(
                    "Название типа документа должно быть не короче 2 символов"
                );
            }
            if (signingDeadlineDays === undefined) {
                return ctx.badRequest("Срок подписания должен быть от 1 до 3650 дней");
            }

            const [sameName, allowedDepartments, mandatorySigners] =
                await Promise.all([
                    strapi.db
                        .query("api::document-type.document-type")
                        .findOne({ where: { name } }),
                    getDepartmentsForAssignment(strapi, body.allowedDepartmentIds),
                    normalizeMandatorySigners(strapi, body.mandatorySigners),
                ]);

            if (sameName) {
                return ctx.badRequest("Тип документа с таким названием уже существует");
            }
            if (!allowedDepartments) return ctx.badRequest("Один из отделов не найден");
            if (!mandatorySigners) {
                return ctx.badRequest("Один из обязательных подписантов не найден");
            }

            const created = await strapi.db
                .query("api::document-type.document-type")
                .create({
                    data: {
                        name,
                        requiresEds: Boolean(body.requiresEds),
                        defaultSignatureSequential: Boolean(
                            body.defaultSignatureSequential
                        ),
                        signingDeadlineDays,
                        mandatorySigners,
                        qrTemplate: cleanString(body.qrTemplate),
                        stampTemplate: cleanString(body.stampTemplate),
                        allowedDepartments: allowedDepartments.map(
                            (department: any) => department.id
                        ),
                    },
                });

            const documentType = await strapi.db
                .query("api::document-type.document-type")
                .findOne({
                    where: { id: created.id },
                    populate: ["allowedDepartments"],
                });

            strapi.log.info(
                `[app-admin] user=${admin.id} created documentType=${created.id}`
            );

            return ctx.created({ data: toSafeDocumentType(documentType, 0) });
        },

        /**
         * PUT /api/admin/document-types/:id
         */
        async updateAdminDocumentType(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const body = ctx.request.body || {};
            const name = cleanString(body.name);
            const signingDeadlineDays = normalizeDeadlineDays(
                body.signingDeadlineDays
            );

            if (name.length < 2) {
                return ctx.badRequest(
                    "Название типа документа должно быть не короче 2 символов"
                );
            }
            if (signingDeadlineDays === undefined) {
                return ctx.badRequest("Срок подписания должен быть от 1 до 3650 дней");
            }

            const targetDocumentType = await strapi.db
                .query("api::document-type.document-type")
                .findOne({ where: { id } });

            if (!targetDocumentType) return ctx.notFound("Тип документа не найден");

            const [sameName, allowedDepartments, mandatorySigners] =
                await Promise.all([
                    strapi.db
                        .query("api::document-type.document-type")
                        .findOne({ where: { name } }),
                    getDepartmentsForAssignment(strapi, body.allowedDepartmentIds),
                    normalizeMandatorySigners(strapi, body.mandatorySigners),
                ]);

            if (sameName && Number(sameName.id) !== Number(id)) {
                return ctx.badRequest("Тип документа с таким названием уже существует");
            }
            if (!allowedDepartments) return ctx.badRequest("Один из отделов не найден");
            if (!mandatorySigners) {
                return ctx.badRequest("Один из обязательных подписантов не найден");
            }

            await strapi.db.query("api::document-type.document-type").update({
                where: { id },
                data: {
                    name,
                    requiresEds: Boolean(body.requiresEds),
                    defaultSignatureSequential: Boolean(
                        body.defaultSignatureSequential
                    ),
                    signingDeadlineDays,
                    mandatorySigners,
                    qrTemplate: cleanString(body.qrTemplate),
                    stampTemplate: cleanString(body.stampTemplate),
                    allowedDepartments: allowedDepartments.map(
                        (department: any) => department.id
                    ),
                },
            });

            const updated = await strapi.db
                .query("api::document-type.document-type")
                .findOne({
                    where: { id },
                    populate: ["allowedDepartments"],
                });
            const documentsCount = await strapi.db
                .query("api::document.document")
                .count({ where: { documentType: { id } } });

            strapi.log.info(
                `[app-admin] user=${admin.id} updated documentType=${targetDocumentType.id}`
            );

            return ctx.send({
                data: toSafeDocumentType(updated, documentsCount),
            });
        },

        /**
         * DELETE /api/admin/document-types/:id
         */
        async deleteAdminDocumentType(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const documentType = await strapi.db
                .query("api::document-type.document-type")
                .findOne({ where: { id } });

            if (!documentType) return ctx.notFound("Тип документа не найден");

            const documentsCount = await strapi.db
                .query("api::document.document")
                .count({ where: { documentType: { id } } });

            if (documentsCount > 0) {
                return ctx.badRequest(
                    "Нельзя удалить тип документа, к которому уже привязаны документы"
                );
            }

            await strapi.db.query("api::document-type.document-type").delete({
                where: { id },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} deleted documentType=${documentType.id}`
            );

            return ctx.send({ data: { id: documentType.id } });
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
