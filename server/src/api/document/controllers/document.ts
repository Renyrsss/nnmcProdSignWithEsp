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
    sessionVersion: user.sessionVersion || 1,
    forcedLogoutAt: user.forcedLogoutAt || null,
    lastSeenAt: user.lastSeenAt || null,
    lastSeenIp: user.lastSeenIp || null,
    lastSeenUserAgent: user.lastSeenUserAgent || null,
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

    const securitySettings = await getOrCreateSecuritySettings(strapi);
    if (
        securitySettings.ipRestrictionEnabled &&
        !isIpAllowed(getRequestIp(ctx), securitySettings.allowedIpRanges)
    ) {
        await createAuditLog(strapi, ctx, "security_suspicious_action", {
            actor: fullUser,
            metadata: {
                reason: "admin_ip_restricted",
                ip: getRequestIp(ctx),
            },
        });
        ctx.forbidden("Доступ администратора с этого IP запрещен");
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
        archivedBy: {
            fields: ["id", "username", "fullName", "email"],
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

const buildAdminArchiveFilters = (query: any) => {
    const baseFilters = buildAdminDocumentFilters(query);
    const archiveFilters: any[] = [{ archivedAt: { $notNull: true } }];

    const archivedFrom = normalizeQueryValue(query.archivedFrom);
    const archivedTo = normalizeQueryValue(query.archivedTo);
    if (archivedFrom || archivedTo) {
        const archivedAt: any = {};
        if (archivedFrom) archivedAt.$gte = new Date(`${archivedFrom}T00:00:00.000`);
        if (archivedTo) archivedAt.$lte = new Date(`${archivedTo}T23:59:59.999`);
        archiveFilters.push({ archivedAt });
    }

    if (baseFilters?.$and?.length) archiveFilters.push(...baseFilters.$and);
    return { $and: archiveFilters };
};

const toPositiveInt = (value: any, fallback: number, max: number) => {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
};

const ACTIVE_DOCUMENT_STATUSES = new Set(["pending", "in_progress", "revision"]);
const ARCHIVABLE_DOCUMENT_STATUSES = new Set(["completed", "cancelled"]);

const addDaysIso = (date: Date, days: number | null | undefined) => {
    if (!days) return null;
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result.toISOString();
};

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

const getDateTime = (value: any) => {
    if (!value) return null;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return null;
    return date.getTime();
};

const getSignatureHistory = (document: any) =>
    Array.isArray(document?.signatureHistory) ? document.signatureHistory : [];

const getDocumentSigners = (document: any) =>
    Array.isArray(document?.signers) ? document.signers : [];

const getEdsSignatureEntries = (document: any) =>
    getSignatureHistory(document).filter(
        (entry: any) =>
            entry?.signatureType === "eds" ||
            entry?.type === "eds" ||
            entry?.cmsFileUrl ||
            entry?.cmsFileName
    );

const buildCmsCheckSummary = (document: any) => {
    const entries = getEdsSignatureEntries(document);
    const entriesWithCms = entries.filter((entry: any) => entry?.cmsFileUrl);
    const missingCmsEntries = entries.filter((entry: any) => !entry?.cmsFileUrl);

    return {
        signedEntries: entries.length,
        cmsFiles: entriesWithCms.length,
        missingCms: missingCmsEntries.length,
        status:
            entries.length === 0
                ? "no_signatures"
                : missingCmsEntries.length > 0
                  ? "missing_cms"
                  : "cms_present",
    };
};

const getCertificateStatus = (entry: any, nowMs: number) => {
    const validToMs = getDateTime(
        entry?.certificateValidTo || entry?.certValidTo || entry?.validTo
    );
    const validFromMs = getDateTime(
        entry?.certificateValidFrom || entry?.certValidFrom || entry?.validFrom
    );

    if (!validToMs && !validFromMs) return "unknown";
    if (validToMs && validToMs < nowMs) return "expired";
    if (validFromMs && validFromMs > nowMs) return "not_yet_valid";
    return "valid";
};

const buildSignatureMonitoringRecord = (document: any, now = new Date()) => {
    const nowMs = now.getTime();
    const signers = getDocumentSigners(document);
    const pendingSigners = signers.filter((signer: any) => signer?.status !== "signed");
    const signedSigners = signers.filter((signer: any) => signer?.status === "signed");
    const edsEntries = getEdsSignatureEntries(document);
    const cmsSummary = buildCmsCheckSummary(document);
    const deadlineMs = getDateTime(document?.signingDeadlineAt);
    const isActive = ACTIVE_DOCUMENT_STATUSES.has(document?.status);
    const isOverdue = Boolean(
        isActive && pendingSigners.length > 0 && deadlineMs && deadlineMs < nowMs
    );
    const monitoring = document?.signatureMonitoring || {};
    const lastError = monitoring?.lastError || null;

    const certificates = edsEntries.map((entry: any) => ({
        userId: entry.userId || null,
        userName: entry.userName || entry.name || null,
        role: entry.role || null,
        iin: entry.iin || null,
        signedAt: entry.signedAt || entry.date || null,
        cmsFileName: entry.cmsFileName || null,
        hasCms: Boolean(entry.cmsFileUrl),
        certificateValidFrom:
            entry.certificateValidFrom || entry.certValidFrom || entry.validFrom || null,
        certificateValidTo:
            entry.certificateValidTo || entry.certValidTo || entry.validTo || null,
        certificateStatus: getCertificateStatus(entry, nowMs),
    }));

    const issues = [];
    if (isActive && pendingSigners.length > 0) issues.push("unsigned");
    if (isOverdue) issues.push("overdue");
    if (cmsSummary.missingCms > 0) issues.push("missing_cms");
    if (lastError) issues.push("error");
    if (certificates.some((item: any) => item.certificateStatus === "expired")) {
        issues.push("cert_expired");
    }
    if (certificates.some((item: any) => item.certificateStatus === "unknown")) {
        issues.push("cert_unknown");
    }

    return {
        id: document.id,
        documentId: document.documentId,
        uid: document.uid,
        title: document.title,
        status: document.status,
        signatureType: document.signatureType,
        signatureSequential: Boolean(document.signatureSequential),
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        signingDeadlineAt: document.signingDeadlineAt || null,
        isOverdue,
        creator: document.creator
            ? {
                  id: document.creator.id,
                  username: document.creator.username,
                  fullName: document.creator.fullName,
                  email: document.creator.email,
                  department: toSafeDepartment(document.creator.department),
              }
            : null,
        documentType: document.documentType
            ? {
                  id: document.documentType.id,
                  name: document.documentType.name,
              }
            : null,
        signers: signers.map((signer: any) => ({
            userId: signer.userId,
            userName: signer.userName,
            userEmail: signer.userEmail,
            role: signer.role,
            status: signer.status || "pending",
            signedAt: signer.signedAt || null,
            departmentName: signer.departmentName || null,
        })),
        progress: {
            signed: signedSigners.length,
            total: signers.length,
            pending: pendingSigners.length,
        },
        pendingSigners: pendingSigners.map((signer: any) => ({
            userId: signer.userId,
            userName: signer.userName,
            userEmail: signer.userEmail,
            role: signer.role,
        })),
        cms: {
            ...cmsSummary,
            lastRecheckAt: monitoring?.lastCmsRecheck?.checkedAt || null,
            lastRecheckBy: monitoring?.lastCmsRecheck?.checkedByName || null,
            lastRecheckStatus: monitoring?.lastCmsRecheck?.status || null,
        },
        certificates,
        lastError,
        errors: Array.isArray(monitoring?.errors) ? monitoring.errors : [],
        issues,
    };
};

const matchesSignatureIssue = (record: any, issue: string) => {
    if (!issue || issue === "all") return true;
    if (issue === "completed") return record.status === "completed";
    return record.issues.includes(issue);
};

const buildSignatureMonitoringSummary = (records: any[]) =>
    records.reduce(
        (acc, record) => {
            acc.total += 1;
            if (record.signatureType === "eds") acc.eds += 1;
            if (record.status === "completed") acc.completed += 1;
            if (record.issues.includes("unsigned")) acc.unsigned += 1;
            if (record.issues.includes("overdue")) acc.overdue += 1;
            if (record.issues.includes("missing_cms")) acc.missingCms += 1;
            if (record.issues.includes("error")) acc.errors += 1;
            if (record.issues.includes("cert_expired")) acc.certExpired += 1;
            if (record.issues.includes("cert_unknown")) acc.certUnknown += 1;
            return acc;
        },
        {
            total: 0,
            eds: 0,
            completed: 0,
            unsigned: 0,
            overdue: 0,
            missingCms: 0,
            errors: 0,
            certExpired: 0,
            certUnknown: 0,
        }
    );

const appendSignatureMonitoringError = (
    document: any,
    user: any,
    details: Record<string, any>
) => {
    const monitoring = document?.signatureMonitoring || {};
    const errors = Array.isArray(monitoring.errors) ? monitoring.errors : [];
    const errorEntry = {
        date: new Date().toISOString(),
        userId: user?.id || null,
        userName: user?.fullName || user?.username || user?.email || null,
        ...details,
    };

    return {
        ...monitoring,
        lastError: errorEntry,
        errors: [errorEntry, ...errors].slice(0, 20),
    };
};

const DEFAULT_PLATFORM_SETTINGS = {
    baseUrl: "",
    qrTemplate:
        "Документ: {{title}}; ID: {{uid}}; Подписант: {{signerName}}; Дата: {{signedAt}}",
    stampTemplate: "{{signerName}}\n{{signedAt}}\nИИН: {{iin}}",
    maxFileSizeMb: 25,
    allowedFileExtensions: [".pdf"],
    documentRetentionDays: null,
    archiveRetentionDays: null,
    emailNotifications: false,
    smsNotifications: false,
    internalNotifications: true,
    notifyAuthorOnComplete: true,
    notifyAdminOnErrors: true,
    unsignedReminderEnabled: false,
    unsignedReminderHours: 24,
    signatureModes: {
        eds: true,
        simple: true,
        combined: false,
    },
    retentionPolicyEnabled: false,
};

const toBoolean = (value: any, fallback: boolean) => {
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
};

const normalizeIntegerSetting = (
    value: any,
    fallback: number | null,
    min: number,
    max: number,
    allowNull = true
) => {
    if (value === undefined) return fallback;
    if ((value === null || value === "") && allowNull) return null;

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return undefined;
    return parsed;
};

const normalizeFileExtensions = (value: any) => {
    const rawItems = Array.isArray(value)
        ? value
        : String(value || "")
              .split(",")
              .map((item) => item.trim());

    const extensions = Array.from(
        new Set(
            rawItems
                .map((item) => cleanString(item).toLowerCase())
                .filter(Boolean)
                .map((item) => (item.startsWith(".") ? item : `.${item}`))
                .filter((item) => /^\.[a-z0-9]{2,10}$/.test(item))
        )
    );

    return extensions.length > 0 ? extensions : undefined;
};

const normalizeSignatureModes = (value: any) => {
    const source = value && typeof value === "object" ? value : {};
    const signatureModes = {
        eds: toBoolean(source.eds, true),
        simple: toBoolean(source.simple, true),
        combined: toBoolean(source.combined, false),
    };

    if (!signatureModes.eds && !signatureModes.simple && !signatureModes.combined) {
        return undefined;
    }

    return signatureModes;
};

const toSafePlatformSettings = (settings: any = {}) => ({
    id: settings.id || null,
    baseUrl: settings.baseUrl || DEFAULT_PLATFORM_SETTINGS.baseUrl,
    qrTemplate: settings.qrTemplate || DEFAULT_PLATFORM_SETTINGS.qrTemplate,
    stampTemplate:
        settings.stampTemplate || DEFAULT_PLATFORM_SETTINGS.stampTemplate,
    maxFileSizeMb:
        settings.maxFileSizeMb || DEFAULT_PLATFORM_SETTINGS.maxFileSizeMb,
    allowedFileExtensions: Array.isArray(settings.allowedFileExtensions)
        ? settings.allowedFileExtensions
        : DEFAULT_PLATFORM_SETTINGS.allowedFileExtensions,
    documentRetentionDays:
        settings.documentRetentionDays === undefined
            ? DEFAULT_PLATFORM_SETTINGS.documentRetentionDays
            : settings.documentRetentionDays,
    archiveRetentionDays:
        settings.archiveRetentionDays === undefined
            ? DEFAULT_PLATFORM_SETTINGS.archiveRetentionDays
            : settings.archiveRetentionDays,
    emailNotifications: toBoolean(
        settings.emailNotifications,
        DEFAULT_PLATFORM_SETTINGS.emailNotifications
    ),
    smsNotifications: toBoolean(
        settings.smsNotifications,
        DEFAULT_PLATFORM_SETTINGS.smsNotifications
    ),
    internalNotifications: toBoolean(
        settings.internalNotifications,
        DEFAULT_PLATFORM_SETTINGS.internalNotifications
    ),
    notifyAuthorOnComplete: toBoolean(
        settings.notifyAuthorOnComplete,
        DEFAULT_PLATFORM_SETTINGS.notifyAuthorOnComplete
    ),
    notifyAdminOnErrors: toBoolean(
        settings.notifyAdminOnErrors,
        DEFAULT_PLATFORM_SETTINGS.notifyAdminOnErrors
    ),
    unsignedReminderEnabled: toBoolean(
        settings.unsignedReminderEnabled,
        DEFAULT_PLATFORM_SETTINGS.unsignedReminderEnabled
    ),
    unsignedReminderHours:
        settings.unsignedReminderHours ||
        DEFAULT_PLATFORM_SETTINGS.unsignedReminderHours,
    signatureModes:
        settings.signatureModes || DEFAULT_PLATFORM_SETTINGS.signatureModes,
    retentionPolicyEnabled: toBoolean(
        settings.retentionPolicyEnabled,
        DEFAULT_PLATFORM_SETTINGS.retentionPolicyEnabled
    ),
    updatedAt: settings.updatedAt || null,
});

const getOrCreatePlatformSettings = async (strapi: any) => {
    const existing = await strapi.db
        .query("api::platform-setting.platform-setting")
        .findOne({ orderBy: { createdAt: "asc" } });

    if (existing) return existing;

    return strapi.db.query("api::platform-setting.platform-setting").create({
        data: DEFAULT_PLATFORM_SETTINGS,
    });
};

const normalizePlatformSettingsPayload = (body: any) => {
    const maxFileSizeMb = normalizeIntegerSetting(
        body.maxFileSizeMb,
        DEFAULT_PLATFORM_SETTINGS.maxFileSizeMb,
        1,
        500,
        false
    );
    const documentRetentionDays = normalizeIntegerSetting(
        body.documentRetentionDays,
        null,
        1,
        36500
    );
    const archiveRetentionDays = normalizeIntegerSetting(
        body.archiveRetentionDays,
        null,
        1,
        36500
    );
    const unsignedReminderHours = normalizeIntegerSetting(
        body.unsignedReminderHours,
        DEFAULT_PLATFORM_SETTINGS.unsignedReminderHours,
        1,
        8760,
        false
    );
    const allowedFileExtensions = normalizeFileExtensions(
        body.allowedFileExtensions
    );
    const signatureModes = normalizeSignatureModes(body.signatureModes);

    if (maxFileSizeMb === undefined) return { error: "Некорректный лимит файла" };
    if (documentRetentionDays === undefined) {
        return { error: "Некорректный срок хранения документов" };
    }
    if (archiveRetentionDays === undefined) {
        return { error: "Некорректный срок хранения архива" };
    }
    if (unsignedReminderHours === undefined) {
        return { error: "Некорректный период напоминаний" };
    }
    if (!allowedFileExtensions) {
        return { error: "Укажите хотя бы один корректный формат файла" };
    }
    if (!signatureModes) {
        return { error: "Должен быть включен хотя бы один режим подписи" };
    }

    return {
        data: {
            baseUrl: cleanString(body.baseUrl),
            qrTemplate:
                cleanString(body.qrTemplate) ||
                DEFAULT_PLATFORM_SETTINGS.qrTemplate,
            stampTemplate:
                cleanString(body.stampTemplate) ||
                DEFAULT_PLATFORM_SETTINGS.stampTemplate,
            maxFileSizeMb,
            allowedFileExtensions,
            documentRetentionDays,
            archiveRetentionDays,
            emailNotifications: Boolean(body.emailNotifications),
            smsNotifications: Boolean(body.smsNotifications),
            internalNotifications: Boolean(body.internalNotifications),
            notifyAuthorOnComplete: Boolean(body.notifyAuthorOnComplete),
            notifyAdminOnErrors: Boolean(body.notifyAdminOnErrors),
            unsignedReminderEnabled: Boolean(body.unsignedReminderEnabled),
            unsignedReminderHours,
            signatureModes,
            retentionPolicyEnabled: Boolean(body.retentionPolicyEnabled),
        },
    };
};

const DEFAULT_SECURITY_SETTINGS = {
    passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: false,
        requireSpecial: false,
        rotateDays: null,
    },
    ipRestrictionEnabled: false,
    allowedIpRanges: [],
    sessionIdleMinutes: 30,
    twoFactorPlanned: false,
    suspiciousActivityThreshold: 5,
};

const normalizePasswordPolicy = (value: any) => {
    const source = value && typeof value === "object" ? value : {};
    const minLength = normalizeIntegerSetting(
        source.minLength,
        DEFAULT_SECURITY_SETTINGS.passwordPolicy.minLength,
        6,
        128,
        false
    );
    const rotateDays = normalizeIntegerSetting(source.rotateDays, null, 1, 36500);

    if (minLength === undefined) return undefined;
    if (rotateDays === undefined) return undefined;

    return {
        minLength,
        requireUppercase: Boolean(source.requireUppercase),
        requireLowercase: Boolean(source.requireLowercase),
        requireNumber: Boolean(source.requireNumber),
        requireSpecial: Boolean(source.requireSpecial),
        rotateDays,
    };
};

const normalizeIpRanges = (value: any) => {
    const rawItems = Array.isArray(value)
        ? value
        : String(value || "")
              .split(/\n|,/)
              .map((item) => item.trim());

    return Array.from(
        new Set(
            rawItems
                .map((item: any) => cleanString(item))
                .filter(Boolean)
                .filter((item: string) => /^[0-9a-fA-F:.\/]+$/.test(item))
        )
    ).slice(0, 200);
};

const toSafeSecuritySettings = (settings: any = {}) => ({
    id: settings.id || null,
    passwordPolicy: {
        ...DEFAULT_SECURITY_SETTINGS.passwordPolicy,
        ...(settings.passwordPolicy || {}),
    },
    ipRestrictionEnabled: toBoolean(
        settings.ipRestrictionEnabled,
        DEFAULT_SECURITY_SETTINGS.ipRestrictionEnabled
    ),
    allowedIpRanges: Array.isArray(settings.allowedIpRanges)
        ? settings.allowedIpRanges
        : DEFAULT_SECURITY_SETTINGS.allowedIpRanges,
    sessionIdleMinutes:
        settings.sessionIdleMinutes ||
        DEFAULT_SECURITY_SETTINGS.sessionIdleMinutes,
    twoFactorPlanned: toBoolean(
        settings.twoFactorPlanned,
        DEFAULT_SECURITY_SETTINGS.twoFactorPlanned
    ),
    suspiciousActivityThreshold:
        settings.suspiciousActivityThreshold ||
        DEFAULT_SECURITY_SETTINGS.suspiciousActivityThreshold,
    updatedAt: settings.updatedAt || null,
});

const getOrCreateSecuritySettings = async (strapi: any) => {
    const existing = await strapi.db
        .query("api::security-setting.security-setting")
        .findOne({ orderBy: { createdAt: "asc" } });

    if (existing) return toSafeSecuritySettings(existing);

    const created = await strapi.db
        .query("api::security-setting.security-setting")
        .create({ data: DEFAULT_SECURITY_SETTINGS });

    return toSafeSecuritySettings(created);
};

const normalizeSecuritySettingsPayload = (body: any) => {
    const passwordPolicy = normalizePasswordPolicy(body.passwordPolicy);
    const sessionIdleMinutes = normalizeIntegerSetting(
        body.sessionIdleMinutes,
        DEFAULT_SECURITY_SETTINGS.sessionIdleMinutes,
        5,
        1440,
        false
    );
    const suspiciousActivityThreshold = normalizeIntegerSetting(
        body.suspiciousActivityThreshold,
        DEFAULT_SECURITY_SETTINGS.suspiciousActivityThreshold,
        1,
        100,
        false
    );
    const allowedIpRanges = normalizeIpRanges(body.allowedIpRanges);

    if (!passwordPolicy) return { error: "Некорректная парольная политика" };
    if (sessionIdleMinutes === undefined) {
        return { error: "Некорректный таймаут сессии" };
    }
    if (suspiciousActivityThreshold === undefined) {
        return { error: "Некорректный порог подозрительной активности" };
    }
    if (Boolean(body.ipRestrictionEnabled) && allowedIpRanges.length === 0) {
        return { error: "Укажите хотя бы один разрешенный IP или диапазон" };
    }

    return {
        data: {
            passwordPolicy,
            ipRestrictionEnabled: Boolean(body.ipRestrictionEnabled),
            allowedIpRanges,
            sessionIdleMinutes,
            twoFactorPlanned: Boolean(body.twoFactorPlanned),
            suspiciousActivityThreshold,
        },
    };
};

const validatePasswordAgainstPolicy = (password: string, settings: any) => {
    const policy = toSafeSecuritySettings(settings).passwordPolicy;
    if (password.length < policy.minLength) {
        return `Пароль должен быть не короче ${policy.minLength} символов`;
    }
    if (policy.requireUppercase && !/[A-ZА-ЯЁ]/.test(password)) {
        return "Пароль должен содержать заглавную букву";
    }
    if (policy.requireLowercase && !/[a-zа-яё]/.test(password)) {
        return "Пароль должен содержать строчную букву";
    }
    if (policy.requireNumber && !/[0-9]/.test(password)) {
        return "Пароль должен содержать цифру";
    }
    if (policy.requireSpecial && !/[^A-Za-zА-Яа-яЁё0-9]/.test(password)) {
        return "Пароль должен содержать специальный символ";
    }
    return null;
};

const normalizeIpAddress = (value: any) =>
    cleanString(value).replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1");

const ipv4ToNumber = (ip: string) => {
    const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
    if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)) {
        return null;
    }
    return parts.reduce((acc, part) => acc * 256 + part, 0) >>> 0;
};

