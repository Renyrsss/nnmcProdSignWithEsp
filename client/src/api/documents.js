import axios from "axios";
import { getCurrentUser, getToken } from "./auth";
import { getApiRoot } from "../config/organizations";

const toDocumentApiError = (error, fallbackMessage) => {
    const responseError = error?.response?.data?.error;
    const message =
        responseError?.message ||
        error?.response?.data?.message ||
        error?.message ||
        fallbackMessage;
    const normalizedError = new Error(message || fallbackMessage);
    normalizedError.name = responseError?.name || error?.name || "DocumentApiError";
    normalizedError.status = error?.response?.status || responseError?.status || null;
    normalizedError.details = responseError?.details || null;
    normalizedError.cause = error;
    return normalizedError;
};

export const isMyTurnToSign = (doc, userId) => {
    // Документ должен быть активным. Отозванные/завершённые/ревизионные
    // не подписываются даже если у пользователя signer.status === "pending".
    if (doc?.status !== "pending" && doc?.status !== "in_progress") {
        return false;
    }

    const signers = doc?.signers || [];
    const mySignerIndex = signers.findIndex((s) => Number(s.userId) === Number(userId));

    if (mySignerIndex === -1) return false;

    const mySigner = signers[mySignerIndex];
    if (mySigner.status !== "pending") return false;

    if (!doc.signatureSequential) return true;

    return signers
        .slice(0, mySignerIndex)
        .every((s) => s.status === "signed");
};

// Получить документы текущего пользователя через серверный эндпоинт.
// Авторизация и distinct-фильтрация выполняются на сервере, здесь только
// HTTP-вызов. role: 'creator' | 'assigned' | 'all'.
const fetchMine = async (role) => {
    const token = getToken();
    const response = await axios.get(`${getApiRoot()}/documents/mine?role=${role}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    return response.data?.data || [];
};

// Документы, в которых я автор ИЛИ подписант (для вкладки "Мои документы").
export const getMyDocuments = async () => {
    return fetchMine("all");
};

// Документы, назначенные мне на подпись (для вкладки "На подпись").
export const getPendingDocuments = async () => {
    return fetchMine("assigned");
};

export const getActionablePendingDocuments = async () => {
    const user = getCurrentUser();
    const allPending = await getPendingDocuments();
    return allPending.filter((doc) => isMyTurnToSign(doc, user.id));
};

// Создать документ
export const createDocument = async (documentData, options = {}) => {
    const token = getToken();

    // Собираем ID пользователей из signers для assigned_users
    const assignedUserIds = documentData.signers
        ? documentData.signers.map((s) => s.userId)
        : [];

    try {
        const response = await axios.post(
            `${getApiRoot()}/documents`,
            {
                data: {
                    ...documentData,
                    assigned_users: assignedUserIds,
                },
                ...(options.notificationBatchId
                    ? { notificationBatchId: options.notificationBatchId }
                    : {}),
            },
            {
                headers: { Authorization: `Bearer ${token}` },
            }
        );
        return response.data.data;
    } catch (error) {
        throw toDocumentApiError(error, "Не удалось создать документ");
    }
};

// Проверяем бизнес-правила до загрузки файлов в MinIO. Это предотвращает
// появление файлов-сирот, если тип документа требует ЭЦП, обязательного
// подписанта или другой серверной настройки.
export const validateDocumentCreate = async (documentData) => {
    const token = getToken();
    try {
        const response = await axios.post(
            `${getApiRoot()}/documents/validate-create`,
            { data: documentData },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.data;
    } catch (error) {
        throw toDocumentApiError(
            error,
            "Параметры документа не прошли проверку"
        );
    }
};

export const completeDocumentNotificationBatch = async (batchId) => {
    const token = getToken();
    const response = await axios.post(
        `${getApiRoot()}/documents/notification-batches/${encodeURIComponent(batchId)}/complete`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.data;
};

// Обновить документ (Strapi v5 использует documentId в URL)
export const updateDocument = async (documentId, data) => {
    const token = getToken();
    try {
        const response = await axios.put(
            `${getApiRoot()}/documents/${documentId}`,
            { data },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

// Загрузить файл
export const uploadFile = async (file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("files", file);

    try {
        const response = await axios.post(`${getApiRoot()}/upload`, formData, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data[0];
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

// Получить всех пользователей для выбора подписантов
export const getAllUsers = async () => {
    const token = getToken();
    try {
        const response = await axios.get(`${getApiRoot()}/users?populate=department`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

// Получить pre-signed URL для currentFile / originalFile документа (15 мин)
export const getDocumentFileUrl = async (documentId, fileType = "current") => {
    const token = getToken();
    const response = await axios.get(
        `${getApiRoot()}/documents/${documentId}/file-url?file=${fileType}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.url;
};

// Получить pre-signed URL для произвольного MinIO-файла по ключу объекта (CMS и др.)
export const presignDocumentFile = async (documentId, key) => {
    const token = getToken();
    const response = await axios.get(
        `${getApiRoot()}/documents/${documentId}/presign?key=${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.url;
};

export const reportDocumentSignatureError = async (documentId, payload) => {
    const token = getToken();
    const response = await axios.post(
        `${getApiRoot()}/documents/${documentId}/signature-error`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.data;
};

// Отозвать документ (Strapi v5 использует documentId в URL)
export const cancelDocument = async (documentId) => {
    const token = getToken();
    try {
        const response = await axios.put(
            `${getApiRoot()}/documents/${documentId}`,
            {
                data: {
                    status: "cancelled",
                },
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};
