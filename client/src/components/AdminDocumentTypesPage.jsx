import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Building2,
    Clock,
    Edit,
    FileText,
    Plus,
    Search,
    Shield,
    Trash2,
    UserPlus,
    X,
} from "lucide-react";
import {
    createAdminDocumentType,
    deleteAdminDocumentType,
    getAdminDocumentTypes,
    getAdminUsers,
    updateAdminDocumentType,
} from "../api/admin";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const emptyForm = {
    name: "",
    requiresEds: false,
    defaultSignatureSequential: false,
    signingDeadlineDays: "",
    mandatorySigners: [],
    qrTemplate: "",
    stampTemplate: "",
    allowedDepartmentIds: [],
};

const formatDepartments = (departments) => {
    if (!departments?.length) return "Все отделы";
    return departments.map((department) => department.name).join(", ");
};

export default function AdminDocumentTypesPage() {
    const [documentTypes, setDocumentTypes] = useState([]);
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editingType, setEditingType] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [typeToDelete, setTypeToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const toast = useToast();

    const filteredTypes = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) return documentTypes;

        return documentTypes.filter((type) =>
            [
                type.name,
                formatDepartments(type.allowedDepartments),
                ...(type.mandatorySigners || []).map((signer) => signer.userName),
            ]
                .filter(Boolean)
                .some((value) =>
                    String(value).toLowerCase().includes(normalizedQuery)
                )
        );
    }, [documentTypes, query]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [typesData, adminData] = await Promise.all([
                getAdminDocumentTypes(),
                getAdminUsers(),
            ]);
            setDocumentTypes(typesData || []);
            setUsers(adminData.users || []);
            setDepartments(adminData.departments || []);
        } catch (error) {
            console.error("Ошибка загрузки типов документов:", error);
            toast.error("Ошибка загрузки типов документов");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openCreateForm = () => {
        setEditingType(null);
        setForm(emptyForm);
        setFormOpen(true);
    };

    const openEditForm = (type) => {
        setEditingType(type);
        setForm({
            name: type.name || "",
            requiresEds: Boolean(type.requiresEds),
            defaultSignatureSequential: Boolean(type.defaultSignatureSequential),
            signingDeadlineDays: type.signingDeadlineDays
                ? String(type.signingDeadlineDays)
                : "",
            mandatorySigners: type.mandatorySigners || [],
            qrTemplate: type.qrTemplate || "",
            stampTemplate: type.stampTemplate || "",
            allowedDepartmentIds: (type.allowedDepartments || []).map((department) =>
                String(department.id)
            ),
        });
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditingType(null);
        setForm(emptyForm);
    };

    const updateForm = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const toggleDepartment = (departmentId) => {
        const id = String(departmentId);
        setForm((prev) => {
            const exists = prev.allowedDepartmentIds.includes(id);
            return {
                ...prev,
                allowedDepartmentIds: exists
                    ? prev.allowedDepartmentIds.filter((item) => item !== id)
                    : [...prev.allowedDepartmentIds, id],
            };
        });
    };

    const addMandatorySigner = () => {
        const usedIds = new Set(
            form.mandatorySigners.map((signer) => String(signer.userId))
        );
        const user = users.find((item) => !usedIds.has(String(item.id)));
        if (!user) {
            toast.error("Нет доступных пользователей для добавления");
            return;
        }

        setForm((prev) => ({
            ...prev,
            mandatorySigners: [
                ...prev.mandatorySigners,
                {
                    userId: user.id,
                    userName: user.fullName || user.username,
                    userEmail: user.email,
                    role: "Подписант",
                },
            ],
        }));
    };

    const updateMandatorySigner = (index, key, value) => {
        setForm((prev) => {
            const next = [...prev.mandatorySigners];
            if (key === "userId") {
                const user = users.find((item) => String(item.id) === String(value));
                next[index] = {
                    ...next[index],
                    userId: user?.id || value,
                    userName: user?.fullName || user?.username || "",
                    userEmail: user?.email || "",
                };
            } else {
                next[index] = { ...next[index], [key]: value };
            }
            return { ...prev, mandatorySigners: next };
        });
    };

    const removeMandatorySigner = (index) => {
        setForm((prev) => ({
            ...prev,
            mandatorySigners: prev.mandatorySigners.filter((_, itemIndex) => itemIndex !== index),
        }));
    };

    const submitForm = async () => {
        const name = form.name.trim();
        if (name.length < 2) {
            toast.error("Название типа документа должно быть не короче 2 символов");
            return;
        }

        const payload = {
            name,
            requiresEds: form.requiresEds,
            defaultSignatureSequential: form.defaultSignatureSequential,
            signingDeadlineDays: form.signingDeadlineDays || null,
            mandatorySigners: form.mandatorySigners.map((signer) => ({
                userId: signer.userId,
                role: signer.role,
            })),
            qrTemplate: form.qrTemplate,
            stampTemplate: form.stampTemplate,
            allowedDepartmentIds: form.allowedDepartmentIds,
        };

        setSaving(true);
        try {
            if (editingType) {
                await updateAdminDocumentType(editingType.id, payload);
                toast.success("Тип документа обновлен");
            } else {
                await createAdminDocumentType(payload);
                toast.success("Тип документа создан");
            }
            closeForm();
            await loadData();
        } catch (error) {
            console.error("Ошибка сохранения типа документа:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка сохранения типа документа"
            );
        } finally {
            setSaving(false);
        }
    };

    const submitDelete = async () => {
        if (!typeToDelete) return;

        setDeleting(true);
        try {
            await deleteAdminDocumentType(typeToDelete.id);
            toast.success("Тип документа удален");
            setTypeToDelete(null);
            await loadData();
        } catch (error) {
            console.error("Ошибка удаления типа документа:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка удаления типа документа"
            );
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className='max-w-7xl mx-auto px-4 py-8'>
            <div className='bg-white rounded-xl shadow-sm p-6 mb-6'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <FileText className='w-8 h-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Типы документов
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Справочник правил подписания: {documentTypes.length}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={openCreateForm}
                        className='inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg'>
                        <Plus className='w-4 h-4' />
                        Создать тип
                    </button>
                </div>

                <div>
                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                        Поиск
                    </label>
                    <div className='relative'>
                        <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder='Название, отдел или обязательный подписант'
                            className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                        />
                    </div>
                </div>
            </div>

            <div className='bg-white rounded-xl shadow-sm overflow-hidden'>
                {loading ? (
                    <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                ) : filteredTypes.length === 0 ? (
                    <div className='p-10 text-center text-gray-500'>
                        Типы документов не найдены
                    </div>
                ) : (
                    <div className='overflow-x-auto'>
                        <table className='w-full'>
                            <thead className='bg-gray-50'>
                                <tr>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Тип
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Правила
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Доступ
                                    </th>
                                    <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                        Обязательные подписанты
                                    </th>
                                    <th className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
                                        Действия
                                    </th>
                                </tr>
                            </thead>
                            <tbody className='divide-y divide-gray-200'>
                                {filteredTypes.map((type) => (
                                    <tr key={type.id} className='hover:bg-gray-50'>
                                        <td className='px-4 py-4'>
                                            <p className='font-medium text-gray-900'>
                                                {type.name}
                                            </p>
                                            <p className='text-xs text-gray-500'>
                                                Документов: {type.documentsCount || 0}
                                            </p>
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            <div className='space-y-1'>
                                                <p className='flex items-center gap-1.5'>
                                                    <Shield className='w-4 h-4 text-indigo-600' />
                                                    {type.requiresEds
                                                        ? "Требуется ЭЦП"
                                                        : "ЭЦП не обязательна"}
                                                </p>
                                                <p>
                                                    {type.defaultSignatureSequential
                                                        ? "Последовательное подписание"
                                                        : "Параллельное подписание"}
                                                </p>
                                                <p className='flex items-center gap-1.5 text-gray-500'>
                                                    <Clock className='w-4 h-4' />
                                                    {type.signingDeadlineDays
                                                        ? `${type.signingDeadlineDays} дн.`
                                                        : "Без срока"}
                                                </p>
                                            </div>
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700 max-w-xs'>
                                            <div className='flex items-start gap-1.5'>
                                                <Building2 className='w-4 h-4 text-gray-400 mt-0.5' />
                                                <span>{formatDepartments(type.allowedDepartments)}</span>
                                            </div>
                                        </td>
                                        <td className='px-4 py-4 text-sm text-gray-700'>
                                            {type.mandatorySigners?.length > 0 ? (
                                                <div className='space-y-1'>
                                                    {type.mandatorySigners.map((signer) => (
                                                        <p key={`${type.id}-${signer.userId}`}>
                                                            {signer.order}. {signer.userName}
                                                            {signer.role ? ` - ${signer.role}` : ""}
                                                        </p>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className='text-gray-400'>Не заданы</span>
                                            )}
                                        </td>
                                        <td className='px-4 py-4'>
                                            <div className='flex justify-end gap-2'>
                                                <button
                                                    type='button'
                                                    onClick={() => openEditForm(type)}
                                                    className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg'>
                                                    <Edit className='w-4 h-4' />
                                                    Изменить
                                                </button>
                                                <button
                                                    type='button'
                                                    disabled={(type.documentsCount || 0) > 0}
                                                    onClick={() => setTypeToDelete(type)}
                                                    className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50'>
                                                    <Trash2 className='w-4 h-4' />
                                                    Удалить
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {formOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                        onClick={closeForm}
                    />
                    <div className='relative bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto'>
                        <div className='sticky top-0 bg-white flex items-center justify-between p-6 border-b border-gray-100'>
                            <h3 className='text-xl font-semibold text-gray-800'>
                                {editingType ? "Редактировать тип" : "Создать тип"}
                            </h3>
                            <button
                                onClick={closeForm}
                                className='p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100'>
                                <X className='w-5 h-5' />
                            </button>
                        </div>

                        <div className='p-6 space-y-6'>
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Название
                                </label>
                                <input
                                    value={form.name}
                                    onChange={(event) => updateForm("name", event.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    placeholder='Например, Договор'
                                />
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                                <label className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg'>
                                    <input
                                        type='checkbox'
                                        checked={form.requiresEds}
                                        onChange={(event) => updateForm("requiresEds", event.target.checked)}
                                        className='w-4 h-4 text-indigo-600'
                                    />
                                    <span className='text-sm font-medium text-gray-700'>
                                        Требуется ЭЦП
                                    </span>
                                </label>

                                <label className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg'>
                                    <input
                                        type='checkbox'
                                        checked={form.defaultSignatureSequential}
                                        onChange={(event) =>
                                            updateForm("defaultSignatureSequential", event.target.checked)
                                        }
                                        className='w-4 h-4 text-indigo-600'
                                    />
                                    <span className='text-sm font-medium text-gray-700'>
                                        Последовательно
                                    </span>
                                </label>

                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Срок подписания, дней
                                    </label>
                                    <input
                                        type='number'
                                        min='1'
                                        max='3650'
                                        value={form.signingDeadlineDays}
                                        onChange={(event) =>
                                            updateForm("signingDeadlineDays", event.target.value)
                                        }
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                </div>
                            </div>

                            <div>
                                <div className='flex items-center justify-between gap-3 mb-3'>
                                    <h4 className='font-semibold text-gray-800'>
                                        Обязательные подписанты
                                    </h4>
                                    <button
                                        type='button'
                                        onClick={addMandatorySigner}
                                        className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg'>
                                        <UserPlus className='w-4 h-4' />
                                        Добавить
                                    </button>
                                </div>

                                <div className='space-y-3'>
                                    {form.mandatorySigners.length === 0 ? (
                                        <p className='text-sm text-gray-500'>
                                            Обязательные подписанты не заданы.
                                        </p>
                                    ) : (
                                        form.mandatorySigners.map((signer, index) => (
                                            <div
                                                key={`${signer.userId}-${index}`}
                                                className='grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3'>
                                                <select
                                                    value={signer.userId}
                                                    onChange={(event) =>
                                                        updateMandatorySigner(index, "userId", event.target.value)
                                                    }
                                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                                    {users.map((user) => (
                                                        <option key={user.id} value={user.id}>
                                                            {user.fullName || user.username}
                                                        </option>
                                                    ))}
                                                </select>
                                                <input
                                                    value={signer.role || ""}
                                                    onChange={(event) =>
                                                        updateMandatorySigner(index, "role", event.target.value)
                                                    }
                                                    placeholder='Роль в документе'
                                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                                />
                                                <button
                                                    type='button'
                                                    onClick={() => removeMandatorySigner(index)}
                                                    className='inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg'>
                                                    <Trash2 className='w-4 h-4' />
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <h4 className='font-semibold text-gray-800 mb-3'>
                                    Доступность для отделов
                                </h4>
                                <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'>
                                    {departments.map((department) => (
                                        <label
                                            key={department.id}
                                            className='flex items-center gap-3 p-3 border border-gray-200 rounded-lg'>
                                            <input
                                                type='checkbox'
                                                checked={form.allowedDepartmentIds.includes(String(department.id))}
                                                onChange={() => toggleDepartment(department.id)}
                                                className='w-4 h-4 text-indigo-600'
                                            />
                                            <span className='text-sm text-gray-700'>
                                                {department.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Шаблон QR
                                    </label>
                                    <textarea
                                        value={form.qrTemplate}
                                        onChange={(event) => updateForm("qrTemplate", event.target.value)}
                                        rows={4}
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                </div>
                                <div>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Шаблон штампа
                                    </label>
                                    <textarea
                                        value={form.stampTemplate}
                                        onChange={(event) => updateForm("stampTemplate", event.target.value)}
                                        rows={4}
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='sticky bottom-0 bg-white flex gap-3 p-6 pt-3 border-t border-gray-100'>
                            <button
                                onClick={closeForm}
                                disabled={saving}
                                className='flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg disabled:opacity-50'>
                                Отмена
                            </button>
                            <button
                                onClick={submitForm}
                                disabled={saving}
                                className='flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50'>
                                {saving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!typeToDelete}
                onClose={() => setTypeToDelete(null)}
                onConfirm={submitDelete}
                title='Удалить тип документа'
                message={`Тип "${typeToDelete?.name || ""}" будет удален. Удаление доступно только если к типу не привязаны документы.`}
                confirmText='Удалить'
                type='danger'
                isLoading={deleting}
            />
        </div>
    );
}
