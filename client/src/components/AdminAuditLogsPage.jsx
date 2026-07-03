import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Eye,
    FileText,
    Filter,
    Search,
    X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAdminAuditLogs, getAdminUsers } from "../api/admin";
import { useToast } from "./Toast";

const PAGE_SIZE = 50;

const EVENT_LABELS = {
    document_created: "Документ создан",
    document_opened: "Документ открыт",
    document_updated: "Документ изменен",
    document_signed: "Документ подписан",
    document_completed: "Документ завершен",
    document_revision_requested: "Запрошена корректировка",
    document_cancelled: "Документ отменен",
    document_signer_reassigned: "Подписант переназначен",
    document_deadline_updated: "Срок изменен",
    document_reminder_requested: "Напоминание",
    document_deleted: "Документ удален",
};

const EVENT_STYLES = {
    document_created: "bg-blue-100 text-blue-800",
    document_opened: "bg-gray-100 text-gray-700",
    document_updated: "bg-slate-100 text-slate-800",
    document_signed: "bg-green-100 text-green-800",
    document_completed: "bg-emerald-100 text-emerald-800",
    document_revision_requested: "bg-orange-100 text-orange-800",
    document_cancelled: "bg-red-100 text-red-800",
    document_signer_reassigned: "bg-indigo-100 text-indigo-800",
    document_deadline_updated: "bg-amber-100 text-amber-800",
    document_reminder_requested: "bg-yellow-100 text-yellow-800",
    document_deleted: "bg-red-100 text-red-800",
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

const formatMetadata = (metadata) => {
    if (!metadata || Object.keys(metadata).length === 0) return "-";

    const visible = [];
    if (metadata.reason) visible.push(`Причина: ${metadata.reason}`);
    if (metadata.previousStatus || metadata.status) {
        visible.push(
            `Статус: ${metadata.previousStatus || "-"} -> ${metadata.status || "-"}`
        );
    }
    if (metadata.fromUserName || metadata.toUserName) {
        visible.push(
            `Маршрут: ${metadata.fromUserName || "-"} -> ${metadata.toUserName || "-"}`
        );
    }
    if (metadata.signingDeadlineAt !== undefined) {
        visible.push(`Срок: ${metadata.signingDeadlineAt || "снят"}`);
    }
    if (metadata.signerName) visible.push(`Подписант: ${metadata.signerName}`);

    if (visible.length > 0) return visible.join("; ");
    return JSON.stringify(metadata);
};

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = useState([]);
    const [meta, setMeta] = useState({
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        pageCount: 1,
    });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState({
        q: "",
        event: "all",
        actorId: "all",
        targetUserId: "all",
        dateFrom: "",
        dateTo: "",
    });
    const toast = useToast();
    const navigate = useNavigate();

    const eventStats = useMemo(
        () =>
            logs.reduce((acc, log) => {
                acc[log.event] = (acc[log.event] || 0) + 1;
                return acc;
            }, {}),
        [logs]
    );

    const loadUsers = useCallback(async () => {
        try {
            const adminData = await getAdminUsers();
            setUsers(adminData.users || []);
        } catch (error) {
            console.error("Ошибка загрузки пользователей:", error);
        }
    }, []);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminAuditLogs({
                ...filters,
                page,
                pageSize: PAGE_SIZE,
            });
            setLogs(response.data || []);
            setMeta(response.meta || { total: 0, page, pageSize: PAGE_SIZE, pageCount: 1 });
        } catch (error) {
            console.error("Ошибка загрузки журнала аудита:", error);
            toast.error("Ошибка загрузки журнала аудита");
        } finally {
            setLoading(false);
        }
    }, [filters, page, toast]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const updateFilter = (key, value) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setPage(1);
        setFilters({
            q: "",
            event: "all",
            actorId: "all",
            targetUserId: "all",
            dateFrom: "",
            dateTo: "",
        });
    };

    return (
        <div className='max-w-7xl mx-auto px-4 py-8'>
            <div className='bg-white rounded-xl shadow-sm p-6 mb-6'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <ClipboardList className='w-8 h-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Журнал аудита
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Найдено: {meta.total}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={clearFilters}
                        className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg'>
                        <X className='w-4 h-4' />
                        Сбросить
                    </button>
                </div>

                <div className='grid grid-cols-2 md:grid-cols-4 gap-3 mb-6'>
                    {[
                        "document_opened",
                        "document_signed",
                        "document_cancelled",
                        "document_signer_reassigned",
                    ].map((event) => (
                        <div key={event} className='border border-gray-200 rounded-lg p-3'>
                            <p className='text-xs text-gray-500'>
                                {EVENT_LABELS[event]}
                            </p>
                            <p className='text-xl font-semibold text-gray-900'>
                                {eventStats[event] || 0}
                            </p>
                        </div>
                    ))}
                </div>

                <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4'>
                    <div className='xl:col-span-2'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Поиск
                        </label>
                        <div className='relative'>
                            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                            <input
                                value={filters.q}
                                onChange={(event) => updateFilter("q", event.target.value)}
                                placeholder='Документ, #ID, пользователь'
                                className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                            />
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Событие
                        </label>
                        <select
                            value={filters.event}
                            onChange={(event) => updateFilter("event", event.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {Object.entries(EVENT_LABELS).map(([event, label]) => (
                                <option key={event} value={event}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Инициатор
                        </label>
                        <select
                            value={filters.actorId}
                            onChange={(event) => updateFilter("actorId", event.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.fullName || user.username}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Затронутый пользователь
                        </label>
                        <select
                            value={filters.targetUserId}
                            onChange={(event) =>
                                updateFilter("targetUserId", event.target.value)
                            }
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {users.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.fullName || user.username}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            С даты
                        </label>
                        <input
                            type='date'
                            value={filters.dateFrom}
                            onChange={(event) => updateFilter("dateFrom", event.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            По дату
                        </label>
                        <input
                            type='date'
                            value={filters.dateTo}
                            onChange={(event) => updateFilter("dateTo", event.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        />
                    </div>
                </div>
            </div>

            <div className='bg-white rounded-xl shadow-sm overflow-hidden'>
                <div className='px-6 py-4 border-b border-gray-200 flex items-center gap-2'>
                    <Filter className='w-5 h-5 text-gray-500' />
                    <h3 className='font-semibold text-gray-800'>События</h3>
                </div>

                {loading ? (
                    <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                ) : logs.length === 0 ? (
                    <div className='p-10 text-center text-gray-500'>
                        События не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Дата
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Событие
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Документ
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Пользователь
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Детали
                                    </th>
                                    <th className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
                                        Действия
                                    </th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-200'>
                                {logs.map((log) => (
                                    <tr key={log.id} className='hover:bg-gray-50'>
                                        <td className='px-4 py-4 text-sm text-gray-700 whitespace-nowrap'>
                                            {formatDate(log.createdAt)}
                                            {log.ip && (
                                                <p className='mt-1 text-xs text-gray-500'>
                                                    {log.ip}
                                                </p>
                                            )}
                                        </td>
                                        <td className='px-4 py-4'>
                                            <span
                                                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                                    EVENT_STYLES[log.event] ||
                                                    "bg-gray-100 text-gray-700"
                                                }`}>
                                                {EVENT_LABELS[log.event] || log.event}
                                            </span>
                                        </td>
                                        <td className='px-4 py-4'>
                                            {log.document ? (
                                                <div className='flex items-start gap-2'>
                                                    <FileText className='w-4 h-4 text-indigo-600 mt-0.5' />
                                                    <div>
                                                        <p className='text-sm font-medium text-gray-900'>
                                                            {log.document.title}
                                                        </p>
                                                        <p className='text-xs text-gray-500'>
                                                            #{log.document.uid || log.document.id}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className='text-sm text-gray-400'>-</span>
                                            )}
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            <p>{log.actorName || "-"}</p>
                                            {log.targetUserName && (
                                                <p className='mt-1 text-xs text-gray-500'>
                                                    Цель: {log.targetUserName}
                                                </p>
                                            )}
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700 max-w-md'>
                                            <span className='line-clamp-3'>
                                                {formatMetadata(log.metadata)}
                                            </span>
                                        </td>
                                        <td className='px-4 py-4 text-right'>
                                            <button
                                                type='button'
                                                disabled={!log.document?.id}
                                                onClick={() => navigate(`/documents/${log.document.id}`)}
                                                className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg disabled:opacity-50'>
                                                <Eye className='w-4 h-4' />
                                                Открыть
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className='px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
                    <p className='text-sm text-gray-600'>
                        Страница {meta.page || page} из {meta.pageCount || 1}
                    </p>
                    <div className='flex items-center gap-2'>
                        <button
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50'>
                            <ChevronLeft className='w-4 h-4' />
                            Назад
                        </button>
                        <button
                            disabled={page >= (meta.pageCount || 1) || loading}
                            onClick={() => setPage((prev) => prev + 1)}
                            className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50'>
                            Далее
                            <ChevronRight className='w-4 h-4' />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
