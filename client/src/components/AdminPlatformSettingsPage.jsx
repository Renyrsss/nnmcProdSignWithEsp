import React, { useCallback, useEffect, useState } from "react";
import {
    Bell,
    FileArchive,
    Link,
    Loader2,
    QrCode,
    Save,
    Settings,
    ShieldCheck,
} from "lucide-react";
import {
    getAdminPlatformSettings,
    updateAdminPlatformSettings,
} from "../api/admin";
import { useToast } from "./Toast";

const DEFAULT_FORM = {
    baseUrl: "",
    qrTemplate: "",
    stampTemplate: "",
    maxFileSizeMb: 25,
    allowedFileExtensions: ".pdf",
    documentRetentionDays: "",
    archiveRetentionDays: "",
    emailNotifications: true,
    smsNotifications: false,
    internalNotifications: true,
    notifyAuthorOnComplete: true,
    notifyAdminOnErrors: true,
    unsignedReminderEnabled: false,
    unsignedReminderHours: 24,
    unsignedReminderTime: "16:00",
    unsignedReminderWeekdaysOnly: true,
    signatureModes: {
        eds: true,
        simple: true,
        combined: false,
    },
    retentionPolicyEnabled: false,
};

const toForm = (settings) => ({
    ...DEFAULT_FORM,
    ...settings,
    allowedFileExtensions: (settings.allowedFileExtensions || [".pdf"]).join(", "),
    documentRetentionDays: settings.documentRetentionDays || "",
    archiveRetentionDays: settings.archiveRetentionDays || "",
    signatureModes: {
        ...DEFAULT_FORM.signatureModes,
        ...(settings.signatureModes || {}),
    },
});

const toPayload = (form) => ({
    ...form,
    maxFileSizeMb: Number(form.maxFileSizeMb),
    allowedFileExtensions: form.allowedFileExtensions
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    documentRetentionDays: form.documentRetentionDays
        ? Number(form.documentRetentionDays)
        : null,
    archiveRetentionDays: form.archiveRetentionDays
        ? Number(form.archiveRetentionDays)
        : null,
    unsignedReminderHours: Number(form.unsignedReminderHours),
});

