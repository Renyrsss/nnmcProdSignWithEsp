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

export const getAdminReports = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/reports${query ? `?${query}` : ""}`,
        { headers: authHeaders() }
    );
    return response.data;
};

export const exportAdminReportsCsv = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/reports/export${query ? `?${query}` : ""}`,
        {
            headers: authHeaders(),
            responseType: "blob",
        }
    );
    return response.data;
};

export const getAdminArchive = async (params = {}) => {
    const query = buildQuery(params);
    const response = await axios.get(
        `${API_URL}/admin/archive${query ? `?${query}` : ""}`,
        { headers: authHeaders() }
    );
    return response.data;
};

export const archiveAdminDocument = async (documentId, reason) => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/archive`,
        { reason },
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const restoreAdminDocument = async (documentId, reason = "") => {
    const response = await axios.post(
        `${API_URL}/admin/documents/${documentId}/restore`,
        { reason },
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const exportAdminDocumentArchive = async (documentId) => {
    const response = await axios.get(
        `${API_URL}/admin/documents/${documentId}/archive-export`,
        {
            headers: authHeaders(),
            responseType: "blob",
        }
    );
    return response.data;
};

export const getAdminSecurity = async () => {
    const response = await axios.get(`${API_URL}/admin/security`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminSecuritySettings = async (payload) => {
    const response = await axios.put(`${API_URL}/admin/security/settings`, payload, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const forceLogoutAdminUser = async (userId, reason = "") => {
    const response = await axios.post(
        `${API_URL}/admin/security/users/${userId}/force-logout`,
        { reason },
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const getAdminRolePermissions = async () => {
    const response = await axios.get(`${API_URL}/admin/role-permissions`, {
        headers: authHeaders(),
    });
    return response.data.data;
};

export const updateAdminRolePermissions = async (matrix) => {
    const response = await axios.put(
        `${API_URL}/admin/role-permissions`,
        { matrix },
        { headers: authHeaders() }
    );
    return response.data.data;
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

export const getAdminNotificationTemplates = async () => {
    const response = await axios.get(`${API_URL}/admin/notification-templates`, {
        headers: authHeaders(),
    });
    return response.data;
};

export const createAdminNotificationTemplate = async (payload) => {
    const response = await axios.post(
        `${API_URL}/admin/notification-templates`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const updateAdminNotificationTemplate = async (templateId, payload) => {
    const response = await axios.put(
        `${API_URL}/admin/notification-templates/${templateId}`,
        payload,
        { headers: authHeaders() }
    );
    return response.data.data;
};

export const deleteAdminNotificationTemplate = async (templateId) => {
    const response = await axios.delete(
        `${API_URL}/admin/notification-templates/${templateId}`,
        { headers: authHeaders() }
    );
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
