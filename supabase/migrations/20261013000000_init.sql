-- ---------------------------------------------------------------------------
-- Lanchonete Martinica — esquema do banco (Supabase / Postgres)
--
-- Regras que mexem em mais de uma tabela (venda, cancelamento, compra,
-- despesa parcelada, ficha técnica) rodam em funções do próprio banco, numa
-- transação só. Assim dois caixas vendendo ao mesmo tempo nunca deixam o
-- estoque, o custo médio ou as contas a pagar pela metade.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------- perfis ---

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  username text not null unique,
  role text not null default 'pdv' check (role in ('admin', 'pdv')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Perfil do usuário logado (somente se ativo). As demais funções e as
-- políticas de acesso partem daqui.
create function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role_name() is not null
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_name() = 'admin', false)
$$;

-- Todo usuário criado no Auth ganha um perfil. O PRIMEIRO usuário do sistema
-- vira administrador ativo. Os seguintes nascem INATIVOS, como operador de
-- PDV: quem os ativa é a Edge Function `manage-users`, chamada pelo
-- administrador. Assim, mesmo que o cadastro público do Auth fique ligado por
-- engano, uma conta criada por fora não enxerga nada.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first boolean := not exists (select 1 from public.profiles);
  v_username text := lower(coalesce(
    nullif(new.raw_user_meta_data ->> 'username', ''),
    split_part(new.email, '@', 1)
  ));
begin
  -- Nome de usuário repetido (ex.: mesmo prefixo de e-mail) ganha sufixo.
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '-' || left(new.id::text, 4);
  end if;

  insert into public.profiles (id, name, username, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), v_username),
    v_username,
    case when v_first then 'admin' else 'pdv' end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------ cadastro e estoque ---

create table public.ingredients (
  id text primary key,
  name text not null,
  unit text not null check (unit in ('kg', 'l', 'un')),
  stock numeric(14, 3) not null default 0 check (stock >= 0),
  min_stock numeric(14, 3) not null default 0 check (min_stock >= 0),
  avg_cost numeric(14, 4) not null default 0 check (avg_cost >= 0),
  created_at timestamptz not null default now()
);

create table public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  category text not null
    check (category in ('lanches', 'porcoes', 'bebidas', 'sobremesas', 'combos')),
  price numeric(12, 2) not null check (price >= 0),
  kind text not null default 'snack',
  image text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ficha técnica: quanto de cada insumo sai a cada porção vendida.
create table public.recipe_items (
  product_id text not null references public.products (id) on delete cascade,
  ingredient_id text not null references public.ingredients (id) on delete cascade,
  qty numeric(14, 4) not null check (qty > 0),
  primary key (product_id, ingredient_id)
);

create index recipe_items_ingredient_idx on public.recipe_items (ingredient_id);

-- -------------------------------------------------------------- pedidos ---

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  channel text not null check (channel in ('balcao', 'mesa', 'entrega')),
  customer text,
  table_label text,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  payment text not null
    check (payment in ('dinheiro', 'pix', 'credito', 'debito', 'vale', 'prazo')),
  cash_received numeric(12, 2),
  change numeric(12, 2),
  status text not null default 'fila'
    check (status in ('fila', 'preparo', 'pronto', 'entregue', 'cancelado')),
  operator text not null,
  operator_id uuid references public.profiles (id) on delete set null,
  delivered_at timestamptz,
  canceled_at timestamptz
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  -- O produto pode ser excluído depois; o nome e os valores ficam no pedido.
  product_id text references public.products (id) on delete set null,
  name text not null,
  qty integer not null check (qty > 0),
  unit_price numeric(12, 2) not null,
  -- Custo dos insumos no momento da venda (CMV do financeiro).
  unit_cost numeric(14, 4) not null default 0,
  notes text
);

create index order_items_order_idx on public.order_items (order_id);

