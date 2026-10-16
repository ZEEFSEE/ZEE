do $patch$
declare v_def text; v_old text; v_new text;
begin
  v_def := pg_get_functiondef('public.zhi_autonomous_mind_decide_legacy(uuid)'::regprocedure);
  v_old := 'trait_work numeric:=0;trait_social numeric:=0;trait_adventure numeric:=0;trait_competition numeric:=0;trait_rest numeric:=0;trait_experience numeric:=0;learning_source text;';
  v_new := 'trait_work numeric:=0;trait_social numeric:=0;trait_adventure numeric:=0;trait_competition numeric:=0;trait_rest numeric:=0;trait_experience numeric:=0;learning_source text; v_sexual numeric:=0; v_conflict_pressure numeric:=0;';
  if position(v_old in v_def)=0 then raise exception 'decision variable insertion anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'v_intimacy:=coalesce(ds.intimacy_desire,50); v_material:=coalesce(ds.material_desire,50);';
  v_new := 'v_intimacy:=coalesce(ds.intimacy_desire,50); v_material:=coalesce(ds.material_desire,50); v_sexual:=case when a.gender in (''男'',''女'') and not exists (select 1 from public.zhi_agent_family f where f.child_agent_id=a.id and (f.born_at is null or f.born_at>now()-interval ''20 days'')) then coalesce(ds.sexual_desire,0) else 0 end; select coalesce(max(conflict),0) into v_conflict_pressure from public.zhi_agent_social_relationships where (male_agent_id=p_agent_id or female_agent_id=p_agent_id) and updated_at>now()-interval ''30 days'';';
  if position(v_old in v_def)=0 then raise exception 'desire initialization anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'vs:=v_intimacy*.42+trait_social+coalesce(m.mood,50)*.07+(100-coalesce(m.stress,20))*.05+recent_relationship_count*.8+recent_positive_social*1.5;';
  v_new := 'vs:=v_intimacy*.42+trait_social+coalesce(m.mood,50)*.07+(100-coalesce(m.stress,20))*.05+recent_relationship_count*.8+recent_positive_social*1.5+v_sexual*.10+greatest(0,65-v_intimacy)*.10-v_conflict_pressure*.12;';
  if position(v_old in v_def)=0 then raise exception 'social score anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'vc:=v_power*.45+trait_competition+v_material*.20+coalesce(m.confidence,50)*.08-coalesce(m.stress,20)*.05;';
  v_new := 'vc:=v_power*.45+trait_competition+v_material*.20+coalesce(m.confidence,50)*.08-coalesce(m.stress,20)*.05-v_conflict_pressure*.20;';
  if position(v_old in v_def)=0 then raise exception 'competition score anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'thought:=case when nearest_name is not null then ''我想与某个人建立更深的联系，我决定主动接近。'' else ''我希望获得亲密和陪伴，我决定寻找可以建立关系的人。'' end;';
  v_new := 'thought:=case when v_sexual>=65 and v_intimacy>=50 then ''我想寻找浪漫吸引与亲密陪伴，但会尊重对方的意愿，不把友好当成承诺。'' when nearest_name is not null then ''我想与某个人建立更深的联系，我决定主动接近。'' else ''我希望获得亲密和陪伴，我决定寻找可以建立关系的人。'' end;';
  if position(v_old in v_def)=0 then raise exception 'social thought anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  v_old := 'goal:=''获得体验并缓解心理压力''; thought:=''我想改变当前状态并获得新的体验。'';';
  v_new := 'goal:=case when coalesce(m.stress,20)>=55 then ''给自己留出私人时间，放松情绪并恢复内在平衡'' else ''安排自己的兴趣与私人生活，享受不以竞争和利益为目的的时光'' end; thought:=case when coalesce(m.stress,20)>=55 then ''我需要一些属于自己的时间，放松一下，不必时时竞争。'' else ''我的生活不只有工作和争胜；我也想做些让自己开心、舒服的事。'' end;';
  if position(v_old in v_def)=0 then raise exception 'private life text anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end;
$patch$;

do $patch$
declare v_def text; v_old text; v_new text;
begin
  v_def := pg_get_functiondef('public.zhi_agent_desire_emotion_feedback()'::regprocedure);
  v_old := 'elsif act=''rest'' then d:=''survival''; outcome:=''satisfied''; inten:=50; cause:=''休息恢复生存与身体资源''; end if;';
  v_new := 'elsif act=''rest'' then d:=''survival''; outcome:=''satisfied''; inten:=50; cause:=''休息恢复生存与身体资源''; elsif act=''entertainment_consume'' then d:=''intimacy''; outcome:=''satisfied''; inten:=least(75,50+greatest(0,100-coalesce(r.stress,20))/5); cause:=''自主私人时光带来放松与情绪满足，不以竞争或利益为目的''; end if;';
  if position(v_old in v_def)=0 then raise exception 'private-life feedback anchor not found'; end if;
  v_def := replace(v_def,v_old,v_new);
  execute v_def;
end;
$patch$;