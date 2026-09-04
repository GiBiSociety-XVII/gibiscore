-- Stoppage time of a live fixture (API-Football status.extra): "90+3".
alter table football.fixtures add column if not exists extra_minute smallint;
