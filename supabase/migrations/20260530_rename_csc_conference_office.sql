insert into public.settings (setting_name, setting_value)
values ('room_name', 'CSC Conference Office')
on conflict (setting_name) do update
set setting_value = excluded.setting_value,
    updated_at = now();

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef('public.enforce_core_student_booking_rules()'::regprocedure)
  into v_definition;
  execute replace(
    v_definition,
    'CSC Conference Room Rules and Agreement',
    'CSC Conference Office Terms of Use and Code of Conduct'
  );

  select pg_get_functiondef('public.log_reservation_activity()'::regprocedure)
  into v_definition;
  execute replace(v_definition, 'CSC Conference Room', 'CSC Conference Office');

  select pg_get_functiondef('public.log_reservation_agreement_activity()'::regprocedure)
  into v_definition;
  execute replace(
    v_definition,
    'CSC Conference Room Rules and Agreement',
    'CSC Conference Office Terms of Use and Code of Conduct'
  );
end;
$$;
