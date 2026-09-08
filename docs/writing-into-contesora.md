# Writing into Contesora from outside

For an agent with API access — a custom GPT, a script, another model — that is
asked to build out a universe. It answers one question: **what shape does this
piece of writing take when it lands?**

## The rule

Contesora stores **records**, not documents. A paragraph describing six ocean
regions is not six places; it is a paragraph. The site is built out of rows —
every lens, count, filter, grouping, search result and generated portrait reads
rows — so prose that describes the world without becoming rows is invisible in
every one of them, no matter how good it is.

This is not a formatting preference. A universe with 4,000 words of excellent
foundational canon and no records shows a reader six zeroes.

## Where each kind of writing goes

Sort a passage by asking what it is *about*, not what it says.

| It is… | It becomes | Endpoint |
| --- | --- | --- |
| A place, region or zone | a location | `POST /api/locations` |
| Something that happened, or an era | a timeline event | `POST /api/timeline-events` |
| A person | a character | `POST /api/characters` |
| A group, order, guild or house | a faction | `POST /api/factions` |
| A creature or species | a bestiary entry | `POST /api/bestiary` |
| A device, craft or technique | a technology | `POST /api/technologies` |
| How the world should FEEL, or what nobody may write | direction, not canon | `PATCH /api/editorial/universes/:id/direction` |
| A one-paragraph answer to "what is this universe?" | the universe's own description | `PATCH /api/stories/:id` |

Every create takes `projectId`. Nothing else is required except a name or title,
so a thin record is always better than none: `{projectId, name}` is a valid
place, and it will show up, and it can be filled in later.

There is deliberately **no endpoint for a lore document**. `stories.content`
exists, still accepts text, and is rendered nowhere in the current site — it is
the legacy long-form field. Writing there looks like it worked and is not.

## Regions nest

Locations carry `parentId` and `level`, so a world organized by distance,
depth, altitude or authority should say so rather than flattening:

```json
{ "projectId": "…", "name": "The Frontier", "level": 2, "regionType": "sea",
  "description": "Where predictable safety begins to break down." }
```

`level` is how far out, down or in — whatever the setting's organizing axis is.
Use it consistently within a universe and the geography lens orders by it, so
the places read outward from the center rather than alphabetically.

## Direction is not canon

"The world should feel cozy at home and dangerous at the frontier" is not a fact
about the world. It is an instruction to whoever writes next, and it belongs in
the universe's direction, where every agent reads it before drafting:

- **Standing direction** — the through-line the universe is always working
  toward. Rarely changes.
- **Current focus** — what matters right now. Changes often.
- **Guardrails** — prohibitions, one per line. Agents are held to these.

Written as a record instead, a principle becomes a place or a creature that does
not exist, and the actual instruction reaches nobody.

## Say what is not settled, in the record

The one thing a good foundational document does that a database schema does not
is mark its own confidence: *provisional*, *not yet established*, *deliberately
unresolved*. There is no field for that, and if the hedges are dropped on the
way in, every careful "may be" becomes a flat assertion and the mystery quietly
becomes settled fact.

So keep them in the prose of the record itself, plainly:

> The exact causes, chronology and nature of this withdrawal are NOT established
> canon. "The Retreat" is a provisional modern name for the period.

And put the prohibition where it will be enforced — a guardrail saying *do not
resolve the central mystery* is read by every agent that drafts, while the same
sentence buried in a description is read by whoever happens to open that record.

## Worked example

The foundational canon written for *In Tents and Porpoises* was one 4,266-
character document. Sorted, it was:

- **Six locations** — the Hub, Safe Waters, the Home Islands, the Frontier, the
  Deep Ocean, the Outer Ocean, nested by distance from the center.
- **Two timeline events** — the outward age, and The Retreat that ended it.
- **One bestiary entry** — porpoises, whose escalation with distance is the
  setting's central observable fact, with the unresolved reading kept in the
  text.
- **A standing direction** — the cozy-to-mysterious tonal gradient, and the
  principle that a veteran's home island is a record of their adventures.
- **Five guardrails** — do not resolve the mystery, do not make the porpoises
  evil, do not settle the withdrawal, do not turn rumor into canon, do not
  explain through exposition.
- **A one-paragraph description** — what this universe is, for the overview.

Nothing was invented in that sort and nothing was thrown away. The document had
all of it; it just had it in one field.
