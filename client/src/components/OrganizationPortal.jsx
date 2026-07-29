import React from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowRight,
    Building2,
    Clock3,
    Database,
    FileSignature,
    LockKeyhole,
    ShieldCheck,
} from "lucide-react";
import {
    getOrganizationTheme,
    isOrganizationAvailable,
    organizations,
    setActiveOrganization,
} from "../config/organizations";

const statusLabels = {
    active: "Доступен",
    planned: "Скоро",
    maintenance: "Технические работы",
};

const OrganizationCard = ({ organization, onSelect }) => {
    const theme = getOrganizationTheme(organization);
    const isAvailable = isOrganizationAvailable(organization);
    const Icon = isAvailable ? Building2 : Clock3;

    const content = (
        <>
            <div className='flex items-start justify-between gap-4'>
                <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${theme.icon}`}>
                    <Icon className='h-6 w-6' />
                </span>
                <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
                        isAvailable
                            ? theme.badge
                            : "bg-slate-100 text-slate-500 ring-slate-200"
                    }`}>
                    {statusLabels[organization.status] || statusLabels.planned}
                </span>
            </div>

            <div className='mt-6'>
                <p className='text-xs font-semibold uppercase tracking-[0.16em] text-slate-400'>
                    Рабочий контур
                </p>
                <h2 className='mt-2 text-xl font-bold tracking-tight text-slate-950'>
                    {organization.shortName}
                </h2>
                <p className='mt-1 text-sm font-medium text-slate-600'>
                    {organization.name}
                </p>
                <p className='mt-4 min-h-12 text-sm leading-6 text-slate-500'>
                    {organization.description}
                </p>
            </div>

            <div className='mt-6 flex items-center justify-between border-t border-slate-100 pt-5'>
                <span className='flex items-center gap-2 text-xs font-medium text-slate-500'>
                    <Database className='h-4 w-4' />
                    Отдельная база данных
                </span>
                {isAvailable && (
                    <ArrowRight className='h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1' />
                )}
            </div>
        </>
    );

    const className = `group block rounded-3xl border bg-white p-6 text-left shadow-sm transition duration-200 ${
        isAvailable
            ? `cursor-pointer border-slate-200 hover:-translate-y-1 hover:shadow-xl ${theme.border}`
            : "cursor-not-allowed border-slate-200 opacity-75"
    }`;

    return isAvailable ? (
        <button
            type='button'
            className={className}
            onClick={() => onSelect(organization.code)}>
            {content}
        </button>
    ) : (
        <div className={className} aria-disabled='true'>
            {content}
        </div>
    );
};

export default function OrganizationPortal() {
    const navigate = useNavigate();

    const handleSelect = (organizationCode) => {
        setActiveOrganization(organizationCode);
        navigate(`/login?organization=${encodeURIComponent(organizationCode)}`);
    };

    return (
        <div className='relative min-h-screen overflow-hidden bg-slate-50 px-4 py-10 sm:px-6 lg:px-8 lg:py-16'>
            <div className='pointer-events-none absolute left-0 top-0 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-200/50 blur-3xl' />
            <div className='pointer-events-none absolute bottom-0 right-0 h-96 w-96 translate-x-1/3 translate-y-1/3 rounded-full bg-emerald-200/40 blur-3xl' />

            <main className='relative mx-auto max-w-6xl'>
                <header className='mx-auto max-w-3xl text-center'>
                    <span className='mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-300'>
                        <FileSignature className='h-8 w-8' />
                    </span>
                    <p className='mt-7 text-xs font-bold uppercase tracking-[0.2em] text-indigo-600'>
                        MedSign · Электронный документооборот
                    </p>
                    <h1 className='mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl'>
                        Выберите организацию
                    </h1>
                    <p className='mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg'>
                        Каждая компания работает в собственном защищённом контуре.
                        Документы, пользователи и история подписания организаций не
                        смешиваются.
                    </p>
                </header>

                <section
                    className='mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3'
                    aria-label='Организации'>
                    {organizations.map((organization) => (
                        <OrganizationCard
                            key={organization.code}
                            organization={organization}
                            onSelect={handleSelect}
                        />
                    ))}
                </section>

                <section className='mt-10 grid gap-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur sm:grid-cols-3 sm:p-8'>
                    <div className='flex items-start gap-3'>
                        <Database className='mt-0.5 h-5 w-5 shrink-0 text-indigo-600' />
                        <div>
                            <h2 className='text-sm font-semibold text-slate-900'>
                                Изоляция данных
                            </h2>
                            <p className='mt-1 text-xs leading-5 text-slate-500'>
                                Отдельные базы и файловые хранилища.
                            </p>
                        </div>
                    </div>
                    <div className='flex items-start gap-3'>
                        <ShieldCheck className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600' />
                        <div>
                            <h2 className='text-sm font-semibold text-slate-900'>
                                Независимый аудит
                            </h2>
                            <p className='mt-1 text-xs leading-5 text-slate-500'>
                                Собственные пользователи, роли и журналы.
                            </p>
                        </div>
                    </div>
                    <div className='flex items-start gap-3'>
                        <LockKeyhole className='mt-0.5 h-5 w-5 shrink-0 text-amber-600' />
                        <div>
                            <h2 className='text-sm font-semibold text-slate-900'>
                                Безопасный выбор
                            </h2>
                            <p className='mt-1 text-xs leading-5 text-slate-500'>
                                Перед входом всегда видна организация.
                            </p>
                        </div>
                    </div>
                </section>

                <p className='mt-8 text-center text-xs leading-5 text-slate-400'>
                    Вход разрешён только пользователям выбранной организации.
                </p>
            </main>
        </div>
    );
}
