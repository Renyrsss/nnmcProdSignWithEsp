import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Bell,
    Mail,
    MessageSquare,
    Monitor,
    Pencil,
    Plus,
    Save,
    Search,
    Trash2,
    X,
} from "lucide-react";
import {
    createAdminNotificationTemplate,
    deleteAdminNotificationTemplate,
    getAdminNotificationTemplates,
    updateAdminNotificationTemplate,
} from "../api/admin";
import { useToast } from "./Toast";

const EVENT_LABELS = {
    document_created: "Документ создан",
    document_assigned: "Назначен на подпись",
    document_signed: "Подписан участником",
    document_completed: "Завершен",
    document_cancelled: "Отменен",
    document_overdue: "Просрочен",
    signature_error: "Ошибка подписи",
    manual_reminder: "Ручное напоминание",
};

const CHANNEL_LABELS = {
    internal: "Внутреннее",
    email: "Email",
    sms: "SMS",
};

const CHANNEL_ICONS = {
    internal: Monitor,
    email: Mail,
    sms: MessageSquare,
};

const RECIPIENT_LABELS = {
    author: "Автор документа",
    pendingSigners: "Ожидающие подписанты",
    allSigners: "Все подписанты",
    admins: "Администраторы",
    departmentManager: "Руководитель отдела",
};

const DEFAULT_FORM = {
    code: "",
    name: "",
    event: "document_assigned",
    channel: "internal",
    enabled: true,
    subject: "",
    body: "",
    recipientRules: {
        author: false,
        pendingSigners: true,
        allSigners: false,
        admins: false,
        departmentManager: false,
        customEmails: [],
    },
    customEmailsText: "",
    sendDelayMinutes: 0,
    repeatEveryHours: "",
    maxRepeats: "",
    isSystem: false,
};

const toForm = (template = {}) => ({
    ...DEFAULT_FORM,
    ...template,
    recipientRules: {
        ...DEFAULT_FORM.recipientRules,
        ...(template.recipientRules || {}),
    },
    customEmailsText: (template.recipientRules?.customEmails || []).join(", "),
    repeatEveryHours: template.repeatEveryHours || "",
    maxRepeats: template.maxRepeats || "",
});

const toPayload = (form) => ({
    code: form.code,
    name: form.name,
    event: form.event,
    channel: form.channel,
    enabled: form.enabled,
    subject: form.subject,
    body: form.body,
    recipientRules: {
        ...form.recipientRules,
        customEmails: form.customEmailsText
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
    },
    sendDelayMinutes: Number(form.sendDelayMinutes || 0),
    repeatEveryHours: form.repeatEveryHours ? Number(form.repeatEveryHours) : null,
    maxRepeats: form.maxRepeats ? Number(form.maxRepeats) : null,
    isSystem: form.isSystem,
});

const getRecipientSummary = (rules = {}) => {
    const selected = Object.entries(RECIPIENT_LABELS)
        .filter(([key]) => rules[key])
        .map(([, label]) => label);
    if (Array.isArray(rules.customEmails) && rules.customEmails.length > 0) {
        selected.push(`${rules.customEmails.length} email`);
    }
    return selected.length ? selected.join(", ") : "Получатели не выбраны";
};

