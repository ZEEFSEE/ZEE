create policy service_role_all_child_agents on zhi_family.child_agents for all to service_role using (true) with check (true);
create policy service_role_all_child_runtime_state on zhi_family.child_runtime_state for all to service_role using (true) with check (true);
create policy service_role_all_child_personality_state on zhi_family.child_personality_state for all to service_role using (true) with check (true);
create policy service_role_all_child_emotion_state on zhi_family.child_emotion_state for all to service_role using (true) with check (true);
create policy service_role_all_child_memory_entries on zhi_family.child_memory_entries for all to service_role using (true) with check (true);
create policy service_role_all_child_learning_events on zhi_family.child_learning_events for all to service_role using (true) with check (true);
create policy service_role_all_destination_grants on zhi_family.destination_grants for all to service_role using (true) with check (true);
create policy service_role_all_maternal_sessions on zhi_family.maternal_sessions for all to service_role using (true) with check (true);
create policy service_role_all_maternal_messages on zhi_family.maternal_messages for all to service_role using (true) with check (true);
create policy service_role_all_maternal_responses on zhi_family.maternal_responses for all to service_role using (true) with check (true);
create policy service_role_all_runtime_audit on zhi_family.runtime_audit for all to service_role using (true) with check (true);

select cron.schedule(
  'zhi-family-maternal-ttl-cleanup',
  '* * * * *',
  $job$delete from zhi_family.maternal_sessions
       where expires_at <= now() or status in ('CLOSED','EXPIRED');$job$
);
