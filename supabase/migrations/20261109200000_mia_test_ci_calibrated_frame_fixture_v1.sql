-- Synthetic coordinate frame used only by the MIA perception ingress CI harness.
-- This is not a physical calibration or real-world measurement.
insert into mia_test.scene_frames
  (frame_id,scene_id,frame_kind,unit_name,calibration_status,transform_to_parent,transform_evidence,test_only)
values
  ('ci-fixture-calibrated-frame','mia-forest-corner','world_global','synthetic_fixture_unit','calibrated',
   '[[1,0,0],[0,1,0],[0,0,1]]'::jsonb,
   '{"evidence_ref":"fixture-only:synthetic-coordinate-frame","validation_status":"verified","evidence_kind":"synthetic_ci_fixture","physical_measurement":false}'::jsonb,
   true)
on conflict (frame_id) do nothing;
