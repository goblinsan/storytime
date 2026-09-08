# Asking for canon

A character record shows what the canon does not say — a "Not recorded" line
naming every empty field. You can write any of them yourself by clicking the
name. Or you can ask.

## What the button does

**Ask Claude to draft these** files a request, and the server answers it: it
starts a Claude Code session with the character's canon attached and writes
what comes back to the draft. A minute or so later the record shows *Drafted,
not yet canon* with Accept and Reject beside it.

Nothing in the record changes until you accept. The worst case of a bad answer
is something to reject.

It needs Claude Code signed in — run `claude` once in a terminal and sign in.
If it is not, the request simply stays open and the server log says why.

## Trying it, with nothing to set up

Open a terminal in this repo and run:

```
node scripts/canon-requests.mjs <universeId> --watch
```

The universe id is in the address bar: `/editorial/universes/<universeId>/...`

Leave it running. Now click **Ask Claude to draft these** on any character. Within
a few seconds the terminal prints who was asked about, which fields are empty,
and the two commands for what to do next:

```
3:50:08 PM  Theodore Vane needs: motivation, tendencies
  draft-519a6c7e
  read it:   node scripts/canon-requests.mjs <universeId> --brief
  answer it: node scripts/canon-requests.mjs <universeId> --answer answer.json
```

`--brief` prints each request with enough of the universe attached to answer it
without inventing around it: their role, their active years, where they are, who
they are tied to, and what their history already says. That is the thing to hand
to an agent, or to paste into a conversation.

## Answering

An answer is a JSON file:

```json
[
  {
    "requestId": "draft-519a6c7e",
    "proposed": {
      "motivation": "To be believed.",
      "tendencies": "Writes things down. Keeps two copies."
    }
  }
]
```

```
node scripts/canon-requests.mjs <universeId> --answer answer.json
```

**Answering does not change the character.** It fills in the draft. The record
then shows it as *Drafted, not yet canon*, with Accept and Reject beside it, and
the same thing appears in **Proposed changes** on the universe overview so you
can work through a batch. Canon is admitted by you, never by the answer.

A field nobody asked for is refused, because that is how a draft quietly
rewrites something you had already written.

## What the answer is allowed to do

Narrow on purpose:

- **It writes a draft, never a character.** Everything it produces lands as
  *Drafted, not yet canon* and is admitted by you or not at all. The worst case
  of a bad answer is something to reject.
- **It may only fill the fields that were asked for.** An answer carrying an
  extra key is refused rather than trimmed, because that is the shape of a
  draft quietly rewriting something you had already written.
- It answers one request at a time, skips any that already have an answer, and
  leaves a request open if it could not answer it.

### Turning it off, or pointing it elsewhere

```
CONTESORA_CANON_AGENT=off                     file requests, answer none
CONTESORA_CANON_AGENT_COMMAND="my-agent"      run something else
```

The command is given the prompt on stdin and must print a JSON object, so
another model, another harness or a test stub plugs in without the app knowing
anything about it.

`scripts/canon-agent.mjs <universeId>` does the same work from outside the
server, for answering a backlog by hand or running the agent somewhere else. It
takes the same `--command=`.

## Watching versus pushing

`--watch` is polling, and for sitting beside the app while you work that is the
right shape: no configuration, no port, no restart, and nothing missed because
the listener was not up yet. It reads the same rows the app does, so anything
filed while it was stopped is simply there on the next pass.

`canon-agent.mjs --serve` receives the webhook instead of polling, if you would
rather the app push. When you want a request to leave this machine altogether —
into a task queue, a chat, somebody else's runner — set:

```
CONTESORA_CANON_REQUEST_WEBHOOK=http://wherever/hook
```

Every filed request is POSTed there as
`{"event":"draft.created","draft":{...}}`. It is fire-and-forget: if the
receiver is down or slow the request is still filed, because losing your work to
another system's outage would be worse than a missed notification. It needs the
server restarted to be picked up, since it is read from the environment.

Whatever receives it answers the same way you would — `PATCH
/api/generated-drafts/:id` with a `payload.proposed` — so an agent's draft and a
person's arrive on the same row and are reviewed the same way. Nothing in the
app knows which one wrote it.

## Pictures

**Illustrate**, beside the character's name, asks the universe's default image
source for portraits in the active work's style. It takes about half a minute
and the control says *Drawing…* while it does.

What comes back is previews, not a picture. **Keep this one** files that image
as a reference for the character; **Ask for a revision** takes a note and draws
again; **Reject all** throws the batch away. The style comes from the work, so
a note is about the subject — "faceless angular helm, no visible face" — rather
than about the look.

The prompt leads with the work's style, then the character's **Appearance**,
then the note. Appearance is its own field for exactly this reason: a history is
a story about somebody and only some of it is on the outside of them, and while
appearance was buried in the background paragraph the model kept drawing the
siege rather than the face. When a character has no appearance written, the
background is used as a fallback and the picture shows it. The negative prompt
is the work's. Nothing about the character changes until a preview is kept.

### Where the files are

**Previews** live on the ComfyUI that drew them, in its output folder. That
folder gets cleared, and its filenames count from one and start again when it
is, so a preview's URL is a position rather than a name — fine for something
nobody has chosen, and worthless the moment somebody has.

**Keeping one copies it.** The bytes are fetched and written to
`CONTESORA_MEDIA_DIR`, and the record points at `/media-files/<hash>.png`, which
Contesora serves read-only from that same directory. The name is the content's
own hash, so keeping the same picture twice is one file and a URL is always the
same bytes.

That directory is expected to be **a mount of the large network volume**, never
local disk: no project image should ever land on the machine hosting the app. It
deliberately has no default — a write path that falls back somewhere convenient
would put images inside a checkout, and it would do it silently. With nothing
configured, keeping still works and the asset simply keeps the URL it came with
and says so, because a missing volume must not throw away a picture somebody
just chose.

If a copy fails — the render machine unreachable, the volume not mounted —
nothing is cataloged and the previews stay on screen to choose from again.

### Sources

`POST /api/image-sources` registers one. A ComfyUI needs an `endpoint`; a hosted
API needs `credentialEnv` — **the name of an environment variable**, never the
key itself. `POST /api/image-sources/:id/check` asks the source whether it is
really there, and for a ComfyUI answers with the checkpoints it actually has.

Only ComfyUI is wired up. OpenAI and Gemini sources can be registered and
checked, and asking one to draw says plainly that it is not implemented rather
than failing obscurely.
