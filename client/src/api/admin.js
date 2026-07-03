import axios from "axios";
import { getToken } from "./auth";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

const authHeaders = () => ({
    Authorization: `Bearer ${getToken()}`,
});

const buildQuery = (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "" && value !== "all") {
            search.set(key, value);
        }
    });
    return search.toString();
};

export const getAdminDocuments = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/documents${query ? `?${query}` : ""}`,
        { headers: authHeaders() }
    );
    return response.data;
};

export const getAdminDocument = async (id) => {
    const response = await axios.get(`${API_URL}/admin/documents/${id}`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const cancelAdminDocument = async (documentId, reason) => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/cancel`,
        { reason },
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const reassignAdminDocumentSigner = async (documentId, payload) => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/reassign-signer`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const updateAdminDocumentDeadline = async (documentId, payload) => {
    const response = await axios.put(
        `${API_URL}/admin/documents/${documentId}/deadline`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const requestAdminDocumentReminder = async (documentId, payload) => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/reminder`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const getAdminAuditLogs = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/audit-logs${query ? `?${query}` : ""}`,
        { headers: authHeaders() }
    );
    return response.data;
};

export const getAdminSignatureMonitoring = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/signature-monitoring${query ? `?${query}` : ""}`,
        { headers: authHeaders() }
    );
    return response.data;
};

export const recheckAdminDocumentSignatures = async (documentId) => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/recheck-signatures`,
        {},
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const getAdminPlatformSettings = async () => {
    const response = await axios.get(`${API_URL}/admin/platform-settings`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminPlatformSettings = async (payload) => {
    const response = await axios.put(`${API_URL}/admin/platform-settings`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const getAdminUsers = async () => {
    const response = await axios.get(`${API_URL}/admin/users`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const createAdminUser = async (payload) => {
    const response = await axios.post(`${API_URL}/admin/users`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminUser = async (userId, payload) => {
    const response = await axios.put(`${API_URL}/admin/users/${userId}`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const createAdminDepartment = async (payload) => {
    const response = await axios.post(`${API_URL}/admin/departments`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminDepartment = async (departmentId, payload) => {
    const response = await axios.put(
        `${API_URL}/admin/departments/${departmentId}`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const deleteAdminDepartment = async (departmentId) => {
    const response = await axios.delete(`${API_URL}/admin/departments/${departmentId}`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const getAdminDocumentTypes = async () => {
    const response = await axios.get(`${API_URL}/admin/document-types`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const createAdminDocumentType = async (payload) => {
    const response = await axios.post(`${API_URL}/admin/document-types`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminDocumentType = async (documentTypeId, payload) => {
    const response = await axios.put(
        `${API_URL}/admin/document-types/${documentTypeId}`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const deleteAdminDocumentType = async (documentTypeId) => {
    const response = await axios.delete(
        `${API_URL}/admin/document-types/${documentTypeId}`,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const changeUserPassword = async (userId, password) => {
    const response = await axios.put(
        `${API_URL}/admin/users/${userId}/password`,
        { password },
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const updateUserBlocked = async (userId, blocked) => {
    const response = await axios.put(
        `${API_URL}/admin/users/${userId}/status`,
        { blocked },
        { headers: authHeaders() }
    );
    return response.data.data;
};
