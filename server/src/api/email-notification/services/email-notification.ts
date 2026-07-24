import { factories } from "@strapi/strapi";
import { randomUUID } from "crypto";

const UID = "api::email-notification.email-notification" as any;
const ACTIVE_DOCUMENT_STATUSES = new Set(["pending", "in_progress"]);
const BATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;

let processorRunning = false;
let lastCleanupAt = 0;

const boundedInt = (value: any, fallback: number, min: number, max: number) => {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
};

const envFlag = (value: any, fallback = true) => {
    if (value === undefined || value === null || value === "") return fallback;
    return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
};

const escapeHtml = (value: any) =>
    String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const getClientUrl = () =>
    String(process.env.CLIENT_URL || process.env.FRONTEND_URL || "http://localhost:5173")
        .trim()
        .replace(/\/$/, "");

const getDigestWindowSeconds = () =>
    boundedInt(process.env.DOCUMENT_EMAIL_DIGEST_WINDOW_SECONDS, 120, 30, 1800);

const getBatchMaxWaitMinutes = () =>
    boundedInt(process.env.DOCUMENT_EMAIL_BATCH_MAX_WAIT_MINUTES, 30, 5, 180);

const getMaxAttempts = () =>
    boundedInt(process.env.DOCUMENT_EMAIL_MAX_ATTEMPTS, 3, 1, 10);

const getMaxDigestItems = () =>
    boundedInt(process.env.DOCUMENT_EMAIL_DIGEST_MAX_ITEMS, 20, 5, 50);

const addSeconds = (date: Date, seconds: number) =>
    new Date(date.getTime() + seconds * 1000).toISOString();

const addMinutes = (date: Date, minutes: number) =>
    new Date(date.getTime() + minutes * 60000).toISOString();

const getSigners = (document: any) =>
    Array.isArray(document?.signers) ? document.signers : [];

const getActiveSignerIds = (document: any): number[] => {
    if (!document || !ACTIVE_DOCUMENT_STATUSES.has(document.status)) return [];

    const signers = getSigners(document);
    if (!document.signatureSequential) {
        return Array.from(
            new Set(
                signers
                    .filter((signer: any) => signer?.status === "pending")
                    .map((signer: any) => Number(signer?.userId))
                    .filter((userId: number) => Number.isFinite(userId) && userId > 0)
            )
        );
    }

    const active = signers.find((signer: any, index: number) => {
        if (signer?.status !== "pending") return false;
        return signers
            .slice(0, index)
            .every((previous: any) => previous?.status === "signed");
    });
    const userId = Number(active?.userId);
    return Number.isFinite(userId) && userId > 0 ? [userId] : [];
};

const getActivationRound = (document: any) => {
    const history = Array.isArray(document?.signatureHistory)
        ? document.signatureHistory
        : [];
    return history.filter((entry: any) => entry?.type === "resend").length;
};

const getSignedCount = (document: any) =>
    getSigners(document).filter((signer: any) => signer?.status === "signed").length;

const normalizeBatchKey = (value: any) => {
    const batchKey = String(value || "").trim();
    return BATCH_ID_PATTERN.test(batchKey) ? batchKey : null;
};

const notificationsEnabled = async (strapi: any) => {
    if (!envFlag(process.env.DOCUMENT_EMAIL_NOTIFICATIONS_ENABLED, true)) {
        return false;
    }

    const settings = await strapi.db
        .query("api::platform-setting.platform-setting")
        .findOne({ orderBy: { createdAt: "asc" } });

    return settings ? settings.emailNotifications !== false : true;
};

const formatDeadline = (value: any) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", {
        timeZone: process.env.TZ || "Asia/Almaty",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
};

