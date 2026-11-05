-- Cover the self-referencing reply_to foreign key for chat-thread lookups.
create index if not exists family_chat_reply_to_idx
  on zhi_family.family_chat_messages (reply_to)
  where reply_to is not null;
