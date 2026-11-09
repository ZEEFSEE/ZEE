-- Test project only: allow cryptographically verified camera stills to be
-- accepted as image-plane observations before physical coordinate calibration.
-- Existing simulator/spatial observations still require calibration evidence.

alter table mia_test.perception_ingress_events
  drop constraint if exists accepted_ingress_has_evidence;

alter table mia_test.perception_ingress_events
  add constraint accepted_ingress_has_evidence
  check (
    disposition <> 'accepted'
    or (
      signature_status = 'verified'
      and freshness_status = 'fresh'
      and normalized_observation is not null
      and replay_of_ingress_id is null
      and (
        calibration_evidence_ref is not null
        or (
          frame_id = 'windows-camera-image-plane-v1'
          and raw_payload ->> 'capture_mode' = 'user_initiated_single_frame'
          and raw_payload ->> 'media_type' = 'image/jpeg'
          and raw_payload ->> 'camera_source' = 'windows_builtin_webcam_via_local_gateway'
          and raw_payload ->> 'image_sha256' ~ '^[0-9a-f]{64}$'
          and normalized_observation ->> 'mapped_frame_id' is null
          and normalized_observation ->> 'coordinate_semantics' =
            'image_pixel_center_not_world_coordinates'
        )
      )
    )
  );
