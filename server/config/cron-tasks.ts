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
    queueDailyUnsignedDocumentReminders: {
        task: async ({ strapi }: { strapi: any }) => {
            await strapi
                .service("api::email-notification.email-notification")
                .queueDailyUnsignedReminders();
        },
        options: {
            // Проверяем расписание раз в минуту. Сервис сам учитывает часовую
            // зону, рабочие дни и гарантирует не более одного digest в день.
            rule: "0 * * * * *",
        },
    },
};
