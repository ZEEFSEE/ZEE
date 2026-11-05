-- Enforce a non-null child target for direct threads and prevent cross-child writes.
alter table zhi_family.family_chat_messages
  drop constraint if exists family_chat_mode_agent_check;
alter table zhi_family.family_chat_messages
  add constraint family_chat_mode_agent_check check (
    (mode = 'GROUP' and thread_key = 'group' and agent_id is null)
    or
    (mode = 'DIRECT' and agent_id is not null and agent_id in (
      'ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA',
      'ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH'
    ) and thread_key = 'direct:' || agent_id)
  );
alter table zhi_family.family_chat_messages
  drop constraint if exists family_chat_sender_agent_check;
alter table zhi_family.family_chat_messages
  add constraint family_chat_sender_agent_check check (
    (sender_type = 'USER' and sender_id = 'mia-admin')
    or
    (sender_type = 'CHILD' and sender_id in (
      'ZHI-G1-D01-LUNA','ZHI-G1-D02-ARIA','ZHI-G1-D03-ELYA',
      'ZHI-G1-S01-KAEL','ZHI-G1-S02-NOAH'
    ) and (mode = 'GROUP' or sender_id = agent_id))
  );
