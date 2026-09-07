# Where kept pictures live

Generated portraits arrive as previews on the ComfyUI that drew them. Accepting
one copies the bytes onto the storage volume; nothing project-related is ever
written to the disk of the machine hosting the app. This is what that takes.

## What the app does

`CONTESORA_MEDIA_DIR` is the directory kept media is written to and read back
from. The app serves it read-only at `/media-files/`, and files are named after
their own content hash, so a URL is always the same bytes and keeping the same
picture twice is one file.

It has **no default**, on purpose. A write path that falls back somewhere
convenient would put project images inside a checkout on the app host, and it
would do it without saying so. With nothing configured, accepting a preview
still works: the asset keeps the URL it came with, and the response says the
copy did not happen.

## The two host steps

Both are done for the storage node and this workstation. The deploy host still
needs its own mount: a share is not a mount, and the container needs the volume
where the compose overlay expects it.

### 1. Share the directory from the storage node

The volume is already shared, but only in part: the existing writable share
points at one project's directory on it, not at the volume, so a sibling
directory on the same disk is not reachable through it. A `contesora/media`
directory exists on the volume, owned by the operator's account and the `users`
group, and it needs a share of its own.

This follows the existing stanza exactly, changing only the name, the comment
and the path:

```ini
[contesora-media]
   comment = Contesora reference and kept generated art
   path = <the volume>/contesora
   browseable = yes
   read only = no
   guest ok = no
   valid users = <same as the existing share>
   force group = users
   create mask = 0664
   directory mask = 0775
```

(Paths and accounts are in `.inventory`, not here: this file is the shape of the
change, not a record of the network.)

Then `sudo smbcontrol all reload-config` (or restart `smbd`).

The share is the parent directory rather than `media/` itself, so reference art
imported by hand and art kept from the app can sit side by side under one mount
without a second share.

Verified 2026-09-07: 1.59 MB copied from a ComfyUI onto the volume, landing as
`jimmothy:users` under the share's `0664` mask, and served back through the app
as the same PNG.

### 2. Mount it on the app host

Mount the share somewhere stable, with an `fstab` entry so it survives a reboot,
and a credentials file rather than a password on the mount line. The uid it
mounts as must be able to write, or accepting a preview fails with a permission
error rather than silently doing nothing.

The volume is bound into the container by `docker-compose.yml` itself, at
`/srv/contesora-media`, and `CONTESORA_MEDIA_DIR` is set there too. It is not an
overlay file: the managed-app deploy runner takes exactly one compose file, so
an overlay would never be applied.

That is only safe because of the marker. `nofail` means a storage node that was
down at boot leaves the mount point present, empty and writable -- the app
host's own disk wearing the volume's name -- and a bind mount cannot tell the
difference. So the volume carries a `.contesora-volume` file, and the server
refuses to write to a directory that does not have one. An outage becomes
`stored: false` and a picture that stays where it was made, instead of project
images quietly accumulating on the machine that hosts the app.

`CONTESORA_MEDIA_HOST_DIR` overrides the host side for a host that mounts it
somewhere else.

## Pictures catalogued before this existed

`scripts/adopt-media.mjs <projectId>` finds assets still pointing at a render
machine and says what it would move; `--apply` moves them. The bytes are copied
before the row is rewritten, so a failure leaves the old URL in place: still
fragile, but still a picture. Anything already on `/media-files` or
`/reference` is left alone.

## Checking it worked

Accept a preview and look at what `POST /api/media` answered:

- `stored: true` and a `/media-files/…` URL means the bytes were copied.
- `stored: false` means no storage is configured and the asset still points at
  the machine that drew it.
- `502` means the copy was attempted and failed. Nothing is catalogued in that
  case, and the previews stay on screen to choose from again.