export default function AdminPlatformSettingsPage() {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [updatedAt, setUpdatedAt] = useState(null);
    const toast = useToast();

    const loadSettings = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminPlatformSettings();
            setForm(toForm(data || {}));
            setUpdatedAt(data?.updatedAt || null);
        } catch (error) {
            console.error("Ошибка загрузки настроек платформы:", error);
            toast.error("Ошибка загрузки настроек платформы");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const updateField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const updateSignatureMode = (key, value) => {
        setForm((prev) => ({
            ...prev,
            signatureModes: {
                ...prev.signatureModes,
                [key]: value,
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await updateAdminPlatformSettings(toPayload(form));
            setForm(toForm(updated || {}));
            setUpdatedAt(updated?.updatedAt || null);
            toast.success("Настройки платформы сохранены");
        } catch (error) {
            console.error("Ошибка сохранения настроек:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка сохранения настроек"
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className='flex min-h-[60vh] items-center justify-center'>
                <div className='text-center text-gray-500'>
                    <Loader2 className='mx-auto mb-3 h-10 w-10 animate-spin text-indigo-600' />
                    Загрузка настроек...
                </div>
            </div>
        );
    }

    return (
        <div className='mx-auto max-w-6xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <Settings className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Настройки платформы
                            </h2>
                            <p className='text-sm text-gray-500'>
                                {updatedAt
                                    ? `Обновлено: ${new Date(updatedAt).toLocaleString("ru-RU")}`
                                    : "Базовые параметры системы"}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={handleSave}
                        disabled={saving}
                        className='inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                        {saving ? (
                            <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                            <Save className='h-4 w-4' />
                        )}
                        Сохранить
                    </button>
                </div>
            </div>

            <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
                <section className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex items-center gap-2'>
                        <Link className='h-5 w-5 text-indigo-600' />
                        <h3 className='font-semibold text-gray-900'>
                            Общие параметры
                        </h3>
                    </div>

                    <div className='space-y-4'>
                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Базовый URL системы
                            </label>
                            <input
                                value={form.baseUrl}
                                onChange={(event) =>
                                    updateField("baseUrl", event.target.value)
                                }
                                placeholder='https://sign.example.kz'
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Шаблон QR-кода
                            </label>
                            <textarea
                                value={form.qrTemplate}
                                onChange={(event) =>
                                    updateField("qrTemplate", event.target.value)
                                }
                                rows={4}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                            <p className='mt-1 text-xs text-gray-500'>
                                Доступные переменные: {"{{title}}"}, {"{{uid}}"},{" "}
                                {"{{signerName}}"}, {"{{signedAt}}"}, {"{{iin}}"}
                            </p>
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Шаблон штампа подписи
                            </label>
                            <textarea
                                value={form.stampTemplate}
                                onChange={(event) =>
                                    updateField("stampTemplate", event.target.value)
                                }
                                rows={4}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>
                    </div>
                </section>

                <section className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex items-center gap-2'>
                        <FileArchive className='h-5 w-5 text-indigo-600' />
                        <h3 className='font-semibold text-gray-900'>
                            Файлы и хранение
                        </h3>
                    </div>

                    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Лимит файла, МБ
                            </label>
                            <input
                                type='number'
                                min='1'
                                max='500'
                                value={form.maxFileSizeMb}
                                onChange={(event) =>
                                    updateField("maxFileSizeMb", event.target.value)
                                }
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Форматы файлов
                            </label>
                            <input
                                value={form.allowedFileExtensions}
                                onChange={(event) =>
                                    updateField(
                                        "allowedFileExtensions",
                                        event.target.value
                                    )
                                }
                                placeholder='.pdf'
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <label className='flex items-center gap-3 rounded-lg border border-gray-200 p-3 sm:col-span-2'>
                            <input
                                type='checkbox'
                                checked={form.retentionPolicyEnabled}
                                onChange={(event) =>
                                    updateField(
                                        "retentionPolicyEnabled",
                                        event.target.checked
                                    )
                                }
                                className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                            />
                            <span className='text-sm font-medium text-gray-700'>
                                Включить политику сроков хранения
                            </span>
                        </label>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Хранение документов, дней
                            </label>
                            <input
                                type='number'
                                min='1'
                                value={form.documentRetentionDays}
                                onChange={(event) =>
                                    updateField(
                                        "documentRetentionDays",
                                        event.target.value
                                    )
                                }
                                disabled={!form.retentionPolicyEnabled}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>

                        <div>
                            <label className='mb-1 block text-sm font-medium text-gray-700'>
                                Хранение архива, дней
                            </label>
                            <input
                                type='number'
                                min='1'
                                value={form.archiveRetentionDays}
                                onChange={(event) =>
                                    updateField(
                                        "archiveRetentionDays",
                                        event.target.value
                                    )
                                }
                                disabled={!form.retentionPolicyEnabled}
                                className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>
                    </div>
                </section>

                <section className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex items-center gap-2'>
                        <Bell className='h-5 w-5 text-indigo-600' />
                        <h3 className='font-semibold text-gray-900'>
                            Уведомления
                        </h3>
                    </div>

                    <div className='space-y-3'>
                        {[
                            ["internalNotifications", "Внутренние уведомления"],
                            ["emailNotifications", "Email-уведомления"],
                            ["smsNotifications", "SMS-уведомления"],
                            [
                                "notifyAuthorOnComplete",
                                "Уведомлять автора после завершения",
                            ],
                            [
                                "notifyAdminOnErrors",
                                "Уведомлять администратора об ошибках",
                            ],
                            [
                                "unsignedReminderEnabled",
                                "Напоминать о неподписанных документах",
                            ],
                        ].map(([key, label]) => (
                            <label
                                key={key}
                                className='flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5'>
                                <span className='text-sm font-medium text-gray-700'>
                                    {label}
                                </span>
                                <input
                                    type='checkbox'
                                    checked={Boolean(form[key])}
                                    onChange={(event) =>
                                        updateField(key, event.target.checked)
                                    }
                                    className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                                />
                            </label>
                        ))}

                        <div className='rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-900'>
                            Email о новых документах объединяются по получателю:
                            массовая загрузка создаёт одно сводное письмо, а при
                            последовательной подписи уведомление получает только
                            текущий подписант.
                        </div>

                        <div className='rounded-lg border border-gray-200 p-4'>
                            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end'>
                                <div>
                                    <label
                                        htmlFor='unsigned-reminder-time'
                                        className='mb-1 block text-sm font-medium text-gray-700'>
                                        Время ежедневного напоминания
                                    </label>
                                    <input
                                        id='unsigned-reminder-time'
                                        type='time'
                                        value={form.unsignedReminderTime}
                                        onChange={(event) =>
                                            updateField(
                                                "unsignedReminderTime",
                                                event.target.value
                                            )
                                        }
                                        disabled={!form.unsignedReminderEnabled}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>

                                <label className='flex min-h-10 items-center gap-3 rounded-lg bg-gray-50 px-3 py-2'>
                                    <input
                                        type='checkbox'
                                        checked={Boolean(
                                            form.unsignedReminderWeekdaysOnly
                                        )}
                                        onChange={(event) =>
                                            updateField(
                                                "unsignedReminderWeekdaysOnly",
                                                event.target.checked
                                            )
                                        }
                                        disabled={!form.unsignedReminderEnabled}
                                        className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                                    />
                                    <span className='text-sm font-medium text-gray-700'>
                                        Только по рабочим дням
                                    </span>
                                </label>
                            </div>
                            <p className='mt-3 text-xs leading-5 text-gray-500'>
                                Одно сводное письмо на пользователя в день, только
                                если есть документы, ожидающие именно его подписи.
                                Часовой пояс: Asia/Almaty.
                            </p>
                            {!form.emailNotifications &&
                                form.unsignedReminderEnabled && (
                                    <p className='mt-2 text-xs font-medium text-amber-700'>
                                        Включите Email-уведомления выше, иначе
                                        напоминания отправляться не будут.
                                    </p>
                                )}
                        </div>
                    </div>
                </section>

                <section className='rounded-xl bg-white p-6 shadow-sm'>
                    <div className='mb-5 flex items-center gap-2'>
                        <QrCode className='h-5 w-5 text-indigo-600' />
                        <h3 className='font-semibold text-gray-900'>
                            Режимы подписи
                        </h3>
                    </div>

                    <div className='space-y-3'>
                        {[
                            ["eds", "ЭЦП через NCALayer"],
                            ["simple", "Простая подпись"],
                            ["combined", "Комбинированная подпись"],
                        ].map(([key, label]) => (
                            <label
                                key={key}
                                className='flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-3 py-2.5'>
                                <span className='inline-flex items-center gap-2 text-sm font-medium text-gray-700'>
                                    <ShieldCheck className='h-4 w-4 text-gray-400' />
                                    {label}
                                </span>
                                <input
                                    type='checkbox'
                                    checked={Boolean(form.signatureModes[key])}
                                    onChange={(event) =>
                                        updateSignatureMode(key, event.target.checked)
                                    }
                                    className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                                />
                            </label>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
