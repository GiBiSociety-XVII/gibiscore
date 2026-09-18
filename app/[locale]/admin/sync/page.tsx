import type {Metadata} from "next";
import {getFormatter, getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {cn} from "@/components/shared/ui/cn";
import {SiteShell, Panel} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {AdminGate} from "@/components/admin/admin-gate";
import {isAdminId} from "@/lib/admin";
import {currentUser} from "@/lib/auth/user";
import {createServiceClient} from "@/lib/db/server";

// The administrator's page only: read on request, never cached, never indexed.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {robots: {index: false, follow: false}};

interface Run {
    id: number;
    job: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    requests_used: number | null;
    details: {counters?: Record<string, number>; warnings?: string[]; error?: string | null} | null;
}

interface JobRow {
    job: string;
    last: Run;
    runs24h: number;
    errors24h: number;
    requests24h: number;
    /** No run for more than a day: the job is stopped or its cron is gone. */
    stale: boolean;
}

interface ErrorRow {
    id: number;
    at: string;
    source: string;
    message: string;
    digest: string | null;
    path: string | null;
    locale: string | null;
    hits: number;
}

/** The last run of every job, with the day's tally, the API quota as the jobs last saw it, and what broke while serving pages. */
async function loadDashboard(): Promise<{jobs: JobRow[]; quota: {dayRemaining: number | null; dayLimit: number | null; readAt: number} | null; requestsToday: number; errors: ErrorRow[]; errorsToday: number}> {
    const db = createServiceClient();
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const [{data: recent}, {data: quotaRow}, {data: errorRows}] = await Promise.all([
        db.from('sync_runs').select('id,job,started_at,finished_at,status,requests_used,details').gte('started_at', since).order('started_at', {ascending: false}).limit(5000),
        db.from('sync_state').select('value').eq('key', 'api_football_quota').maybeSingle(),
        db.from('error_log').select('id,at,source,message,digest,path,locale,hits').order('at', {ascending: false}).limit(40),
    ]);
    const runs = (recent ?? []) as unknown as Run[];
    const byJob = new Map<string, JobRow>();
    for (const r of runs) {
        const row = byJob.get(r.job) ?? {job: r.job, last: r, runs24h: 0, errors24h: 0, requests24h: 0, stale: false};
        row.runs24h += 1;
        if (r.status === 'error') row.errors24h += 1;
        row.requests24h += r.requests_used ?? 0;
        byJob.set(r.job, row);
    }
    // Jobs silent for a day still show their last run.
    const {data: older} = await db.from('sync_runs').select('id,job,started_at,finished_at,status,requests_used,details').lt('started_at', since).order('started_at', {ascending: false}).limit(400);
    for (const r of (older ?? []) as unknown as Run[]) if (!byJob.has(r.job)) byJob.set(r.job, {job: r.job, last: r, runs24h: 0, errors24h: 0, requests24h: 0, stale: Date.now() - Date.parse(r.started_at) > 26 * 3_600_000});
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const requestsToday = runs.filter((r) => r.started_at >= dayStart.toISOString()).reduce((s, r) => s + (r.requests_used ?? 0), 0);
    const errors = (errorRows ?? []) as unknown as ErrorRow[];
    return {
        jobs: [...byJob.values()].sort((a, b) => a.job.localeCompare(b.job)),
        quota: (quotaRow?.value as {dayRemaining: number | null; dayLimit: number | null; readAt: number} | null) ?? null,
        requestsToday,
        errors,
        errorsToday: errors.filter((e) => e.at >= since).reduce((s, e) => s + e.hits, 0),
    };
}

export default async function AdminSyncPage({params}: PageProps<"/[locale]/admin/sync">) {
    const {locale} = await params;
    setRequestLocale(locale);
    const t = await getTranslations('Admin.sync');
    const format = await getFormatter();
    const user = await currentUser();
    const admin = isAdminId(user?.id);
    const data = admin ? await loadDashboard() : null;
    const ms = (r: Run) => (r.finished_at ? Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000) : null);
    const cell = "px-2 py-1.5 whitespace-nowrap";
    return (
        <SiteShell wide sidebar={false}>
            <AdminGate>
                <PageHeader title={t('title')} meta={t('intro')} aside={<Link href="/admin" className="bb-btn bg-card px-3 h-8 inline-flex items-center text-[12px] font-extrabold">{t('toAdmin')}</Link>} />
                {data && (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {[
                                [t('requestsToday'), String(data.requestsToday)],
                                [t('quotaLeft'), data.quota?.dayRemaining !== null && data.quota?.dayRemaining !== undefined ? `${data.quota.dayRemaining} / ${data.quota.dayLimit ?? '?'}` : '–'],
                                [t('quotaRead'), data.quota ? format.dateTime(new Date(data.quota.readAt), {hour: '2-digit', minute: '2-digit'}) : '–'],
                                [t('errors24h'), String(data.jobs.reduce((s, j) => s + j.errors24h, 0))],
                                [t('siteErrors24h'), String(data.errorsToday)],
                            ].map(([label, value]) => (
                                <div key={label} className="bb-surface px-3 py-2 flex flex-col">
                                    <span className="font-mono text-lg font-extrabold tabular-nums">{value}</span>
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
                                </div>
                            ))}
                        </div>
                        <Panel title={t('jobs')}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-[12px]">
                                    <thead>
                                        <tr className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                            <th className={cn(cell, "text-left")}>{t('job')}</th>
                                            <th className={cn(cell, "text-left")}>{t('lastRun')}</th>
                                            <th className={cn(cell, "text-left")}>{t('status')}</th>
                                            <th className={cn(cell, "text-right")}>{t('seconds')}</th>
                                            <th className={cn(cell, "text-right")}>{t('requests')}</th>
                                            <th className={cn(cell, "text-right")}>{t('runs24h')}</th>
                                            <th className={cn(cell, "text-right")}>{t('errors24h')}</th>
                                            <th className={cn(cell, "text-right")}>{t('requests24h')}</th>
                                            <th className={cn(cell, "text-left")}>{t('counters')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.jobs.map((j) => {
                                            const counters = Object.entries(j.last.details?.counters ?? {}).filter(([, v]) => v > 0);
                                            const warnings = j.last.details?.warnings ?? [];
                                            return (
                                                <tr key={j.job} className={cn("border-t border-muted align-top", j.last.status === 'error' && "bg-red-50", j.stale && "text-muted-foreground")}>
                                                    <td className={cn(cell, "font-extrabold font-mono")}>{j.job}</td>
                                                    <td className={cell}>{format.dateTime(new Date(j.last.started_at), {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</td>
                                                    <td className={cell}>
                                                        <span className={cn("inline-flex items-center h-5 px-1.5 rounded border-2 text-[10px] font-extrabold uppercase", j.last.status === 'ok' ? "border-emerald-700 text-emerald-700" : j.last.status === 'error' ? "border-red-700 text-red-700" : "border-foreground/40")}>{j.last.status}</span>
                                                    </td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums")}>{ms(j.last) ?? '–'}</td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums")}>{j.last.requests_used ?? 0}</td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums")}>{j.runs24h}</td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums", j.errors24h > 0 && "text-red-700 font-extrabold")}>{j.errors24h}</td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums")}>{j.requests24h}</td>
                                                    <td className="px-2 py-1.5 whitespace-normal">
                                                        <span className="font-mono text-[11px] text-muted-foreground">{counters.map(([k, v]) => `${k} ${v}`).join(' · ') || '–'}</span>
                                                        {j.last.details?.error && <span className="block text-[11px] font-semibold text-red-700 break-words">{j.last.details.error}</span>}
                                                        {warnings.length > 0 && <span className="block text-[11px] font-semibold text-amber-800 break-words">{warnings.slice(0, 3).join(' · ')}{warnings.length > 3 ? ` (+${warnings.length - 3})` : ''}</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                        <Panel title={t('errorsTitle')} action={<span className="text-[11px] font-semibold text-muted-foreground">{t('errorsHint')}</span>}>
                            {data.errors.length === 0 ? (
                                <p className="px-3 py-3 text-[13px] font-semibold text-muted-foreground">{t('errorsEmpty')}</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[12px]">
                                        <thead>
                                            <tr className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground border-b border-muted">
                                                <th className={cn(cell, "text-left")}>{t('errorWhen')}</th>
                                                <th className={cn(cell, "text-left")}>{t('errorSource')}</th>
                                                <th className={cn(cell, "text-right")}>{t('errorHits')}</th>
                                                <th className={cn(cell, "text-left")}>{t('errorPath')}</th>
                                                <th className="px-2 py-1.5 text-left">{t('errorMessage')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.errors.map((e) => (
                                                <tr key={e.id} className="border-t border-muted align-top">
                                                    <td className={cn(cell, "font-mono tabular-nums")}>{format.dateTime(new Date(e.at), {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}</td>
                                                    <td className={cell}><span className="inline-flex items-center h-5 px-1.5 rounded border-2 border-foreground/40 text-[10px] font-extrabold uppercase">{e.source}</span></td>
                                                    <td className={cn(cell, "text-right font-mono tabular-nums", e.hits > 1 && "font-extrabold")}>{e.hits}</td>
                                                    <td className={cn(cell, "font-mono text-[11px] text-muted-foreground")}>{e.path ?? '–'}{e.locale ? ` · ${e.locale}` : ''}</td>
                                                    <td className="px-2 py-1.5 whitespace-normal break-words font-semibold text-red-700">{e.message}{e.digest ? <span className="ml-1 font-mono text-[10px] text-muted-foreground">#{e.digest}</span> : null}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>
                    </>
                )}
            </AdminGate>
        </SiteShell>
    );
}
