import React from "react";
import { CheckCircle2, FileSignature, ShieldCheck } from "lucide-react";

const benefits = [
    "Документы и маршруты подписания защищены",
    "Одноразовые ссылки восстановления",
    "Контроль активных пользовательских сессий",
];

export default function AuthShell({ eyebrow, title, description, children }) {
    return (
        <div className='relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 sm:px-6 lg:flex lg:items-center lg:py-12'>
            <div className='pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-indigo-200/60 blur-3xl' />
            <div className='pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-violet-200/50 blur-3xl' />

            <div className='relative mx-auto grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_24px_80px_-32px_rgba(30,41,59,0.35)] lg:grid-cols-[0.9fr_1.1fr]'>
                <aside className='relative hidden min-h-[650px] overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col'>
                    <div className='absolute -right-24 -top-24 h-64 w-64 rounded-full bg-indigo-500/30 blur-2xl' />
                    <div className='absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-violet-500/20 blur-2xl' />

                    <div className='relative flex items-center gap-3'>
                        <span className='flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500 shadow-lg shadow-indigo-950/30'>
                            <FileSignature className='h-6 w-6' />
                        </span>
                        <div>
                            <p className='font-semibold'>Электронная подпись</p>
                            <p className='text-sm text-slate-400'>Документооборот</p>
                        </div>
                    </div>

                    <div className='relative mt-auto mb-auto py-16'>
                        <div className='mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10'>
                            <ShieldCheck className='h-7 w-7 text-indigo-300' />
                        </div>
                        <h2 className='max-w-sm text-3xl font-semibold leading-tight'>
                            Безопасная работа с документами
                        </h2>
                        <p className='mt-4 max-w-sm text-base leading-7 text-slate-400'>
                            Единое пространство для создания, согласования и
                            подписания документов.
                        </p>

                        <ul className='mt-8 space-y-4'>
                            {benefits.map((benefit) => (
                                <li
                                    key={benefit}
                                    className='flex items-start gap-3 text-sm text-slate-300'>
                                    <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-emerald-400' />
                                    <span>{benefit}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className='relative text-xs text-slate-500'>
                        Доступ к системе предназначен для авторизованных
                        пользователей организации.
                    </p>
                </aside>

                <main className='flex min-h-[620px] min-w-0 flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 lg:py-12'>
                    <div className='mb-9 flex items-center gap-3 lg:hidden'>
                        <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white'>
                            <FileSignature className='h-5 w-5' />
                        </span>
                        <div>
                            <p className='text-sm font-semibold text-slate-900'>
                                Электронная подпись
                            </p>
                            <p className='text-xs text-slate-500'>Документооборот</p>
                        </div>
                    </div>

                    <div className='mx-auto min-w-0 w-full max-w-md'>
                        {eyebrow && (
                            <p className='mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600'>
                                {eyebrow}
                            </p>
                        )}
                        <h1 className='text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl'>
                            {title}
                        </h1>
                        <p className='mt-3 text-base leading-7 text-slate-600'>
                            {description}
                        </p>
                        <div className='mt-8'>{children}</div>
                    </div>
                </main>
            </div>
        </div>
    );
}
