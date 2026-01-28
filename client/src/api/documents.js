import axios from "axios";
import { getToken } from "./auth";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

// Получить документы созданные мной
export const getMyDocuments = async () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    const response = await axios.get(
        `${API_URL}/documents?filters[$or][0][creator][id][$eq]=${user.id}&filters[$or][1][assigned_users][id][$eq]=${user.id}&populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );
    return response.data.data;
};

// Получить документы назначенные мне на подпись
export const getPendingDocuments = async () => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user"));

    const response = await axios.get(
        `${API_URL}/documents?filters[assigned_users][id][$eq]=${user.id}&populate[creator][populate]=department&populate[documentType]=true&populate[originalFile]=true&populate[currentFile]=true`,
        {
            headers: { Authorization: `Bearer ${token}` },
        }
    );
    return response.data.data;
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
        const response = await axios.get(`${API_URL}/users`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
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
