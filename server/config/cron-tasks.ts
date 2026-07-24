export default {
    processEmailNotificationOutbox: {
        task: async ({ strapi }: { strapi: any }) => {
            await strapi
                .service("api::email-notification.email-notification")
                .processPending();
        },
        options: {
            // Частый лёгкий polling: фактическую задержку и агрегацию определяет
            // availableAt каждой записи outbox.
            rule: "*/30 * * * * *",
        },
    },
};
