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


-- Light gamification. Skips never count. Annotator ids are never returned:
-- people appear under a name derived from their id (the id itself acts as a
-- password, so it must stay in the browser).
create or replace function annotator_name(p uuid)
returns text
language sql
immutable
set search_path = public
as $$
  with words as (
    select array['Giggling','Chuckling','Snickering','Grinning','Witty','Cheeky',
                 'Jolly','Sassy','Silly','Punny','Quirky','Zany','Merry','Smirking',
                 'Wacky','Goofy','Dapper','Sneaky','Bouncy','Sleepy','Grumpy','Fuzzy',
                 'Plucky','Nimble'] as adj,
           array['Otter','Panda','Llama','Penguin','Badger','Walrus','Hedgehog','Moose',
                 'Lemur','Ferret','Platypus','Capybara','Raccoon','Narwhal','Wombat',
                 'Alpaca','Gecko','Puffin','Sloth','Koala','Beaver','Owl','Yak','Quokka'] as animal
  ), h as (
    select decode(md5(p::text), 'hex') as b
  )
  select adj[1 + get_byte(b, 0) % array_length(adj, 1)] || ' '
      || animal[1 + get_byte(b, 1) % array_length(animal, 1)]
  from words, h;
$$;


-- Optional self-chosen nicknames. Delete a row (Table Editor) to remove a rude
-- one: that person falls back to their generated name.
create table if not exists nicknames (
  annotator_id uuid primary key,
  nickname     text not null check (char_length(nickname) between 2 and 24),
  updated_at   timestamptz not null default now()
);
create unique index if not exists nicknames_lower_idx on nicknames (lower(nickname));
alter table nicknames enable row level security;

create or replace function display_name(p uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce((select nickname from nicknames where annotator_id = p), annotator_name(p));
$$;

-- Set a nickname; an empty name goes back to the generated one. Returns the
-- name now shown.
create or replace function set_nickname(p_annotator uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if t = '' then
    delete from nicknames where annotator_id = p_annotator;
    return annotator_name(p_annotator);
  end if;
  if char_length(t) < 2 or char_length(t) > 24 then
    raise exception 'nickname must be 2-24 characters';
  end if;
  if t ~ '[[:cntrl:]]' then
    raise exception 'nickname contains invalid characters';
  end if;
  if exists (select 1 from nicknames
             where lower(nickname) = lower(t) and annotator_id <> p_annotator) then
    raise exception 'that nickname is taken';
  end if;
  insert into nicknames (annotator_id, nickname) values (p_annotator, t)
  on conflict (annotator_id) do update set nickname = excluded.nickname, updated_at = now();
  return t;
end;
$$;


-- The annotator's own numbers: name, jokes rated, and ratings received by
-- the jokes they submitted (for "your jokes got new ratings" notices).
create or replace function my_progress(p_annotator uuid)
returns table (name text, n_rated bigint, my_joke_ratings bigint, my_joke_avg numeric)
language sql
stable
security definer
set search_path = public
as $$
  select display_name(p_annotator),
         (select count(score) from ratings where annotator_id = p_annotator),
         count(r.score),
         round(avg(r.score), 2)
  from jokes j
  left join ratings r on r.joke_id = j.id
  where j.submitted_by = p_annotator and not j.hidden;
$$;


-- Jokes the annotator submitted, best first.
create or replace function my_jokes(p_annotator uuid)
returns table (id bigint, text text, n_ratings bigint, avg_score numeric)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.text, count(r.score), round(avg(r.score), 2)
  from jokes j
  left join ratings r on r.joke_id = j.id
  where j.submitted_by = p_annotator and not j.hidden
  group by j.id
  order by 4 desc nulls last, 3 desc, j.id desc;
$$;


-- Leaderboards: top 10 of each board, plus the caller's own row if outside.
--   raters:    most jokes rated.
--   comedians: submitters with at least 2 rated jokes, ranked by average
--              score smoothed toward the global mean (as if 3 extra ratings
--              at the global mean), so a few lucky ratings don't win.
create or replace function leaderboards(p_annotator uuid)
returns table (board text, rank bigint, name text, avg_score numeric,
               n_ratings bigint, n_jokes bigint, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  with raters as (
    select annotator_id as who, count(score) as n,
           rank() over (order by count(score) desc) as rk
    from ratings
    group by annotator_id
    having count(score) > 0
  ),
  global as (
    select avg(score)::numeric as c from ratings
  ),
  authors as (
    select j.submitted_by as who, count(distinct j.id) as n_jokes,
           count(r.score) as n, sum(r.score)::numeric as total
    from jokes j
    join ratings r on r.joke_id = j.id and r.score is not null
    where not j.hidden and j.submitted_by is not null
    group by j.submitted_by
    having count(distinct j.id) >= 2
  ),
  comedians as (
    select a.who, a.n_jokes, a.n, round(a.total / a.n, 2) as avg_score,
           rank() over (order by (a.total + 3 * g.c) / (a.n + 3) desc, a.n desc) as rk
    from authors a, global g
  )
  select 'raters'::text, rk, display_name(who), null::numeric, n, null::bigint, who = p_annotator
  from raters where rk <= 10 or who = p_annotator
  union all
  select 'comedians'::text, rk, display_name(who), avg_score, n, n_jokes, who = p_annotator
  from comedians where rk <= 10 or who = p_annotator
  order by 1, 2;
$$;


revoke all on function annotator_name(uuid)            from public;
revoke all on function display_name(uuid)              from public;
revoke all on function set_nickname(uuid, text)        from public;
revoke all on function my_progress(uuid)               from public;
revoke all on function my_jokes(uuid)                  from public;
revoke all on function leaderboards(uuid)              from public;
grant execute on function set_nickname(uuid, text)     to anon, authenticated;
grant execute on function my_progress(uuid)            to anon, authenticated;
grant execute on function my_jokes(uuid)               to anon, authenticated;
grant execute on function leaderboards(uuid)           to anon, authenticated;

revoke all on function next_joke(uuid)                 from public;
revoke all on function rate_joke(uuid, bigint, smallint) from public;
revoke all on function submit_joke(uuid, text)         from public;
revoke all on function joke_stats()                    from public;
grant execute on function next_joke(uuid)                 to anon, authenticated;
grant execute on function rate_joke(uuid, bigint, smallint) to anon, authenticated;
grant execute on function submit_joke(uuid, text)         to anon, authenticated;
grant execute on function joke_stats()                    to anon, authenticated;
