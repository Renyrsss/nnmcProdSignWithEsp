// import type { Core } from '@strapi/strapi';

import { randomBytes } from "crypto";

const generateUid = (): string =>
    randomBytes(5).toString("hex").toUpperCase();

const APP_ADMIN_ROLE_TYPE = "app_admin";
const APP_ADMIN_ROLE_NAME = "Admin";

const MANAGED_APP_ROLES = [
    {
        name: APP_ADMIN_ROLE_NAME,
        description:
            "Администратор приложения: просмотр всех документов, пользователей и отделов",
        type: APP_ADMIN_ROLE_TYPE,
        admin: true,
    },
    {
        name: "Руководитель",
        description:
            "Руководитель подразделения: базовая работа с документами и будущие права контроля отдела",
        type: "app_manager",
        admin: false,
    },
    {
        name: "Наблюдатель",
        description:
            "Наблюдатель: базовая авторизация и будущие права просмотра без участия в подписании",
        type: "app_observer",
        admin: false,
    },
];

const AUTHENTICATED_APP_ACTIONS = [
    "plugin::users-permissions.auth.logout",
    "plugin::users-permissions.user.me",
    "plugin::users-permissions.auth.changePassword",
    "plugin::upload.content-api.upload",
    "plugin::users-permissions.user.update",
    "plugin::users-permissions.user.find",
    "plugin::users-permissions.user.findOne",
    "api::department.department.find",
    "api::department.department.findOne",
    "api::document-type.document-type.find",
    "api::document-type.document-type.findOne",
    "api::subdivision.subdivision.find",
    "api::subdivision.subdivision.findOne",
    "api::document.document.find",
    "api::document.document.findOne",
    "api::document.document.create",
    "api::document.document.update",
    "api::document.document.delete",
    "api::document.document.validateCreate",
    "api::document.document.findMine",
    "api::document.document.getFileUrl",
    "api::document.document.presignUrl",
    "api::document.document.reportSignatureError",
    "api::document.document.recordSecurityHeartbeat",
    "api::document.document.cancelAdminDocument",
    "api::document.document.findAdminArchive",
    "api::document.document.archiveAdminDocument",
    "api::document.document.restoreAdminDocument",
    "api::document.document.exportAdminDocumentArchive",
    "api::document.document.createAdminDepartment",
    "api::document.document.updateAdminDepartment",
    "api::document.document.deleteAdminDepartment",
    "api::document.document.findAdminDocumentTypes",
    "api::document.document.createAdminDocumentType",
    "api::document.document.updateAdminDocumentType",
    "api::document.document.deleteAdminDocumentType",
    "api::document.document.getAppMe",
    "api::document.document.updateOwnProfile",
    "api::document.document.changeOwnPassword",
    "api::document.document.logoutOwnSession",
    "api::document.document.completeDocumentNotificationBatch",
];

const ADMIN_APP_ACTIONS = [
    "api::document.document.findAdminDocuments",
    "api::document.document.findAdminDocument",
    "api::document.document.findAdminAuditLogs",
    "api::document.document.findAdminSignatureMonitoring",
    "api::document.document.getAdminPlatformSettings",
    "api::document.document.updateAdminPlatformSettings",
    "api::document.document.findAdminNotificationTemplates",
    "api::document.document.getAdminReports",
    "api::document.document.exportAdminReports",
    "api::document.document.findAdminArchive",
    "api::document.document.archiveAdminDocument",
    "api::document.document.restoreAdminDocument",
    "api::document.document.exportAdminDocumentArchive",
    "api::document.document.getAdminSecurity",
    "api::document.document.updateAdminSecuritySettings",
    "api::document.document.forceLogoutAdminUser",
    "api::document.document.getAdminRolePermissions",
    "api::document.document.updateAdminRolePermissions",
    "api::document.document.createAdminNotificationTemplate",
    "api::document.document.updateAdminNotificationTemplate",
    "api::document.document.deleteAdminNotificationTemplate",
    "api::document.document.recheckAdminDocumentSignatures",
    "api::document.document.cancelAdminDocument",
    "api::document.document.reassignAdminDocumentSigner",
    "api::document.document.updateAdminDocumentDeadline",
    "api::document.document.requestAdminDocumentReminder",
    "api::document.document.findAdminUsers",
    "api::document.document.createAdminUser",
    "api::document.document.updateAdminUser",
    "api::document.document.updateAdminUserPassword",
    "api::document.document.updateAdminUserStatus",
    "api::document.document.createAdminDepartment",
    "api::document.document.updateAdminDepartment",
    "api::document.document.deleteAdminDepartment",
    "api::document.document.findAdminDocumentTypes",
    "api::document.document.createAdminDocumentType",
    "api::document.document.updateAdminDocumentType",
    "api::document.document.deleteAdminDocumentType",
];

const ensurePermission = async (
    strapi: any,
    roleId: number,
    action: string
) => {
    const existing = await strapi.db
        .query("plugin::users-permissions.permission")
        .findOne({
            where: {
                action,
                role: { id: roleId },
            },
        });

    if (existing) return false;

    await strapi.db.query("plugin::users-permissions.permission").create({
        data: {
            action,
            role: roleId,
        },
    });

    return true;
};

const ensureManagedRole = async (strapi: any, definition: any) => {
    let role = await strapi.db
        .query("plugin::users-permissions.role")
        .findOne({ where: { type: definition.type } });

    if (!role) {
        role = await strapi.db.query("plugin::users-permissions.role").findOne({
            where: { name: definition.name },
        });
    }

    if (!role) {
        role = await strapi.db.query("plugin::users-permissions.role").create({
            data: {
                name: definition.name,
                description: definition.description,
                type: definition.type,
            },
        });
        strapi.log.info(
            `[app-roles] создана users-permissions роль ${definition.name}`
        );
    }

    return role;
};

const ensureAppAdminRole = async (strapi: any) => {
    let createdCount = 0;

    for (const definition of MANAGED_APP_ROLES) {
        const role = await ensureManagedRole(strapi, definition);
        const actions = definition.admin
            ? [...AUTHENTICATED_APP_ACTIONS, ...ADMIN_APP_ACTIONS]
            : AUTHENTICATED_APP_ACTIONS;

        for (const action of actions) {
            if (await ensurePermission(strapi, role.id, action)) createdCount++;
        }
    }

    const authenticatedRole = await strapi.db
        .query("plugin::users-permissions.role")
        .findOne({ where: { type: "authenticated" } });

    if (authenticatedRole) {
        for (const action of AUTHENTICATED_APP_ACTIONS) {
            if (await ensurePermission(strapi, authenticatedRole.id, action)) {
                createdCount++;
            }
        }
    }

    if (createdCount > 0) {
        strapi.log.info(
            `[app-admin] создано users-permissions permissions: ${createdCount}`
        );
    }
};

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
            await ensureAppAdminRole(strapi);
        } catch (e) {
            strapi.log.error(`[app-admin] bootstrap не выполнен: ${e}`);
        }

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