-- --------------------------------------------------------------- compras ---

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  supplier text not null,
  invoice text,
  total numeric(12, 2) not null default 0,
  payment text not null,
  due_date date not null,
  installments integer not null default 1 check (installments >= 1),
  notes text,
  created_by uuid references public.profiles (id) on delete set null
);

create table public.purchase_lines (
  id bigint generated always as identity primary key,
  purchase_id uuid not null references public.purchases (id) on delete cascade,
  ingredient_id text references public.ingredients (id) on delete set null,
  name text not null,
  qty numeric(14, 3) not null check (qty > 0),
  unit text not null check (unit in ('kg', 'g', 'l', 'ml', 'un')),
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  base_qty numeric(14, 3) not null
);

create index purchase_lines_purchase_idx on public.purchase_lines (purchase_id);

-- -------------------------------------------------------- contas a pagar ---

create table public.payables (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  supplier text,
  origin text not null check (origin in ('compra', 'despesa')),
  category text not null check (category in (
    'insumos', 'aluguel', 'energia', 'agua', 'gas', 'internet',
    'salarios', 'impostos', 'manutencao', 'marketing', 'outros'
  )),
  purchase_id uuid references public.purchases (id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  due_date date not null,
  payment text not null,
  status text not null default 'aberto' check (status in ('aberto', 'pago')),
  paid_at date,
  installment_n integer,
  installment_of integer,
  created_at timestamptz not null default now()
);

create index payables_due_date_idx on public.payables (due_date);

-- ------------------------------------------------------- regras de negócio ---

-- Quanto vale 1 unidade de compra na unidade base do insumo.
create function public.purchase_unit_factor(p_unit text) returns numeric
language sql immutable as $$
  select case p_unit when 'g' then 0.001 when 'ml' then 0.001 else 1 end
$$;

-- Divide um valor em N parcelas, jogando a diferença de centavos na última.
create function public.split_installments(p_total numeric, p_count integer)
returns table (n integer, amount numeric)
language sql immutable as $$
  with base as (
    select greatest(1, p_count) as c,
           floor(p_total * 100 / greatest(1, p_count)) / 100 as v
  )
  select i, case when i = c then round(p_total - v * (c - 1), 2) else v end
  from base, generate_series(1, c) as i
$$;

-- Registra a venda, calcula os totais pelo preço cadastrado, grava o custo dos
-- insumos de cada item e baixa o estoque pela ficha técnica.
--
-- draft = { channel, customer?, table?, discount, payment, cashReceived?,
--           items: [{ productId, qty, notes? }] }
create function public.place_order(draft jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_operator public.profiles;
  v_order uuid;
  v_item jsonb;
  v_product public.products;
  v_qty integer;
  v_cost numeric;
  v_subtotal numeric := 0;
  v_discount numeric;
  v_total numeric;
  v_cash numeric;
begin
  select * into v_operator from public.profiles where id = auth.uid() and active;
  if not found then
    raise exception 'Usuário sem permissão para vender.' using errcode = '42501';
  end if;

  if jsonb_typeof(draft -> 'items') <> 'array' or jsonb_array_length(draft -> 'items') = 0 then
    raise exception 'O pedido não tem itens.';
  end if;

  insert into public.orders (channel, customer, table_label, payment, operator, operator_id)
  values (
    draft ->> 'channel',
    nullif(btrim(draft ->> 'customer'), ''),
    nullif(btrim(draft ->> 'table'), ''),
    draft ->> 'payment',
    v_operator.name,
    v_operator.id
  )
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(draft -> 'items') loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida no pedido.';
    end if;

    select * into v_product from public.products where id = v_item ->> 'productId';
    if not found then
      raise exception 'Produto % não encontrado.', v_item ->> 'productId';
    end if;
    if not v_product.active then
      raise exception 'O produto "%" está inativo.', v_product.name;
    end if;

    select coalesce(sum(i.avg_cost * r.qty), 0) into v_cost
    from public.recipe_items r
    join public.ingredients i on i.id = r.ingredient_id
    where r.product_id = v_product.id;

    insert into public.order_items (order_id, product_id, name, qty, unit_price, unit_cost, notes)
    values (
      v_order, v_product.id, v_product.name, v_qty, v_product.price, round(v_cost, 4),
      nullif(btrim(v_item ->> 'notes'), '')
    );

    -- Baixa do estoque. O UPDATE trava as linhas dos insumos, então vendas
    -- simultâneas do mesmo item entram em fila em vez de se sobrescreverem.
    update public.ingredients i
    set stock = greatest(0, round(i.stock - r.qty * v_qty, 3))
    from public.recipe_items r
    where r.product_id = v_product.id and r.ingredient_id = i.id;

    v_subtotal := v_subtotal + v_product.price * v_qty;
  end loop;

  v_subtotal := round(v_subtotal, 2);
  v_discount := round(greatest(0, least(coalesce((draft ->> 'discount')::numeric, 0), v_subtotal)), 2);
  v_total := v_subtotal - v_discount;
  v_cash := case when draft ->> 'payment' = 'dinheiro'
                 then (draft ->> 'cashReceived')::numeric end;

  update public.orders
  set subtotal = v_subtotal,
      discount = v_discount,
      total = v_total,
      cash_received = v_cash,
      change = case when v_cash is not null then round(greatest(0, v_cash - v_total), 2) end
  where id = v_order;

  return v_order;
end;
$$;

-- Avança o pedido na fila (fila → preparo → pronto → entregue).
create function public.set_order_status(p_order_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    raise exception 'Usuário sem permissão.' using errcode = '42501';
  end if;
  if p_status not in ('fila', 'preparo', 'pronto', 'entregue') then
    raise exception 'Situação inválida: %', p_status;
  end if;

  update public.orders
  set status = p_status,
      delivered_at = case when p_status = 'entregue' then now() else delivered_at end
  where id = p_order_id and status <> 'cancelado';
end;
$$;

-- Cancela o pedido e devolve os insumos ao estoque.
create function public.cancel_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_item public.order_items;
begin
  if not public.is_staff() then
    raise exception 'Usuário sem permissão.' using errcode = '42501';
  end if;

  select status into v_status from public.orders where id = p_order_id for update;
  if not found or v_status = 'cancelado' then
    return;
  end if;

  for v_item in select * from public.order_items where order_id = p_order_id loop
    update public.ingredients i
    set stock = round(i.stock + r.qty * v_item.qty, 3)
    from public.recipe_items r
    where r.product_id = v_item.product_id and r.ingredient_id = i.id;
  end loop;

  update public.orders set status = 'cancelado', canceled_at = now() where id = p_order_id;
end;
$$;

-- Entrada de mercadoria: soma ao estoque, recalcula o custo médio ponderado e
-- gera uma conta a pagar por parcela, com vencimento mês a mês.
--
-- draft = { supplier, invoice?, payment, dueDate, installments, notes?,
--           lines: [{ ingredientId, qty, unit, unitCost }] }
create function public.register_purchase(draft jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_purchase public.purchases;
  v_line jsonb;
  v_ing public.ingredients;
  v_qty numeric;
  v_unit text;
  v_cost numeric;
  v_base numeric;
  v_total numeric := 0;
  v_count integer := greatest(1, coalesce((draft ->> 'installments')::integer, 1));
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores registram compras.' using errcode = '42501';
  end if;
  if jsonb_typeof(draft -> 'lines') <> 'array' or jsonb_array_length(draft -> 'lines') = 0 then
    raise exception 'A compra não tem itens.';
  end if;

  insert into public.purchases (supplier, invoice, payment, due_date, installments, notes, created_by)
  values (
    coalesce(nullif(btrim(draft ->> 'supplier'), ''), 'Fornecedor não informado'),
    nullif(btrim(draft ->> 'invoice'), ''),
    draft ->> 'payment',
    (draft ->> 'dueDate')::date,
    v_count,
    nullif(btrim(draft ->> 'notes'), ''),
    auth.uid()
  )
  returning * into v_purchase;

  for v_line in select * from jsonb_array_elements(draft -> 'lines') loop
    v_qty := (v_line ->> 'qty')::numeric;
    v_unit := v_line ->> 'unit';
    v_cost := coalesce((v_line ->> 'unitCost')::numeric, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantidade inválida na compra.';
    end if;

    select * into v_ing from public.ingredients where id = v_line ->> 'ingredientId' for update;
    if not found then
      raise exception 'Insumo % não encontrado.', v_line ->> 'ingredientId';
    end if;
    if not (
      (v_ing.unit = 'kg' and v_unit in ('kg', 'g')) or
      (v_ing.unit = 'l' and v_unit in ('l', 'ml')) or
      (v_ing.unit = 'un' and v_unit = 'un')
    ) then
      raise exception 'Unidade % não serve para o insumo "%".', v_unit, v_ing.name;
    end if;

    v_base := round(v_qty * public.purchase_unit_factor(v_unit), 3);

    insert into public.purchase_lines (purchase_id, ingredient_id, name, qty, unit, unit_cost, base_qty)
    values (v_purchase.id, v_ing.id, v_ing.name, v_qty, v_unit, v_cost, v_base);

    if v_base > 0 then
      update public.ingredients
      set avg_cost = round((v_ing.stock * v_ing.avg_cost + v_qty * v_cost) / (v_ing.stock + v_base), 4),
          stock = v_ing.stock + v_base
      where id = v_ing.id;
    end if;

    v_total := v_total + v_qty * v_cost;
  end loop;

  v_total := round(v_total, 2);
  update public.purchases set total = v_total where id = v_purchase.id;

  insert into public.payables (
    description, supplier, origin, category, purchase_id, amount, due_date,
    payment, installment_n, installment_of
  )
  select
    case when v_count > 1
      then format('Compra #%s — %s (%s/%s)', v_purchase.number, v_purchase.supplier, s.n, v_count)
      else format('Compra #%s — %s', v_purchase.number, v_purchase.supplier)
    end,
    v_purchase.supplier, 'compra', 'insumos', v_purchase.id, s.amount,
    (v_purchase.due_date + make_interval(months => s.n - 1))::date,
    v_purchase.payment, s.n, v_count
  from public.split_installments(v_total, v_count) s;

  return v_purchase.id;
end;
$$;

-- Despesa avulsa (aluguel, energia…), parcelada mês a mês. Com `paid`, a 1ª
-- parcela já nasce paga na data de vencimento.
--
-- draft = { description, supplier?, category, amount, dueDate, payment,
--           installments, paid }
create function public.add_expense(draft jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := greatest(1, coalesce((draft ->> 'installments')::integer, 1));
  v_due date := (draft ->> 'dueDate')::date;
  v_paid boolean := coalesce((draft ->> 'paid')::boolean, false);
  v_desc text := btrim(draft ->> 'description');
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores lançam despesas.' using errcode = '42501';
  end if;
  if coalesce(v_desc, '') = '' then
    raise exception 'Informe a descrição da despesa.';
  end if;

  insert into public.payables (
    description, supplier, origin, category, amount, due_date, payment, status, paid_at,
    installment_n, installment_of
  )
  select
    case when v_count > 1 then format('%s (%s/%s)', v_desc, s.n, v_count) else v_desc end,
    nullif(btrim(draft ->> 'supplier'), ''),
    'despesa',
    draft ->> 'category',
    s.amount,
    (v_due + make_interval(months => s.n - 1))::date,
    draft ->> 'payment',
    case when v_paid and s.n = 1 then 'pago' else 'aberto' end,
    case when v_paid and s.n = 1 then v_due end,
    case when v_count > 1 then s.n end,
    case when v_count > 1 then v_count end
  from public.split_installments(round((draft ->> 'amount')::numeric, 2), v_count) s;
end;
$$;

-- Cria ou atualiza o produto e troca a ficha técnica inteira de uma vez.
--
-- p = { id, name, description, category, price, kind, image?, active,
--       recipe: [{ ingredientId, qty }] }
create function public.save_product(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores editam produtos.' using errcode = '42501';
  end if;

  insert into public.products (id, name, description, category, price, kind, image, active)
  values (
    p ->> 'id', btrim(p ->> 'name'), coalesce(p ->> 'description', ''), p ->> 'category',
    (p ->> 'price')::numeric, coalesce(p ->> 'kind', 'snack'), nullif(p ->> 'image', ''),
    coalesce((p ->> 'active')::boolean, true)
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    price = excluded.price,
    kind = excluded.kind,
    image = excluded.image,
    active = excluded.active;

  delete from public.recipe_items where product_id = p ->> 'id';

  insert into public.recipe_items (product_id, ingredient_id, qty)
  select p ->> 'id', r ->> 'ingredientId', sum((r ->> 'qty')::numeric)
  from jsonb_array_elements(coalesce(p -> 'recipe', '[]'::jsonb)) r
  where (r ->> 'qty')::numeric > 0
  group by r ->> 'ingredientId';
end;
$$;

-- ------------------------------------------------------- controle de acesso ---

alter table public.profiles enable row level security;
alter table public.ingredients enable row level security;
alter table public.products enable row level security;
alter table public.recipe_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_lines enable row level security;
alter table public.payables enable row level security;

-- Perfis: cada um vê o seu; o administrador vê todos. Criar, editar e
-- excluir usuários passa pela Edge Function `manage-users`.
create policy "perfil próprio ou admin" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- Cardápio e estoque: toda a equipe lê (o PDV precisa da disponibilidade);
-- só o administrador altera.
create policy "equipe lê insumos" on public.ingredients
  for select to authenticated using (public.is_staff());
create policy "admin altera insumos" on public.ingredients
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "equipe lê produtos" on public.products
  for select to authenticated using (public.is_staff());
create policy "admin altera produtos" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "equipe lê fichas técnicas" on public.recipe_items
  for select to authenticated using (public.is_staff());
create policy "admin altera fichas técnicas" on public.recipe_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Pedidos: toda a equipe lê (fila); gravações só pelas funções acima.
create policy "equipe lê pedidos" on public.orders
  for select to authenticated using (public.is_staff());
create policy "equipe lê itens de pedido" on public.order_items
  for select to authenticated using (public.is_staff());

-- Compras e contas a pagar: área exclusiva do administrador.
create policy "admin lê compras" on public.purchases
  for select to authenticated using (public.is_admin());
create policy "admin lê itens de compra" on public.purchase_lines
  for select to authenticated using (public.is_admin());
create policy "admin gerencia contas" on public.payables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Funções de negócio: só para usuários logados (cada uma confere o perfil).
revoke execute on function
  public.place_order(jsonb),
  public.set_order_status(uuid, text),
  public.cancel_order(uuid),
  public.register_purchase(jsonb),
  public.add_expense(jsonb),
  public.save_product(jsonb)
from public, anon;

grant execute on function
  public.place_order(jsonb),
  public.set_order_status(uuid, text),
  public.cancel_order(uuid),
  public.register_purchase(jsonb),
  public.add_expense(jsonb),
  public.save_product(jsonb)
to authenticated;

-- ------------------------------------------------------------ tempo real ---

-- Todos os caixas e a gestão veem pedidos, estoque e contas mudarem na hora.
alter publication supabase_realtime add table
  public.profiles,
  public.ingredients,
  public.products,
  public.recipe_items,
  public.orders,
  public.order_items,
  public.purchases,
  public.purchase_lines,
  public.payables;
