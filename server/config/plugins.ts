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

    if (!hasMinio) {
        // Локальный провайдер: ничего не настраиваем, Strapi возьмёт default.
        return {};
    }

    return {
        upload: {
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
        },
    };
};
