export default {
    routes: [
        {
            method: "GET",
            path: "/admin/me",
            handler: "api::document.document.getAppMe",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/admin/documents",
            handler: "api::document.document.findAdminDocuments",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/admin/documents/:id",
            handler: "api::document.document.findAdminDocument",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/admin/users",
            handler: "api::document.document.findAdminUsers",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "PUT",
            path: "/admin/users/:id/password",
            handler: "api::document.document.updateAdminUserPassword",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "PUT",
            path: "/admin/users/:id/status",
            handler: "api::document.document.updateAdminUserStatus",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/mine",
            handler: "api::document.document.findMine",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/:id/file-url",
            handler: "api::document.document.getFileUrl",
            config: { policies: [], middlewares: [] },
        },
        {
            method: "GET",
            path: "/documents/:id/presign",
            handler: "api::document.document.presignUrl",
            config: { policies: [], middlewares: [] },
        },
    ],
};
