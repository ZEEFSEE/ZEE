alter table mia_test.scene_frames
  add constraint scene_frames_calibration_evidence_required
  check (
    calibration_status <> 'calibrated'
    or (
      transform_to_parent is not null
      and transform_evidence ? 'evidence_ref'
      and nullif(transform_evidence->>'evidence_ref','') is not null
      and transform_evidence->>'validation_status' = 'verified'
    )
  );

alter table mia_test.scene_anchors
  add constraint scene_anchors_verified_evidence_required
  check (
    verification_status <> 'verified'
    or (
      provenance ? 'evidence_ref'
      and nullif(provenance->>'evidence_ref','') is not null
      and provenance->>'validation_status' = 'verified'
    )
  );

alter table mia_test.scene_anchors
  add constraint scene_anchors_coordinate_shape_valid
  check (
    coordinates is null
    or (
      jsonb_typeof(coordinates) = 'object'
      and coordinates ? 'x'
      and coordinates ? 'y'
      and jsonb_typeof(coordinates->'x') = 'number'
      and jsonb_typeof(coordinates->'y') = 'number'
    )
  );

comment on constraint scene_frames_calibration_evidence_required on mia_test.scene_frames is
  'A frame cannot be marked calibrated without a non-empty evidence_ref and validation_status=verified.';
comment on constraint scene_anchors_verified_evidence_required on mia_test.scene_anchors is
  'An anchor cannot be marked verified without a non-empty evidence_ref and validation_status=verified.';