const matchesIpv4Cidr = (ip: string, range: string) => {
    const [baseIp, prefixText] = range.split("/");
    const prefix = Number.parseInt(prefixText, 10);
    const ipNumber = ipv4ToNumber(ip);
    const baseNumber = ipv4ToNumber(baseIp);

    if (ipNumber === null || baseNumber === null || !Number.isFinite(prefix)) {
        return false;
    }
    if (prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;

    const mask = (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNumber & mask) === (baseNumber & mask);
};

const isIpAllowed = (requestIp: string, ranges: any) => {
    const ip = normalizeIpAddress(requestIp);
    const allowed = Array.isArray(ranges) ? ranges.map(normalizeIpAddress) : [];
    if (allowed.length === 0) return true;

    return allowed.some((range) => {
        if (range === "*" || range === ip) return true;
        if (range.includes("/")) return matchesIpv4Cidr(ip, range);
        return false;
    });
};

const getClientSessionVersion = (ctx: any) => {
    const raw =
        ctx.request.headers["x-session-version"] ||
        ctx.request.body?.sessionVersion ||
        ctx.query?.sessionVersion;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const parsed = Number.parseInt(String(value || ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const isClientSessionCurrent = (ctx: any, user: any) => {
    const clientVersion = getClientSessionVersion(ctx);
    const serverVersion = Number(user?.sessionVersion || 1);
    return !clientVersion || clientVersion >= serverVersion;
};

const toSafeSecuritySession = (user: any, settings: any) => {
    const lastSeenMs = getDateTime(user.lastSeenAt);
    const idleMinutes = settings.sessionIdleMinutes || 30;
    const onlineSinceMs = Date.now() - idleMinutes * 60000;

    return {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        blocked: Boolean(user.blocked),
        role: toSafeRole(user.role),
        department: toSafeDepartment(user.department),
        sessionVersion: user.sessionVersion || 1,
        forcedLogoutAt: user.forcedLogoutAt || null,
        lastSeenAt: user.lastSeenAt || null,
        lastSeenIp: user.lastSeenIp || null,
        lastSeenUserAgent: user.lastSeenUserAgent || null,
        isOnline: Boolean(lastSeenMs && lastSeenMs >= onlineSinceMs),
    };
};

const ROLE_PERMISSION_KEYS = [
    "createDocuments",
    "signDocuments",
    "viewDepartmentDocuments",
    "viewAllDocuments",
    "cancelDocuments",
    "archiveDocuments",
    "deleteDocuments",
    "manageDictionaries",
];

const DEFAULT_ROLE_PERMISSIONS = {
    app_admin: {
        createDocuments: true,
        signDocuments: true,
        viewDepartmentDocuments: true,
        viewAllDocuments: true,
        cancelDocuments: true,
        archiveDocuments: true,
        deleteDocuments: true,
        manageDictionaries: true,
    },
    authenticated: {
        createDocuments: true,
        signDocuments: true,
        viewDepartmentDocuments: false,
        viewAllDocuments: false,
        cancelDocuments: false,
        archiveDocuments: false,
        deleteDocuments: true,
        manageDictionaries: false,
    },
    app_manager: {
        createDocuments: true,
        signDocuments: true,
        viewDepartmentDocuments: true,
        viewAllDocuments: false,
        cancelDocuments: true,
        archiveDocuments: false,
        deleteDocuments: true,
        manageDictionaries: false,
    },
    app_observer: {
        createDocuments: false,
        signDocuments: false,
        viewDepartmentDocuments: true,
        viewAllDocuments: false,
        cancelDocuments: false,
        archiveDocuments: false,
        deleteDocuments: false,
        manageDictionaries: false,
    },
};

const getRolePermissionKey = (role: any) =>
    String(role?.type || role?.name || "authenticated").toLowerCase();

const normalizePermissionRow = (value: any, fallback: any) => {
    const source = value && typeof value === "object" ? value : {};
    return ROLE_PERMISSION_KEYS.reduce((acc: any, key) => {
        acc[key] = Boolean(source[key] ?? fallback?.[key] ?? false);
        return acc;
    }, {});
};

const normalizeRolePermissionMatrix = (matrix: any, roles: any[] = []) => {
    const source = matrix && typeof matrix === "object" ? matrix : {};
    const normalized: any = {};

    for (const [roleKey, fallback] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        normalized[roleKey] = normalizePermissionRow(source[roleKey], fallback);
    }

    for (const role of roles) {
        const key = getRolePermissionKey(role);
        if (!normalized[key]) {
            normalized[key] = normalizePermissionRow(
                source[key],
                DEFAULT_ROLE_PERMISSIONS.authenticated
            );
        }
    }

    normalized.app_admin = { ...DEFAULT_ROLE_PERMISSIONS.app_admin };
    return normalized;
};

const getOrCreateRolePermissionSettings = async (
    strapi: any,
    roles: any[] = []
) => {
    const existing = await strapi.db
        .query("api::role-permission-setting.role-permission-setting")
        .findOne({ orderBy: { createdAt: "asc" } });

    if (existing) {
        return {
            ...existing,
            matrix: normalizeRolePermissionMatrix(existing.matrix, roles),
        };
    }

    return strapi.db
        .query("api::role-permission-setting.role-permission-setting")
        .create({
            data: {
                matrix: normalizeRolePermissionMatrix({}, roles),
            },
        });
};

const getUserRolePermissions = async (strapi: any, user: any) => {
    if (isAppAdminRole(user?.role)) return DEFAULT_ROLE_PERMISSIONS.app_admin;

    const settings = await getOrCreateRolePermissionSettings(strapi);
    const roleKey = getRolePermissionKey(user?.role);
    return normalizePermissionRow(
        settings.matrix?.[roleKey],
        DEFAULT_ROLE_PERMISSIONS.authenticated
    );
};

const hasUserRolePermission = async (strapi: any, user: any, permission: string) => {
    if (isAppAdminRole(user?.role)) return true;
    const permissions = await getUserRolePermissions(strapi, user);
    return Boolean(permissions?.[permission]);
};

const isDocumentInUserDepartment = (document: any, user: any) => {
    const userDepartmentId = Number(user?.department?.id);
    const creatorDepartmentId = Number(document?.creator?.department?.id);
    return (
        Number.isFinite(userDepartmentId) &&
        Number.isFinite(creatorDepartmentId) &&
        userDepartmentId === creatorDepartmentId
    );
};

const getDocumentPermissionFilters = async (strapi: any, fullUser: any) => {
    const permissions = await getUserRolePermissions(strapi, fullUser);
    if (permissions.viewAllDocuments) return undefined;

    const filters: any[] = [
        { creator: { id: fullUser.id } },
        { assigned_users: { id: fullUser.id } },
    ];

    if (permissions.viewDepartmentDocuments && fullUser.department?.id) {
        filters.push({ creator: { department: { id: fullUser.department.id } } });
    }

    return { $or: filters };
};

const canReadDocumentWithPermissions = async (
    strapi: any,
    document: any,
    fullUser: any
) => {
    if (isAppAdminRole(fullUser?.role)) return true;
    const isCreator = Number(document.creator?.id) === Number(fullUser.id);
    const isAssigned = (document.assigned_users as any[])?.some(
        (assignedUser) => Number(assignedUser.id) === Number(fullUser.id)
    );
    if (isCreator || isAssigned) return true;

    const permissions = await getUserRolePermissions(strapi, fullUser);
    if (permissions.viewAllDocuments) return true;
    return (
        permissions.viewDepartmentDocuments &&
        isDocumentInUserDepartment(document, fullUser)
    );
};

const isSigningUpdate = (updateData: any) =>
    Boolean(
        updateData?.signatureHistory ||
            updateData?.signers ||
            updateData?.currentFile ||
            updateData?.status === "completed"
    );

const NOTIFICATION_EVENTS = [
    "document_created",
    "document_assigned",
    "document_signed",
    "document_completed",
    "document_cancelled",
    "document_overdue",
    "signature_error",
    "manual_reminder",
];

const NOTIFICATION_CHANNELS = ["internal", "email", "sms"];

const DEFAULT_RECIPIENT_RULES = {
    author: false,
    pendingSigners: false,
    allSigners: false,
    admins: false,
    departmentManager: false,
    customEmails: [],
};

const DEFAULT_NOTIFICATION_TEMPLATES = [
    {
        code: "document_assigned_internal",
        name: "Документ назначен на подпись",
        event: "document_assigned",
        channel: "internal",
        enabled: true,
        subject: "Новый документ на подпись",
        body: "Вам назначен документ {{title}} (#{{uid}}). Срок: {{deadline}}.",
        recipientRules: { ...DEFAULT_RECIPIENT_RULES, pendingSigners: true },
        sendDelayMinutes: 0,
        isSystem: true,
    },
    {
        code: "manual_reminder_internal",
        name: "Ручное напоминание подписанту",
        event: "manual_reminder",
        channel: "internal",
        enabled: true,
        subject: "Напоминание о подписи",
        body: "Документ {{title}} ожидает вашей подписи.",
        recipientRules: { ...DEFAULT_RECIPIENT_RULES, pendingSigners: true },
        sendDelayMinutes: 0,
        isSystem: true,
    },
    {
        code: "document_completed_internal",
        name: "Документ подписан полностью",
        event: "document_completed",
        channel: "internal",
        enabled: true,
        subject: "Документ завершен",
        body: "Документ {{title}} (#{{uid}}) подписан всеми участниками.",
        recipientRules: { ...DEFAULT_RECIPIENT_RULES, author: true },
        sendDelayMinutes: 0,
        isSystem: true,
    },
    {
        code: "document_cancelled_internal",
        name: "Документ отменен",
        event: "document_cancelled",
        channel: "internal",
        enabled: true,
        subject: "Документ отменен",
        body: "Документ {{title}} отменен. Причина: {{reason}}.",
        recipientRules: {
            ...DEFAULT_RECIPIENT_RULES,
            author: true,
            allSigners: true,
        },
        sendDelayMinutes: 0,
        isSystem: true,
    },
    {
        code: "document_overdue_internal",
        name: "Просрочен срок подписания",
        event: "document_overdue",
        channel: "internal",
        enabled: true,
        subject: "Просрочен срок подписания",
        body: "Документ {{title}} просрочен. Текущий подписант: {{signerName}}.",
        recipientRules: {
            ...DEFAULT_RECIPIENT_RULES,
            author: true,
            pendingSigners: true,
        },
        sendDelayMinutes: 0,
        repeatEveryHours: 24,
        maxRepeats: 3,
        isSystem: true,
    },
    {
        code: "signature_error_internal",
        name: "Ошибка подписания",
        event: "signature_error",
        channel: "internal",
        enabled: true,
        subject: "Ошибка ЭЦП",
        body: "При подписании документа {{title}} произошла ошибка: {{errorMessage}}.",
        recipientRules: { ...DEFAULT_RECIPIENT_RULES, admins: true },
        sendDelayMinutes: 0,
        isSystem: true,
    },
];

const normalizeRecipientRules = (value: any) => {
    const source = value && typeof value === "object" ? value : {};
    const customEmails = Array.isArray(source.customEmails)
        ? source.customEmails
              .map((item: any) => cleanString(item).toLowerCase())
              .filter((item: string) => item && isEmail(item))
        : [];

    return {
        author: Boolean(source.author),
        pendingSigners: Boolean(source.pendingSigners),
        allSigners: Boolean(source.allSigners),
        admins: Boolean(source.admins),
        departmentManager: Boolean(source.departmentManager),
        customEmails: Array.from(new Set(customEmails)),
    };
};

const normalizeTemplateCode = (value: any) =>
    cleanString(value)
        .toLowerCase()
        .replace(/[^a-z0-9_:-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 80);

const normalizeNotificationTemplatePayload = (
    body: any,
    existingTemplate: any = null
) => {
    const event = cleanString(body.event || existingTemplate?.event);
    const channel = cleanString(body.channel || existingTemplate?.channel);
    const code =
        normalizeTemplateCode(body.code) ||
        normalizeTemplateCode(existingTemplate?.code) ||
        normalizeTemplateCode(`${event}_${channel}`);
    const name = cleanString(body.name);
    const bodyText = cleanString(body.body);
    const sendDelayMinutes = normalizeIntegerSetting(
        body.sendDelayMinutes,
        existingTemplate?.sendDelayMinutes || 0,
        0,
        525600,
        false
    );
    const repeatEveryHours = normalizeIntegerSetting(
        body.repeatEveryHours,
        existingTemplate?.repeatEveryHours || null,
        1,
        8760
    );
    const maxRepeats = normalizeIntegerSetting(
        body.maxRepeats,
        existingTemplate?.maxRepeats || null,
        1,
        365
    );

    if (!code) return { error: "Укажите код шаблона" };
    if (!name) return { error: "Укажите название шаблона" };
    if (!bodyText) return { error: "Укажите текст уведомления" };
    if (!NOTIFICATION_EVENTS.includes(event)) {
        return { error: "Некорректное событие уведомления" };
    }
    if (!NOTIFICATION_CHANNELS.includes(channel)) {
        return { error: "Некорректный канал уведомления" };
    }
    if (sendDelayMinutes === undefined) {
        return { error: "Некорректная задержка отправки" };
    }
    if (repeatEveryHours === undefined) {
        return { error: "Некорректный период повтора" };
    }
    if (maxRepeats === undefined) {
        return { error: "Некорректный лимит повторов" };
    }

    return {
        data: {
            code,
            name,
            event,
            channel,
            enabled: Boolean(body.enabled),
            subject: cleanString(body.subject),
            body: bodyText,
            recipientRules: normalizeRecipientRules(body.recipientRules),
            sendDelayMinutes,
            repeatEveryHours,
            maxRepeats,
            isSystem: Boolean(existingTemplate?.isSystem || body.isSystem),
        },
    };
};

const toSafeNotificationTemplate = (template: any) => ({
    id: template.id,
    documentId: template.documentId,
    code: template.code,
    name: template.name,
    event: template.event,
    channel: template.channel,
    enabled: Boolean(template.enabled),
    subject: template.subject || "",
    body: template.body || "",
    recipientRules: {
        ...DEFAULT_RECIPIENT_RULES,
        ...(template.recipientRules || {}),
        customEmails: Array.isArray(template.recipientRules?.customEmails)
            ? template.recipientRules.customEmails
            : [],
    },
    sendDelayMinutes: template.sendDelayMinutes || 0,
    repeatEveryHours: template.repeatEveryHours || null,
    maxRepeats: template.maxRepeats || null,
    isSystem: Boolean(template.isSystem),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
});

const ensureDefaultNotificationTemplates = async (strapi: any) => {
    for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
        const existing = await strapi.db
            .query("api::notification-template.notification-template")
            .findOne({ where: { code: template.code } });

        if (!existing) {
            await strapi.db
                .query("api::notification-template.notification-template")
                .create({ data: template });
        }
    }
};

const findNotificationTemplateById = async (strapi: any, id: any) => {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return null;

    return strapi.db
        .query("api::notification-template.notification-template")
        .findOne({ where: { id: numericId } });
};

const REPORT_STATUS_KEYS = [
    "pending",
    "in_progress",
    "completed",
    "cancelled",
    "revision",
];

const getReportDateRangeLabel = (query: any) => ({
    dateFrom: normalizeQueryValue(query.dateFrom) || null,
    dateTo: normalizeQueryValue(query.dateTo) || null,
});

const getSignedAtTime = (entry: any) =>
    getDateTime(entry?.signedAt || entry?.date || entry?.timestamp);

const getCompletionTime = (document: any) => {
    const historyTimes = getSignatureHistory(document)
        .map(getSignedAtTime)
        .filter((time: any) => Number.isFinite(time));
    const signerTimes = getDocumentSigners(document)
        .map((signer: any) => getDateTime(signer?.signedAt))
        .filter((time: any) => Number.isFinite(time));
    const allTimes = [...historyTimes, ...signerTimes];

    if (allTimes.length > 0) return Math.max(...allTimes);
    return getDateTime(document?.updatedAt);
};

const hoursBetween = (from: any, to: any) => {
    const fromMs = getDateTime(from);
    const toMs = Number.isFinite(to) ? to : getDateTime(to);
    if (!fromMs || !toMs || toMs < fromMs) return null;
    return (toMs - fromMs) / 36e5;
};

const getDepartmentKey = (document: any) => {
    const department = document?.creator?.department;
    return {
        id: department?.id || null,
        name: department?.name || "Без отдела",
    };
};

const getUserDisplayName = (user: any) =>
    user?.fullName || user?.username || user?.email || "Пользователь";

const getOrInitGroup = (map: Map<string, any>, key: string, seed: any) => {
    if (!map.has(key)) map.set(key, seed);
    return map.get(key);
};

const sortReportRows = (rows: any[]) =>
    rows.sort((a, b) => (b.total || 0) - (a.total || 0) || a.name.localeCompare(b.name, "ru"));

const buildAdminReportsData = (documents: any[], query: any) => {
    const nowMs = Date.now();
    const statusCounts = REPORT_STATUS_KEYS.reduce((acc: any, status) => {
        acc[status] = 0;
        return acc;
    }, {});
    const departmentMap = new Map<string, any>();
    const userMap = new Map<string, any>();
    const overdueDocuments: any[] = [];
    let totalSigningHours = 0;
    let completedWithDuration = 0;

    for (const document of documents) {
        const status = document.status || "pending";
        statusCounts[status] = (statusCounts[status] || 0) + 1;

        const completionTime = status === "completed" ? getCompletionTime(document) : null;
        const signingHours = completionTime
            ? hoursBetween(document.createdAt, completionTime)
            : null;
        if (Number.isFinite(signingHours)) {
            totalSigningHours += signingHours;
            completedWithDuration++;
        }

        const isOverdue = Boolean(
            ACTIVE_DOCUMENT_STATUSES.has(status) &&
                getDocumentSigners(document).some(
                    (signer: any) => signer?.status !== "signed"
                ) &&
                getDateTime(document.signingDeadlineAt) &&
                getDateTime(document.signingDeadlineAt)! < nowMs
        );
        if (isOverdue) {
            overdueDocuments.push({
                id: document.id,
                documentId: document.documentId,
                uid: document.uid,
                title: document.title,
                status,
                signingDeadlineAt: document.signingDeadlineAt,
                creatorName: getUserDisplayName(document.creator),
                departmentName: document.creator?.department?.name || "Без отдела",
            });
        }

        const department = getDepartmentKey(document);
        const departmentRow = getOrInitGroup(
            departmentMap,
            String(department.id || "none"),
            {
                id: department.id,
                name: department.name,
                total: 0,
                completed: 0,
                cancelled: 0,
                inProgress: 0,
                overdue: 0,
                averageSigningHours: 0,
                signingHoursTotal: 0,
                signingHoursCount: 0,
            }
        );
        departmentRow.total++;
        if (status === "completed") departmentRow.completed++;
        if (status === "cancelled") departmentRow.cancelled++;
        if (ACTIVE_DOCUMENT_STATUSES.has(status)) departmentRow.inProgress++;
        if (isOverdue) departmentRow.overdue++;
        if (Number.isFinite(signingHours)) {
            departmentRow.signingHoursTotal += signingHours;
            departmentRow.signingHoursCount++;
        }

        if (document.creator) {
            const creatorKey = String(document.creator.id);
            const creatorRow = getOrInitGroup(userMap, creatorKey, {
                id: document.creator.id,
                name: getUserDisplayName(document.creator),
                email: document.creator.email,
                departmentName: document.creator.department?.name || "Без отдела",
                created: 0,
                signed: 0,
                total: 0,
            });
            creatorRow.created++;
            creatorRow.total++;
        }

        for (const entry of getSignatureHistory(document)) {
            const userId = Number(entry?.userId);
            if (!Number.isFinite(userId)) continue;
            const key = String(userId);
            const row = getOrInitGroup(userMap, key, {
                id: userId,
                name: entry.userName || `ID ${userId}`,
                email: "",
                departmentName: "",
                created: 0,
                signed: 0,
                total: 0,
            });
            row.signed++;
            row.total++;
        }
    }

    const departments = sortReportRows(
        Array.from(departmentMap.values()).map((row) => ({
            ...row,
            averageSigningHours: row.signingHoursCount
                ? row.signingHoursTotal / row.signingHoursCount
                : null,
            signingHoursTotal: undefined,
            signingHoursCount: undefined,
        }))
    );

    const users = Array.from(userMap.values()).sort(
        (a, b) => (b.total || 0) - (a.total || 0) || a.name.localeCompare(b.name, "ru")
    );

    return {
        period: getReportDateRangeLabel(query),
        summary: {
            total: documents.length,
            created: documents.length,
            signed: statusCounts.completed || 0,
            cancelled: statusCounts.cancelled || 0,
            inProgress:
                (statusCounts.pending || 0) +
                (statusCounts.in_progress || 0) +
                (statusCounts.revision || 0),
            overdue: overdueDocuments.length,
            averageSigningHours: completedWithDuration
                ? totalSigningHours / completedWithDuration
                : null,
            statusCounts,
        },
        departments,
        users,
        overdueDocuments: overdueDocuments
            .sort(
                (a, b) =>
                    getDateTime(a.signingDeadlineAt)! -
                    getDateTime(b.signingDeadlineAt)!
            )
            .slice(0, 100),
    };
};

const csvEscape = (value: any) => {
    if (value === undefined || value === null) return "";
    const text = String(value);
    if (/[",\n\r;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
};

const toCsv = (rows: any[][]) =>
    rows.map((row) => row.map(csvEscape).join(";")).join("\n");

const buildDocumentsReportCsv = (documents: any[]) => {
    const rows = [
        [
            "ID",
            "UID",
            "Название",
            "Статус",
            "Автор",
            "Отдел",
            "Тип документа",
            "Создан",
            "Срок подписания",
            "Подписей",
            "Всего подписантов",
            "Просрочен",
        ],
    ];
    const nowMs = Date.now();

    for (const document of documents) {
        const signers = getDocumentSigners(document);
        const signedCount = signers.filter(
            (signer: any) => signer?.status === "signed"
        ).length;
        const deadlineMs = getDateTime(document.signingDeadlineAt);
        const overdue = Boolean(
            ACTIVE_DOCUMENT_STATUSES.has(document.status) &&
                signers.some((signer: any) => signer?.status !== "signed") &&
                deadlineMs &&
                deadlineMs < nowMs
        );

        rows.push([
            document.id,
            document.uid || document.documentId || "",
            document.title,
            document.status,
            getUserDisplayName(document.creator),
            document.creator?.department?.name || "Без отдела",
            document.documentType?.name || "",
            document.createdAt,
            document.signingDeadlineAt || "",
            signedCount,
            signers.length,
            overdue ? "Да" : "Нет",
        ]);
    }

    return toCsv(rows);
};

const toFileSnapshot = (file: any) =>
    file
        ? {
              id: file.id,
              name: file.name,
              ext: file.ext,
              mime: file.mime,
              size: file.size,
              url: file.url,
          }
        : null;

const buildArchiveExportPayload = (document: any) => ({
    exportedAt: new Date().toISOString(),
    document: {
        id: document.id,
        documentId: document.documentId,
        uid: document.uid,
        title: document.title,
        status: document.status,
        signatureType: document.signatureType,
        signatureSequential: Boolean(document.signatureSequential),
        createdAt: document.createdAt,
        updatedAt: document.updatedAt,
        signingDeadlineAt: document.signingDeadlineAt || null,
        cancellationReason: document.cancellationReason || null,
        archivedAt: document.archivedAt || null,
        archiveReason: document.archiveReason || null,
        retentionUntil: document.retentionUntil || null,
        archivedBy: document.archivedBy
            ? {
                  id: document.archivedBy.id,
                  name: getUserDisplayName(document.archivedBy),
                  email: document.archivedBy.email,
              }
            : null,
        creator: document.creator
            ? {
                  id: document.creator.id,
                  name: getUserDisplayName(document.creator),
                  email: document.creator.email,
                  department: document.creator.department?.name || null,
              }
            : null,
        documentType: document.documentType?.name || null,
        subdivision: document.subdivision?.name || null,
        originalFile: toFileSnapshot(document.originalFile),
        currentFile: toFileSnapshot(document.currentFile),
    },
    signers: getDocumentSigners(document),
    signatureHistory: getSignatureHistory(document),
    adminActionHistory: Array.isArray(document.adminActionHistory)
        ? document.adminActionHistory
        : [],
});

const findDocumentForAccess = async (strapi: any, id: string | number) => {
    try {
        const document = await strapi
            .documents("api::document.document")
            .findOne({
                documentId: String(id),
                populate: {
                    creator: { populate: ["department"] },
                    assigned_users: true,
                },
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
            populate: {
                creator: { populate: ["department"] },
                assigned_users: true,
            },
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
            if (
                !isAdmin &&
                !(await canReadDocumentWithPermissions(strapi, document, fullUser))
            ) {
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
            const fullUser = await getAuthenticatedUser(strapi, user.id);
            if (!(await hasUserRolePermission(strapi, fullUser, "createDocuments"))) {
                return ctx.forbidden("Ваша роль не может создавать документы");
            }

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
            if (
                !isAdmin &&
                !(await canReadDocumentWithPermissions(strapi, document, fullUser))
            ) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            const previousSignedCount = countSignedHistory(
                document.signatureHistory
            );
            const previousStatus = document.status;
            const updateData = ctx.request.body?.data || {};
            if (
                isSigningUpdate(updateData) &&
                !(await hasUserRolePermission(strapi, fullUser, "signDocuments"))
            ) {
                return ctx.forbidden("Ваша роль не может подписывать документы");
            }

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
            if (
                !isAdmin &&
                (!isCreator ||
                    !(await hasUserRolePermission(
                        strapi,
                        fullUser,
                        "deleteDocuments"
                    )))
            ) {
                return ctx.forbidden("Ваша роль не может удалять этот документ");
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
            if (!isClientSessionCurrent(ctx, fullUser)) {
                return ctx.unauthorized("Сессия завершена администратором");
            }

            return ctx.send({
                data: {
                    id: fullUser.id,
                    username: fullUser.username,
                    email: fullUser.email,
                    fullName: fullUser.fullName,
                    confirmed: fullUser.confirmed,
                    blocked: fullUser.blocked,
                    sessionVersion: fullUser.sessionVersion || 1,
                    forcedLogoutAt: fullUser.forcedLogoutAt || null,
                    lastSeenAt: fullUser.lastSeenAt || null,
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
         * POST /api/security/heartbeat
         */
        async recordSecurityHeartbeat(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const fullUser = await getAuthenticatedUser(strapi, user.id);
            if (!fullUser) return ctx.notFound("Пользователь не найден");
            if (!isClientSessionCurrent(ctx, fullUser)) {
                return ctx.unauthorized("Сессия завершена администратором");
            }

            const now = new Date().toISOString();
            await strapi.db.query("plugin::users-permissions.user").update({
                where: { id: fullUser.id },
                data: {
                    lastSeenAt: now,
                    lastSeenIp: getRequestIp(ctx),
                    lastSeenUserAgent: String(ctx.request.headers["user-agent"] || ""),
                },
            });

            return ctx.send({
                data: {
                    id: fullUser.id,
                    sessionVersion: fullUser.sessionVersion || 1,
                    lastSeenAt: now,
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
            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const permissionFilters = await getDocumentPermissionFilters(
                strapi,
                fullUser
            );

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
                filters = permissionFilters;
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
         * GET /api/admin/reports
         */
        async getAdminReports(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const filters = buildAdminDocumentFilters(ctx.query);
            const documents = await strapi.documents("api::document.document").findMany({
                filters,
                populate: getDocumentPopulate(),
                sort: { createdAt: "desc" } as any,
                limit: 10000,
            } as any);

            return ctx.send({
                data: buildAdminReportsData(documents, ctx.query),
                meta: {
                    totalDocumentsScanned: documents.length,
                },
            });
        },

        /**
         * GET /api/admin/reports/export
         */
        async exportAdminReports(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const filters = buildAdminDocumentFilters(ctx.query);
            const documents = await strapi.documents("api::document.document").findMany({
                filters,
                populate: getDocumentPopulate(),
                sort: { createdAt: "desc" } as any,
                limit: 10000,
            } as any);
            const csv = buildDocumentsReportCsv(documents);
            const exportedAt = new Date().toISOString().slice(0, 10);

            await createAuditLog(strapi, ctx, "report_exported", {
                actor: admin,
                metadata: {
                    format: "csv",
                    documentsCount: documents.length,
                    ...getReportDateRangeLabel(ctx.query),
                },
            });

            ctx.set("Content-Type", "text/csv; charset=utf-8");
            ctx.set(
                "Content-Disposition",
                `attachment; filename="documents-report-${exportedAt}.csv"`
            );
            return ctx.send(`\uFEFF${csv}`);
        },

        /**
         * GET /api/admin/archive
         */
        async findAdminArchive(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const page = toPositiveInt(ctx.query.page, 1, 100000);
            const pageSize = toPositiveInt(ctx.query.pageSize, 50, 200);
            const filters = buildAdminArchiveFilters(ctx.query);

            const [documents, total] = await Promise.all([
                strapi.documents("api::document.document").findMany({
                    filters,
                    populate: getDocumentPopulate(),
                    sort: { archivedAt: "desc" } as any,
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
         * POST /api/admin/documents/:id/archive
         */
        async archiveAdminDocument(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const reason = cleanString(ctx.request.body?.reason);
            if (reason.length < 3) {
                return ctx.badRequest("Укажите причину архивации документа");
            }

            const document = await getDocumentByNumericOrDocumentId(strapi, id, [
                "creator",
                "assigned_users",
                "archivedBy",
            ]);
            if (!document) return ctx.notFound("Документ не найден");
            if (document.archivedAt) return ctx.badRequest("Документ уже в архиве");
            if (!ARCHIVABLE_DOCUMENT_STATUSES.has(document.status)) {
                return ctx.badRequest(
                    "В архив можно перенести только завершенный или отмененный документ"
                );
            }

            const now = new Date();
            const settings = toSafePlatformSettings(
                await getOrCreatePlatformSettings(strapi)
            );
            const retentionDays = settings.retentionPolicyEnabled
                ? settings.archiveRetentionDays || settings.documentRetentionDays
                : null;

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    archivedAt: now.toISOString(),
                    archiveReason: reason,
                    retentionUntil: addDaysIso(now, retentionDays),
                    archivedBy: admin.id,
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "archive",
                        {
                            reason,
                            retentionUntil: addDaysIso(now, retentionDays),
                        }
                    ),
                },
            });

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });

            await createAuditLog(strapi, ctx, "document_archived", {
                document: updated,
                actor: admin,
                metadata: {
                    reason,
                    retentionUntil: updated?.retentionUntil || null,
                },
            });

            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * POST /api/admin/documents/:id/restore
         */
        async restoreAdminDocument(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const reason = cleanString(ctx.request.body?.reason);

            const document = await getDocumentByNumericOrDocumentId(strapi, id, [
                "creator",
                "assigned_users",
                "archivedBy",
            ]);
            if (!document) return ctx.notFound("Документ не найден");
            if (!document.archivedAt) return ctx.badRequest("Документ не в архиве");

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    archivedAt: null,
                    archiveReason: null,
                    retentionUntil: null,
                    archivedBy: null,
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "restore_from_archive",
                        {
                            reason,
                            previousArchivedAt: document.archivedAt,
                            previousRetentionUntil: document.retentionUntil || null,
                        }
                    ),
                },
            });

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });

            await createAuditLog(strapi, ctx, "document_restored", {
                document: updated,
                actor: admin,
                metadata: {
                    reason,
                    previousArchivedAt: document.archivedAt,
                    previousRetentionUntil: document.retentionUntil || null,
                },
            });

            const sanitized = await this.sanitizeOutput(updated, ctx);
            return ctx.send({ data: sanitized });
        },

        /**
         * GET /api/admin/documents/:id/archive-export
         */
        async exportAdminDocumentArchive(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const document = await getDocumentByNumericOrDocumentId(
                strapi,
                id,
                getDocumentPopulate()
            );
            if (!document) return ctx.notFound("Документ не найден");

            const payload = buildArchiveExportPayload(document);
            const exportedAt = new Date().toISOString().slice(0, 10);
            const identifier = document.uid || document.documentId || document.id;

            await createAuditLog(strapi, ctx, "document_archive_exported", {
                document,
                actor: admin,
                metadata: {
                    format: "json",
                    archived: Boolean(document.archivedAt),
                },
            });

            ctx.set("Content-Type", "application/json; charset=utf-8");
            ctx.set(
                "Content-Disposition",
                `attachment; filename="document-${identifier}-archive-${exportedAt}.json"`
            );
            return ctx.send(JSON.stringify(payload, null, 2));
        },

        /**
         * GET /api/admin/security
         */
        async getAdminSecurity(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const settings = await getOrCreateSecuritySettings(strapi);
            const users = await strapi.db
                .query("plugin::users-permissions.user")
                .findMany({
                    populate: ["role", "department"],
                    orderBy: [
                        { lastSeenAt: "desc" },
                        { updatedAt: "desc" },
                    ],
                    limit: 1000,
                });
            const suspiciousLogs = await strapi.db
                .query("api::audit-log.audit-log")
                .findMany({
                    where: { event: "security_suspicious_action" },
                    populate: ["actor", "targetUser"],
                    orderBy: [{ createdAt: "desc" }],
                    limit: 30,
                });

            return ctx.send({
                data: {
                    settings,
                    sessions: users.map((user: any) =>
                        toSafeSecuritySession(user, settings)
                    ),
                    suspiciousLogs: suspiciousLogs.map((log: any) => ({
                        id: log.id,
                        event: log.event,
                        actorName: log.actorName,
                        targetUserName: log.targetUserName,
                        ip: log.ip,
                        userAgent: log.userAgent,
                        metadata: log.metadata || {},
                        createdAt: log.createdAt,
                    })),
                },
            });
        },

        /**
         * PUT /api/admin/security/settings
         */
        async updateAdminSecuritySettings(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const normalized = normalizeSecuritySettingsPayload(ctx.request.body || {});
            if (normalized.error) return ctx.badRequest(normalized.error);

            if (
                normalized.data.ipRestrictionEnabled &&
                !isIpAllowed(getRequestIp(ctx), normalized.data.allowedIpRanges)
            ) {
                return ctx.badRequest(
                    "Текущий IP администратора должен быть в списке разрешенных"
                );
            }

            const existing = await strapi.db
                .query("api::security-setting.security-setting")
                .findOne({ orderBy: { createdAt: "asc" } });
            const saved = existing
                ? await strapi.db
                      .query("api::security-setting.security-setting")
                      .update({
                          where: { id: existing.id },
                          data: {
                              ...normalized.data,
                              updatedByUser: admin.id,
                          },
                      })
                : await strapi.db
                      .query("api::security-setting.security-setting")
                      .create({
                          data: {
                              ...normalized.data,
                              updatedByUser: admin.id,
                          },
                      });

            await createAuditLog(strapi, ctx, "security_settings_updated", {
                actor: admin,
                metadata: {
                    ipRestrictionEnabled: normalized.data.ipRestrictionEnabled,
                    allowedIpRangesCount: normalized.data.allowedIpRanges.length,
                    sessionIdleMinutes: normalized.data.sessionIdleMinutes,
                    passwordPolicy: normalized.data.passwordPolicy,
                    twoFactorPlanned: normalized.data.twoFactorPlanned,
                },
            });

            return ctx.send({ data: toSafeSecuritySettings(saved) });
        },

        /**
         * POST /api/admin/security/users/:id/force-logout
         */
        async forceLogoutAdminUser(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const reason = cleanString(ctx.request.body?.reason);
            const targetUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id }, populate: ["role", "department"] });

            if (!targetUser) return ctx.notFound("Пользователь не найден");
            if (Number(targetUser.id) === Number(admin.id)) {
                return ctx.badRequest("Нельзя завершить собственную сессию этим действием");
            }

            const nextVersion = Number(targetUser.sessionVersion || 1) + 1;
            const forcedLogoutAt = new Date().toISOString();
            const updated = await strapi.db
                .query("plugin::users-permissions.user")
                .update({
                    where: { id: targetUser.id },
                    data: {
                        sessionVersion: nextVersion,
                        forcedLogoutAt,
                    },
                    populate: ["role", "department"],
                });

            await createAuditLog(strapi, ctx, "user_forced_logout", {
                actor: admin,
                targetUser,
                metadata: {
                    reason,
                    previousSessionVersion: targetUser.sessionVersion || 1,
                    nextSessionVersion: nextVersion,
                    forcedLogoutAt,
                },
            });

            return ctx.send({
                data: toSafeSecuritySession(
                    updated,
                    await getOrCreateSecuritySettings(strapi)
                ),
            });
        },

        /**
         * GET /api/admin/role-permissions
         */
        async getAdminRolePermissions(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const roles = await getAssignableRoles(strapi);
            const settings = await getOrCreateRolePermissionSettings(strapi, roles);
            const matrix = normalizeRolePermissionMatrix(settings.matrix, roles);

            return ctx.send({
                data: {
                    permissionKeys: ROLE_PERMISSION_KEYS,
                    permissions: {
                        createDocuments: "Создание документов",
                        signDocuments: "Подписание документов",
                        viewDepartmentDocuments: "Просмотр документов отдела",
                        viewAllDocuments: "Просмотр всех документов",
                        cancelDocuments: "Отмена документов",
                        archiveDocuments: "Архивация документов",
                        deleteDocuments: "Удаление документов",
                        manageDictionaries: "Управление справочниками",
                    },
                    roles: roles.map((role: any) => ({
                        ...role,
                        key: getRolePermissionKey(role),
                        isProtectedAdmin: isAppAdminRole(role),
                    })),
                    matrix,
                    updatedAt: settings.updatedAt || null,
                },
            });
        },

        /**
         * PUT /api/admin/role-permissions
         */
        async updateAdminRolePermissions(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const roles = await getAssignableRoles(strapi);
            const matrix = normalizeRolePermissionMatrix(
                ctx.request.body?.matrix || {},
                roles
            );
            const existing = await strapi.db
                .query("api::role-permission-setting.role-permission-setting")
                .findOne({ orderBy: { createdAt: "asc" } });

            const saved = existing
                ? await strapi.db
                      .query("api::role-permission-setting.role-permission-setting")
                      .update({
                          where: { id: existing.id },
                          data: {
                              matrix,
                              updatedByUser: admin.id,
                          },
                      })
                : await strapi.db
                      .query("api::role-permission-setting.role-permission-setting")
                      .create({
                          data: {
                              matrix,
                              updatedByUser: admin.id,
                          },
                      });

            await createAuditLog(strapi, ctx, "role_permissions_updated", {
                actor: admin,
                metadata: {
                    roleKeys: Object.keys(matrix),
                    permissionKeys: ROLE_PERMISSION_KEYS,
                },
            });

            return ctx.send({
                data: {
                    matrix: normalizeRolePermissionMatrix(saved.matrix, roles),
                    updatedAt: saved.updatedAt || null,
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
         * GET /api/admin/signature-monitoring
         */
        async findAdminSignatureMonitoring(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const page = toPositiveInt(ctx.query.page, 1, 100000);
            const pageSize = toPositiveInt(ctx.query.pageSize, 50, 200);
            const issue = cleanString(normalizeQueryValue(ctx.query.issue)) || "all";
            const filters = buildAdminDocumentFilters(ctx.query);

            const documents = await strapi.documents("api::document.document").findMany({
                filters,
                populate: getDocumentPopulate(),
                sort: { createdAt: "desc" } as any,
                limit: 10000,
            } as any);

            const records = documents.map((document: any) =>
                buildSignatureMonitoringRecord(document)
            );
            const summary = buildSignatureMonitoringSummary(records);
            const filteredRecords = records.filter((record: any) =>
                matchesSignatureIssue(record, issue)
            );
            const total = filteredRecords.length;

            return ctx.send({
                data: filteredRecords.slice((page - 1) * pageSize, page * pageSize),
                meta: {
                    total,
                    page,
                    pageSize,
                    pageCount: Math.ceil(total / pageSize) || 1,
                    summary,
                },
            });
        },

        /**
         * POST /api/admin/documents/:id/recheck-signatures
         */
        async recheckAdminDocumentSignatures(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const document = await getDocumentByNumericOrDocumentId(strapi, id, [
                "creator",
                "assigned_users",
                "documentType",
            ]);
            if (!document) return ctx.notFound("Документ не найден");

            const cmsSummary = buildCmsCheckSummary(document);
            const lastCmsRecheck = {
                ...cmsSummary,
                checkedAt: new Date().toISOString(),
                checkedById: admin.id,
                checkedByName: admin.fullName || admin.username,
            };

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: {
                    signatureMonitoring: {
                        ...(document.signatureMonitoring || {}),
                        lastCmsRecheck,
                    },
                    adminActionHistory: appendAdminAction(
                        document,
                        admin,
                        "recheck_signatures",
                        lastCmsRecheck
                    ),
                },
            });

            const updated = await strapi.db
                .query("api::document.document")
                .findOne({
                    where: { id: document.id },
                    populate: getDocumentPopulate(),
                });

            await createAuditLog(strapi, ctx, "document_signature_rechecked", {
                document: updated,
                actor: admin,
                metadata: lastCmsRecheck,
            });

            return ctx.send({ data: buildSignatureMonitoringRecord(updated) });
        },

        /**
         * GET /api/admin/platform-settings
         */
        async getAdminPlatformSettings(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const settings = await getOrCreatePlatformSettings(strapi);
            return ctx.send({ data: toSafePlatformSettings(settings) });
        },

        /**
         * PUT /api/admin/platform-settings
         */
        async updateAdminPlatformSettings(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const normalized = normalizePlatformSettingsPayload(
                ctx.request.body || {}
            );
            if (normalized.error) return ctx.badRequest(normalized.error);

            const settings = await getOrCreatePlatformSettings(strapi);
            const updated = await strapi.db
                .query("api::platform-setting.platform-setting")
                .update({
                    where: { id: settings.id },
                    data: normalized.data,
                });

            await createAuditLog(strapi, ctx, "platform_settings_updated", {
                actor: admin,
                metadata: {
                    changedFields: Object.keys(normalized.data || {}),
                },
            });

            strapi.log.info(
                `[app-admin] user=${admin.id} updated platform settings`
            );

            return ctx.send({ data: toSafePlatformSettings(updated) });
        },

        /**
         * GET /api/admin/notification-templates
         */
        async findAdminNotificationTemplates(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            await ensureDefaultNotificationTemplates(strapi);

            const templates = await strapi.db
                .query("api::notification-template.notification-template")
                .findMany({
                    orderBy: [
                        { event: "asc" },
                        { channel: "asc" },
                        { name: "asc" },
                    ],
                });

            return ctx.send({
                data: templates.map(toSafeNotificationTemplate),
                meta: {
                    total: templates.length,
                    events: NOTIFICATION_EVENTS,
                    channels: NOTIFICATION_CHANNELS,
                },
            });
        },

        /**
         * POST /api/admin/notification-templates
         */
        async createAdminNotificationTemplate(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const normalized = normalizeNotificationTemplatePayload(
                ctx.request.body || {}
            );
            if (normalized.error) return ctx.badRequest(normalized.error);

            const sameCode = await strapi.db
                .query("api::notification-template.notification-template")
                .findOne({ where: { code: normalized.data.code } });
            if (sameCode) {
                return ctx.badRequest("Шаблон с таким кодом уже существует");
            }

            const created = await strapi.db
                .query("api::notification-template.notification-template")
                .create({ data: normalized.data });

            await createAuditLog(strapi, ctx, "notification_template_created", {
                actor: admin,
                metadata: {
                    templateId: created.id,
                    code: created.code,
                    event: created.event,
                    channel: created.channel,
                },
            });

            return ctx.created({ data: toSafeNotificationTemplate(created) });
        },

        /**
         * PUT /api/admin/notification-templates/:id
         */
        async updateAdminNotificationTemplate(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const template = await findNotificationTemplateById(strapi, id);
            if (!template) return ctx.notFound("Шаблон уведомления не найден");

            const normalized = normalizeNotificationTemplatePayload(
                ctx.request.body || {},
                template
            );
            if (normalized.error) return ctx.badRequest(normalized.error);

            const sameCode = await strapi.db
                .query("api::notification-template.notification-template")
                .findOne({ where: { code: normalized.data.code } });
            if (sameCode && Number(sameCode.id) !== Number(template.id)) {
                return ctx.badRequest("Шаблон с таким кодом уже существует");
            }

            const updated = await strapi.db
                .query("api::notification-template.notification-template")
                .update({
                    where: { id: template.id },
                    data: {
                        ...normalized.data,
                        isSystem: Boolean(template.isSystem),
                    },
                });

            await createAuditLog(strapi, ctx, "notification_template_updated", {
                actor: admin,
                metadata: {
                    templateId: updated.id,
                    code: updated.code,
                    event: updated.event,
                    channel: updated.channel,
                },
            });

            return ctx.send({ data: toSafeNotificationTemplate(updated) });
        },

        /**
         * DELETE /api/admin/notification-templates/:id
         */
        async deleteAdminNotificationTemplate(ctx) {
            const admin = await requireAppAdmin(ctx, strapi);
            if (!admin) return;

            const { id } = ctx.params;
            const template = await findNotificationTemplateById(strapi, id);
            if (!template) return ctx.notFound("Шаблон уведомления не найден");
            if (template.isSystem) {
                return ctx.badRequest("Системный шаблон можно отключить, но нельзя удалить");
            }

            await strapi.db
                .query("api::notification-template.notification-template")
                .delete({ where: { id: template.id } });

            await createAuditLog(strapi, ctx, "notification_template_deleted", {
                actor: admin,
                metadata: {
                    templateId: template.id,
                    code: template.code,
                    event: template.event,
                    channel: template.channel,
                },
            });

            return ctx.send({ data: { id: template.id } });
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
            const securitySettings = await getOrCreateSecuritySettings(strapi);
            const passwordError = validatePasswordAgainstPolicy(
                password,
                securitySettings
            );
            if (passwordError) return ctx.badRequest(passwordError);

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

            const securitySettings = await getOrCreateSecuritySettings(strapi);
            const passwordError = validatePasswordAgainstPolicy(
                password,
                securitySettings
            );
            if (passwordError) return ctx.badRequest(passwordError);

            const targetUser = await strapi.db
                .query("plugin::users-permissions.user")
                .findOne({ where: { id }, populate: ["role"] });

            if (!targetUser) return ctx.notFound("Пользователь не найден");

            await strapi
                .plugin("users-permissions")
                .service("user")
                .edit(targetUser.id, {
                    password,
                    sessionVersion: Number(targetUser.sessionVersion || 1) + 1,
                    forcedLogoutAt: new Date().toISOString(),
                });

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

        /**
         * POST /api/documents/:id/signature-error
         *
         * Неблокирующая запись ошибки NCALayer/ЭЦП для админского мониторинга.
         */
        async reportSignatureError(ctx) {
            const user = ctx.state.user;
            if (!user) return ctx.unauthorized("Необходима авторизация");

            const { id } = ctx.params;
            const message = cleanString(ctx.request.body?.message);
            const code = cleanString(ctx.request.body?.code);
            const source = cleanString(ctx.request.body?.source) || "client";

            if (!message) return ctx.badRequest("Текст ошибки обязателен");

            const document = await getDocumentByNumericOrDocumentId(strapi, id, [
                "creator",
                "assigned_users",
            ]);
            if (!document) return ctx.notFound("Документ не найден");

            const isCreator = document.creator?.id === user.id;
            const isAssigned = (document.assigned_users as any[])?.some(
                (assignedUser) => assignedUser.id === user.id
            );
            const fullUser = await getAuthenticatedUser(strapi, user.id);
            const isAdmin = isAppAdminRole(fullUser?.role);
            if (!isCreator && !isAssigned && !isAdmin) {
                return ctx.forbidden("Нет доступа к этому документу");
            }

            const signatureMonitoring = appendSignatureMonitoringError(
                document,
                fullUser || user,
                {
                    message: message.slice(0, 500),
                    code: code || null,
                    source,
                }
            );

            await strapi.db.query("api::document.document").update({
                where: { id: document.id },
                data: { signatureMonitoring },
            });

            await createAuditLog(strapi, ctx, "document_signature_error", {
                document,
                actor: fullUser || user,
                metadata: {
                    message: message.slice(0, 500),
                    code: code || null,
                    source,
                },
            });

            return ctx.send({ data: { ok: true } });
        },
    })
);
