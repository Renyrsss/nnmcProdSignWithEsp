import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    KeyRound,
    LogOut,
    RefreshCw,
    Save,
    ShieldAlert,
    Smartphone,
    Wifi,
} from "lucide-react";
import {
    forceLogoutAdminUser,
    getAdminSecurity,
    updateAdminSecuritySettings,
} from "../api/admin";
import { getCurrentUser } from "../api/auth";
import { useToast } from "./Toast";

const DEFAULT_SETTINGS = {
    passwordPolicy: {
        minLength: 8,
        requireUppercase: false,
        requireLowercase: false,
        requireNumber: false,
        requireSpecial: false,
        rotateDays: "",
    },
    ipRestrictionEnabled: false,
    allowedIpRanges: [],
    sessionIdleMinutes: 30,
    twoFactorPlanned: false,
    suspiciousActivityThreshold: 5,
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

const getUserName = (user) =>
    user?.fullName || user?.username || user?.email || "Пользователь";

const getRoleName = (role) => role?.name || role?.type || "Без роли";

export default function AdminSecurityPage() {
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [sessions, setSessions] = useState([]);
    const [suspiciousLogs, setSuspiciousLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [forceSavingId, setForceSavingId] = useState(null);
    const [reasonByUser, setReasonByUser] = useState({});
    const toast = useToast();
    const currentUser = getCurrentUser();

    const loadSecurity = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminSecurity();
            setSettings({
                ...DEFAULT_SETTINGS,
                ...(data.settings || {}),
                passwordPolicy: {
                    ...DEFAULT_SETTINGS.passwordPolicy,
                    ...(data.settings?.passwordPolicy || {}),
                    rotateDays: data.settings?.passwordPolicy?.rotateDays || "",
                },
                allowedIpRanges: data.settings?.allowedIpRanges || [],
            });
            setSessions(data.sessions || []);
            setSuspiciousLogs(data.suspiciousLogs || []);
        } catch (error) {
            console.error("Ошибка загрузки безопасности:", error);
            toast.error("Ошибка загрузки настроек безопасности");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSecurity();
    }, [loadSecurity]);

    const onlineCount = useMemo(
        () => sessions.filter((session) => session.isOnline).length,
        [sessions]
    );

    const updateSetting = (key, value) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const updatePolicy = (key, value) => {
        setSettings((prev) => ({
            ...prev,
            passwordPolicy: {
                ...prev.passwordPolicy,
                [key]: value,
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...settings,
                allowedIpRanges: Array.isArray(settings.allowedIpRanges)
                    ? settings.allowedIpRanges
                    : String(settings.allowedIpRanges || "").split(/\n|,/),
                passwordPolicy: {
                    ...settings.passwordPolicy,
                    minLength: Number(settings.passwordPolicy.minLength),
                    rotateDays: settings.passwordPolicy.rotateDays || null,
                },
                sessionIdleMinutes: Number(settings.sessionIdleMinutes),
                suspiciousActivityThreshold: Number(
                    settings.suspiciousActivityThreshold
                ),
            };
            const saved = await updateAdminSecuritySettings(payload);
            setSettings({
                ...DEFAULT_SETTINGS,
                ...saved,
                passwordPolicy: {
                    ...DEFAULT_SETTINGS.passwordPolicy,
                    ...(saved.passwordPolicy || {}),
                    rotateDays: saved.passwordPolicy?.rotateDays || "",
                },
                allowedIpRanges: saved.allowedIpRanges || [],
            });
            toast.success("Настройки безопасности сохранены");
        } catch (error) {
            console.error("Ошибка сохранения безопасности:", error);
            toast.error(
                error.response?.data?.error?.message ||
                    "Ошибка сохранения настроек безопасности"
            );
        } finally {
            setSaving(false);
        }
    };

    const handleForceLogout = async (session) => {
        setForceSavingId(session.id);
        try {
            await forceLogoutAdminUser(session.id, reasonByUser[session.id] || "");
            toast.success("Сессии пользователя завершены");
            setReasonByUser((prev) => ({ ...prev, [session.id]: "" }));
            await loadSecurity();
        } catch (error) {
            console.error("Ошибка завершения сессии:", error);
            toast.error(
                error.response?.data?.error?.message ||
                    "Ошибка завершения сессии пользователя"
            );
        } finally {
            setForceSavingId(null);
        }
    };

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <ShieldAlert className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Безопасность
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Сессии, парольная политика, IP-доступ и события риска
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={loadSecurity}
                        disabled={loading}
                        className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                        <RefreshCw
                            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                        />
                        Обновить
                    </button>
                </div>
            </div>

            <div className='mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]'>
                <div className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex items-center gap-2'>
                        <KeyRound className='h-5 w-5 text-indigo-600' />
                        <h3 className='text-lg font-semibold text-gray-900'>
                            Политики
                        </h3>
                    </div>

                    <div className='space-y-4'>
                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Минимальная длина пароля
                            </label>
                            <input
                                type='number'
                                min='6'
                                max='128'
                                value={settings.passwordPolicy.minLength}
                                onChange={(event) =>
                                    updatePolicy("minLength", event.target.value)
                                }
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                            {[
                                ["requireUppercase", "Заглавная буква"],
                                ["requireLowercase", "Строчная буква"],
                                ["requireNumber", "Цифра"],
                                ["requireSpecial", "Спецсимвол"],
                            ].map(([key, label]) => (
                                <label
                                    key={key}
                                    className='flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700'>
                                    <input
                                        type='checkbox'
                                        checked={Boolean(settings.passwordPolicy[key])}
                                        onChange={(event) =>
                                            updatePolicy(key, event.target.checked)
                                        }
                                    />
                                    {label}
                                </label>
                            ))}
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Ротация пароля, дней
                            </label>
                            <input
                                type='number'
                                min='1'
                                value={settings.passwordPolicy.rotateDays}
                                onChange={(event) =>
                                    updatePolicy("rotateDays", event.target.value)
                                }
                                placeholder='Не требуется'
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                            <div>
                                <label className='mb-1 block text-sm font-medium text-gray-700'>
                                    Таймаут активности, мин
                                </label>
                                <input
                                    type='number'
                                    min='5'
                                    max='1440'
                                    value={settings.sessionIdleMinutes}
                                    onChange={(event) =>
                                        updateSetting(
                                            "sessionIdleMinutes",
                                            event.target.value
                                        )
                                    }
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                            </div>
                            <div>
                                <label className='mb-1 block text-sm font-medium text-gray-700'>
                                    Порог риска
                                </label>
                                <input
                                    type='number'
                                    min='1'
                                    max='100'
                                    value={settings.suspiciousActivityThreshold}
                                    onChange={(event) =>
                                        updateSetting(
                                            "suspiciousActivityThreshold",
                                            event.target.value
                                        )
                                    }
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                            </div>
                        </div>

                        <label className='flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700'>
                            <input
                                type='checkbox'
                                checked={Boolean(settings.twoFactorPlanned)}
                                onChange={(event) =>
                                    updateSetting("twoFactorPlanned", event.target.checked)
                                }
                            />
                            2FA отмечена как планируемая функция
                        </label>

                        <div className='rounded-lg border border-gray-200 p-3'>
                            <label className='mb-2 flex items-center gap-2 text-sm font-medium text-gray-700'>
                                <Wifi className='h-4 w-4' />
                                Ограничение админ-доступа по IP
                            </label>
                            <label className='mb-3 flex items-center gap-2 text-sm text-gray-700'>
                                <input
                                    type='checkbox'
                                    checked={Boolean(settings.ipRestrictionEnabled)}
                                    onChange={(event) =>
                                        updateSetting(
                                            "ipRestrictionEnabled",
                                            event.target.checked
                                        )
                                    }
                                />
                                Включить IP-фильтр
                            </label>
                            <textarea
                                value={(settings.allowedIpRanges || []).join("\n")}
                                onChange={(event) =>
                                    updateSetting(
                                        "allowedIpRanges",
                                        event.target.value.split("\n")
                                    )
                                }
                                rows={4}
                                placeholder='127.0.0.1&#10;192.168.1.0/24'
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <button
                            type='button'
                            onClick={handleSave}
                            disabled={saving}
                            className='inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                            <Save className='h-4 w-4' />
                            {saving ? "Сохранение..." : "Сохранить"}
                        </button>
                    </div>
                </div>

                <div className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                        <div className='flex items-center gap-2'>
                            <Smartphone className='h-5 w-5 text-indigo-600' />
                            <h3 className='text-lg font-semibold text-gray-900'>
                                Активные сессии
                            </h3>
                        </div>
                        <span className='rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700'>
                            Онлайн: {onlineCount}
                        </span>
                    </div>

                    {loading ? (
                        <div className='rounded-lg bg-gray-50 p-10 text-center text-gray-500'>
                            Загрузка...
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full min-w-[900px] text-left text-sm'>
                                <thead>
                                    <tr className='border-b border-gray-200 text-xs uppercase text-gray-500'>
                                        <th className='px-3 py-3'>Пользователь</th>
                                        <th className='px-3 py-3'>Роль</th>
                                        <th className='px-3 py-3'>Последняя активность</th>
                                        <th className='px-3 py-3'>IP</th>
                                        <th className='px-3 py-3'>Статус</th>
                                        <th className='px-3 py-3 text-right'>Logout</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.map((session) => {
                                        const self =
                                            Number(session.id) === Number(currentUser?.id);
                                        return (
                                            <tr
                                                key={session.id}
                                                className='border-b border-gray-100 align-top last:border-0'>
                                                <td className='px-3 py-4'>
                                                    <p className='font-semibold text-gray-900'>
                                                        {getUserName(session)}
                                                    </p>
                                                    <p className='text-xs text-gray-500'>
                                                        {session.email}
                                                    </p>
                                                </td>
                                                <td className='px-3 py-4 text-gray-700'>
                                                    {getRoleName(session.role)}
                                                    <p className='text-xs text-gray-500'>
                                                        {session.department?.name ||
                                                            "Без отдела"}
                                                    </p>
                                                </td>
                                                <td className='px-3 py-4 text-gray-700'>
                                                    {formatDate(session.lastSeenAt)}
                                                    {session.forcedLogoutAt && (
                                                        <p className='text-xs text-red-600'>
                                                            Logout:{" "}
                                                            {formatDate(
                                                                session.forcedLogoutAt
                                                            )}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className='px-3 py-4 text-gray-700'>
                                                    {session.lastSeenIp || "-"}
                                                </td>
                                                <td className='px-3 py-4'>
                                                    <span
                                                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                                            session.blocked
                                                                ? "bg-red-100 text-red-700"
                                                                : session.isOnline
                                                                  ? "bg-green-100 text-green-700"
                                                                  : "bg-gray-100 text-gray-700"
                                                        }`}>
                                                        {session.blocked
                                                            ? "Заблокирован"
                                                            : session.isOnline
                                                              ? "Онлайн"
                                                              : "Неактивен"}
                                                    </span>
                                                </td>
                                                <td className='px-3 py-4'>
                                                    <div className='flex flex-col items-end gap-2'>
                                                        <input
                                                            value={
                                                                reasonByUser[
                                                                    session.id
                                                                ] || ""
                                                            }
                                                            onChange={(event) =>
                                                                setReasonByUser(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [session.id]:
                                                                            event.target
                                                                                .value,
                                                                    })
                                                                )
                                                            }
                                                            placeholder='Причина'
                                                            disabled={self}
                                                            className='w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100'
                                                        />
                                                        <button
                                                            type='button'
                                                            onClick={() =>
                                                                handleForceLogout(
                                                                    session
                                                                )
                                                            }
                                                            disabled={
                                                                self ||
                                                                forceSavingId ===
                                                                    session.id
                                                            }
                                                            className='inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50'>
                                                            <LogOut className='h-4 w-4' />
                                                            Завершить
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <div className='rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-5 flex items-center gap-2'>
                    <AlertTriangle className='h-5 w-5 text-amber-600' />
                    <h3 className='text-lg font-semibold text-gray-900'>
                        Подозрительные события
                    </h3>
                </div>

                {suspiciousLogs.length === 0 ? (
                    <div className='rounded-lg bg-gray-50 p-8 text-center text-sm text-gray-500'>
                        Событий риска пока нет
                    </div>
                ) : (
                    <div className='space-y-3'>
                        {suspiciousLogs.map((log) => (
                            <div
                                key={log.id}
                                className='rounded-lg border border-amber-100 bg-amber-50 p-4'>
                                <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
                                    <p className='text-sm font-semibold text-amber-900'>
                                        {log.metadata?.reason || "security_suspicious_action"}
                                    </p>
                                    <p className='text-xs text-amber-700'>
                                        {formatDate(log.createdAt)}
                                    </p>
                                </div>
                                <p className='mt-1 text-sm text-amber-800'>
                                    {log.actorName || "Система"} · {log.ip || "-"}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
