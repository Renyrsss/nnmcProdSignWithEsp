import React, { useState } from "react";
import {
    Building2,
    Check,
    Eye,
    EyeOff,
    KeyRound,
    LoaderCircle,
    LockKeyhole,
    LogOut,
    Mail,
    MonitorSmartphone,
    Pencil,
    Phone,
    Save,
    ShieldCheck,
    UserRound,
    X,
} from "lucide-react";
import {
    changeOwnPassword,
    getCurrentUser,
    logoutCurrentUser,
    updateOwnProfile,
} from "../api/auth";
import { useToast } from "./Toast";

const INITIAL_PASSWORD_FORM = {
    currentPassword: "",
    password: "",
    passwordConfirmation: "",
};

const formatPhone = (value) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length !== 11 || !digits.startsWith("7")) return value || "";
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(
        7,
        9
    )}-${digits.slice(9, 11)}`;
};

const getRoleLabel = (role) => {
    const labels = {
        authenticated: "Пользователь",
        app_admin: "Администратор",
        app_manager: "Руководитель",
        app_observer: "Наблюдатель",
    };
    return labels[role?.type] || role?.name || "Пользователь";
};

function PasswordField({ id, label, value, onChange, autoComplete }) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div>
            <label
                htmlFor={id}
                className='mb-1.5 block text-sm font-medium text-gray-700'>
                {label}
            </label>
            <div className='relative'>
                <LockKeyhole className='pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400' />
                <input
                    id={id}
                    type={isVisible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    autoComplete={autoComplete}
                    className='w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-11 text-sm text-gray-950 outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                />
                <button
                    type='button'
                    onClick={() => setIsVisible((current) => !current)}
                    aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
                    className='absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'>
                    {isVisible ? (
                        <EyeOff className='h-4 w-4' />
                    ) : (
                        <Eye className='h-4 w-4' />
                    )}
                </button>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const [user, setUser] = useState(getCurrentUser() || {});
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [profileForm, setProfileForm] = useState({
        fullName: user.fullName || "",
        phone: formatPhone(user.phone),
    });
    const [profileError, setProfileError] = useState("");
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [passwordForm, setPasswordForm] = useState(INITIAL_PASSWORD_FORM);
    const [passwordError, setPasswordError] = useState("");
    const [isSavingPassword, setIsSavingPassword] = useState(false);
    const toast = useToast();

    const displayName = user.fullName || user.username || "Пользователь";
    const profileInitial = displayName.trim().charAt(0).toUpperCase() || "П";
    const roleName = getRoleLabel(user.role);
    const departmentName = user.department?.name || "Не указано";
    const hasPasswordValues = Object.values(passwordForm).some(Boolean);
    const passwordsMatch =
        Boolean(passwordForm.passwordConfirmation) &&
        passwordForm.password === passwordForm.passwordConfirmation;
    const newPasswordIsDifferent =
        Boolean(passwordForm.password) &&
        passwordForm.password !== passwordForm.currentPassword;
    const canSubmitPassword =
        Boolean(passwordForm.currentPassword) &&
        passwordsMatch &&
        newPasswordIsDifferent &&
        !isSavingPassword;

    const beginProfileEditing = () => {
        setProfileForm({
            fullName: user.fullName || "",
            phone: formatPhone(user.phone),
        });
        setProfileError("");
        setIsEditingProfile(true);
    };

    const cancelProfileEditing = () => {
        if (isSavingProfile) return;
        setProfileError("");
        setIsEditingProfile(false);
    };

    const handleProfileSubmit = async (event) => {
        event.preventDefault();
        const fullName = profileForm.fullName.trim();

        if (fullName.length < 2) {
            setProfileError("Укажите ФИО");
            return;
        }

        setIsSavingProfile(true);
        setProfileError("");

        try {
            const updatedUser = await updateOwnProfile(
                fullName,
                profileForm.phone
            );
            setUser(updatedUser);
            setProfileForm({
                fullName: updatedUser.fullName || "",
                phone: formatPhone(updatedUser.phone),
            });
            setIsEditingProfile(false);
            toast.success("Данные профиля сохранены");
        } catch (requestError) {
            setProfileError(
                requestError?.message || "Не удалось сохранить данные"
            );
        } finally {
            setIsSavingProfile(false);
        }
    };

    const updatePasswordField = (field, value) => {
        setPasswordForm((current) => ({ ...current, [field]: value }));
        if (passwordError) setPasswordError("");
    };

    const clearPasswordForm = () => {
        if (isSavingPassword) return;
        setPasswordForm(INITIAL_PASSWORD_FORM);
        setPasswordError("");
    };

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();

        if (!canSubmitPassword) {
            if (!passwordsMatch) {
                setPasswordError("Новые пароли не совпадают");
            } else if (!newPasswordIsDifferent) {
                setPasswordError("Новый пароль должен отличаться от текущего");
            } else {
                setPasswordError("Заполните все поля");
            }
            return;
        }

        setIsSavingPassword(true);
        setPasswordError("");

        try {
            await changeOwnPassword(
                passwordForm.currentPassword,
                passwordForm.password,
                passwordForm.passwordConfirmation
            );
            setPasswordForm(INITIAL_PASSWORD_FORM);
            toast.success("Пароль успешно изменён");
        } catch (requestError) {
            setPasswordError(
                requestError?.message || "Не удалось изменить пароль"
            );
        } finally {
            setIsSavingPassword(false);
        }
    };

    const handleLogout = async () => {
        await logoutCurrentUser();
        window.location.reload();
    };

    return (
        <div className='px-4 py-6 sm:px-6 lg:px-10 lg:py-8'>
            <div className='mx-auto max-w-6xl'>
                <header className='mb-6 hidden lg:block'>
                    <h1 className='text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl'>
                        Личный кабинет
                    </h1>
                    <p className='mt-1.5 text-sm text-gray-500 sm:text-base'>
                        Управление профилем и безопасностью аккаунта
                    </p>
                </header>

                <section className='overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
                    <div className='flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6'>
                        <div className='relative w-fit shrink-0 self-start'>
                            <div className='flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-bold text-white shadow-sm'>
                                {profileInitial}
                            </div>
                            <span className='absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white'>
                                <Check className='h-3.5 w-3.5' />
                            </span>
                        </div>

                        <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-2'>
                                <h2 className='truncate text-xl font-semibold text-gray-950'>
                                    {displayName}
                                </h2>
                                <span className='rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700'>
                                    {roleName}
                                </span>
                            </div>
                            <div className='mt-1.5 flex items-center gap-2 text-sm text-gray-500'>
                                <Mail className='h-4 w-4 shrink-0' />
                                <span className='truncate'>
                                    {user.email || "Почта не указана"}
                                </span>
                            </div>
                            {!user.fullName && (
                                <p className='mt-2 text-xs text-amber-700'>
                                    Заполните ФИО, чтобы оно отображалось в документах
                                </p>
                            )}
                        </div>

                        {!isEditingProfile && (
                            <button
                                type='button'
                                onClick={beginProfileEditing}
                                className='flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:w-auto'>
                                <Pencil className='h-4 w-4' />
                                Изменить данные
                            </button>
                        )}
                    </div>

                    {isEditingProfile ? (
                        <form
                            onSubmit={handleProfileSubmit}
                            className='border-t border-gray-200 bg-slate-50/70 p-5 sm:p-6'>
                            <div className='grid gap-4 md:grid-cols-2'>
                                <div>
                                    <label
                                        htmlFor='profile-full-name'
                                        className='mb-1.5 block text-sm font-medium text-gray-700'>
                                        ФИО
                                    </label>
                                    <input
                                        id='profile-full-name'
                                        value={profileForm.fullName}
                                        onChange={(event) => {
                                            setProfileForm((current) => ({
                                                ...current,
                                                fullName: event.target.value,
                                            }));
                                            setProfileError("");
                                        }}
                                        autoComplete='name'
                                        placeholder='Фамилия Имя Отчество'
                                        className='w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                                    />
                                </div>
                                <div>
                                    <label
                                        htmlFor='profile-phone'
                                        className='mb-1.5 block text-sm font-medium text-gray-700'>
                                        Номер телефона
                                        <span className='ml-1 font-normal text-gray-400'>
                                            — необязательно
                                        </span>
                                    </label>
                                    <input
                                        id='profile-phone'
                                        value={profileForm.phone}
                                        onChange={(event) => {
                                            setProfileForm((current) => ({
                                                ...current,
                                                phone: event.target.value,
                                            }));
                                            setProfileError("");
                                        }}
                                        type='tel'
                                        autoComplete='tel'
                                        placeholder='+7 (___) ___-__-__'
                                        className='w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50'
                                    />
                                </div>
                            </div>

                            {profileError && (
                                <p
                                    role='alert'
                                    className='mt-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700'>
                                    {profileError}
                                </p>
                            )}

                            <div className='mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                                <button
                                    type='button'
                                    onClick={cancelProfileEditing}
                                    disabled={isSavingProfile}
                                    className='inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50'>
                                    <X className='h-4 w-4' />
                                    Отмена
                                </button>
                                <button
                                    type='submit'
                                    disabled={isSavingProfile}
                                    className='inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'>
                                    {isSavingProfile ? (
                                        <LoaderCircle className='h-4 w-4 animate-spin' />
                                    ) : (
                                        <Save className='h-4 w-4' />
                                    )}
                                    {isSavingProfile
                                        ? "Сохранение..."
                                        : "Сохранить"}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <dl className='grid border-t border-gray-200 bg-slate-50/60 sm:grid-cols-3 sm:divide-x sm:divide-gray-200'>
                            <div className='flex items-start gap-3 border-b border-gray-200 px-5 py-4 last:border-b-0 sm:border-b-0 sm:px-6'>
                                <UserRound className='mt-0.5 h-4.5 w-4.5 shrink-0 text-indigo-500' />
                                <div className='min-w-0'>
                                    <dt className='text-xs font-medium text-gray-400'>
                                        Логин
                                    </dt>
                                    <dd className='mt-1 truncate text-sm font-medium text-gray-800'>
                                        {user.username || "Не указан"}
                                    </dd>
                                </div>
                            </div>
                            <div className='flex items-start gap-3 border-b border-gray-200 px-5 py-4 last:border-b-0 sm:border-b-0 sm:px-6'>
                                <Phone className='mt-0.5 h-4.5 w-4.5 shrink-0 text-indigo-500' />
                                <div className='min-w-0'>
                                    <dt className='text-xs font-medium text-gray-400'>
                                        Телефон
                                    </dt>
                                    <dd className='mt-1 truncate text-sm font-medium text-gray-800'>
                                        {formatPhone(user.phone) || "Не указан"}
                                    </dd>
                                </div>
                            </div>
                            <div className='flex items-start gap-3 px-5 py-4 sm:px-6'>
                                <Building2 className='mt-0.5 h-4.5 w-4.5 shrink-0 text-indigo-500' />
                                <div className='min-w-0'>
                                    <dt className='text-xs font-medium text-gray-400'>
                                        Подразделение
                                    </dt>
                                    <dd className='mt-1 truncate text-sm font-medium text-gray-800'>
                                        {departmentName}
                                    </dd>
                                </div>
                            </div>
                        </dl>
                    )}
                </section>

                <section className='mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm'>
                    <div className='border-b border-gray-200 px-5 py-4 sm:px-6'>
                        <div className='flex items-center gap-3'>
                            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600'>
                                <KeyRound className='h-5 w-5' />
                            </span>
                            <div>
                                <h2 className='text-lg font-semibold text-gray-950'>
                                    Пароль и безопасность
                                </h2>
                                <p className='mt-0.5 text-sm text-gray-500'>
                                    Изменение пароля для входа в систему
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className='grid lg:grid-cols-[17rem_minmax(0,1fr)]'>
                        <aside className='border-b border-gray-200 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r lg:p-6'>
                            <div className='flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-gray-200'>
                                <ShieldCheck className='h-5 w-5' />
                            </div>
                            <h3 className='mt-4 text-sm font-semibold text-gray-900'>
                                Защита аккаунта
                            </h3>
                            <p className='mt-2 text-sm leading-6 text-gray-500'>
                                Используйте уникальный пароль, который не применяется в
                                других сервисах.
                            </p>
                            <div className='mt-4 flex gap-2 text-xs leading-5 text-gray-500'>
                                <Check className='mt-0.5 h-4 w-4 shrink-0 text-emerald-500' />
                                <span>
                                    После смены пароля остальные сессии будут завершены
                                </span>
                            </div>
                        </aside>

                        <form
                            onSubmit={handlePasswordSubmit}
                            className='space-y-4 p-5 sm:p-6'>
                            <PasswordField
                                id='current-password'
                                label='Текущий пароль'
                                value={passwordForm.currentPassword}
                                onChange={(value) =>
                                    updatePasswordField("currentPassword", value)
                                }
                                autoComplete='current-password'
                            />

                            <div className='grid gap-4 md:grid-cols-2'>
                                <PasswordField
                                    id='new-password'
                                    label='Новый пароль'
                                    value={passwordForm.password}
                                    onChange={(value) =>
                                        updatePasswordField("password", value)
                                    }
                                    autoComplete='new-password'
                                />
                                <PasswordField
                                    id='password-confirmation'
                                    label='Повторите новый пароль'
                                    value={passwordForm.passwordConfirmation}
                                    onChange={(value) =>
                                        updatePasswordField(
                                            "passwordConfirmation",
                                            value
                                        )
                                    }
                                    autoComplete='new-password'
                                />
                            </div>

                            <div className='rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-5 text-gray-500'>
                                Требования к сложности определяются политикой
                                безопасности организации.
                                {passwordForm.passwordConfirmation && (
                                    <span
                                        className={`ml-1 font-medium ${
                                            passwordsMatch
                                                ? "text-emerald-600"
                                                : "text-red-600"
                                        }`}>
                                        {passwordsMatch
                                            ? "Пароли совпадают."
                                            : "Пароли не совпадают."}
                                    </span>
                                )}
                            </div>

                            {passwordError && (
                                <p
                                    role='alert'
                                    className='rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700'>
                                    {passwordError}
                                </p>
                            )}

                            <div className='flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end'>
                                {hasPasswordValues && (
                                    <button
                                        type='button'
                                        onClick={clearPasswordForm}
                                        disabled={isSavingPassword}
                                        className='rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50'>
                                        Очистить
                                    </button>
                                )}
                                <button
                                    type='submit'
                                    disabled={!canSubmitPassword}
                                    className='inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300'>
                                    {isSavingPassword && (
                                        <LoaderCircle className='h-4 w-4 animate-spin' />
                                    )}
                                    {isSavingPassword
                                        ? "Сохранение..."
                                        : "Сменить пароль"}
                                </button>
                            </div>
                        </form>
                    </div>
                </section>

                <section className='mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6'>
                    <div className='flex flex-col gap-4 sm:flex-row sm:items-center'>
                        <div className='flex min-w-0 flex-1 items-start gap-3'>
                            <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-gray-600'>
                                <MonitorSmartphone className='h-5 w-5' />
                            </span>
                            <div className='min-w-0 flex-1'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <h2 className='text-base font-semibold text-gray-950'>
                                        Текущий сеанс
                                    </h2>
                                    <span className='inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'>
                                        <span className='h-1.5 w-1.5 rounded-full bg-emerald-500' />
                                        Активен
                                    </span>
                                </div>
                                <p className='mt-1 text-sm text-gray-500'>
                                    Вы вошли как {user.email || user.username}. После
                                    выхода потребуется снова ввести логин и пароль.
                                </p>
                            </div>
                        </div>
                        <button
                            type='button'
                            onClick={handleLogout}
                            className='inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 sm:w-auto'>
                            <LogOut className='h-4 w-4' />
                            Выйти из аккаунта
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
