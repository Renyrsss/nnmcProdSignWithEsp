import axios from "axios";
import {
    getActiveOrganizationCode,
    getApiRoot,
    getOrganizationByCode,
    getOrganizationStorageKey,
    setActiveOrganization,
} from "../config/organizations";

const getStoredValue = (kind, organizationCode = getActiveOrganizationCode()) => {
    const key = getOrganizationStorageKey(kind, organizationCode);
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;

    // One-time, backward-compatible migration of the existing NNMC session.
    if (organizationCode === "nnmc") {
        const legacy = localStorage.getItem(kind);
        if (legacy !== null) {
            localStorage.setItem(key, legacy);
            localStorage.removeItem(kind);
            return legacy;
        }
    }
    return null;
};

const setStoredValue = (kind, value, organizationCode = getActiveOrganizationCode()) =>
    localStorage.setItem(getOrganizationStorageKey(kind, organizationCode), value);

const removeStoredValue = (kind, organizationCode = getActiveOrganizationCode()) => {
    localStorage.removeItem(getOrganizationStorageKey(kind, organizationCode));
    if (organizationCode === "nnmc") localStorage.removeItem(kind);
};

const verifyOrganizationContext = async (organizationCode) => {
    const expectedOrganization = getOrganizationByCode(organizationCode);
    // Fail closed: credentials are never sent when the backend cannot prove
    // which organization it belongs to.
    const response = await axios.get(
        `${getApiRoot(organizationCode)}/system/organization`
    );
    const backendOrganization = response.data?.data;
    if (
        backendOrganization?.code &&
        backendOrganization.code !== expectedOrganization.code
    ) {
        throw new Error(
            `Ошибка конфигурации: выбран контур «${expectedOrganization.shortName}», ` +
                `но backend принадлежит организации «${
                    backendOrganization.shortName || backendOrganization.code
                }». Вход остановлен для защиты документов.`
        );
    }
    return backendOrganization || null;
};

const storeUser = (user, organizationCode = getActiveOrganizationCode()) => {
    if (user) {
        setStoredValue("user", JSON.stringify(user), organizationCode);
        window.dispatchEvent(
            new CustomEvent("auth:user-updated", {
                detail: { user, organizationCode },
            })
        );
    }
};

const getStoredSessionVersion = (organizationCode = getActiveOrganizationCode()) => {
    try {
        const user = JSON.parse(getStoredValue("user", organizationCode) || "null");
        return user?.sessionVersion || null;
    } catch {
        return null;
    }
};

const authHeaders = (organizationCode = getActiveOrganizationCode()) => {
    const headers = { Authorization: `Bearer ${getToken(organizationCode)}` };
    const sessionVersion = getStoredSessionVersion(organizationCode);
    if (sessionVersion) headers["X-Session-Version"] = String(sessionVersion);
    return headers;
};

