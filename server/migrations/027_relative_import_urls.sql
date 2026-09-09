-- A picture served by this app should not name the machine it was served from.
--
-- Four maps and their catalogue entries pointed at an absolute URL: a scheme,
-- a host, and then `/api/import/<id>` -- a route this application serves
-- itself. The host was whatever machine happened to write the record, so the
-- pictures loaded from that machine and nowhere else, and looked permanently
-- broken from every browser that could not resolve it.
--
-- The path was right the whole time. Only the prefix was wrong, so this drops
-- it: a relative URL resolves against whatever host is serving the page, which
-- is the one that can answer for it.
--
-- Deliberately written as "strip any host from an /api/import/ URL" rather
-- than as a substitution for one known host: the same mistake will have been
-- made by any writer that had an absolute base configured, and naming a host
-- here would put an internal address in the repository.
UPDATE media_assets
SET url = regexp_replace(url, '^https?://[^/]+(/api/import/)', '\1')
WHERE url ~ '^https?://[^/]+/api/import/';

UPDATE locations
SET map_image = regexp_replace(map_image, '^https?://[^/]+(/api/import/)', '\1')
WHERE map_image ~ '^https?://[^/]+/api/import/';
