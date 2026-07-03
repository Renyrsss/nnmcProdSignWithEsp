import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import {
    getAdminRolePermissions,
    updateAdminRolePermissions,
} from "../api/admin";
import { useToast } from "./Toast";

const ADMIN_KEY = "app_admin";

export default function AdminRolePermissionsPage() {
    const [roles, setRoles] = useState([]);
    const [permissionKeys, setPermissionKeys] = useState([]);
    const [permissionLabels, setPermissionLabels] = useState({});
    const [matrix, setMatrix] = useState({});
    const [updatedAt, setUpdatedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const toast = useToast();

    const loadPermissions = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getAdminRolePermissions();
            setRoles(data.roles || []);
            setPermissionKeys(data.permissionKeys || []);
            setPermissionLabels(data.permissions || {});
            setMatrix(data.matrix || {});
            setUpdatedAt(data.updatedAt || null);
        } catch (error) {
            console.error("Ошибка загрузки прав ролей:", error);
            toast.error("Ошибка загрузки прав ролей");
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadPermissions();
    }, [loadPermissions]);

    const roleRows = useMemo(
        () =>
            roles
                .map((role) => ({
                    ...role,
                    key: role.key || role.type || role.name,
                }))
                .sort((a, b) => {
                    if (a.key === ADMIN_KEY) return -1;
                    if (b.key === ADMIN_KEY) return 1;
                    return (a.name || "").localeCompare(b.name || "", "ru");
                }),
        [roles]
    );

    const togglePermission = (roleKey, permissionKey) => {
        if (roleKey === ADMIN_KEY) return;

        setMatrix((prev) => ({
            ...prev,
            [roleKey]: {
                ...(prev[roleKey] || {}),
                [permissionKey]: !prev[roleKey]?.[permissionKey],
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const saved = await updateAdminRolePermissions(matrix);
            setMatrix(saved.matrix || {});
            setUpdatedAt(saved.updatedAt || null);
            toast.success("Права ролей сохранены");
        } catch (error) {
            console.error("Ошибка сохранения прав ролей:", error);
            toast.error(
                error.response?.data?.error?.message ||
                    "Ошибка сохранения прав ролей"
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
                    Загрузка прав...
                </div>
            </div>
        );
    }

    return (
        <div className='mx-auto max-w-7xl px-4 py-8'>
            <div className='mb-6 rounded-xl bg-white p-6 shadow-sm'>
                <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='flex items-center gap-3'>
                        <ShieldCheck className='h-8 w-8 text-indigo-600' />
                        <div>
                            <h2 className='text-2xl font-bold text-gray-800'>
                                Роли и права
                            </h2>
                            <p className='text-sm text-gray-500'>
                                {updatedAt
                                    ? `Обновлено: ${new Date(updatedAt).toLocaleString("ru-RU")}`
                                    : "Матрица прикладных прав по ролям"}
                            </p>
                        </div>
                    </div>
                    <div className='flex flex-wrap gap-2'>
                        <button
                            type='button'
                            onClick={loadPermissions}
                            disabled={loading}
                            className='inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'>
                            <RefreshCw
                                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                            />
                            Обновить
                        </button>
                        <button
                            type='button'
                            onClick={handleSave}
                            disabled={saving}
                            className='inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'>
                            {saving ? (
                                <Loader2 className='h-4 w-4 animate-spin' />
                            ) : (
                                <Save className='h-4 w-4' />
                            )}
                            Сохранить
                        </button>
                    </div>
                </div>
            </div>

            <div className='rounded-xl bg-white p-6 shadow-sm'>
                <div className='overflow-x-auto'>
                    <table className='w-full min-w-[980px] text-left text-sm'>
                        <thead>
                            <tr className='border-b border-gray-200 text-xs uppercase text-gray-500'>
                                <th className='sticky left-0 z-10 bg-white px-3 py-3'>
                                    Роль
                                </th>
                                {permissionKeys.map((permissionKey) => (
                                    <th
                                        key={permissionKey}
                                        className='px-3 py-3 text-center'>
                                        {permissionLabels[permissionKey] || permissionKey}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {roleRows.map((role) => {
                                const protectedAdmin =
                                    role.isProtectedAdmin || role.key === ADMIN_KEY;
                                return (
                                    <tr
                                        key={role.key}
                                        className='border-b border-gray-100 last:border-0'>
                                        <td className='sticky left-0 z-10 bg-white px-3 py-4'>
                                            <p className='font-semibold text-gray-900'>
                                                {role.name}
                                            </p>
                                            <p className='text-xs text-gray-500'>
                                                {role.type || role.key}
                                            </p>
                                            {protectedAdmin && (
                                                <span className='mt-2 inline-flex rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700'>
                                                    Защищено
                                                </span>
                                            )}
                                        </td>
                                        {permissionKeys.map((permissionKey) => (
                                            <td
                                                key={`${role.key}-${permissionKey}`}
                                                className='px-3 py-4 text-center'>
                                                <input
                                                    type='checkbox'
                                                    checked={Boolean(
                                                        matrix[role.key]?.[
                                                            permissionKey
                                                        ]
                                                    )}
                                                    disabled={protectedAdmin}
                                                    onChange={() =>
                                                        togglePermission(
                                                            role.key,
                                                            permissionKey
                                                        )
                                                    }
                                                    className='h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60'
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}
