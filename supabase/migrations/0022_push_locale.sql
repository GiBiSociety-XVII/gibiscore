-- The language of the browser that subscribed: its notifications are written in it.
alter table public.push_subscriptions
    add column if not exists locale text not null default 'it';
