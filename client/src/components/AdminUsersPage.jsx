import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Building2,
    Edit,
    KeyRound,
    Lock,
    Plus,
    Search,
    Shield,
    Trash2,
    Unlock,
    UserCheck,
    Users,
    X,
} from "lucide-react";
import {
    changeUserPassword,
    createAdminDepartment,
    createAdminUser,
    deleteAdminDepartment,
    getAdminUsers,
    updateAdminDepartment,
    updateAdminUser,
    updateUserBlocked,
} from "../api/admin";
import { getCurrentUser, isAdminUser } from "../api/auth";
import ConfirmModal from "./ConfirmModal";
import { useToast } from "./Toast";

const roleLabel = (user) => {
    if (user.isAdmin || isAdminUser(user)) return "Администратор";
    return user.role?.name || "Пользователь";
};

const emptyUserForm = {
    username: "",
    email: "",
    fullName: "",
    roleId: "",
    departmentId: "",
    password: "",
};

const emptyDepartmentForm = {
    name: "",
    managerId: "",
};

export default function AdminUsersPage() {
    const [users, setUsers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState("");
    const [departmentFilter, setDepartmentFilter] = useState("all");
    const [userFormOpen, setUserFormOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [userForm, setUserForm] = useState(emptyUserForm);
    const [userSaving, setUserSaving] = useState(false);
    const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState(null);
    const [departmentForm, setDepartmentForm] = useState(emptyDepartmentForm);
    const [departmentSaving, setDepartmentSaving] = useState(false);
    const [departmentToDelete, setDepartmentToDelete] = useState(null);
    const [departmentDeleting, setDepartmentDeleting] = useState(false);
    const [passwordUser, setPasswordUser] = useState(null);
    const [password, setPassword] = useState("");
    const [passwordRepeat, setPasswordRepeat] = useState("");
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [statusUser, setStatusUser] = useState(null);
    const [statusSaving, setStatusSaving] = useState(false);
    const toast = useToast();
    const currentUser = getCurrentUser();

    const filteredUsers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return users.filter((user) => {
            if (
                departmentFilter !== "all" &&
                String(user.department?.id || "") !== String(departmentFilter)
            ) {
                return false;
            }

            if (!normalizedQuery) return true;

            return [
                user.username,
                user.fullName,
                user.email,
                user.department?.name,
                roleLabel(user),
            ]
                .filter(Boolean)
                .some((value) =>
                    String(value).toLowerCase().includes(normalizedQuery)
                );
        });
    }, [users, query, departmentFilter]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminUsers();
            setUsers(data.users || []);
            setDepartments(data.departments || []);
            setRoles(data.roles || []);
        } catch (error) {
            console.error("Ошибка загрузки пользователей:", error);
            toast.error("Нет доступа или ошибка загрузки пользователей");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const closePasswordModal = () => {
        setPasswordUser(null);
        setPassword("");
        setPasswordRepeat("");
    };

    const openCreateUser = () => {
        const defaultRole =
            roles.find((role) => role.type === "authenticated") || roles[0];
        setEditingUser(null);
        setUserForm({
            ...emptyUserForm,
            roleId: defaultRole?.id ? String(defaultRole.id) : "",
        });
        setUserFormOpen(true);
    };

    const openEditUser = (user) => {
        setEditingUser(user);
        setUserForm({
            username: user.username || "",
            email: user.email || "",
            fullName: user.fullName || "",
            roleId: user.role?.id ? String(user.role.id) : "",
            departmentId: user.department?.id ? String(user.department.id) : "",
            password: "",
        });
        setUserFormOpen(true);
    };

    const closeUserForm = () => {
        setUserFormOpen(false);
        setEditingUser(null);
        setUserForm(emptyUserForm);
    };

    const updateUserForm = (key, value) => {
        setUserForm((prev) => ({ ...prev, [key]: value }));
    };

    const submitUserForm = async () => {
        const username = userForm.username.trim();
        const email = userForm.email.trim();
        const fullName = userForm.fullName.trim();

        if (username.length < 3) {
            toast.error("Логин должен быть не короче 3 символов");
            return;
        }
        if (!email) {
            toast.error("Email обязателен");
            return;
        }
        if (!editingUser && userForm.password.length < 8) {
            toast.error("Пароль должен быть не короче 8 символов");
            return;
        }

        const payload = {
            username,
            email,
            fullName,
            roleId: userForm.roleId || null,
            departmentId: userForm.departmentId || null,
        };

        setUserSaving(true);
        try {
            if (editingUser) {
                await updateAdminUser(editingUser.id, payload);
                toast.success("Пользователь обновлен");
            } else {
                await createAdminUser({
                    ...payload,
                    password: userForm.password,
                    blocked: false,
                });
                toast.success("Пользователь создан");
            }

            closeUserForm();
            await loadData();
        } catch (error) {
            console.error("Ошибка сохранения пользователя:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка сохранения пользователя"
            );
        } finally {
            setUserSaving(false);
        }
    };

    const openCreateDepartment = () => {
        setEditingDepartment(null);
        setDepartmentForm(emptyDepartmentForm);
        setDepartmentFormOpen(true);
    };

    const openEditDepartment = (department) => {
        setEditingDepartment(department);
        setDepartmentForm({
            name: department.name || "",
            managerId: department.manager?.id ? String(department.manager.id) : "",
        });
        setDepartmentFormOpen(true);
    };

    const closeDepartmentForm = () => {
        setDepartmentFormOpen(false);
        setEditingDepartment(null);
        setDepartmentForm(emptyDepartmentForm);
    };

    const updateDepartmentForm = (key, value) => {
        setDepartmentForm((prev) => ({ ...prev, [key]: value }));
    };

    const submitDepartmentForm = async () => {
        const name = departmentForm.name.trim();
        if (name.length < 2) {
            toast.error("Название отдела должно быть не короче 2 символов");
            return;
        }

        const payload = {
            name,
            managerId: departmentForm.managerId || null,
        };

        setDepartmentSaving(true);
        try {
            if (editingDepartment) {
                await updateAdminDepartment(editingDepartment.id, payload);
                toast.success("Отдел обновлен");
            } else {
                await createAdminDepartment(payload);
                toast.success("Отдел создан");
            }

            closeDepartmentForm();
            await loadData();
        } catch (error) {
            console.error("Ошибка сохранения отдела:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка сохранения отдела"
            );
        } finally {
            setDepartmentSaving(false);
        }
    };

    const submitDeleteDepartment = async () => {
        if (!departmentToDelete) return;

        setDepartmentDeleting(true);
        try {
            await deleteAdminDepartment(departmentToDelete.id);
            toast.success("Отдел удален");
            setDepartmentToDelete(null);
            await loadData();
        } catch (error) {
            console.error("Ошибка удаления отдела:", error);
            toast.error(
                error?.response?.data?.error?.message ||
                    error?.message ||
                    "Ошибка удаления отдела"
            );
        } finally {
            setDepartmentDeleting(false);
        }
    };

    const submitPassword = async () => {
        if (!passwordUser) return;
        if (password.length < 8) {
            toast.error("Пароль должен быть не короче 8 символов");
            return;
        }
        if (password !== passwordRepeat) {
            toast.error("Пароли не совпадают");
            return;
        }

        setPasswordSaving(true);
        try {
            await changeUserPassword(passwordUser.id, password);
            toast.success("Пароль изменен");
            closePasswordModal();
        } catch (error) {
            console.error("Ошибка смены пароля:", error);
            toast.error(error?.message || "Ошибка смены пароля");
        } finally {
            setPasswordSaving(false);
        }
    };

    const submitStatus = async () => {
        if (!statusUser) return;

        setStatusSaving(true);
        try {
            const nextBlocked = !statusUser.blocked;
            await updateUserBlocked(statusUser.id, nextBlocked);
            setUsers((prev) =>
                prev.map((user) =>
                    user.id === statusUser.id
                        ? { ...user, blocked: nextBlocked }
                        : user
                )
            );
            toast.success(nextBlocked ? "Пользователь заблокирован" : "Пользователь разблокирован");
            setStatusUser(null);
        } catch (error) {
            console.error("Ошибка изменения статуса:", error);
            toast.error(error?.message || "Ошибка изменения статуса");
        } finally {
            setStatusSaving(false);
        }
    };

    return (
        <div className='max-w-7xl mx-auto px-4 py-8'>
            <div className='bg-white rounded-xl shadow-sm p-6 mb-6'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6'>
                    <div className='flex items-center gap-3'>
                        <Users className='w-8 h-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Пользователи и отделы
                            </h2>
                            <p className='text-sm text-gray-500'>
                                Пользователей: {users.length} · Отделов: {departments.length}
                            </p>
                        </div>
                    </div>
                    <button
                        type='button'
                        onClick={openCreateUser}
                        className='inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg'>
                        <Plus className='w-4 h-4' />
                        Создать пользователя
                    </button>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div className='md:col-span-2'>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Поиск
                        </label>
                        <div className='relative'>
                            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400' />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder='ФИО, логин, email, отдел'
                                className='w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                            />
                        </div>
                    </div>

                    <div>
                        <label className='block text-sm font-medium text-gray-700 mb-1'>
                            Отдел
                        </label>
                        <select
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                            className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
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

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
                <div className='lg:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden'>
                    <div className='px-6 py-4 border-b border-gray-200'>
                        <h3 className='font-semibold text-gray-800'>
                            Сотрудники
                        </h3>
                    </div>

                    {loading ? (
                        <div className='p-10 text-center text-gray-500'>Загрузка...</div>
                    ) : filteredUsers.length === 0 ? (
                        <div className='p-10 text-center text-gray-500'>
                            Пользователи не найдены
                        </div>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='w-full'>
                                <thead className='bg-gray-50'>
                                    <tr>
                                        <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                            Пользователь
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                            Отдел
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                            Роль
                                        </th>
                                        <th className='px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
                                            Документы
                                        </th>
                                        <th className='px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase'>
                                            Действия
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className='divide-y divide-gray-200'>
                                    {filteredUsers.map((user) => {
                                        const self = Number(user.id) === Number(currentUser?.id);
                                        return (
                                            <tr key={user.id} className='hover:bg-gray-50'>
                                                <td className='px-4 py-4'>
                                                    <div>
                                                        <div className='flex items-center gap-2'>
                                                            <p className='font-medium text-gray-900'>
                                                                {user.fullName || user.username}
                                                            </p>
                                                            {user.blocked && (
                                                                <span className='px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700'>
                                                                    Заблокирован
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className='text-xs text-gray-500'>
                                                            {user.username} · {user.email}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className='px-4 py-4 text-sm text-gray-700'>
                                                    {user.department?.name || "-"}
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                                                            user.isAdmin
                                                                ? "bg-indigo-100 text-indigo-800"
                                                                : "bg-gray-100 text-gray-700"
                                                        }`}>
                                                        {user.isAdmin && <Shield className='w-3 h-3' />}
                                                        {roleLabel(user)}
                                                    </span>
                                                </td>
                                                <td className='px-4 py-4 text-sm text-gray-700'>
                                                    Создал: {user.stats?.createdDocumentsCount || 0}
                                                    <br />
                                                    Назначен: {user.stats?.assignedDocumentsCount || 0}
                                                    <br />
                                                    Подписал: {user.stats?.signedDocumentsCount || 0}
                                                </td>
                                                <td className='px-4 py-4'>
                                                    <div className='flex justify-end gap-2'>
                                                        <button
                                                            onClick={() => openEditUser(user)}
                                                            className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg'>
                                                            <Edit className='w-4 h-4' />
                                                            Изменить
                                                        </button>
                                                        <button
                                                            onClick={() => setPasswordUser(user)}
                                                            className='inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg'>
                                                            <KeyRound className='w-4 h-4' />
                                                            Пароль
                                                        </button>
                                                        <button
                                                            disabled={self && !user.blocked}
                                                            onClick={() => setStatusUser(user)}
                                                            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
                                                                user.blocked
                                                                    ? "text-green-700 bg-green-50 hover:bg-green-100"
                                                                    : "text-red-700 bg-red-50 hover:bg-red-100"
                                                            }`}>
                                                            {user.blocked ? (
                                                                <Unlock className='w-4 h-4' />
                                                            ) : (
                                                                <Lock className='w-4 h-4' />
                                                            )}
                                                            {user.blocked ? "Разблокировать" : "Блокировать"}
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

                <div className='bg-white rounded-xl shadow-sm overflow-hidden'>
                    <div className='px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3'>
                        <div className='flex items-center gap-2'>
                            <Building2 className='w-5 h-5 text-indigo-600' />
                            <h3 className='font-semibold text-gray-800'>Отделы</h3>
                        </div>
                        <button
                            type='button'
                            onClick={openCreateDepartment}
                            className='inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg'>
                            <Plus className='w-4 h-4' />
                            Добавить
                        </button>
                    </div>
                    <div className='divide-y divide-gray-200'>
                        {departments.map((department) => (
                            <div key={department.id} className='p-4'>
                                <div className='flex items-start justify-between gap-3'>
                                    <div>
                                        <p className='font-medium text-gray-900'>
                                            {department.name}
                                        </p>
                                        <p className='text-xs text-gray-500'>
                                            Пользователей: {department.usersCount || 0}
                                        </p>
                                        <p className='mt-1 flex items-center gap-1.5 text-xs text-gray-500'>
                                            <UserCheck className='w-3.5 h-3.5' />
                                            {department.manager
                                                ? department.manager.fullName ||
                                                  department.manager.username
                                                : "Руководитель не назначен"}
                                        </p>
                                    </div>
                                    <span className='px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700'>
                                        {department.subdivisions?.length || 0}
                                    </span>
                                </div>
                                {department.subdivisions?.length > 0 && (
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                        {department.subdivisions.map((subdivision) => (
                                            <span
                                                key={subdivision.id}
                                                className='px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-xs'>
                                                {subdivision.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div className='mt-3 flex flex-wrap gap-2'>
                                    <button
                                        type='button'
                                        onClick={() => openEditDepartment(department)}
                                        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg'>
                                        <Edit className='w-3.5 h-3.5' />
                                        Изменить
                                    </button>
                                    <button
                                        type='button'
                                        disabled={
                                            (department.usersCount || 0) > 0 ||
                                            (department.subdivisions?.length || 0) > 0
                                        }
                                        onClick={() => setDepartmentToDelete(department)}
                                        className='inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg disabled:opacity-50'>
                                        <Trash2 className='w-3.5 h-3.5' />
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {departmentFormOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                        onClick={closeDepartmentForm}
                    />
                    <div className='relative bg-white rounded-xl shadow-2xl w-full max-w-lg'>
                        <div className='flex items-center justify-between p-6 border-b border-gray-100'>
                            <h3 className='text-xl font-semibold text-gray-800'>
                                {editingDepartment ? "Редактировать отдел" : "Создать отдел"}
                            </h3>
                            <button
                                onClick={closeDepartmentForm}
                                className='p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100'>
                                <X className='w-5 h-5' />
                            </button>
                        </div>

                        <div className='p-6 space-y-4'>
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Название отдела
                                </label>
                                <input
                                    value={departmentForm.name}
                                    onChange={(e) => updateDepartmentForm("name", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    placeholder='Например, Юридический отдел'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Руководитель отдела
                                </label>
                                <select
                                    value={departmentForm.managerId}
                                    onChange={(e) => updateDepartmentForm("managerId", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    <option value=''>Не назначен</option>
                                    {users.map((user) => (
                                        <option key={user.id} value={user.id}>
                                            {user.fullName || user.username}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className='flex gap-3 p-6 pt-2 border-t border-gray-100'>
                            <button
                                onClick={closeDepartmentForm}
                                disabled={departmentSaving}
                                className='flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg disabled:opacity-50'>
                                Отмена
                            </button>
                            <button
                                onClick={submitDepartmentForm}
                                disabled={departmentSaving}
                                className='flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50'>
                                {departmentSaving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {userFormOpen && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                        onClick={closeUserForm}
                    />
                    <div className='relative bg-white rounded-xl shadow-2xl w-full max-w-2xl'>
                        <div className='flex items-center justify-between p-6 border-b border-gray-100'>
                            <h3 className='text-xl font-semibold text-gray-800'>
                                {editingUser ? "Редактировать пользователя" : "Создать пользователя"}
                            </h3>
                            <button
                                onClick={closeUserForm}
                                className='p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100'>
                                <X className='w-5 h-5' />
                            </button>
                        </div>

                        <div className='p-6 grid grid-cols-1 md:grid-cols-2 gap-4'>
                            <div className='md:col-span-2'>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    ФИО
                                </label>
                                <input
                                    value={userForm.fullName}
                                    onChange={(e) => updateUserForm("fullName", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    placeholder='Иванов Иван Иванович'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Логин
                                </label>
                                <input
                                    value={userForm.username}
                                    onChange={(e) => updateUserForm("username", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    autoComplete='username'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Email
                                </label>
                                <input
                                    type='email'
                                    value={userForm.email}
                                    onChange={(e) => updateUserForm("email", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    autoComplete='email'
                                />
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Роль
                                </label>
                                <select
                                    value={userForm.roleId}
                                    onChange={(e) => updateUserForm("roleId", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    {roles.map((role) => (
                                        <option key={role.id} value={role.id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Отдел
                                </label>
                                <select
                                    value={userForm.departmentId}
                                    onChange={(e) => updateUserForm("departmentId", e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'>
                                    <option value=''>Без отдела</option>
                                    {departments.map((department) => (
                                        <option key={department.id} value={department.id}>
                                            {department.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {!editingUser && (
                                <div className='md:col-span-2'>
                                    <label className='block text-sm font-medium text-gray-700 mb-1'>
                                        Временный пароль
                                    </label>
                                    <input
                                        type='password'
                                        value={userForm.password}
                                        onChange={(e) => updateUserForm("password", e.target.value)}
                                        className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                        autoComplete='new-password'
                                    />
                                </div>
                            )}
                        </div>

                        <div className='flex gap-3 p-6 pt-2 border-t border-gray-100'>
                            <button
                                onClick={closeUserForm}
                                disabled={userSaving}
                                className='flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg disabled:opacity-50'>
                                Отмена
                            </button>
                            <button
                                onClick={submitUserForm}
                                disabled={userSaving}
                                className='flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50'>
                                {userSaving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {passwordUser && (
                <div className='fixed inset-0 z-50 flex items-center justify-center p-4'>
                    <div
                        className='absolute inset-0 bg-black/40 backdrop-blur-sm'
                        onClick={closePasswordModal}
                    />
                    <div className='relative bg-white rounded-xl shadow-2xl w-full max-w-md'>
                        <div className='flex items-center justify-between p-6 border-b border-gray-100'>
                            <h3 className='text-xl font-semibold text-gray-800'>
                                Смена пароля
                            </h3>
                            <button
                                onClick={closePasswordModal}
                                className='p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100'>
                                <X className='w-5 h-5' />
                            </button>
                        </div>
                        <div className='p-6 space-y-4'>
                            <p className='text-sm text-gray-600'>
                                {passwordUser.fullName || passwordUser.username}
                            </p>
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Новый пароль
                                </label>
                                <input
                                    type='password'
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    autoComplete='new-password'
                                />
                            </div>
                            <div>
                                <label className='block text-sm font-medium text-gray-700 mb-1'>
                                    Повтор пароля
                                </label>
                                <input
                                    type='password'
                                    value={passwordRepeat}
                                    onChange={(e) => setPasswordRepeat(e.target.value)}
                                    className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent'
                                    autoComplete='new-password'
                                />
                            </div>
                        </div>
                        <div className='flex gap-3 p-6 pt-2 border-t border-gray-100'>
                            <button
                                onClick={closePasswordModal}
                                disabled={passwordSaving}
                                className='flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg disabled:opacity-50'>
                                Отмена
                            </button>
                            <button
                                onClick={submitPassword}
                                disabled={passwordSaving}
                                className='flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50'>
                                {passwordSaving ? "Сохранение..." : "Сохранить"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!statusUser}
                onClose={() => setStatusUser(null)}
                onConfirm={submitStatus}
                title={statusUser?.blocked ? "Разблокировать пользователя" : "Заблокировать пользователя"}
                message={
                    statusUser?.blocked
                        ? `Пользователь ${statusUser?.fullName || statusUser?.username} снова сможет войти в систему.`
                        : `Пользователь ${statusUser?.fullName || statusUser?.username} потеряет доступ к системе.`
                }
                confirmText={statusUser?.blocked ? "Разблокировать" : "Блокировать"}
                type={statusUser?.blocked ? "info" : "danger"}
                isLoading={statusSaving}
            />

            <ConfirmModal
                isOpen={!!departmentToDelete}
                onClose={() => setDepartmentToDelete(null)}
                onConfirm={submitDeleteDepartment}
                title='Удалить отдел'
                message={`Отдел "${departmentToDelete?.name || ""}" будет удален. Удаление доступно только для отдела без пользователей и подразделений.`}
                confirmText='Удалить'
                type='danger'
                isLoading={departmentDeleting}
            />
        </div>
    );
}