const buildDigestEmail = (rows: any[]) => {
    const sorted = [...rows].sort((a, b) => {
        const aDeadline = a.documentDeadlineAt
            ? new Date(a.documentDeadlineAt).getTime()
            : Number.POSITIVE_INFINITY;
        const bDeadline = b.documentDeadlineAt
            ? new Date(b.documentDeadlineAt).getTime()
            : Number.POSITIVE_INFINITY;
        return aDeadline - bDeadline || Number(a.id) - Number(b.id);
    });
    const count = sorted.length;
    const visibleRows = sorted.slice(0, getMaxDigestItems());
    const remaining = count - visibleRows.length;
    const recipientName = rows[0]?.recipientName || "пользователь";
    const clientUrl = getClientUrl();
    const singleDocumentId =
        rows[0]?.documentDocumentId || rows[0]?.documentNumericId;
    const actionUrl =
        count === 1 && singleDocumentId
            ? `${clientUrl}/documents/${encodeURIComponent(singleDocumentId)}`
            : `${clientUrl}/documents`;
    const subject =
        count === 1
            ? `Новый документ на подпись: ${String(
                  rows[0].documentTitle
              ).slice(0, 120)}`
            : `Новые документы на подпись — ${count}`;

    const textItems = visibleRows.map((row, index) => {
        const deadline = formatDeadline(row.documentDeadlineAt);
        return `${index + 1}. ${row.documentTitle}${deadline ? ` — до ${deadline}` : ""}`;
    });
    const text = [
        `Здравствуйте, ${recipientName}!`,
        "",
        count === 1
            ? "Вам назначен новый документ на подпись."
            : `Количество новых документов на подпись: ${count}.`,
        "",
        ...textItems,
        ...(remaining > 0 ? [`И ещё: ${remaining}.`] : []),
        "",
        `Открыть документы: ${actionUrl}`,
        "",
        "Для открытия подключитесь к корпоративной сети или VPN.",
        "Это автоматическое письмо. Документы не прикладываются из соображений безопасности.",
    ].join("\n");

    const listItems = visibleRows
        .map((row) => {
            const deadline = formatDeadline(row.documentDeadlineAt);
            const meta = [
                row.documentUid ? `ID ${escapeHtml(row.documentUid)}` : "",
                row.creatorName ? `от ${escapeHtml(row.creatorName)}` : "",
                deadline ? `до ${escapeHtml(deadline)}` : "",
            ].filter(Boolean);
            return `<li style="margin:0 0 12px"><strong>${escapeHtml(
                row.documentTitle
            )}</strong>${meta.length ? `<br><span style="color:#667085;font-size:13px">${meta.join(" · ")}</span>` : ""}</li>`;
        })
        .join("");

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @media only screen and (max-width:600px) {
      .email-shell { padding:16px 0 !important; }
      .email-card { width:100% !important; max-width:100% !important; }
      .email-header, .email-content { padding-left:20px !important; padding-right:20px !important; }
      .email-title { font-size:21px !important; }
    }
  </style>
</head>
<body style="margin:0;background:#f4f6fb;font-family:Arial,sans-serif;color:#1f2937">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f4f6fb">
    <tr><td class="email-shell" align="center" style="padding:32px 16px">
      <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;table-layout:fixed;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(16,24,40,.08)">
        <tr><td class="email-header" style="padding:28px 32px;background:#4f35f5;color:#fff;overflow-wrap:anywhere;word-break:break-word">
          <div style="font-size:14px;opacity:.85">Электронная подпись</div>
          <h1 class="email-title" style="margin:8px 0 0;font-size:24px;line-height:1.3;overflow-wrap:anywhere;word-break:break-word">${count === 1 ? "Новый документ на подпись" : `Документы на подпись: ${count}`}</h1>
        </td></tr>
        <tr><td class="email-content" style="padding:30px 32px;overflow-wrap:anywhere;word-break:break-word">
          <p style="margin:0 0 20px;font-size:16px">Здравствуйте, ${escapeHtml(recipientName)}!</p>
          <p style="margin:0 0 20px;color:#475467;line-height:1.6">${count === 1 ? "Вам назначен новый документ на подпись." : `Количество новых документов: <strong>${count}</strong>. Мы объединили их в одно письмо, чтобы не перегружать вашу почту.`}</p>
          <ol style="margin:0 0 20px;padding-left:22px;line-height:1.45">${listItems}</ol>
          ${remaining > 0 ? `<p style="margin:0 0 22px;color:#667085">И ещё: ${remaining}.</p>` : ""}
          <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#4f35f5;color:#fff;text-decoration:none;font-weight:700">${count === 1 ? "Открыть документ" : "Перейти к документам"}</a>
          <div style="margin-top:24px;padding:14px 16px;border-radius:10px;background:#f8f9fc;color:#667085;font-size:13px;line-height:1.5">Для открытия подключитесь к корпоративной сети или VPN. Документы не прикладываются к письму из соображений безопасности.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    return { subject, text, html };
};

