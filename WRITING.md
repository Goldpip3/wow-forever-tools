# How to write anything on this site

Every word a visitor reads — headlines, button labels, hints, error messages, tooltips,
empty states — follows this. It exists because the first version of the landing page read
like a brochure written by a machine, and that is a thing readers notice and distrust
even when they cannot name what is wrong.

The five rules are from
[kylehughes/writing-prose-like-a-human-for-agents](https://github.com/kylehughes/writing-prose-like-a-human-for-agents).
Related lists worth reading: [stop-slop](https://github.com/hardikpandya/stop-slop) and
[avoid-ai-writing](https://github.com/conorbronsdon/avoid-ai-writing).

---

## The five rules, in order

### 1. Cut significance inflation

Do not tell the reader something matters. Say the thing, and let it matter on its own.

Words that are almost always inflation here: *powerful, seamless, effortless, unlock,
unleash, elevate, empower, transform, revolutionise, the ultimate, game-changing, truly,
simply, just.*

> ✗ Unlock the full power of your raid composition.
> ✓ Works out which buffs your group actually covers.

### 2. Use plain verbs

The verb should be the one you would use out loud. "Prove the gear" is a verb doing
emotional work it has not earned; "simulates your character" is what the tool does.

> ✗ Then prove the gear.
> ✓ Simulates your character against what you own.

### 3. End sentences at the fact

The clause after the fact is nearly always decoration. Cut it and read it again.

> ✗ Counts debuff slots on the boss, ensuring nothing is ever lost in the chaos of a pull.
> ✓ Counts debuff slots on the boss so nothing silently falls off.

### 4. Vary rhythm

Three clauses of the same shape in a row is the single loudest tell. So is the punchy
three-word fragment as a payoff beat.

> ✗ Plan the build. Plan the raid. Then prove the gear.
> ✓ Talents, raid buffs and gear for WoW Forever.

If a sentence list is genuinely a list of three things, that is fine — a list is not a
drumbeat. The problem is three *sentences* built to the same metre.

### 5. Earn every adjective

An adjective has to be doing work no noun can do. "A small addon" earns it: the size is
the reassurance. "A powerful analyser" does not.

---

## Rules specific to this site

### Real game text, never a summary

Buff, debuff, talent and spell descriptions are the game's own words. They come from the
talent data, the level-38 spellbook, or `src/raid/classic-text.ts` for the handful the
BlizzCon demo never showed. Do not write a description of what a spell does. If the text
is missing, fix the data.

### Real game terminology, never invented labels

"Party buff", "debuff slot", "Greater Blessing", "Feral Combat". Not "team-wide boost" or
"synergy score". If Forever or Classic has a word for it, that is the word.

### Say what is a guess

Numbers read off demo footage are estimates and are labelled. Never present a scaled
figure as though it were read. The tooltip distinguishes *scaled from the ranks the demo
showed* from *this rank is not known*, and copy elsewhere should keep that distinction
rather than flattening both into "approximate".

### Write to one raid leader

Second person, singular, present tense. "Everyone left here when you publish is told they
are standby." Not "users will be notified".

### Consequences before the button, not after

Anything that messages people, posts publicly or cannot be undone says so before they
click, in the sentence next to the button. "This posts the roster in the event channel
and sends direct messages. It cannot be undone."

### Errors say what to do next

An error that only names the failure wastes the reader's time.

> ✗ Authentication failed.
> ✓ That link has expired. Run /roster on the event in Discord for a fresh one.

### Never hide a bad outcome

If eleven people were not messaged, the number eleven appears, with their names. Failures
are not rounded down into a success sentence.

---

## Words and shapes to avoid

| Avoid | Because |
|---|---|
| "Not just X, but Y" | The most recognisable machine construction there is |
| "Whether you're a X or a Y" | Brochure opening |
| "delve", "tapestry", "realm", "journey", "landscape" | Elevated rates in generated text |
| "seamlessly", "effortlessly", "simply" | Inflation, and usually untrue |
| "robust", "comprehensive", "powerful", "intuitive" | Unearned adjectives |
| Em dash pile-ups | One per paragraph at most |
| Rhetorical questions as headings | "Why does this matter?" answers itself |
| "In today's fast-paced…" | Never |
| Emoji in body copy | The icons are Blizzard's; the prose is plain |
| Title Case On Headings | Sentence case, except real proper nouns like Blessing of Kings |

---

## British spelling

`colour`, `behaviour`, `organise`, `centre`, `licence` (noun). Class, spell and ability
names keep Blizzard's spelling exactly as the game has it, including American forms:
**Armor**, **Devotion Aura**, **Shadow Armor**.

---

## Before you commit a line of copy

1. Read it aloud. If you would not say it, rewrite it.
2. Count the sentences with the same shape in a row. More than two, vary one.
3. Delete every adjective, then put back only the ones the sentence misses.
4. Does it end at the fact, or is there a trailing clause of reassurance?
5. If it names a number, is that number real and is its uncertainty stated?
