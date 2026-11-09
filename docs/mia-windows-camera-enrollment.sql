-- TEST PROJECT ONLY: zee-prediction (boaiqnkhrytxwdpgkxti)
-- Register one local Windows webcam gateway public key in private mia_test.
-- Replace the three placeholders using the values printed by server.mjs.
-- Do not register this source in production.

begin;

insert into mia_test.perception_source_registry
  (source_id,source_key,source_kind,auth_scheme,verification_key_ref,enabled,
   max_age_seconds,max_clock_skew_seconds,allowed_frame_ids,metadata,test_only)
values
  ('REPLACE_SOURCE_UUID'::uuid,
   'windows-webcam-gateway-REPLACE_SOURCE_UUID',
   'camera','ed25519','windows-webcam-ed25519-v1',true,
   120,30,array['windows-camera-image-plane-v1']::text[],
   jsonb_build_object(
     'test_fixture',false,
     'physical_sensor',true,
     'device_type','windows_builtin_webcam',
     'gateway_authorship','local_ed25519_gateway',
     'capture_mode','user_initiated_single_frame',
     'world_truth_claim',false,
     'physical_measurement',false,
     'physical_movement',false
   ),true);

insert into mia_test.perception_source_keys
  (source_id,key_id,algorithm,public_key_b64url,enabled,valid_from)
values
  ('REPLACE_SOURCE_UUID'::uuid,
   'windows-webcam-ed25519-v1',
   'ed25519',
   'REPLACE_PUBLIC_KEY_BASE64URL',
   true,now());

commit;

-- Verify registration without exposing private key material:
select source_id,source_kind,auth_scheme,enabled,allowed_frame_ids,metadata
from mia_test.perception_source_registry
where source_id='REPLACE_SOURCE_UUID'::uuid;

select source_id,key_id,algorithm,enabled,valid_from,valid_until,revoked_at
from mia_test.perception_source_keys
where source_id='REPLACE_SOURCE_UUID'::uuid;