export const login = async (identifier, password, organizationCode) => {
    try {
        const organization = setActiveOrganization(
            organizationCode || getActiveOrganizationCode()
        );
        await verifyOrganizationContext(organization.code);
        const response = await axios.post(`${getApiRoot(organization.code)}/auth/local`, {
            identifier,
            password,
        });

        if (response.data.jwt) {
            setStoredValue("token", response.data.jwt, organization.code);
            storeUser(response.data.user, organization.code);
            await refreshCurrentUser(organization.code);
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const getPublicPasswordPolicy = async () => {
    try {
        const response = await axios.get(`${getApiRoot()}/auth/password/policy`);
        return response.data?.data || {};
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const requestPasswordReset = async (email) => {
    try {
        const response = await axios.post(`${getApiRoot()}/auth/password/forgot`, {
            email,
        });
        return response.data?.data || {};
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const resetPasswordWithToken = async (
    token,
    password,
    passwordConfirmation
) => {
    try {
        const response = await axios.post(`${getApiRoot()}/auth/password/reset`, {
            token,
            password,
            passwordConfirmation,
        });
        logout();
        return response.data?.data || {};
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const register = async (username, email, password) => {
    try {
        const response = await axios.post(`${getApiRoot()}/auth/local/register`, {
            username,
            email,
            password,
        });

        if (response.data.jwt) {
            setStoredValue("token", response.data.jwt);
            storeUser(response.data.user);
            await refreshCurrentUser();
        }

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};

export const logout = (organizationCode = getActiveOrganizationCode()) => {
    removeStoredValue("token", organizationCode);
    removeStoredValue("user", organizationCode);
};

export const logoutCurrentUser = async () => {
    try {
        await axios.post(
            `${getApiRoot()}/profile/logout`,
            {},
            { headers: authHeaders() }
        );
    } catch (error) {
        console.warn("Не удалось зарегистрировать выход на сервере:", error);
    } finally {
        logout();
    }
};

export const getCurrentUser = (organizationCode = getActiveOrganizationCode()) => {
    const user = getStoredValue("user", organizationCode);
    try {
        return user ? JSON.parse(user) : null;
    } catch {
        return null;
    }
};

export const getToken = (organizationCode = getActiveOrganizationCode()) => {
    return getStoredValue("token", organizationCode);
};

export const isAuthenticated = (organizationCode = getActiveOrganizationCode()) => {
    return !!getToken(organizationCode);
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

export const refreshCurrentUser = async (
    organizationCode = getActiveOrganizationCode()
) => {
    const token = getToken(organizationCode);
    if (!token) return null;

    try {
        const response = await axios.get(`${getApiRoot(organizationCode)}/admin/me`, {
            headers: authHeaders(organizationCode),
        });
        const user = response.data?.data || response.data;
        storeUser(user, organizationCode);
        return user;
    } catch (error) {
        if ([401, 403].includes(error.response?.status)) logout(organizationCode);
        throw error;
    }
};

export const getMe = async () => {
    return refreshCurrentUser();
};

export const recordSecurityHeartbeat = async () => {
    const token = getToken();
    if (!token) return null;

    try {
        const response = await axios.post(
            `${getApiRoot()}/security/heartbeat`,
            { sessionVersion: getStoredSessionVersion() },
            { headers: authHeaders() }
        );
        const heartbeat = response.data?.data || {};
        const currentUser = getCurrentUser();
        if (currentUser) {
            storeUser({
                ...currentUser,
                sessionVersion: heartbeat.sessionVersion || currentUser.sessionVersion,
                lastSeenAt: heartbeat.lastSeenAt || currentUser.lastSeenAt,
            });
        }
        return heartbeat;
    } catch (error) {
        if ([401, 403].includes(error.response?.status)) logout();
        throw error;
    }
};

export const changeOwnPassword = async (
    currentPassword,
    password,
    passwordConfirmation
) => {
    try {
        const response = await axios.post(
            `${getApiRoot()}/profile/password`,
            { currentPassword, password, passwordConfirmation },
            { headers: authHeaders() }
        );
        const result = response.data?.data || {};

        if (result.jwt) {
            setStoredValue("token", result.jwt);
        }

        const user = getCurrentUser();
        if (user) {
            storeUser({
                ...user,
                sessionVersion: result.sessionVersion || user.sessionVersion,
                forcedLogoutAt: result.forcedLogoutAt || user.forcedLogoutAt,
            });
        }

        return result;
    } catch (error) {
        if ([401, 403].includes(error.response?.status)) logout();
        throw error.response?.data?.error || error;
    }
};

export const updateOwnProfile = async (fullName, phone) => {
    try {
        const response = await axios.put(
            `${getApiRoot()}/profile`,
            { fullName, phone },
            { headers: authHeaders() }
        );
        const updatedUser = response.data?.data;
        if (updatedUser) storeUser(updatedUser);
        return updatedUser;
    } catch (error) {
        if ([401, 403].includes(error.response?.status)) logout();
        throw error.response?.data?.error || error;
    }
};

export const updateUserProfile = async (fullName) => {
    const token = getToken();
    const user = getCurrentUser();

    try {
        const response = await axios.put(
            `${getApiRoot()}/users/${user.id}`,
            { fullName },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            }
        );

        const updatedUser = { ...user, fullName };
        storeUser(updatedUser);

        return response.data;
    } catch (error) {
        throw error.response?.data?.error || error;
    }
};
