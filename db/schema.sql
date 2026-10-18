-- Joke rating app: database schema for Supabase (Postgres).
-- Run once in the Supabase SQL editor. Safe to re-run: functions are replaced,
-- tables are only created if missing.
--
-- Security model: the browser uses the public (anon/publishable) key. Tables
-- have row-level security enabled with NO policies, so the public key cannot
-- read or write them directly. All access goes through the SECURITY DEFINER
-- functions below, which validate input and never expose annotator ids or
-- joke sources.

create table if not exists jokes (
  id             bigint generated always as identity primary key,
  text           text not null check (char_length(text) between 5 and 500),
  source         text not null default 'submitted'
                 check (source in ('curated', 'submitted', 'model')),
  model          text,          -- model name, for source = 'model'
  prompt_version text,          -- prompt file/version, for source = 'model'
  decoding       jsonb,         -- decoding settings (temperature, ...)
  topic          text,
  language       text not null default 'en',
  submitted_by   uuid,          -- anonymous annotator id of the submitter
  hidden         boolean not null default false,  -- flip to remove junk
  created_at     timestamptz not null default now()
);

create table if not exists ratings (
  id            bigint generated always as identity primary key,
  joke_id       bigint not null references jokes(id) on delete cascade,
  annotator_id  uuid not null,
  score         smallint check (score between 1 and 5),  -- null = skipped
  scale_version text not null default 'funny-1to5-v1',
  created_at    timestamptz not null default now(),
  unique (joke_id, annotator_id)
);

create index if not exists ratings_annotator_idx on ratings (annotator_id);
create index if not exists jokes_submitted_by_idx on jokes (submitted_by);

alter table jokes   enable row level security;
alter table ratings enable row level security;


-- Next joke for an annotator. Candidates: visible jokes this annotator has not
-- rated or skipped, and did not submit. Selection:
--   1. Cold start: jokes with fewer than 3 (non-skip) ratings come first,
--      fewest ratings first, random among ties.
--   2. Otherwise, a random joke weighted by avg_score^2 (avg 5 is ~25x as
--      likely as avg 1), using weighted sampling keys -ln(U) / weight.
--   3. Exploration: 20% of the time the weights are ignored (uniform pick).
-- Changing these constants changes which jokes collect ratings; note it when
-- analysing results.
create or replace function next_joke(p_annotator uuid)
returns table (id bigint, text text)
language sql
volatile
security definer
set search_path = public
as $$
  with candidates as (
    select j.id, j.text, count(r.score) as n, avg(r.score)::float8 as avg_score
    from jokes j
    left join ratings r on r.joke_id = j.id
    where not j.hidden
      and j.submitted_by is distinct from p_annotator
      and not exists (
        select 1 from ratings mine
        where mine.joke_id = j.id and mine.annotator_id = p_annotator
      )
    group by j.id
  ),
  draw as (
    select random() < 0.2 as explore  -- evaluated once per call
  )
  select c.id, c.text
  from candidates c, draw d
  order by
    c.n >= 3,                                   -- cold-start jokes first
    case when c.n < 3 then c.n else 0 end,      -- among them, fewest ratings first
    case when c.n < 3 or d.explore then random()
         else -ln(1 - random()) / (c.avg_score ^ 2)
    end
  limit 1;
$$;


-- Record a rating (1-5) or a skip (null). Returns the joke's stats afterwards,
-- for the "others gave this ..." reveal.
create or replace function rate_joke(p_annotator uuid, p_joke bigint, p_score smallint)
returns table (n_ratings bigint, avg_score numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_score is not null and (p_score < 1 or p_score > 5) then
    raise exception 'score must be between 1 and 5, or null for skip';
  end if;
  if not exists (select 1 from jokes where jokes.id = p_joke and not hidden) then
    raise exception 'unknown joke';
  end if;

  insert into ratings (joke_id, annotator_id, score)
  values (p_joke, p_annotator, p_score)
  on conflict (joke_id, annotator_id) do nothing;

  return query
    select count(r.score), round(avg(r.score), 2)
    from ratings r
    where r.joke_id = p_joke;
end;
$$;


-- Submit a new joke. It goes live immediately. Light abuse limits: max 20
-- submissions per annotator per day, no exact duplicates.
create or replace function submit_joke(p_annotator uuid, p_text text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := btrim(p_text);
  new_id bigint;
begin
  if char_length(t) < 5 or char_length(t) > 500 then
    raise exception 'joke must be 5-500 characters';
  end if;
  if (select count(*) from jokes
      where submitted_by = p_annotator
        and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many submissions today';
  end if;
  if exists (select 1 from jokes where lower(jokes.text) = lower(t)) then
    raise exception 'this joke is already in the collection';
  end if;

  insert into jokes (text, source, submitted_by)
  values (t, 'submitted', p_annotator)
  returning id into new_id;
  return new_id;
end;
$$;


-- Public stats: visible jokes, least-rated first. Source is deliberately not
-- exposed, so annotators stay blind to who (or what) wrote a joke.
create or replace function joke_stats()
returns table (id bigint, text text, n_ratings bigint, n_skips bigint, avg_score numeric)
language sql
security definer
set search_path = public
as $$
  select j.id, j.text,
         count(r.score),
         count(r.id) - count(r.score),
         round(avg(r.score), 2)
  from jokes j
  left join ratings r on r.joke_id = j.id
  where not j.hidden
  group by j.id
  order by count(r.score), j.id;
$$;


revoke all on function next_joke(uuid)                 from public;
revoke all on function rate_joke(uuid, bigint, smallint) from public;
revoke all on function submit_joke(uuid, text)         from public;
revoke all on function joke_stats()                    from public;
grant execute on function next_joke(uuid)                 to anon, authenticated;
grant execute on function rate_joke(uuid, bigint, smallint) to anon, authenticated;
grant execute on function submit_joke(uuid, text)         to anon, authenticated;
grant execute on function joke_stats()                    to anon, authenticated;
