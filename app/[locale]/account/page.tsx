import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {Link} from "@/i18n/navigation";
import {SiteShell} from "@/components/shell/site-shell";
import {PageHeader} from "@/components/football/page-header";
import {Panel} from "@/components/shell/panel";
import {currentUser} from "@/lib/auth/user";
import {signIn, signOut, signUp} from "./actions";

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations('Account');
    return {title: t('metaTitle'), description: t('metaDescription'), robots: {index: false}};
}

const input = "bb-input h-10 px-3 text-[14px] font-semibold w-full";
const label = "text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground";

interface AccountPageProps {
    params: Promise<{locale: string}>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AccountPage({params, searchParams}: AccountPageProps) {
    const {locale} = await params;
    const sp = await searchParams;
    setRequestLocale(locale);
    const t = await getTranslations('Account');
    const user = await currentUser();
    const error = typeof sp.error === 'string' ? sp.error : null;
    const notice = typeof sp.notice === 'string' ? sp.notice : null;
    const tab = sp.tab === 'register' ? 'register' : 'login';
    const next = typeof sp.next === 'string' ? sp.next : `/${locale}/fantacalcio/asta`;
    const errorKeys = ['missing', 'credentials', 'unconfirmed', 'weak', 'exists', 'signup', 'link'] as const;
    const noticeKeys = ['confirm', 'out'] as const;
    const errorText = errorKeys.find((k) => k === error) ? t(`errors.${error as (typeof errorKeys)[number]}`) : null;
    const noticeText = noticeKeys.find((k) => k === notice) ? t(`notices.${notice as (typeof noticeKeys)[number]}`) : null;

    return (
        <SiteShell sidebar={false}>
            <PageHeader title={t('title')} meta={t('intro')} />
            <div className="max-w-md">
                {errorText && <p role="alert" className="bb-surface px-3 py-2 mb-3 text-[13px] font-bold text-red-800 bg-red-50">{errorText}</p>}
                {noticeText && <p role="status" className="bb-surface px-3 py-2 mb-3 text-[13px] font-bold bg-accent/30">{noticeText}</p>}
                {user ? (
                    <Panel title={t('title')}>
                        <div className="px-3 py-3 flex flex-col gap-3">
                            <p className="text-[13px] font-semibold">{t('signedInAs')} <span className="font-extrabold">{user.email}</span></p>
                            <div className="flex flex-wrap items-center gap-2">
                                <Link href="/fantacalcio/asta" className="bb-btn bg-accent h-9 px-3 text-[13px] font-extrabold inline-flex items-center">{t('toAuction')}</Link>
                                <form action={signOut}>
                                    <input type="hidden" name="locale" value={locale} />
                                    <button type="submit" className="bb-btn bg-card h-9 px-3 text-[13px] font-extrabold">{t('signOut')}</button>
                                </form>
                            </div>
                        </div>
                    </Panel>
                ) : (
                    <Panel
                        title={t(`tabs.${tab}`)}
                        action={
                            <Link href={{pathname: '/account', query: {tab: tab === 'login' ? 'register' : 'login', next}}} className="text-[12px] font-extrabold underline decoration-accent decoration-[2px] underline-offset-2">
                                {t(`tabs.${tab === 'login' ? 'register' : 'login'}`)}
                            </Link>
                        }
                    >
                        <form action={tab === 'login' ? signIn : signUp} className="px-3 py-3 flex flex-col gap-3">
                            <input type="hidden" name="locale" value={locale} />
                            <input type="hidden" name="next" value={next} />
                            <label className="flex flex-col gap-1">
                                <span className={label}>{t('email')}</span>
                                <input name="email" type="email" autoComplete="email" required className={input} />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className={label}>{t('password')}</span>
                                <input name="password" type="password" autoComplete={tab === 'login' ? 'current-password' : 'new-password'} required minLength={tab === 'register' ? 8 : 1} className={input} />
                                {tab === 'register' && <span className="text-[11px] font-semibold text-muted-foreground">{t('passwordHint')}</span>}
                            </label>
                            <button type="submit" className="bb-btn bg-accent h-10 px-4 text-[14px] font-extrabold self-start">{t(tab)}</button>
                        </form>
                    </Panel>
                )}
            </div>
        </SiteShell>
    );
}