export default function AdminNotificationsPage() {
    const [templates, setTemplates] = useState([]);
    const [meta, setMeta] = useState({ events: [], channels: [] });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [filters, setFilters] = useState({
        q: "",
        event: "all",
        channel: "all",
        enabled: "all",
    });
    const [modal, setModal] = useState(null);
    const [form, setForm] = useState(DEFAULT_FORM);
    const toast = useToast();

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminNotificationTemplates();
            setTemplates(response.data || []);
            setMeta(response.meta || { events: [], channels: [] });
        } catch (error) {
            console.error("Ошибка загрузки шаблонов уведомлений:", error);
            toast.error("Ошибка загрузки шаблонов уведомлений");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadTemplates();
    }, [loadTemplates]);

    const filteredTemplates = useMemo(() => {
        const query = filters.q.trim().toLowerCase();
        return templates.filter((template) => {
            if (filters.event !== "all" && template.event !== filters.event) {
                return false;
            }
            if (filters.channel !== "all" && template.channel !== filters.channel) {
                return false;
            }
            if (filters.enabled !== "all") {
                const enabled = filters.enabled === "enabled";
                if (Boolean(template.enabled) !== enabled) return false;
            }
            if (!query) return true;
            return [template.name, template.code, template.subject, template.body]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(query));
        });
    }, [filters, templates]);

    const openCreate = () => {
        setForm(DEFAULT_FORM);
        setModal({ mode: "create" });
    };

    const openEdit = (template) => {
        setForm(toForm(template));
        setModal({ mode: "edit", template });
    };

    const closeModal = () => {
        setModal(null);
        setForm(DEFAULT_FORM);
    };

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const updateRecipientRule = (key, value) => {
        setForm((prev) => ({
            ...prev,
            recipientRules: {
                ...prev.recipientRules,
                [key]: value,
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (modal.mode === "create") {
                await createAdminNotificationTemplate(toPayload(form));
                toast.success("Шаблон уведомления создан");
            } else {
                await updateAdminNotificationTemplate(
                    modal.template.id,
                    toPayload(form)
                );
                toast.success("Шаблон уведомления сохранен");
            }

            closeModal();
            await loadTemplates();
        } catch (error) {
            console.error("Ошибка сохранения шаблона:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка сохранения шаблона"
            );
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (template) => {
        if (!window.confirm(`Удалить шаблон "${template.name}"?`)) return;

        try {
            await deleteAdminNotificationTemplate(template.id);
            toast.success("Шаблон уведомления удален");
            await loadTemplates();
        } catch (error) {
            console.error("Ошибка удаления шаблона:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    "Не удалось удалить шаблон"
            );
        }
    };

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <Bell className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Уведомления
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Шаблоны, получатели и расписание отправки
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={openCreate}
                        className='inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700'>
                        <Plus className='h-4 w-4' />
                        Создать шаблон
                    </button>
                </div>

                <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
                    <div className='md:col-span-2'>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Поиск
                        </label>
                        <div className='relative'>
                            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
                            <input
                                value={filters.q}
                                onChange={(event) =>
                                    setFilters((prev) => ({
                                        ...prev,
                                        q: event.target.value,
                                    }))
                                }
                                placeholder='Название, код или текст'
                                className='w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>
                    </div>

                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Событие
                        </label>
                        <select
                            value={filters.event}
                            onChange={(event) =>
                                setFilters((prev) => ({
                                    ...prev,
                                    event: event.target.value,
                                }))
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                            <option value='all'>Все</option>
                            {(meta.events || Object.keys(EVENT_LABELS)).map((event) => (
                                <option key={event} value={event}>
                                    {EVENT_LABELS[event] || event}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Канал
                        </label>
                        <select
                            value={filters.channel}
                            onChange={(event) =>
                                setFilters((prev) => ({
                                    ...prev,
                                    channel: event.target.value,
                                }))
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                            <option value='all'>Все</option>
                            {(meta.channels || Object.keys(CHANNEL_LABELS)).map(
                                (channel) => (
                                    <option key={channel} value={channel}>
                                        {CHANNEL_LABELS[channel] || channel}
                                    </option>
                                )
                            )}
                        </select>
                    </div>
                </div>
            </div>

            <div className='overflow-hidden rounded-xl bg-white shadow-sm'>
                {loading ? (
                    <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                ) : filteredTemplates.length === 0 ? (
                    <div className='p-10 text-center text-gray-500'>
                        Шаблоны не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Шаблон
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Событие
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Получатели
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Расписание
                                    </th>
                                    <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                        Действия
                                    </th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-200'>
                                {filteredTemplates.map((template) => {
                                    const ChannelIcon =
                                        CHANNEL_ICONS[template.channel] || Bell;

                                    return (
                                        <tr
                                            key={template.id}
                                            className='hover:bg-gray-50'>
                                            <td className='px-4 py-4 align-top'>
                                                <div className='flex items-start gap-3'>
                                                    <span className='mt-0.5 rounded-lg bg-indigo-50 p-2 text-indigo-700'>
                                                        <ChannelIcon className='h-4 w-4' />
                                                    </span>
                                                    <div>
                                                        <div className='flex flex-wrap items-center gap-2'>
                                                            <p className='font-medium text-gray-900'>
                                                                {template.name}
                                                            </p>
                                                            {!template.enabled && (
                                                                <span className='rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600'>
                                                                    Отключен
                                                                </span>
                                                            )}
                                                            {template.isSystem && (
                                                                <span className='rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700'>
                                                                    Системный
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className='mt-1 text-xs text-gray-500'>
                                                            {template.code} ·{" "}
                                                            {CHANNEL_LABELS[
                                                                template.channel
                                                            ] || template.channel}
                                                        </p>
                                                        <p className='mt-2 max-w-xl text-sm text-gray-600 line-clamp-2'>
                                                            {template.body}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                                {EVENT_LABELS[template.event] ||
                                                    template.event}
                                            </td>
                                            <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                                {getRecipientSummary(
                                                    template.recipientRules
                                                )}
                                            </td>
                                            <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                                <p>
                                                    Задержка:{" "}
                                                    {template.sendDelayMinutes || 0} мин.
                                                </p>
                                                {template.repeatEveryHours && (
                                                    <p className='mt-1 text-xs text-gray-500'>
                                                        Повтор: каждые{" "}
                                                        {template.repeatEveryHours} ч.,
                                                        максимум{" "}
                                                        {template.maxRepeats || "-"}
                                                    </p>
                                                )}
                                            </td>
                                            <td className='px-4 py-4 text-right align-top'>
                                                <div className='flex justify-end gap-2'>
                                                    <button
                                                        type='button'
                                                        onClick={() =>
                                                            openEdit(template)
                                                        }
                                                        className='inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100'>
                                                        <Pencil className='h-4 w-4' />
                                                        Изменить
                                                    </button>
                                                    <button
                                                        type='button'
                                                        disabled={template.isSystem}
                                                        onClick={() =>
                                                            handleDelete(template)
                                                        }
                                                        className='inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50'>
                                                        <Trash2 className='h-4 w-4' />
                                                        Удалить
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

            {modal && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                        onClick={closeModal}
                    />
                    <div className='relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl'>
                        <div className='flex items-center justify-between border-b border-gray-100 p-6'>
                            <div>
                                <h3 className='text-xl font-semibold text-gray-900'>
                                    {modal.mode === "create"
                                        ? "Новый шаблон"
                                        : "Редактирование шаблона"}
                                </h3>
                                <p className='mt-1 text-sm text-gray-500'>
                                    Переменные: {"{{title}}"}, {"{{uid}}"},{" "}
                                    {"{{signerName}}"}, {"{{deadline}}"},{" "}
                                    {"{{reason}}"}, {"{{errorMessage}}"}
                                </p>
                            </div>
                            <button
                                type='button'
                                onClick={closeModal}
                                className='rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600'>
                                <X className='h-5 w-5' />
                            </button>
                        </div>

                        <div className='space-y-5 p-6'>
                            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Код
                                    </label>
                                    <input
                                        value={form.code}
                                        onChange={(event) =>
                                            updateForm("code", event.target.value)
                                        }
                                        disabled={form.isSystem}
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Название
                                    </label>
                                    <input
                                        value={form.name}
                                        onChange={(event) =>
                                            updateForm("name", event.target.value)
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Событие
                                    </label>
                                    <select
                                        value={form.event}
                                        onChange={(event) =>
                                            updateForm("event", event.target.value)
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                                        {Object.entries(EVENT_LABELS).map(
                                            ([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Канал
                                    </label>
                                    <select
                                        value={form.channel}
                                        onChange={(event) =>
                                            updateForm("channel", event.target.value)
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                                        {Object.entries(CHANNEL_LABELS).map(
                                            ([value, label]) => (
                                                <option key={value} value={value}>
                                                    {label}
                                                </option>
                                            )
                                        )}
                                    </select>
                                </div>
                            </div>

                            <label className='flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5'>
                                <span className='text-sm font-medium text-gray-700'>
                                    Шаблон включен
                                </span>
                                <input
                                    type='checkbox'
                                    checked={form.enabled}
                                    onChange={(event) =>
                                        updateForm("enabled", event.target.checked)
                                    }
                                    className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                                />
                            </label>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-gray-700'>
                                    Тема
                                </label>
                                <input
                                    value={form.subject}
                                    onChange={(event) =>
                                        updateForm("subject", event.target.value)
                                    }
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                            </div>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-gray-700'>
                                    Текст уведомления
                                </label>
                                <textarea
                                    value={form.body}
                                    onChange={(event) =>
                                        updateForm("body", event.target.value)
                                    }
                                    rows={5}
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                            </div>

                            <div>
                                <p className='mb-2 text-sm font-medium text-gray-700'>
                                    Получатели
                                </p>
                                <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                                    {Object.entries(RECIPIENT_LABELS).map(
                                        ([key, label]) => (
                                            <label
                                                key={key}
                                                className='flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5'>
                                                <span className='text-sm text-gray-700'>
                                                    {label}
                                                </span>
                                                <input
                                                    type='checkbox'
                                                    checked={Boolean(
                                                        form.recipientRules[key]
                                                    )}
                                                    onChange={(event) =>
                                                        updateRecipientRule(
                                                            key,
                                                            event.target.checked
                                                        )
                                                    }
                                                    className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500'
                                                />
                                            </label>
                                        )
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className='mb-1 block text-sm font-medium text-gray-700'>
                                    Дополнительные email
                                </label>
                                <input
                                    value={form.customEmailsText}
                                    onChange={(event) =>
                                        updateForm(
                                            "customEmailsText",
                                            event.target.value
                                        )
                                    }
                                    placeholder='mail@example.kz, admin@example.kz'
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                            </div>

                            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Задержка, минут
                                    </label>
                                    <input
                                        type='number'
                                        min='0'
                                        value={form.sendDelayMinutes}
                                        onChange={(event) =>
                                            updateForm(
                                                "sendDelayMinutes",
                                                event.target.value
                                            )
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Повтор каждые, часов
                                    </label>
                                    <input
                                        type='number'
                                        min='1'
                                        value={form.repeatEveryHours}
                                        onChange={(event) =>
                                            updateForm(
                                                "repeatEveryHours",
                                                event.target.value
                                            )
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>
                                <div>
                                    <label className='mb-1 block text-sm font-medium text-gray-700'>
                                        Максимум повторов
                                    </label>
                                    <input
                                        type='number'
                                        min='1'
                                        value={form.maxRepeats}
                                        onChange={(event) =>
                                            updateForm("maxRepeats", event.target.value)
                                        }
                                        className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='flex gap-3 border-t border-gray-100 p-6 pt-4'>
                            <button
                                type='button'
                                onClick={closeModal}
                                disabled={saving}
                                className='flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                                Отмена
                            </button>
                            <button
                                type='button'
                                onClick={handleSave}
                                disabled={saving}
                                className='flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                                <Save className='h-4 w-4' />
                                {saving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
