import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    BadgeCheck,
    CalendarClock,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Eye,
    FileWarning,
    RefreshCw,
    Search,
    ShieldCheck,
    X,
} from "lucide-react";
import {
    getAdminSignatureMonitoring,
    recheckAdminDocumentSignatures,
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

const ISSUE_LABELS = {
    all: "Все",
    unsigned: "Неподписанные",
    overdue: "Просроченные",
    missing_cms: "Нет CMS",
    error: "Ошибки",
    cert_expired: "Истек сертификат",
    cert_unknown: "Срок сертификата неизвестен",
    completed: "Завершенные",
};

const ISSUE_STYLES = {
    unsigned: "bg-amber-100 text-amber-800",
    overdue: "bg-red-100 text-red-800",
    missing_cms: "bg-orange-100 text-orange-800",
    error: "bg-rose-100 text-rose-800",
    cert_expired: "bg-red-100 text-red-800",
    cert_unknown: "bg-slate-100 text-slate-700",
};

const CERT_LABELS = {
    valid: "Действителен",
    expired: "Истек",
    not_yet_valid: "Еще не действует",
    unknown: "Нет данных",
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

const getSignerProgress = (record) =>
    `${record.progress?.signed || 0} / ${record.progress?.total || 0}`;

const summaryCards = [
    ["eds", "ЭЦП документов"],
    ["unsigned", "Неподписанные"],
    ["overdue", "Просроченные"],
    ["missingCms", "Без CMS"],
    ["errors", "Ошибки"],
    ["certExpired", "Истек сертификат"],
];

export default function AdminSignatureMonitoringPage() {
    const [records, setRecords] = useState([]);
    const [meta, setMeta] = useState({
        total: 0,
        page: 1,
        pageSize: PAGE_SIZE,
        pageCount: 1,
        summary: {},
    });
    const [filters, setFilters] = useState({
        q: "",
        issue: "all",
        status: "all",
    });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [recheckingId, setRecheckingId] = useState(null);
    const navigate = useNavigate();
    const toast = useToast();

    const summary = useMemo(() => meta.summary || {}, [meta.summary]);

    const loadRecords = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminSignatureMonitoring({
                ...filters,
                page,
                pageSize: PAGE_SIZE,
            });
            setRecords(response.data || []);
            setMeta(
                response.meta || {
                    total: 0,
                    page,
                    pageSize: PAGE_SIZE,
                    pageCount: 1,
                    summary: {},
                }
            );
        } catch (error) {
            console.error("Ошибка загрузки мониторинга подписей:", error);
            toast.error("Ошибка загрузки мониторинга подписей");
        } finally {
            setLoading(false);
        }
    }, [filters, page, toast]);

    useEffect(() => {
        loadRecords();
    }, [loadRecords]);

    const updateFilter = (key, value) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setPage(1);
        setFilters({ q: "", issue: "all", status: "all" });
    };

    const handleRecheck = async (record) => {
        setRecheckingId(record.id);
        try {
            await recheckAdminDocumentSignatures(record.id);
            toast.success("Проверка CMS зафиксирована");
            await loadRecords();
        } catch (error) {
            console.error("Ошибка проверки CMS:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    "Не удалось выполнить проверку CMS"
            );
        } finally {
            setRecheckingId(null);
        }
    };

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <ShieldCheck className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Мониторинг подписей
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Найдено: {meta.total}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={clearFilters}
                        className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200'>
                        <X className='h-4 w-4' />
                        Сбросить
                    </button>
                </div>

                <div className='mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'>
                    {summaryCards.map(([key, label]) => (
                        <div key={key} className='rounded-lg border border-gray-200 p-3'>
                            <p className='text-xs text-gray-500'>{label}</p>
                            <p className='text-xl font-semibold text-gray-900'>
                                {summary[key] || 0}
                            </p>
                        </div>
                    ))}
                </div>

                <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Поиск
                        </label>
                        <div className='relative'>
                            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
                            <input
                                value={filters.q}
                                onChange={(event) =>
                                    updateFilter("q", event.target.value)
                                }
                                placeholder='Название или #ID'
                                className='w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                            />
                        </div>
                    </div>

                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Проблема
                        </label>
                        <select
                            value={filters.issue}
                            onChange={(event) =>
                                updateFilter("issue", event.target.value)
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                            {Object.entries(ISSUE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Статус документа
                        </label>
                        <select
                            value={filters.status}
                            onChange={(event) =>
                                updateFilter("status", event.target.value)
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                            <option value='all'>Все</option>
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className='overflow-hidden rounded-xl bg-white shadow-sm'>
                {loading ? (
                    <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                ) : records.length === 0 ? (
                    <div className='p-10 text-center text-gray-500'>
                        Записи мониторинга не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Документ
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Подписи
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        CMS
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Сертификаты
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                        Проблемы
                                    </th>
                                    <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                        Действия
                                    </th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-200'>
                                {records.map((record) => (
                                    <tr key={record.id} className='hover:bg-gray-50'>
                                        <td className='px-4 py-4 align-top'>
                                            <p className='font-medium text-gray-900'>
                                                {record.title}
                                            </p>
                                            <p className='text-xs text-gray-500'>
                                                #{record.uid || record.id}
                                                {record.documentType?.name
                                                    ? ` · ${record.documentType.name}`
                                                    : ""}
                                            </p>
                                            <p className='mt-1 text-xs text-gray-500'>
                                                Автор:{" "}
                                                {record.creator?.fullName ||
                                                    record.creator?.username ||
                                                    "-"}
                                            </p>
                                            {record.signingDeadlineAt && (
                                                <p
                                                    className={`mt-1 inline-flex items-center gap-1 text-xs ${
                                                        record.isOverdue
                                                            ? "text-red-700"
                                                            : "text-gray-500"
                                                    }`}>
                                                    <CalendarClock className='h-3.5 w-3.5' />
                                                    {formatDate(record.signingDeadlineAt)}
                                                </p>
                                            )}
                                        </td>

                                        <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                            <div className='mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700'>
                                                <BadgeCheck className='h-3.5 w-3.5' />
                                                {getSignerProgress(record)}
                                            </div>
                                            <div className='space-y-1'>
                                                {record.pendingSigners?.slice(0, 3).map((signer) => (
                                                    <p
                                                        key={`${record.id}-${signer.userId}`}
                                                        className='text-xs text-gray-500'>
                                                        Ожидает:{" "}
                                                        {signer.userName ||
                                                            signer.userEmail}
                                                    </p>
                                                ))}
                                                {record.pendingSigners?.length > 3 && (
                                                    <p className='text-xs text-gray-400'>
                                                        Еще{" "}
                                                        {record.pendingSigners.length - 3}
                                                    </p>
                                                )}
                                            </div>
                                        </td>

                                        <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                            <p>
                                                CMS: {record.cms?.cmsFiles || 0} /{" "}
                                                {record.cms?.signedEntries || 0}
                                            </p>
                                            {record.cms?.missingCms > 0 ? (
                                                <p className='mt-1 inline-flex items-center gap-1 text-xs text-orange-700'>
                                                    <FileWarning className='h-3.5 w-3.5' />
                                                    Нет CMS: {record.cms.missingCms}
                                                </p>
                                            ) : (
                                                <p className='mt-1 inline-flex items-center gap-1 text-xs text-green-700'>
                                                    <CheckCircle2 className='h-3.5 w-3.5' />
                                                    CMS в порядке
                                                </p>
                                            )}
                                            {record.cms?.lastRecheckAt && (
                                                <p className='mt-1 text-xs text-gray-500'>
                                                    Проверено:{" "}
                                                    {formatDate(record.cms.lastRecheckAt)}
                                                </p>
                                            )}
                                        </td>

                                        <td className='px-4 py-4 align-top text-sm text-gray-700'>
                                            {record.certificates?.length ? (
                                                <div className='space-y-2'>
                                                    {record.certificates
                                                        .slice(0, 2)
                                                        .map((certificate, index) => (
                                                            <div key={`${record.id}-cert-${index}`}>
                                                                <p className='text-xs font-medium text-gray-800'>
                                                                    {certificate.userName ||
                                                                        "Подписант"}
                                                                </p>
                                                                <p className='text-xs text-gray-500'>
                                                                    {
                                                                        CERT_LABELS[
                                                                            certificate
                                                                                .certificateStatus
                                                                        ]
                                                                    }
                                                                    {certificate.certificateValidTo
                                                                        ? ` до ${formatDate(
                                                                              certificate.certificateValidTo
                                                                          )}`
                                                                        : ""}
                                                                </p>
                                                            </div>
                                                        ))}
                                                    {record.certificates.length > 2 && (
                                                        <p className='text-xs text-gray-400'>
                                                            Еще {record.certificates.length - 2}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className='text-xs text-gray-400'>
                                                    Подписей ЭЦП нет
                                                </span>
                                            )}
                                        </td>

                                        <td className='px-4 py-4 align-top'>
                                            <div className='flex max-w-xs flex-wrap gap-1.5'>
                                                {record.issues?.length ? (
                                                    record.issues.map((issue) => (
                                                        <span
                                                            key={`${record.id}-${issue}`}
                                                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                                                                ISSUE_STYLES[issue] ||
                                                                "bg-gray-100 text-gray-700"
                                                            }`}>
                                                            {ISSUE_LABELS[issue] || issue}
                                                        </span>
                                                    ))
                                                ) : (
                                                    <span className='rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800'>
                                                        Без проблем
                                                    </span>
                                                )}
                                            </div>
                                            {record.lastError?.message && (
                                                <p className='mt-2 flex max-w-xs items-start gap-1 text-xs text-rose-700'>
                                                    <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                                                    <span>{record.lastError.message}</span>
                                                </p>
                                            )}
                                        </td>

                                        <td className='px-4 py-4 text-right align-top'>
                                            <div className='flex flex-wrap justify-end gap-2'>
                                                <button
                                                    type='button'
                                                    onClick={() =>
                                                        navigate(`/documents/${record.id}`)
                                                    }
                                                    className='inline-flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100'>
                                                    <Eye className='h-4 w-4' />
                                                    Открыть
                                                </button>
                                                <button
                                                    type='button'
                                                    disabled={recheckingId === record.id}
                                                    onClick={() => handleRecheck(record)}
                                                    className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                                                    <RefreshCw
                                                        className={`h-4 w-4 ${
                                                            recheckingId === record.id
                                                                ? "animate-spin"
                                                                : ""
                                                        }`}
                                                    />
                                                    Проверить
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className='flex flex-col gap-3 border-t border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between'>
                    <p className='text-sm text-gray-600'>
                        Страница {meta.page || page} из {meta.pageCount || 1}
                    </p>
                    <div className='flex items-center gap-2'>
                        <button
                            type='button'
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                            <ChevronLeft className='h-4 w-4' />
                            Назад
                        </button>
                        <button
                            type='button'
                            disabled={page >= (meta.pageCount || 1) || loading}
                            onClick={() => setPage((prev) => prev + 1)}
                            className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                            Далее
                            <ChevronRight className='h-4 w-4' />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
