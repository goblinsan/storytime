# Asking for canon

A character record shows what the canon does not say — a "Not recorded" line
naming every empty field. You can write any of them yourself by clicking the
name. Or you can ask.

## What the button does

**Ask Claude to draft these** files a request. That is all it does, and the
record says so in those words: it is a note in a queue, not a job. Nothing is
running. It waits until somebody — an agent, or you — picks it up.

That is deliberate. A spinner would promise work that nothing is doing.

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

## Watching versus pushing

`--watch` is polling, and for sitting beside the app while you work that is the
right shape: no configuration, no port, no restart, and nothing missed because
the listener was not up yet. It reads the same rows the app does, so anything
filed while it was stopped is simply there on the next pass.

When you want a request to *leave* this machine — into a task queue, a chat, an
agent runner — set:

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
