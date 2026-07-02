import axios from "axios";

const API_URL = `${import.meta.env.VITE_API_BASE}/api`;

const storeUser = (user) => {
    if (user) {
        localStorage.setItem("user", JSON.stringify(user));
    }
};

export const login = async (identifier, password) => {
    try {
        const response = await axios.post(`${API_URL}/auth/local`, {
            identifier,
            password,
        });

        if (response.data.jwt) {
            localStorage.setItem("token", response.data.jwt);
            storeUser(response.data.user);
            await refreshCurrentUser();
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const register = async (username, email, password) => {
    try {
        const response = await axios.post(`${API_URL}/auth/local/register`, {
            username,
            email,
            password,
        });

        if (response.data.jwt) {
            localStorage.setItem("token", response.data.jwt);
            storeUser(response.data.user);
            await refreshCurrentUser();
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
};

export const getCurrentUser = () => {
    const user = localStorage.getItem("user");
    try {
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
};

export const getToken = () => {
    return localStorage.getItem("token");
};

export const isAuthenticated = () => {
    return !!getToken();
};

export const getUserFullName = () => {
    const user = getCurrentUser();
    return user?.fullName || "";
};

export const isAdminUser = (user = getCurrentUser()) => {
    const role = user?.role;
    const type = String(role?.type || "").toLowerCase();
    const name = String(role?.name || "").toLowerCase();
    return (
        type === "app_admin" ||
        type === "admin" ||
        type === "administrator" ||
        name === "admin" ||
        name === "administrator" ||
        name === "администратор"
    );
};

export const refreshCurrentUser = async () => {
    const token = getToken();
    if (!token) return null;

    const response = await axios.get(`${API_URL}/admin/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const user = response.data?.data || response.data;
    storeUser(user);
    return user;
};

export const getMe = async () => {
    return refreshCurrentUser();
};

export const updateUserProfile = async (fullName) => {
    const token = getToken();
    const user = getCurrentUser();

    try {
        const response = await axios.put(
            `${API_URL}/users/${user.id}`,
            { fullName },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        const updatedUser = { ...user, fullName };
        localStorage.setItem("user", JSON.stringify(updatedUser));

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};
