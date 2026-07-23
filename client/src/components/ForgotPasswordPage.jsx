import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Mail,
    Send,
} from "lucide-react";
import { requestPasswordReset } from "../api/auth";
import AuthShell from "./AuthShell";

const getErrorMessage = (error) =>
    error?.message || "Не удалось отправить запрос. Попробуйте ещё раз.";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [submittedEmail, setSubmittedEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            const normalizedEmail = email.trim().toLowerCase();
            await requestPasswordReset(normalizedEmail);
            setSubmittedEmail(normalizedEmail);
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setLoading(false);
        }
    };

    if (submittedEmail) {
        return (
            <AuthShell
                eyebrow='Восстановление доступа'
                title='Проверьте почту'
                description='Мы обработали запрос на восстановление пароля.'>
                <div className='rounded-2xl border border-emerald-200 bg-emerald-50 p-5'>
                    <div className='flex items-start gap-4'>
                        <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700'>
                            <CheckCircle2 className='h-6 w-6' />
                        </span>
                        <div>
                            <p className='font-semibold text-emerald-950'>
                                Запрос принят
                            </p>
                            <p className='mt-1 text-sm leading-6 text-emerald-800'>
                                Если аккаунт с адресом {submittedEmail} существует,
                                на него придёт письмо со ссылкой. Проверьте также
                                папку «Спам».
                            </p>
                        </div>
                    </div>
                </div>

                <div className='mt-6 space-y-3'>
                    <Link
                        to='/login'
                        className='flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200'>
                        <ArrowLeft className='h-5 w-5' />
                        Вернуться ко входу
                    </Link>
                    <button
                        type='button'
                        onClick={() => {
                            setSubmittedEmail("");
                            setError("");
                        }}
                        className='h-12 w-full rounded-xl px-5 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900'>
                        Указать другой email
                    </button>
                </div>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            eyebrow='Восстановление доступа'
            title='Забыли пароль?'
            description='Укажите email учётной записи. Мы отправим безопасную одноразовую ссылку для создания нового пароля.'>
            {error && (
                <div
                    role='alert'
                    className='mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>
                    <AlertCircle className='mt-0.5 h-5 w-5 shrink-0' />
                    <span>{error}</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className='space-y-5'>
                <div>
                    <label
                        htmlFor='recovery-email'
                        className='mb-2 block text-sm font-semibold text-slate-700'>
                        Email
                    </label>
                    <div className='relative'>
                        <Mail className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
                        <input
                            id='recovery-email'
                            type='email'
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className='h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                            placeholder='name@company.kz'
                            autoComplete='email'
                            autoFocus
                            required
                        />
                    </div>
                </div>

                <button
                    type='submit'
                    disabled={loading}
                    className='flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-indigo-300'>
                    <Send className='h-5 w-5' />
                    {loading ? "Отправляем…" : "Получить ссылку"}
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
