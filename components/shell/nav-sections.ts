'use client';

import {useTranslations} from "next-intl";
import type {MegaMenuColumn} from "./nav-mega-menu";

function romeDay(offset: number): string {
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Rome'}).format(new Date(Date.now() + offset * 86_400_000));
}

/** The columns of the site's sections, shared by the desktop mega menus and the phone menu. */
export function useNavColumns(): {scoresColumns: MegaMenuColumn[]; competitionColumns: MegaMenuColumn[]; statsColumns: MegaMenuColumn[]} {
    const m = useTranslations("AppBar.menus");
    const scoresColumns: MegaMenuColumn[] = [
        {
            title: m('scores.matchesTitle'),
            items: [
                {label: m('scores.today'), href: '/'},
                {label: m('scores.live'), href: '/live'},
                {label: m('scores.yesterday'), href: `/scores/${romeDay(-1)}`},
                {label: m('scores.tomorrow'), href: `/scores/${romeDay(1)}`},
            ],
        },
        {
            title: m('scores.toolsTitle'),
            items: [
                {label: m('scores.search'), href: '/search', hint: m('scores.searchHint')},
                {label: m('scores.favorites'), href: '/', hint: m('scores.favoritesHint')},
            ],
        },
    ];
    const competitionColumns: MegaMenuColumn[] = [
        {
            title: m('competitions.italyTitle'),
            items: [
                {label: 'Serie A', href: '/competitions/serie-a'},
                {label: 'Serie B', href: '/competitions/serie-b'},
                {label: 'Coppa Italia', href: '/competitions/coppa-italia'},
            ],
        },
        {
            title: m('competitions.europeTitle'),
            items: [
                {label: 'Champions League', href: '/competitions/champions-league'},
                {label: 'Europa League', href: '/competitions/europa-league'},
                {label: 'Conference League', href: '/competitions/conference-league'},
            ],
        },
        {
            title: m('competitions.topTitle'),
            items: [
                {label: 'Premier League', href: '/competitions/premier-league'},
                {label: 'La Liga', href: '/competitions/la-liga'},
                {label: 'Bundesliga', href: '/competitions/bundesliga'},
                {label: 'Ligue 1', href: '/competitions/ligue-1'},
            ],
        },
    ];
    const statsColumns: MegaMenuColumn[] = [
        {
            title: m('stats.playersTitle'),
            items: [
                {label: m('stats.scorers'), href: '/stats'},
                {label: m('stats.assists'), href: '/stats'},
                {label: m('stats.compare'), href: '/compare', hint: m('stats.compareHint')},
            ],
        },
        {
            title: m('stats.squadsTitle'),
            items: [
                {label: m('stats.injuries'), href: '/injuries', hint: m('stats.injuriesHint')},
                {label: m('stats.teamStats'), href: '/search', hint: m('stats.teamStatsHint')},
            ],
        },
    ];
    return {scoresColumns, competitionColumns, statsColumns};
}
