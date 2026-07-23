import React, { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Lock, LogIn, User } from "lucide-react";
import { isAuthenticated, login } from "../api/auth";
import AuthShell from "./AuthShell";

const getErrorMessage = (error) =>
    error?.message || "Не удалось войти. Проверьте логин и пароль.";

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    if (isAuthenticated()) return <Navigate to='/documents' replace />;

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setLoading(true);

        try {
            await login(identifier.trim(), password);
            const destination = location.state?.from?.pathname || "/documents";
            navigate(destination, { replace: true });
        } catch (requestError) {
            setError(getErrorMessage(requestError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            eyebrow='Вход в систему'
            title='С возвращением'
            description='Войдите, чтобы продолжить работу с документами и подписями.'>
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
                        htmlFor='identifier'
                        className='mb-2 block text-sm font-semibold text-slate-700'>
                        Логин или email
                    </label>
                    <div className='relative'>
                        <User className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
                        <input
                            id='identifier'
                            type='text'
                            value={identifier}
                            onChange={(event) => setIdentifier(event.target.value)}
                            className='h-13 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                            placeholder='Введите логин или email'
                            autoComplete='username'
                            autoFocus
                            required
                        />
                    </div>
                </div>

                <div>
                    <div className='mb-2 flex items-center justify-between gap-4'>
                        <label
                            htmlFor='password'
                            className='text-sm font-semibold text-slate-700'>
                            Пароль
                        </label>
                        <Link
                            to='/forgot-password'
                            className='text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline'>
                            Забыли пароль?
                        </Link>
                    </div>
                    <div className='relative'>
                        <Lock className='pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400' />
                        <input
                            id='password'
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className='h-13 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-12 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'
                            placeholder='Введите пароль'
                            autoComplete='current-password'
                            required
                        />
                        <button
                            type='button'
                            onClick={() => setShowPassword((visible) => !visible)}
                            className='absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700'
                            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>
                            {showPassword ? (
                                <EyeOff className='h-5 w-5' />
                            ) : (
                                <Eye className='h-5 w-5' />
                            )}
                        </button>
                    </div>
                </div>

                <button
                    type='submit'
                    disabled={loading}
                    className='flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-indigo-300'>
                    <LogIn className='h-5 w-5' />
                    {loading ? "Входим…" : "Войти"}
                </button>
            </form>

            <p className='mt-6 text-center text-xs leading-5 text-slate-500'>
                Не передавайте пароль другим пользователям и сотрудникам
                поддержки.
            </p>
        </AuthShell>
    );
}
