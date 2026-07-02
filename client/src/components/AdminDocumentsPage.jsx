import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ChevronLeft,
    ChevronRight,
    Eye,
    FileText,
    Filter,
    Search,
    Shield,
    X,
} from "lucide-react";
import { getAdminDocuments, getAdminUsers } from "../api/admin";
import { getDocumentTypes } from "../api/documentTypes";
import { getSubdivisions } from "../api/subdivisions";
import { useToast } from "./Toast";

const STATUS_LABELS = {
    pending: "Ожидает",
    in_progress: "В процессе",
    completed: "Завершен",
    cancelled: "Отменен",
    revision: "На корректировке",
};

const STATUS_STYLES = {
    pending: "bg-yellow-100 text-yellow-800",
    in_progress: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-red-100 text-red-800",
    revision: "bg-orange-100 text-orange-800",
};

const formatDate = (date) =>
    date ? new Date(date).toLocaleString("ru-RU") : "-";

const PAGE_SIZE = 50;

const getSignerProgress = (doc) => {
    const signers = doc.signers || [];
    if (!signers.length) return "0 / 0";
    const signed = signers.filter((signer) => signer.status === "signed").length;
    return `${signed} / ${signers.length}`;
};

export default function AdminDocumentsPage() {
    const [documents, setDocuments] = useState([]);
    const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: PAGE_SIZE, pageCount: 1 });
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        q: "",
        status: "all",
        departmentId: "all",
        subdivisionId: "all",
        creatorId: "all",
        signerId: "all",
        documentTypeId: "all",
        dateFrom: "",
        dateTo: "",
    });
    const [page, setPage] = useState(1);
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [documentTypes, setDocumentTypes] = useState([]);
    const [subdivisions, setSubdivisions] = useState([]);
    const toast = useToast();
    const navigate = useNavigate();

    const pageStats = useMemo(() => {
        return documents.reduce(
            (acc, doc) => {
                acc[doc.status] = (acc[doc.status] || 0) + 1;
                return acc;
            },
            {}
        );
    }, [documents]);

    const loadDictionaries = useCallback(async () => {
        try {
            const [adminData, typeData] = await Promise.all([
                getAdminUsers(),
                getDocumentTypes(),
            ]);
            setUsers(adminData.users || []);
            setDepartments(adminData.departments || []);
            setDocumentTypes(
                (typeData || [])
                    .map((type) => ({
                        id: type.id || type.documentId,
                        name: type.name || type.attributes?.name,
                    }))
                    .filter((type) => type.name)
                    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
            );
        } catch (error) {
            console.error("Ошибка загрузки справочников:", error);
            toast.error("Ошибка загрузки справочников администратора");
        }
    }, [toast]);

    useEffect(() => {
        loadDictionaries();
    }, [loadDictionaries]);

    useEffect(() => {
        setFilters((prev) => ({ ...prev, subdivisionId: "all" }));
        if (filters.departmentId === "all") {
            setSubdivisions([]);
            return;
        }

        getSubdivisions(filters.departmentId)
            .then((data) => {
                setSubdivisions(
                    (data || [])
                        .map((subdivision) => ({
                            id: subdivision.id || subdivision.documentId,
                            name: subdivision.name || subdivision.attributes?.name,
                        }))
                        .filter((subdivision) => subdivision.name)
                        .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                );
            })
            .catch(() => setSubdivisions([]));
    }, [filters.departmentId]);

    const loadDocuments = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getAdminDocuments({
                ...filters,
                page,
                pageSize: PAGE_SIZE,
            });
            setDocuments(response.data || []);
            setMeta(response.meta || { total: 0, page, pageSize: PAGE_SIZE, pageCount: 1 });
        } catch (error) {
            console.error("Ошибка загрузки всех документов:", error);
            toast.error("Нет доступа или ошибка загрузки документов");
        } finally {
            setLoading(false);
        }
    }, [filters, page, toast]);

    useEffect(() => {
        loadDocuments();
    }, [loadDocuments]);

    const updateFilter = (key, value) => {
        setPage(1);
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    const clearFilters = () => {
        setPage(1);
        setFilters({
            q: "",
            status: "all",
            departmentId: "all",
            subdivisionId: "all",
            creatorId: "all",
            signerId: "all",
            documentTypeId: "all",
            dateFrom: "",
            dateTo: "",
        });
        setSubdivisions([]);
    };

    return (
        <div className='max-w-7xl mx-auto px-4 py-8'>
            <div className='bg-white rounded-xl shadow-sm p-6 mb-6'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <Shield className='w-8 h-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Все документы
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Найдено: {meta.total}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={clearFilters}
                        className='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg'>
                        <X className='w-4 h-4' />
                        Сбросить
                    </button>
                </div>

                <div className='grid grid-cols-2 md:grid-cols-5 gap-3 mb-6'>
                    {Object.entries(STATUS_LABELS).map(([status, label]) => (
                        <div key={status} className='border border-gray-200 rounded-lg p-3'>
                            <p className='text-xs text-gray-500'>{label}</p>
                            <p className='text-xl font-semibold text-gray-900'>
                                {pageStats[status] || 0}
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
                                onChange={(e) => updateFilter("q", e.target.value)}
                                placeholder='Название или #ID'
                                className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                            />
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Статус
                        </label>
                        <select
                            value={filters.status}
                            onChange={(e) => updateFilter("status", e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {Object.entries(STATUS_LABELS).map(([status, label]) => (
                                <option key={status} value={status}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Вид документа
                        </label>
                        <select
                            value={filters.documentTypeId}
                            onChange={(e) => updateFilter("documentTypeId", e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {documentTypes.map((type) => (
                                <option key={type.id} value={type.id}>
                                    {type.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Отдел автора
                        </label>
                        <select
                            value={filters.departmentId}
                            onChange={(e) => updateFilter("departmentId", e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {departments.map((department) => (
                                <option key={department.id} value={department.id}>
                                    {department.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Подразделение
                        </label>
                        <select
                            value={filters.subdivisionId}
                            disabled={filters.departmentId === "all"}
                            onChange={(e) => updateFilter("subdivisionId", e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                            <option value='all'>Все</option>
                            {subdivisions.map((subdivision) => (
                                <option key={subdivision.id} value={subdivision.id}>
                                    {subdivision.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Автор
                        </label>
                        <select
                            value={filters.creatorId}
                            onChange={(e) => updateFilter("creatorId", e.target.value)}
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
                            Подписант
                        </label>
                        <select
                            value={filters.signerId}
                            onChange={(e) => updateFilter("signerId", e.target.value)}
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
                            onChange={(e) => updateFilter("dateFrom", e.target.value)}
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
                            onChange={(e) => updateFilter("dateTo", e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        />
                    </div>
                </div>
            </div>

            <div className='bg-white rounded-xl shadow-sm overflow-hidden'>
                <div className='px-6 py-4 border-b border-gray-200 flex items-center gap-2'>
                    <Filter className='w-5 h-5 text-gray-500' />
                    <h3 className='font-semibold text-gray-800'>Результаты</h3>
                </div>

                {loading ? (
                    <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                ) : documents.length === 0 ? (
                    <div className='p-10 text-center text-gray-500'>
                        Документы не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Документ
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Статус
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Автор
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Отдел
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Подписи
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Создан
                                    </th>
                                    <th className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
                                        Действия
                                    </th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-200'>
                                {documents.map((doc) => (
                                    <tr key={doc.id} className='hover:bg-gray-50'>
                                        <td className='px-4 py-4'>
                                            <div className='flex items-start gap-3'>
                                                <FileText className='w-5 h-5 text-indigo-600 mt-0.5' />
                                                <div>
                                                    <p className='font-medium text-gray-900'>
                                                        {doc.title}
                                                    </p>
                                                    <p className='text-xs text-gray-500'>
                                                        #{doc.uid || doc.id}
                                                        {doc.documentType?.name
                                                            ? ` · ${doc.documentType.name}`
                                                            : ""}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className='px-4 py-4'>
                                            <span
                                                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                                                    STATUS_STYLES[doc.status] ||
                                                    "bg-gray-100 text-gray-800"
                                                }`}>
                                                {STATUS_LABELS[doc.status] || doc.status}
                                            </span>
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            {doc.creator?.fullName ||
                                                doc.creator?.username ||
                                                "-"}
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            {doc.creator?.department?.name || "-"}
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            {getSignerProgress(doc)}
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700 whitespace-nowrap'>
                                            {formatDate(doc.createdAt)}
                                        </td>
                                        <td className='px-4 py-4 text-right'>
                                            <button
                                                onClick={() => navigate(`/documents/${doc.id}`)}
                                                className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg'>
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
