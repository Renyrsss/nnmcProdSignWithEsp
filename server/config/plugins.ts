module.exports = ({ env }) => ({
    upload: {
        config: {
            provider: "aws-s3",
            providerOptions: {
                accessKeyId: env("MINIO_ACCESS_KEY"),
                secretAccessKey: env("MINIO_SECRET_KEY"),
                endpoint: env("MINIO_ENDPOINT"),
                s3ForcePathStyle: true,
                signatureVersion: "v4",
                params: {
                    Bucket: env("MINIO_BUCKET"),
                },
            },
        },
    },
});
