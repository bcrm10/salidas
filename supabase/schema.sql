-- Salidas Mario & Danna — esquema para Supabase.
-- Pégalo completo en Supabase → SQL Editor → Run.

create table if not exists tarjetas (
  id        smallint primary key,
  titular   text not null,
  banco     text not null,
  orden     smallint not null default 0
);

insert into tarjetas (id, titular, banco, orden) values
  (1, 'Danna', 'BancoEstado',   1),
  (2, 'Danna', 'CMR Falabella', 2),
  (3, 'Danna', 'Banco de Chile', 3),
  (4, 'Mario', 'BancoEstado',   4)
on conflict (id) do nothing;

create table if not exists salidas (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  monto       integer not null check (monto > 0),
  lugar       text not null,
  tarjeta_id  smallint not null references tarjetas(id),
  tipo_pago   text not null check (tipo_pago in ('debito', 'credito')),
  nota        text,
  creado_por  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists salidas_fecha_idx on salidas (fecha);

-- Lunes o martes en que ambos pudieron salir: suman $10.000 a esa semana.
create table if not exists dias_activados (
  fecha       date primary key,
  created_at  timestamptz not null default now()
);

-- Transferencias a la cuenta de ahorro bipersonal.
-- periodo = 'AAAA-MM-DD(lunes)|AAAA-MM', el tramo de semana dentro de su mes.
create table if not exists transferencias (
  id          uuid primary key default gen_random_uuid(),
  periodo     text not null,
  monto       integer not null check (monto > 0),
  fecha       date not null default (now() at time zone 'America/Santiago')::date,
  created_at  timestamptz not null default now()
);

-- Lugares propios (Café Aramco, La Italia, sushi…).
create table if not exists lugares (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null unique,
  costo_aprox  integer,
  created_at   timestamptz not null default now()
);

insert into lugares (nombre) values ('Café Aramco'), ('La Italia'), ('Sushi')
on conflict (nombre) do nothing;

-- Ideas de panoramas que guardaron.
create table if not exists panoramas_guardados (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descripcion  text,
  costo_aprox  integer,
  created_at   timestamptz not null default now()
);

-- Seguridad: solo usuarios con sesión (ustedes dos) leen y escriben.
-- Desactiva el registro público en Authentication → Sign In / Providers y crea
-- los dos usuarios a mano en Authentication → Users.
do $$
declare t text;
begin
  foreach t in array array['tarjetas','salidas','dias_activados','transferencias','lugares','panoramas_guardados'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "pareja" on %I', t);
    execute format('create policy "pareja" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Tiempo real: que el celular de uno se actualice cuando el otro registra algo.
alter publication supabase_realtime add table salidas, dias_activados, transferencias, lugares, panoramas_guardados;
