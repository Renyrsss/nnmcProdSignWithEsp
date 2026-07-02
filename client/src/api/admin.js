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

export const getAdminUsers = async () => {
    const response = await axios.get(`${API_URL}/admin/users`, {
        headers: authHeaders(),
    });
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
