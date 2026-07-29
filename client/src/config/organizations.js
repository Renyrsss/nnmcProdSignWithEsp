const env = import.meta.env;

const ACTIVE_ORGANIZATION_KEY = "medsign:active-organization";
const LAST_ORGANIZATION_KEY = "medsign:last-organization";

const normalizeCode = (value, fallback = "") => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "");
    return normalized || fallback;
};

const normalizeBaseUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
        const url = new URL(raw);
        if (!["http:", "https:"].includes(url.protocol)) return "";
        return url.toString().replace(/\/$/, "");
    } catch {
        return "";
    }
};

const normalizeStatus = (value, hasApiBase) => {
    const status = String(value || "").trim().toLowerCase();
    if (["active", "planned", "maintenance"].includes(status)) return status;
    return hasApiBase ? "active" : "planned";
};

const normalizeOrganization = (organization, fallback = {}) => {
    const code = normalizeCode(organization?.code, fallback.code || "organization");
    const apiBase = normalizeBaseUrl(
        organization?.apiBase || organization?.apiUrl || fallback.apiBase
    );

    return {
        code,
        name: String(organization?.name || fallback.name || code).trim(),
        shortName: String(
            organization?.shortName || fallback.shortName || organization?.name || code
        ).trim(),
        description: String(
            organization?.description || fallback.description || ""
        ).trim(),
        apiBase,
        status: normalizeStatus(
            organization?.status || fallback.status,
            Boolean(apiBase)
        ),
        theme: normalizeCode(organization?.theme || fallback.theme, "indigo"),
    };
};

const defaultOrganizations = [
    normalizeOrganization({
        code: "nnmc",
        name: "Национальный научный медицинский центр",
        shortName: "ННМЦ",
        description: "Основной контур электронного документооборота ННМЦ.",
        // Legacy fallback keeps the current NNMC deployment working while the
        // new shared-frontend variables are introduced in Coolify.
        apiBase: env.VITE_NNMC_API_BASE || env.VITE_API_BASE,
        status: env.VITE_NNMC_STATUS,
        theme: "indigo",
    }),
    normalizeOrganization({
        code: "mexel",
        name: "ТОО Mexel Health",
        shortName: "Mexel Health",
        description: "Изолированный контур документов ТОО Mexel Health.",
        apiBase: env.VITE_MEXEL_API_BASE,
        status: env.VITE_MEXEL_STATUS,
        theme: "emerald",
    }),
    normalizeOrganization({
        code: "umit",
        name: "ТОО Umit",
        shortName: "Umit",
        description: "Будущий изолированный контур ТОО Umit.",
        apiBase: env.VITE_UMIT_API_BASE,
        status: env.VITE_UMIT_STATUS || "planned",
        theme: "amber",
    }),
];

const parseOrganizations = () => {
    const raw = String(env.VITE_ORGANIZATIONS_JSON || "").trim();
    if (!raw) return defaultOrganizations;

    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error("ожидался непустой JSON-массив");
        }
        return parsed.map((item, index) =>
            normalizeOrganization(item, {
                code: `organization-${index + 1}`,
                theme: "indigo",
            })
        );
    } catch (error) {
        console.error(
            "Не удалось прочитать VITE_ORGANIZATIONS_JSON, используется стандартный реестр:",
            error
        );
        return defaultOrganizations;
    }
};

export const organizations = parseOrganizations();

export const getOrganizationByCode = (code) => {
    const normalizedCode = normalizeCode(code);
    return organizations.find((item) => item.code === normalizedCode) || null;
};

export const isOrganizationAvailable = (organization) =>
    Boolean(organization?.apiBase && organization.status === "active");

export const availableOrganizations = organizations.filter(isOrganizationAvailable);

const getOrganizationCodeFromUrl = () => {
    if (typeof window === "undefined") return "";
    return normalizeCode(
        new URLSearchParams(window.location.search).get("organization")
    );
};

const getDefaultOrganizationCode = () => {
    const configured = getOrganizationByCode(env.VITE_DEFAULT_ORGANIZATION_CODE);
    if (isOrganizationAvailable(configured)) return configured.code;

    const nnmc = getOrganizationByCode("nnmc");
    if (isOrganizationAvailable(nnmc)) return nnmc.code;

    return availableOrganizations[0]?.code || organizations[0]?.code || "nnmc";
};

export const getActiveOrganizationCode = () => {
    if (typeof window === "undefined") return getDefaultOrganizationCode();

    const urlOrganization = getOrganizationByCode(getOrganizationCodeFromUrl());
    if (isOrganizationAvailable(urlOrganization)) {
        sessionStorage.setItem(ACTIVE_ORGANIZATION_KEY, urlOrganization.code);
        localStorage.setItem(LAST_ORGANIZATION_KEY, urlOrganization.code);
        return urlOrganization.code;
    }

    const sessionOrganization = getOrganizationByCode(
        sessionStorage.getItem(ACTIVE_ORGANIZATION_KEY)
    );
    if (isOrganizationAvailable(sessionOrganization)) {
        return sessionOrganization.code;
    }

    const lastOrganization = getOrganizationByCode(
        localStorage.getItem(LAST_ORGANIZATION_KEY)
    );
    if (isOrganizationAvailable(lastOrganization)) return lastOrganization.code;

    return getDefaultOrganizationCode();
};

export const getActiveOrganization = () =>
    getOrganizationByCode(getActiveOrganizationCode()) || organizations[0];

export const setActiveOrganization = (code) => {
    const organization = getOrganizationByCode(code);
    if (!isOrganizationAvailable(organization)) {
        throw new Error("Контур организации ещё не настроен");
    }

    sessionStorage.setItem(ACTIVE_ORGANIZATION_KEY, organization.code);
    localStorage.setItem(LAST_ORGANIZATION_KEY, organization.code);
    document.title = `MedSign — ${organization.shortName}`;
    window.dispatchEvent(
        new CustomEvent("organization:changed", { detail: organization })
    );
    return organization;
};

export const getApiRoot = (organizationCode = getActiveOrganizationCode()) => {
    const organization = getOrganizationByCode(organizationCode);
    if (!isOrganizationAvailable(organization)) {
        throw new Error("Backend выбранной организации не настроен");
    }
    return `${organization.apiBase}/api`;
};

export const getBackendBaseUrl = (
    organizationCode = getActiveOrganizationCode()
) => {
    const organization = getOrganizationByCode(organizationCode);
    if (!isOrganizationAvailable(organization)) {
        throw new Error("Backend выбранной организации не настроен");
    }
    return organization.apiBase;
};

export const getOrganizationStorageKey = (
    kind,
    organizationCode = getActiveOrganizationCode()
) => `medsign:${normalizeCode(organizationCode, "nnmc")}:${kind}`;

export const organizationThemeClasses = {
    indigo: {
        icon: "bg-indigo-600 text-white",
        badge: "bg-indigo-50 text-indigo-700 ring-indigo-200",
        border: "hover:border-indigo-300 hover:shadow-indigo-100",
        button: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-200",
    },
    emerald: {
        icon: "bg-emerald-600 text-white",
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
        border: "hover:border-emerald-300 hover:shadow-emerald-100",
        button: "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-200",
    },
    amber: {
        icon: "bg-amber-500 text-white",
        badge: "bg-amber-50 text-amber-800 ring-amber-200",
        border: "hover:border-amber-300 hover:shadow-amber-100",
        button: "bg-amber-500 hover:bg-amber-600 focus:ring-amber-200",
    },
};

export const getOrganizationTheme = (organization = getActiveOrganization()) =>
    organizationThemeClasses[organization?.theme] || organizationThemeClasses.indigo;
