import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    BarChart3,
    Download,
    FileCheck2,
    FileClock,
    FileText,
    RefreshCw,
    Users,
    XCircle,
} from "lucide-react";
import {
    exportAdminReportsCsv,
    getAdminReports,
    getAdminUsers,
} from "../api/admin";
import { useToast } from "./Toast";

const formatNumber = (value) => new Intl.NumberFormat("ru-RU").format(value || 0);

const formatHours = (value) => {
    if (value === null || value === undefined) return "-";
    if (value < 24) return `${value.toFixed(1)} ч`;
    return `${(value / 24).toFixed(1)} дн`;
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

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

const todayIso = () => new Date().toISOString().slice(0, 10);

const monthStartIso = () => {
    const date = new Date();
    date.setDate(1);
    return date.toISOString().slice(0, 10);
};

export default function AdminReportsPage() {
    const [report, setReport] = useState(null);
    const [departments, setDepartments] = useState([]);
    const [filters, setFilters] = useState({
        dateFrom: monthStartIso(),
        dateTo: todayIso(),
        departmentId: "all",
    });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
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

    const loadReport = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminReports(filters);
            setReport(response.data || null);
        } catch (error) {
            console.error("Ошибка загрузки отчета:", error);
            toast.error("Ошибка загрузки отчета");
        } finally {
            setLoading(false);
        }
    }, [filters, toast]);

    useEffect(() => {
        loadDictionaries();
    }, [loadDictionaries]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const summaryCards = useMemo(() => {
        const summary = report?.summary || {};
        return [
            {
                label: "Создано",
                value: summary.created,
                icon: FileText,
                className: "text-blue-700 bg-blue-50",
            },
            {
                label: "Подписано",
                value: summary.signed,
                icon: FileCheck2,
                className: "text-green-700 bg-green-50",
            },
            {
                label: "В процессе",
                value: summary.inProgress,
                icon: FileClock,
                className: "text-indigo-700 bg-indigo-50",
            },
            {
                label: "Отменено",
                value: summary.cancelled,
                icon: XCircle,
                className: "text-red-700 bg-red-50",
            },
            {
                label: "Просрочено",
                value: summary.overdue,
                icon: AlertTriangle,
                className: "text-amber-700 bg-amber-50",
            },
            {
                label: "Среднее время",
                value: formatHours(summary.averageSigningHours),
                icon: BarChart3,
                className: "text-slate-700 bg-slate-50",
                raw: true,
            },
        ];
    }, [report]);

    const updateFilter = (key, value) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const blob = await exportAdminReportsCsv(filters);
            downloadBlob(blob, `documents-report-${todayIso()}.csv`);
            toast.success("CSV-отчет выгружен");
        } catch (error) {
            console.error("Ошибка экспорта отчета:", error);
            toast.error("Ошибка экспорта отчета");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <BarChart3 className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Отчеты
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Документы, сроки подписания и активность подразделений
                            </p>
                        </div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <button
                            type='button'
                            onClick={loadReport}
                            disabled={loading}
                            className='inline-flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                            <RefreshCw
                                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                            />
                            Обновить
                        </button>
                        <button
                            type='button'
                            onClick={handleExport}
                            disabled={exporting}
                            className='inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                            <Download className='h-4 w-4' />
                            CSV
                        </button>
                    </div>
                </div>

                <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            С даты
                        </label>
                        <input
                            type='date'
                            value={filters.dateFrom}
                            onChange={(event) =>
                                updateFilter("dateFrom", event.target.value)
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                        />
                    </div>
                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            По дату
                        </label>
                        <input
                            type='date'
                            value={filters.dateTo}
                            onChange={(event) =>
                                updateFilter("dateTo", event.target.value)
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'
                        />
                    </div>
                    <div>
                        <label className='mb-1 block text-sm font-medium text-gray-700'>
                            Отдел автора
                        </label>
                        <select
                            value={filters.departmentId}
                            onChange={(event) =>
                                updateFilter("departmentId", event.target.value)
                            }
                            className='w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500'>
                            <option value='all'>Все</option>
                            {departments.map((department) => (
                                <option key={department.id} value={department.id}>
                                    {department.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className='rounded-xl bg-white p-10 text-center text-gray-500 shadow-sm'>
                    Загрузка...
                </div>
            ) : (
                <>
                    <div className='mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6'>
                        {summaryCards.map((card) => {
                            const Icon = card.icon;
                            return (
                                <div
                                    key={card.label}
                                    className='rounded-xl bg-white p-4 shadow-sm'>
                                    <div
                                        className={`mb-3 inline-flex rounded-lg p-2 ${card.className}`}>
                                        <Icon className='h-5 w-5' />
                                    </div>
                                    <p className='text-xs font-medium uppercase text-gray-500'>
                                        {card.label}
                                    </p>
                                    <p className='mt-1 text-2xl font-bold text-gray-900'>
                                        {card.raw
                                            ? card.value
                                            : formatNumber(card.value)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className='grid grid-cols-1 gap-6 xl:grid-cols-2'>
                        <section className='rounded-xl bg-white shadow-sm'>
                            <div className='flex items-center gap-2 border-b border-gray-100 px-6 py-4'>
                                <BarChart3 className='h-5 w-5 text-indigo-600' />
                                <h3 className='font-semibold text-gray-900'>
                                    Активность по отделам
                                </h3>
                            </div>
                            <div className='overflow-x-auto'>
                                <table className='w-full'>
                                    <thead className='bg-gray-50'>
                                        <tr>
                                            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                                Отдел
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Всего
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Подписано
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Проср.
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Среднее
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-gray-200'>
                                        {(report?.departments || []).map((row) => (
                                            <tr key={row.id || row.name}>
                                                <td className='px-4 py-3 text-sm font-medium text-gray-900'>
                                                    {row.name}
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatNumber(row.total)}
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatNumber(row.completed)}
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatNumber(row.overdue)}
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatHours(row.averageSigningHours)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className='rounded-xl bg-white shadow-sm'>
                            <div className='flex items-center gap-2 border-b border-gray-100 px-6 py-4'>
                                <Users className='h-5 w-5 text-indigo-600' />
                                <h3 className='font-semibold text-gray-900'>
                                    Активность по пользователям
                                </h3>
                            </div>
                            <div className='overflow-x-auto'>
                                <table className='w-full'>
                                    <thead className='bg-gray-50'>
                                        <tr>
                                            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                                Пользователь
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Создал
                                            </th>
                                            <th className='px-4 py-3 text-right text-xs font-medium uppercase text-gray-500'>
                                                Подписал
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-gray-200'>
                                        {(report?.users || []).slice(0, 20).map((row) => (
                                            <tr key={row.id}>
                                                <td className='px-4 py-3'>
                                                    <p className='text-sm font-medium text-gray-900'>
                                                        {row.name}
                                                    </p>
                                                    <p className='text-xs text-gray-500'>
                                                        {row.departmentName || row.email || "-"}
                                                    </p>
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatNumber(row.created)}
                                                </td>
                                                <td className='px-4 py-3 text-right text-sm text-gray-700'>
                                                    {formatNumber(row.signed)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>

                    <section className='mt-6 rounded-xl bg-white shadow-sm'>
                        <div className='flex items-center gap-2 border-b border-gray-100 px-6 py-4'>
                            <AlertTriangle className='h-5 w-5 text-amber-600' />
                            <h3 className='font-semibold text-gray-900'>
                                Просроченные документы
                            </h3>
                        </div>
                        {(report?.overdueDocuments || []).length === 0 ? (
                            <div className='p-6 text-sm text-gray-500'>
                                Просроченных документов за выбранный период нет
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
                                                Автор
                                            </th>
                                            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                                Отдел
                                            </th>
                                            <th className='px-4 py-3 text-left text-xs font-medium uppercase text-gray-500'>
                                                Срок
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className='divide-y divide-gray-200'>
                                        {report.overdueDocuments.map((doc) => (
                                            <tr key={doc.id}>
                                                <td className='px-4 py-3'>
                                                    <p className='text-sm font-medium text-gray-900'>
                                                        {doc.title}
                                                    </p>
                                                    <p className='text-xs text-gray-500'>
                                                        #{doc.uid || doc.id}
                                                    </p>
                                                </td>
                                                <td className='px-4 py-3 text-sm text-gray-700'>
                                                    {doc.creatorName}
                                                </td>
                                                <td className='px-4 py-3 text-sm text-gray-700'>
                                                    {doc.departmentName}
                                                </td>
                                                <td className='px-4 py-3 text-sm text-red-700'>
                                                    {formatDate(doc.signingDeadlineAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
