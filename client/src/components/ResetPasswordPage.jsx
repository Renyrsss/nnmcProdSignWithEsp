import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
    AlertCircle,
    ArrowLeft,
    Check,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    LockKeyhole,
} from "lucide-react";
import {
    getPublicPasswordPolicy,
    resetPasswordWithToken,
} from "../api/auth";
import AuthShell from "./AuthShell";

const defaultPolicy = {
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireNumber: false,
    requireSpecial: false,
    resetLinkTtlMinutes: 30,
};

const getErrorMessage = (error) =>
    error?.message || "Не удалось изменить пароль. Запросите новую ссылку.";

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token")?.trim() || "";
    const [policy, setPolicy] = useState(defaultPolicy);
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [completed, setCompleted] = useState(false);

    useEffect(() => {
        let active = true;
        getPublicPasswordPolicy()
            .then((result) => {
                if (active) setPolicy({ ...defaultPolicy, ...result });
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    const requirements = useMemo(
        () => [
            {
                key: "length",
                label: `Не менее ${policy.minLength} символов`,
                met: password.length >= policy.minLength,
                required: true,
            },
            {
                key: "uppercase",
                label: "Заглавная буква",
                met: /[A-ZА-ЯЁ]/.test(password),
                required: policy.requireUppercase,
            },
            {
                key: "lowercase",
                label: "Строчная буква",
                met: /[a-zа-яё]/.test(password),
                required: policy.requireLowercase,
            },
            {
                key: "number",
                label: "Цифра",
                met: /[0-9]/.test(password),
                required: policy.requireNumber,
            },
            {
                key: "special",
                label: "Специальный символ",
                met: /[^A-Za-zА-Яа-яЁё0-9]/.test(password),
                required: policy.requireSpecial,
            },
        ].filter((item) => item.required),
        [password, policy]
    );

    const canSubmit =
        token &&
        requirements.every((requirement) => requirement.met) &&
        password === confirmation &&
        confirmation.length > 0;

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canSubmit) return;
        setError("");
        setLoading(true);

        try {
            await resetPasswordWithToken(token, password, confirmation);
            setCompleted(true);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <AuthShell
                eyebrow='Восстановление доступа'
                title='Ссылка недействительна'
                description='В адресе отсутствует токен восстановления. Запросите новое письмо.'>
                <div className='rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900'>
                    Ссылка могла быть скопирована не полностью. Используйте кнопку
                    из письма или начните восстановление заново.
                </div>
                <Link
                    to='/forgot-password'
                    className='mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white transition hover:bg-indigo-700'>
                    <KeyRound className='h-5 w-5' />
                    Запросить новую ссылку
                </Link>
            </AuthShell>
        );
    }

    if (completed) {
        return (
            <AuthShell
                eyebrow='Готово'
                title='Пароль изменён'
                description='Новый пароль сохранён. Все предыдущие сеансы завершены.'>
                <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5'>
                    <div className='flex items-start gap-4'>
                        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700'>
                            <CheckCircle2 className='h-6 w-6' />
                        </span>
                        <div>
                            <p className='font-semibold text-emerald-950'>
                                Доступ восстановлен
                            </p>
                            <p className='mt-1 text-sm leading-6 text-emerald-800'>
                                Теперь войдите с новым паролем. Ссылка из письма
                                больше не действует.
                            </p>
                        </div>
                    </div>
                </div>
                <Link
                    to='/login'
                    className='mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white transition hover:bg-indigo-700'>
                    Перейти ко входу
                </Link>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            eyebrow='Новый пароль'
            title='Создайте новый пароль'
            description={`Ссылка действует ${policy.resetLinkTtlMinutes} минут. После сохранения потребуется войти заново.`}>
            {error && (
                <div
                    role='alert'
                    className='mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
                    <AlertCircle className='mt-0.5 h-5 w-5 shrink-0' />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-5'>
                <PasswordField
                    id='new-password'
                    label='Новый пароль'
                    value={password}
                    onChange={setPassword}
                    visible={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                    autoComplete='new-password'
                />

                <div className='rounded-xl bg-slate-50 px-4 py-3'>
                    <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>
                        Требования
                    </p>
                    <ul className='mt-2 grid gap-2 sm:grid-cols-2'>
                        {requirements.map((requirement) => (
                            <li
                                key={requirement.key}
                                className={`flex items-center gap-2 text-sm ${
                                    requirement.met
                                        ? "text-emerald-700"
                                        : "text-slate-500"
                                }`}>
                                <span
                                    className={`flex h-5 w-5 items-center justify-center rounded-full ${
                                        requirement.met
                                            ? "bg-emerald-100"
                                            : "bg-slate-200"
                                    }`}>
                                    <Check className='h-3.5 w-3.5' />
                                </span>
                                {requirement.label}
                            </li>
                        ))}
                    </ul>
                </div>

                <PasswordField
                    id='password-confirmation'
                    label='Повторите пароль'
                    value={confirmation}
                    onChange={setConfirmation}
                    visible={showConfirmation}
                    onToggle={() => setShowConfirmation((value) => !value)}
                    autoComplete='new-password'
                    invalid={confirmation.length > 0 && password !== confirmation}
                />

                {confirmation.length > 0 && password !== confirmation && (
                    <p className='-mt-3 text-sm text-red-600'>Пароли не совпадают</p>
                )}

                <button
                    type='submit'
                    disabled={loading || !canSubmit}
                    className='flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-indigo-300 disabled:shadow-none'>
                    <LockKeyhole className='h-5 w-5' />
                    {loading ? "Сохраняем…" : "Сохранить новый пароль"}
                </button>
            </form>

            <Link
                to='/login'
                className='mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-indigo-700'>
                <ArrowLeft className='h-4 w-4' />
                Вернуться ко входу
            </Link>
        </AuthShell>
    );
}

function PasswordField({
    id,
    label,
    value,
    onChange,
    visible,
    onToggle,
    autoComplete,
    invalid = false,
}) {
    return (
        <div>
            <label
                htmlFor={id}
                className='mb-2 block text-sm font-semibold text-slate-700'>
                {label}
            </label>
            <div className='relative'>
                <LockKeyhole className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
                <input
                    id={id}
                    type={visible ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className={`h-12 w-full rounded-xl border bg-white pl-12 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                        invalid
                            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                            : "border-slate-300 focus:border-indigo-500 focus:ring-indigo-100"
                    }`}
                    placeholder='Введите пароль'
                    autoComplete={autoComplete}
                    required
                />
                <button
                    type='button'
                    onClick={onToggle}
                    className='absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700'
                    aria-label={visible ? "Скрыть пароль" : "Показать пароль"}>
                    {visible ? (
                        <EyeOff className='h-5 w-5' />
                    ) : (
                        <Eye className='h-5 w-5' />
                    )}
                </button>
            </div>
        </div>
    );
}
