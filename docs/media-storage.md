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

Neither is done yet. Both are on the operator, because both change machines
rather than this repository.

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

### 2. Mount it on the app host

Mount the share somewhere stable, with an `fstab` entry so it survives a reboot,
and a credentials file rather than a password on the mount line. The uid it
mounts as must be able to write, or accepting a preview fails with a permission
error rather than silently doing nothing.

Then, in the deploy host's `.env`:

```
CONTESORA_MEDIA_HOST_DIR=/the/mount/point
```

and bring the stack up with the overlay that binds it in:

```bash
docker compose -f docker-compose.yml -f docker-compose.media.yml up -d
```

The overlay is separate from `docker-compose.yml` because a bind mount to a path
that is not mounted yet starts the container with an empty directory that looks
exactly like working storage. Adding it deliberately is the point.

## Checking it worked

Accept a preview and look at what `POST /api/media` answered:

- `stored: true` and a `/media-files/…` URL means the bytes were copied.
- `stored: false` means no storage is configured and the asset still points at
  the machine that drew it.
- `502` means the copy was attempted and failed. Nothing is catalogued in that
  case, and the previews stay on screen to choose from again.
