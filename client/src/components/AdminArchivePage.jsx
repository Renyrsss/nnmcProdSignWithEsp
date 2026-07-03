import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Archive,
    Download,
    FileArchive,
    Filter,
    RefreshCw,
    RotateCcw,
    Search,
} from "lucide-react";
import {
    archiveAdminDocument,
    exportAdminDocumentArchive,
    getAdminArchive,
    getAdminDocuments,
    getAdminUsers,
    restoreAdminDocument,
} from "../api/admin";
import { useToast } from "./Toast";

const PAGE_SIZE = 50;

const STATUS_LABELS = {
    pending: "Ожидает",
    in_progress: "В процессе",
    completed: "Завершен",
    cancelled: "Отменен",
    revision: "На корректировке",
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

const getUserName = (user) =>
    user?.fullName || user?.username || user?.email || "-";

const getDocumentUid = (doc) => doc?.uid || doc?.documentId || doc?.id;

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export default function AdminArchivePage() {
    const [archiveItems, setArchiveItems] = useState([]);
    const [candidates, setCandidates] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [candidateLoading, setCandidateLoading] = useState(true);
    const [savingId, setSavingId] = useState(null);
    const [exportingId, setExportingId] = useState(null);
    const [page, setPage] = useState(1);
    const [meta, setMeta] = useState({
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        pageCount: 1,
    });
    const [filters, setFilters] = useState({
        q: "",
        status: "all",
        departmentId: "all",
        archivedFrom: "",
        archivedTo: "",
    });
    const [candidateFilters, setCandidateFilters] = useState({
        q: "",
        status: "completed",
    });
    const [reasonByDocument, setReasonByDocument] = useState({});
    const [restoreReasonByDocument, setRestoreReasonByDocument] = useState({});
    const toast = useToast();

    const loadDictionaries = useCallback(async () => {
        try {
            const data = await getAdminUsers();
            setDepartments(data.departments || []);
        } catch (error) {
            console.error("Ошибка загрузки отделов:", error);
            toast.error("Ошибка загрузки справочников");
        }
    }, [toast]);

    const loadArchive = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminArchive({
                ...filters,
                page,
                pageSize: PAGE_SIZE,
            });
            setArchiveItems(response.data || []);
            setMeta(
                response.meta || {
                    total: 0,
                    page,
                    pageSize: PAGE_SIZE,
                    pageCount: 1,
                }
            );
        } catch (error) {
            console.error("Ошибка загрузки архива:", error);
            toast.error("Ошибка загрузки архива");
        } finally {
            setLoading(false);
        }
    }, [filters, page, toast]);

    const loadCandidates = useCallback(async () => {
        setCandidateLoading(true);
        try {
            const response = await getAdminDocuments({
                q: candidateFilters.q,
                status: candidateFilters.status,
                page: 1,
                pageSize: 25,
            });
            setCandidates((response.data || []).filter((doc) => !doc.archivedAt));
        } catch (error) {
            console.error("Ошибка загрузки документов для архивации:", error);
            toast.error("Ошибка загрузки документов для архивации");
        } finally {
            setCandidateLoading(false);
        }
    }, [candidateFilters, toast]);

    useEffect(() => {
        loadDictionaries();
    }, [loadDictionaries]);

    useEffect(() => {
        loadArchive();
    }, [loadArchive]);

    useEffect(() => {
        loadCandidates();
    }, [loadCandidates]);

    const stats = useMemo(
        () =>
            archiveItems.reduce(
                (acc, doc) => {
                    acc.total += 1;
                    if (doc.status === "completed") acc.completed += 1;
                    if (doc.status === "cancelled") acc.cancelled += 1;
                    if (doc.retentionUntil) acc.withRetention += 1;
                    return acc;
                },
                { total: 0, completed: 0, cancelled: 0, withRetention: 0 }
            ),
        [archiveItems]
    );

    const updateFilter = (key, value) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const updateCandidateFilter = (key, value) => {
        setCandidateFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleArchive = async (doc) => {
        const reason = (reasonByDocument[doc.id] || "").trim();
        if (reason.length < 3) {
            toast.error("Укажите причину архивации");
            return;
        }

        setSavingId(doc.id);
        try {
            await archiveAdminDocument(doc.id, reason);
            toast.success("Документ перенесен в архив");
            setReasonByDocument((prev) => ({ ...prev, [doc.id]: "" }));
            await Promise.all([loadArchive(), loadCandidates()]);
        } catch (error) {
            console.error("Ошибка архивации:", error);
            toast.error(error.response?.data?.error?.message || "Ошибка архивации");
        } finally {
            setSavingId(null);
        }
    };

    const handleRestore = async (doc) => {
        setSavingId(doc.id);
        try {
            await restoreAdminDocument(doc.id, restoreReasonByDocument[doc.id] || "");
            toast.success("Документ восстановлен из архива");
            setRestoreReasonByDocument((prev) => ({ ...prev, [doc.id]: "" }));
            await Promise.all([loadArchive(), loadCandidates()]);
        } catch (error) {
            console.error("Ошибка восстановления:", error);
            toast.error(
                error.response?.data?.error?.message || "Ошибка восстановления"
            );
        } finally {
            setSavingId(null);
        }
    };

    const handleExport = async (doc) => {
        setExportingId(doc.id);
        try {
            const blob = await exportAdminDocumentArchive(doc.id);
            downloadBlob(blob, `document-${getDocumentUid(doc)}-archive.json`);
            toast.success("Архивная карточка выгружена");
        } catch (error) {
            console.error("Ошибка выгрузки архива:", error);
            toast.error("Ошибка выгрузки архива");
        } finally {
            setExportingId(null);
        }
    };

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <Archive className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Архив и хранение
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Логическая архивация документов без удаления файлов и истории
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={() => Promise.all([loadArchive(), loadCandidates()])}
                        disabled={loading || candidateLoading}
                        className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                        <RefreshCw
                            className={`h-4 w-4 ${
                                loading || candidateLoading ? "animate-spin" : ""
                            }`}
                        />
                        Обновить
                    </button>
                </div>

                <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                    <div className='rounded-lg bg-gray-50 p-4'>
                        <p className='text-xs font-medium uppercase text-gray-500'>
                            На странице
                        </p>
                        <p className='mt-1 text-2xl font-bold text-gray-900'>
                            {stats.total}
                        </p>
                    </div>
                    <div className='rounded-lg bg-green-50 p-4'>
                        <p className='text-xs font-medium uppercase text-green-700'>
                            Завершены
                        </p>
                        <p className='mt-1 text-2xl font-bold text-green-900'>
                            {stats.completed}
                        </p>
                    </div>
                    <div className='rounded-lg bg-red-50 p-4'>
                        <p className='text-xs font-medium uppercase text-red-700'>
                            Отменены
                        </p>
                        <p className='mt-1 text-2xl font-bold text-red-900'>
                            {stats.cancelled}
                        </p>
                    </div>
                    <div className='rounded-lg bg-amber-50 p-4'>
                        <p className='text-xs font-medium uppercase text-amber-700'>
                            Со сроком хранения
                        </p>
                        <p className='mt-1 text-2xl font-bold text-amber-900'>
                            {stats.withRetention}
                        </p>
                    </div>
                </div>
            </div>

            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-4 flex items-center gap-2'>
                    <FileArchive className='h-5 w-5 text-indigo-600' />
                    <h3 className='text-lg font-semibold text-gray-900'>
                        Перенести документ в архив
                    </h3>
                </div>
                <div className='mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px]'>
                    <div className='relative'>
                        <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
                        <input
                            value={candidateFilters.q}
                            onChange={(event) =>
                                updateCandidateFilter("q", event.target.value)
                            }
                            placeholder='Название или UID'
                            className='w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                        />
                    </div>
                    <select
                        value={candidateFilters.status}
                        onChange={(event) =>
                            updateCandidateFilter("status", event.target.value)
                        }
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                        <option value='completed'>Завершенные</option>
                        <option value='cancelled'>Отмененные</option>
                    </select>
                </div>

                {candidateLoading ? (
                    <div className='rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500'>
                        Загрузка документов...
                    </div>
                ) : candidates.length === 0 ? (
                    <div className='rounded-lg bg-gray-50 p-6 text-center text-sm text-gray-500'>
                        Нет документов, доступных для архивации
                    </div>
                ) : (
                    <div className='space-y-3'>
                        {candidates.map((doc) => (
                            <div
                                key={doc.id}
                                className='grid gap-3 rounded-lg border border-gray-200 p-4 lg:grid-cols-[1fr_320px_auto] lg:items-center'>
                                <div className='min-w-0'>
                                    <p className='truncate text-sm font-semibold text-gray-900'>
                                        {doc.title}
                                    </p>
                                    <p className='mt-1 text-xs text-gray-500'>
                                        #{getDocumentUid(doc)} ·{" "}
                                        {STATUS_LABELS[doc.status] || doc.status} ·{" "}
                                        {getUserName(doc.creator)}
                                    </p>
                                </div>
                                <input
                                    value={reasonByDocument[doc.id] || ""}
                                    onChange={(event) =>
                                        setReasonByDocument((prev) => ({
                                            ...prev,
                                            [doc.id]: event.target.value,
                                        }))
                                    }
                                    placeholder='Причина архивации'
                                    className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                />
                                <button
                                    type='button'
                                    onClick={() => handleArchive(doc)}
                                    disabled={savingId === doc.id}
                                    className='inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                                    <Archive className='h-4 w-4' />
                                    Архив
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className='rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-5 flex items-center gap-2'>
                    <Filter className='h-5 w-5 text-gray-500' />
                    <h3 className='text-lg font-semibold text-gray-900'>
                        Поиск по архиву
                    </h3>
                </div>
                <div className='mb-5 grid grid-cols-1 gap-3 md:grid-cols-5'>
                    <input
                        value={filters.q}
                        onChange={(event) => updateFilter("q", event.target.value)}
                        placeholder='Название или UID'
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                    />
                    <select
                        value={filters.status}
                        onChange={(event) =>
                            updateFilter("status", event.target.value)
                        }
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                        <option value='all'>Все статусы</option>
                        <option value='completed'>Завершенные</option>
                        <option value='cancelled'>Отмененные</option>
                    </select>
                    <select
                        value={filters.departmentId}
                        onChange={(event) =>
                            updateFilter("departmentId", event.target.value)
                        }
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                        <option value='all'>Все отделы</option>
                        {departments.map((department) => (
                            <option key={department.id} value={department.id}>
                                {department.name}
                            </option>
                        ))}
                    </select>
                    <input
                        type='date'
                        value={filters.archivedFrom}
                        onChange={(event) =>
                            updateFilter("archivedFrom", event.target.value)
                        }
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                    />
                    <input
                        type='date'
                        value={filters.archivedTo}
                        onChange={(event) =>
                            updateFilter("archivedTo", event.target.value)
                        }
                        className='rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                    />
                </div>

                {loading ? (
                    <div className='rounded-lg bg-gray-50 p-10 text-center text-gray-500'>
                        Загрузка архива...
                    </div>
                ) : archiveItems.length === 0 ? (
                    <div className='rounded-lg bg-gray-50 p-10 text-center text-gray-500'>
                        Архивные документы не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full min-w-[980px] text-left text-sm'>
                            <thead>
                                <tr className='border-b border-gray-200 text-xs uppercase text-gray-500'>
                                    <th className='px-3 py-3'>Документ</th>
                                    <th className='px-3 py-3'>Автор</th>
                                    <th className='px-3 py-3'>Архивировал</th>
                                    <th className='px-3 py-3'>Архивация</th>
                                    <th className='px-3 py-3'>Хранить до</th>
                                    <th className='px-3 py-3 text-right'>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {archiveItems.map((doc) => (
                                    <tr
                                        key={doc.id}
                                        className='border-b border-gray-100 align-top last:border-0'>
                                        <td className='px-3 py-4'>
                                            <p className='font-semibold text-gray-900'>
                                                {doc.title}
                                            </p>
                                            <p className='mt-1 text-xs text-gray-500'>
                                                #{getDocumentUid(doc)} ·{" "}
                                                {STATUS_LABELS[doc.status] || doc.status}
                                            </p>
                                            {doc.archiveReason && (
                                                <p className='mt-2 text-xs text-gray-500'>
                                                    {doc.archiveReason}
                                                </p>
                                            )}
                                        </td>
                                        <td className='px-3 py-4 text-gray-700'>
                                            {getUserName(doc.creator)}
                                            <p className='text-xs text-gray-500'>
                                                {doc.creator?.department?.name ||
                                                    "Без отдела"}
                                            </p>
                                        </td>
                                        <td className='px-3 py-4 text-gray-700'>
                                            {getUserName(doc.archivedBy)}
                                        </td>
                                        <td className='px-3 py-4 text-gray-700'>
                                            {formatDate(doc.archivedAt)}
                                        </td>
                                        <td className='px-3 py-4 text-gray-700'>
                                            {formatDate(doc.retentionUntil)}
                                        </td>
                                        <td className='px-3 py-4'>
                                            <div className='flex flex-col items-end gap-2'>
                                                <input
                                                    value={
                                                        restoreReasonByDocument[
                                                            doc.id
                                                        ] || ""
                                                    }
                                                    onChange={(event) =>
                                                        setRestoreReasonByDocument(
                                                            (prev) => ({
                                                                ...prev,
                                                                [doc.id]:
                                                                    event.target.value,
                                                            })
                                                        )
                                                    }
                                                    placeholder='Причина восстановления'
                                                    className='w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                                                />
                                                <div className='flex gap-2'>
                                                    <button
                                                        type='button'
                                                        onClick={() =>
                                                            handleExport(doc)
                                                        }
                                                        disabled={exportingId === doc.id}
                                                        className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                                                        <Download className='h-4 w-4' />
                                                        JSON
                                                    </button>
                                                    <button
                                                        type='button'
                                                        onClick={() =>
                                                            handleRestore(doc)
                                                        }
                                                        disabled={savingId === doc.id}
                                                        className='inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50'>
                                                        <RotateCcw className='h-4 w-4' />
                                                        Вернуть
                                                    </button>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className='mt-5 flex flex-col gap-3 border-t border-gray-100 pt-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between'>
                    <span>
                        Всего: {meta.total}. Страница {meta.page} из{" "}
                        {Math.max(meta.pageCount || 1, 1)}
                    </span>
                    <div className='flex gap-2'>
                        <button
                            type='button'
                            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                            disabled={page <= 1}
                            className='rounded-lg border border-gray-300 px-3 py-2 font-medium text-gray-700 disabled:opacity-50'>
                            Назад
                        </button>
                        <button
                            type='button'
                            onClick={() =>
                                setPage((prev) =>
                                    Math.min(prev + 1, meta.pageCount || 1)
                                )
                            }
                            disabled={page >= (meta.pageCount || 1)}
                            className='rounded-lg border border-gray-300 px-3 py-2 font-medium text-gray-700 disabled:opacity-50'>
                            Вперед
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
