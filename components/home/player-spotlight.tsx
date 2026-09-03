import Image from "next/image";
import {useTranslations} from "next-intl";
import {Card} from "@/components/shared/ui/card";
import type {PlayerSpotlight as PlayerSpotlightData} from "@/lib/football/types";

function Stat({value, label}: {value: string | number; label: string}) {
    return (
        <div className="border-2 border-foreground rounded-xl p-2.5 flex flex-col gap-0.5 bg-background">
            <span className="font-mono text-[22px] font-bold leading-none tabular-nums">{value}</span>
            <span className="text-xs font-bold text-muted-foreground">{label}</span>
        </div>
    );
}

export function PlayerSpotlight({player}: {player: PlayerSpotlightData}) {
    const t = useTranslations('HomePage.spotlight');

    return (
        <Card press className="p-4 flex flex-col gap-3">
            <h2 className="text-lg font-extrabold tracking-tight">{t('title')}</h2>
            <div className="flex items-center gap-4">
                <span className="flex w-12 h-12 rounded-xl border-[2.5px] border-foreground bg-muted overflow-hidden shrink-0">
                    {player.imageUrl && (
                        <Image src={player.imageUrl} alt={player.name} width={48} height={48} className="object-cover" />
                    )}
                </span>
                <div className="flex flex-col gap-1 min-w-0">
                    <span className="text-base font-extrabold truncate">{player.name}</span>
                    <span className="text-sm font-semibold text-muted-foreground">
                        {player.position} · {player.teamName}{player.age !== null ? ` · ${t('age', {age: player.age})}` : ''}
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <Stat value={player.goals} label={t('goals')} />
                <Stat value={player.assists} label={t('assists')} />
                <Stat value={player.rating !== null ? player.rating.toFixed(1) : '–'} label={t('rating')} />
            </div>
        </Card>
    );
}
