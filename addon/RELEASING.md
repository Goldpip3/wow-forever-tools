# Releasing the addon

Three ways to hand this to people, in the order they are worth doing.

## 1. A GitHub release, which already works

Tag it and push the tag:

```bash
git tag -a 1.0.1 -m "1.0.1"
git push origin 1.0.1
```

`.github/workflows/release.yml` builds the zip and attaches it to a GitHub
release. No secrets, no account, no moderation queue, and it is live the moment
the job finishes.

Use an **annotated** tag. The version comes from the tag, and a lightweight one
gives the packager nothing to read.

This is the right channel during the Forever beta. See the caveat at the bottom
for why CurseForge is not, yet.

## 2. CurseForge

Bigger audience, and the addon managers people already run. It costs a project
submission and a wait.

**Once, to create the project**

1. Go to <https://authors.curseforge.com/#/projects/create/choose-game> and pick
   World of Warcraft.
2. Fill in the name, summary, description, license, class and category, and
   upload a logo.
3. Upload a first file. A project does not enter the review queue until it has
   one.
4. Wait. CurseForge moderates every new project and every file after it, and
   their own guidance says anywhere from a few minutes to three working days
   depending on the queue.
5. When it is approved, take the numeric project id out of the URL and put it in
   the table of contents:

   ```
   ## X-Curse-Project-ID: 000000
   ```

**Every release after that**

1. Get an API token from the authors dashboard, under Account, API Tokens.
2. Add it to the repository as a secret named `CF_API_KEY`, under Settings,
   Secrets and variables, Actions.
3. Push a tag. The workflow uploads it.

The packager reads the project id from the table of contents, so nothing else
needs configuring.

**Doing it by hand instead**, if you would rather not use the workflow:

```bash
curl -sS -H "X-Api-Token: $CF_API_TOKEN" \
  -F "metadata=<metadata.json" \
  -F "file=@WoWForeverSync-1.0.1.zip" \
  "https://wow.curseforge.com/api/projects/<projectId>/upload-file"
```

`metadata.json` wants `changelog`, `changelogType` (`text`, `html` or
`markdown`), `displayName`, `gameVersions` and `releaseType` (`alpha`, `beta` or
`release`). `gameVersions` takes numeric ids, not version strings; fetch the
current list rather than writing them down:

```bash
curl -sS -H "X-Api-Token: $CF_API_TOKEN" \
  https://wow.curseforge.com/api/game/wow/versions
```

A 200 means it worked. A 302 means the token was wrong, not that it succeeded.

## 3. Wago Addons and WoWInterface

Both are still running, both are free, and the same workflow publishes to them.
Create the project on their site, then add the token as a repository secret and
uncomment the matching line in the workflow:

| Where | Secret | Also add to the table of contents |
|---|---|---|
| Wago Addons | `WAGO_API_TOKEN` | `## X-Wago-ID:` |
| WoWInterface | `WOWI_API_TOKEN` | `## X-WoWI-ID:` |

Wago is worth the ten minutes. WoWInterface is quieter than it was, but it costs
nothing to tick.

## The packaging, and the one thing that always goes wrong

The zip has to contain the addon **folder**, not the files loose:

```
WoWForeverSync.zip
└── WoWForeverSync/
    ├── WoWForeverSync.toc
    └── ...
```

The table of contents has to be named after the folder it sits in. CurseForge's
own documentation says a mismatch *may* fail validation **or** the game may
simply not see the addon, which is the worse of the two because it looks like it
worked. Do not rely on the upload to catch it.

`.pkgmeta` at the repository root handles this. The addon lives in a
subdirectory of a website repository, and the packager expects a table of
contents at the top of the checkout, so `package-as` names the output folder and
`move-folders` lifts the addon into it.

The site's own download is built separately by `npm run addon`, which produces
the same folder layout. That one is for people who would rather not use an addon
manager.

## Interface numbers

`## Interface:` says which client the addon is built for. The number is
`major * 10000 + minor * 100 + patch`, so Classic Era 1.15.9 is `11509`. Listing
more than one is normal and is how an addon covers several clients.

Get the real number from the client itself:

```
/run print(select(4, GetBuildInfo()))
```

An out-of-date number does not stop the addon working, but the game marks it as
out of date and hides it unless the player ticks the box.

## Why not CurseForge yet

CurseForge has no game version for World of Warcraft: Forever. Its flavour list
today is Retail, Classic, Classic TBC, Wrath, Cataclysm, Mists and Titan
Reforged. Wago's is the same shape.

Uploading against a version that does not exist is not rejected, which is the
trap. The packager warns and quietly falls back to the nearest version it does
know, so a Forever release would be published labelled as Classic Era.

Note that the `titan` flavour in the packager is **not** Forever. Titan Reforged
is a separate Wrath-derived client at interface 380xx. It is an easy thing to
reach for and it would be wrong.

So: ship against Classic Era, hand people GitHub releases during the beta, and
add the Forever flavour when CurseForge adds one. The precedent is good, since
that is what happened when Titan Reforged shipped.

Nothing about Forever's addon API is documented yet. Anyone quoting a Forever
interface number today is guessing. The beta client is the first real answer.
