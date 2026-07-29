import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
    logoutCurrentUser,
    getCurrentUser,
    getToken,
    isAdminUser,
    refreshCurrentUser,
    recordSecurityHeartbeat,
} from "../api/auth";
import { getActionablePendingDocuments } from "../api/documents";
import {
    LogOut,
    FileText,
    Clock,
    PlusCircle,
    Shield,
    Users,
    FileCog,
    ClipboardList,
    ShieldCheck,
    Settings,
    Bell,
    BarChart3,
    Archive,
    ShieldAlert,
    UserRound,
    ChevronRight,
    Building2,
} from "lucide-react";
import {
    getActiveOrganization,
    getOrganizationTheme,
} from "../config/organizations";

export default function MainLayout() {
    const [user, setUser] = useState(getCurrentUser());
    const [pendingCount, setPendingCount] = useState(0);
    const [organization] = useState(getActiveOrganization);
    const location = useLocation();
    const isAdmin = isAdminUser(user);
    const organizationTheme = getOrganizationTheme(organization);

    const loadPendingCount = async () => {
        try {
            const pending = await getActionablePendingDocuments();
            setPendingCount(pending.length);
        } catch (error) {
            console.error("Ошибка загрузки счётчика:", error);
        }
    };

    useEffect(() => {
        const initialTimer = setTimeout(() => {
            loadPendingCount();
        }, 0);

        const interval = setInterval(() => {
            loadPendingCount();
        }, 30000);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        refreshCurrentUser()
            .then((freshUser) => {
                if (freshUser) setUser(freshUser);
            })
            .catch((error) => {
                console.error("Ошибка обновления пользователя:", error);
            });
    }, []);

    useEffect(() => {
        const handleUserUpdated = (event) => {
            if (event.detail?.organizationCode === organization.code) {
                setUser(event.detail.user || getCurrentUser());
            }
        };

        window.addEventListener("auth:user-updated", handleUserUpdated);
        return () =>
            window.removeEventListener("auth:user-updated", handleUserUpdated);
    }, [organization.code]);

    useEffect(() => {
        let mounted = true;

        const heartbeat = async () => {
            try {
                await recordSecurityHeartbeat();
            } catch (error) {
                console.error("Сессия завершена или heartbeat недоступен:", error);
                if (mounted && !getToken()) window.location.reload();
            }
        };

        heartbeat();
        const interval = setInterval(heartbeat, 30000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const handleLogout = async () => {
        await logoutCurrentUser();
        window.location.reload();
    };

    const pathname = location.pathname;
    const userName = user?.fullName || user?.username || "Пользователь";
    const userEmail = user?.email || "";

    const isDocumentDetailPath = () => {
        const reservedDocumentRoutes = [
            "/documents/pending",
            "/documents/new",
            "/documents/batch-sign",
        ];

        return (
            /^\/documents\/[^/]+$/.test(pathname) &&
            !reservedDocumentRoutes.includes(pathname)
        );
    };

    const navItems = [
        {
            to: "/documents",
            label: "Мои документы",
            shortLabel: "Мои",
            icon: FileText,
            end: true,
            isActive: () => pathname === "/documents" || isDocumentDetailPath(),
        },
        {
            to: "/documents/pending",
            label: "На подпись",
            shortLabel: "Подпись",
            icon: Clock,
            count: pendingCount,
            isActive: () =>
                pathname === "/documents/pending" ||
                pathname.startsWith("/documents/pending/") ||
                pathname === "/documents/batch-sign",
        },
        {
            to: "/documents/new",
            label: "Создать",
            shortLabel: "Создать",
            icon: PlusCircle,
            primary: true,
            isActive: () => pathname === "/documents/new",
        },
    ];

    const adminItems = [
        {
            to: "/admin/documents",
            label: "Все документы",
            shortLabel: "Все",
            icon: Shield,
            isActive: () =>
                pathname === "/admin/documents" ||
                pathname.startsWith("/admin/documents/"),
        },
        {
            to: "/admin/users",
            label: "Пользователи",
            shortLabel: "Люди",
            icon: Users,
            isActive: () =>
                pathname === "/admin/users" ||
                pathname.startsWith("/admin/users/"),
        },
        {
            to: "/admin/role-permissions",
            label: "Роли и права",
            shortLabel: "Права",
            icon: ShieldCheck,
            isActive: () =>
                pathname === "/admin/role-permissions" ||
                pathname.startsWith("/admin/role-permissions/"),
        },
        {
            to: "/admin/document-types",
            label: "Типы документов",
            shortLabel: "Типы",
            icon: FileCog,
            isActive: () =>
                pathname === "/admin/document-types" ||
                pathname.startsWith("/admin/document-types/"),
        },
        {
            to: "/admin/audit-logs",
            label: "Журнал аудита",
            shortLabel: "Журнал",
            icon: ClipboardList,
            isActive: () =>
                pathname === "/admin/audit-logs" ||
                pathname.startsWith("/admin/audit-logs/"),
        },
        {
            to: "/admin/signature-monitoring",
            label: "Мониторинг подписей",
            shortLabel: "ЭЦП",
            icon: ShieldCheck,
            isActive: () =>
                pathname === "/admin/signature-monitoring" ||
                pathname.startsWith("/admin/signature-monitoring/"),
        },
        {
            to: "/admin/platform-settings",
            label: "Настройки",
            shortLabel: "Настр.",
            icon: Settings,
            isActive: () =>
                pathname === "/admin/platform-settings" ||
                pathname.startsWith("/admin/platform-settings/"),
        },
        {
            to: "/admin/notifications",
            label: "Уведомления",
            shortLabel: "Увед.",
            icon: Bell,
            isActive: () =>
                pathname === "/admin/notifications" ||
                pathname.startsWith("/admin/notifications/"),
        },
        {
            to: "/admin/reports",
            label: "Отчеты",
            shortLabel: "Отч.",
            icon: BarChart3,
            isActive: () =>
                pathname === "/admin/reports" ||
                pathname.startsWith("/admin/reports/"),
        },
        {
            to: "/admin/archive",
            label: "Архив",
            shortLabel: "Архив",
            icon: Archive,
            isActive: () =>
                pathname === "/admin/archive" ||
                pathname.startsWith("/admin/archive/"),
        },
        {
            to: "/admin/security",
            label: "Безопасность",
            shortLabel: "Безоп.",
            icon: ShieldAlert,
            isActive: () =>
                pathname === "/admin/security" ||
                pathname.startsWith("/admin/security/"),
        },
    ];

    const visibleMobileItems = isAdmin ? [...navItems, ...adminItems] : navItems;
    const currentItem =
        pathname === "/profile"
            ? { label: "Личный кабинет" }
            : [...navItems, ...(isAdmin ? adminItems : [])].find((item) =>
                  item.isActive()
              ) || navItems[0];

    const desktopNavLink = (item) => {
        const Icon = item.icon;
        const active = item.isActive();

        return (
            <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    item.primary
                        ? active
                            ? "bg-indigo-700 text-white shadow-sm"
                            : "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                        : active
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-950"
                }`}>
                <Icon className='h-5 w-5 shrink-0' />
                <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                {item.count > 0 && (
                    <span
                        className={`ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                            item.primary
                                ? "bg-white text-indigo-700"
                                : active
                                    ? "bg-indigo-600 text-white"
                                    : "bg-red-500 text-white"
                        }`}>
                        {item.count}
                    </span>
                )}
            </NavLink>
        );
    };

    const mobileNavLink = (item) => {
        const Icon = item.icon;
        const active = item.isActive();

        return (
            <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-xs font-medium transition-colors ${
                    item.primary
                        ? active
                            ? "bg-indigo-700 text-white"
                            : "bg-indigo-600 text-white"
                        : active
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-gray-600 hover:bg-gray-100"
                }`}>
                <span className='relative'>
                    <Icon className='h-5 w-5' />
                    {item.count > 0 && (
                        <span className='absolute -right-2.5 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white'>
                            {item.count}
                        </span>
                    )}
                </span>
                <span className='max-w-full truncate leading-tight'>{item.shortLabel}</span>
            </NavLink>
        );
    };

    return (
        <div className='min-h-screen bg-slate-50 text-gray-900 lg:flex'>
            <aside className='hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white'>
                <div className='flex h-full flex-col px-4 py-5'>
                    <div className='mb-6 px-2'>
                        <div className='flex items-center gap-3'>
                            <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${organizationTheme.icon}`}>
                                <FileText className='h-6 w-6' />
                            </div>
                            <div className='min-w-0'>
                                <p className='truncate text-base font-bold text-gray-950'>
                                    MedSign
                                </p>
                                <p className='truncate text-xs text-gray-500'>
                                    {organization.shortName}
                                </p>
                            </div>
                        </div>
                        <NavLink
                            to='/organizations'
                            className='mt-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'>
                            <Building2 className='h-4 w-4' />
                            Сменить организацию
                        </NavLink>
                    </div>

                    <nav
                        className='min-h-0 flex-1 space-y-6 overflow-y-auto pr-1'
                        aria-label='Основная навигация'>
                        <div>
                            <p className='mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400'>
                                Работа
                            </p>
                            <div className='space-y-1'>{navItems.map(desktopNavLink)}</div>
                        </div>

                        {isAdmin && (
                            <div>
                                <p className='mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400'>
                                    Администрирование
                                </p>
                                <div className='space-y-1'>
                                    {adminItems.map(desktopNavLink)}
                                </div>
                            </div>
                        )}
                    </nav>

                    <div className='shrink-0 pt-4'>
                        <div className='overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm'>
                            <NavLink
                                to='/profile'
                                aria-current={
                                    pathname === "/profile" ? "page" : undefined
                                }
                                className={`group flex items-center gap-3 px-3 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                                    pathname === "/profile"
                                        ? "bg-indigo-50/80"
                                        : "hover:bg-gray-50"
                                }`}>
                                <span
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                                        pathname === "/profile"
                                            ? "bg-indigo-600 text-white"
                                            : "bg-indigo-50 text-indigo-600"
                                    }`}>
                                    <UserRound className='h-4.5 w-4.5' />
                                </span>
                                <span className='min-w-0 flex-1'>
                                    <span className='block truncate text-sm font-semibold text-gray-900'>
                                        {userName}
                                    </span>
                                    {userEmail && (
                                        <span className='block truncate text-xs text-gray-500'>
                                            {userEmail}
                                        </span>
                                    )}
                                    <span className='mt-1 block text-xs font-medium text-indigo-600'>
                                        Личный кабинет
                                    </span>
                                </span>
                                <ChevronRight className='h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-500' />
                            </NavLink>
                            <button
                                type='button'
                                onClick={handleLogout}
                                className='flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500'>
                                <LogOut className='h-4 w-4' />
                                Выйти из аккаунта
                            </button>
                        </div>
                    </div>
                </div>
            </aside>

            <div className='flex min-h-screen min-w-0 flex-1 flex-col'>
                <header className='sticky top-0 z-40 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden'>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='flex min-w-0 items-center gap-3'>
                            <div
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${organizationTheme.icon}`}>
                                <FileText className='h-5 w-5' />
                            </div>
                            <div className='min-w-0'>
                                <p className='truncate text-sm font-semibold text-gray-500'>
                                    {organization.shortName}
                                </p>
                                <h1 className='truncate text-base font-bold text-gray-950'>
                                    {currentItem.label}
                                </h1>
                            </div>
                        </div>

                        <div className='flex shrink-0 items-center gap-2'>
                            <NavLink
                                to='/organizations'
                                aria-label='Сменить организацию'
                                className='flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600'>
                                <Building2 className='h-5 w-5' />
                            </NavLink>
                            <div className='hidden max-w-36 text-right sm:block'>
                                <p className='truncate text-sm font-semibold text-gray-900'>
                                    {userName}
                                </p>
                                {userEmail && (
                                    <p className='truncate text-xs text-gray-500'>
                                        {userEmail}
                                    </p>
                                )}
                            </div>
                            <NavLink
                                to='/profile'
                                aria-label='Личный кабинет'
                                aria-current={
                                    pathname === "/profile" ? "page" : undefined
                                }
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                                    pathname === "/profile"
                                        ? "bg-indigo-100 text-indigo-700"
                                        : "text-indigo-600 hover:bg-indigo-50"
                                }`}>
                                <UserRound className='h-5 w-5' />
                            </NavLink>
                        </div>
                    </div>
                </header>

                <main className='min-w-0 flex-1 pb-24 lg:pb-0'>
                    <Outlet />
                </main>

                <nav
                    className='fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden'
                    aria-label='Быстрая навигация'>
                    <div className='mx-auto flex max-w-xl items-stretch gap-1'>
                        {visibleMobileItems.map(mobileNavLink)}
                    </div>
                </nav>
            </div>

        </div>
    );
}
