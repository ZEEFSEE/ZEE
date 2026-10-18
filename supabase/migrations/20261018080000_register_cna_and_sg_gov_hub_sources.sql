-- Register additional public sources for ZHI External World Data Hub.
-- Keep new sources disabled until the server-side adapter and live ingestion are verified.
insert into zhi_external_hub.sources
  (source_key, name, category, endpoint_url, enabled, status)
values
  (
    'cna_rss_news',
    'CNA RSS News',
    'news',
    'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',
    false,
    'disabled'
  ),
  (
    'sg_gov_air_temperature',
    'Singapore Government Air Temperature API',
    'public',
    'https://api-open.data.gov.sg/v2/real-time/api/air-temperature',
    false,
    'disabled'
  )
on conflict (source_key) do update
set name = excluded.name,
    category = excluded.category,
    endpoint_url = excluded.endpoint_url,
    enabled = false,
    status = 'disabled',
    updated_at = now();