const cleanupOldRows = async (strapi: any) => {
    if (Date.now() - lastCleanupAt < 24 * 60 * 60 * 1000) return;
    lastCleanupAt = Date.now();
    const sentCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const failedCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await Promise.all([
        strapi.db.query(UID).deleteMany({
            where: { status: "sent", sentAt: { $lt: sentCutoff } },
        }),
        strapi.db.query(UID).deleteMany({
            where: { status: "failed", updatedAt: { $lt: failedCutoff } },
        }),
    ]);
};

export default factories.createCoreService(UID, ({ strapi }) => ({
    async enqueueDocumentAssignments(
        document: any,
        previousDocument: any = null,
        options: {
            cause?: "created" | "next_signer" | "reassigned" | "resent";
            batchKey?: string | null;
            batchOwnerUserId?: number | null;
        } = {}
    ) {
        if (!(await notificationsEnabled(strapi))) return { queued: 0, disabled: true };

        const afterIds = getActiveSignerIds(document);
        const beforeIds = new Set(getActiveSignerIds(previousDocument));
        const recipientIds = afterIds.filter((userId) => !beforeIds.has(userId));
        if (recipientIds.length === 0) return { queued: 0 };

        const users = await strapi.db
            .query("plugin::users-permissions.user")
            .findMany({
                where: { id: { $in: recipientIds }, blocked: false },
                select: ["id", "username", "fullName", "email", "blocked"],
            });
        const batchKey = normalizeBatchKey(options.batchKey);
        const now = new Date();
        const availableAt = batchKey
            ? addMinutes(now, getBatchMaxWaitMinutes())
            : addSeconds(now, getDigestWindowSeconds());
        const round = getActivationRound(document);
        const signedCount = getSignedCount(document);
        let queued = 0;

        for (const user of users) {
            if (!user?.email) continue;
            const dedupKey = `document_assigned:${document.id}:${user.id}:${round}:${signedCount}`;
            try {
                await strapi.db.query(UID).create({
                    data: {
                        dedupKey,
                        recipientUserId: user.id,
                        recipientEmail: String(user.email).trim().toLowerCase(),
                        recipientName: user.fullName || user.username || user.email,
                        documentNumericId: document.id,
                        documentDocumentId: document.documentId || null,
                        documentUid: document.uid || null,
                        documentTitle: document.title || "Документ без названия",
                        documentDeadlineAt: document.signingDeadlineAt || null,
                        creatorName:
                            document.creator?.fullName ||
                            document.creator?.username ||
                            document.creator?.email ||
                            null,
                        event: "document_assigned",
                        cause: options.cause || "created",
                        batchKey,
                        batchOwnerUserId: batchKey
                            ? Number(options.batchOwnerUserId) || null
                            : null,
                        batchClosed: !batchKey,
                        status: "pending",
                        availableAt,
                        attempts: 0,
                    },
                });
                queued++;
            } catch (error) {
                const existing = await strapi.db.query(UID).findOne({
                    where: { dedupKey },
                    select: ["id"],
                });
                if (!existing) throw error;
            }
        }

        if (queued > 0) {
            const log = batchKey ? strapi.log.debug : strapi.log.info;
            log.call(
                strapi.log,
                `[email-outbox] queued=${queued} document=${document.id} cause=${options.cause || "created"}${batchKey ? ` batch=${batchKey}` : ""}`
            );
        }
        return { queued };
    },

    async completeBatch(batchKeyValue: any, ownerUserId: number) {
        const batchKey = normalizeBatchKey(batchKeyValue);
        if (!batchKey || !Number.isFinite(Number(ownerUserId))) {
            return { completed: 0 };
        }

        const result = await strapi.db.query(UID).updateMany({
            where: {
                batchKey,
                batchOwnerUserId: Number(ownerUserId),
                status: "pending",
            },
            data: {
                batchClosed: true,
                availableAt: addSeconds(new Date(), 5),
            },
        });
        return { completed: Number(result?.count || 0) };
    },

    async processPending() {
        if (processorRunning) return { processed: 0, skipped: true };
        processorRunning = true;
        let processed = 0;

        try {
            if (!(await notificationsEnabled(strapi))) {
                return { processed: 0, disabled: true };
            }
            await cleanupOldRows(strapi);

            const now = new Date();
            const nowIso = now.toISOString();
            const staleLock = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
            await strapi.db.query(UID).updateMany({
                where: { status: "processing", lockedAt: { $lt: staleLock } },
                data: {
                    status: "pending",
                    lockToken: null,
                    lockedAt: null,
                    availableAt: nowIso,
                },
            });

            const dueRows = await strapi.db.query(UID).findMany({
                where: { status: "pending", availableAt: { $lte: nowIso } },
                select: ["recipientUserId"],
                orderBy: { availableAt: "asc" },
                limit: 1000,
            });
            const recipientIds = Array.from(
                new Set(
                    dueRows
                        .map((row: any) => Number(row.recipientUserId))
                        .filter((id: number) => Number.isFinite(id) && id > 0)
                )
            );

            for (const recipientUserId of recipientIds) {
                const pendingRows = await strapi.db.query(UID).findMany({
                    where: { status: "pending", recipientUserId },
                    orderBy: { createdAt: "asc" },
                    limit: 1000,
                });
                if (pendingRows.length === 0) continue;

                const hasDebouncingRows = pendingRows.some(
                    (row: any) =>
                        new Date(row.availableAt).getTime() > now.getTime() &&
                        (!row.batchKey || row.batchClosed)
                );
                if (hasDebouncingRows) continue;

                // Незакрытые массовые операции другого автора не должны
                // задерживать уже готовый digest и не должны попасть в него
                // раньше completeBatch/max-wait.
                const readyRows = pendingRows.filter(
                    (row: any) =>
                        new Date(row.availableAt).getTime() <= now.getTime()
                );
                if (readyRows.length === 0) continue;

                const rowIds = readyRows.map((row: any) => row.id);
                const lockToken = randomUUID();
                const lockResult = await strapi.db.query(UID).updateMany({
                    where: { id: { $in: rowIds }, status: "pending" },
                    data: { status: "processing", lockToken, lockedAt: nowIso },
                });
                if (Number(lockResult?.count || 0) === 0) continue;

                const lockedRows = await strapi.db.query(UID).findMany({
                    where: { status: "processing", lockToken },
                    orderBy: { createdAt: "asc" },
                    limit: 1000,
                });
                if (lockedRows.length === 0) continue;

                try {
                    const emailService = strapi.plugin("email")?.service("email");
                    if (!emailService) throw new Error("Email service is not configured");
                    const message = buildDigestEmail(lockedRows);
                    await emailService.send({
                        to: lockedRows[0].recipientEmail,
                        ...message,
                    });
                    await strapi.db.query(UID).updateMany({
                        where: { lockToken },
                        data: {
                            status: "sent",
                            sentAt: new Date().toISOString(),
                            lockToken: null,
                            lockedAt: null,
                            lastError: null,
                        },
                    });
                    processed += lockedRows.length;
                    strapi.log.info(
                        `[email-outbox] sent recipient=${recipientUserId} documents=${lockedRows.length}`
                    );
                } catch (error: any) {
                    const errorMessage = String(error?.message || error || "Unknown error").slice(
                        0,
                        2000
                    );
                    for (const row of lockedRows) {
                        const attempts = Number(row.attempts || 0) + 1;
                        const failed = attempts >= getMaxAttempts();
                        const retryMinutes = Math.min(60, 5 * 2 ** (attempts - 1));
                        await strapi.db.query(UID).update({
                            where: { id: row.id, lockToken },
                            data: {
                                status: failed ? "failed" : "pending",
                                attempts,
                                availableAt: failed
                                    ? row.availableAt
                                    : addMinutes(new Date(), retryMinutes),
                                lockToken: null,
                                lockedAt: null,
                                lastError: errorMessage,
                            },
                        });
                    }
                    strapi.log.error(
                        `[email-outbox] send failed recipient=${recipientUserId} attempts=${Number(lockedRows[0]?.attempts || 0) + 1}: ${errorMessage}`
                    );
                }
            }

            return { processed };
        } finally {
            processorRunning = false;
        }
    },
}));
