/**
 * Upload-провайдер выбирается по наличию MinIO-настроек в окружении.
 *
 * - Если в .env заданы MINIO_ENDPOINT/BUCKET/ACCESS_KEY/SECRET_KEY —
 *   используется aws-s3 провайдер (dev/prod с MinIO/S3).
 * - Иначе — дефолтный локальный провайдер Strapi (файлы в public/uploads/).
 *   Это позволяет работать локально без поднятого MinIO.
 */
module.exports = ({ env }) => {
    const hasMinio =
        !!env("MINIO_ENDPOINT") &&
        !!env("MINIO_BUCKET") &&
        !!env("MINIO_ACCESS_KEY") &&
        !!env("MINIO_SECRET_KEY");

    const plugins: Record<string, any> = {
        email: {
            config: {
                provider: "nodemailer",
                providerOptions: {
                    host: env("SMTP_HOST", "smtp.yandex.ru"),
                    port: env.int("SMTP_PORT", 465),
                    secure: env.bool("SMTP_SECURE", true),
                    auth: {
                        user: env("SMTP_USER"),
                        pass: env("SMTP_PASS"),
                    },
                },
                settings: {
                    defaultFrom: env("SMTP_FROM", env("SMTP_USER")),
                    defaultReplyTo: env("SMTP_REPLY_TO", env("SMTP_FROM", env("SMTP_USER"))),
                },
            },
        },
    };

    if (hasMinio) {
        plugins.upload = {
            config: {
                provider: "aws-s3",
                providerOptions: {
                    s3Options: {
                        credentials: {
                            accessKeyId: env("MINIO_ACCESS_KEY"),
                            secretAccessKey: env("MINIO_SECRET_KEY"),
                        },
                        region: "us-east-1",
                        endpoint: env("MINIO_ENDPOINT"),
                        forcePathStyle: true,
                        params: {
                            Bucket: env("MINIO_BUCKET"),
                        },
                    },
                },
            },
        };
    }

    return plugins;
};
