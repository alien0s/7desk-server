-- Usuários
create table if not exists users (
  id            serial primary key,
  name          text        not null,
  email         text        not null unique,
  password_hash text        not null,
  role          text        not null check (role in ('CLIENTE','AGENTE','ADMIN')),
  avatar_url    text,
  created_at    timestamptz not null default now()
);

-- Tickets
create table if not exists tickets (
  id            serial primary key,
  title         text        not null,
  description   text        not null,
  status        text        not null default 'ABERTO' check (status in ('ABERTO','PENDENTE','RESOLVIDO','FECHADO')),
  priority      text        not null default 'MÉDIA'  check (priority in ('BAIXA','MÉDIA','ALTA')),
  requester_id  int         not null references users(id) on delete restrict,
  assignee_id   int                  references users(id) on delete set null,
  associacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function trg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists set_updated_at on tickets;
create trigger set_updated_at before update on tickets
for each row execute function trg_set_updated_at();

-- Comentários
create table if not exists comments (
  id         serial primary key,
  ticket_id  int  not null references tickets(id) on delete cascade,
  author_id  int  not null references users(id) on delete restrict,
  body       text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tickets_requester on tickets (requester_id);
create index if not exists idx_tickets_status on tickets (status);
create index if not exists idx_comments_ticket on comments (ticket_id);
