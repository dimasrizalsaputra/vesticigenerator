-- Vestici — Supabase schema (metadata only; photos are NOT stored)
-- Run this once in the Supabase dashboard → SQL Editor → New query → Run.

create table if not exists public.categories (
  id          uuid primary key,
  name        text not null,
  prefix      text not null,
  pad_length  int  not null default 3,
  created_at  timestamptz not null default now()
);

create table if not exists public.products (
  id          uuid primary key,
  category_id uuid not null references public.categories(id) on delete cascade,
  ref_number  int  not null,
  ref_code    text not null,
  title       text not null,
  price       numeric,
  image_count int  default 0,
  created_at  timestamptz not null default now(),
  unique (category_id, ref_number)
);

-- Row Level Security. This is a single-owner app using the public anon key,
-- so anon is granted full access. (Add Supabase Auth later to lock writes down.)
alter table public.categories enable row level security;
alter table public.products   enable row level security;

drop policy if exists "anon all categories" on public.categories;
create policy "anon all categories" on public.categories
  for all to anon using (true) with check (true);

drop policy if exists "anon all products" on public.products;
create policy "anon all products" on public.products
  for all to anon using (true) with check (true);
