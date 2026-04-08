import axios from "axios";
import { getToken } from "./auth";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

export const isMyTurnToSign = (doc, userId) => {
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

// Загрузить все страницы из Strapi (автопагинация)
// ВАЖНО: не полагаемся на meta.pagination.pageCount/total — при фильтре по relation
// + populate Strapi v5 может возвращать неконсистентный счётчик из-за JOIN-дублей,
// из-за чего цикл преждевременно останавливался и часть документов не подгружалась.
// Идём по страницам пока приходят данные, дедупим по documentId.
const fetchAllPages = async (baseUrl, token) => {
    const seen = new Set();
    const allData = [];
    let page = 1;
    const pageSize = 100;
    const MAX_PAGES = 200; // safety stop (20 000 записей)

    while (page <= MAX_PAGES) {
        const separator = baseUrl.includes("?") ? "&" : "?";
        const response = await axios.get(
            `${baseUrl}${separator}pagination[page]=${page}&pagination[pageSize]=${pageSize}&pagination[withCount]=true`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        const { data, meta } = response.data;
        if (!Array.isArray(data) || data.length === 0) break;

        for (const item of data) {
            const key = item.documentId ?? item.id;
            if (!seen.has(key)) {
                seen.add(key);
                allData.push(item);
            }
        }

        // Если фактически вернулось меньше pageSize — это последняя страница.
        if (data.length < pageSize) break;

        // Доп. страховка: если total известен и мы уже всё собрали — выходим.
        const total = meta?.pagination?.total;
        if (typeof total === "number" && allData.length >= total) break;

        page++;
    }

    return allData;
};

// Получить документы созданные мной
export const getMyDocuments = async () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    const populate = "populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true&populate[subdivision]=true";

    // Два отдельных запроса вместо $or, чтобы избежать дублирования строк в SQL
    // и связанных с ним проблем пагинации в Strapi v5
    const creatorUrl = `${API_URL}/documents?filters[creator][id][$eq]=${user.id}&${populate}`;
    const assignedUrl = `${API_URL}/documents?filters[assigned_users][id][$eq]=${user.id}&${populate}`;

    const [creatorDocs, assignedDocs] = await Promise.all([
        fetchAllPages(creatorUrl, token),
        fetchAllPages(assignedUrl, token),
    ]);

    // Мёрджим и дедуплицируем по documentId
    const seen = new Set(creatorDocs.map((d) => d.documentId));
    for (const doc of assignedDocs) {
        if (!seen.has(doc.documentId)) {
            creatorDocs.push(doc);
        }
    }

    return creatorDocs;
};

// Получить документы назначенные мне на подпись
export const getPendingDocuments = async () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    const baseUrl = `${API_URL}/documents?filters[assigned_users][id][$eq]=${user.id}&populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true&populate[subdivision]=true`;
    return fetchAllPages(baseUrl, token);
};

export const getActionablePendingDocuments = async () => {
    const user = JSON.parse(localStorage.getItem("user"));
    const allPending = await getPendingDocuments();
    return allPending.filter((doc) => isMyTurnToSign(doc, user.id));
};

// Создать документ
export const createDocument = async (documentData) => {
    const token = localStorage.getItem("token");

    // Собираем ID пользователей из signers для assigned_users
    const assignedUserIds = documentData.signers
        ? documentData.signers.map((s) => s.userId)
        : [];

    const response = await axios.post(
        `${API_URL}/documents`,
        {
            data: {
                ...documentData,
                assigned_users: assignedUserIds,
            },
        },
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );
    return response.data.data;
};

// Обновить документ (Strapi v5 использует documentId в URL)
export const updateDocument = async (documentId, data) => {
    const token = getToken();
    try {
        const response = await axios.put(
            `${API_URL}/documents/${documentId}`,
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
        const response = await axios.post(`${API_URL}/upload`, formData, {
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
        const response = await axios.get(`${API_URL}/users?populate=department`, {
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
        `${API_URL}/documents/${documentId}/file-url?file=${fileType}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.url;
};

// Получить pre-signed URL для произвольного MinIO-файла по ключу объекта (CMS и др.)
export const presignDocumentFile = async (documentId, key) => {
    const token = getToken();
    const response = await axios.get(
        `${API_URL}/documents/${documentId}/presign?key=${encodeURIComponent(key)}`,
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data.url;
};

// Отозвать документ (Strapi v5 использует documentId в URL)
export const cancelDocument = async (documentId) => {
    const token = getToken();
    try {
        const response = await axios.put(
            `${API_URL}/documents/${documentId}`,
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
