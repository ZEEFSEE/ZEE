alter table zhi_family.maternal_messages
  add column if not exists reply_depth integer not null default 0
  check (reply_depth between 0 and 2);

alter table zhi_family.maternal_responses
  add column if not exists reply_depth integer not null default 1
  check (reply_depth between 1 and 2);
