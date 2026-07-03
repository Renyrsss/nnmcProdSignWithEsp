import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import {
    logout,
    getCurrentUser,
    isAdminUser,
    refreshCurrentUser,
} from "../api/auth";
import { getActionablePendingDocuments } from "../api/documents";
import {
    LogOut,
    FileText,
    Clock,
    PlusCircle,
    Shield,
    Users,
} from "lucide-react";

export default function MainLayout() {
    const [user, setUser] = useState(getCurrentUser());
    const [pendingCount, setPendingCount] = useState(0);
    const location = useLocation();
    const isAdmin = isAdminUser(user);

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

    const handleLogout = () => {
        logout();
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
    ];

    const visibleMobileItems = isAdmin ? [...navItems, ...adminItems] : navItems;
    const currentItem =
        [...navItems, ...(isAdmin ? adminItems : [])].find((item) => item.isActive()) ||
        navItems[0];

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
                    <div className='mb-6 flex items-center gap-3 px-2'>
                        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm'>
                            <FileText className='h-6 w-6' />
                        </div>
                        <div className='min-w-0'>
                            <p className='truncate text-base font-bold text-gray-950'>
                                Электронная подпись
                            </p>
                            <p className='truncate text-xs text-gray-500'>
                                Документооборот
                            </p>
                        </div>
                    </div>

                    <nav className='space-y-6' aria-label='Основная навигация'>
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

                    <div className='mt-auto border-t border-gray-200 pt-4'>
                        <div className='mb-3 rounded-lg bg-gray-50 px-3 py-2.5'>
                            <p className='truncate text-sm font-semibold text-gray-900'>
                                {userName}
                            </p>
                            {userEmail && (
                                <p className='truncate text-xs text-gray-500'>
                                    {userEmail}
                                </p>
                            )}
                        </div>
                        <button
                            type='button'
                            onClick={handleLogout}
                            className='flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50'>
                            <LogOut className='h-4 w-4' />
                            Выйти
                        </button>
                    </div>
                </div>
            </aside>

            <div className='flex min-h-screen min-w-0 flex-1 flex-col'>
                <header className='sticky top-0 z-40 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur lg:hidden'>
                    <div className='flex items-center justify-between gap-3'>
                        <div className='flex min-w-0 items-center gap-3'>
                            <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white'>
                                <FileText className='h-5 w-5' />
                            </div>
                            <div className='min-w-0'>
                                <p className='truncate text-sm font-semibold text-gray-500'>
                                    Электронная подпись
                                </p>
                                <h1 className='truncate text-base font-bold text-gray-950'>
                                    {currentItem.label}
                                </h1>
                            </div>
                        </div>

                        <div className='flex shrink-0 items-center gap-2'>
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
                            <button
                                type='button'
                                onClick={handleLogout}
                                aria-label='Выйти'
                                className='flex h-10 w-10 items-center justify-center rounded-lg text-red-600 transition-colors hover:bg-red-50'>
                                <LogOut className='h-5 w-5' />
                            </button>
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
